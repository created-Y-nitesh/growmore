const crypto = require('crypto');
const virusScanner = require('../services/virusScanner');
const logger = require('../utils/logger');

/**
 * Pure Node.js RFC 7578 Multipart Parser & Upload Security Middleware
 * Parses multipart/form-data, Base64 JSON, and raw binary uploads with zero external dependencies.
 */

// Parse multipart/form-data buffer using boundary
function parseMultipartBuffer(rawBuffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const result = { fields: {}, files: [] };

  let start = 0;
  while ((start = rawBuffer.indexOf(boundaryBuffer, start)) !== -1) {
    start += boundaryBuffer.length;

    // Check if end of multipart stream (--boundary--)
    if (rawBuffer.slice(start, start + 2).toString('ascii') === '--') {
      break;
    }

    // Skip \r\n
    if (rawBuffer.slice(start, start + 2).toString('ascii') === '\r\n') {
      start += 2;
    }

    const headerEnd = rawBuffer.indexOf(Buffer.from('\r\n\r\n'), start);
    if (headerEnd === -1) break;

    const headerStr = rawBuffer.slice(start, headerEnd).toString('utf8');
    const nextBoundary = rawBuffer.indexOf(boundaryBuffer, headerEnd + 4);
    if (nextBoundary === -1) break;

    // Extract body without trailing \r\n
    let bodyEnd = nextBoundary;
    if (rawBuffer[bodyEnd - 2] === 0x0D && rawBuffer[bodyEnd - 1] === 0x0A) {
      bodyEnd -= 2;
    }

    const bodyBuffer = rawBuffer.slice(headerEnd + 4, bodyEnd);
    start = nextBoundary;

    // Parse Content-Disposition
    const dispMatch = headerStr.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]+)")?/i);
    if (!dispMatch) continue;

    const fieldName = dispMatch[1];
    const filename = dispMatch[2];

    if (filename !== undefined) {
      // It's a file part
      const typeMatch = headerStr.match(/content-type:\s*([^\r\n;]+)/i);
      const mimeType = typeMatch ? typeMatch[1].trim().toLowerCase() : 'application/octet-stream';

      result.files.push({
        fieldname: fieldName,
        originalname: filename,
        mimeType,
        buffer: bodyBuffer,
        size: bodyBuffer.length
      });
    } else {
      // It's a text field
      result.fields[fieldName] = bodyBuffer.toString('utf8');
    }
  }

  return result;
}

/**
 * Upload Security Validator Middleware Factory
 * @param {Object} options
 * @param {Array<string>} options.allowedMimes - Whitelisted MIME types
 * @param {number} options.maxBytes - Max allowed upload size in bytes
 * @param {string} options.fieldName - Name of the file field (default: 'file')
 */
function createUploadMiddleware({
  allowedMimes = ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes = 5 * 1024 * 1024, // 5MB default
  fieldName = 'file'
} = {}) {
  return async (req, res, next) => {
    try {
      const contentType = req.headers['content-type'] || '';
      let fileObj = null;

      // Case 1: multipart/form-data
      if (contentType.includes('multipart/form-data')) {
        const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
        if (!boundaryMatch) {
          return res.status(400).json({
            success: false,
            error: 'MALFORMED_MULTIPART',
            message: 'Multipart boundary missing from Content-Type header.'
          });
        }

        const boundary = boundaryMatch[1].trim().replace(/^["']|["']$/g, '');
        const rawBody = req.rawBody || Buffer.alloc(0);

        if (rawBody.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'EMPTY_PAYLOAD',
            message: 'No file data received in multipart payload.'
          });
        }

        const parsed = parseMultipartBuffer(rawBody, boundary);
        req.body = { ...(req.body || {}), ...parsed.fields };

        // Find file matching fieldName or fallback to first file
        fileObj = parsed.files.find(f => f.fieldname === fieldName) || parsed.files[0];
      }
      // Case 2: application/json Base64 encoded payload
      else if (contentType.includes('application/json') && req.body && (req.body.file || req.body.base64)) {
        const rawBase64 = req.body.file || req.body.base64;
        let base64Data = rawBase64;
        let inferredMime = req.body.mimeType || req.body.contentType || 'application/octet-stream';

        // Check for Data URI scheme: data:image/png;base64,...
        const dataUriMatch = rawBase64.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUriMatch) {
          inferredMime = dataUriMatch[1].toLowerCase();
          base64Data = dataUriMatch[2];
        }

        const buffer = Buffer.from(base64Data, 'base64');
        fileObj = {
          fieldname: fieldName,
          originalname: req.body.filename || req.body.fileName || 'upload.bin',
          mimeType: inferredMime.toLowerCase(),
          buffer,
          size: buffer.length
        };
      }
      // Case 3: Raw binary stream
      else if (req.rawBody && req.rawBody.length > 0) {
        fileObj = {
          fieldname: fieldName,
          originalname: req.headers['x-filename'] || 'upload.bin',
          mimeType: contentType.split(';')[0].trim().toLowerCase(),
          buffer: req.rawBody,
          size: req.rawBody.length
        };
      }

      if (!fileObj || !fileObj.buffer || fileObj.buffer.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'NO_FILE_PROVIDED',
          message: `Please upload a file under field '${fieldName}'.`
        });
      }

      // 1. Size Validation
      if (fileObj.size > maxBytes) {
        const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
        return res.status(413).json({
          success: false,
          error: 'FILE_TOO_LARGE',
          message: `File size exceeds the limit of ${maxMb}MB.`
        });
      }

      // 2. MIME Whitelist Validation
      const isAllowedMime = allowedMimes.includes(fileObj.mimeType);
      if (!isAllowedMime) {
        return res.status(415).json({
          success: false,
          error: 'UNSUPPORTED_MEDIA_TYPE',
          message: `Unsupported file type '${fileObj.mimeType}'. Allowed: ${allowedMimes.join(', ')}`
        });
      }

      // 3. Filename Sanitization
      const cleanOriginalName = fileObj.originalname
        .replace(/[\0\r\n\t]/g, '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 100);

      // 4. Virus Scan
      const scanResult = await virusScanner.scanFile(fileObj.buffer, cleanOriginalName, fileObj.mimeType);
      if (!scanResult.clean) {
        logger.warn(`Upload rejected by virus scanner: ${cleanOriginalName} (${scanResult.threat})`);
        return res.status(400).json({
          success: false,
          error: 'THREAT_DETECTED',
          message: `File security violation: Malicious pattern detected (${scanResult.threat}).`
        });
      }

      // Compute SHA-256 hash for duplicate check & integrity
      const fileHash = crypto.createHash('sha256').update(fileObj.buffer).digest('hex');

      req.file = {
        fieldname: fileObj.fieldname,
        originalname: cleanOriginalName,
        mimeType: fileObj.mimeType,
        buffer: fileObj.buffer,
        size: fileObj.size,
        hash: fileHash
      };

      next();
    } catch (err) {
      logger.error('File upload middleware error', { error: err.message });
      next(err);
    }
  };
}

module.exports = {
  createUploadMiddleware,
  avatarUpload: createUploadMiddleware({
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024, // 5MB
    fieldName: 'avatar'
  }),
  kycUpload: createUploadMiddleware({
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    maxBytes: 10 * 1024 * 1024, // 10MB
    fieldName: 'document'
  })
};
