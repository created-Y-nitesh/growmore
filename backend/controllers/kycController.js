const pool = require('../db');
const storageService = require('../services/storageService');
const imageProcessor = require('../utils/imageProcessor');
const logger = require('../utils/logger');

const ALLOWED_DOC_TYPES = ['aadhaar', 'pan', 'selfie', 'address_proof'];

/**
 * KYC & Identity Verification Controller
 * Enforces strictly private storage, signed URL access, and an auditable approval workflow.
 */

// 1. Upload KYC Document
exports.uploadKycDocument = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const file = req.file;
    const documentType = (req.body.documentType || req.body.document_type || '').toLowerCase().trim();
    const documentNumber = (req.body.documentNumber || req.body.document_number || '').trim();

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE',
        message: 'No document file provided for upload.'
      });
    }

    if (!ALLOWED_DOC_TYPES.includes(documentType)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DOCUMENT_TYPE',
        message: `Invalid document type '${documentType}'. Allowed types: ${ALLOWED_DOC_TYPES.join(', ')}`
      });
    }

    // Process KYC document (integrity check and quality preservation)
    const processed = imageProcessor.processKycDocument(file.buffer, file.mimeType);

    // 1. Duplicate Upload Protection (Check if identical file already uploaded for this user)
    const duplicateRes = await client.query(`
      SELECT id, document_type, status, created_at 
      FROM public.kyc_documents 
      WHERE user_id = $1 AND file_hash = $2 AND status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED')
      LIMIT 1;
    `, [userId, file.hash]);

    if (duplicateRes.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'DUPLICATE_UPLOAD',
        message: `This exact document file has already been submitted for ${duplicateRes.rows[0].document_type} (Status: ${duplicateRes.rows[0].status}).`
      });
    }

    // 2. Active Submission Conflict Check (User cannot have duplicate pending submissions for same doc type)
    const activeDocRes = await client.query(`
      SELECT id, status 
      FROM public.kyc_documents 
      WHERE user_id = $1 AND document_type = $2 AND status IN ('PENDING', 'UNDER_REVIEW')
      LIMIT 1;
    `, [userId, documentType]);

    if (activeDocRes.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'ACTIVE_SUBMISSION_EXISTS',
        message: `You already have a '${documentType}' submission currently ${activeDocRes.rows[0].status}. Please wait for review before submitting again.`
      });
    }

    // 3. Upload to strictly private 'kyc-documents' bucket
    const ext = file.mimeType === 'application/pdf'
      ? 'pdf'
      : (file.mimeType === 'image/png' ? 'png' : (file.mimeType === 'image/webp' ? 'webp' : 'jpg'));

    const kycFilePath = `user_${userId}/${documentType}_${file.hash.slice(0, 16)}_${Date.now()}.${ext}`;

    await storageService.uploadFile(
      storageService.buckets.KYC_DOCUMENTS,
      kycFilePath,
      processed.processedBuffer,
      file.mimeType
    );

    await client.query('BEGIN');

    // 4. Insert into kyc_documents
    const insertQuery = `
      INSERT INTO public.kyc_documents 
        (user_id, document_type, document_number, file_path, file_name, file_size, mime_type, file_hash, status, metadata)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', $9)
      RETURNING *;
    `;

    const meta = {
      originalName: file.originalname,
      dimensions: processed.dimensions,
      uploadedAt: new Date().toISOString()
    };

    const docRes = await client.query(insertQuery, [
      userId,
      documentType,
      documentNumber || null,
      kycFilePath,
      file.originalname,
      processed.fileSize,
      file.mimeType,
      file.hash,
      JSON.stringify(meta)
    ]);

    const newDoc = docRes.rows[0];

    // 5. Update overall KYC status on users and profiles if not already approved
    await client.query(`
      UPDATE public.users 
      SET kyc_status = CASE WHEN kyc_status = 'APPROVED' THEN 'APPROVED' ELSE 'PENDING' END,
          updated_at = NOW()
      WHERE id = $1;
    `, [userId]);

    if (req.user.supabase_uid) {
      await client.query(`
        UPDATE public.profiles
        SET kyc_status = CASE WHEN kyc_status = 'APPROVED' THEN 'APPROVED' ELSE 'PENDING' END,
            updated_at = NOW()
        WHERE id = $1;
      `, [req.user.supabase_uid]);
    }

    await client.query('COMMIT');

    // 6. Generate signed URL for confirmation preview (15 minutes)
    const signed = await storageService.getSignedUrl(storageService.buckets.KYC_DOCUMENTS, kycFilePath, 900);

    // 7. Audit Log
    await storageService.logStorageAudit({
      userId,
      actorId: userId,
      actorRole: req.user.role || 'user',
      action: 'KYC_DOCUMENT_UPLOADED',
      bucket: storageService.buckets.KYC_DOCUMENTS,
      filePath: kycFilePath,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { documentType, documentId: newDoc.id, fileSize: processed.fileSize }
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: `KYC ${documentType.toUpperCase()} document uploaded successfully.`,
      document: {
        id: newDoc.id,
        documentType: newDoc.document_type,
        status: newDoc.status,
        signedUrl: signed.signedUrl,
        expiresAt: signed.expiresAt,
        createdAt: newDoc.created_at
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 2. List User's KYC Documents
exports.listKycDocuments = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(`
      SELECT id, document_type, document_number, file_name, file_size, mime_type, status, rejection_reason, reviewed_at, created_at, updated_at
      FROM public.kyc_documents
      WHERE user_id = $1
      ORDER BY id DESC;
    `, [userId]);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      documents: result.rows
    });
  } catch (err) {
    next(err);
  }
};

