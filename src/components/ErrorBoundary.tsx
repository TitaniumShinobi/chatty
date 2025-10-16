// src/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Check if it's a localStorage quota error
    if (error.message.includes('QuotaExceededError') || error.message.includes('quota')) {
      console.warn('🚨 localStorage quota exceeded - this is likely causing the error');
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#ffffeb' }}>
          <div className="max-w-md mx-4 p-6 rounded-lg border" style={{ 
            backgroundColor: '#ffffd7',
            borderColor: '#E1C28B',
            color: '#4c3d1e'
          }}>
            <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
            
            {this.state.error?.message.includes('QuotaExceededError') || 
             this.state.error?.message.includes('quota') ? (
              <div>
                <p className="mb-4">
                  It looks like your browser's storage is full. This can happen when you have a lot of conversations.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      // Run emergency cleanup
                      const script = document.createElement('script');
                      script.src = '/clear-storage.js';
                      document.head.appendChild(script);
                      setTimeout(() => window.location.reload(), 2000);
                    }}
                    className="w-full p-3 rounded-lg font-medium transition-colors"
                    style={{ 
                      backgroundColor: '#dc2626',
                      color: '#fff'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#b91c1c'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#dc2626'}
                  >
                    🚨 Emergency Cleanup & Reload
                  </button>
                  
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full p-3 rounded-lg border transition-colors"
                    style={{ 
                      borderColor: '#E1C28B',
                      backgroundColor: '#feffaf',
                      color: '#4c3d1e'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
                  >
                    Try Reloading
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="mb-4">
                  An unexpected error occurred. Please try refreshing the page.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full p-3 rounded-lg border transition-colors"
                  style={{ 
                    borderColor: '#E1C28B',
                    backgroundColor: '#feffaf',
                    color: '#4c3d1e'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E1C28B'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#feffaf'}
                >
                  Refresh Page
                </button>
              </div>
            )}
            
            <details className="mt-4">
              <summary className="cursor-pointer text-sm opacity-75">
                Technical Details
              </summary>
              <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
                {this.state.error?.stack}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
