// ==================== UPDATED ADMIN ROUTES WITH TRANSACTION AUDIT ====================
// Replace your entire admin routes file with this updated version

const express = require('express');
const router = express.Router();
const { User, DataPurchase, Transaction, ReferralBonus, DataInventory, TransactionAudit } = require('../schema/schema');
const mongoose = require('mongoose');
const auth = require('../middlewareUser/middleware');
const adminAuth = require('../adminMiddleware/middleware');
const axios = require('axios');
const PAYSTACK_SECRET_KEY = 'sk_live_0fba72fb9c4fc71200d2e0cdbb4f2b37c1de396c';
const ARKESEL_API_KEY = 'QkNhS0l2ZUZNeUdweEtmYVRUREg';

// ==================== SMS HELPER FUNCTION ====================
const sendSMS = async (phoneNumber, message, options = {}) => {
  const {
    scheduleTime = null,
    useCase = null,
    senderID = 'Bundle'
  } = options;

  if (!phoneNumber || !message) {
    throw new Error('Phone number and message are required');
  }

  const params = {
    action: 'send-sms',
    api_key: ARKESEL_API_KEY,
    to: phoneNumber,
    from: senderID,
    sms: message
  };

  if (scheduleTime) {
    params.schedule = scheduleTime;
  }

  if (useCase && ['promotional', 'transactional'].includes(useCase)) {
    params.use_case = useCase;
  }

  if (phoneNumber.startsWith('234') && !useCase) {
    params.use_case = 'transactional';
  }

  try {
    const response = await axios.get('https://sms.arkesel.com/sms/api', {
      params,
      timeout: 10000
    });

    const errorCodes = {
      '100': 'Bad gateway request',
      '101': 'Wrong action',
      '102': 'Authentication failed',
      '103': 'Invalid phone number',
      '104': 'Phone coverage not active',
      '105': 'Insufficient balance',
      '106': 'Invalid Sender ID',
      '109': 'Invalid Schedule Time',
      '111': 'SMS contains spam word. Wait for approval'
    };

    if (response.data.code !== 'ok') {
      const errorMessage = errorCodes[response.data.code] || 'Unknown error occurred';
      throw new Error(`SMS sending failed: ${errorMessage}`);
    }

    console.log('SMS sent successfully:', {
      to: phoneNumber,
      status: response.data.code,
      balance: response.data.balance
    });

    return {
      success: true,
      data: response.data
    };

  } catch (error) {
    console.error('SMS error:', error.message);
    return {
      success: false,
      error: {
        message: error.message,
        code: error.response?.data?.code,
        details: error.response?.data
      }
    };
  }
};

