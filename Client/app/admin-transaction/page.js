'use client'
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminTransactionsPage = () => {
  const [activeTab, setActiveTab] = useState('transactions');
  const [transactions, setTransactions] = useState([]);
  const [suspiciousAccounts, setSuspiciousAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [refreshTime, setRefreshTime] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const baseURL = 'https://datanest-lkyu.onrender.com';
  const token = localStorage.getItem('authToken');

  // Fetch today's transactions
  const fetchTodayTransactions = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${baseURL}/api/admin/today-transactions`, {
        headers: {
            'x-auth-token': token
          }
      });
      setTransactions(response.data.data.transactions);
      setSummary(response.data.data.summary);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch transactions');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch suspicious accounts
  const fetchSuspiciousAccounts = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${baseURL}/api/admin/suspicious-accounts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuspiciousAccounts(response.data.data.accounts);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch suspicious accounts');
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load and auto-refresh
  useEffect(() => {
    if (activeTab === 'transactions') {
      fetchTodayTransactions();
      const interval = setInterval(() => {
        fetchTodayTransactions();
        setRefreshTime(new Date());
      }, 30000);
      return () => clearInterval(interval);
    } else {
      fetchSuspiciousAccounts();
      const interval = setInterval(() => {
        fetchSuspiciousAccounts();
        setRefreshTime(new Date());
      }, 60000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Filter transactions
  const filteredTransactions = transactions.filter(txn => {
    const matchesSearch = 
      txn.user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.user.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      txn.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || txn.type === filterType;
    
    return matchesSearch && matchesType;
  });

  // ==================== TODAY'S TRANSACTIONS TAB ====================
  const renderTransactionsTab = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-600">
            <p className="text-gray-600 text-sm font-medium">Total Transactions</p>
            <p className="text-4xl font-bold text-blue-600 mt-2">{summary.totalTransactions}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-600">
            <p className="text-gray-600 text-sm font-medium">Total Amount</p>
            <p className="text-3xl font-bold text-green-600 mt-2">GHS {summary.totalAmount.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-emerald-600">
            <p className="text-gray-600 text-sm font-medium">Completed</p>
            <p className="text-3xl font-bold text-emerald-600 mt-2">{summary.byStatus.completed?.count || 0}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-yellow-600">
            <p className="text-gray-600 text-sm font-medium">Pending</p>
            <p className="text-3xl font-bold text-yellow-600 mt-2">{summary.byStatus.pending?.count || 0}</p>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
            <input
              type="text"
              placeholder="Search by name, phone, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Type</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Types</option>
              <option value="data-purchase">Data Purchase</option>
              <option value="admin-credit">Admin Credit</option>
              <option value="admin-deduction">Admin Deduction</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={fetchTodayTransactions}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Last updated: {refreshTime.toLocaleTimeString()}</p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-semibold">Error: {error}</p>
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 text-white">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold">User</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Type</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Amount</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Balance Change</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Status</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Method</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Description</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((txn) => (
                  <tr key={txn.id} className="border-b hover:bg-gray-50 transition">
                    <td className="px-6 py-4 text-sm">
                      <div>
                        <p className="font-semibold text-gray-900">{txn.user.name}</p>
                        <p className="text-gray-500 text-xs">{txn.user.phone}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className="font-semibold text-indigo-600">{txn.type}</span>
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-green-600">
                      GHS {txn.amount.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      GHS {txn.balanceBefore.toFixed(2)} → {txn.balanceAfter.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          txn.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : txn.status === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                      {txn.paymentMethod}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="max-w-xs truncate" title={txn.description}>
                        {txn.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {new Date(txn.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Showing X of Y */}
      <div className="text-sm text-gray-600 text-center">
        Showing {filteredTransactions.length} of {transactions.length} transactions
      </div>
    </div>
  );

  // ==================== SUSPICIOUS ACCOUNTS TAB ====================
  const renderSuspiciousTab = () => (
    <div className="space-y-6">
      {/* Alert Banner */}
      <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
        <div className="flex items-start">
          <div className="text-4xl mr-4">⚠️</div>
          <div>
            <h3 className="text-2xl font-bold text-red-800">Suspicious Accounts Detected</h3>
            <p className="text-red-700 mt-2">Accounts with wallet balance but no verified deposits require immediate review.</p>
          </div>
        </div>
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={fetchSuspiciousAccounts}
          disabled={loading}
          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
        >
          {loading ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700 font-semibold">Error: {error}</p>
        </div>
      )}

      {/* Summary */}
      {suspiciousAccounts.length > 0 && (
        <div className="bg-red-100 border border-red-300 rounded-lg p-6">
          <p className="text-red-900 font-bold text-lg">
            Found {suspiciousAccounts.length} suspicious account{suspiciousAccounts.length !== 1 ? 's' : ''}
          </p>
          <ul className="text-red-800 mt-3 ml-4 list-disc space-y-1">
            <li>Total suspicious balance: GHS {suspiciousAccounts.reduce((sum, acc) => sum + acc.walletBalance, 0).toFixed(2)}</li>
            <li>Verify user identity before allowing transactions</li>
            <li>Check transaction history for anomalies</li>
            <li>Consider freezing account until verified</li>
          </ul>
        </div>
      )}

      {/* Suspicious Accounts Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-red-800 text-white">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold">#</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Email</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Phone</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Wallet Balance</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Account Age</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Created Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                    Scanning accounts...
                  </td>
                </tr>
              ) : suspiciousAccounts.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-8 text-center text-green-600 font-semibold">
                    No suspicious accounts found - System is clean!
                  </td>
                </tr>
              ) : (
                suspiciousAccounts.map((account, index) => {
                  const daysOld = Math.floor(
                    (new Date() - new Date(account.createdAt)) / (1000 * 60 * 60 * 24)
                  );
                  const riskLevel = daysOld <= 1 ? 'Critical' : daysOld <= 7 ? 'High' : 'Medium';
                  const riskBg = daysOld <= 1 ? 'bg-red-200' : daysOld <= 7 ? 'bg-orange-200' : 'bg-yellow-200';
                  const riskText = daysOld <= 1 ? 'text-red-900' : daysOld <= 7 ? 'text-orange-900' : 'text-yellow-900';

                  return (
                    <tr key={account._id} className="border-b hover:bg-red-50 transition">
                      <td className="px-6 py-4 text-sm font-bold text-red-600">{index + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{account.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{account.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{account.phoneNumber}</td>
                      <td className="px-6 py-4 text-sm font-bold text-red-700">
                        GHS {account.walletBalance.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${riskBg} ${riskText}`}>
                          {riskLevel} - {daysOld} days
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(account.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button className="text-blue-600 hover:text-blue-900 font-semibold hover:underline">
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations */}
      {suspiciousAccounts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6">
          <h4 className="font-bold text-yellow-900 mb-3">Recommended Actions:</h4>
          <ul className="text-yellow-800 space-y-2 ml-4 list-disc">
            <li>Request ID verification for all flagged accounts</li>
            <li>Temporarily block data purchases until verification</li>
            <li>Log all activity for compliance audit trail</li>
            <li>Set balance limits for new unverified accounts</li>
            <li>Send verification email/SMS to account holders</li>
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800">Admin Dashboard</h1>
          <p className="text-gray-600 mt-2">Monitor transactions and detect suspicious activity</p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-t-lg shadow-md flex">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex-1 py-4 px-6 font-semibold text-lg border-b-4 transition ${
              activeTab === 'transactions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Today's Transactions
          </button>
          <button
            onClick={() => setActiveTab('suspicious')}
            className={`flex-1 py-4 px-6 font-semibold text-lg border-b-4 transition ${
              activeTab === 'suspicious'
                ? 'border-red-600 text-red-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            Suspicious Accounts
          </button>
        </div>

        {/* Tab Content */}
        <div className="bg-white rounded-b-lg shadow-md p-6">
          {activeTab === 'transactions' ? renderTransactionsTab() : renderSuspiciousTab()}
        </div>
      </div>
    </div>
  );
};

export default AdminTransactionsPage;

