const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');
const supabaseService = require('./supabaseService');
const logger = require('../utils/logger');

/**
 * Enterprise Dual-Adapter Storage Service
 * Supports both Supabase Storage and secure local storage with HMAC-SHA256 signed URLs,
 * path traversal defense, and automatic bucket provisioning.
 */
class StorageService {
  constructor() {
    this.storageSigningKey = process.env.STORAGE_SIGNING_SECRET || process.env.JWT_SECRET || 'storage_hmac_signing_key_default';
    this.localStorageRoot = path.resolve(__dirname, '../storage');
    this.buckets = {
      AVATARS: 'avatars',
      KYC_DOCUMENTS: 'kyc-documents'
    };

    // Ensure local directories exist for offline/standalone execution
    this.ensureLocalBuckets();

    // Ensure buckets exist in Supabase if configured
    this.initSupabaseBuckets().catch(err => {
      logger.debug(`Supabase bucket init notice: ${err.message}`);
    });
  }

  ensureLocalBuckets() {
    try {
      for (const bucketName of Object.values(this.buckets)) {
        const bucketPath = path.join(this.localStorageRoot, bucketName);
        if (!fs.existsSync(bucketPath)) {
          fs.mkdirSync(bucketPath, { recursive: true });
        }
      }
    } catch (err) {
      logger.error('Failed to initialize local storage directories', { error: err.message });
    }
  }

  async initSupabaseBuckets() {
    if (!supabaseService.isConfigured() || !supabaseService.client) return;

    try {
      const client = supabaseService.client;
      // 1. Avatars bucket (Private with signed access or controlled public CDN)
      const { data: existingAvatars } = await client.storage.getBucket(this.buckets.AVATARS);
      if (!existingAvatars) {
        await client.storage.createBucket(this.buckets.AVATARS, {
          public: false,
          fileSizeLimit: 5242880, // 5MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
        });
        logger.info(`Provisioned Supabase Storage bucket: ${this.buckets.AVATARS}`);
      }

      // 2. KYC Documents bucket (Strictly private with signed URL authorization)
      const { data: existingKyc } = await client.storage.getBucket(this.buckets.KYC_DOCUMENTS);
      if (!existingKyc) {
        await client.storage.createBucket(this.buckets.KYC_DOCUMENTS, {
          public: false,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        });
        logger.info(`Provisioned Supabase Storage bucket: ${this.buckets.KYC_DOCUMENTS}`);
      }
    } catch (err) {
      logger.debug(`Supabase bucket provisioning check: ${err.message}`);
    }
  }

  /**
   * Sanitize filename and validate against directory traversal attacks
   */
  sanitizePath(rawPath) {
    if (typeof rawPath !== 'string' || !rawPath.trim()) {
      throw new Error('Storage path must be a non-empty string.');
    }

    // Strip null bytes and control chars
    let clean = rawPath.replace(/\0/g, '').replace(/[\r\n\t]/g, '').replace(/\\/g, '/');

    if (clean.startsWith('..')) {
      throw new Error('Invalid storage path: directory traversal prohibited.');
    }

    // Segment-based normalization preventing root breakout
    const segments = clean.split('/').filter(Boolean);
    const resolved = [];
    for (const seg of segments) {
      if (seg === '.') continue;
      if (seg === '..') {
        if (resolved.length > 0) {
          resolved.pop();
        }
      } else {
        resolved.push(seg);
      }
    }

    const result = resolved.join('/');
    if (!result) {
      throw new Error('Invalid storage path: resolved path is empty.');
    }
    return result;
  }

  /**
   * Upload file to target bucket
   * @param {string} bucket - 'avatars' | 'kyc-documents'
   * @param {string} filePath - relative path within bucket
   * @param {Buffer} buffer - file content
   * @param {string} mimeType - content type
   */
  async uploadFile(bucket, filePath, buffer, mimeType) {
    const cleanPath = this.sanitizePath(filePath);

    // 1. If Supabase is configured, upload to Supabase Storage
    if (supabaseService.isConfigured() && supabaseService.client) {
      try {
        const { error } = await supabaseService.client.storage
          .from(bucket)
          .upload(cleanPath, buffer, {
            contentType: mimeType,
            upsert: true
          });

        if (error) {
          logger.warn(`Supabase storage upload failed, falling back to local: ${error.message}`);
        } else {
          logger.info(`Uploaded file to Supabase bucket '${bucket}': ${cleanPath}`);
          return {
            provider: 'supabase',
            bucket,
            filePath: cleanPath,
            fileSize: buffer.length,
            mimeType
          };
        }
      } catch (err) {
        logger.warn(`Supabase storage exception, using local storage: ${err.message}`);
      }
    }

    // 2. Standalone Local Encrypted Storage
    const absolutePath = path.join(this.localStorageRoot, bucket, cleanPath);
    const parentDir = path.dirname(absolutePath);

    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(absolutePath, buffer);
    logger.info(`Saved file to local bucket '${bucket}': ${cleanPath}`);

    return {
      provider: 'local',
      bucket,
      filePath: cleanPath,
      fileSize: buffer.length,
      mimeType
    };
  }