// 3. View KYC Document by ID (with signed download URL)
exports.getKycDocumentById = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'user';
    const docId = parseInt(req.params.id, 10);

    if (isNaN(docId) || docId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid document ID.' });
    }

    const result = await pool.query(`
      SELECT kd.*, u.email as user_email, u.full_name as user_name
      FROM public.kyc_documents kd
      JOIN public.users u ON u.id = kd.user_id
      WHERE kd.id = $1;
    `, [docId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'KYC document not found.' });
    }

    const doc = result.rows[0];

    // Ownership & Authorization verification
    if (Number(doc.user_id) !== Number(userId) && role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'You do not have authorization to view this document.'
      });
    }

    // Generate signed download URL (valid 15 minutes)
    const signed = await storageService.getSignedUrl(storageService.buckets.KYC_DOCUMENTS, doc.file_path, 900);

    // Audit view event
    storageService.logStorageAudit({
      userId: doc.user_id,
      actorId: userId,
      actorRole: role,
      action: 'KYC_DOCUMENT_VIEWED',
      bucket: storageService.buckets.KYC_DOCUMENTS,
      filePath: doc.file_path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { documentId: doc.id }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      document: {
        id: doc.id,
        userId: doc.user_id,
        userName: doc.user_name,
        userEmail: doc.user_email,
        documentType: doc.document_type,
        documentNumber: doc.document_number,
        fileName: doc.file_name,
        fileSize: doc.file_size,
        mimeType: doc.mime_type,
        status: doc.status,
        rejectionReason: doc.rejection_reason,
        reviewedAt: doc.reviewed_at,
        signedUrl: signed.signedUrl,
        expiresAt: signed.expiresAt,
        createdAt: doc.created_at
      }
    });
  } catch (err) {
    next(err);
  }
};

