const pool = require('../db');

/**
 * Audit & Regulatory Compliance Controller
 * Supports streaming, querying, and exporting immutable audit logs in CSV and JSON formats.
 */

// Format value for CSV escaping
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  if (typeof val === 'object') {
    val = JSON.stringify(val);
  }
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * GET /api/admin/audit-logs/export
 * Export audit logs in CSV or JSON format with date-range & action filtering
 */
exports.exportAuditLogs = async (req, res, next) => {
  try {
    const { format = 'json', action, actorId, startDate, endDate, limit = 5000 } = req.query;

    const whereClauses = [];
    const params = [];

    if (action) {
      params.push(action.trim().toUpperCase());
      whereClauses.push(`action = $${params.length}`);
    }

    if (actorId && !isNaN(Number(actorId))) {
      params.push(Number(actorId));
      whereClauses.push(`actor_id = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      whereClauses.push(`created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      whereClauses.push(`created_at <= $${params.length}`);
    }

    params.push(Math.min(10000, Math.max(1, parseInt(limit, 10) || 1000)));

    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const query = `
      SELECT id, actor_id, actor_email, actor_role, action, target_entity, target_id, ip_address, endpoint, http_method, before_state, after_state, audit_metadata, created_at
      FROM admin_audit_logs
      ${whereSQL}
      ORDER BY id DESC
      LIMIT $${params.length};
    `;

    const result = await pool.query(query, params);
    const filename = `growmore_audit_${new Date().toISOString().split('T')[0]}_${Date.now().toString().slice(-4)}`;

    if (format.toLowerCase() === 'csv') {
      const headers = [
        'Log ID',
        'Timestamp',
        'Actor ID',
        'Actor Email',
        'Role',
        'Action',
        'Target Entity',
        'Target ID',
        'IP Address',
        'Endpoint',
        'HTTP Method',
        'Before State',
        'After State',
        'Metadata'
      ];

      const rows = result.rows.map(r => [
        escapeCsv(r.id),
        escapeCsv(r.created_at ? new Date(r.created_at).toISOString() : ''),
        escapeCsv(r.actor_id),
        escapeCsv(r.actor_email),
        escapeCsv(r.actor_role),
        escapeCsv(r.action),
        escapeCsv(r.target_entity),
        escapeCsv(r.target_id),
        escapeCsv(r.ip_address),
        escapeCsv(r.endpoint),
        escapeCsv(r.http_method),
        escapeCsv(r.before_state),
        escapeCsv(r.after_state),
        escapeCsv(r.audit_metadata)
      ].join(','));

      const csvContent = [headers.map(h => escapeCsv(h)).join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.status(200).send(csvContent);
    }

    // Default to JSON export
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    return res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      count: result.rows.length,
      logs: result.rows
    });
  } catch (err) {
    next(err);
  }
};
