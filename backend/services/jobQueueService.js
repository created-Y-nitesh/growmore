const pool = require('../db');
const logger = require('../utils/logger');

class JobQueueService {
  constructor() {
    this.handlers = new Map();
    this.isRunning = false;
    this.isDraining = false;
    this.pollTimer = null;
    this.activeJobCount = 0;
    this.workerId = `worker-${process.pid}-${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * Register a job handler for a specific job_type
   */
  registerHandler(jobType, handlerFn) {
    if (typeof handlerFn !== 'function') {
      throw new Error(`Handler for ${jobType} must be a function`);
    }
    this.handlers.set(jobType, handlerFn);
    logger.debug(`Registered job handler: ${jobType}`);
  }

  /**
   * Enqueue a job into PostgreSQL background_jobs table
   */
  async enqueue(jobType, payload = {}, options = {}) {
    const {
      jobKey = null,
      queueName = 'default',
      maxAttempts = 3,
      backoffSeconds = 5,
      delaySeconds = 0
    } = options;

    const nextRunInterval = delaySeconds > 0 ? `${parseInt(delaySeconds, 10)} seconds` : '0 seconds';

    // If jobKey is provided, check for active duplicate to prevent redundant execution
    if (jobKey) {
      const existing = await pool.query(`
        SELECT id, job_type, job_key, status, created_at
        FROM background_jobs
        WHERE job_key = $1 AND status IN ('QUEUED', 'PROCESSING')
        LIMIT 1;
      `, [jobKey]);

      if (existing.rows.length > 0) {
        logger.info(`Job deduplicated by key: ${jobKey}`, { jobType, existingId: existing.rows[0].id });
        return {
          deduplicated: true,
          job: existing.rows[0]
        };
      }
    }

    const insertQuery = `
      INSERT INTO background_jobs 
        (queue_name, job_type, job_key, payload, status, attempts, max_attempts, backoff_seconds, next_run_at)
      VALUES 
        ($1, $2, $3, $4, 'QUEUED', 0, $5, $6, NOW() + $7::interval)
      ON CONFLICT (job_key) DO UPDATE 
        SET status = 'QUEUED',
            payload = EXCLUDED.payload,
            attempts = 0,
            last_error = NULL,
            next_run_at = NOW() + $7::interval,
            updated_at = NOW()
        WHERE background_jobs.status IN ('COMPLETED', 'FAILED', 'DEAD_LETTER')
      RETURNING *;
    `;

    const result = await pool.query(insertQuery, [
      queueName,
      jobType,
      jobKey,
      JSON.stringify(payload),
      maxAttempts,
      backoffSeconds,
      nextRunInterval
    ]);

    const job = result.rows[0];
    logger.info(`Job enqueued: ${jobType} (#${job.id})`, { jobId: job.id, jobKey });
    return {
      deduplicated: false,
      job
    };
  }

  /**
   * Dequeue and process a single eligible job using FOR UPDATE SKIP LOCKED
   */
  async processNextJob() {
    if (this.isDraining) return null;

    const client = await pool.connect();
    let job = null;

    try {
      await client.query('BEGIN');

      const dequeueQuery = `
        SELECT id, queue_name, job_type, job_key, payload, attempts, max_attempts, backoff_seconds
        FROM background_jobs
        WHERE status = 'QUEUED' 
          AND next_run_at <= NOW()
        ORDER BY next_run_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1;
      `;

      const selectRes = await client.query(dequeueQuery);
      if (selectRes.rows.length === 0) {
        await client.query('COMMIT');
        return null;
      }

      const candidate = selectRes.rows[0];

      // Mark as PROCESSING inside transaction
      const updateLockQuery = `
        UPDATE background_jobs
        SET status = 'PROCESSING',
            locked_at = NOW(),
            locked_by = $1,
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *;
      `;

      const lockRes = await client.query(updateLockQuery, [this.workerId, candidate.id]);
      job = lockRes.rows[0];

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('Failed to claim job from queue', { error: err.message });
      return null;
    } finally {
      client.release();
    }

    if (!job) return null;

    this.activeJobCount++;
    const startTime = Date.now();
    logger.info(`Processing job #${job.id} (${job.job_type}) attempt ${job.attempts}/${job.max_attempts}`);

    const handler = this.handlers.get(job.job_type);

    if (!handler) {
      const noHandlerErr = `No handler registered for job type: ${job.job_type}`;
      logger.error(noHandlerErr, { jobId: job.id });
      await pool.query(`
        UPDATE background_jobs
        SET status = 'DEAD_LETTER',
            last_error = $1,
            failed_at = NOW(),
            updated_at = NOW()
        WHERE id = $2;
      `, [noHandlerErr, job.id]);
      this.activeJobCount--;
      return { success: false, error: noHandlerErr };
    }

    try {
      const result = await handler(job.payload, job);
      const durationMs = Date.now() - startTime;

      await pool.query(`
        UPDATE background_jobs
        SET status = 'COMPLETED',
            result = $1,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = $2;
      `, [JSON.stringify(result || {}), job.id]);

      logger.info(`Job #${job.id} (${job.job_type}) completed in ${durationMs}ms`);
      this.activeJobCount--;
      return { success: true, result, jobId: job.id };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err.stack || err.message;
      logger.error(`Job #${job.id} (${job.job_type}) failed after ${durationMs}ms: ${err.message}`, { error: err });

      const hasReachedMax = job.attempts >= job.max_attempts;

      if (hasReachedMax) {
        // Move to DEAD_LETTER queue
        await pool.query(`
          UPDATE background_jobs
          SET status = 'DEAD_LETTER',
              last_error = $1,
              failed_at = NOW(),
              updated_at = NOW()
          WHERE id = $2;
        `, [errorMsg, job.id]);
        logger.warn(`Job #${job.id} moved to DEAD_LETTER after ${job.attempts} attempts`);
      } else {
        // Exponential backoff retry
        const backoffSecs = Math.max(1, (job.backoff_seconds || 5) * Math.pow(2, job.attempts - 1));
        await pool.query(`
          UPDATE background_jobs
          SET status = 'QUEUED',
              last_error = $1,
              next_run_at = NOW() + ($2 * INTERVAL '1 second'),
              updated_at = NOW()
          WHERE id = $3;
        `, [errorMsg, backoffSecs, job.id]);
        logger.info(`Job #${job.id} scheduled for retry in ${backoffSecs}s`);
      }

      this.activeJobCount--;
      return { success: false, error: err.message, jobId: job.id };
    }
  }

  /**
   * Start polling loop for background worker
   */
  startWorker({ pollIntervalMs = 1000 } = {}) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isDraining = false;
    logger.info(`Starting background queue worker [${this.workerId}]`);

    const loop = async () => {
      if (!this.isRunning || this.isDraining) return;

      try {
        const processed = await this.processNextJob();
        // If a job was processed, immediately check for another job
        if (processed && this.isRunning) {
          setImmediate(loop);
          return;
        }
      } catch (err) {
        logger.error('Worker loop unexpected error', { error: err.message });
      }

      if (this.isRunning && !this.isDraining) {
        this.pollTimer = setTimeout(loop, pollIntervalMs);
      }
    };

    setImmediate(loop);
  }

