const pool = require('../db');
const storageService = require('../services/storageService');
const imageProcessor = require('../utils/imageProcessor');
const logger = require('../utils/logger');

/**
 * Avatar Management Controller
 * Handles upload, replacement, deletion, thumbnail generation, and metadata tracking.
 */

// Upload or replace customer avatar
exports.uploadAvatar = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE',
        message: 'No avatar image file provided.'
      });
    }

    // 1. Process image: extract dimensions, validate, strip EXIF metadata, and generate thumbnail
    const processed = imageProcessor.processAvatar(file.buffer, file.mimeType);

    // 2. Fetch existing active avatar to clean up old files
    const existingAvatarRes = await client.query(`
      SELECT id, file_path, thumbnail_path 
      FROM public.avatar_metadata 
      WHERE user_id = $1 AND is_active = TRUE
      LIMIT 1;
    `, [userId]);

    const oldAvatar = existingAvatarRes.rows[0] || null;

    // 3. Generate storage paths
    const ext = file.mimeType === 'image/png' ? 'png' : (file.mimeType === 'image/webp' ? 'webp' : 'jpg');
    const avatarFilePath = `user_${userId}/avatar_${file.hash.slice(0, 16)}.${ext}`;
    const thumbnailFilePath = `user_${userId}/thumb_${file.hash.slice(0, 16)}.${ext}`;

    // 4. Upload main image and thumbnail to 'avatars' bucket
    await storageService.uploadFile(
      storageService.buckets.AVATARS,
      avatarFilePath,
      processed.processedBuffer,
      file.mimeType
    );

    await storageService.uploadFile(
      storageService.buckets.AVATARS,
      thumbnailFilePath,
      processed.thumbnailBuffer,
      file.mimeType
    );

    await client.query('BEGIN');

    // 5. Deactivate previous avatar metadata
    await client.query(`
      UPDATE public.avatar_metadata
      SET is_active = FALSE, updated_at = NOW()
      WHERE user_id = $1;
    `, [userId]);

    // 6. Insert new active avatar metadata
    const insertMetaQuery = `
      INSERT INTO public.avatar_metadata 
        (user_id, file_path, thumbnail_path, file_name, file_size, mime_type, dimensions, file_hash, is_active)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
      RETURNING *;
    `;
    const newAvatarRes = await client.query(insertMetaQuery, [
      userId,
      avatarFilePath,
      thumbnailFilePath,
      file.originalname,
      processed.fileSize,
      file.mimeType,
      JSON.stringify(processed.dimensions),
      file.hash
    ]);

    // 7. Update users table and profiles table with relative file_path
    await client.query(`
      UPDATE public.users 
      SET avatar_path = $1, updated_at = NOW()
      WHERE id = $2;
    `, [avatarFilePath, userId]);

    if (req.user.supabase_uid) {
      await client.query(`
        UPDATE public.profiles
        SET avatar_path = $1, avatar_url = $2, updated_at = NOW()
        WHERE id = $3;
      `, [avatarFilePath, avatarFilePath, req.user.supabase_uid]);
    }

    await client.query('COMMIT');

    // 8. Asynchronously remove old avatar files from storage if replacing
    if (oldAvatar && oldAvatar.file_path !== avatarFilePath) {
      storageService.deleteFile(storageService.buckets.AVATARS, oldAvatar.file_path).catch(() => {});
      if (oldAvatar.thumbnail_path) {
        storageService.deleteFile(storageService.buckets.AVATARS, oldAvatar.thumbnail_path).catch(() => {});
      }
    }

    // 9. Generate signed URL for immediate display
    const signed = await storageService.getSignedUrl(storageService.buckets.AVATARS, avatarFilePath, 3600);

    // 10. Audit Log
    await storageService.logStorageAudit({
      userId,
      actorId: userId,
      actorRole: req.user.role || 'user',
      action: oldAvatar ? 'AVATAR_REPLACED' : 'AVATAR_UPLOADED',
      bucket: storageService.buckets.AVATARS,
      filePath: avatarFilePath,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { dimensions: processed.dimensions, fileSize: processed.fileSize }
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully.',
      avatar: {
        filePath: avatarFilePath,
        thumbnailPath: thumbnailFilePath,
        signedUrl: signed.signedUrl,
        expiresAt: signed.expiresAt,
        dimensions: processed.dimensions,
        fileSize: processed.fileSize
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// Retrieve signed URL for current user avatar
exports.getAvatar = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const metaRes = await pool.query(`
      SELECT file_path, thumbnail_path, dimensions, file_size, updated_at
      FROM public.avatar_metadata
      WHERE user_id = $1 AND is_active = TRUE
      LIMIT 1;
    `, [userId]);

    if (metaRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No avatar uploaded for this account.'
      });
    }

    const row = metaRes.rows[0];
    const signed = await storageService.getSignedUrl(storageService.buckets.AVATARS, row.file_path, 3600);
    const thumbSigned = row.thumbnail_path
      ? await storageService.getSignedUrl(storageService.buckets.AVATARS, row.thumbnail_path, 3600)
      : null;

    return res.status(200).json({
      success: true,
      avatar: {
        filePath: row.file_path,
        signedUrl: signed.signedUrl,
        thumbnailUrl: thumbSigned ? thumbSigned.signedUrl : null,
        dimensions: row.dimensions,
        fileSize: row.file_size,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
};

// Delete avatar and clean up files
exports.deleteAvatar = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id;

    const existingRes = await client.query(`
      SELECT id, file_path, thumbnail_path 
      FROM public.avatar_metadata 
      WHERE user_id = $1 AND is_active = TRUE
      LIMIT 1;
    `, [userId]);

    if (existingRes.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No active avatar found to delete.'
      });
    }

    const avatar = existingRes.rows[0];

    await client.query('BEGIN');

    // 1. Deactivate metadata
    await client.query(`
      UPDATE public.avatar_metadata
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1;
    `, [avatar.id]);

    // 2. Clear path in users table
    await client.query(`
      UPDATE public.users 
      SET avatar_path = NULL, updated_at = NOW()
      WHERE id = $1;
    `, [userId]);

    // 3. Clear path in profiles table
    if (req.user.supabase_uid) {
      await client.query(`
        UPDATE public.profiles
        SET avatar_path = NULL, avatar_url = NULL, updated_at = NOW()
        WHERE id = $1;
      `, [req.user.supabase_uid]);
    }

    await client.query('COMMIT');

    // 4. Delete files from storage
    await storageService.deleteFile(storageService.buckets.AVATARS, avatar.file_path);
    if (avatar.thumbnail_path) {
      await storageService.deleteFile(storageService.buckets.AVATARS, avatar.thumbnail_path);
    }

    // 5. Audit Log
    await storageService.logStorageAudit({
      userId,
      actorId: userId,
      actorRole: req.user.role || 'user',
      action: 'AVATAR_DELETED',
      bucket: storageService.buckets.AVATARS,
      filePath: avatar.file_path,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: 'Avatar deleted successfully.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};