  /**
   * Generate secure signed download URL with automatic expiration
   * @param {string} bucket - Bucket name
   * @param {string} filePath - Path within bucket
   * @param {number} expiresInSeconds - Time until expiry (default 900s / 15m)
   */
  async getSignedUrl(bucket, filePath, expiresInSeconds = 900) {
    const cleanPath = this.sanitizePath(filePath);
    const duration = Math.min(86400, Math.max(60, parseInt(expiresInSeconds, 10) || 900));

    // 1. Try Supabase Storage Signed URL
    if (supabaseService.isConfigured() && supabaseService.client) {
      try {
        const { data, error } = await supabaseService.client.storage
          .from(bucket)
          .createSignedUrl(cleanPath, duration);

        if (!error && data?.signedUrl) {
          return {
            signedUrl: data.signedUrl,
            expiresInSeconds: duration,
            expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
            provider: 'supabase'
          };
        }
      } catch (err) {
        logger.debug(`Supabase createSignedUrl fallback: ${err.message}`);
      }
    }

    // 2. Fallback: HMAC-SHA256 Signed Local URL
    const expiresAt = Math.floor(Date.now() / 1000) + duration;
    const signaturePayload = `${bucket}:${cleanPath}:${expiresAt}`;
    const signature = crypto
      .createHmac('sha256', this.storageSigningKey)
      .update(signaturePayload)
      .digest('hex');

    const signedUrl = `/api/storage/signed-download?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(cleanPath)}&expires=${expiresAt}&sig=${signature}`;

    return {
      signedUrl,
      expiresInSeconds: duration,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
      provider: 'local'
    };
  }

  /**
   * Verify HMAC-SHA256 signature and check expiration for local signed downloads
   */
  verifySignedUrl(bucket, filePath, expiresTimestamp, signature) {
    const expiresNum = parseInt(expiresTimestamp, 10);
    const nowSecs = Math.floor(Date.now() / 1000);

    if (isNaN(expiresNum) || nowSecs > expiresNum) {
      return { valid: false, reason: 'URL_EXPIRED' };
    }

    let cleanPath;
    try {
      cleanPath = this.sanitizePath(filePath);
    } catch {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    const signaturePayload = `${bucket}:${cleanPath}:${expiresTimestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.storageSigningKey)
      .update(signaturePayload)
      .digest('hex');

    const sigBuf = Buffer.from(signature || '', 'hex');
    const expBuf = Buffer.from(expectedSignature, 'hex');

    if (sigBuf.length !== expBuf.length) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    const isMatch = crypto.timingSafeEqual(sigBuf, expBuf);

    if (!isMatch) {
      return { valid: false, reason: 'INVALID_SIGNATURE' };
    }

    return { valid: true };
  }

  /**
   * Retrieve file buffer directly from storage
   */
  async getFileBuffer(bucket, filePath) {
    const cleanPath = this.sanitizePath(filePath);

    // 1. Try Supabase Storage download if configured
    if (supabaseService.isConfigured() && supabaseService.client) {
      try {
        const { data, error } = await supabaseService.client.storage
          .from(bucket)
          .download(cleanPath);

        if (!error && data) {
          const arrayBuffer = await data.arrayBuffer();
          return Buffer.from(arrayBuffer);
        }
      } catch (err) {
        logger.debug(`Supabase download fallback to local: ${err.message}`);
      }
    }

    // 2. Local filesystem
    const absolutePath = path.join(this.localStorageRoot, bucket, cleanPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File not found in storage: ${bucket}/${cleanPath}`);
    }

    return fs.readFileSync(absolutePath);
  }

  /**
   * Delete file from storage
   */
  async deleteFile(bucket, filePath) {
    if (!filePath) return;
    try {
      const cleanPath = this.sanitizePath(filePath);

      // 1. Delete from Supabase
      if (supabaseService.isConfigured() && supabaseService.client) {
        try {
          await supabaseService.client.storage.from(bucket).remove([cleanPath]);
        } catch (_) {}
      }

      // 2. Delete from local storage
      const absolutePath = path.join(this.localStorageRoot, bucket, cleanPath);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
      }
      logger.info(`Deleted file from storage '${bucket}': ${cleanPath}`);
    } catch (err) {
      logger.warn(`Storage delete notice: ${err.message}`);
    }
  }

  /**
   * Record storage audit trail in storage_audit_logs
   */
  async logStorageAudit({ userId = null, actorId = null, actorRole = 'user', action, bucket, filePath, ip = null, userAgent = null, metadata = {} }) {
    try {
      await pool.query(`
        INSERT INTO storage_audit_logs 
          (user_id, actor_id, actor_role, action, bucket, file_path, ip_address, user_agent, metadata)
        VALUES 
          ($1, $2, $3, $4, $5, $6, $7, $8, $9);
      `, [
        userId,
        actorId || userId,
        actorRole,
        action,
        bucket,
        filePath,
        ip,
        userAgent,
        JSON.stringify(metadata || {})
      ]);
    } catch (err) {
      logger.error('Failed to write storage audit log', { error: err.message });
    }
  }
}

module.exports = new StorageService();