// 4. Regenerate Signed URL
exports.regenerateSignedUrl = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const role = req.user.role || 'user';
    const docId = parseInt(req.params.id, 10);
    const requestedExpires = parseInt(req.query.expiresIn || req.body.expiresIn, 10) || 900;

    const result = await pool.query('SELECT user_id, file_path, document_type FROM public.kyc_documents WHERE id = $1', [docId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    const doc = result.rows[0];

    // Ownership Check
    if (Number(doc.user_id) !== Number(userId) && role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'ACCESS_DENIED',
        message: 'Unauthorized access to document.'
      });
    }

    const signed = await storageService.getSignedUrl(
      storageService.buckets.KYC_DOCUMENTS,
      doc.file_path,
      requestedExpires
    );

    // Audit signed URL regeneration
    storageService.logStorageAudit({
      userId: doc.user_id,
      actorId: userId,
      actorRole: role,
      action: 'SIGNED_URL_REGENERATED',
      bucket: storageService.buckets.KYC_DOCUMENTS,
      filePath: doc.file_path,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { documentId: docId, requestedExpires }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      signedUrl: signed.signedUrl,
      expiresAt: signed.expiresAt,
      expiresInSeconds: signed.expiresInSeconds
    });
  } catch (err) {
    next(err);
  }
};

// -----------------------------------------------------------------------------
// ADMIN KYC WORKFLOW ENDPOINTS
// -----------------------------------------------------------------------------

