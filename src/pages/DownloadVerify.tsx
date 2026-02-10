import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Shield, Download, Phone, CheckCircle, AlertCircle } from 'lucide-react';

const DownloadVerify: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'verify' | 'success' | 'error'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (!token) {
      setError('Invalid or missing verification token. Please check your email for the correct link.');
      setStep('error');
      return;
    }
    
    // Check if token is expired (basic check)
    try {
      const tokenData = JSON.parse(atob(token.split('.')[1]));
      const now = Date.now() / 1000;
      if (tokenData.exp && tokenData.exp < now) {
        setError('This verification link has expired. Please request a new export.');
        setStep('error');
        return;
      }
    } catch (e) {
      // Token format is invalid
      setError('Invalid verification token format.');
      setStep('error');
      return;
    }
  }, [token]);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) {
      setError('Please enter a valid phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/export/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, phone })
      });

      const data = await response.json();

      if (response.ok) {
        setStep('verify');
        setCountdown(60); // 60 second countdown
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        if (data.error === 'Export not found or expired') {
          setError('This export link has expired or is invalid. Please request a new export.');
        } else if (data.error === 'Invalid token type') {
          setError('Invalid verification token. Please check your email for the correct link.');
        } else {
          setError(data.error || 'Failed to send verification code. Please try again.');
        }
      }
    } catch (error) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || code.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/export/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, phone, code })
      });

      const data = await response.json();

      if (response.ok) {
        setStep('success');
        // Automatically start download
        setTimeout(() => {
          window.location.href = `/api/export/download?token=${token}`;
        }, 2000);
      } else {
        if (data.error === 'Invalid OTP code') {
          setError('Invalid verification code. Please check the code sent to your phone and try again.');
        } else if (data.error === 'Export not found or expired') {
          setError('This export link has expired. Please request a new export.');
        } else {
          setError(data.error || 'Verification failed. Please try again.');
        }
      }
    } catch (error) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    window.location.href = `/api/export/download?token=${token}`;
  };

  if (step === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-background)' }}>
        <div className="max-w-md w-full rounded-lg shadow-lg p-6" style={{ backgroundColor: 'var(--chatty-surface)' }}>
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--chatty-text-primary)' }}>Verification Failed</h2>
            <p className="mb-4" style={{ color: 'var(--chatty-text-secondary)' }}>{error}</p>
            <button
              onClick={() => navigate('/app')}
              className="w-full py-2 px-4 rounded-lg transition-colors hover:opacity-90"
              style={{ 
                backgroundColor: 'var(--chatty-accent)', 
                color: 'var(--chatty-accent-foreground)'
              }}
            >
              Return to Chatty
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-background)' }}>
        <div className="max-w-md w-full rounded-lg shadow-lg p-6" style={{ backgroundColor: 'var(--chatty-surface)' }}>
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--chatty-text-primary)' }}>Verification Successful!</h2>
            <p className="mb-4" style={{ color: 'var(--chatty-text-secondary)' }}>Your download will start automatically...</p>
            <button
              onClick={handleDownload}
              className="w-full py-2 px-4 rounded-lg transition-colors hover:opacity-90 flex items-center justify-center gap-2"
              style={{ 
                backgroundColor: 'var(--chatty-accent)', 
                color: 'var(--chatty-accent-foreground)'
              }}
            >
              <Download className="h-4 w-4" />
              Download Now
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--chatty-background)' }}>
      <div className="max-w-md w-full rounded-lg shadow-lg p-6" style={{ backgroundColor: 'var(--chatty-surface)' }}>
        <div className="text-center mb-6">
          <Shield className="mx-auto h-12 w-12 mb-4" style={{ color: 'var(--chatty-accent)' }} />
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--chatty-text-primary)' }}>
            {step === 'phone' ? 'Verify Your Identity' : 'Enter Verification Code'}
          </h2>
          <p style={{ color: 'var(--chatty-text-secondary)' }}>
            {step === 'phone' 
              ? 'Enter your phone number to receive a verification code'
              : 'Enter the 6-digit code sent to your phone'
            }
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 border rounded-lg" style={{ 
            backgroundColor: 'var(--chatty-error-bg, #FEF2F2)', 
            borderColor: 'var(--chatty-error-border, #FECACA)' 
          }}>
            <p className="text-sm" style={{ color: 'var(--chatty-error-text, #DC2626)' }}>{error}</p>
          </div>
        )}

        {step === 'phone' ? (
          <form onSubmit={handleRequestOTP} className="space-y-4">
            <div>
              <label htmlFor="phone" className="block text-sm font-medium mb-2" style={{ color: 'var(--chatty-text-primary)' }}>
                Phone Number
              </label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4" style={{ color: 'var(--chatty-text-muted)' }} />
                <input
                  type="tel"
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1234567890"
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ 
                    backgroundColor: 'var(--chatty-surface)',
                    borderColor: 'var(--chatty-border)',
                    color: 'var(--chatty-text-primary)'
                  }}
                  required
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--chatty-text-muted)' }}>
                Include country code (e.g., +1 for US)
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:opacity-90"
              style={{ 
                backgroundColor: 'var(--chatty-accent)', 
                color: 'var(--chatty-accent-foreground)'
              }}
            >
              {loading ? 'Sending...' : 'Send Verification Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium mb-2" style={{ color: 'var(--chatty-text-primary)' }}>
                Verification Code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-center text-lg tracking-widest"
                style={{ 
                  backgroundColor: 'var(--chatty-surface)',
                  borderColor: 'var(--chatty-border)',
                  color: 'var(--chatty-text-primary)'
                }}
                maxLength={6}
                required
              />
              {countdown > 0 && (
                <p className="text-xs mt-1" style={{ color: 'var(--chatty-text-muted)' }}>
                  Resend code in {countdown} seconds
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:opacity-90"
              style={{ 
                backgroundColor: 'var(--chatty-accent)', 
                color: 'var(--chatty-accent-foreground)'
              }}
            >
              {loading ? 'Verifying...' : 'Verify & Download'}
            </button>

            {countdown === 0 && (
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="w-full py-2 px-4 rounded-lg transition-colors hover:opacity-75"
                style={{ 
                  color: 'var(--chatty-accent)',
                  backgroundColor: 'transparent'
                }}
              >
                Resend Code
              </button>
            )}
          </form>
        )}

        <div className="mt-6 p-4 border rounded-lg" style={{ 
          backgroundColor: 'var(--chatty-info-bg, #EFF6FF)', 
          borderColor: 'var(--chatty-info-border, #BFDBFE)' 
        }}>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--chatty-info-text, #1E40AF)' }}>Security Notice</h3>
          <ul className="text-xs space-y-1" style={{ color: 'var(--chatty-info-text, #1E40AF)' }}>
            <li>• This verification is required for security</li>
            <li>• Your download link expires in 24 hours</li>
            <li>• You can only download the file once</li>
            <li>• If you didn't request this export, please ignore this page</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DownloadVerify;
