const fs = require('fs');
const path = require('path');
const os = require('os');
const pool = require('../db');
const jobQueue = require('../services/jobQueueService');
const supabaseService = require('../services/supabaseService');

const packageJson = require('../package.json');

// Liveness probe (shallow health check)
const getHealth = async (req, res) => {
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    const dbLatencyMs = Date.now() - start;

    return res.status(200).json({
      success: true,
      api: 'healthy',
      status: 'operational',
      database: 'connected',
      dbLatencyMs,
      uptimeSeconds: Math.floor(process.uptime()),
      version: packageJson.version || '1.0.0',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: 'degraded',
      database: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Readiness probe (deep check verifying critical tables, queue, and storage)
const getReadiness = async (req, res) => {
  const readiness = {
    database: { status: 'unknown' },
    queue: { status: 'unknown' },
    storage: { status: 'unknown' }
  };

  let allHealthy = true;

  // 1. Database & Table Check
  try {
    const dbStart = Date.now();
    const client = await pool.connect();
    try {
      const checkTables = await client.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name IN ('users', 'wallet_ledger', 'investments', 'deposits', 'withdrawals', 'background_jobs')
      `);
      const tableCount = parseInt(checkTables.rows[0].count, 10);
      const isReady = tableCount >= 5;

      readiness.database = {
        status: isReady ? 'connected' : 'incomplete_schema',
        latencyMs: Date.now() - dbStart,
        verifiedTables: tableCount,
        pool: {
          total: pool.totalCount,
          idle: pool.idleCount,
          waiting: pool.waitingCount
        }
      };

      if (!isReady) allHealthy = false;
    } finally {
      client.release();
    }
  } catch (err) {
    allHealthy = false;
    readiness.database = {
      status: 'disconnected',
      error: err.message
    };
  }

  // 2. Queue Health Check
  try {
    const queueStats = await jobQueue.getQueueStats();
    readiness.queue = {
      status: 'operational',
      workerActive: queueStats.activeWorker,
      workerId: queueStats.workerId,
      queued: queueStats.queued,
      processing: queueStats.processing,
      deadLetter: queueStats.deadLetter
    };
  } catch (err) {
    allHealthy = false;
    readiness.queue = {
      status: 'degraded',
      error: err.message
    };
  }

  // 3. Storage Health Check
  try {
    const storageDir = path.resolve(__dirname, '../uploads');
    if (!fs.existsSync(storageDir)) {
      fs.mkdirSync(storageDir, { recursive: true });
    }
    const testFile = path.join(storageDir, `.health_${Date.now()}`);
    fs.writeFileSync(testFile, 'health-check');
    fs.unlinkSync(testFile);

    const supabaseStatus = supabaseService.getStatus();
    readiness.storage = {
      status: 'operational',
      localDisk: 'writable',
      supabaseStorage: supabaseStatus.configured ? 'configured' : 'not_configured'
    };
  } catch (err) {
    readiness.storage = {
      status: 'degraded',
      error: err.message
    };
  }

  const statusCode = allHealthy ? 200 : 503;
  return res.status(statusCode).json({
    success: allHealthy,
    ready: allHealthy,
    status: allHealthy ? 'operational' : 'degraded',
    version: packageJson.version || '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    components: readiness,
    timestamp: new Date().toISOString()
  });
};

// Comprehensive System Metrics
const getMetrics = async (req, res) => {
  try {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    let queueMetrics = null;

    try {
      queueMetrics = await jobQueue.getQueueStats();
    } catch {
      queueMetrics = { status: 'unavailable' };
    }

    return res.status(200).json({
      success: true,
      service: 'growmore-backend',
      version: packageJson.version || '1.0.0',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        systemLoadAverage: os.loadavg ? os.loadavg() : [],
        totalSystemMemoryBytes: os.totalmem(),
        freeSystemMemoryBytes: os.freemem()
      },
      process: {
        pid: process.pid,
        cpuUsageMicros: cpu,
        memoryUsage: {
          rssBytes: memory.rss,
          rssMb: Math.round((memory.rss / 1024 / 1024) * 100) / 100,
          heapTotalBytes: memory.heapTotal,
          heapUsedBytes: memory.heapUsed,
          heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 100) / 100,
          externalBytes: memory.external
        }
      },
      database: {
        poolTotalCount: pool.totalCount,
        poolIdleCount: pool.idleCount,
        poolWaitingCount: pool.waitingCount
      },
      jobQueue: queueMetrics
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  getHealth,
  getReadiness,
  getMetrics
};
