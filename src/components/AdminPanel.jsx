import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function AdminPanel({ onReturnHome, onReturnDashboard }) {
  const [activeTab, setActiveTab] = useState('reconciliation'); // 'reconciliation' | 'users' | 'deposits' | 'withdrawals' | 'investments' | 'ledger' | 'returns' | 'audit'
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Data states
  const [reconciliation, setReconciliation] = useState(null);
  const [users, setUsers] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [returns, setReturns] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [kycDocs, setKycDocs] = useState([]);
  const [kycStatusFilter, setKycStatusFilter] = useState('ALL');
  const [kycTypeFilter, setKycTypeFilter] = useState('ALL');

  // Modals & form states
  const [selectedUserForStatus, setSelectedUserForStatus] = useState(null);
  const [statusReason, setStatusReason] = useState('');
  const [selectedDepositForVerify, setSelectedDepositForVerify] = useState(null);
  const [depositTxRef, setDepositTxRef] = useState('');
  const [selectedWithdrawalForAction, setSelectedWithdrawalForAction] = useState(null);
  const [withdrawalActionType, setWithdrawalActionType] = useState('approve'); // 'approve' | 'paid' | 'reject'
  const [withdrawalActionInput, setWithdrawalActionInput] = useState('');
  const [selectedKycForAction, setSelectedKycForAction] = useState(null);
  const [kycActionType, setKycActionType] = useState('approve'); // 'approve' | 'reject'
  const [kycActionInput, setKycActionInput] = useState('');

  const showFeedback = (type, message) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 6000);
  };

  const loadTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'reconciliation') {
        const res = await api.adminGetReconciliation();
        if (res && res.report) setReconciliation(res.report);
      } else if (activeTab === 'users') {
        const res = await api.adminGetUsers({ limit: 50 });
        if (res && res.users) setUsers(res.users);
      } else if (activeTab === 'deposits') {
        const res = await api.adminGetDeposits({ limit: 50 });
        if (res && res.deposits) setDeposits(res.deposits);
      } else if (activeTab === 'withdrawals') {
        const res = await api.adminGetWithdrawals({ limit: 50 });
        if (res && res.withdrawals) setWithdrawals(res.withdrawals);
      } else if (activeTab === 'investments') {
        const res = await api.adminGetInvestments({ limit: 50 });
        if (res && res.investments) setInvestments(res.investments);
      } else if (activeTab === 'ledger') {
        const res = await api.adminGetLedger({ limit: 50 });
        if (res && res.ledger) setLedger(res.ledger);
      } else if (activeTab === 'returns') {
        const res = await api.adminGetReturns({ limit: 50 });
        if (res && res.returns) setReturns(res.returns);
      } else if (activeTab === 'audit') {
        const res = await api.adminGetAuditLogs({ limit: 50 });
        if (res && res.auditLogs) setAuditLogs(res.auditLogs);
      } else if (activeTab === 'kyc') {
        const params = { limit: 50 };
        if (kycStatusFilter !== 'ALL') params.status = kycStatusFilter;
        if (kycTypeFilter !== 'ALL') params.documentType = kycTypeFilter;
        const res = await api.adminGetKycDocuments(params);
        if (res && res.documents) setKycDocs(res.documents);
      }
    } catch (err) {
      showFeedback('error', err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTabData();
  }, [activeTab, kycStatusFilter, kycTypeFilter]);

  // Action: KYC Under Review
  const handleReviewKyc = async (docId) => {
    setActionLoading(true);
    try {
      await api.adminReviewKycDocument(docId);
      showFeedback('success', `Document #${docId} status updated to UNDER_REVIEW`);
      loadTabData();
    } catch (err) {
      showFeedback('error', err.message || 'Failed to update KYC status');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: KYC Approve / Reject Modal Submit
  const handleKycModalAction = async () => {
    if (!selectedKycForAction) return;
    setActionLoading(true);
    try {
      if (kycActionType === 'approve') {
        await api.adminApproveKycDocument(selectedKycForAction.id, { notes: kycActionInput || 'Approved by compliance officer' });
        showFeedback('success', `KYC Document #${selectedKycForAction.id} (${selectedKycForAction.document_type}) approved successfully.`);
      } else if (kycActionType === 'reject') {
        if (!kycActionInput.trim()) {
          showFeedback('error', 'Rejection reason is mandatory.');
          setActionLoading(false);
          return;
        }
        await api.adminRejectKycDocument(selectedKycForAction.id, { reason: kycActionInput.trim() });
        showFeedback('success', `KYC Document #${selectedKycForAction.id} rejected.`);
      }
      setSelectedKycForAction(null);
      setKycActionInput('');
      loadTabData();
    } catch (err) {
      showFeedback('error', err.message || 'KYC action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: View Document via Signed URL
  const handleViewKycDocument = async (doc) => {
    try {
      const res = await api.adminGetKycDocumentById(doc.id);
      if (res && res.document && res.document.signedUrl) {
        window.open(res.document.signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        showFeedback('error', 'Unable to retrieve signed download URL');
      }
    } catch (err) {
      showFeedback('error', err.message || 'Failed to fetch signed document URL');
    }
  };

  // Action: Update User Status
  const handleUpdateUserStatus = async () => {
    if (!selectedUserForStatus) return;
    setActionLoading(true);
    try {
      const nextStatus = selectedUserForStatus.account_status === 'active' ? 'suspended' : 'active';
      await api.adminUpdateUserStatus(selectedUserForStatus.id, {
        status: nextStatus,
        reason: statusReason || 'Admin console update'
      });
      showFeedback('success', `User #${selectedUserForStatus.id} status changed to ${nextStatus}`);
      setSelectedUserForStatus(null);
      setStatusReason('');
      loadTabData();
    } catch (err) {
      showFeedback('error', err.message || 'Failed to update user status');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Verify Deposit
  const handleVerifyDeposit = async () => {
    if (!selectedDepositForVerify || !depositTxRef) return;
    setActionLoading(true);
    try {
      await api.adminVerifyDepositManual(selectedDepositForVerify.id, {
        transactionReference: depositTxRef,
        notes: 'Manual bank confirmation by admin'
      });
      showFeedback('success', `Deposit #${selectedDepositForVerify.id} verified and ledger credited ₹${selectedDepositForVerify.amount}`);
      setSelectedDepositForVerify(null);
      setDepositTxRef('');
      loadTabData();
    } catch (err) {
      showFeedback('error', err.message || 'Failed to verify deposit');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Withdrawal Process
  const handleWithdrawalAction = async () => {
    if (!selectedWithdrawalForAction) return;
    setActionLoading(true);
    try {
      const id = selectedWithdrawalForAction.id;
      if (withdrawalActionType === 'approve') {
        await api.adminApproveWithdrawal(id, { note: withdrawalActionInput || 'Approved by admin' });
        showFeedback('success', `Withdrawal #${id} approved`);
      } else if (withdrawalActionType === 'paid') {
        if (!withdrawalActionInput) {
          showFeedback('error', 'Bank payout reference is required');
          setActionLoading(false);
          return;
        }
        await api.adminMarkWithdrawalPaid(id, { payoutReference: withdrawalActionInput });
        showFeedback('success', `Withdrawal #${id} settled and marked PAID`);
      } else if (withdrawalActionType === 'reject') {
        if (!withdrawalActionInput) {
          showFeedback('error', 'Rejection reason is required');
          setActionLoading(false);
          return;
        }
        await api.adminRejectWithdrawal(id, { reason: withdrawalActionInput });
        showFeedback('success', `Withdrawal #${id} rejected and funds restored to user wallet`);
      }
      setSelectedWithdrawalForAction(null);
      setWithdrawalActionInput('');
      loadTabData();
    } catch (err) {
      showFeedback('error', err.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Run Return Batch
  const handleRunReturnBatch = async () => {
    if (!confirm('Run return calculations for active investments? Estimated returns will be calculated and logged.')) return;
    setActionLoading(true);
    try {
      const res = await api.adminRunReturnBatch({});
      showFeedback('success', res.message || 'Batch calculation completed');
      loadTabData();
    } catch (err) {
      showFeedback('error', err.message || 'Batch failed');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0a0f1d', color: '#f8fafc', padding: '2rem 1.5rem', fontFamily: 'inherit' }}>
      {/* Top Header */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '1px solid #1e293b', paddingBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <span style={{ background: '#059669', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>ADMIN CONSOLE</span>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '800', margin: 0, color: '#fff' }}>GrowMore Platform Operations</h1>
          </div>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.875rem' }}>Authoritative PostgreSQL Ledger & Administrative Financial Controls</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button 
            onClick={onReturnDashboard} 
            style={{ background: '#1e293b', color: '#f8fafc', border: '1px solid #334155', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
          >
            Investor Dashboard
          </button>
          <button 
            onClick={onReturnHome} 
            style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #1e293b', padding: '0.6rem 1.2rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
          >
            Exit to Home
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto 1.5rem auto',
          padding: '1rem',
          borderRadius: '8px',
          background: feedback.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
          border: `1px solid ${feedback.type === 'error' ? '#ef4444' : '#10b981'}`,
          color: feedback.type === 'error' ? '#fca5a5' : '#6ee7b7',
          fontWeight: '500'
        }}>
          {feedback.message}
        </div>
      )}

      {/* Main Container */}
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #1e293b', marginBottom: '2rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {[
            { id: 'reconciliation', label: 'Financial Health & Invariants' },
            { id: 'deposits', label: 'Deposit Requests' },
            { id: 'withdrawals', label: 'Withdrawal Holds' },
            { id: 'users', label: 'User Accounts' },
            { id: 'investments', label: 'Active Contracts' },
            { id: 'ledger', label: 'Authoritative Ledger' },
            { id: 'returns', label: 'Return Engine' },
            { id: 'kyc', label: 'KYC Document Verification' },
            { id: 'audit', label: 'Admin Audit Trail' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: activeTab === tab.id ? '#10b981' : '#1e293b',
                color: activeTab === tab.id ? '#0f172a' : '#cbd5e1',
                border: 'none',
                padding: '0.65rem 1.25rem',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '0.875rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
            <p>Loading operational records from PostgreSQL...</p>
          </div>
        ) : (
          <div>
            {/* TAB 1: RECONCILIATION */}
            {activeTab === 'reconciliation' && reconciliation && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                  <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.25rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>Invariant Integrity</span>
                    <h2 style={{ fontSize: '1.75rem', color: reconciliation.isHealthy ? '#10b981' : '#ef4444', margin: '0.5rem 0 0 0' }}>
                      {reconciliation.isHealthy ? 'PASSED (100% HEALTHY)' : 'DISCREPANCY FLAGGED'}
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Zero negative balances & unique transaction IDs verified</p>
                  </div>
                  <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.25rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>Platform Liquidity (Available)</span>
                    <h2 style={{ fontSize: '1.75rem', color: '#fff', margin: '0.5rem 0 0 0' }}>
                      ₹{parseFloat(reconciliation.platformMetrics.totalAvailableBalanceAcrossUsers).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Sum of all unreserved user available balances</p>
                  </div>
                  <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.25rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>Pending Withdrawal Holds</span>
                    <h2 style={{ fontSize: '1.75rem', color: '#f59e0b', margin: '0.5rem 0 0 0' }}>
                      ₹{parseFloat(reconciliation.platformMetrics.totalPendingWithdrawalHolds).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>Funds reserved on ledger awaiting settlement</p>
                  </div>
                  <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.25rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase' }}>Active Invested Principal</span>
                    <h2 style={{ fontSize: '1.75rem', color: '#38bdf8', margin: '0.5rem 0 0 0' }}>
                      ₹{parseFloat(reconciliation.platformMetrics.totalActivePrincipal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </h2>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>{reconciliation.platformMetrics.totalActiveInvestments} Active user contracts</p>
                  </div>
                </div>

                {/* Ledger Breakdown by Type */}
                <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', color: '#fff' }}>Authoritative Ledger Audit by Entry Type</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                        <th style={{ padding: '0.75rem' }}>ENTRY TYPE</th>
                        <th style={{ padding: '0.75rem' }}>RECORD COUNT</th>
                        <th style={{ padding: '0.75rem' }}>TOTAL AMOUNT (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliation.ledgerBreakdown.map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                          <td style={{ padding: '0.75rem', fontWeight: '600', color: '#e2e8f0' }}>{row.entryType}</td>
                          <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{row.count}</td>
                          <td style={{ padding: '0.75rem', color: '#10b981', fontWeight: '600' }}>₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: DEPOSITS */}
            {activeTab === 'deposits' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Deposit Requests & Inbound Gateway Records</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>USER</th>
                      <th style={{ padding: '0.75rem' }}>AMOUNT</th>
                      <th style={{ padding: '0.75rem' }}>PROVIDER</th>
                      <th style={{ padding: '0.75rem' }}>STATUS</th>
                      <th style={{ padding: '0.75rem' }}>CREATED</th>
                      <th style={{ padding: '0.75rem' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deposits.map(dep => (
                      <tr key={dep.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem' }}>#{dep.id}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <div>{dep.user_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{dep.user_email}</div>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: '700', color: '#10b981' }}>₹{parseFloat(dep.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>{dep.payment_provider}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            background: dep.status === 'SUCCESS' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: dep.status === 'SUCCESS' ? '#34d399' : '#fbbf24'
                          }}>
                            {dep.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', color: '#94a3b8' }}>{new Date(dep.created_at).toLocaleString()}</td>
                        <td style={{ padding: '0.75rem' }}>
                          {dep.status === 'PENDING' && (
                            <button
                              onClick={() => {
                                setSelectedDepositForVerify(dep);
                                setDepositTxRef('');
                              }}
                              style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: '600' }}
                            >
                              Verify Bank Wire
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 3: WITHDRAWALS */}
            {activeTab === 'withdrawals' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Withdrawal Requests & Payout Pipeline</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>USER</th>
                      <th style={{ padding: '0.75rem' }}>AMOUNT</th>
                      <th style={{ padding: '0.75rem' }}>METHOD / DETAILS</th>
                      <th style={{ padding: '0.75rem' }}>STATUS</th>
                      <th style={{ padding: '0.75rem' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map(wth => (
                      <tr key={wth.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem' }}>#{wth.id}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <div>{wth.user_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{wth.user_email}</div>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: '700', color: '#f59e0b' }}>₹{parseFloat(wth.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#cbd5e1' }}>
                          <div>{wth.payout_method}</div>
                          <div style={{ color: '#64748b' }}>{JSON.stringify(wth.payout_details)}</div>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            background: wth.status === 'PAID' ? 'rgba(16, 185, 129, 0.2)' : wth.status === 'REJECTED' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: wth.status === 'PAID' ? '#34d399' : wth.status === 'REJECTED' ? '#f87171' : '#fbbf24'
                          }}>
                            {wth.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {wth.status === 'PENDING' && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => {
                                  setSelectedWithdrawalForAction(wth);
                                  setWithdrawalActionType('approve');
                                  setWithdrawalActionInput('');
                                }}
                                style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedWithdrawalForAction(wth);
                                  setWithdrawalActionType('reject');
                                  setWithdrawalActionInput('');
                                }}
                                style={{ background: '#b91c1c', color: '#fff', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                              >
                                Reject & Release
                              </button>
                            </div>
                          )}
                          {wth.status === 'APPROVED' && (
                            <button
                              onClick={() => {
                                setSelectedWithdrawalForAction(wth);
                                setWithdrawalActionType('paid');
                                setWithdrawalActionInput('');
                              }}
                              style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.3rem 0.6rem', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                            >
                              Settle as PAID
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 4: USERS */}
            {activeTab === 'users' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>User Registry & Authoritative Balances</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>USER</th>
                      <th style={{ padding: '0.75rem' }}>ROLE</th>
                      <th style={{ padding: '0.75rem' }}>STATUS</th>
                      <th style={{ padding: '0.75rem' }}>AVAILABLE (₹)</th>
                      <th style={{ padding: '0.75rem' }}>INVESTED (₹)</th>
                      <th style={{ padding: '0.75rem' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem' }}>#{u.id}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <div style={{ fontWeight: '600', color: '#fff' }}>{u.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{u.email}</div>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: u.role === 'admin' ? '#059669' : '#334155', color: '#fff' }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: u.account_status === 'active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: u.account_status === 'active' ? '#34d399' : '#f87171'
                          }}>
                            {u.account_status}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', color: '#10b981', fontWeight: '700' }}>₹{parseFloat(u.availableBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem', color: '#38bdf8' }}>₹{parseFloat(u.lockedInInvestments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem' }}>
                          {u.role !== 'admin' && (
                            <button
                              onClick={() => {
                                setSelectedUserForStatus(u);
                                setStatusReason('');
                              }}
                              style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                              {u.account_status === 'active' ? 'Suspend' : 'Activate'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 5: INVESTMENTS */}
            {activeTab === 'investments' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Allocated Investment Contracts & Terms Snapshots</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>CONTRACT ID</th>
                      <th style={{ padding: '0.75rem' }}>INVESTOR</th>
                      <th style={{ padding: '0.75rem' }}>PLAN</th>
                      <th style={{ padding: '0.75rem' }}>PRINCIPAL</th>
                      <th style={{ padding: '0.75rem' }}>FROZEN TERMS</th>
                      <th style={{ padding: '0.75rem' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {investments.map(inv => (
                      <tr key={inv.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem' }}>#{inv.id}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <div>{inv.user_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{inv.user_email}</div>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: '600', color: '#fff' }}>{inv.plan_name || 'Standard Plan'}</td>
                        <td style={{ padding: '0.75rem', color: '#10b981', fontWeight: '700' }}>₹{parseFloat(inv.principal_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#94a3b8', maxWidth: '280px' }}>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                            {JSON.stringify(inv.terms_snapshot, null, 1)}
                          </pre>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', fontWeight: '700' }}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 6: LEDGER EXPLORER */}
            {activeTab === 'ledger' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Authoritative Immutable Ledger</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>TX REFERENCE</th>
                      <th style={{ padding: '0.75rem' }}>USER</th>
                      <th style={{ padding: '0.75rem' }}>TYPE</th>
                      <th style={{ padding: '0.75rem' }}>AMOUNT (₹)</th>
                      <th style={{ padding: '0.75rem' }}>BALANCE AFTER (₹)</th>
                      <th style={{ padding: '0.75rem' }}>TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map(entry => (
                      <tr key={entry.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem' }}>#{entry.id}</td>
                        <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#38bdf8' }}>{entry.transaction_reference}</td>
                        <td style={{ padding: '0.75rem', color: '#e2e8f0' }}>{entry.user_email}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#cbd5e1' }}>{entry.entry_type}</span>
                        </td>
                        <td style={{ padding: '0.75rem', fontWeight: '700', color: parseFloat(entry.amount) >= 0 ? '#10b981' : '#f87171' }}>
                          {parseFloat(entry.amount) >= 0 ? '+' : ''}₹{parseFloat(entry.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>₹{parseFloat(entry.balance_after).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(entry.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 7: RETURN ENGINE */}
            {activeTab === 'returns' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div>
                    <h3 style={{ margin: 0, color: '#fff' }}>Scheduled Return Calculation Engine</h3>
                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                      Status: <strong>Estimates Only</strong> (Live return crediting is disabled by safety policy)
                    </p>
                  </div>
                  <button
                    onClick={handleRunReturnBatch}
                    disabled={actionLoading}
                    style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.6rem 1.25rem', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}
                  >
                    {actionLoading ? 'Calculating...' : 'Run Monthly Calculation Batch'}
                  </button>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>USER</th>
                      <th style={{ padding: '0.75rem' }}>INVESTMENT</th>
                      <th style={{ padding: '0.75rem' }}>PERIOD</th>
                      <th style={{ padding: '0.75rem' }}>AMOUNT (₹)</th>
                      <th style={{ padding: '0.75rem' }}>RATE</th>
                      <th style={{ padding: '0.75rem' }}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map(ret => (
                      <tr key={ret.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem' }}>#{ret.id}</td>
                        <td style={{ padding: '0.75rem' }}>{ret.user_email}</td>
                        <td style={{ padding: '0.75rem' }}>#{ret.investment_id} ({ret.plan_name || 'Active'})</td>
                        <td style={{ padding: '0.75rem', color: '#38bdf8' }}>{ret.calculation_period}</td>
                        <td style={{ padding: '0.75rem', fontWeight: '700', color: '#10b981' }}>₹{parseFloat(ret.amount).toFixed(2)}</td>
                        <td style={{ padding: '0.75rem' }}>{ret.rate_applied}%</td>
                        <td style={{ padding: '0.75rem' }}>
                          <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: ret.status === 'CREDITED' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)', color: ret.status === 'CREDITED' ? '#34d399' : '#fbbf24' }}>
                            {ret.status} ({ret.is_estimate ? 'ESTIMATE' : 'CREDITED'})
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB 8: AUDIT LOGS */}
            {activeTab === 'audit' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#fff' }}>Immutable Administrative Audit Logs</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>ADMIN</th>
                      <th style={{ padding: '0.75rem' }}>ACTION</th>
                      <th style={{ padding: '0.75rem' }}>TARGET</th>
                      <th style={{ padding: '0.75rem' }}>DETAILS</th>
                      <th style={{ padding: '0.75rem' }}>TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '0.75rem' }}>#{log.id}</td>
                        <td style={{ padding: '0.75rem', color: '#38bdf8' }}>{log.actor_email || `Admin #${log.actor_id}`}</td>
                        <td style={{ padding: '0.75rem', fontWeight: '700', color: '#fff' }}>{log.action}</td>
                        <td style={{ padding: '0.75rem', color: '#cbd5e1' }}>{log.target_entity} #{log.target_id}</td>
                        <td style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#94a3b8', maxWidth: '350px' }}>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                            {JSON.stringify(log.audit_metadata, null, 1)}
                          </pre>
                        </td>
                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{new Date(log.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB: KYC DOCUMENT VERIFICATION */}
            {activeTab === 'kyc' && (
              <div style={{ background: '#131d31', border: '1px solid #1e293b', borderRadius: '12px', padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem 0', color: '#fff' }}>Customer KYC Verification Pipeline</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Review Aadhaar cards, PAN cards and identity documents submitted by investors.</p>
                  </div>

                  {/* Filters */}
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: '0.5rem' }}>Status:</span>
                      <select
                        value={kycStatusFilter}
                        onChange={e => setKycStatusFilter(e.target.value)}
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending Review</option>
                        <option value="UNDER_REVIEW">Under Review</option>
                        <option value="APPROVED">Approved</option>
                        <option value="REJECTED">Rejected</option>
                      </select>
                    </div>

                    <div>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginRight: '0.5rem' }}>Type:</span>
                      <select
                        value={kycTypeFilter}
                        onChange={e => setKycTypeFilter(e.target.value)}
                        style={{ background: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}
                      >
                        <option value="ALL">All Document Types</option>
                        <option value="aadhaar">Aadhaar Card</option>
                        <option value="pan">PAN Card</option>
                        <option value="selfie">Live Selfie</option>
                        <option value="address_proof">Address Proof</option>
                      </select>
                    </div>

                    <button
                      onClick={loadTabData}
                      disabled={loading}
                      style={{ background: '#1e293b', border: '1px solid #334155', color: '#38bdf8', padding: '0.4rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      {loading ? 'Refreshing...' : '↻ Refresh Queue'}
                    </button>
                  </div>
                </div>

                {kycDocs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#64748b' }}>
                    No KYC document submissions match the selected filters.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                          <th style={{ padding: '0.75rem' }}>ID</th>
                          <th style={{ padding: '0.75rem' }}>CUSTOMER</th>
                          <th style={{ padding: '0.75rem' }}>TYPE</th>
                          <th style={{ padding: '0.75rem' }}>DOC NUMBER</th>
                          <th style={{ padding: '0.75rem' }}>FILE INFO</th>
                          <th style={{ padding: '0.75rem' }}>STATUS</th>
                          <th style={{ padding: '0.75rem' }}>SUBMITTED</th>
                          <th style={{ padding: '0.75rem' }}>REVIEW ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kycDocs.map(doc => {
                          const isPending = doc.status === 'PENDING';
                          const isReview = doc.status === 'UNDER_REVIEW';
                          const isApproved = doc.status === 'APPROVED';
                          const isRejected = doc.status === 'REJECTED';
                          const statusColor = isApproved ? '#10b981' : (isRejected ? '#ef4444' : (isReview ? '#f59e0b' : '#38bdf8'));

                          return (
                            <tr key={doc.id} style={{ borderBottom: '1px solid #1e293b' }}>
                              <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>#{doc.id}</td>
                              <td style={{ padding: '0.75rem' }}>
                                <div style={{ color: '#fff', fontWeight: '600' }}>{doc.user_name || 'Customer'}</div>
                                <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{doc.user_email}</div>
                                {doc.user_phone && <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{doc.user_phone}</div>}
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <span style={{
                                  textTransform: 'uppercase',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '6px',
                                  background: doc.document_type === 'pan' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                                  color: doc.document_type === 'pan' ? '#c084fc' : '#38bdf8',
                                  border: `1px solid ${doc.document_type === 'pan' ? 'rgba(168, 85, 247, 0.3)' : 'rgba(56, 189, 248, 0.3)'}`
                                }}>
                                  {doc.document_type}
                                </span>
                              </td>
                              <td style={{ padding: '0.75rem', fontFamily: 'monospace', color: '#e2e8f0', letterSpacing: '0.04em' }}>
                                {doc.document_number || 'N/A'}
                              </td>
                              <td style={{ padding: '0.75rem', fontSize: '0.78rem', color: '#94a3b8' }}>
                                <div>{doc.file_name}</div>
                                <div style={{ color: '#64748b' }}>{(doc.file_size / 1024).toFixed(1)} KB • {doc.mime_type}</div>
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '12px',
                                  fontSize: '0.72rem',
                                  fontWeight: '700',
                                  color: statusColor,
                                  background: `${statusColor}18`,
                                  border: `1px solid ${statusColor}33`
                                }}>
                                  {doc.status}
                                </span>
                                {doc.rejection_reason && (
                                  <div style={{ color: '#f87171', fontSize: '0.72rem', marginTop: '0.25rem', maxWidth: '200px' }}>
                                    Reason: {doc.rejection_reason}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: '0.75rem', color: '#64748b', fontSize: '0.75rem' }}>
                                {new Date(doc.created_at).toLocaleDateString()}
                              </td>
                              <td style={{ padding: '0.75rem' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => handleViewKycDocument(doc)}
                                    title="View encrypted document via 15-minute signed URL"
                                    style={{
                                      background: '#0284c7',
                                      color: '#fff',
                                      border: 'none',
                                      padding: '0.3rem 0.6rem',
                                      borderRadius: '6px',
                                      fontSize: '0.75rem',
                                      cursor: 'pointer',
                                      fontWeight: '600'
                                    }}
                                  >
                                    View
                                  </button>

                                  {isPending && (
                                    <button
                                      onClick={() => handleReviewKyc(doc.id)}
                                      disabled={actionLoading}
                                      style={{
                                        background: '#d97706',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '0.3rem 0.6rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                      }}
                                    >
                                      Review
                                    </button>
                                  )}

                                  {!isApproved && (
                                    <button
                                      onClick={() => {
                                        setSelectedKycForAction(doc);
                                        setKycActionType('approve');
                                        setKycActionInput('Approved by compliance officer');
                                      }}
                                      style={{
                                        background: '#059669',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '0.3rem 0.6rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                      }}
                                    >
                                      Approve
                                    </button>
                                  )}

                                  {!isRejected && (
                                    <button
                                      onClick={() => {
                                        setSelectedKycForAction(doc);
                                        setKycActionType('reject');
                                        setKycActionInput('');
                                      }}
                                      style={{
                                        background: '#dc2626',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '0.3rem 0.6rem',
                                        borderRadius: '6px',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                      }}
                                    >
                                      Reject
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL 1: VERIFY DEPOSIT */}
      {selectedDepositForVerify && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>Verify Bank Wire Deposit</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1.25rem 0' }}>
              Confirm receipt of ₹{selectedDepositForVerify.amount} for user <strong>{selectedDepositForVerify.user_email}</strong>.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>Bank Transaction / UTR Reference</label>
              <input
                type="text"
                placeholder="e.g. UTR123456789"
                value={depositTxRef}
                onChange={e => setDepositTxRef(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setSelectedDepositForVerify(null)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleVerifyDeposit} disabled={!depositTxRef || actionLoading} style={{ background: '#059669', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>
                {actionLoading ? 'Crediting...' : 'Confirm & Credit Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: WITHDRAWAL ACTION */}
      {selectedWithdrawalForAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>
              {withdrawalActionType === 'approve' && 'Approve Withdrawal'}
              {withdrawalActionType === 'paid' && 'Settle Withdrawal (Mark PAID)'}
              {withdrawalActionType === 'reject' && 'Reject Withdrawal & Release Hold'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1.25rem 0' }}>
              Withdrawal #{selectedWithdrawalForAction.id} for ₹{selectedWithdrawalForAction.amount} to {selectedWithdrawalForAction.user_email}.
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                {withdrawalActionType === 'paid' ? 'Bank Payout Reference (UTR/IMPS Ref)' : 'Note / Reason'}
              </label>
              <input
                type="text"
                placeholder={withdrawalActionType === 'paid' ? 'e.g. UTR987654321' : 'Reason for audit trail'}
                value={withdrawalActionInput}
                onChange={e => setWithdrawalActionInput(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button onClick={() => setSelectedWithdrawalForAction(null)} style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleWithdrawalAction}
                disabled={actionLoading}
                style={{
                  background: withdrawalActionType === 'reject' ? '#b91c1c' : '#059669',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '700'
                }}
              >
                {actionLoading ? 'Processing...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: KYC APPROVE / REJECT */}
      {selectedKycForAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: '#fff' }}>
              {kycActionType === 'approve' ? 'Approve Customer KYC' : 'Reject Customer KYC Document'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1.25rem 0' }}>
              Document #{selectedKycForAction.id} ({selectedKycForAction.document_type.toUpperCase()}) for <strong>{selectedKycForAction.user_name || selectedKycForAction.user_email}</strong>.
            </p>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
                {kycActionType === 'approve' ? 'Compliance Review Notes (Optional)' : 'Rejection Reason (Mandatory for Customer)'}
              </label>
              <textarea
                rows={3}
                placeholder={kycActionType === 'approve' ? 'e.g. Identity verified via government database' : 'e.g. Document image is blurry or PAN card name does not match user account'}
                value={kycActionInput}
                onChange={e => setKycActionInput(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: '#0f172a', border: '1px solid #334155', color: '#fff', fontSize: '0.85rem' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                onClick={() => setSelectedKycForAction(null)}
                style={{ background: '#334155', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleKycModalAction}
                disabled={actionLoading}
                style={{
                  background: kycActionType === 'reject' ? '#dc2626' : '#059669',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '700'
                }}
              >
                {actionLoading ? 'Processing...' : (kycActionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
