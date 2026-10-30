# GrowMore High-Yield Investment Platform — Complete Backend API Specification

**Version:** 1.0.0 (Production Release)  
**Base URL:** `http://localhost:5000` (Local) / `https://api.growmore.app` (Production)  
**Interactive Swagger UI:** [`http://localhost:5000/api/docs`](http://localhost:5000/api/docs)  
**OpenAPI 3.0 Raw Spec:** [`http://localhost:5000/api/docs/openapi.json`](http://localhost:5000/api/docs/openapi.json)  
**Postman Collection:** [`GrowMore_API.postman_collection.json`](file:///d:/Downloads/growmore/backend/docs/GrowMore_API.postman_collection.json)

---

## 1. Security & Authentication Architecture

### 1.1 Bearer Token & Cookie Sessions
Protected routes accept either:
- **Header:** `Authorization: Bearer <JWT_TOKEN>`
- **Cookie:** `growmore_token=<JWT_TOKEN>` (HttpOnly, Secure in production)

### 1.2 Session Invalidation via `token_version`
Every user has a monotonic integer `token_version` stored in PostgreSQL. 
- Generated tokens embed `{ tokenVersion: user.token_version }`.
- Password resets, admin session revocations, or security incidents increment `token_version = token_version + 1`.
- Any token with an outdated `tokenVersion` is immediately rejected with `HTTP 401 Unauthorized`.

### 1.3 Strict Account Status Invariant
Every authenticated route strictly validates:
```javascript
(user.account_status || '').toLowerCase() === 'active'
```
Suspended or inactive accounts are immediately blocked with `HTTP 403 Forbidden`.

### 1.4 Rate Limiting Rules
| Limiter | Window | Max Requests | Endpoints Applied |
|---|---|---|---|
| General API | 15 minutes | 200 req / IP | `/api/*` |
| Auth Limiter | 15 minutes | 15 req / IP | `/api/auth/login`, `/api/auth/register`, `/api/auth/reset-password` |
| OTP Limiter | 15 minutes | 6 req / IP | `/api/auth/resend-otp`, `/api/auth/forgot-password` |
| Payment Limiter | 15 minutes | 30 req / IP | `/api/payments/create-order`, `/api/payments/verify`, `/api/deposits`, `/api/withdrawals` |
| Support Limiter | 15 minutes | 10 req / IP | `/api/support/ticket`, `/api/support/tickets` |

---

## 2. Standard Response & Error Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully.",
  "data": { ... }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Human-readable error description",
  "errors": ["Specific constraint violations"]
}
```

### Common HTTP Status Codes
- `200 OK`: Request succeeded.
- `201 Created`: Resource created.
- `400 Bad Request`: Pre-controller schema validation failed or business rule violation.
- `401 Unauthorized`: Missing, invalid, expired, or revoked JWT token.
- `403 Forbidden`: Insufficient RBAC privileges or suspended account (`account_status !== 'active'`).
- `404 Not Found`: Target resource does not exist.
- `409 Conflict`: Unique constraint violation (duplicate email, mobile number, or provider reference).
- `429 Too Many Requests`: Rate limiter triggered.
- `500 Internal Server Error`: Unhandled server exception.

---

## 3. Complete Endpoint Reference

### 3.1 System & Connectivity
#### `GET /`
- **Auth:** None
- **Response:**
  ```json
  { "success": true, "name": "GrowMore API Server", "status": "Operational", "version": "1.0.0" }
  ```

#### `GET /api/health`
- **Auth:** None
- **Response:**
  ```json
  { "status": "healthy", "timestamp": "2026-10-29T19:30:00.000Z", "database": "connected" }
  ```

#### `GET /api/docs`
- **Auth:** None
- **Description:** Renders the interactive Swagger UI interface.

#### `GET /api/docs/openapi.json`
- **Auth:** None
- **Description:** Returns the raw OpenAPI 3.0 specification.

---

### 3.2 Authentication (`/api/auth`)

#### `POST /api/auth/register`
- **Auth:** None
- **Rate Limit:** 15 req / 15 min
- **Request Body:**
  ```json
  {
    "fullName": "Arjun Sharma",
    "email": "arjun.sharma@example.com",
    "password": "GrowMoreSecure#2026",
    "phone": "+919876543210",
    "dob": "1992-08-20",
    "referralCode": "GM-PROMO"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "message": "Registration successful. Verification OTP sent via SMS.",
    "user": {
      "id": 14,
      "fullName": "Arjun Sharma",
      "email": "arjun.sharma@example.com",
      "phone": "+919876543210",
      "isPhoneVerified": false
    }
  }
  ```

#### `POST /api/auth/verify-otp`
- **Auth:** None
- **Request Body:**
  ```json
  {
    "phone": "+919876543210",
    "otp": "123456",
    "purpose": "register"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "Mobile number verified successfully.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": 14, "phone": "+919876543210", "isPhoneVerified": true }
  }
  ```

#### `POST /api/auth/login`
- **Auth:** None
- **Request Body:**
  ```json
  {
    "identifier": "+919876543210",
    "password": "GrowMoreSecure#2026"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "Login successful.",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": 14, "email": "arjun.sharma@example.com", "role": "user", "accountStatus": "active" }
  }
  ```

#### `POST /api/auth/forgot-password`
- **Auth:** None
- **Request Body:**
  ```json
  { "phone": "+919876543210" }
  ```
- **Response (200):**
  ```json
  { "success": true, "message": "Password recovery OTP sent via SMS." }
  ```

#### `POST /api/auth/reset-password`
- **Auth:** None
- **Request Body:**
  ```json
  {
    "resetToken": "single_use_crypto_token",
    "newPassword": "BrandNewPassword#2027"
  }
  ```
- **Response (200):**
  ```json
  { "success": true, "message": "Password reset successfully. Previous sessions invalidated." }
  ```

#### `GET /api/auth/me`
- **Auth:** Bearer Token / Cookie
- **Response (200):**
  ```json
  {
    "success": true,
    "user": {
      "id": 14,
      "fullName": "Arjun Sharma",
      "email": "arjun.sharma@example.com",
      "phone": "+919876543210",
      "role": "user",
      "accountStatus": "active",
      "referralCode": "GM-987654"
    }
  }
  ```

#### `POST /api/auth/logout`
- **Auth:** None (Clears HttpOnly Cookie)
- **Response (200):**
  ```json
  { "success": true, "message": "Logged out successfully." }
  ```

---

### 3.3 Customer Profile (`/api/profiles`)

#### `GET /api/profiles/me`
- **Auth:** Bearer Token
- **Response (200):** Returns verified customer profile protected by Supabase RLS.

#### `PATCH /api/profiles/me`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "full_name": "Arjun Sharma Updated",
    "phone": "+919876543210",
    "dob": "1992-08-20"
  }
  ```
- **Response (200):** Profile updated. (Attempts to tamper with `role`, `account_status`, or `is_verified` are rejected with HTTP 403).

---

### 3.4 Investment Plans (`/api/plans`)

#### `GET /api/plans`
- **Auth:** Public
- **Response (200):**
  ```json
  {
    "success": true,
    "plans": [
      {
        "id": 7,
        "plan_code": "BALANCED_GROWTH",
        "name": "Balanced Growth Plan",
        "minimum_amount": 5000,
        "duration_days": 90,
        "return_rate_percentage": 18.5,
        "currency": "INR",
        "is_active": true
      }
    ]
  }
  ```

#### `GET /api/plans/:id`
- **Auth:** Public
- **Response (200):** Single plan details.

---

### 3.5 Investments Lifecycle (`/api/investments`)

#### `POST /api/investments`
- **Auth:** Bearer Token (`user` / `admin`)
- **Schema Validation:** `planId` (positive integer), `principalAmount` (> 0).
- **Request Body:**
  ```json
  {
    "planId": 7,
    "principalAmount": 5000,
    "idempotencyKey": "inv-unique-001"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "message": "Investment activated successfully.",
    "investment": {
      "id": 1,
      "planId": 7,
      "principalAmount": 5000,
      "status": "active",
      "expectedReturnAmount": 5925.00
    },
    "wallet": {
      "availableBalance": 5000,
      "totalPortfolio": 10000
    }
  }
  ```

#### `GET /api/investments/my`
- **Auth:** Bearer Token
- **Response (200):** Authenticated user's active and matured contracts.

#### `GET /api/investments/:id`
- **Auth:** Bearer Token
- **Response (200):** Single investment contract with term snapshot.

---

### 3.6 Dual Wallet & Ledger (`/api/wallet` & `/api/transactions`)

#### `GET /api/wallet`
- **Auth:** Bearer Token
- **Response (200):**
  ```json
  {
    "success": true,
    "wallet": {
      "currency": "INR",
      "availableBalance": 5000.00,
      "lockedInInvestments": 5000.00,
      "totalPortfolio": 10000.00,
      "pendingWithdrawals": 0.00,
      "pendingDeposits": 0.00,
      "totalDeposited": 10000.00,
      "totalWithdrawn": 0.00,
      "totalReturnsCredited": 0.00,
      "estimatedReturns": 925.00,
      "activePlansCount": 1
    }
  }
  ```

#### `GET /api/wallet/ledger`
- **Auth:** Bearer Token
- **Query Params:** `page` (default 1), `limit` (default 20)
- **Response (200):** Paginated raw immutable double-entry ledger rows.

#### `GET /api/transactions`
- **Auth:** Bearer Token
- **Response (200):** Formatted transactions list.

---

### 3.7 Deposits Pipeline (`/api/deposits`)

#### `POST /api/deposits`
- **Auth:** Bearer Token
- **Schema Validation:** `amount` (₹100 to ₹50,00,000)
- **Request Body:**
  ```json
  {
    "amount": 2500,
    "paymentProvider": "UPI Instant Gateway",
    "providerReference": "UPI-UTR-9988771122",
    "idempotencyKey": "dep-idemp-001"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "message": "Deposit request initiated with PENDING status.",
    "deposit": {
      "id": 1,
      "amount": 2500,
      "status": "PENDING",
      "provider_reference": "UPI-UTR-9988771122"
    }
  }
  ```

#### `GET /api/deposits/my`
- **Auth:** Bearer Token
- **Response (200):** List of user deposits.

---

### 3.8 Withdrawals Pipeline (`/api/withdrawals`)

#### `POST /api/withdrawals`
- **Auth:** Bearer Token
- **Schema Validation:** `amount` (₹500 to ₹10,00,000)
- **Request Body:**
  ```json
  {
    "amount": 1000,
    "payoutMethod": "IMPS Bank Transfer",
    "payoutDetails": {
      "accountNumber": "91234567890",
      "ifsc": "HDFC0001234"
    },
    "idempotencyKey": "wdr-idemp-001"
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "message": "Withdrawal request placed. Funds reserved in hold.",
    "withdrawal": { "id": 1, "amount": 1000, "status": "PENDING" },
    "wallet": { "availableBalance": 4000, "reservedInWithdrawal": 1000 }
  }
  ```

#### `GET /api/withdrawals/my`
- **Auth:** Bearer Token
- **Response (200):** User's withdrawal history.

---

### 3.9 Payments & Gateway Integration (`/api/payments`)

#### `GET /api/payments/config`
- **Auth:** Public
- **Response (200):**
  ```json
  {
    "success": true,
    "provider": "uropay",
    "isTestMode": true,
    "apiKey": "your_uropay_api_key"
  }
  ```

#### `POST /api/payments/create-order`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  { "amount": 1500 }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "provider": "uropay",
    "orderId": "uro_1730000000_abcd1234",
    "amount": 1500,
    "currency": "INR",
    "openUrl": "https://checkout.uropai.in/pay/uro_1730000000_abcd1234",
    "upiIntent": "upi://pay?pa=uropay.growmore@icici&..."
  }
  ```

#### `POST /api/payments/verify`
- **Auth:** Bearer Token
- **Request Body:**
  ```json
  {
    "orderId": "uro_1730000000_abcd1234",
    "paymentId": "pay_uro_98765432",
    "signature": "authentic_hmac_sha256_hex"
  }
  ```
- **Response (200):**
  ```json
  {
    "success": true,
    "message": "Payment verified and credited to wallet.",
    "paymentId": "pay_uro_98765432",
    "amount": 1500
  }
  ```

#### `POST /api/payments/webhook`
- **Auth:** Cryptographic Webhook Signature (`x-uropay-signature` / `x-signature`)
- **Response (200):** Processed idempotently.

---

### 3.10 Support Tickets (`/api/support`)

#### `POST /api/support/ticket` (or `/api/support/tickets`)
- **Auth:** Bearer Token
- **Rate Limit:** 10 req / 15 min
- **Schema Validation:** `message` (required, non-empty)
- **Request Body:**
  ```json
  {
    "category": "Dual Wallet",
    "subject": "Payout settlement inquiry",
    "message": "Please confirm arrival time for IMPS payout.",
    "lockedDeposit": 5000,
    "withdrawableReturns": 1200
  }
  ```
- **Response (201):**
  ```json
  {
    "success": true,
    "message": "Support ticket received and dispatched to live desk.",
    "ticket": {
      "id": 1,
      "ticket_number": "TCK-123456-7890",
      "user_id": 14,
      "status": "OPEN",
      "priority": "NORMAL",
      "telegram_dispatched": true
    },
    "ticketId": "TCK-123456-7890"
  }
  ```

#### `GET /api/support/my`
- **Auth:** Bearer Token
- **Response (200):** Returns array of tickets owned by authenticated user.

#### `GET /api/support/:id`
- **Auth:** Bearer Token (Must be ticket owner or admin)
- **Response (200):** Ticket record. (Returns HTTP 403 on other users' tickets).

---

### 3.11 Administration (`/api/admin`)
*Strictly requires `authenticateToken` AND `role === 'admin'`*

#### `GET /api/admin/users`
- **Optimization:** Single SQL query with `LEFT JOIN LATERAL` eliminating N+1 overhead.
- **Query Params:** `page` (default 1), `limit` (default 20)
- **Response (200):**
  ```json
  {
    "success": true,
    "users": [
      {
        "id": 14,
        "full_name": "Arjun Sharma",
        "email": "arjun.sharma@example.com",
        "role": "user",
        "account_status": "active",
        "availableBalance": 5000.00,
        "totalPortfolio": 10000.00,
        "lockedInInvestments": 5000.00,
        "pendingWithdrawals": 0.00
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
  ```

#### `PATCH /api/admin/users/:id/status`
- **Request Body:**
  ```json
  {
    "status": "suspended",
    "reason": "Compliance review"
  }
  ```
- **Response (200):** Status updated, admin audit log recorded.

#### `GET /api/admin/plans` & `POST /api/admin/plans` & `PATCH /api/admin/plans/:id`
- Full investment plan administration and activation management.

#### `GET /api/admin/deposits` & `POST /api/admin/deposits/:id/verify-manual`
- Deposit pipeline governance. Manual verification atomically credits ledger.

#### `GET /api/admin/withdrawals`, `/approve`, `/mark-paid`, `/reject`
- Four-state payout transition pipeline with automatic hold release on rejection.

#### `GET /api/admin/returns` & `POST /api/admin/returns/run-batch`
- Returns calculation batch run and idempotent duplicate-skipping.

#### `GET /api/admin/reconciliation`
- Verifies platform financial invariants (zero negative balances, zero duplicate transaction references).

#### `GET /api/admin/audit-logs`
- Immutable system audit trail.

#### `GET /api/admin/tickets`
- **Query Params:** `status`, `priority`, `search`, `page`, `limit`
- **Response (200):** Paginated tickets array.

#### `PATCH /api/admin/tickets/:id`
- **Request Body:**
  ```json
  {
    "status": "IN_PROGRESS",
    "priority": "HIGH",
    "adminNotes": "Assigned to compliance officer"
  }
  ```
- **Response (200):** Ticket updated.

#### `POST /api/admin/tickets/:id/close`
- **Request Body:**
  ```json
  { "adminNotes": "Client payout confirmed with bank." }
  ```
- **Response (200):** Ticket transitioned to `CLOSED`, `resolved_at = NOW()`.

---

## 4. How to Import Postman Collection
1. Open Postman.
2. Click **Import** in the upper left corner.
3. Select file [`backend/docs/GrowMore_API.postman_collection.json`](file:///d:/Downloads/growmore/backend/docs/GrowMore_API.postman_collection.json).
4. Under Collection Variables, `baseUrl` is pre-set to `http://localhost:5000`.
5. Run **Register User** or **Login**: The included test script automatically sets `{{authToken}}` in your collection variables.
