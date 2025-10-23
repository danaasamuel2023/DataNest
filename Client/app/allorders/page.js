'use client'
import { useEffect, useState, useRef } from "react";

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [capacityFilter, setCapacityFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [phoneSearch, setPhoneSearch] = useState("");
  const [referenceSearch, setReferenceSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [networkFilter, setNetworkFilter] = useState("");
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [ordersPerPage, setOrdersPerPage] = useState(100);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  
  // Ref for infinite scroll
  const observerRef = useRef(null);
  const lastOrderElementRef = useRef(null);

  // Date filter function (client-side)
  const isWithinDateRange = (dateString) => {
    if (!startDate && !endDate) return true;
    
    const orderDate = new Date(dateString);
    const startDateObj = startDate ? new Date(startDate) : null;
    const endDateObj = endDate ? new Date(endDate) : null;
    
    if (startDateObj && endDateObj) {
      endDateObj.setHours(23, 59, 59, 999);
      return orderDate >= startDateObj && orderDate <= endDateObj;
    } else if (startDateObj) {
      return orderDate >= startDateObj;
    } else if (endDateObj) {
      endDateObj.setHours(23, 59, 59, 999);
      return orderDate <= endDateObj;
    }
    
    return true;
  };

  // Apply client-side filters (for filters not handled by API)
  const filteredOrders = orders.filter(order => {
    const capacityMatches = capacityFilter ? order.capacity === parseInt(capacityFilter) : true;
    const dateMatches = isWithinDateRange(order.createdAt);
    const statusMatches = statusFilter ? order.status?.toLowerCase() === statusFilter.toLowerCase() : true;
    
    return capacityMatches && dateMatches && statusMatches;
  });

  useEffect(() => {
    const fetchOrders = async () => {
      const authToken = localStorage.getItem("authToken");
      if (!authToken) {
        alert("Unauthorized access!");
        return;
      }

      try {
        setLoading(true);

        // Build query parameters - SEND SEARCHES TO BACKEND
        const params = new URLSearchParams({
          page: currentPage,
          limit: ordersPerPage,
          status: statusFilter,
          network: networkFilter,
          phoneNumber: phoneSearch, // Send to backend
          startDate: startDate,
          endDate: endDate
        });

        const res = await fetch(`https://datanest-lkyu.onrender.com/api/orders?${params}`, {
          headers: {
            'x-auth-token': authToken
          }
        });

        if (!res.ok) {
          throw new Error("Failed to fetch orders");
        }

        const data = await res.json();
        console.log("API Response:", data);

        // Extract all data from the response
        if (data.orders && Array.isArray(data.orders)) {
          if (currentPage === 1) {
            setOrders(data.orders);
          } else {
            setOrders(prevOrders => [...prevOrders, ...data.orders]);
          }
          
          setTotalOrders(data.totalOrders || data.orders.length);
          setTotalPages(data.totalPages || Math.ceil(data.orders.length / ordersPerPage));
          setHasMore(data.orders.length > 0 && currentPage < data.totalPages);
        } else {
          console.error("Unexpected response format:", data);
          if (currentPage === 1) {
            setOrders([]);
          }
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error fetching orders:", error);
        if (currentPage === 1) {
          setOrders([]);
        }
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [currentPage, ordersPerPage, phoneSearch, statusFilter, networkFilter, startDate, endDate]);

  // Setup Intersection Observer for infinite scrolling
  useEffect(() => {
    if (loading || !hasMore) return;
    
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setCurrentPage(prevPage => prevPage + 1);
      }
    }, { threshold: 0.5 });
    
    if (lastOrderElementRef.current) {
      observerRef.current.observe(lastOrderElementRef.current);
    }
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loading, hasMore]);

  const updateOrderStatus = async (orderId, newStatus) => {
    const authToken = localStorage.getItem("authToken");
    if (!authToken) {
      alert("Unauthorized access!");
      return;
    }

    try {
      const res = await fetch(`https://datanest-lkyu.onrender.com/api/orders/${orderId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          'x-auth-token': authToken
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setOrders((prevOrders) =>
          prevOrders.map((order) =>
            (order.id === orderId || order.geonetReference === orderId) ? { ...order, status: newStatus } : order
          )
        );
        alert(`Order ${orderId} updated successfully!`);
      } else {
        console.error("Failed to update order");
        alert("Failed to update order. Please try again.");
      }
    } catch (error) {
      console.error("Error updating order:", error);
      alert("Error updating order. Please try again.");
    }
  };

  const toggleOrderSelection = (orderId) => {
    setSelectedOrders(prev => {
      if (prev.includes(orderId)) {
        return prev.filter(id => id !== orderId);
      } else {
        return [...prev, orderId];
      }
    });
  };

  const handleBulkUpdate = async () => {
    if (!bulkStatus || selectedOrders.length === 0) {
      alert("Please select orders and a status to update");
      return;
    }

    const authToken = localStorage.getItem("authToken");
    if (!authToken) {
      alert("Unauthorized access!");
      return;
    }

    try {
      let successfulUpdates = 0;
      let failedUpdates = 0;
      
      for (const orderId of selectedOrders) {
        try {
          const res = await fetch(`https://datanest-lkyu.onrender.com/api/orders/${orderId}/status`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              'x-auth-token': authToken
            },
            body: JSON.stringify({ status: bulkStatus }),
          });
          
          if (res.ok) {
            successfulUpdates++;
          } else {
            failedUpdates++;
            console.error(`Failed to update order ${orderId}`, await res.text());
          }
        } catch (error) {
          failedUpdates++;
          console.error(`Error updating order ${orderId}:`, error);
        }
      }
      
      if (successfulUpdates > 0) {
        setOrders(prevOrders => 
          prevOrders.map(order => {
            if (selectedOrders.includes(order.id) || 
                selectedOrders.includes(order.geonetReference)) {
              return { ...order, status: bulkStatus };
            }
            return order;
          })
        );
      }
      
      if (failedUpdates === 0) {
        alert(`Successfully updated all ${successfulUpdates} orders!`);
      } else {
        alert(`Updated ${successfulUpdates} orders. ${failedUpdates} orders failed to update.`);
      }
      
      setSelectedOrders([]);
      setBulkStatus("");
      
      if (failedUpdates > 0) {
        setCurrentPage(1);
        setLoading(true);
      }
    } catch (error) {
      console.error("Error performing bulk update:", error);
      alert("Error updating orders. Please try again.");
    }
  };

  const setTodayFilter = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayString = today.toISOString().split('T')[0];
    setStartDate(todayString);
    setEndDate(todayString);
    setCurrentPage(1);
  };

  const resetFilters = () => {
    setStartDate("");
    setEndDate("");
    setPhoneSearch("");
    setReferenceSearch("");
    setCapacityFilter("");
    setStatusFilter("");
    setNetworkFilter("");
    setCurrentPage(1);
  };
  
  const clearPhoneSearch = () => {
    setPhoneSearch("");
    setCurrentPage(1);
  };
  
  const clearReferenceSearch = () => {
    setReferenceSearch("");
    setCurrentPage(1);
  };

  const handleOrdersPerPageChange = (e) => {
    const value = parseInt(e.target.value);
    setOrdersPerPage(value);
    setCurrentPage(1);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'processing':
        return 'bg-purple-100 text-purple-800';
      case 'waiting':
        return 'bg-orange-100 text-orange-800';
      case 'shipped':
        return 'bg-blue-100 text-blue-800';
      case 'delivered':
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 bg-gray-900 dark:bg-gray-900 min-h-screen text-white">
      <h1 className="text-3xl font-bold text-white mb-6">Admin Orders</h1>
      
      {/* Filters and Bulk Actions */}
      <div className="bg-gray-800 dark:bg-gray-800 rounded-lg shadow-md p-4 mb-6 border border-gray-700">
        <div className="flex flex-col space-y-4">
          {/* Filters Row */}
          <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-4 flex-wrap">
            {/* Phone Number Search */}
            <div className="flex items-center relative">
              <label htmlFor="phoneSearch" className="mr-2 text-gray-200 text-sm">Phone:</label>
              <input
                type="text"
                id="phoneSearch"
                value={phoneSearch}
                onChange={(e) => {
                  setPhoneSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search all orders"
                className="border border-gray-600 bg-gray-700 text-white rounded-md px-3 py-2 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
              />
              {phoneSearch && (
                <button 
                  onClick={clearPhoneSearch}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  title="Clear phone search"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Status Filter */}
            <div className="flex items-center">
              <label htmlFor="statusFilter" className="mr-2 text-gray-200 text-sm">Status:</label>
              <select
                id="statusFilter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="border border-gray-600 bg-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="waiting">Waiting</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
                <option value="shipped">Shipped</option>
                <option value="delivered">Delivered</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            
            {/* Network Filter */}
            <div className="flex items-center">
              <label htmlFor="networkFilter" className="mr-2 text-gray-200 text-sm">Network:</label>
              <select
                id="networkFilter"
                value={networkFilter}
                onChange={(e) => {
                  setNetworkFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="border border-gray-600 bg-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All</option>
                <option value="telecel">Telecel</option>
                <option value="yellow">Yellow</option>
                <option value="mtn">MTN</option>
                <option value="vodafone">Vodafone</option>
              </select>
            </div>
            
            <button
              onClick={resetFilters}
              className="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-md border border-gray-600"
            >
              Reset
            </button>
          </div>
          
          {/* Date Filter */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center">
              <label htmlFor="startDate" className="mr-2 text-gray-200 text-sm">From:</label>
              <input
                type="date"
                id="startDate"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="border border-gray-600 bg-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex items-center">
              <label htmlFor="endDate" className="mr-2 text-gray-200 text-sm">To:</label>
              <input
                type="date"
                id="endDate"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="border border-gray-600 bg-gray-700 text-white rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <button
              onClick={setTodayFilter}
              className="px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-md"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Results summary */}
      <div className="mb-4 text-gray-300 text-sm">
        Showing {filteredOrders.length} orders (Total: {totalOrders})
      </div>

      {loading && currentPage === 1 ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <span className="ml-3 text-lg text-gray-700">Loading...</span>
        </div>
      ) : (
        <>
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <p className="text-gray-500 text-lg">No orders found</p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg shadow-md overflow-hidden border border-gray-700">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700 text-sm">
                  <thead className="bg-gray-900 sticky top-0 z-10 border-b border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Ref</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Buyer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Capacity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Price</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Network</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Phone</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {filteredOrders.map((order, index) => {
                      const isLastElement = index === filteredOrders.length - 1;
                      const orderId = order.geonetReference || order.id;
                      
                      return (
                        <tr 
                          key={orderId} 
                          className="hover:bg-gray-700 bg-gray-800"
                          ref={isLastElement ? lastOrderElementRef : null}
                        >
                          <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-100">
                            {orderId}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-300">
                            {order.userId?.name || 'Unknown'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-300">
                            {order.capacity}GB
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-300">
                            GHS{order.price?.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-300">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-300">
                            {order.network}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-300">
                            {order.phoneNumber}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {loading && currentPage > 1 && (
                <div className="flex justify-center items-center p-4 bg-gray-900 border-t border-gray-700">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
                  <span className="ml-3 text-gray-300">Loading more...</span>
                </div>
              )}
              
              {!hasMore && filteredOrders.length > 0 && (
                <div className="p-4 text-center text-gray-400 bg-gray-900 text-sm border-t border-gray-700">
                  All orders loaded
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminOrders;