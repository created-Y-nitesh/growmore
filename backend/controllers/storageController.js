const path = require('path');
const pool = require('../db');
const storageService = require('../services/storageService');
const logger = require('../utils/logger');

/**
 * Storage Controller
 * Handles cryptographically signed local downloads and storage audit exploration.
 */

// Handle signed URL download requests
exports.handleSignedDownload = async (req, res, next) => {
  try {
    const { bucket, path: rawPath, expires, sig } = req.query;

    if (!bucket || !rawPath || !expires || !sig) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_REQUEST',
        message: 'Missing required signed download parameters.'
      });
    }

    // 1. Verify signature and expiration
    const verifyResult = storageService.verifySignedUrl(bucket, rawPath, expires, sig);

    if (!verifyResult.valid) {
      if (verifyResult.reason === 'URL_EXPIRED') {
        return res.status(403).json({
          success: false,
          error: 'URL_EXPIRED',
          message: 'The requested signed download URL has expired. Please regenerate a new URL.'
        });
      }

      return res.status(401).json({
        success: false,
        error: 'INVALID_SIGNATURE',
        message: 'Cryptographic signature verification failed.'
      });
    }

    // 2. Retrieve file buffer from storage
    const cleanPath = storageService.sanitizePath(rawPath);
    const buffer = await storageService.getFileBuffer(bucket, cleanPath);

    // Determine Content-Type
    const ext = path.extname(cleanPath).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="${path.basename(cleanPath)}"`);

    return res.status(200).send(buffer);
  } catch (err) {
    if (err.message && err.message.includes('not found')) {
      return res.status(404).json({ success: false, message: 'Requested file not found in storage.' });
    }
    next(err);
  }
};

// Admin Storage Audit Explorer
exports.getStorageAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const bucket = req.query.bucket;
    const action = req.query.action ? req.query.action.toUpperCase() : null;

    let query = `
      SELECT sal.*, u.email as user_email
      FROM public.storage_audit_logs sal
      LEFT JOIN public.users u ON u.id = sal.user_id
    `;
    const params = [];
    const whereClauses = [];

    if (bucket) {
      params.push(bucket);
      whereClauses.push(`sal.bucket = $${params.length}`);
    }
    if (action) {
      params.push(action);
      whereClauses.push(`sal.action = $${params.length}`);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` ORDER BY sal.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countQuery = `
      SELECT COUNT(*) FROM public.storage_audit_logs sal
      ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''};
    `;
    const countRes = await pool.query(countQuery, params.slice(0, whereClauses.length));
    const total = parseInt(countRes.rows[0].count, 10);

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      logs: result.rows,
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
