import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Package, 
  Database, 
  DollarSign, 
  TrendingUp, 
  Calendar,
  X, 
  AlertCircle, 
  PlusCircle, 
  User, 
  BarChart2, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Eye, 
  Globe, 
  Activity, 
  ArrowUpRight, 
  Shield, 
  Info, 
  Timer, 
  CheckCircle,
  Home,
  FileText,
  HelpCircle,
  Settings,
  Moon,
  Sun,
  Zap,
  ArrowDownRight,
  Menu,
  Sparkles
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { AnimatedCounter, CurrencyCounter } from './Animation';
import DailySalesChart from '@/app/week/page';

const DashboardPage = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [stats, setStats] = useState({
    balance: 0,
    todayOrders: 0,
    todayGbSold: 0,
    todayRevenue: 0,
    recentTransactions: []
  });
  
  const [animateStats, setAnimateStats] = useState(false);
  const [showNotice, setShowNotice] = useState(true);

  // Check for dark mode preference on mount
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
      setDarkMode(true);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true);
    }
  }, []);

  // Apply dark mode class to body
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', darkMode.toString());
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  const ViewAll = () => {
    router.push('/orders');
  };

  const navigateToTransactions = () => {
    router.push('/myorders');
  };

  const navigateToTopup = () => {
    router.push('/topup');
  };
  
  const navigateToregisterFriend = () => {
    router.push('/registerFriend');
  };
  
  const navigateToVerificationServices = () => {
    router.push('/verification-services');
  };

  const navigateToNetwork = (network) => {
    switch(network) {
      case 'mtn':
        router.push('/mtnup2u');
        break;
      case 'airteltigo':
        router.push('/at-ishare');
        break;
      case 'telecel':
        router.push('/TELECEL');
        break;
      default:
        router.push('/');
    }
  };

  useEffect(() => {
    const userDataString = localStorage.getItem('userData');
    if (!userDataString) {
      router.push('/SignUp');
      return;
    }

    const userData = JSON.parse(userDataString);
    setUserName(userData.name || 'User');
    fetchDashboardData(userData.id);
    
    const noticeDismissed = localStorage.getItem('dataDeliveryNoticeDismissed');
    if (noticeDismissed === 'true') {
      setShowNotice(false);
    }
  }, [router]);

  const fetchDashboardData = async (userId) => {
    try {
      setLoading(true);
      const authToken = localStorage.getItem('authToken');
      
      const response = await fetch(`https://datanest-lkyu.onrender.com/api/v1/data/user-dashboard/${userId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data');
      }

      const responseData = await response.json();
      
      if (responseData.status === 'success') {
        const { userBalance, todayOrders } = responseData.data;
        
        setStats({
          balance: userBalance,
          todayOrders: todayOrders.count,
          todayGbSold: todayOrders.totalGbSold,
          todayRevenue: todayOrders.totalValue,
          recentTransactions: todayOrders.orders.map(order => ({
            id: order._id,
            customer: order.phoneNumber,
            method: order.method,
            amount: order.price,
            gb: formatDataCapacity(order.capacity),
            time: new Date(order.createdAt).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true
            }),
            network: order.network
          }))
        });
        
        setLoading(false);
        
        setTimeout(() => {
          setAnimateStats(true);
        }, 300);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  const formatDataCapacity = (capacity) => {
    if (capacity >= 1000) {
      return (capacity / 1000).toFixed(1);
    }
    return capacity;
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
      minimumFractionDigits: 2
    }).format(value);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning'; 
    if (hour < 18) return 'Good afternoon'; 
    return 'Good evening'; 
  };

  const dismissNotice = () => {
    setShowNotice(false);
    localStorage.setItem('dataDeliveryNoticeDismissed', 'true');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="w-20 h-20 rounded-full border-3 border-slate-200 dark:border-slate-700"></div>
            <div className="absolute top-0 w-20 h-20 rounded-full border-3 border-transparent border-t-blue-600 dark:border-t-blue-500 animate-spin"></div>
            <div className="absolute inset-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 flex items-center justify-center shadow-lg">
              <Database className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
          </div>
          <div className="flex items-center justify-center space-x-2 mb-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              DataNest <span className="text-blue-600 dark:text-blue-500">GH</span>
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
      <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        {/* Service Notice */}
        {showNotice && (
          <div className="mb-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-start">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg mr-3 flex-shrink-0">
                  <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                </div>
                <div className="flex-grow">
                  <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-3">Service Information</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                        <Timer className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Delivery Time</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">5 min - 4 hours</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2.5">
                      <div className="p-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-lg">
                        <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Service Hours</p>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">8:00 AM - 9:00 PM</p>
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={dismissNotice}
                  className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors ml-2"
                >
                  <X className="w-5 h-5" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Welcome Section with Dark Mode Toggle */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
              {getGreeting()}, {userName}!
            </h2>
            <p className="text-slate-600 dark:text-slate-400 font-medium">Welcome to your DataNest GH dashboard</p>
          </div>
          <button
            onClick={toggleDarkMode}
            className="p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors shadow-sm"
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-amber-500" strokeWidth={2} />
            ) : (
              <Moon className="w-5 h-5 text-slate-700" strokeWidth={2} />
            )}
          </button>
        </div>

        {/* Stats Grid - Professional Design */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          {/* Balance Card */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 rounded-xl shadow-lg p-6 relative overflow-hidden group hover:shadow-xl transition-all duration-300">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform"></div>
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-white/20 backdrop-blur-sm rounded-xl">
                  <CreditCard className="w-6 h-6 text-white" strokeWidth={2} />
                </div>
                <button
                  onClick={navigateToTopup}
                  className="text-xs bg-white/20 hover:bg-white/30 text-white font-bold px-3 py-1.5 rounded-lg transition-all hover:scale-105 backdrop-blur-sm"
                >
                  Deposit
                </button>
              </div>
              <p className="text-blue-100 text-sm font-semibold mb-2">Available Balance</p>
              <p className="text-3xl font-bold text-white">
                {animateStats ? 
                  <CurrencyCounter value={stats.balance} duration={1500} /> : 
                  formatCurrency(0)
                }
              </p>
            </div>
          </div>

          {/* Orders Card */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                  <Package className="w-6 h-6 text-emerald-600 dark:text-emerald-500" strokeWidth={2} />
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold mb-2">Orders Today</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {animateStats ? 
                  <AnimatedCounter value={stats.todayOrders} duration={1200} /> : 
                  "0"
                }
              </p>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                {stats.todayOrders > 0 ? `Active trading day` : 'No orders yet'}
              </p>
            </div>
          </div>

          {/* Data Volume Card */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <Database className="w-6 h-6 text-purple-600 dark:text-purple-500" strokeWidth={2} />
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold mb-2">GB Sold Today</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {animateStats ? 
                  <AnimatedCounter value={stats.todayGbSold} decimals={1} suffix=" GB" duration={1350} /> : 
                  "0 GB"
                }
              </p>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                Data transferred
              </p>
            </div>
          </div>

          {/* Revenue Card */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6 relative overflow-hidden group hover:shadow-lg transition-all duration-300">
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-amber-600 dark:text-amber-500" strokeWidth={2} />
                </div>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold mb-2">Revenue Today</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {animateStats ? 
                  <CurrencyCounter value={stats.todayRevenue} duration={1500} /> : 
                  formatCurrency(0)
                }
              </p>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                Total earnings
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Network Services */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center">
              <Zap className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-500" strokeWidth={2.5} />
              Quick Order
            </h3>
            <div className="grid grid-cols-3 gap-4">
              <button 
                onClick={() => navigateToNetwork('mtn')}
                className="group p-5 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 hover:from-yellow-100 hover:to-amber-100 dark:hover:from-yellow-900/30 dark:hover:to-amber-900/30 rounded-xl border border-yellow-200 dark:border-yellow-800 transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-yellow-500 to-amber-500 rounded-xl flex items-center justify-center shadow-md group-hover:rotate-6 transition-transform">
                    <Globe className="w-7 h-7 text-white" strokeWidth={2} />
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white mb-1">MTN</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Best Prices</p>
                </div>
              </button>

              <button 
                onClick={() => navigateToNetwork('airteltigo')}
                className="group p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/30 dark:hover:to-indigo-900/30 rounded-xl border border-blue-200 dark:border-blue-800 transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-md group-hover:rotate-6 transition-transform">
                    <Globe className="w-7 h-7 text-white" strokeWidth={2} />
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white mb-1">AirtelTigo</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Fast Delivery</p>
                </div>
              </button>

              <button 
                onClick={() => navigateToNetwork('telecel')}
                className="group p-5 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 hover:from-red-100 hover:to-rose-100 dark:hover:from-red-900/30 dark:hover:to-rose-900/30 rounded-xl border border-red-200 dark:border-red-800 transition-all duration-300 hover:scale-105 hover:shadow-lg"
              >
                <div className="text-center">
                  <div className="w-14 h-14 mx-auto mb-3 bg-gradient-to-br from-red-500 to-rose-500 rounded-xl flex items-center justify-center shadow-md group-hover:rotate-6 transition-transform">
                    <Globe className="w-7 h-7 text-white" strokeWidth={2} />
                  </div>
                  <p className="font-bold text-slate-900 dark:text-white mb-1">Telecel</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">Great Deals</p>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700 p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center">
              <Activity className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-500" strokeWidth={2.5} />
              Quick Actions
            </h3>
            <div className="space-y-2.5">
              <button
                onClick={navigateToTopup}
                className="w-full text-left p-3.5 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-slate-700 dark:hover:to-slate-700 rounded-xl transition-all flex items-center justify-between group border border-transparent hover:border-blue-200 dark:hover:border-slate-600"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:scale-110 transition-transform">
                    <CreditCard className="w-4 h-4 text-blue-600 dark:text-blue-400" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Add Funds</span>
                </div>
                <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500 -rotate-90 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
              </button>
              
              <button
                onClick={() => router.push('/orders')}
                className="w-full text-left p-3.5 hover:bg-gradient-to-r hover:from-emerald-50 hover:to-green-50 dark:hover:from-slate-700 dark:hover:to-slate-700 rounded-xl transition-all flex items-center justify-between group border border-transparent hover:border-emerald-200 dark:hover:border-slate-600"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg group-hover:scale-110 transition-transform">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">View Orders</span>
                </div>
                <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500 -rotate-90 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
              </button>
              
              <button
                onClick={() => router.push('/support')}
                className="w-full text-left p-3.5 hover:bg-gradient-to-r hover:from-purple-50 hover:to-pink-50 dark:hover:from-slate-700 dark:hover:to-slate-700 rounded-xl transition-all flex items-center justify-between group border border-transparent hover:border-purple-200 dark:hover:border-slate-600"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg group-hover:scale-110 transition-transform">
                    <HelpCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Get Support</span>
                </div>
                <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500 -rotate-90 group-hover:translate-x-1 transition-transform" strokeWidth={2} />
              </button>
            </div>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200 dark:border-slate-700">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center">
                <Activity className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-500" strokeWidth={2.5} />
                Recent Transactions
              </h3>
              <button 
                onClick={ViewAll}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-semibold flex items-center space-x-1 hover:translate-x-1 transition-transform"
              >
                <span>View All</span>
                <ArrowUpRight className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>
          </div>
          
          <div className="p-6">
            {stats.recentTransactions.length > 0 ? (
              <div className="space-y-3">
                {stats.recentTransactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 dark:hover:from-slate-700 dark:hover:to-slate-700 rounded-xl transition-all duration-300 border border-transparent hover:border-blue-100 dark:hover:border-slate-600">
                    <div className="flex items-center space-x-3.5">
                      <div className={`p-2.5 rounded-xl shadow-sm ${
                        transaction.network === 'YELLO' || transaction.network === 'MTN' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                        transaction.network === 'AT_PREMIUM' || transaction.network === 'airteltigo' || transaction.network === 'at' ? 'bg-blue-100 dark:bg-blue-900/30' :
                        transaction.network === 'TELECEL' ? 'bg-red-100 dark:bg-red-900/30' :
                        'bg-purple-100 dark:bg-purple-900/30'
                      }`}>
                        <Database className={`w-5 h-5 ${
                          transaction.network === 'YELLO' || transaction.network === 'MTN' ? 'text-yellow-600 dark:text-yellow-400' :
                          transaction.network === 'AT_PREMIUM' || transaction.network === 'airteltigo' || transaction.network === 'at' ? 'text-blue-600 dark:text-blue-400' :
                          transaction.network === 'TELECEL' ? 'text-red-600 dark:text-red-400' :
                          'text-purple-600 dark:text-purple-400'
                        }`} strokeWidth={2} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{transaction.customer}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {transaction.gb}GB • {transaction.method}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{formatCurrency(transaction.amount)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{transaction.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center">
                  <Database className="w-10 h-10 text-slate-300 dark:text-slate-600" strokeWidth={2} />
                </div>
                <p className="text-slate-600 dark:text-slate-400 font-semibold text-lg mb-1">No transactions yet</p>
                <p className="text-sm text-slate-500 dark:text-slate-500">Your recent transactions will appear here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;