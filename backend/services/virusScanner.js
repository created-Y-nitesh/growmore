const logger = require('../utils/logger');

/**
 * Pluggable Antivirus & Malware Defense Interface
 * Supports external enterprise scanners (ClamAV, AWS GuardDuty, VirusTotal API)
 * with a built-in heuristic signature scanner.
 */
class VirusScannerService {
  constructor(customScanner = null) {
    this.customScanner = customScanner;
    this.scanCount = 0;
  }

  /**
   * Set custom scanner hook (e.g. ClamAV daemon client or cloud inspection API)
   */
  setScannerHook(scannerFn) {
    if (typeof scannerFn !== 'function') {
      throw new Error('Scanner hook must be a function.');
    }
    this.customScanner = scannerFn;
    logger.info('Configured custom antivirus scanner hook.');
  }

  /**
   * Scan an uploaded buffer before it is written to storage
   * @param {Buffer} buffer - File buffer
   * @param {string} filename - Original filename
   * @param {string} mimeType - Declared MIME type
   * @returns {Promise<{ clean: boolean, threat: string|null }>}
   */
  async scanFile(buffer, filename = '', mimeType = '') {
    this.scanCount++;

    if (!Buffer.isBuffer(buffer)) {
      throw new Error('VirusScanner: expected Buffer input.');
    }

    // 1. If custom external scanner hook is provided, delegate
    if (this.customScanner) {
      try {
        const customResult = await this.customScanner(buffer, filename, mimeType);
        if (customResult && customResult.clean === false) {
          logger.warn(`Custom virus scanner detected threat in ${filename}: ${customResult.threat}`);
          return customResult;
        }
      } catch (err) {
        logger.error(`Custom virus scanner failure: ${err.message}`, { error: err });
        // Fail-safe: continue to built-in heuristic analysis
      }
    }

    // 2. Built-in Heuristic Analysis
    // A. EICAR Standard Antivirus Test Signature
    // Used universally to test antivirus engine triggers safely
    const EICAR_SIGNATURE = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const contentUtf8 = buffer.toString('utf8', 0, Math.min(buffer.length, 4096));

    if (contentUtf8.includes(EICAR_SIGNATURE)) {
      logger.warn(`Threat detected in ${filename}: EICAR-Standard-Test-Signature`);
      return {
        clean: false,
        threat: 'EICAR-Standard-Test-Signature'
      };
    }

    // B. Disguised Executable Header Check (MZ/PE header in image or PDF container)
    if (buffer.length >= 2 && buffer[0] === 0x4D && buffer[1] === 0x5A) {
      logger.warn(`Threat detected in ${filename}: Disguised-DOS-PE-Executable-Header`);
      return {
        clean: false,
        threat: 'Disguised-DOS-PE-Executable-Header'
      };
    }

    // C. Script Injection Detection in Document/Image Containers
    const sample = buffer.slice(0, Math.min(buffer.length, 2048)).toString('utf8').toLowerCase();
    const scriptPatterns = [
      '<?php',
      '<script',
      'javascript:',
      'eval(',
      'base64_decode(',
      'system(',
      'passthru('
    ];

    for (const pattern of scriptPatterns) {
      if (sample.includes(pattern)) {
        logger.warn(`Threat detected in ${filename}: Embedded-Script-Injection (${pattern})`);
        return {
          clean: false,
          threat: `Embedded-Script-Injection (${pattern})`
        };
      }
    }

    // File passed all security heuristics
    return {
      clean: true,
      threat: null
    };
  }
}

module.exports = new VirusScannerService();