  /**
   * Graceful shutdown of worker: stops polling and waits for active jobs to finish
   */
  async stopWorker({ timeoutMs = 10000 } = {}) {
    this.isDraining = true;
    this.isRunning = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    logger.info(`Stopping queue worker [${this.workerId}]. Waiting for ${this.activeJobCount} active jobs to complete...`);

    const startTime = Date.now();
    while (this.activeJobCount > 0 && (Date.now() - startTime) < timeoutMs) {
      await new Promise(r => setTimeout(r, 100));
    }

    logger.info(`Queue worker [${this.workerId}] shut down successfully.`);
  }

  /**
   * Operational telemetry: count jobs by status
   */
  async getQueueStats() {
    const res = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'QUEUED') AS queued,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') AS processing,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
        COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
        COUNT(*) FILTER (WHERE status = 'DEAD_LETTER') AS dead_letter,
        COUNT(*) AS total
      FROM background_jobs;
    `);

    const row = res.rows[0];
    return {
      queued: parseInt(row.queued, 10) || 0,
      processing: parseInt(row.processing, 10) || 0,
      completed: parseInt(row.completed, 10) || 0,
      failed: parseInt(row.failed, 10) || 0,
      deadLetter: parseInt(row.dead_letter, 10) || 0,
      total: parseInt(row.total, 10) || 0,
      activeWorker: this.isRunning,
      workerId: this.workerId
    };
  }

  /**
   * Manual retry for dead-letter or failed jobs
   */
  async retryJob(jobId) {
    const result = await pool.query(`
      UPDATE background_jobs
      SET status = 'QUEUED',
          attempts = 0,
          next_run_at = NOW(),
          last_error = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *;
    `, [jobId]);

    return result.rows[0] || null;
  }
}

// Singleton export
const jobQueue = new JobQueueService();
module.exports = jobQueue;
