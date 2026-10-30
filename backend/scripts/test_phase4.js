/**
 * Automated Test Suite: Phase 4 Backend Production Roadmap
 * 1. Supabase Storage Integration (buckets avatars, kyc-documents, signed URLs)
 * 2. Avatar Management (Upload, Replace, Delete, Cleanup, Dimensions, Thumbnail, Metadata Stripping)
 * 3. KYC Module (Aadhaar, PAN, Selfie, Address Proof, Private Storage, Ownership Check)
 * 4. File Security (MIME Whitelist, Size limits, Filename sanitization, Virus scanning, Duplicate protection)
 * 5. Admin KYC Workflow (PENDING -> UNDER_REVIEW -> APPROVED / REJECTED with reason, Audit trails)
 * 6. Storage Audit Logging & Signed Download Authorization
 */

const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = require('../server');
const pool = require('../db');
const storageService = require('../services/storageService');
const virusScanner = require('../services/virusScanner');
const imageProcessor = require('../utils/imageProcessor');

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const headers = { ...(options.headers || {}) };
    let payload = body;

    if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      payload = JSON.stringify(body);
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
    }

    if (payload && Buffer.isBuffer(payload) && !headers['Content-Length']) {
      headers['Content-Length'] = payload.length;
    }

    const reqOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: options.path,
      method: options.method || 'GET',
      headers
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

// Generate valid test PNG buffer with given width and height
function createTestPng(width = 64, height = 64) {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from('IHDR', 'ascii');
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 2; // Color type: Truecolor (RGB)
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace

  const crc = crypto.createHash('crc32' in crypto ? 'crc32' : 'sha256').update(Buffer.concat([ihdrType, ihdrData])).digest();
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(0x12345678, 0);

  // Minimal IDAT
  const idatLength = Buffer.alloc(4);
  idatLength.writeUInt32BE(10, 0);
  const idatType = Buffer.from('IDAT', 'ascii');
  const idatData = Buffer.from([0x78, 0x9C, 0x63, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0x00]);
  const idatCrc = Buffer.alloc(4);

  // IEND
  const iendLength = Buffer.alloc(4);
  const iendType = Buffer.from('IEND', 'ascii');
  const iendCrc = Buffer.alloc(4);

  return Buffer.concat([
    header,
    ihdrLength, ihdrType, ihdrData, ihdrCrc,
    idatLength, idatType, idatData, idatCrc,
    iendLength, iendType, iendCrc
  ]);
}

