/**
 * GrowMore Frontend API Client
 * Centralized HTTP service for connecting to the Express + PostgreSQL backend.
 */

// Resolve secure API base URL across local dev and production domains
const getApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== 'undefined') {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isLocal) {
      // On production HTTPS domains, prevent browser mixed-content blocks
      if (envUrl && envUrl.startsWith('https://')) {
        return envUrl.replace(/\/+$/, '');
      }
      return `${window.location.origin}/api`;
    }
  }
  return envUrl || 'http://localhost:5000/api';
};

const API_BASE_URL = getApiBaseUrl();

// Token & Session Storage Keys
const TOKEN_KEY = 'growmore_token';
const USER_KEY = 'growmore_user';

let inMemoryToken = null;
let inMemoryUser = null;

export const authStorage = {
  getToken: () => {
    try {
      if (inMemoryToken) return inMemoryToken;
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return inMemoryToken;
    }
  },
  setToken: (token, rememberMe = false) => {
    inMemoryToken = token;
    try {
      if (token) {
        sessionStorage.setItem(TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(TOKEN_KEY);
      }
    } catch {}
  },
  getUser: () => {
    try {
      if (inMemoryUser) return inMemoryUser;
      const data = sessionStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return inMemoryUser;
    }
  },
  setUser: (user, rememberMe = false) => {
    inMemoryUser = user;
    try {
      if (user) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(user));
      } else {
        sessionStorage.removeItem(USER_KEY);
      }
    } catch {}
  },
  clear: () => {
    inMemoryToken = null;
    inMemoryUser = null;
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }
};

/**
 * Core HTTP Request Wrapper
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  const headers = {
    ...(options.headers || {})
  };

  // Only set application/json if body is not FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const token = authStorage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include' // Send and receive HttpOnly session cookies
    });
  } catch (networkError) {
    throw new Error('Unable to reach the server. Please check your internet or verify that the backend is running.');
  }

  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = (data && data.message) || `Request failed with status ${response.status}`;
    const err = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Exported Service Methods
export const api = {
  // System Health
  getHealth: () => apiRequest('/health'),

  // Investment Plans
  getPlans: () => apiRequest('/plans'),
  getPlanById: (id) => apiRequest(`/plans/${id}`),

  // Authentication
  register: async (credentials) => {
    return await apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  },

  verifyOtp: async (data) => {
    const res = await apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    if (res.token) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
    }
    return res;
  },

  resendOtp: async (data) => {
    return await apiRequest('/auth/resend-otp', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  login: async (credentials) => {
    const res = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    if (res.token) {
      authStorage.setToken(res.token);
      authStorage.setUser(res.user);
    }
    return res;
  },

  forgotPassword: async (data) => {
    return await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  resetPassword: async (data) => {
    return await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  getMe: async () => {
    const res = await apiRequest('/auth/me');
    if (res.user) {
      authStorage.setUser(res.user);
    }
    return res;
  },

  getProfile: async () => {
    const res = await apiRequest('/profiles/me');
    if (res.profile) {
      const current = authStorage.getUser() || {};
      authStorage.setUser({ ...current, ...res.profile });
    }
    return res;
  },

  updateProfile: async (data) => {
    const res = await apiRequest('/profiles/me', {
      method: 'PATCH',
      body: JSON.stringify(data)
    });
    if (res.profile) {
      const current = authStorage.getUser() || {};
      authStorage.setUser({ ...current, ...res.profile });
    }
    return res;
  },

  logout: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch (_) {}
    authStorage.clear();
  },

  // Wallet & Ledger
  getWallet: () => apiRequest('/wallet'),
  getLedger: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/wallet/ledger${query ? `?${query}` : ''}`);
  },
  getTransactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/transactions${query ? `?${query}` : ''}`);
  },

  // Investment Lifecycle
  createInvestment: (data) => apiRequest('/investments', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMyInvestments: () => apiRequest('/investments/my'),
  getInvestmentById: (id) => apiRequest(`/investments/${id}`),

  // Deposit Requests
  createDeposit: (data) => apiRequest('/deposits', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMyDeposits: () => apiRequest('/deposits/my'),
  getDepositById: (id) => apiRequest(`/deposits/${id}`),

  // Withdrawal Requests
  createWithdrawal: (data) => apiRequest('/withdrawals', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getMyWithdrawals: () => apiRequest('/withdrawals/my'),
  getWithdrawalById: (id) => apiRequest(`/withdrawals/${id}`),

  // Payment Provider Endpoints
  getPaymentConfig: () => apiRequest('/payments/config'),
  createPaymentOrder: (data) => apiRequest('/payments/create-order', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  verifyPayment: (data) => apiRequest('/payments/verify', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // Administrative Console Endpoints (RBAC: Admin only)
  adminGetUsers: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/users${q ? `?${q}` : ''}`);
  },
  adminUpdateUserStatus: (id, data) => apiRequest(`/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  adminGetPlans: () => apiRequest('/admin/plans'),
  adminCreatePlan: (data) => apiRequest('/admin/plans', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminUpdatePlan: (id, data) => apiRequest(`/admin/plans/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  }),
  adminGetInvestments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/investments${q ? `?${q}` : ''}`);
  },
  adminGetDeposits: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/deposits${q ? `?${q}` : ''}`);
  },
  adminVerifyDepositManual: (id, data) => apiRequest(`/admin/deposits/${id}/verify-manual`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminGetWithdrawals: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/withdrawals${q ? `?${q}` : ''}`);
  },
  adminApproveWithdrawal: (id, data = {}) => apiRequest(`/admin/withdrawals/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminMarkWithdrawalPaid: (id, data) => apiRequest(`/admin/withdrawals/${id}/mark-paid`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminRejectWithdrawal: (id, data) => apiRequest(`/admin/withdrawals/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminGetLedger: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/ledger${q ? `?${q}` : ''}`);
  },
  adminGetReturns: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/returns${q ? `?${q}` : ''}`);
  },
  adminRunReturnBatch: (data = {}) => apiRequest('/admin/returns/run-batch', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminGetAuditLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/audit-logs${q ? `?${q}` : ''}`);
  },
  adminGetReconciliation: () => apiRequest('/admin/reconciliation'),
  sendSupportTicket: (data) => apiRequest('/support/ticket', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  // KYC Document Verification (Customer)
  uploadKycDocument: (formData) => apiRequest('/kyc/upload', {
    method: 'POST',
    body: formData
  }),
  getMyKycDocuments: () => apiRequest('/kyc'),
  getKycDocumentById: (id) => apiRequest(`/kyc/${id}`),
  regenerateKycSignedUrl: (id, expiresIn = 900) => apiRequest(`/kyc/${id}/signed-url?expiresIn=${expiresIn}`),

  // KYC Management (Admin RBAC)
  adminGetKycDocuments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest(`/admin/kyc${q ? `?${q}` : ''}`);
  },
  adminGetKycDocumentById: (id) => apiRequest(`/admin/kyc/${id}`),
  adminReviewKycDocument: (id) => apiRequest(`/admin/kyc/${id}/status`, {
    method: 'PATCH'
  }),
  adminApproveKycDocument: (id, data = {}) => apiRequest(`/admin/kyc/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  adminRejectKycDocument: (id, data = {}) => apiRequest(`/admin/kyc/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(data)
  })
};

export default api;
