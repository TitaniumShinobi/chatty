import React, { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, Mail, ArrowRight } from 'lucide-react';

const EmailVerification: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const status = searchParams.get('verify');
  const message = searchParams.get('message');

  useEffect(() => {
    // Auto-redirect to app after 5 seconds for success
    if (status === 'success') {
      const timer = setTimeout(() => {
        navigate('/app');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status, navigate]);

  const handleContinue = () => {
    navigate('/app');
  };

  const handleRetry = () => {
    navigate('/');
  };

  if (status === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            {/* Success Icon */}
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            
            {/* Success Message */}
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Email Verified! 🎉
            </h1>
            
            <p className="text-gray-600 mb-6">
              {message || 'Your email has been successfully verified. You can now access all features of Chatty.'}
            </p>
            
            {/* Features Unlocked */}
            <div className="bg-green-50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-green-800 mb-2">What's unlocked:</h3>
              <ul className="text-sm text-green-700 space-y-1">
                <li>• Full access to all conversations</li>
                <li>• Data export capabilities</li>
                <li>• Account security features</li>
                <li>• Priority support</li>
              </ul>
            </div>
            
            {/* Continue Button */}
            <button
              onClick={handleContinue}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Continue to Chatty
              <ArrowRight className="w-4 h-4" />
            </button>
            
            <p className="text-xs text-gray-500 mt-4">
              Redirecting automatically in 5 seconds...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-rose-100">
        <div className="max-w-md w-full mx-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            {/* Error Icon */}
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            
            {/* Error Message */}
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              Verification Failed
            </h1>
            
            <p className="text-gray-600 mb-6">
              {message || 'There was an issue verifying your email address. This could be due to an expired or invalid verification link.'}
            </p>
            
            {/* Common Issues */}
            <div className="bg-red-50 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-red-800 mb-2">Common causes:</h3>
              <ul className="text-sm text-red-700 space-y-1">
                <li>• Verification link has expired (24 hours)</li>
                <li>• Link was already used</li>
                <li>• Invalid or corrupted link</li>
                <li>• Account already verified</li>
              </ul>
            </div>
            
            {/* Action Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleRetry}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                Request New Verification Email
              </button>
              
              <button
                onClick={() => navigate('/')}
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                Back to Login
              </button>
            </div>
            
            <p className="text-xs text-gray-500 mt-4">
              Need help? Contact support at info@thewreck.org
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default state (no status parameter)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-6">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Email Verification
          </h1>
          
          <p className="text-gray-600 mb-6">
            Please check your email for a verification link. Click the link to verify your account.
          </p>
          
          <button
            onClick={() => navigate('/')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            Back to Login
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;

