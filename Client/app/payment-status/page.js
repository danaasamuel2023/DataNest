'use client'
import React, { Suspense, useState } from 'react';
import { CheckCircle, X, Clock, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

// Resource wrapper for Suspense
const createPaymentResource = (reference) => {
  let status = 'pending';
  let result = null;
  let promise = null;

  const fetchPayment = async () => {
    try {
      const response = await fetch(
        `https://datanest-lkyu.onrender.com/api/v1/data/paystack-status/${reference}`
      );

      if (!response.ok) {
        throw new Error('Payment verification failed');
      }

      const data = await response.json();

      if (data.status === 'success') {
        if (data.data.isCompleted || data.data.status === 'completed') {
          status = 'success';
          result = data.data;
        } else if (data.data.status === 'pending') {
          status = 'processing';
          result = data.data;
          // Retry after 2 seconds
          await new Promise(resolve => setTimeout(resolve, 2000));
          return fetchPayment();
        } else if (data.data.status === 'failed') {
          status = 'failed';
          result = data.data;
        } else {
          status = 'processing';
          result = data.data;
        }
      } else {
        throw new Error(data.message || 'Verification failed');
      }

      return result;
    } catch (err) {
      status = 'error';
      throw err;
    }
  };

  return {
    read() {
      if (status === 'pending') {
        if (!promise) {
          promise = fetchPayment();
        }
        throw promise;
      } else if (status === 'error') {
        throw result;
      } else {
        return { status, data: result };
      }
    },
  };
};

// Suspense Fallback
const LoadingFallback = () => (
  <div className="min-h-screen bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900 dark:to-amber-800 flex items-center justify-center p-4">
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-amber-200 dark:border-amber-700 max-w-md w-full p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="relative w-20 h-20">
          <div className="w-20 h-20 rounded-full border-4 border-amber-200 dark:border-amber-700"></div>
          <div className="absolute top-0 w-20 h-20 rounded-full border-4 border-transparent border-t-amber-500 animate-spin"></div>
        </div>
      </div>
      <h1 className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-2">
        Processing Payment...
      </h1>
      <p className="text-amber-700 dark:text-amber-300 font-semibold mb-6">
        Verifying your payment with Paystack
      </p>
      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4 border border-amber-200 dark:border-amber-700">
        <div className="flex items-start">
          <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-3 mt-0.5 flex-shrink-0" strokeWidth={2} />
          <p className="text-amber-800 dark:text-amber-300 text-sm font-medium">
            Please do not close this page.
          </p>
        </div>
      </div>
    </div>
  </div>
);

// Success Component
const SuccessView = ({ data, onBackHome, onCheckHistory }) => (
  <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900 dark:to-emerald-800 flex items-center justify-center p-4">
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-emerald-200 dark:border-emerald-700 max-w-md w-full p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 bg-emerald-100 dark:bg-emerald-900/30 rounded-full animate-pulse"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <CheckCircle className="w-16 h-16 text-emerald-600 dark:text-emerald-400" strokeWidth={1.5} />
          </div>
        </div>
      </div>

      <h1 className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-2">
        Payment Successful! ✅
      </h1>
      <p className="text-emerald-700 dark:text-emerald-300 text-lg font-semibold mb-6">
        Your data bundle has been delivered
      </p>

      <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-5 mb-6 border border-emerald-200 dark:border-emerald-700 space-y-3 text-left">
        <div className="flex justify-between">
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">Data Bundle:</span>
          <span className="text-emerald-900 dark:text-emerald-100 font-bold">{data.capacity}GB</span>
        </div>
        <div className="flex justify-between">
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">Network:</span>
          <span className="text-emerald-900 dark:text-emerald-100 font-bold">{data.network}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">Phone:</span>
          <span className="text-emerald-900 dark:text-emerald-100 font-bold">{data.phoneNumber}</span>
        </div>
        <div className="flex justify-between border-t border-emerald-200 dark:border-emerald-600 pt-3">
          <span className="text-emerald-700 dark:text-emerald-300 font-medium">Amount Paid:</span>
          <span className="text-emerald-900 dark:text-emerald-100 font-bold">GH₵{data.price}</span>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-6 border border-blue-200 dark:border-blue-700">
        <p className="text-blue-800 dark:text-blue-300 text-sm font-medium">
          Your data will be available on your phone within a few minutes.
        </p>
      </div>

      <div className="flex flex-col space-y-3">
        <button
          onClick={onBackHome}
          className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center"
        >
          Back to Home
          <ArrowRight className="w-5 h-5 ml-2" strokeWidth={2} />
        </button>
        <button
          onClick={onCheckHistory}
          className="w-full py-3 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold rounded-xl transition-all"
        >
          View Purchase History
        </button>
      </div>
    </div>
  </div>
);

// Failed Component
const FailedView = ({ data, reference, onRetry, onBackHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900 dark:to-red-800 flex items-center justify-center p-4">
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-red-200 dark:border-red-700 max-w-md w-full p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border-2 border-red-200 dark:border-red-700">
          <X className="w-12 h-12 text-red-600 dark:text-red-400" strokeWidth={2} />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-red-900 dark:text-red-100 mb-2">
        Payment Failed
      </h1>
      <p className="text-red-700 dark:text-red-300 font-semibold mb-6">
        We couldn't verify your payment
      </p>

      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-5 mb-6 border border-red-200 dark:border-red-700 text-left">
        <p className="text-red-700 dark:text-red-300 text-sm font-medium mb-2">
          <strong>Reference:</strong> {reference}
        </p>
        <p className="text-red-700 dark:text-red-300 text-sm font-medium">
          <strong>Status:</strong> {data?.status || 'Failed'}
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-6 border border-blue-200 dark:border-blue-700">
        <p className="text-blue-800 dark:text-blue-300 text-sm font-medium">
          Your payment was not processed. No charges were made. Please try again.
        </p>
      </div>

      <div className="flex flex-col space-y-3">
        <button
          onClick={onRetry}
          className="w-full py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl"
        >
          Retry Payment
        </button>
        <button
          onClick={onBackHome}
          className="w-full py-3 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold rounded-xl transition-all"
        >
          Back to Home
        </button>
      </div>
    </div>
  </div>
);

// Error Component
const ErrorView = ({ error, reference, onRetry, onBackHome }) => (
  <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900 dark:to-red-800 flex items-center justify-center p-4">
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-red-200 dark:border-red-700 max-w-md w-full p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center border-2 border-red-200 dark:border-red-700">
          <AlertTriangle className="w-12 h-12 text-red-600 dark:text-red-400" strokeWidth={2} />
        </div>
      </div>

      <h1 className="text-2xl font-bold text-red-900 dark:text-red-100 mb-2">
        Verification Error
      </h1>
      <p className="text-red-700 dark:text-red-300 font-semibold mb-6">
        {error || 'Unable to verify payment'}
      </p>

      <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4 mb-6 border border-red-200 dark:border-red-700">
        <p className="text-red-700 dark:text-red-300 text-sm font-medium">
          {reference && `Reference: ${reference}`}
        </p>
      </div>

      <div className="flex flex-col space-y-3">
        <button
          onClick={onRetry}
          className="w-full py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center"
        >
          <RefreshCw className="w-5 h-5 mr-2" strokeWidth={2} />
          Try Again
        </button>
        <button
          onClick={onBackHome}
          className="w-full py-3 px-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white font-semibold rounded-xl transition-all"
        >
          Back to Home
        </button>
      </div>
    </div>
  </div>
);

// Content Component (reads from resource)
const PaymentContent = ({ resource, reference, onRetry, onBackHome, onCheckHistory }) => {
  const { status, data } = resource.read();

  if (status === 'success') {
    return <SuccessView data={data} onBackHome={onBackHome} onCheckHistory={onCheckHistory} />;
  }

  if (status === 'failed') {
    return <FailedView data={data} reference={reference} onRetry={onRetry} onBackHome={onBackHome} />;
  }

  return <ErrorView error="Unexpected state" reference={reference} onRetry={onRetry} onBackHome={onBackHome} />;
};

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorView
          error={this.state.error?.message || 'Verification failed'}
          reference={this.props.reference}
          onRetry={this.props.onRetry}
          onBackHome={this.props.onBackHome}
        />
      );
    }

    return this.props.children;
  }
}

// Main Component
const PaymentVerification = () => {
  const [retryKey, setRetryKey] = useState(0);
  const reference = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('reference');

  const handleRetry = () => {
    setRetryKey(prev => prev + 1);
  };

  const handleBackHome = () => {
    window.location.href = '/';
  };

  const handleCheckHistory = () => {
    window.location.href = '/purchase-history';
  };

  if (!reference) {
    return <ErrorView error="No payment reference found" reference="" onRetry={() => {}} onBackHome={handleBackHome} />;
  }

  const resource = createPaymentResource(reference);

  return (
    <ErrorBoundary reference={reference} onRetry={handleRetry} onBackHome={handleBackHome}>
      <Suspense fallback={<LoadingFallback />}>
        <PaymentContent
          key={retryKey}
          resource={resource}
          reference={reference}
          onRetry={handleRetry}
          onBackHome={handleBackHome}
          onCheckHistory={handleCheckHistory}
        />
      </Suspense>
    </ErrorBoundary>
  );
};

export default PaymentVerification;