// ==================== GET ALL USERS ====================
router.get('/users', auth, adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    
    const searchQuery = search 
      ? { 
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phoneNumber: { $regex: search, $options: 'i' } },
            { referralCode: { $regex: search, $options: 'i' } }
          ] 
        } 
      : {};
    
    const users = await User.find(searchQuery)
      .select('-password')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await User.countDocuments(searchQuery);
    
    res.json({
      users,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalUsers: total
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== GET USER BY ID ====================
router.get('/users/:id', auth, adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== UPDATE USER DETAILS ====================
router.put('/users/:id', auth, adminAuth, async (req, res) => {
  try {
    const { name, email, phoneNumber, role, walletBalance, referralCode } = req.body;
    
    const userFields = {};
    if (name) userFields.name = name;
    if (email) userFields.email = email;
    if (phoneNumber) userFields.phoneNumber = phoneNumber;
    if (role) userFields.role = role;
    if (walletBalance !== undefined) userFields.walletBalance = walletBalance;
    if (referralCode) userFields.referralCode = referralCode;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: userFields },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== ADD MONEY (UPDATED WITH AUDIT) ====================
router.put('/users/:id/add-money', auth, adminAuth, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ msg: 'Please provide a valid amount' });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const user = await User.findById(req.params.id).session(session);
      
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ msg: 'User not found' });
      }
      
      const balanceBefore = user.walletBalance;
      user.walletBalance += parseFloat(amount);
      await user.save({ session });
      
      // Create Transaction record
      const transaction = new Transaction({
        userId: user._id,
        type: 'deposit',
        amount: parseFloat(amount),
        status: 'completed',
        reference: `ADMIN-DEPOSIT-${Date.now()}`,
        gateway: 'admin-deposit'
      });
      
      await transaction.save({ session });
      
      // Create TransactionAudit record
      const auditEntry = new TransactionAudit({
        userId: user._id,
        transactionType: 'admin-credit',
        amount: parseFloat(amount),
        balanceBefore,
        balanceAfter: user.walletBalance,
        paymentMethod: 'admin',
        status: 'completed',
        description: reason || `Admin credit: GHS ${amount}`,
        initiatedBy: 'admin',
        adminId: req.user.id,
        relatedOrderId: null
      });
      
      await auditEntry.save({ session });
      
      await session.commitTransaction();
      session.endSession();
      
      res.json({
        success: true,
        msg: `Successfully added GHS${amount} to ${user.name}'s wallet`,
        data: {
          currentBalance: user.walletBalance,
          previousBalance: balanceBefore,
          amount: parseFloat(amount),
          transactionId: transaction._id,
          auditId: auditEntry._id
        }
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== DEDUCT MONEY (UPDATED WITH AUDIT) ====================
router.put('/users/:id/deduct-money', auth, adminAuth, async (req, res) => {
  try {
    const { amount, reason } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ msg: 'Please provide a valid amount' });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const user = await User.findById(req.params.id).session(session);
      
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ msg: 'User not found' });
      }
      
      if (user.walletBalance < parseFloat(amount)) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ 
          msg: 'Insufficient balance', 
          currentBalance: user.walletBalance,
          requestedDeduction: parseFloat(amount)
        });
      }
      
      const balanceBefore = user.walletBalance;
      user.walletBalance -= parseFloat(amount);
      await user.save({ session });
      
      // Create Transaction record
      const transaction = new Transaction({
        userId: user._id,
        type: 'withdrawal',
        amount: parseFloat(amount),
        status: 'completed',
        reference: `ADMIN-DEDUCT-${Date.now()}`,
        gateway: 'admin-deduction'
      });
      
      await transaction.save({ session });
      
      // Create TransactionAudit record
      const auditEntry = new TransactionAudit({
        userId: user._id,
        transactionType: 'admin-deduction',
        amount: parseFloat(amount),
        balanceBefore,
        balanceAfter: user.walletBalance,
        paymentMethod: 'admin',
        status: 'completed',
        description: reason || `Admin deduction: GHS ${amount}`,
        initiatedBy: 'admin',
        adminId: req.user.id,
        relatedOrderId: null
      });
      
      await auditEntry.save({ session });
      
      // Send SMS notification
      try {
        if (user.phoneNumber) {
          const formattedPhone = user.phoneNumber.replace(/^\+/, '');
          const message = `DATAMART: GHS${amount.toFixed(2)} has been deducted from your wallet. Your new balance is GHS${user.walletBalance.toFixed(2)}. Reason: ${reason || 'Administrative adjustment'}.`;
          
          await sendSMS(formattedPhone, message, {
            useCase: 'transactional',
            senderID: 'Bundle'
          });
        }
      } catch (smsError) {
        console.error('Failed to send deduction SMS:', smsError.message);
      }
      
      await session.commitTransaction();
      session.endSession();
      
      res.json({
        success: true,
        msg: `Successfully deducted GHS${amount} from ${user.name}'s wallet`,
        data: {
          currentBalance: user.walletBalance,
          previousBalance: balanceBefore,
          amount: parseFloat(amount),
          transactionId: transaction._id,
          auditId: auditEntry._id
        }
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== DELETE USER ====================
router.delete('/users/:id', auth, adminAuth, async (req, res) => {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const user = await User.findById(req.params.id).session(session);
      
      if (!user) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ msg: 'User not found' });
      }
      
      await Transaction.deleteMany({ userId: req.params.id }).session(session);
      await DataPurchase.deleteMany({ userId: req.params.id }).session(session);
      await ReferralBonus.deleteMany({ 
        $or: [
          { userId: req.params.id },
          { referredUserId: req.params.id }
        ]
      }).session(session);
      
      await User.findByIdAndDelete(req.params.id).session(session);
      
      await session.commitTransaction();
      session.endSession();
      
      res.json({ msg: 'User and related data deleted' });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== NEW AUDIT ROUTES ====================

// ROUTE 1: TODAY'S TRANSACTIONS
router.get('/today-transactions', auth, adminAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayTransactions = await TransactionAudit.find({
      createdAt: { $gte: today, $lt: tomorrow }
    })
    .populate('userId', 'name email phoneNumber walletBalance')
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 });

    const summary = {
      totalTransactions: todayTransactions.length,
      totalAmount: 0,
      byType: {},
      byStatus: {},
      byPaymentMethod: {},
      transactions: []
    };

    todayTransactions.forEach(txn => {
      summary.totalAmount += txn.amount;

      if (!summary.byType[txn.transactionType]) {
        summary.byType[txn.transactionType] = { count: 0, total: 0 };
      }
      summary.byType[txn.transactionType].count += 1;
      summary.byType[txn.transactionType].total += txn.amount;

      if (!summary.byStatus[txn.status]) {
        summary.byStatus[txn.status] = { count: 0, total: 0 };
      }
      summary.byStatus[txn.status].count += 1;
      summary.byStatus[txn.status].total += txn.amount;

      if (!summary.byPaymentMethod[txn.paymentMethod]) {
        summary.byPaymentMethod[txn.paymentMethod] = { count: 0, total: 0 };
      }
      summary.byPaymentMethod[txn.paymentMethod].count += 1;
      summary.byPaymentMethod[txn.paymentMethod].total += txn.amount;
    });

    summary.transactions = todayTransactions.map(txn => ({
      id: txn._id,
      user: {
        id: txn.userId?._id,
        name: txn.userId?.name || 'Unknown',
        email: txn.userId?.email,
        phone: txn.userId?.phoneNumber
      },
      type: txn.transactionType,
      amount: txn.amount,
      balanceBefore: txn.balanceBefore,
      balanceAfter: txn.balanceAfter,
      paymentMethod: txn.paymentMethod,
      paystackReference: txn.paystackReference || 'N/A',
      status: txn.status,
      description: txn.description,
      initiatedBy: txn.initiatedBy,
      timestamp: txn.createdAt,
      admin: txn.adminId ? txn.adminId.name : 'System'
    }));

    res.json({
      status: 'success',
      data: {
        date: today.toISOString().split('T')[0],
        summary,
        transactions: summary.transactions
      }
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch today\'s transactions',
      details: error.message
    });
  }
});

