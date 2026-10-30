const pool = require('../db');
const { notifyNewSupportTicket } = require('../services/telegramService');

/**
 * POST /api/support/ticket (or /api/support/tickets)
 * Authenticated submission of in-app priority support tickets.
 * Persists ticket in PostgreSQL BEFORE dispatching Telegram push.
 * Guaranteed persistence: ticket is never lost even if Telegram fails.
 */
const createTicket = async (req, res, next) => {
  try {
    const userId = req.user ? (req.user.userId || req.user.id) : null;
    const {
      userName,
      userMobile,
      userEmail,
      accountId,
      category,
      subject,
      message,
      lockedDeposit,
      withdrawableReturns,
      metadata = {}
    } = req.body;

    const trimmedMessage = (message || '').trim();
    if (!trimmedMessage) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty.'
      });
    }

    const resolvedName = (userName && userName.trim()) || req.user?.fullName || req.user?.name || 'Customer';
    const resolvedMobile = (userMobile && userMobile.trim()) || req.user?.phone || 'Not provided';
    const resolvedEmail = (userEmail && userEmail.trim()) || req.user?.email || 'Not provided';
    const resolvedAccountId = (accountId && accountId.trim()) || (req.user?.supabase_uid ? String(req.user.supabase_uid) : `GM-${userId || 'USER'}`);
    const resolvedCategory = (category && category.trim()) || 'General Support';
    const resolvedSubject = (subject && subject.trim()) || 'Customer Inquiry';

    // Unique sequential/random ticket number
    const ticketNumber = `TCK-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticketMetadata = {
      ...metadata,
      lockedDeposit: Number(lockedDeposit) || 0,
      withdrawableReturns: Number(withdrawableReturns) || 0,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    };

    // 1. Mandatory PostgreSQL persistence FIRST
    const insertQuery = `
      INSERT INTO support_tickets 
        (ticket_number, user_id, user_name, user_mobile, user_email, account_id, category, subject, message, status, priority, metadata, telegram_dispatched)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'OPEN', 'NORMAL', $10, FALSE)
      RETURNING *;
    `;

    const insertRes = await pool.query(insertQuery, [
      ticketNumber,
      userId,
      resolvedName,
      resolvedMobile,
      resolvedEmail,
      resolvedAccountId,
      resolvedCategory,
      resolvedSubject,
      trimmedMessage,
      JSON.stringify(ticketMetadata)
    ]);

    const ticket = insertRes.rows[0];

    // 2. Telegram Dispatch with isolation (Failure in Telegram never fails or loses ticket)
    try {
      const tgRes = await notifyNewSupportTicket({
        userName: resolvedName,
        userMobile: resolvedMobile,
        accountId: resolvedAccountId,
        category: resolvedCategory,
        message: trimmedMessage,
        lockedDeposit: Number(lockedDeposit) || 0,
        withdrawableReturns: Number(withdrawableReturns) || 0
      });

      if (tgRes && !tgRes.error && !tgRes.skipped) {
        await pool.query('UPDATE support_tickets SET telegram_dispatched = TRUE WHERE id = $1;', [ticket.id]);
        ticket.telegram_dispatched = true;
      }
    } catch (telegramErr) {
      console.warn('[Support Controller] Telegram push notification failed (ticket safely persisted in DB):', telegramErr.message);
    }

    return res.status(201).json({
      success: true,
      message: 'Support ticket received and dispatched to live desk.',
      ticket,
      ticketId: ticket.ticket_number
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/support/my (or /api/support/tickets/my)
 * Authenticated customer retrieves their own submitted tickets
 */
const getMyTickets = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;

    const query = `
      SELECT id, ticket_number, category, subject, message, status, priority, admin_notes, created_at, updated_at, resolved_at
      FROM support_tickets
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `;
    const result = await pool.query(query, [userId]);

    return res.json({
      success: true,
      tickets: result.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/support/tickets/:id
 * Retrieve a single ticket by internal id or ticket_number
 */
const getTicketById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId || req.user.id;
    const role = req.user.role;

    const isNumeric = !isNaN(Number(id));
    const query = isNumeric
      ? 'SELECT * FROM support_tickets WHERE id = $1 OR ticket_number = $2 LIMIT 1;'
      : 'SELECT * FROM support_tickets WHERE ticket_number = $1 LIMIT 1;';
    const params = isNumeric ? [Number(id), id] : [id];

    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Support ticket not found.'
      });
    }

    const ticket = result.rows[0];

    // Authorization: User must own ticket or be admin
    if (role !== 'admin' && Number(ticket.user_id) !== Number(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view this ticket.'
      });
    }

    return res.json({
      success: true,
      ticket
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createTicket,
  getMyTickets,
  getTicketById
};
