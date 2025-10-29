// ========================================
// FIXED DEPOSIT ROUTES - AMOUNT VERIFICATION
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

// ========== VALIDATION UTILITIES ==========
function validateAmountCalculation(depositAmount, totalWithFee) {
  const deposit = parseFloat(depositAmount);
  const total = parseFloat(totalWithFee);
  
  if (isNaN(deposit) || isNaN(total)) {
    return { valid: false, error: 'Invalid amount format' };
  }
  
  // Calculate expected total: deposit + (deposit * 0.03)
  const expectedTotal = deposit * 1.03;
  
  // Allow 0.01 GHS tolerance for rounding differences
  const tolerance = 0.01;
  const difference = Math.abs(total - expectedTotal);
  
  if (difference > tolerance) {
    return { 
      valid: false, 
      error: `Amount mismatch. Expected GHS ${expectedTotal.toFixed(2)}, got GHS ${total.toFixed(2)}`,
      deposited: deposit,
      expected: expectedTotal,
      provided: total
    };
  }
  
  return { valid: true };
}

// ========== FRAUD MONITORING ==========
async function flagFraudActivity(userId, amount, paystackAmount) {
  const flags = [];
  
  // Check if Paystack amount matches transaction amount
  const expectedPaystackAmount = Math.round(parseFloat(amount) * 1.03 * 100);
  if (Math.abs(paystackAmount - expectedPaystackAmount) > 50) { // 50 pesewas tolerance
    flags.push(`Amount mismatch - Charged ${(paystackAmount / 100).toFixed(2)}, Expected ${(expectedPaystackAmount / 100).toFixed(2)}`);
  }
  
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
async function processSuccessfulPayment(reference, paystackData = null) {
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
        message: 'Transaction not found or already processed',
        code: 'TRANSACTION_NOT_FOUND'
      };
    }

    // CRITICAL: Verify amount charged by Paystack matches expected
    if (paystackData) {
      const paystackAmount = paystackData.amount; // in pesewas
      const expectedAmount = Math.round(transaction.amount * 1.03 * 100);
      
      // Allow 50 pesewas tolerance
      if (Math.abs(paystackAmount - expectedAmount) > 50) {
        await session.abortTransaction();
        session.endSession();
        
        console.error(`❌ FRAUD PREVENTED: Amount mismatch for reference ${reference}`);
        console.error(`Expected: ${expectedAmount} pesewas, Charged: ${paystackAmount} pesewas`);
        
        // Flag this as fraud attempt
        await TransactionAudit.create([{
          userId: transaction.userId,
          transactionType: 'deposit',
          amount: transaction.amount,
          status: 'failed',
          paymentMethod: 'paystack',
          paystackReference: reference,
          description: `FRAUD ATTEMPT: Amount mismatch. Expected ${(expectedAmount/100).toFixed(2)}, charged ${(paystackAmount/100).toFixed(2)}`,
          initiatedBy: 'system'
        }], { session });
        
        return { 
          success: false, 
          message: 'Payment amount verification failed. Please contact support.',
          code: 'AMOUNT_MISMATCH'
        };
      }
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
    const fraudFlags = await flagFraudActivity(transaction.userId, transaction.amount, paystackData?.amount);
    if (fraudFlags.length > 0) {
      transaction.metadata.fraudFlags = fraudFlags;
      console.warn(`⚠️ FRAUD ALERT: User ${transaction.userId} - ${fraudFlags.join(', ')}`);
    }
    
    await transaction.save({ session });

    // Credit user with verified amount
    const balanceBefore = user.walletBalance;
    user.walletBalance += transaction.amount;
    await user.save({ session });

    // Update TransactionAudit
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
      { new: true, session }
    );

    // Fallback if audit not found
    if (!auditUpdate) {
      const fallbackAudit = await TransactionAudit.findOneAndUpdate(
        {
          userId: transaction.userId,
          transactionType: 'deposit',
          status: 'pending',
          createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
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
        { new: true, session, sort: { createdAt: -1 } }
      );

      if (!fallbackAudit) {
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

// ========== INITIATE DEPOSIT (FIXED) ==========
router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount, totalAmountWithFee, email, ipAddress, userAgent } = req.body;

    // Input validation
    if (!userId || !amount || !totalAmountWithFee) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: userId, amount, totalAmountWithFee' 
      });
    }

    const parsedAmount = parseFloat(amount);
    const parsedTotal = parseFloat(totalAmountWithFee);

    // CRITICAL FIX: Validate amount calculation on server-side
    const amountValidation = validateAmountCalculation(parsedAmount, parsedTotal);
    if (!amountValidation.valid) {
      console.warn(`❌ FRAUD ATTEMPT: Invalid amount calculation - ${amountValidation.error}`);
      return res.status(400).json({ 
        success: false,
        error: amountValidation.error,
        code: 'INVALID_AMOUNT_CALCULATION'
      });
    }

    // Amount range validation
    if (parsedAmount < 1 || parsedAmount > 100000) {
      return res.status(400).json({ 
        success: false,
        error: 'Deposit amount must be between GHS 1 and GHS 100,000' 
      });
    }

    // User validation
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

    // Generate unique reference
    const reference = `DEP-${crypto.randomBytes(10).toString('hex')}-${Date.now()}`;

    // Create pending transaction with validated amounts
    const transaction = new Transaction({
      userId,
      type: 'deposit',
      amount: parsedAmount,
      status: 'pending',
      reference,
      gateway: 'paystack',
      metadata: {
        ipAddress: ipAddress || 'unknown',
        userAgent: userAgent || 'unknown',
        depositAmount: parsedAmount,
        totalWithFee: parsedTotal,
        feePercentage: 3
      }
    });

    await transaction.save();

    // Create audit entry
    const auditEntry = new TransactionAudit({
      userId,
      transactionType: 'deposit',
      amount: parsedAmount,
      balanceBefore: user.walletBalance,
      balanceAfter: user.walletBalance,
      paymentMethod: 'paystack',
      paystackReference: reference,
      status: 'pending',
      description: `Deposit initiated: GHS ${parsedAmount}`,
      initiatedBy: 'user',
      ipAddress: ipAddress || 'unknown'
    });

    await auditEntry.save();

    // Calculate Paystack amount in pesewas (must use totalAmountWithFee)
    const paystackAmount = Math.round(parsedTotal * 100);

    // Initialize with Paystack
    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: email || user.email,
        amount: paystackAmount,
        currency: 'GHS',
        reference,
        callback_url: `https://www.datanestgh.com/payment/callback?reference=${reference}`,
        metadata: {
          depositAmount: parsedAmount,
          totalWithFee: parsedTotal,
          userId
        }
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
      reference,
      amount: parsedAmount,
      total: parsedTotal
    });

  } catch (error) {
    console.error('Deposit Error:', error);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// ========== PAYSTACK WEBHOOK HANDLER (FIXED) ==========
router.post('/paystack/webhook', async (req, res) => {
  try {
    console.log('📩 Webhook received:', {
      event: req.body.event,
      reference: req.body.data?.reference,
      amount: req.body.data?.amount
    });

    const secret = PAYSTACK_SECRET_KEY;
    const hash = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    // Verify signature
    if (hash !== req.headers['x-paystack-signature']) {
      console.error('❌ Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    // Handle successful charge
    if (event.event === 'charge.success') {
      const { reference, amount } = event.data;
      console.log(`✅ Paystack verified payment: ${reference}, Amount: ${amount}`);

      // Pass Paystack data for verification
      const result = await processSuccessfulPayment(reference, event.data);
      
      if (result.success) {
        return res.json({ 
          message: result.message,
          amount: result.amount,
          newBalance: result.newBalance
        });
      } else {
        return res.status(400).json({
          message: result.message,
          code: result.code
        });
      }
    } else {
      console.log(`Event: ${event.event}`);
      return res.json({ message: 'Event received' });
    }

  } catch (error) {
    console.error('❌ Webhook Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== VERIFY PAYMENT (FIXED) ==========
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

        // If Paystack says success
        if (data.status === 'success') {
          const result = await processSuccessfulPayment(reference, data);
          
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
              code: result.code,
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

// ========== REMAINING ROUTES UNCHANGED ==========
router.get('/user-transactions/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }
    
    const filter = { userId, type: 'deposit' };
    if (status) filter.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
      
    const totalCount = await Transaction.countDocuments(filter);
    const auditEntries = await TransactionAudit.find({ userId, transactionType: 'deposit' })
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
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/verify-pending-transaction/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    const transaction = await Transaction.findById(transactionId);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
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
        const result = await processSuccessfulPayment(transaction.reference, data);
        
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
            code: result.code,
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
      return res.status(500).json({ success: false, error: 'Failed to verify with Paystack' });
    }
    
  } catch (error) {
    console.error('Verify Pending Transaction Error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

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
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;