"use client";

import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, X, ChevronLeft, ChevronRight, Eye } from 'lucide-react';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('deposits');
  const [deposits, setDeposits] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [authToken, setAuthToken] = useState(null);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    totalDeposits: 0,
    totalCapacityGB: 0,
    uniqueCustomers: 0
  });
  const [statusSummary, setStatusSummary] = useState([]);

  // Get auth token on mount (client-side only)
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    setAuthToken(token);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS'
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('en-GH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    const colors = {
      completed: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      processing: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      refunded: 'bg-purple-100 text-purple-800',
      shipped: 'bg-indigo-100 text-indigo-800',
      delivered: 'bg-teal-100 text-teal-800',
      waiting: 'bg-orange-100 text-orange-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Fetch daily statistics
  const fetchDailyStatistics = async (date) => {
    if (!authToken) return;
    
    setStatsLoading(true);
    try {
      const response = await fetch(
        `https://datanest-lkyu.onrender.com/api/admin/daily-summary?date=${date}`,
        {
          headers: {
            'x-auth-token': authToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch daily statistics');

      const data = await response.json();
      setStats({
        totalOrders: data.summary?.totalOrders || 0,
        totalRevenue: data.summary?.totalRevenue || 0,
        totalDeposits: data.summary?.totalDeposits || 0,
        totalCapacityGB: data.summary?.totalCapacityGB || 0,
        uniqueCustomers: data.summary?.uniqueCustomers || 0
      });
      setStatusSummary(data.statusSummary || []);
    } catch (error) {
      console.error('Error fetching daily statistics:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // Fetch deposits
  const fetchDeposits = async (page = 1, search = '', status = '') => {
    if (!authToken) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: pageSize,
        type: 'deposit',
        status: status || '',
        search: search || ''
      });

      const response = await fetch(
        `https://datanest-lkyu.onrender.com/api/admin/transactions?${params}`,
        {
          headers: {
            'x-auth-token': authToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch deposits');

      const data = await response.json();
      setDeposits(data.transactions || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(parseInt(page));
    } catch (error) {
      console.error('Error fetching deposits:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch orders
  const fetchOrders = async (page = 1, search = '', status = '') => {
    if (!authToken) return;
    
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page,
        limit: pageSize,
        status: status || '',
        phoneNumber: search || ''
      });

      const response = await fetch(
        `https://datanest-lkyu.onrender.com/api/admin/orders?${params}`,
        {
          headers: {
            'x-auth-token': authToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) throw new Error('Failed to fetch orders');

      const data = await response.json();
      setOrders(data.orders || []);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(parseInt(page));
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchDailyStatistics(selectedDate);
    }
  }, [selectedDate, authToken]);

  useEffect(() => {
    if (authToken) {
      if (activeTab === 'deposits') {
        fetchDeposits(1, searchTerm, filterStatus);
      } else {
        fetchOrders(1, searchTerm, filterStatus);
      }
    }
  }, [activeTab, filterStatus, authToken]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    if (authToken) {
      if (activeTab === 'deposits') {
        fetchDeposits(1, e.target.value, filterStatus);
      } else {
        fetchOrders(1, e.target.value, filterStatus);
      }
    }
  };

  const handleStatusFilter = (status) => {
    setFilterStatus(status);
    if (authToken) {
      if (activeTab === 'deposits') {
        fetchDeposits(1, searchTerm, status);
      } else {
        fetchOrders(1, searchTerm, status);
      }
    }
  };

  const handlePageChange = (newPage) => {
    if (authToken) {
      if (activeTab === 'deposits') {
        fetchDeposits(newPage, searchTerm, filterStatus);
      } else {
        fetchOrders(newPage, searchTerm, filterStatus);
      }
    }
  };

  // Detail Modal Component
  const DetailModal = ({ item, type, onClose }) => {
    if (!item) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-gray-50 flex justify-between items-center p-6 border-b">
            <h2 className="text-xl font-bold">
              {type === 'deposit' ? 'Deposit Details' : 'Order Details'}
            </h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {type === 'deposit' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Transaction Reference</p>
                    <p className="font-semibold text-lg">{item.reference}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Gateway</p>
                    <p className="font-semibold capitalize">{item.gateway}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Amount</p>
                    <p className="font-semibold text-green-600 text-lg">
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">User Information</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-600">Name:</span> <span className="font-medium">{item.userId?.name || 'N/A'}</span></p>
                    <p><span className="text-gray-600">Email:</span> <span className="font-medium">{item.userId?.email || 'N/A'}</span></p>
                    <p><span className="text-gray-600">Phone:</span> <span className="font-medium">{item.userId?.phoneNumber || 'N/A'}</span></p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-600">Date</p>
                  <p className="font-medium">{formatDate(item.createdAt)}</p>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Order Reference</p>
                    <p className="font-semibold text-lg">{item.geonetReference}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Network</p>
                    <p className="font-semibold text-lg">{item.network}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Data Package</p>
                    <p className="font-semibold text-lg">{item.capacity} GB</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Price</p>
                    <p className="font-semibold text-lg">{formatCurrency(item.price)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Phone Number</p>
                    <p className="font-semibold">{item.phoneNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Status</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Customer Information</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-gray-600">Name:</span> <span className="font-medium">{item.userId?.name || 'N/A'}</span></p>
                    <p><span className="text-gray-600">Email:</span> <span className="font-medium">{item.userId?.email || 'N/A'}</span></p>
                  </div>
                </div>

                <div>
                  <p className="text-sm text-gray-600">Order Date</p>
                  <p className="font-medium">{formatDate(item.createdAt)}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Show loading state while auth token is being retrieved
  if (!authToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin">
            <RefreshCw className="w-8 h-8 text-blue-600" />
          </div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 text-sm mt-1">Manage deposits, orders and daily performance</p>
        </div>
      </div>

      {/* Daily Statistics */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Daily Statistics</h2>
            <p className="text-sm text-gray-600 mt-1">View performance metrics for a specific date</p>
          </div>
          <div className="flex items-center space-x-2 bg-white p-2 rounded-lg border border-gray-300 shadow-sm">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h18M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="focus:outline-none text-sm font-medium"
              aria-label="Select date"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {/* Total Orders */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Orders</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{statsLoading ? '...' : stats.totalOrders}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Total Revenue */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600 mt-2">
                  {statsLoading ? '...' : formatCurrency(stats.totalRevenue)}
                </p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Total Deposits */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-600 text-sm font-medium">Total Deposits</p>
                <p className="text-2xl font-bold text-purple-600 mt-2">
                  {statsLoading ? '...' : formatCurrency(stats.totalDeposits)}
                </p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          {/* Data Sold */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-yellow-500 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-600 text-sm font-medium">Data Sold</p>
                <p className="text-3xl font-bold text-yellow-600 mt-2">{statsLoading ? '...' : stats.totalCapacityGB} <span className="text-sm">GB</span></p>
              </div>
              <div className="bg-yellow-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
            </div>
          </div>

          {/* Unique Customers */}
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-indigo-500 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-600 text-sm font-medium">Unique Customers</p>
                <p className="text-3xl font-bold text-indigo-600 mt-2">{statsLoading ? '...' : stats.uniqueCustomers}</p>
              </div>
              <div className="bg-indigo-100 p-3 rounded-lg">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 10a3 3 0 11-6 0 3 3 0 016 0zM6 20h12a6 6 0 00-6-6 6 6 0 00-6 6z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Order Status Summary */}
        {statusSummary.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Status Breakdown</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {statusSummary.map((status, index) => (
                <div key={index} className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 capitalize font-medium">{status.status}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{status.count}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {stats.totalOrders > 0 ? `${((status.count / stats.totalOrders) * 100).toFixed(1)}%` : '0%'}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('deposits')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'deposits'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Deposits & Transactions
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'orders'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              Data Orders
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Search and Filter */}
          <div className="mb-6 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={activeTab === 'deposits' ? 'Search by reference or user...' : 'Search by phone number...'}
                value={searchTerm}
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <select
              value={filterStatus}
              onChange={(e) => handleStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
              {activeTab === 'deposits' && <option value="refunded">Refunded</option>}
            </select>

            <button
              onClick={() => {
                if (activeTab === 'deposits') {
                  fetchDeposits(1, searchTerm, filterStatus);
                } else {
                  fetchOrders(1, searchTerm, filterStatus);
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin">
                <RefreshCw className="w-8 h-8 text-blue-600" />
              </div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          )}

          {/* Deposits Table */}
          {!loading && activeTab === 'deposits' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Reference</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Gateway</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {deposits.length > 0 ? (
                      deposits.map((deposit) => (
                        <tr key={deposit._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm font-semibold text-blue-600">{deposit.reference}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm">
                              <p className="font-medium text-gray-900">{deposit.userId?.name || 'Unknown'}</p>
                              <p className="text-gray-500">{deposit.userId?.phoneNumber || '-'}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-green-600">{formatCurrency(deposit.amount)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="capitalize text-sm text-gray-700">{deposit.gateway}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(deposit.status)}`}>
                              {deposit.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {formatDate(deposit.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedItem(deposit);
                                setShowModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                          No deposits found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Orders Table */}
          {!loading && activeTab === 'orders' && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ref ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Network</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Package</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {orders.length > 0 ? (
                      orders.map((order) => (
                        <tr key={order._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="font-mono text-sm font-semibold text-purple-600">{order.geonetReference}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm">
                              <p className="font-medium text-gray-900">{order.userId?.name || 'Unknown'}</p>
                              <p className="text-gray-500">{order.phoneNumber}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-gray-900">{order.network}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-700">{order.capacity} GB</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-semibold text-blue-600">{formatCurrency(order.price)}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => {
                                setSelectedItem(order);
                                setShowModal(true);
                              }}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                          No orders found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pagination */}
          {!loading && (deposits.length > 0 || orders.length > 0) && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {showModal && (
        <DetailModal
          item={selectedItem}
          type={activeTab === 'deposits' ? 'deposit' : 'order'}
          onClose={() => {
            setShowModal(false);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
};

export default AdminDashboard;