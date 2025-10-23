// ========================================
// UPDATED DEPOSIT ROUTES - WITH PROPER AUDIT SYNC
// ========================================

const express = require('express');
const router = express.Router();
const { Transaction, User, TransactionAudit } = require('../schema/schema');
const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');

// Paystack configuration
const PAYSTACK_SECRET_KEY = 'sk_live_9738959346434238db2b3c5ab75cbd73f17ae48d'; 
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// ========== FRAUD MONITORING ==========
async function flagFraudActivity(userId, amount) {
  const flags = [];
  
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentDeposits = await Transaction.countDocuments({
    userId,
    type: 'deposit',
    status: 'completed',
    createdAt: { $gte: oneHourAgo }
  });
  
  if (recentDeposits >= 3) {
    flags.push('3+ deposits in 1 hour');
  }
  
  if (amount > 5000) {
    flags.push('Large amount (GHS 5000+)');
  }
  
  const user = await User.findById(userId);
  const accountAge = Date.now() - new Date(user.createdAt).getTime();
  const daysOld = accountAge / (1000 * 60 * 60 * 24);
  
  if (daysOld < 1 && amount > 500) {
    flags.push('New account + deposit > GHS 500');
  }
  
  if (daysOld < 0.007) {
    flags.push('Deposit within 10 mins of signup');
  }
  
  return flags;
}

// ========== PROCESS SUCCESSFUL PAYMENT (FIXED) ==========
async function processSuccessfulPayment(reference, paystackAmount = null) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find and lock transaction
    const transaction = await Transaction.findOneAndUpdate(
      { 
        reference, 
        status: 'pending',
        processing: { $ne: true }
      },
      { 
        $set: { 
          processing: true,
          metadata: {
            verifiedAt: new Date()
          }
        } 
      },
      { new: true, session }
    );

    if (!transaction) {
      await session.abortTransaction();
      session.endSession();
      return { 
        success: false, 
        message: 'Transaction not found or already processed' 
      };
    }

    // Get user
    const user = await User.findById(transaction.userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return { success: false, message: 'User not found' };
    }

    // Update transaction as completed
    transaction.status = 'completed';
    transaction.processing = false;
    
    // Flag for admin monitoring if suspicious
    const fraudFlags = await flagFraudActivity(transaction.userId, transaction.amount);
    if (fraudFlags.length > 0) {
      transaction.metadata.fraudFlags = fraudFlags;
      console.warn(`FRAUD ALERT: User ${transaction.userId} - ${fraudFlags.join(', ')}`);
    }
    
    await transaction.save({ session });

    // Credit user with verified amount
    const balanceBefore = user.walletBalance;
    user.walletBalance += transaction.amount;
    await user.save({ session });

    // ===== CRITICAL FIX: PROPERLY UPDATE TransactionAudit =====
    // Use findOneAndUpdate with proper error handling
    const auditUpdate = await TransactionAudit.findOneAndUpdate(
      { paystackReference: reference },
      {
        $set: {
          status: 'completed',
          balanceAfter: user.walletBalance,
          balanceBefore: balanceBefore,
          description: `Deposit completed: GHS ${transaction.amount} credited`,
          updatedAt: new Date()
        }
      },
      { 
        new: true,
        session 
      }
    );

    // If audit not found by reference, try by userId and type
    if (!auditUpdate) {
      console.warn(`Audit not found by reference: ${reference}. Attempting fallback search...`);
      
      const fallbackAudit = await TransactionAudit.findOneAndUpdate(
        {
          userId: transaction.userId,
          transactionType: 'deposit',
          status: 'pending',
          createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Within last 5 minutes
        },
        {
          $set: {
            status: 'completed',
            paystackReference: reference,
            balanceAfter: user.walletBalance,
            balanceBefore: balanceBefore,
            description: `Deposit completed: GHS ${transaction.amount} credited`,
            updatedAt: new Date()
          }
        },
        { 
          new: true,
          session,
          sort: { createdAt: -1 } // Get most recent
        }
      );

      if (!fallbackAudit) {
        console.error(`Failed to update audit for reference: ${reference}`);
        // Create new audit entry as last resort
        const newAudit = new TransactionAudit({
          userId: transaction.userId,
          transactionType: 'deposit',
          amount: transaction.amount,
          balanceBefore: balanceBefore,
          balanceAfter: user.walletBalance,
          paymentMethod: 'paystack',
          paystackReference: reference,
          status: 'completed',
          description: `Deposit completed: GHS ${transaction.amount} credited (audit recovery)`,
          initiatedBy: 'user'
        });
        await newAudit.save({ session });
      }
    }

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    console.log(`✅ DEPOSIT PROCESSED: Reference ${reference}, Amount GHS ${transaction.amount}, User ${user._id}, New Balance GHS ${user.walletBalance}`);
    return { 
      success: true, 
      message: 'Deposit successful',
      amount: transaction.amount,
      newBalance: user.walletBalance
    };

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('❌ Payment processing error:', error);
    throw error;
  }
}