// 5. Admin List All KYC Documents with Filters
exports.adminListKycDocuments = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status ? req.query.status.toUpperCase() : null;
    const type = req.query.documentType ? req.query.documentType.toLowerCase() : null;

    let query = `
      SELECT kd.*, u.email as user_email, u.full_name as user_name, u.phone as user_phone
      FROM public.kyc_documents kd
      JOIN public.users u ON u.id = kd.user_id
    `;
    const params = [];

    const whereClauses = [];
    if (status) {
      params.push(status);
      whereClauses.push(`kd.status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      whereClauses.push(`kd.document_type = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` ORDER BY kd.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) 
      FROM public.kyc_documents kd
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''};
    `;
    const countRes = await pool.query(countQuery, params.slice(0, whereClauses.length));
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      documents: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

// 6. Admin Mark Document UNDER_REVIEW
exports.adminReviewKycDocument = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const docId = parseInt(req.params.id, 10);
    const adminId = req.user.id;

    await client.query('BEGIN');

    const selectRes = await client.query('SELECT * FROM public.kyc_documents WHERE id = $1 FOR UPDATE;', [docId]);
    if (selectRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'KYC document not found.' });
    }

    const doc = selectRes.rows[0];
    if (doc.status !== 'PENDING') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        message: `Cannot transition KYC document from ${doc.status} to UNDER_REVIEW.`
      });
    }

    await client.query(`
      UPDATE public.kyc_documents
      SET status = 'UNDER_REVIEW',
          reviewed_by = $1,
          updated_at = NOW()
      WHERE id = $2;
    `, [adminId, docId]);

    // Update user status
    await client.query(`UPDATE public.users SET kyc_status = 'UNDER_REVIEW', updated_at = NOW() WHERE id = $1;`, [doc.user_id]);

    await client.query('COMMIT');

    // Audit Log
    storageService.logStorageAudit({
      userId: doc.user_id,
      actorId: adminId,
      actorRole: 'admin',
      action: 'KYC_STATUS_UNDER_REVIEW',
      bucket: storageService.buckets.KYC_DOCUMENTS,
      filePath: doc.file_path,
      ip: req.ip,
      metadata: { documentId: docId }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'KYC document status updated to UNDER_REVIEW.',
      documentId: docId,
      status: 'UNDER_REVIEW'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 7. Admin Approve KYC Document
exports.adminApproveKyc = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const docId = parseInt(req.params.id, 10);
    const adminId = req.user.id;
    const { notes } = req.body;

    await client.query('BEGIN');

    const selectRes = await client.query('SELECT * FROM public.kyc_documents WHERE id = $1 FOR UPDATE;', [docId]);
    if (selectRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'KYC document not found.' });
    }

    const doc = selectRes.rows[0];
    if (doc.status === 'APPROVED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Document is already approved.' });
    }

    // 1. Mark document APPROVED
    await client.query(`
      UPDATE public.kyc_documents
      SET status = 'APPROVED',
          rejection_reason = NULL,
          reviewed_by = $1,
          reviewed_at = NOW(),
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{adminNotes}', $2::jsonb),
          updated_at = NOW()
      WHERE id = $3;
    `, [adminId, JSON.stringify(notes || 'Approved by compliance officer'), docId]);

    // 2. Check if user has both primary identification docs approved (e.g. aadhaar & pan or selfie)
    const approvedDocsRes = await client.query(`
      SELECT document_type FROM public.kyc_documents 
      WHERE user_id = $1 AND status = 'APPROVED';
    `, [doc.user_id]);

    const approvedTypes = approvedDocsRes.rows.map(r => r.document_type);
    const isOverallKycComplete = approvedTypes.includes('pan') || (approvedTypes.includes('aadhaar') && approvedTypes.includes('selfie'));

    if (isOverallKycComplete) {
      await client.query(`
        UPDATE public.users
        SET kyc_status = 'APPROVED',
            is_phone_verified = TRUE,
            updated_at = NOW()
        WHERE id = $1;
      `, [doc.user_id]);

      await client.query(`
        UPDATE public.profiles
        SET kyc_status = 'APPROVED',
            is_verified = TRUE,
            updated_at = NOW()
        WHERE id::text = (SELECT COALESCE(supabase_uid::text, id::text) FROM public.users WHERE id = $1);
      `, [doc.user_id]);
    }

    await client.query('COMMIT');

    // 3. Audit Log
    await storageService.logStorageAudit({
      userId: doc.user_id,
      actorId: adminId,
      actorRole: 'admin',
      action: 'KYC_DOCUMENT_APPROVED',
      bucket: storageService.buckets.KYC_DOCUMENTS,
      filePath: doc.file_path,
      ip: req.ip,
      metadata: { documentId: docId, documentType: doc.document_type, overallKycComplete: isOverallKycComplete }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `KYC document #${docId} (${doc.document_type}) approved successfully.`,
      documentId: docId,
      status: 'APPROVED',
      overallKycComplete: isOverallKycComplete
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// 8. Admin Reject KYC Document
exports.adminRejectKyc = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const docId = parseInt(req.params.id, 10);
    const adminId = req.user.id;
    const body = req.body || {};
    const reason = (body.reason || body.rejectionReason || '').trim();

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'REJECTION_REASON_REQUIRED',
        message: 'A detailed rejection reason is required for auditable KYC rejection.'
      });
    }

    await client.query('BEGIN');

    const selectRes = await client.query('SELECT * FROM public.kyc_documents WHERE id = $1 FOR UPDATE;', [docId]);
    if (selectRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'KYC document not found.' });
    }

    const doc = selectRes.rows[0];

    // 1. Mark document REJECTED with mandatory reason
    await client.query(`
      UPDATE public.kyc_documents
      SET status = 'REJECTED',
          rejection_reason = $1,
          reviewed_by = $2,
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = $3;
    `, [reason, adminId, docId]);

    // 2. Set user overall kyc_status to REJECTED
    await client.query(`
      UPDATE public.users 
      SET kyc_status = 'REJECTED', updated_at = NOW()
      WHERE id = $1;
    `, [doc.user_id]);

    await client.query(`
      UPDATE public.profiles 
      SET kyc_status = 'REJECTED', updated_at = NOW()
      WHERE id::text = (SELECT COALESCE(supabase_uid::text, id::text) FROM public.users WHERE id = $1);
    `, [doc.user_id]);

    await client.query('COMMIT');

    // 3. Audit Log
    await storageService.logStorageAudit({
      userId: doc.user_id,
      actorId: adminId,
      actorRole: 'admin',
      action: 'KYC_DOCUMENT_REJECTED',
      bucket: storageService.buckets.KYC_DOCUMENTS,
      filePath: doc.file_path,
      ip: req.ip,
      metadata: { documentId: docId, documentType: doc.document_type, reason }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `KYC document #${docId} rejected.`,
      documentId: docId,
      status: 'REJECTED',
      rejectionReason: reason
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};
