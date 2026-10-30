/**
 * Automated Test Suite: Phase 2 Backend Production Roadmap
 * 1. Authentication Middleware (account_status, token_version session revocation, protected routes)
 * 2. Support Ticket System (persistence in PostgreSQL, rate limiting, Telegram fault tolerance, admin endpoints)
 * 3. Admin Performance (single optimized query eliminating N+1, aggregate accuracy, composite indexes)
 * 4. Schema Validation Middleware (deposits, withdrawals, investments)
 */

const http = require('http');
const jwt = require('jsonwebtoken');
const app = require('../server');
const pool = require('../db');

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: server.address().port,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
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
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runPhase2Tests() {
  console.log('===============================================================');
  console.log('   GROWMORE PHASE 2 BACKEND VERIFICATION AUTOMATED TEST SUITE  ');
  console.log('===============================================================\n');

  const server = http.createServer(app);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  console.log(`[Phase 2 Server] Listening on http://127.0.0.1:${port}\n`);

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

  try {
    const testTimestamp = Date.now();
    const jwtSecret = process.env.JWT_SECRET || 'test_jwt_secret';

    // -------------------------------------------------------------------------
    // SETUP: Seed test users (active, suspended, inactive, admin)
    // -------------------------------------------------------------------------
    // 1. Active User
    const activeUserRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 2 Active User', $1, 'hashed_pw', $2, 'user', 'active', TRUE, 1)
      RETURNING id, email, role, account_status, token_version;
    `, [`active_${testTimestamp}@test.com`, `+91981${testTimestamp.toString().slice(-7)}`]);
    const activeUser = activeUserRes.rows[0];

    // 2. Suspended User
    const suspendedUserRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 2 Suspended User', $1, 'hashed_pw', $2, 'user', 'suspended', TRUE, 1)
      RETURNING id, email, role, account_status, token_version;
    `, [`suspended_${testTimestamp}@test.com`, `+91982${testTimestamp.toString().slice(-7)}`]);
    const suspendedUser = suspendedUserRes.rows[0];

    // 3. Inactive User
    const inactiveUserRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 2 Inactive User', $1, 'hashed_pw', $2, 'user', 'inactive', TRUE, 1)
      RETURNING id, email, role, account_status, token_version;
    `, [`inactive_${testTimestamp}@test.com`, `+91983${testTimestamp.toString().slice(-7)}`]);
    const inactiveUser = inactiveUserRes.rows[0];

    // 4. Admin User
    const adminUserRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Phase 2 Admin User', $1, 'hashed_pw', $2, 'admin', 'active', TRUE, 1)
      RETURNING id, email, role, account_status, token_version;
    `, [`admin_${testTimestamp}@test.com`, `+91984${testTimestamp.toString().slice(-7)}`]);
    const adminUser = adminUserRes.rows[0];

    // Tokens
    const activeToken = jwt.sign(
      { id: activeUser.id, userId: activeUser.id, email: activeUser.email, role: activeUser.role, tokenVersion: activeUser.token_version },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const suspendedToken = jwt.sign(
      { id: suspendedUser.id, userId: suspendedUser.id, email: suspendedUser.email, role: suspendedUser.role, tokenVersion: suspendedUser.token_version },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const inactiveToken = jwt.sign(
      { id: inactiveUser.id, userId: inactiveUser.id, email: inactiveUser.email, role: inactiveUser.role, tokenVersion: inactiveUser.token_version },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const adminToken = jwt.sign(
      { id: adminUser.id, userId: adminUser.id, email: adminUser.email, role: adminUser.role, tokenVersion: adminUser.token_version },
      jwtSecret,
      { expiresIn: '1h' }
    );

    // -------------------------------------------------------------------------
    // TEST GROUP 1: Authentication Middleware Hardening
    // -------------------------------------------------------------------------
    console.log('--- TEST GROUP 1: Authentication Middleware Hardening ---');

    // 1.1: Unauthenticated request rejected with 401
    const unauthRes = await makeRequest(server, { path: '/api/wallet' });
    assert(unauthRes.status === 401, 'Unauthenticated request to protected route returns HTTP 401');

    // 1.2: Active account request allowed with 200
    const activeReq = await makeRequest(server, {
      path: '/api/wallet',
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    assert(activeReq.status === 200, 'Authenticated request with active account returns HTTP 200');

    // 1.3: Suspended account blocked with 403 Forbidden
    const suspendedReq = await makeRequest(server, {
      path: '/api/wallet',
      headers: { Authorization: `Bearer ${suspendedToken}` }
    });
    assert(suspendedReq.status === 403, 'Suspended account request rejected with HTTP 403 Forbidden', `Got status ${suspendedReq.status}`);

    // 1.4: Inactive account blocked with 403 Forbidden
    const inactiveReq = await makeRequest(server, {
      path: '/api/wallet',
      headers: { Authorization: `Bearer ${inactiveToken}` }
    });
    assert(inactiveReq.status === 403, 'Inactive account request rejected with HTTP 403 Forbidden', `Got status ${inactiveReq.status}`);

    // 1.5: Immediate session invalidation via token_version bump
    // Bump token_version for activeUser in database
    await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1;', [activeUser.id]);
    const revokedReq = await makeRequest(server, {
      path: '/api/wallet',
      headers: { Authorization: `Bearer ${activeToken}` }
    });
    assert(revokedReq.status === 401, 'Outdated token_version immediately invalidates session with HTTP 401', `Got status ${revokedReq.status}`);

    // 1.6: Fresh token with updated token_version works immediately
    const updatedUserRes = await pool.query('SELECT token_version FROM users WHERE id = $1;', [activeUser.id]);
    const freshToken = jwt.sign(
      { id: activeUser.id, userId: activeUser.id, email: activeUser.email, role: activeUser.role, tokenVersion: updatedUserRes.rows[0].token_version },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const freshReq = await makeRequest(server, {
      path: '/api/wallet',
      headers: { Authorization: `Bearer ${freshToken}` }
    });
    assert(freshReq.status === 200, 'Fresh token with updated token_version succeeds with HTTP 200');

    // -------------------------------------------------------------------------
    // TEST GROUP 2: Support Ticket System & Persistent Storage
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 2: Support Ticket System & Persistent Storage ---');

    // 2.1: Unauthenticated support ticket rejected
    const unauthTicket = await makeRequest(server, {
      path: '/api/support/ticket',
      method: 'POST'
    }, { message: 'Help needed' });
    assert(unauthTicket.status === 401, 'Unauthenticated ticket submission rejected with HTTP 401');

    // 2.2: Empty message rejected with 400
    const emptyTicket = await makeRequest(server, {
      path: '/api/support/ticket',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { message: '   ' });
    assert(emptyTicket.status === 400, 'Empty ticket message rejected with HTTP 400 Bad Request');

    // 2.3: Valid ticket stored in PostgreSQL support_tickets table
    const createTicketRes = await makeRequest(server, {
      path: '/api/support/ticket',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, {
      category: 'Dual Wallet',
      subject: 'Inquiry regarding payout reconciliation',
      message: 'Need assistance verifying my test payout transition and settlement schedule.',
      lockedDeposit: 5000,
      withdrawableReturns: 1200
    });
    assert(createTicketRes.status === 201, 'POST /api/support/ticket returns HTTP 201 Created');
    assert(!!createTicketRes.data.ticketId, 'Returns ticketId in response');
    const createdTicketNumber = createTicketRes.data.ticketId;

    // 2.4: Verify persistent PostgreSQL record
    const dbTicketRes = await pool.query('SELECT * FROM support_tickets WHERE ticket_number = $1;', [createdTicketNumber]);
    assert(dbTicketRes.rows.length === 1, 'Ticket is persistently stored in PostgreSQL support_tickets table');
    const dbTicket = dbTicketRes.rows[0];
    assert(Number(dbTicket.user_id) === Number(activeUser.id), 'Ticket linked to authenticated user_id');
    assert(dbTicket.status === 'OPEN', 'Ticket starts in OPEN status');
    assert(dbTicket.category === 'Dual Wallet', 'Category properly recorded');
    assert(dbTicket.metadata.lockedDeposit === 5000, 'Metadata preserved in JSONB column');

    // 2.5: Customer can list own tickets
    const myTicketsRes = await makeRequest(server, {
      path: '/api/support/my',
      headers: { Authorization: `Bearer ${freshToken}` }
    });
    assert(myTicketsRes.status === 200, 'GET /api/support/my returns HTTP 200');
    assert(Array.isArray(myTicketsRes.data.tickets) && myTicketsRes.data.tickets.length > 0, 'Customer receives list of their tickets');

    // 2.6: Customer cannot inspect another user ticket
    const otherUserRes = await pool.query(`
      INSERT INTO users (full_name, email, password_hash, phone, role, account_status, is_phone_verified, token_version)
      VALUES ('Other User', $1, 'h', $2, 'user', 'active', TRUE, 1)
      RETURNING id, email, role, token_version;
    `, [`other_${testTimestamp}@test.com`, `+91985${testTimestamp.toString().slice(-7)}`]);
    const otherUser = otherUserRes.rows[0];

    const otherUserToken = jwt.sign(
      { id: otherUser.id, userId: otherUser.id, email: otherUser.email, role: otherUser.role, tokenVersion: otherUser.token_version },
      jwtSecret,
      { expiresIn: '1h' }
    );
    const unauthorizedInspect = await makeRequest(server, {
      path: `/api/support/${dbTicket.id}`,
      headers: { Authorization: `Bearer ${otherUserToken}` }
    });
    assert(unauthorizedInspect.status === 403, 'Unauthorized ticket access by other user rejected with HTTP 403');

    // 2.7: Admin can list all tickets
    const adminTicketsRes = await makeRequest(server, {
      path: '/api/admin/tickets',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminTicketsRes.status === 200, 'GET /api/admin/tickets returns HTTP 200');
    assert(Array.isArray(adminTicketsRes.data.tickets), 'Admin ticket listing contains array');

    // 2.8: Admin updates ticket status and priority
    const updateTicketRes = await makeRequest(server, {
      path: `/api/admin/tickets/${dbTicket.id}`,
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` }
    }, {
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      adminNotes: 'Assigned to senior compliance officer'
    });
    assert(updateTicketRes.status === 200, 'Admin can update ticket status and priority with HTTP 200');
    assert(updateTicketRes.data.ticket.status === 'IN_PROGRESS', 'Status updated to IN_PROGRESS');
    assert(updateTicketRes.data.ticket.priority === 'HIGH', 'Priority updated to HIGH');

    // 2.9: Admin closes ticket
    const closeTicketRes = await makeRequest(server, {
      path: `/api/admin/tickets/${dbTicket.id}/close`,
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    }, {
      adminNotes: 'Issue fully resolved. Client notified.'
    });
    assert(closeTicketRes.status === 200, 'Admin closes ticket with HTTP 200');
    assert(closeTicketRes.data.ticket.status === 'CLOSED', 'Ticket status transitioned to CLOSED');
    assert(!!closeTicketRes.data.ticket.resolved_at, 'Ticket recorded resolved_at timestamp');

    // -------------------------------------------------------------------------
    // TEST GROUP 3: Admin Performance & Single-Query Optimization
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 3: Admin Performance & N+1 Elimination ---');

    // Seed test ledger and investments for activeUser to verify aggregation accuracy
    await pool.query(`
      INSERT INTO wallet_ledger (user_id, transaction_reference, entry_type, wallet_type, amount, balance_after, currency, status)
      VALUES ($1, $2, 'DEPOSIT', 'MAIN', 10000.00, 10000.00, 'INR', 'COMPLETED');
    `, [activeUser.id, `PERF-DEP-${testTimestamp}`]);

    await pool.query(`
      INSERT INTO investments (user_id, plan_id, principal_amount, expected_return_amount, status)
      VALUES ($1, 7, 3000.00, 3600.00, 'active');
    `, [activeUser.id]);

    await pool.query(`
      INSERT INTO withdrawals (user_id, payout_reference, payout_method, amount, currency, status)
      VALUES ($1, $2, 'IMPS', 1500.00, 'INR', 'PENDING');
    `, [activeUser.id, `PERF-WDR-${testTimestamp}`]);

    // Admin user listing
    const adminUsersRes = await makeRequest(server, {
      path: '/api/admin/users?limit=20',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(adminUsersRes.status === 200, 'GET /api/admin/users returns HTTP 200');
    assert(Array.isArray(adminUsersRes.data.users), 'Admin users response is an array');

    const retrievedActiveUser = adminUsersRes.data.users.find(u => Number(u.id) === Number(activeUser.id));
    assert(!!retrievedActiveUser, 'Active user returned in admin user list');
    assert(retrievedActiveUser.availableBalance === 10000, `Available balance aggregated accurately (₹10,000, got ${retrievedActiveUser.availableBalance})`);
    assert(retrievedActiveUser.lockedInInvestments === 3000, `Locked investments aggregated accurately (₹3,000, got ${retrievedActiveUser.lockedInInvestments})`);
    assert(retrievedActiveUser.totalPortfolio === 13000, `Total portfolio accurately computed (₹13,000, got ${retrievedActiveUser.totalPortfolio})`);
    assert(retrievedActiveUser.pendingWithdrawals === 1500, `Pending withdrawals aggregated accurately (₹1,500, got ${retrievedActiveUser.pendingWithdrawals})`);

    // Verify composite performance indexes exist in PostgreSQL catalog
    const indexCheck = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename IN ('wallet_ledger', 'investments', 'withdrawals')
        AND indexname IN ('idx_wallet_ledger_user_status', 'idx_investments_user_status', 'idx_withdrawals_user_status');
    `);
    const existingIndexNames = indexCheck.rows.map(r => r.indexname);
    assert(existingIndexNames.includes('idx_wallet_ledger_user_status'), 'Performance index idx_wallet_ledger_user_status exists in catalog');
    assert(existingIndexNames.includes('idx_investments_user_status'), 'Performance index idx_investments_user_status exists in catalog');
    assert(existingIndexNames.includes('idx_withdrawals_user_status'), 'Performance index idx_withdrawals_user_status exists in catalog');

    // -------------------------------------------------------------------------
    // TEST GROUP 4: Schema Validation Middleware
    // -------------------------------------------------------------------------
    console.log('\n--- TEST GROUP 4: Schema Validation Middleware ---');

    // 4.1: POST /api/deposits validations
    const invalidDep1 = await makeRequest(server, {
      path: '/api/deposits',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, {});
    assert(invalidDep1.status === 400, 'POST /api/deposits without amount rejected with 400 before controller');

    const invalidDep2 = await makeRequest(server, {
      path: '/api/deposits',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { amount: -500 });
    assert(invalidDep2.status === 400, 'POST /api/deposits with negative amount rejected with 400 before controller');

    const invalidDep3 = await makeRequest(server, {
      path: '/api/deposits',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { amount: 50 });
    assert(invalidDep3.status === 400, 'POST /api/deposits below minimum (< ₹100) rejected with 400');

    const invalidDep4 = await makeRequest(server, {
      path: '/api/deposits',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { amount: 99999999 });
    assert(invalidDep4.status === 400, 'POST /api/deposits exceeding ceiling (> ₹50,00,000) rejected with 400');

    // 4.2: POST /api/withdrawals validations
    const invalidWdr1 = await makeRequest(server, {
      path: '/api/withdrawals',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, {});
    assert(invalidWdr1.status === 400, 'POST /api/withdrawals without amount rejected with 400 before controller');

    const invalidWdr2 = await makeRequest(server, {
      path: '/api/withdrawals',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { amount: -100 });
    assert(invalidWdr2.status === 400, 'POST /api/withdrawals with negative amount rejected with 400 before controller');

    const invalidWdr3 = await makeRequest(server, {
      path: '/api/withdrawals',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { amount: 200 });
    assert(invalidWdr3.status === 400, 'POST /api/withdrawals below minimum (< ₹500) rejected with 400');

    const invalidWdr4 = await makeRequest(server, {
      path: '/api/withdrawals',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { amount: 2000000 });
    assert(invalidWdr4.status === 400, 'POST /api/withdrawals exceeding limit (> ₹10,00,000) rejected with 400');

    // 4.3: POST /api/investments validations
    const invalidInv1 = await makeRequest(server, {
      path: '/api/investments',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, {});
    assert(invalidInv1.status === 400, 'POST /api/investments without planId rejected with 400 before controller');

    const invalidInv2 = await makeRequest(server, {
      path: '/api/investments',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { planId: 'not-a-number', principalAmount: 1000 });
    assert(invalidInv2.status === 400, 'POST /api/investments with non-numeric planId rejected with 400');

    const invalidInv3 = await makeRequest(server, {
      path: '/api/investments',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { planId: 7, principalAmount: -1000 });
    assert(invalidInv3.status === 400, 'POST /api/investments with negative principal rejected with 400');

    const invalidInv4 = await makeRequest(server, {
      path: '/api/investments',
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` }
    }, { planId: -5, principalAmount: 1000 });
    assert(invalidInv4.status === 400, 'POST /api/investments with negative planId rejected with 400');

  } finally {
    if (server) {
      await new Promise(r => server.close(r));
    }
  }

  console.log('\n===============================================================');
  console.log(`PHASE 2 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase2Tests().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}

module.exports = runPhase2Tests;
