import React from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, BarChart3, Wallet, Zap, ChevronRight, Plus } from 'lucide-react';
import { getEnabledFinanceApps, type FinanceApp } from '../types/finance';

const iconMap: Record<string, React.ReactNode> = {
  TrendingUp: <TrendingUp size={28} />,
  BarChart3: <BarChart3 size={28} />,
  Wallet: <Wallet size={28} />,
  Zap: <Zap size={28} />,
};

const FinancePage: React.FC = () => {
  const navigate = useNavigate();
  const apps = getEnabledFinanceApps();

  const handleAppClick = (app: FinanceApp) => {
    navigate(app.route);
  };

  return (
    <div
      className="flex flex-col h-full w-full overflow-hidden"
      style={{
        backgroundColor: 'var(--chatty-bg)',
        color: 'var(--chatty-text)',
      }}
    >
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">Finance</h1>
            <p className="opacity-70">
              Trading analytics, market insights, and portfolio management
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div
              className="col-span-1 lg:col-span-2 rounded-xl p-6"
              style={{
                background:
                  'linear-gradient(135deg, #10B981 0%, #059669 100%)',
              }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">
                    Welcome to Finance Hub
                  </h2>
                  <p className="text-white/80 text-sm mb-4">
                    Connect your trading accounts, view real-time analytics, and
                    get AI-powered insights to improve your trading performance.
                  </p>
                  <button
                    onClick={() => navigate('/app/finance/fxshinobi')}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      backgroundColor: 'white',
                      color: '#059669',
                    }}
                  >
                    Open FXShinobi Dashboard
                  </button>
                </div>
                <TrendingUp size={48} className="text-white/30" />
              </div>
            </div>

            <div
              className="rounded-xl p-6"
              style={{
                backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                border: '1px solid var(--chatty-border)',
              }}
            >
              <h3 className="font-semibold mb-3">Quick Stats</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="opacity-70 text-sm">Today's P&L</span>
                  <span className="text-green-500 font-medium">+$247.50</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-70 text-sm">Open Positions</span>
                  <span className="font-medium">3</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="opacity-70 text-sm">Win Rate (30d)</span>
                  <span className="font-medium">68%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Finance Apps</h2>
              <button
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm opacity-50 cursor-not-allowed"
                style={{
                  border: '1px solid var(--chatty-border)',
                }}
                disabled
              >
                <Plus size={16} />
                Add Integration
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {apps.map((app) => (
                <button
                  key={app.id}
                  onClick={() => handleAppClick(app)}
                  className="flex items-start gap-4 p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
                  style={{
                    backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
                    border: '1px solid var(--chatty-border)',
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: '#10B981',
                      color: 'white',
                    }}
                  >
                    {iconMap[app.icon] || <TrendingUp size={28} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{app.name}</h3>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: '#10B981',
                          color: 'white',
                        }}
                      >
                        {app.category}
                      </span>
                    </div>
                    <p className="text-sm opacity-70 mt-1">{app.description}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs opacity-50">
                      <span>v{app.version}</span>
                      {app.author && <span>by {app.author}</span>}
                    </div>
                  </div>
                  <ChevronRight size={20} className="opacity-50 flex-shrink-0" />
                </button>
              ))}

              <div
                className="flex items-center justify-center p-6 rounded-xl border-2 border-dashed opacity-50"
                style={{
                  borderColor: 'var(--chatty-border)',
                }}
              >
                <div className="text-center">
                  <Plus size={24} className="mx-auto mb-2" />
                  <p className="text-sm">More integrations coming soon</p>
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-xl p-6"
            style={{
              backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
              border: '1px solid var(--chatty-border)',
            }}
          >
            <h2 className="text-lg font-semibold mb-4">Connected Services</h2>
            <div className="text-center py-8 opacity-50">
              <Wallet size={32} className="mx-auto mb-2" />
              <p className="text-sm">No services connected yet</p>
              <p className="text-xs mt-1">
                Connect your broker or trading platform to get started
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FinancePage;