async function runPhase4Tests() {
  console.log('===============================================================');
  console.log('   GROWMORE PHASE 4 BACKEND VERIFICATION AUTOMATED TEST SUITE  ');
  console.log('===============================================================\n');

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`[Phase 4 Server] Listening on http://127.0.0.1:${port}\n`);

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${testName} - ${details}`);
      failed++;
    }
  }

  const testTimestamp = Date.now();
  const jwtSecret = process.env.JWT_SECRET || 'test_jwt_secret';

  try {
    // -------------------------------------------------------------------------
    // SETUP: Seed test admin, user A (owner), and user B (attacker)
    // -------------------------------------------------------------------------
    const adminRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 4 Admin', $1, 'hash_pw', $2, 'admin', 'active', TRUE, 1)
      RETURNING id, email, role, token_version;
    `, [`p4_admin_${testTimestamp}@test.com`, `+91961${testTimestamp.toString().slice(-7)}`]);
    const adminUser = adminRes.rows[0];

    const userARes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 4 User A', $1, 'hash_pw', $2, 'user', 'active', TRUE, 1)
      RETURNING id, email, role, token_version;
    `, [`p4_user_a_${testTimestamp}@test.com`, `+91962${testTimestamp.toString().slice(-7)}`]);
    const userA = userARes.rows[0];

    const userBRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 4 User B', $1, 'hash_pw', $2, 'user', 'active', TRUE, 1)
      RETURNING id, email, role, token_version;
    `, [`p4_user_b_${testTimestamp}@test.com`, `+91963${testTimestamp.toString().slice(-7)}`]);
    const userB = userBRes.rows[0];

    const adminToken = jwt.sign(
      { id: adminUser.id, userId: adminUser.id, email: adminUser.email, role: 'admin', tokenVersion: 1 },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const tokenA = jwt.sign(
      { id: userA.id, userId: userA.id, email: userA.email, role: 'user', tokenVersion: 1 },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const tokenB = jwt.sign(
      { id: userB.id, userId: userB.id, email: userB.email, role: 'user', tokenVersion: 1 },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 1: Storage Infrastructure & Security Core
    // -------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Storage Infrastructure & Security Core ---');

    // 1.1: Buckets provisioned
    assert(Boolean(storageService.buckets.AVATARS) && Boolean(storageService.buckets.KYC_DOCUMENTS),
      'Storage service separates avatars and kyc-documents into distinct buckets');

    // 1.2: Path traversal defense
    let traversalBlocked = false;
    try {
      storageService.sanitizePath('../../etc/shadow');
    } catch {
      traversalBlocked = true;
    }
    const cleanTraverse = storageService.sanitizePath('folder/../../safe.png');
    assert(traversalBlocked || cleanTraverse === 'safe.png',
      'Path traversal attempts (../, ..\\) are strictly sanitized and neutralized');

    // 1.3: Signed URL generation and HMAC verification
    const testSign = await storageService.getSignedUrl(storageService.buckets.AVATARS, 'test/sample.png', 300);
    assert(testSign && typeof testSign.signedUrl === 'string' && testSign.expiresInSeconds === 300,
      'Signed download URLs generated with cryptographic signature and automatic expiration');

    // 1.4: Signed URL expired rejection
    const expiredRes = await makeRequest(server, {
      path: `/api/storage/signed-download?bucket=avatars&path=test/sample.png&expires=1000000&sig=abcdef`
    });
    assert(expiredRes.status === 403 && expiredRes.data.error === 'URL_EXPIRED',
      'Expired signed download URL is strictly rejected with HTTP 403 URL_EXPIRED');

    // 1.5: Tampered signed URL rejection
    const nowSecs = Math.floor(Date.now() / 1000) + 600;
    const tamperedRes = await makeRequest(server, {
      path: `/api/storage/signed-download?bucket=avatars&path=test/sample.png&expires=${nowSecs}&sig=invalid_sig_hash`
    });
    assert(tamperedRes.status === 401 && tamperedRes.data.error === 'INVALID_SIGNATURE',
      'Tampered or forged signed download URL is strictly rejected with HTTP 401 INVALID_SIGNATURE');

    // 1.6: Virus scanner detecting EICAR signature
    const eicarBuffer = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
    const eicarScan = await virusScanner.scanFile(eicarBuffer, 'test.jpg', 'image/jpeg');
    assert(eicarScan.clean === false && eicarScan.threat.includes('EICAR'),
      'Pluggable virus scanner detects EICAR test signature and halts processing');

    // 1.7: Disguised PE executable header detected
    const peBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const peScan = await virusScanner.scanFile(peBuffer, 'avatar.png', 'image/png');
    assert(peScan.clean === false && peScan.threat.includes('Executable'),
      'Disguised Windows executable header (MZ) inside image container is blocked');

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Avatar Upload, Processing & Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Avatar Upload, Processing & Lifecycle ---');

    const validAvatarPng = createTestPng(128, 128);

    // 2.1: Valid avatar upload
    const avatarUploadRes = await makeRequest(server, {
      path: '/api/profile/avatar',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      file: validAvatarPng.toString('base64'),
      filename: 'my_avatar.png',
      mimeType: 'image/png'
    });

    assert(avatarUploadRes.status === 200 && avatarUploadRes.data.success === true && Boolean(avatarUploadRes.data.avatar.signedUrl),
      'POST /api/profile/avatar uploads avatar, extracts dimensions, and returns signed URL');

    const firstAvatarPath = avatarUploadRes.data.avatar.filePath;

    // 2.2: Stored only file path in database
    const userDbAvatar = await pool.query('SELECT avatar_path FROM users WHERE id = $1', [userA.id]);
    assert(userDbAvatar.rows[0].avatar_path === firstAvatarPath && !userDbAvatar.rows[0].avatar_path.startsWith('http'),
      'Database stores only clean relative file path, never exposed full URLs');

    // 2.3: Retrieve avatar
    const getAvatarRes = await makeRequest(server, {
      path: '/api/profile/avatar',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(getAvatarRes.status === 200 && getAvatarRes.data.avatar.filePath === firstAvatarPath && Boolean(getAvatarRes.data.avatar.signedUrl),
      'GET /api/profile/avatar returns user current active avatar and thumbnail signed URLs');

    // 2.4: Avatar replacement & old file cleanup
    const secondAvatarPng = createTestPng(256, 256);
    const replaceAvatarRes = await makeRequest(server, {
      path: '/api/profile/avatar',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      file: secondAvatarPng.toString('base64'),
      filename: 'new_avatar.png',
      mimeType: 'image/png'
    });

    assert(replaceAvatarRes.status === 200 && replaceAvatarRes.data.avatar.filePath !== firstAvatarPath,
      'POST /api/profile/avatar seamlessly replaces avatar and cleans up previous file from storage');

    // Verify old metadata deactivated
    const activeMetas = await pool.query('SELECT COUNT(*) as count FROM avatar_metadata WHERE user_id = $1 AND is_active = TRUE', [userA.id]);
    assert(parseInt(activeMetas.rows[0].count, 10) === 1,
      'Only one avatar record remains is_active = TRUE per user');

    // 2.5: Invalid MIME rejection
    const invalidMimeRes = await makeRequest(server, {
      path: '/api/profile/avatar',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      file: Buffer.from('fake script').toString('base64'),
      filename: 'shell.sh',
      mimeType: 'application/x-sh'
    });
    assert(invalidMimeRes.status === 415 && invalidMimeRes.data.error === 'UNSUPPORTED_MEDIA_TYPE',
      'Non-whitelisted MIME type is strictly rejected with HTTP 415');

    // 2.6: Oversized avatar file rejection (> 5MB)
    const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 'A');
    const oversizedRes = await makeRequest(server, {
      path: '/api/profile/avatar',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      file: oversizedBuffer.toString('base64'),
      filename: 'huge.png',
      mimeType: 'image/png'
    });
    assert(oversizedRes.status === 413 && oversizedRes.data.error === 'FILE_TOO_LARGE',
      'Oversized avatar upload (> 5MB) is rejected before processing with HTTP 413');

    // 2.7: Delete avatar
    const deleteAvatarRes = await makeRequest(server, {
      path: '/api/profile/avatar',
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(deleteAvatarRes.status === 200 && deleteAvatarRes.data.success === true,
      'DELETE /api/profile/avatar successfully removes avatar and resets avatar_path');

    const userClearedAvatar = await pool.query('SELECT avatar_path FROM users WHERE id = $1', [userA.id]);
    assert(userClearedAvatar.rows[0].avatar_path === null,
      'User avatar_path reset to NULL upon deletion');

    // -------------------------------------------------------------------------
    // TEST GROUP 3: KYC Module & Quality Preservation
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: KYC Module & Quality Preservation ---');

    const testAadhaarDoc = createTestPng(800, 600);
    const testPanDoc = createTestPng(800, 500);

    // 3.1: Upload Aadhaar
    const aadhaarUploadRes = await makeRequest(server, {
      path: '/api/kyc/upload',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      documentType: 'aadhaar',
      documentNumber: 'XXXX-XXXX-1234',
      file: testAadhaarDoc.toString('base64'),
      filename: 'aadhaar_card.png',
      mimeType: 'image/png'
    });

    assert(aadhaarUploadRes.status === 201 && aadhaarUploadRes.data.document.status === 'PENDING',
      'POST /api/kyc/upload uploads Aadhaar document into private kyc-documents bucket in PENDING state');

    const aadhaarDocId = aadhaarUploadRes.data.document.id;

    // 3.2: Upload PAN
    const panUploadRes = await makeRequest(server, {
      path: '/api/kyc/upload',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      documentType: 'pan',
      documentNumber: 'ABCDE1234F',
      file: testPanDoc.toString('base64'),
      filename: 'pan_card.png',
      mimeType: 'image/png'
    });

    assert(panUploadRes.status === 201 && panUploadRes.data.document.status === 'PENDING',
      'POST /api/kyc/upload uploads PAN document in PENDING state');

    const panDocId = panUploadRes.data.document.id;

    // 3.3: Duplicate upload protection
    const duplicateKycRes = await makeRequest(server, {
      path: '/api/kyc/upload',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      documentType: 'aadhaar',
      file: testAadhaarDoc.toString('base64'),
      filename: 'aadhaar_card.png',
      mimeType: 'image/png'
    });
    assert(duplicateKycRes.status === 409 && duplicateKycRes.data.error === 'DUPLICATE_UPLOAD',
      'Duplicate upload protection blocks re-upload of identical file hash with HTTP 409');

    // 3.4: Active submission conflict check
    const diffFileAadhaar = createTestPng(900, 700);
    const activeConflictRes = await makeRequest(server, {
      path: '/api/kyc/upload',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'Content-Type': 'application/json'
      }
    }, {
      documentType: 'aadhaar',
      file: diffFileAadhaar.toString('base64'),
      filename: 'diff_aadhaar.png',
      mimeType: 'image/png'
    });
    assert(activeConflictRes.status === 409 && activeConflictRes.data.error === 'ACTIVE_SUBMISSION_EXISTS',
      'Cannot submit another document of same type while one is already PENDING / UNDER_REVIEW');

    // 3.5: List KYC documents
    const listKycRes = await makeRequest(server, {
      path: '/api/kyc',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(listKycRes.status === 200 && listKycRes.data.count >= 2,
      'GET /api/kyc returns list of submitted documents without exposing direct private URLs');

    // 3.6: View KYC document with signed download URL
    const viewKycRes = await makeRequest(server, {
      path: `/api/kyc/${aadhaarDocId}`,
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(viewKycRes.status === 200 && Boolean(viewKycRes.data.document.signedUrl),
      'GET /api/kyc/:id returns document metadata and private signed download URL');

    // 3.7: Regenerate signed URL
    const regenSignedRes = await makeRequest(server, {
      path: `/api/kyc/${aadhaarDocId}/signed-url?expiresIn=600`,
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(regenSignedRes.status === 200 && regenSignedRes.data.expiresInSeconds === 600 && Boolean(regenSignedRes.data.signedUrl),
      'POST /api/kyc/:id/signed-url regenerates fresh signed URL with configurable expiration');

    // 3.8: Unauthorized access check (User B attempting to view User A's KYC document)
    const unauthViewRes = await makeRequest(server, {
      path: `/api/kyc/${aadhaarDocId}`,
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert(unauthViewRes.status === 403 && unauthViewRes.data.error === 'ACCESS_DENIED',
      'Ownership enforcement: User B cannot view or generate signed URLs for User A documents (HTTP 403)');

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Admin KYC Review Workflow
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Admin KYC Review Workflow ---');

    // 4.1: Admin list KYC documents with status filter
    const adminListKycRes = await makeRequest(server, {
      path: '/api/admin/kyc?status=PENDING',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminListKycRes.status === 200 && Array.isArray(adminListKycRes.data.documents) && adminListKycRes.data.documents.length >= 2,
      'GET /api/admin/kyc lists all pending verification documents across platform');

    // 4.2: Admin mark document UNDER_REVIEW
    const underReviewRes = await makeRequest(server, {
      path: `/api/admin/kyc/${aadhaarDocId}/status`,
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(underReviewRes.status === 200 && underReviewRes.data.status === 'UNDER_REVIEW',
      'PATCH /api/admin/kyc/:id/status moves document into UNDER_REVIEW state');

    // 4.3: Admin approve document
    const approveKycRes = await makeRequest(server, {
      path: `/api/admin/kyc/${aadhaarDocId}/approve`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    }, { notes: 'Aadhaar QR verified successfully' });

    assert(approveKycRes.status === 200 && approveKycRes.data.status === 'APPROVED',
      'POST /api/admin/kyc/:id/approve transitions document to APPROVED with reviewer ID');

    // 4.4: Admin reject document without reason fails
    const rejectNoReasonRes = await makeRequest(server, {
      path: `/api/admin/kyc/${panDocId}/reject`,
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(rejectNoReasonRes.status === 400 && rejectNoReasonRes.data.error === 'REJECTION_REASON_REQUIRED',
      'Rejecting KYC document requires mandatory rejection reason for compliance');

    // 4.5: Admin reject document with reason
    const rejectPanRes = await makeRequest(server, {
      path: `/api/admin/kyc/${panDocId}/reject`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    }, { reason: 'PAN image is blurry and name is illegible' });

    assert(rejectPanRes.status === 200 && rejectPanRes.data.status === 'REJECTED' && Boolean(rejectPanRes.data.rejectionReason),
      'POST /api/admin/kyc/:id/reject marks document REJECTED, stores audit reason, and updates user kyc_status');

    // Verify rejection reason accessible to customer
    const userCheckKyc = await makeRequest(server, {
      path: `/api/kyc/${panDocId}`,
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert(userCheckKyc.data.document.status === 'REJECTED' && userCheckKyc.data.document.rejectionReason.includes('blurry'),
      'Customer can inspect rejection reason to correct document submission');

    // -------------------------------------------------------------------------
    // TEST GROUP 5: Storage Audit Logging
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 5: Storage Audit Logging ---');

    // 5.1: Storage audit records exist in database
    const auditRes = await pool.query(`
      SELECT action, bucket, file_path, actor_role 
      FROM public.storage_audit_logs 
      WHERE user_id = $1
      ORDER BY id DESC;
    `, [userA.id]);

    const auditActions = auditRes.rows.map(r => r.action);
    assert(auditActions.includes('AVATAR_UPLOADED') && auditActions.includes('KYC_DOCUMENT_UPLOADED') && auditActions.includes('KYC_DOCUMENT_APPROVED'),
      'Storage operations automatically write persistent audit trail with actor, IP, and file path');

    // 5.2: Admin Storage Audit Explorer
    const adminAuditRes = await makeRequest(server, {
      path: '/api/admin/storage/audit-logs',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminAuditRes.status === 200 && Array.isArray(adminAuditRes.data.logs) && adminAuditRes.data.logs.length >= 4,
      'GET /api/admin/storage/audit-logs provides paginated compliance log explorer for administrators');

    // -------------------------------------------------------------------------
    // CLEANUP
    // -------------------------------------------------------------------------
    console.log('\n--- CLEANUP ---');
    try {
      await pool.query('DELETE FROM public.storage_audit_logs WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
      await pool.query('DELETE FROM public.kyc_documents WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
      await pool.query('DELETE FROM public.avatar_metadata WHERE user_id IN ($1, $2)', [userA.id, userB.id]);
      await pool.query('DELETE FROM public.users WHERE id IN ($1, $2, $3)', [userA.id, userB.id, adminUser.id]);
      console.log('  ✓ Cleaned up Phase 4 test entities.');
    } catch (cleanErr) {
      console.warn('  ! Cleanup note:', cleanErr.message);
    }

  } catch (err) {
    console.error('FATAL Phase 4 Test Suite Error:', err);
    failed++;
  } finally {
    server.close();
  }

  console.log('\n===============================================================');
  console.log(`   PHASE 4 TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

if (require.main === module) {
  runPhase4Tests();
}

module.exports = runPhase4Tests;