// ROUTE 2: USER AUDIT TRAIL
router.get('/user-audit/:userId', auth, adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 50, page = 1, status } = req.query;

    const filter = { userId };
    if (status) {
      filter.status = status;
    }

    const auditTrail = await TransactionAudit.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await TransactionAudit.countDocuments(filter);

    const balanceProgression = auditTrail.map(txn => ({
      id: txn._id,
      timestamp: txn.createdAt,
      type: txn.transactionType,
      amount: txn.amount,
      balanceBefore: txn.balanceBefore,
      balanceAfter: txn.balanceAfter,
      change: txn.balanceAfter - txn.balanceBefore,
      status: txn.status,
      paymentMethod: txn.paymentMethod,
      paystackRef: txn.paystackReference,
      description: txn.description,
      initiatedBy: txn.initiatedBy
    }));

    res.json({
      status: 'success',
      data: {
        auditTrail: balanceProgression,
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(total / Number(limit)),
          total
        }
      }
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch audit trail',
      details: error.message
    });
  }
});

// ROUTE 3: SUSPICIOUS ACCOUNTS
router.get('/suspicious-accounts', auth, adminAuth, async (req, res) => {
  try {
    const suspiciousUsers = await User.aggregate([
      { $match: { walletBalance: { $gt: 0 } } },
      {
        $lookup: {
          from: 'transactionaudits',
          localField: '_id',
          foreignField: 'userId',
          as: 'transactions'
        }
      },
      {
        $addFields: {
          depositTransactions: {
            $filter: {
              input: '$transactions',
              as: 'txn',
              cond: {
                $and: [
                  { $eq: ['$$txn.transactionType', 'deposit'] },
                  { $eq: ['$$txn.status', 'completed'] }
                ]
              }
            }
          }
        }
      },
      {
        $match: {
          $expr: { $eq: [{ $size: '$depositTransactions' }, 0] },
          walletBalance: { $gt: 0 }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          phoneNumber: 1,
          walletBalance: 1,
          createdAt: 1,
          transactionCount: { $size: '$transactions' }
        }
      },
      { $sort: { walletBalance: -1 } }
    ]);

    res.json({
      status: 'success',
      data: {
        message: 'Accounts with balance but no verified deposits',
        count: suspiciousUsers.length,
        accounts: suspiciousUsers,
        warning: suspiciousUsers.length > 0 ? `Found ${suspiciousUsers.length} suspicious accounts that need review` : 'No suspicious accounts found'
      }
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch suspicious accounts',
      details: error.message
    });
  }
});