// ========== INITIATE DEPOSIT ==========
router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount, totalAmountWithFee, email, ipAddress, userAgent } = req.body;

    if (!userId || !amount || amount <= 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid deposit details' 
      });
    }

    if (amount < 1 || amount > 100000) {
      return res.status(400).json({ 
        success: false,
        error: 'Deposit amount must be between GHS 1 and GHS 100,000' 
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    if (user.isDisabled) {
      return res.status(403).json({
        success: false,
        error: 'Account is disabled',
        message: 'Your account has been disabled. Deposits are not allowed.',
        disableReason: user.disableReason || 'No reason provided'
      });
    }

    const reference = `DEP-${crypto.randomBytes(10).toString('hex')}-${Date.now()}`;

    // Create pending transaction
    const transaction = new Transaction({
      userId,
      type: 'deposit',
      amount,
      status: 'pending',
      reference,
      gateway: 'paystack',
      metadata: {
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown'
      }
    });

    await transaction.save();

    // Create audit entry for deposit initiation
    const auditEntry = new TransactionAudit({
      userId,
      transactionType: 'deposit',
      amount,
      balanceBefore: user.walletBalance,
      balanceAfter: user.walletBalance,
      paymentMethod: 'paystack',
      paystackReference: reference,
      status: 'pending',
      description: `Deposit initiated: GHS ${amount}`,
      initiatedBy: 'user',
      ipAddress: ipAddress || 'unknown'
    });

    await auditEntry.save();

    // Prepare Paystack request
    const paystackAmount = totalAmountWithFee ? 
      Math.round(parseFloat(totalAmountWithFee) * 100) : 
      Math.round(parseFloat(amount) * 100);
    
    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: email || user.email,
        amount: paystackAmount,
        currency: 'GHS',
        reference,
        callback_url: `https://www.datanestgh.com/payment/callback?reference=${reference}`
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.json({
      success: true,
      message: 'Deposit initiated',
      paystackUrl: paystackResponse.data.data.authorization_url,
      reference
    });

  } catch (error) {
    console.error('Deposit Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// ========== PAYSTACK WEBHOOK HANDLER ==========
router.post('/paystack/webhook', async (req, res) => {
  try {
    console.log('📩 Webhook received:', {
      event: req.body.event,
      reference: req.body.data?.reference
    });

    const secret = PAYSTACK_SECRET_KEY;
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    // Verify Paystack signature
    if (hash !== req.headers['x-paystack-signature']) {
      console.error('❌ Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Handle successful charge
    if (event.event === 'charge.success') {
      const { reference } = event.data;
      console.log(`✅ Paystack verified payment: ${reference}`);

      const result = await processSuccessfulPayment(reference);
      return res.json({ 
        message: result.message,
        amount: result.amount 
      });
    } else {
      console.log(`Event: ${event.event}`);
      return res.json({ message: 'Event received' });
    }

  } catch (error) {
    console.error('❌ Webhook Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== VERIFY PAYMENT ==========
router.get('/verify-payment', async (req, res) => {
  try {
    const { reference } = req.query;

    if (!reference) {
      return res.status(400).json({ 
        success: false, 
        error: 'Reference is required' 
      });
    }

    const transaction = await Transaction.findOne({ reference });

    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        error: 'Transaction not found' 
      });
    }

    // If already completed
    if (transaction.status === 'completed') {
      return res.json({
        success: true,
        message: 'Payment verified and completed',
        data: {
          reference,
          amount: transaction.amount,
          status: transaction.status
        }
      });
    }

    // If pending, verify with Paystack
    if (transaction.status === 'pending') {
      try {
        const paystackResponse = await axios.get(
          `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        const { data } = paystackResponse.data;

        // If Paystack says payment successful
        if (data.status === 'success') {
          const result = await processSuccessfulPayment(reference, data.amount);
          
          if (result.success) {
            return res.json({
              success: true,
              message: 'Payment verified and credited',
              data: {
                reference,
                amount: transaction.amount,
                newBalance: result.newBalance,
                status: 'completed'
              }
            });
          } else {
            return res.json({
              success: false,
              message: result.message,
              data: {
                reference,
                amount: transaction.amount,
                status: transaction.status
              }
            });
          }
        } else {
          return res.json({
            success: false,
            message: 'Payment not yet verified on Paystack',
            data: {
              reference,
              amount: transaction.amount,
              paystackStatus: data.status
            }
          });
        }
      } catch (error) {
        console.error('Paystack verification error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to verify with Paystack'
        });
      }
    }

    return res.json({
      success: false,
      message: `Transaction status: ${transaction.status}`,
      data: {
        reference,
        amount: transaction.amount,
        status: transaction.status
      }
    });

  } catch (error) {
    console.error('Verification Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ========== GET USER DEPOSITS ==========
router.get('/user-transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID is required' 
      });
    }
    
    const filter = { userId, type: 'deposit' };
    
    if (status) {
      filter.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    const totalCount = await Transaction.countDocuments(filter);
    
    const auditEntries = await TransactionAudit.find({
      userId,
      transactionType: 'deposit'
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));
    
    return res.json({
      success: true,
      data: {
        transactions,
        auditTrail: auditEntries,
        pagination: {
          total: totalCount,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalCount / parseInt(limit))
        }
      }
    });
    
  } catch (error) {
    console.error('Get Transactions Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ========== VERIFY PENDING TRANSACTION ==========
router.post('/verify-pending-transaction/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    if (transaction.status !== 'pending') {
      return res.json({
        success: false,
        message: `Transaction is already ${transaction.status}`,
        data: {
          transactionId,
          reference: transaction.reference,
          amount: transaction.amount,
          status: transaction.status
        }
      });
    }
    
    try {
      const paystackResponse = await axios.get(
        `${PAYSTACK_BASE_URL}/transaction/verify/${transaction.reference}`,
        {
          headers: {
            Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const { data } = paystackResponse.data;
      
      if (data.status === 'success') {
        const result = await processSuccessfulPayment(transaction.reference);
        
        if (result.success) {
          return res.json({
            success: true,
            message: 'Verified and credited successfully',
            data: {
              transactionId,
              reference: transaction.reference,
              amount: transaction.amount,
              newBalance: result.newBalance,
              status: 'completed'
            }
          });
        } else {
          return res.json({
            success: false,
            message: result.message,
            data: {
              transactionId,
              reference: transaction.reference,
              amount: transaction.amount,
              status: transaction.status
            }
          });
        }
      } else if (data.status === 'failed') {
        transaction.status = 'failed';
        await transaction.save();
        
        return res.json({
          success: false,
          message: 'Payment failed on Paystack',
          data: {
            transactionId,
            reference: transaction.reference,
            amount: transaction.amount,
            status: 'failed'
          }
        });
      } else {
        return res.json({
          success: false,
          message: `Payment status on Paystack: ${data.status}`,
          data: {
            transactionId,
            reference: transaction.reference,
            amount: transaction.amount,
            status: transaction.status
          }
        });
      }
    } catch (error) {
      console.error('Paystack verification error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to verify with Paystack'
      });
    }
    
  } catch (error) {
    console.error('Verify Pending Transaction Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// ========== ADMIN: VIEW FLAGGED DEPOSITS ==========
router.get('/admin/flagged-deposits', async (req, res) => {
  try {
    const flaggedDeposits = await Transaction.find({
      type: 'deposit',
      'metadata.fraudFlags': { $exists: true, $ne: [] }
    })
    .populate('userId', 'name email phoneNumber walletBalance')
    .sort({ createdAt: -1 })
    .limit(50);

    const summary = {
      totalFlagged: flaggedDeposits.length,
      totalAmount: flaggedDeposits.reduce((sum, d) => sum + d.amount, 0),
      completed: flaggedDeposits.filter(d => d.status === 'completed').length,
      flagReasons: {}
    };

    flaggedDeposits.forEach(deposit => {
      const flags = deposit.metadata.fraudFlags || [];
      flags.forEach(flag => {
        summary.flagReasons[flag] = (summary.flagReasons[flag] || 0) + 1;
      });
    });

    res.json({
      success: true,
      data: {
        summary,
        deposits: flaggedDeposits.map(d => ({
          id: d._id,
          user: d.userId,
          amount: d.amount,
          status: d.status,
          reference: d.reference,
          flags: d.metadata.fraudFlags,
          createdAt: d.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Flagged Deposits Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router;