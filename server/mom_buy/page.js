const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { User, DataPurchase, Transaction, DataInventory } = require('../schema/schema');
const dotenv = require('dotenv');

dotenv.config();

// PAYSTACK CONFIG
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_live_c22b76acfc5242f80ce7d155992b657fcf3cfb0e';
const PAYSTACK_PUBLIC = process.env.PAYSTACK_PUBLIC_KEY || 'pk_live_your_key';

// Create Paystack client
const paystackClient = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    'Authorization': `Bearer ${PAYSTACK_SECRET}`,
    'Content-Type': 'application/json'
  }
});

// Create DataMart client (for processing orders)
const datamartClient = axios.create({
  baseURL: 'https://api.datamartgh.shop',
  headers: {
    'x-api-key': process.env.DATAMART_API_KEY || 'fce9ddc503af13fa0b1eecea73b5127879256b62217ab997fe84f2fa46804e96',
    'Content-Type': 'application/json'
  }
});

// Enhanced logging
const logOperation = (operation, data) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${operation}]`, JSON.stringify(data, null, 2));
};

// ===== HELPER FUNCTIONS =====

// Map network to DataMart format
const mapNetworkToDatamart = (networkType) => {
  const network = networkType.toUpperCase();
  const networkMap = {
    'TELECEL': 'TELECEL',
    'MTN': 'YELLO',
    'YELLO': 'YELLO',
    'AIRTEL': 'at',
    'AT': 'at',
    'AT_PREMIUM': 'at',
    'AIRTELTIGO': 'at',
    'TIGO': 'at'
  };
  return networkMap[network] || network.toLowerCase();
};

// Official pricing
const OFFICIAL_PRICING = {
  'YELLO': {
    '1': 4.50, '2': 9.20, '3': 13.50, '4': 18.50, '5': 24.50,
    '6': 28.00, '8': 38.50, '10': 46.50, '15': 66.50, '20': 88.00,
    '25': 112.00, '30': 137.00, '40': 169.00, '50': 210.00, '100': 420.00
  },
  'at': {
    '1': 3.95, '2': 8.35, '3': 13.25, '4': 16.50, '5': 19.50,
    '6': 23.50, '8': 30.50, '10': 38.50, '12': 45.50, '15': 57.50,
    '25': 95.00, '30': 115.00, '40': 151.00, '50': 190.00
  },
  'AT_PREMIUM': {
    '1': 3.95, '2': 8.35, '3': 13.25, '4': 16.50, '5': 19.50,
    '6': 23.50, '8': 30.50, '10': 38.50, '12': 45.50, '15': 57.50,
    '25': 95.00, '30': 115.00, '40': 151.00, '50': 190.00
  },
  'TELECEL': {
    '5': 19.50, '8': 34.64, '10': 37.50, '12': 44.70, '15': 55.85,
    '20': 72.80, '25': 89.75, '30': 109.70, '35': 129.65, '40': 139.60,
    '45': 159.55, '50': 179.50, '100': 349.00
  }
};

// Validate price
const validatePrice = (network, capacity, submittedPrice, userId, phoneNumber) => {
  const capacityStr = capacity.toString();
  
  if (!OFFICIAL_PRICING[network]) {
    return { isValid: false, message: 'Invalid network selected', code: 'INVALID_NETWORK' };
  }

  const officialPrice = OFFICIAL_PRICING[network][capacityStr];
  
  if (officialPrice === undefined) {
    return {
      isValid: false,
      message: `Invalid data capacity for ${network}`,
      code: 'INVALID_CAPACITY'
    };
  }

  const submittedPriceFloat = parseFloat(submittedPrice);
  const tolerance = 0.01;
  
  if (Math.abs(submittedPriceFloat - officialPrice) > tolerance) {
    logOperation('PRICE_MISMATCH', {
      network, capacity: capacityStr, submittedPrice: submittedPriceFloat, officialPrice
    });
    return { isValid: false, message: 'Invalid price', code: 'PRICE_MISMATCH' };
  }

  return { isValid: true, validatedPrice: officialPrice, message: 'Price valid' };
};

// Validate phone number
const validatePhoneNumber = (network, phoneNumber) => {
  const cleanNumber = phoneNumber.replace(/[\s-]/g, '');
  
  const mtnPrefixes = ['024', '054', '055', '059', '026', '025', '053', '027', '057', '023', '020', '050'];
  const airtelTigoPrefixes = ['026', '056', '027', '057', '023', '053'];
  const telecelPrefixes = ['020', '050'];

  switch (network) {
    case 'YELLO':
      if (cleanNumber.length === 10 && cleanNumber.startsWith('0')) {
        const prefix = cleanNumber.substring(0, 3);
        if (mtnPrefixes.includes(prefix)) {
          return { isValid: true, message: '' };
        }
      }
      return { isValid: false, message: 'Invalid MTN number' };
      
    case 'at':
    case 'AT_PREMIUM':
      if (cleanNumber.length === 10 && cleanNumber.startsWith('0')) {
        const prefix = cleanNumber.substring(0, 3);
        if (airtelTigoPrefixes.includes(prefix)) {
          return { isValid: true, message: '' };
        }
      }
      return { isValid: false, message: 'Invalid AirtelTigo number' };
      
    case 'TELECEL':
      if (cleanNumber.length === 10 && cleanNumber.startsWith('0')) {
        const prefix = cleanNumber.substring(0, 3);
        if (telecelPrefixes.includes(prefix)) {
          return { isValid: true, message: '' };
        }
      }
      return { isValid: false, message: 'Invalid Telecel number' };
      
    default:
      return { isValid: false, message: 'Unsupported network' };
  }
};

// Generate reference
const generateMixedReference = (prefix = '') => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  let reference = prefix;
  
  for (let i = 0; i < 2; i++) {
    reference += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  for (let i = 0; i < 4; i++) {
    reference += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  for (let i = 0; i < 2; i++) {
    reference += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  return reference;
};

// ========== PAYSTACK INITIALIZE ==========
router.post('/paystack-initialize', async (req, res) => {
  try {
    const { email, phoneNumber, network, capacity, price, userId = null } = req.body;

    logOperation('PAYSTACK_INITIALIZE', { email, phoneNumber, network, capacity, price });

    if (!email || !phoneNumber || !network || !capacity || !price) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields'
      });
    }

    // Validate price
    const priceValidation = validatePrice(network, capacity, price, userId || 'guest', phoneNumber);
    if (!priceValidation.isValid) {
      return res.status(400).json({
        status: 'error',
        message: priceValidation.message
      });
    }

    // Validate phone
    const phoneValidation = validatePhoneNumber(network, phoneNumber);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        status: 'error',
        message: phoneValidation.message
      });
    }

    const validatedPrice = priceValidation.validatedPrice;
    const transactionReference = `TRX-${uuidv4()}`;
    const orderReference = generateMixedReference('PS-');

    // Create pending purchase
    const dataPurchase = new DataPurchase({
      email: email,
      userId: userId || null,
      phoneNumber: phoneNumber,
      network: network,
      capacity: capacity,
      gateway: 'paystack',
      method: 'web',
      price: validatedPrice,
      status: 'pending',
      geonetReference: orderReference,
      paystackReference: transactionReference,
      paystackStatus: 'pending'
    });

    await dataPurchase.save();

    logOperation('PAYSTACK_PENDING_PURCHASE_CREATED', {
      purchaseId: dataPurchase._id,
      reference: transactionReference
    });

    // Initialize Paystack
    const paystackPayload = {
      email: email,
      amount: Math.round(validatedPrice * 100),
      reference: transactionReference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL || 'https://www.datanestgh.com/payment-status',
      metadata: {
        phoneNumber: phoneNumber,
        network: network,
        capacity: capacity,
        orderReference: orderReference,
        purchaseId: dataPurchase._id.toString(),
        userId: userId || null
      }
    };

    const paystackResponse = await paystackClient.post('/transaction/initialize', paystackPayload);

    if (!paystackResponse.data?.status || !paystackResponse.data?.data?.authorization_url) {
      return res.status(400).json({
        status: 'error',
        message: 'Failed to initialize payment'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment initialization successful',
      data: {
        paymentUrl: paystackResponse.data.data.authorization_url,
        reference: transactionReference,
        purchaseId: dataPurchase._id,
        amount: validatedPrice
      }
    });

  } catch (error) {
    logOperation('PAYSTACK_INIT_ERROR', {
      message: error.message,
      response: error.response?.data
    });

    res.status(500).json({
      status: 'error',
      message: 'Payment initialization failed'
    });
  }
});

// ========== PAYSTACK WEBHOOK ==========
router.post('/paystack-webhook', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const signature = req.headers['x-paystack-signature'];
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      logOperation('WEBHOOK_INVALID_SIGNATURE', { received: signature });
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body.event;
    const data = req.body.data;

    logOperation('WEBHOOK_RECEIVED', { event, reference: data?.reference });

    if (event !== 'charge.success') {
      return res.status(200).json({ status: 'ok' });
    }

    const transactionReference = data.reference;
    const amountInNaira = data.amount / 100;

    // Find purchase
    const dataPurchase = await DataPurchase.findOne({
      paystackReference: transactionReference
    }).session(session);

    if (!dataPurchase) {
      logOperation('WEBHOOK_PURCHASE_NOT_FOUND', { reference: transactionReference });
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ status: 'ok' });
    }

    // Verify amount
    if (Math.abs(amountInNaira - dataPurchase.price) > 0.01) {
      dataPurchase.status = 'failed';
      dataPurchase.paystackStatus = 'failed';
      dataPurchase.failureReason = 'Amount mismatch';
      await dataPurchase.save({ session });
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ status: 'ok' });
    }

    // Check inventory
    const inventory = await DataInventory.findOne({
      network: dataPurchase.network
    }).session(session);

    if (inventory && !inventory.inStock) {
      dataPurchase.status = 'failed';
      dataPurchase.paystackStatus = 'failed';
      dataPurchase.failureReason = 'Out of stock';
      await dataPurchase.save({ session });
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ status: 'ok' });
    }

    // Process data bundle
    let orderResponse = null;
    let apiOrderId = null;
    const orderReference = dataPurchase.geonetReference;

    try {
      const datamartNetwork = mapNetworkToDatamart(dataPurchase.network);
      const datamartPayload = {
        phoneNumber: dataPurchase.phoneNumber,
        network: datamartNetwork,
        capacity: dataPurchase.capacity.toString(),
        gateway: 'paystack',
        ref: orderReference
      };

      const datamartResponse = await datamartClient.post(
        '/api/developer/purchase',
        datamartPayload
      );

      orderResponse = datamartResponse.data;

      if (!orderResponse?.status || orderResponse.status !== 'success') {
        throw new Error(orderResponse?.message || 'API processing failed');
      }

      apiOrderId = orderResponse.data?.purchaseId || orderReference;

    } catch (processError) {
      logOperation('WEBHOOK_PROCESSING_ERROR', { error: processError.message });

      dataPurchase.status = 'failed';
      dataPurchase.paystackStatus = 'verified_but_bundle_failed';
      dataPurchase.failureReason = `Bundle processing failed: ${processError.message}`;
      await dataPurchase.save({ session });
      await session.abortTransaction();
      session.endSession();
      return res.status(200).json({ status: 'ok' });
    }

    // Create transaction
    const transaction = new Transaction({
      userId: dataPurchase.userId,
      type: 'purchase',
      amount: dataPurchase.price,
      status: 'completed',
      reference: transactionReference,
      gateway: 'paystack',
      description: `Data: ${dataPurchase.capacity}GB ${dataPurchase.network}`,
      paystackReference: transactionReference,
      paystackCustomerId: data.customer?.id
    });

    // Update purchase
    dataPurchase.status = 'completed';
    dataPurchase.apiOrderId = apiOrderId;
    dataPurchase.apiResponse = orderResponse;
    dataPurchase.processingMethod = 'datamart_api';
    dataPurchase.paystackStatus = 'verified';
    dataPurchase.paystackAmount = amountInNaira;
    dataPurchase.paystackCustomerId = data.customer?.id;
    dataPurchase.completedAt = new Date();

    transaction.relatedPurchaseId = dataPurchase._id;

    await transaction.save({ session });
    await dataPurchase.save({ session });

    if (dataPurchase.userId) {
      const user = await User.findById(dataPurchase.userId).session(session);
      if (user) {
        await user.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    logOperation('WEBHOOK_SUCCESS_COMPLETED', {
      purchaseId: dataPurchase._id,
      reference: transactionReference,
      bundleDelivered: true
    });

    res.status(200).json({ status: 'ok' });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    logOperation('WEBHOOK_ERROR', {
      message: error.message,
      stack: error.stack
    });

    res.status(200).json({ status: 'ok' });
  }
});

// ========== VERIFY PAYMENT WITH PAYSTACK ==========
router.get('/paystack-status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    // ===== 1. VERIFY WITH PAYSTACK FIRST =====
    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const { status: paymentSuccessful, data: paymentData } = paystackResponse.data;

    // ===== 2. CHECK IF PAYSTACK SAYS IT'S SUCCESSFUL =====
    if (!paymentSuccessful || paymentData.status !== 'success') {
      return res.status(400).json({
        status: 'failed',
        message: 'Payment not successful on Paystack',
        paystackStatus: paymentData.status,
      });
    }

    // ===== 3. FIND IN DATABASE =====
    let dataPurchase = await DataPurchase.findOne({
      paystackReference: reference
    });

    if (!dataPurchase) {
      // Payment was successful on Paystack but we don't have it in DB
      // This means the webhook failed - UPDATE IT NOW
      logOperation('WEBHOOK_FAILED', { 
        reference, 
        amount: paymentData.amount,
        message: 'Payment successful on Paystack but not in DB' 
      });

      // Find the pending order and update it
      dataPurchase = await DataPurchase.findOneAndUpdate(
        { paystackReference: reference },
        {
          status: 'completed',
          paystackReference: reference,
          paystackData: paymentData,
          completedAt: new Date(),
        },
        { new: true }
      );

      if (!dataPurchase) {
        return res.status(404).json({
          status: 'error',
          message: 'Purchase not found in system'
        });
      }
    }

    // ===== 4. VERIFY AMOUNT MATCHES =====
    const expectedAmount = dataPurchase.price * 100; // Convert to kobo
    if (paymentData.amount !== expectedAmount) {
      logOperation('AMOUNT_MISMATCH', {
        reference,
        paystackAmount: paymentData.amount,
        expectedAmount,
        message: 'FRAUD ALERT: Amount mismatch'
      });

      return res.status(400).json({
        status: 'failed',
        message: 'Amount mismatch - possible fraud',
      });
    }

    // ===== 5. CHECK IF ALREADY COMPLETED =====
    if (dataPurchase.status === 'completed') {
      return res.json({
        status: 'success',
        data: {
          purchaseId: dataPurchase._id,
          status: 'completed',
          network: dataPurchase.network,
          capacity: dataPurchase.capacity,
          phoneNumber: dataPurchase.phoneNumber.substring(0, 3) + 'XXXXXXX',
          price: dataPurchase.price,
          isCompleted: true,
          completedAt: dataPurchase.completedAt,
        }
      });
    }

    // ===== 6. MARK AS COMPLETED & SEND DATA =====
    dataPurchase.status = 'completed';
    dataPurchase.completedAt = new Date();
    dataPurchase.paystackData = paymentData;
    await dataPurchase.save();

    // Send data bundle to user
    try {
      await sendDataBundle(
        dataPurchase.phoneNumber,
        dataPurchase.network,
        dataPurchase.capacity
      );
    } catch (sendError) {
      logOperation('SEND_DATA_ERROR', {
        reference,
        error: sendError.message
      });
      // Data sending failed but payment was successful - mark for retry
      dataPurchase.status = 'pending_retry';
      await dataPurchase.save();
    }

    // ===== 7. RETURN VERIFIED DATA =====
    res.json({
      status: 'success',
      data: {
        purchaseId: dataPurchase._id,
        status: dataPurchase.status,
        network: dataPurchase.network,
        capacity: dataPurchase.capacity,
        phoneNumber: dataPurchase.phoneNumber.substring(0, 3) + 'XXXXXXX',
        price: dataPurchase.price,
        isCompleted: dataPurchase.status === 'completed',
        completedAt: dataPurchase.completedAt,
        paystackVerified: true,
      }
    });

  } catch (error) {
    logOperation('PAYSTACK_VERIFICATION_ERROR', {
      reference: req.params.reference,
      message: error.message,
      errorCode: error.response?.status,
    });

    res.status(500).json({
      status: 'error',
      message: 'Failed to verify payment with Paystack',
      error: error.message,
    });
  }
});

module.exports = router;