// ROUTE 4: TRANSACTION STATISTICS
router.get('/transaction-stats', auth, adminAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const typeStats = await TransactionAudit.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$transactionType',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    const statusStats = await TransactionAudit.aggregate([
      {
        $match: {
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          total: { $sum: '$amount' }
        }
      }
    ]);

    res.json({
      status: 'success',
      data: {
        date: today.toISOString().split('T')[0],
        byType: typeStats,
        byStatus: statusStats
      }
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch transaction stats',
      details: error.message
    });
  }
});

// ==================== EXISTING ORDERS ROUTES ====================

// GET ALL ORDERS
router.get('/orders', auth, adminAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 100, 
      status = '',
      network = '',
      startDate = '',
      endDate = '',
      phoneNumber = ''
    } = req.query;
    
    const filter = {};
    
    if (status) filter.status = status;
    if (network) filter.network = network;
    if (phoneNumber) filter.phoneNumber = { $regex: phoneNumber };
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        filter.createdAt.$lte = endDateObj;
      }
    }
    
    const orders = await DataPurchase.find(filter)
      .populate('userId', 'name email phoneNumber')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await DataPurchase.countDocuments(filter);
    
    const revenue = await DataPurchase.aggregate([
      { $match: filter },
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    
    res.json({
      orders,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalOrders: total,
      totalRevenue: revenue.length > 0 ? revenue[0].total : 0
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// UPDATE ORDER STATUS
router.put('/orders/:id/status', auth, adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;
    
    if (!['pending', 'waiting', 'processing', 'failed', 'shipped', 'delivered', 'completed'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid status value' });
    }
    
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      let order = await DataPurchase.findOne({ geonetReference: orderId })
        .populate('userId', 'name email phoneNumber walletBalance')
        .session(session);
      
      if (!order && mongoose.Types.ObjectId.isValid(orderId)) {
        order = await DataPurchase.findById(orderId)
          .populate('userId', 'name email phoneNumber walletBalance')
          .session(session);
      }
      
      if (!order) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ msg: `Order with ID/Reference ${orderId} not found` });
      }
      
      const previousStatus = order.status;
      
      console.log(`Order ${orderId} status change: ${previousStatus} -> ${status} by admin ${req.user.id}`);
      
      if (status === 'failed' && previousStatus !== 'failed') {
        const user = await User.findById(order.userId._id).session(session);
        
        if (user) {
          user.walletBalance += order.price;
          await user.save({ session });
          
          const transaction = new Transaction({
            userId: user._id,
            type: 'refund',
            amount: order.price,
            status: 'completed',
            reference: `REFUND-${order._id}-${Date.now()}`,
            gateway: 'wallet-refund'
          });
          
          await transaction.save({ session });
          
          console.log(`Refunded ${order.price} to user ${user._id} for order ${order._id}`);
          
          try {
            if (user.phoneNumber) {
              const userPhone = user.phoneNumber.replace(/^\+/, '');
              const refundMessage = `DATAMART: Your order for ${order.capacity}GB ${order.network} data bundle (Ref: ${order.geonetReference}) could not be processed. Your account has been refunded with GHS${order.price.toFixed(2)}.`;
              
              await sendSMS(userPhone, refundMessage, {
                useCase: 'transactional',
                senderID: 'Bundle'
              });
            }
          } catch (smsError) {
            console.error('Failed to send refund SMS:', smsError.message);
          }
        }
      }
      
      order.status = status;
      order.processedBy = req.user.id;
      order.updatedAt = Date.now();
      
      if (!order.statusHistory) {
        order.statusHistory = [];
      }
      
      order.statusHistory.push({
        status,
        changedAt: new Date(),
        changedBy: req.user.id,
        previousStatus
      });
      
      await order.save({ session });
      
      await session.commitTransaction();
      session.endSession();
      
      res.json({
        success: true,
        msg: 'Order status updated successfully',
        order: {
          id: order._id,
          geonetReference: order.geonetReference,
          status: order.status,
          previousStatus,
          updatedAt: order.updatedAt
        }
      });
    } catch (txError) {
      await session.abortTransaction();
      session.endSession();
      throw txError;
    }
  } catch (err) {
    console.error(`Error updating order ${req.params.id} status:`, err.message);
    res.status(500).json({ 
      success: false,
      msg: 'Server Error while updating order status',
      error: err.message
    });
  }
});

// BULK UPDATE ORDERS
router.post('/orders/bulk-status-update', auth, adminAuth, async (req, res) => {
  try {
    const { orderIds, status } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ msg: 'Please provide an array of order IDs' });
    }
    
    if (!status || !['pending', 'waiting', 'processing', 'failed', 'shipped', 'delivered', 'completed'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid status value' });
    }
    
    const results = {
      success: [],
      failed: [],
      notFound: []
    };
    
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < orderIds.length; i += batchSize) {
      batches.push(orderIds.slice(i, i + batchSize));
    }
    
    for (const batch of batches) {
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        for (const orderId of batch) {
          let order = await DataPurchase.findOne({ geonetReference: orderId })
            .session(session);
          
          if (!order && mongoose.Types.ObjectId.isValid(orderId)) {
            order = await DataPurchase.findById(orderId)
              .session(session);
          }
          
          if (!order) {
            results.notFound.push(orderId);
            continue;
          }
          
          const previousStatus = order.status;
          
          if (previousStatus === status) {
            results.success.push({
              id: order._id,
              geonetReference: order.geonetReference,
              status,
              message: 'Status already set (no change needed)'
            });
            continue;
          }
          
          if (status === 'failed' && previousStatus !== 'failed') {
            try {
              const user = await User.findById(order.userId).session(session);
              
              if (user) {
                user.walletBalance += order.price;
                await user.save({ session });
                
                const transaction = new Transaction({
                  userId: user._id,
                  type: 'refund',
                  amount: order.price,
                  status: 'completed',
                  reference: `REFUND-${order._id}-${Date.now()}`,
                  gateway: 'wallet-refund'
                });
                
                await transaction.save({ session });
              }
            } catch (refundError) {
              console.error(`Refund error for order ${orderId}:`, refundError.message);
              results.failed.push({
                id: order._id,
                geonetReference: order.geonetReference,
                error: 'Refund processing failed'
              });
              continue;
            }
          }
          
          order.status = status;
          order.processedBy = req.user.id;
          order.updatedAt = Date.now();
          
          if (!order.statusHistory) {
            order.statusHistory = [];
          }
          
          order.statusHistory.push({
            status,
            changedAt: new Date(),
            changedBy: req.user.id,
            previousStatus
          });
          
          await order.save({ session });
          
          results.success.push({
            id: order._id,
            geonetReference: order.geonetReference,
            previousStatus,
            status
          });
        }
        
        await session.commitTransaction();
        session.endSession();
      } catch (batchError) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error processing batch:', batchError.message);
        
        batch.forEach(orderId => {
          if (!results.success.some(s => s.id.toString() === orderId || s.geonetReference === orderId) && 
              !results.notFound.includes(orderId)) {
            results.failed.push({
              id: orderId,
              error: 'Batch transaction error'
            });
          }
        });
      }
    }
    
    res.json({
      msg: `Bulk update processed. Success: ${results.success.length}, Failed: ${results.failed.length}, Not Found: ${results.notFound.length}`,
      results
    });
  } catch (err) {
    console.error('Bulk update error:', err.message);
    res.status(500).json({ 
      success: false,
      msg: 'Server Error during bulk update',
      error: err.message
    });
  }
});

// ==================== INVENTORY ROUTES ====================

router.put('/inventory/:network/toggle', auth, adminAuth, async (req, res) => {
  try {
    const { network } = req.params;
    
    let inventoryItem = await DataInventory.findOne({ network });
    
    if (!inventoryItem) {
      inventoryItem = new DataInventory({
        network,
        inStock: false,
        skipGeonettech: false
      });
    } else {
      inventoryItem.inStock = !inventoryItem.inStock;
      inventoryItem.updatedAt = Date.now();
    }
    
    await inventoryItem.save();
    
    res.json({ 
      network: inventoryItem.network, 
      inStock: inventoryItem.inStock,
      skipGeonettech: inventoryItem.skipGeonettech || false,
      message: `${network} is now ${inventoryItem.inStock ? 'in stock' : 'out of stock'}`
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

router.put('/inventory/:network/toggle-geonettech', auth, adminAuth, async (req, res) => {
  try {
    const { network } = req.params;
    
    let inventoryItem = await DataInventory.findOne({ network });
    
    if (!inventoryItem) {
      inventoryItem = new DataInventory({
        network,
        inStock: true,
        skipGeonettech: true
      });
    } else {
      inventoryItem.skipGeonettech = !inventoryItem.skipGeonettech;
      inventoryItem.updatedAt = Date.now();
    }
    
    await inventoryItem.save();
    
    res.json({ 
      network: inventoryItem.network, 
      inStock: inventoryItem.inStock,
      skipGeonettech: inventoryItem.skipGeonettech,
      message: `${network} Geonettech API is now ${inventoryItem.skipGeonettech ? 'disabled (orders will be pending)' : 'enabled (orders will be processed)'}`
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

router.get('/inventory', auth, adminAuth, async (req, res) => {
  try {
    const inventoryItems = await DataInventory.find({}).sort({ network: 1 });
    
    const NETWORKS = ["YELLO", "TELECEL", "AT_PREMIUM", "airteltigo", "at"];
    
    const inventory = NETWORKS.map(network => {
      const existingItem = inventoryItems.find(item => item.network === network);
      
      if (existingItem) {
        return {
          network: existingItem.network,
          inStock: existingItem.inStock,
          skipGeonettech: existingItem.skipGeonettech || false,
          updatedAt: existingItem.updatedAt
        };
      } else {
        return {
          network,
          inStock: true,
          skipGeonettech: false,
          updatedAt: null
        };
      }
    });
    
    res.json({
      inventory,
      totalNetworks: NETWORKS.length
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

router.get('/inventory/:network', auth, adminAuth, async (req, res) => {
  try {
    const { network } = req.params;
    
    const inventoryItem = await DataInventory.findOne({ network });
    
    if (!inventoryItem) {
      return res.json({
        network,
        inStock: true,
        skipGeonettech: false,
        updatedAt: null,
        message: 'Network not found in inventory - showing defaults'
      });
    }
    
    res.json({
      network: inventoryItem.network,
      inStock: inventoryItem.inStock,
      skipGeonettech: inventoryItem.skipGeonettech || false,
      updatedAt: inventoryItem.updatedAt
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== TRANSACTION ROUTES ====================

router.get('/transactions', auth, adminAuth, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      type = '',
      status = '',
      gateway = '',
      startDate = '',
      endDate = '',
      search = '',
      phoneNumber = ''
    } = req.query;
    
    const filter = {};
    
    if (type) filter.type = type;
    if (status) filter.status = status;
    if (gateway) filter.gateway = gateway;
    
    if (search) {
      if (mongoose.Types.ObjectId.isValid(search)) {
        filter.userId = search;
      } else {
        filter.reference = { $regex: search, $options: 'i' };
      }
    }

    let userIdsByPhone = [];
    if (phoneNumber) {
      const users = await User.find({
        phoneNumber: { $regex: phoneNumber, $options: 'i' }
      }).select('_id');
      
      userIdsByPhone = users.map(user => user._id);
      
      if (userIdsByPhone.length > 0) {
        filter.userId = { $in: userIdsByPhone };
      } else {
        return res.json({
          transactions: [],
          totalPages: 0,
          currentPage: parseInt(page),
          totalTransactions: 0,
          amountByType: {}
        });
      }
    }
    
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) {
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        filter.createdAt.$lte = endDateObj;
      }
    }
    
    const transactions = await Transaction.find(filter)
      .populate('userId', 'name email phoneNumber')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await Transaction.countDocuments(filter);
    
    const totalAmount = await Transaction.aggregate([
      { $match: filter },
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    const amountByType = {};
    totalAmount.forEach(item => {
      amountByType[item._id] = item.total;
    });
    
    res.json({
      transactions,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalTransactions: total,
      amountByType
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

router.get('/transactions/:id', auth, adminAuth, async (req, res) => {
  try {
    const transaction = await Transaction.findById(req.params.id)
      .populate('userId', 'name email phoneNumber');
    
    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction not found' });
    }
    
    res.json(transaction);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Transaction not found' });
    }
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

router.get('/verify-paystack/:reference', auth, adminAuth, async (req, res) => {
  try {
    const { reference } = req.params;
    
    const transaction = await Transaction.findOne({ reference })
      .populate('userId', 'name email phoneNumber');
    
    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction reference not found in database' });
    }
    
    if (transaction.gateway !== 'paystack') {
      return res.status(400).json({ 
        msg: 'This transaction was not processed through Paystack',
        transaction
      });
    }
    
    try {
      const paystackResponse = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const paystackData = paystackResponse.data;
      
      if (paystackData.status && paystackData.data.status === 'success') {
        if (transaction.status !== 'completed') {
          transaction.status = 'completed';
          transaction.metadata = {
            ...transaction.metadata,
            paystackVerification: paystackData.data
          };
          await transaction.save();
        }
        
        return res.json({
          transaction,
          paystackVerification: paystackData.data,
          verified: true,
          message: 'Payment was successfully verified on Paystack'
        });
      } else {
        if (transaction.status !== 'failed') {
          transaction.status = 'failed';
          transaction.metadata = {
            ...transaction.metadata,
            paystackVerification: paystackData.data
          };
          await transaction.save();
        }
        
        return res.json({
          transaction,
          paystackVerification: paystackData.data,
          verified: false,
          message: 'Payment verification failed on Paystack'
        });
      }
    } catch (verifyError) {
      console.error('Paystack verification error:', verifyError.message);
      return res.status(500).json({
        msg: 'Error verifying payment with Paystack',
        error: verifyError.message,
        transaction
      });
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

router.put('/transactions/:id/update-status', auth, adminAuth, async (req, res) => {
  try {
    const { status, adminNotes } = req.body;
    
    if (!['pending', 'completed', 'failed', 'processing', 'refunded'].includes(status)) {
      return res.status(400).json({ msg: 'Invalid status value' });
    }
    
    const transaction = await Transaction.findById(req.params.id);
    
    if (!transaction) {
      return res.status(404).json({ msg: 'Transaction not found' });
    }
    
    transaction.status = status;
    transaction.updatedAt = Date.now();
    
    if (adminNotes) {
      transaction.metadata = {
        ...transaction.metadata,
        adminNotes,
        updatedBy: req.user.id,
        updateDate: new Date()
      };
    }
    
    await transaction.save();
    
    res.json({
      msg: 'Transaction status updated successfully',
      transaction
    });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Transaction not found' });
    }
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

// ==================== USER MANAGEMENT ROUTES ====================

router.put('/users/:id/toggle-status', auth, adminAuth, async (req, res) => {
  try {
    const { disableReason } = req.body;
    const userId = req.params.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }
    
    const admin = await User.findById(req.user.id).select('name');
    
    user.isDisabled = !user.isDisabled;
    
    if (user.isDisabled) {
      user.disableReason = disableReason || 'Administrative action';
      user.disabledAt = new Date();
      user.disabledBy = req.user.id;
    } else {
      user.disableReason = null;
      user.disabledAt = null;
      user.enabledBy = req.user.id;
      user.enabledAt = new Date();
    }
    
    await user.save();
    
    try {
      if (user.phoneNumber) {
        const formattedPhone = user.phoneNumber.replace(/^\+/, '');
        let message;
        
        if (user.isDisabled) {
          message = `DATAMART: Your account has been disabled. Reason: ${user.disableReason}. Contact support for assistance.`;
        } else {
          message = `DATAMART: Your account has been re-enabled. You can now access all platform features. Thank you for choosing DATAMART.`;
        }
        
        await sendSMS(formattedPhone, message, {
          useCase: 'transactional',
          senderID: 'Bundle'
        });
      }
    } catch (smsError) {
      console.error('Failed to send account status SMS:', smsError.message);
    }
    
    return res.json({
      success: true,
      message: user.isDisabled ? 'User account has been disabled' : 'User account has been enabled',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        isDisabled: user.isDisabled,
        disableReason: user.disableReason,
        disabledAt: user.disabledAt,
        disabledBy: admin ? admin.name : req.user.id
      }
    });
    
  } catch (err) {
    console.error('Toggle user status error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: err.message
    });
  }
});

// ==================== DASHBOARD ROUTES ====================

router.get('/daily-summary', auth, adminAuth, async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    const startDate = new Date(date);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);
    
    const dateFilter = {
      createdAt: {
        $gte: startDate,
        $lt: endDate
      }
    };
    
    const totalOrders = await DataPurchase.countDocuments(dateFilter);
    
    const revenueAgg = await DataPurchase.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      { $group: { _id: null, totalRevenue: { $sum: '$price' } } }
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].totalRevenue : 0;
    
    const depositsAgg = await Transaction.aggregate([
      { $match: { ...dateFilter, type: 'deposit', status: 'completed' } },
      { $group: { _id: null, totalDeposits: { $sum: '$amount' } } }
    ]);
    const totalDeposits = depositsAgg.length > 0 ? depositsAgg[0].totalDeposits : 0;
    
    const capacityByNetworkAgg = await DataPurchase.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      { 
        $group: { 
          _id: {
            network: '$network',
            capacity: '$capacity'
          },
          count: { $sum: 1 },
          totalCapacity: { $sum: '$capacity' }
        }
      },
      { $sort: { '_id.network': 1, '_id.capacity': 1 } }
    ]);
    
    const capacityData = capacityByNetworkAgg.map(item => ({
      network: item._id.network,
      capacity: item._id.capacity,
      count: item.count,
      totalGB: item.totalCapacity
    }));
    
    const networkSummaryAgg = await DataPurchase.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      { 
        $group: { 
          _id: '$network',
          count: { $sum: 1 },
          totalCapacity: { $sum: '$capacity' },
          totalRevenue: { $sum: '$price' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    
    const networkSummary = networkSummaryAgg.map(item => ({
      network: item._id,
      count: item.count,
      totalGB: item.totalCapacity,
      revenue: item.totalRevenue
    }));
    
    const totalCapacityAgg = await DataPurchase.aggregate([
      { $match: { ...dateFilter, status: 'completed' } },
      { $group: { _id: null, totalGB: { $sum: '$capacity' } } }
    ]);
    const totalCapacity = totalCapacityAgg.length > 0 ? totalCapacityAgg[0].totalGB : 0;
    
    const statusSummaryAgg = await DataPurchase.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const statusSummary = statusSummaryAgg.map(item => ({
      status: item._id,
      count: item.count
    }));
    
    const uniqueCustomersAgg = await DataPurchase.aggregate([
      { $match: dateFilter },
      { $group: { _id: '$userId' } },
      { $count: 'uniqueCustomers' }
    ]);
    const uniqueCustomers = uniqueCustomersAgg.length > 0 ? uniqueCustomersAgg[0].uniqueCustomers : 0;
    
    res.json({
      date,
      summary: {
        totalOrders,
        totalRevenue,
        totalDeposits,
        totalCapacityGB: totalCapacity,
        uniqueCustomers
      },
      networkSummary,
      capacityDetails: capacityData,
      statusSummary
    });
    
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: err.message
    });
  }
});

router.get('/user-orders/:userId', auth, adminAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ msg: 'Invalid user ID' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    
    const orders = await DataPurchase.find({ userId })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await DataPurchase.countDocuments({ userId });
    
    const totalSpent = await DataPurchase.aggregate([
      { $match: { userId: mongoose.Types.ObjectId(userId), status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    
    res.json({
      orders,
      totalPages: Math.ceil(total / parseInt(limit)),
      currentPage: parseInt(page),
      totalOrders: total,
      totalSpent: totalSpent.length > 0 ? totalSpent[0].total : 0
    });
  } catch (err) {
    console.error('Error fetching user orders:', err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

router.get('/dashboard/statistics', auth, adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    
    const walletBalance = await User.aggregate([
      { $group: { _id: null, total: { $sum: '$walletBalance' } } }
    ]);
    const totalWalletBalance = walletBalance.length > 0 ? walletBalance[0].total : 0;
    
    const completedOrders = await DataPurchase.countDocuments({ status: 'completed' });
    
    const revenue = await DataPurchase.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$price' } } }
    ]);
    const totalRevenue = revenue.length > 0 ? revenue[0].total : 0;
    
    const networkStats = await DataPurchase.aggregate([
      { $match: { status: 'completed' } },
      { 
        $group: { 
          _id: '$network',
          count: { $sum: 1 },
          revenue: { $sum: '$price' }
        }
      },
      { $sort: { revenue: -1 } }
    ]);
    
    const recentOrders = await DataPurchase.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('userId', 'name email');
    
    res.json({
      userStats: {
        totalUsers,
        totalWalletBalance
      },
      orderStats: {
        totalOrders: await DataPurchase.countDocuments(),
        completedOrders,
        pendingOrders: await DataPurchase.countDocuments({ status: 'pending' }),
        failedOrders: await DataPurchase.countDocuments({ status: 'failed' })
      },
      financialStats: {
        totalRevenue,
        averageOrderValue: completedOrders > 0 ? totalRevenue / completedOrders : 0
      },
      networkStats,
      recentOrders
    });
  } catch (err) {
    console.error('Error fetching dashboard statistics:', err.message);
    res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
  }
});

module.exports = router;