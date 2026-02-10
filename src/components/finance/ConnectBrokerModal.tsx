import React, { useState, useEffect } from 'react';
import {
  X,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  Building2,
  ChevronDown,
  Key,
  User,
  Server,
} from 'lucide-react';
import { useBrokerRegistry } from '../../hooks/useFinanceData';
import type { BrokerInfo, BrokerCredentials } from '../../types/finance';

interface ConnectBrokerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  api_key: 'API Key',
  account_id: 'Account ID',
  environment: 'Environment',
  username: 'Username',
  password: 'Password',
  access_token: 'Access Token',
  secret_key: 'Secret Key',
};

const FIELD_ICONS: Record<string, React.ReactNode> = {
  api_key: <Key size={16} />,
  account_id: <User size={16} />,
  environment: <Server size={16} />,
  username: <User size={16} />,
  password: <Key size={16} />,
  access_token: <Key size={16} />,
  secret_key: <Key size={16} />,
};

export const ConnectBrokerModal: React.FC<ConnectBrokerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { brokers, activeBrokerId, loading, setActiveBroker, refetch } = useBrokerRegistry();
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Partial<BrokerCredentials>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'connect' | 'select'>('connect');

  const selectedBroker = brokers.find(b => b.id === selectedBrokerId);
  const configuredBrokers = brokers.filter(b => b.configured && b.connected);

  useEffect(() => {
    if (isOpen) {
      refetch();
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, refetch]);

  useEffect(() => {
    if (brokers.length > 0 && !selectedBrokerId) {
      setSelectedBrokerId(brokers[0].id);
    }
  }, [brokers, selectedBrokerId]);

  useEffect(() => {
    setCredentials({});
    setError(null);
    setSuccess(false);
  }, [selectedBrokerId]);

  if (!isOpen) return null;

  const handleFieldChange = (field: string, value: string) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    setError(null);
    setSuccess(false);
  };

  const handleSaveCredentials = async () => {
    if (!selectedBroker) return;

    const missingFields = selectedBroker.fields.filter(
      field => !credentials[field] || credentials[field]?.trim() === ''
    );

    if (missingFields.length > 0) {
      setError(`Please fill in: ${missingFields.map(f => FIELD_LABELS[f] || f).join(', ')}`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/vault/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          service: `broker:${selectedBroker.id}`,
          value: credentials,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save credentials');
      }

      setSuccess(true);
      await refetch();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (brokerId: string) => {
    setSaving(true);
    setError(null);
    try {
      const result = await setActiveBroker(brokerId);
      if (result) {
        setSuccess(true);
        onSuccess?.();
      } else {
        setError('Failed to set active broker');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set active broker');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (broker: BrokerInfo) => {
    if (broker.configured && broker.connected) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle size={12} />
          Connected
        </span>
      );
    } else if (broker.configured && !broker.connected) {
      return (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <XCircle size={12} />
          Error
        </span>
      );
    } else {
      return (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <XCircle size={12} />
            Not Configured
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--chatty-bg-modal, var(--chatty-bg))',
          border: '1px solid var(--chatty-border)',
        }}
      >
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--chatty-border)' }}
        >
          <div className="flex items-center gap-3">
            <Building2 size={24} className="text-blue-500" />
            <h2 className="text-lg font-semibold">Broker Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex border-b" style={{ borderColor: 'var(--chatty-border)' }}>
          <button
            onClick={() => setActiveTab('connect')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'connect'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            Connect Broker
          </button>
          <button
            onClick={() => setActiveTab('select')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              activeTab === 'select'
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            Active Broker {configuredBrokers.length > 0 && `(${configuredBrokers.length})`}
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={24} className="animate-spin opacity-50" />
            </div>
          ) : activeTab === 'connect' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 opacity-70">
                  Select Broker
                </label>
                <div className="relative">
                  <select
                    value={selectedBrokerId || ''}
                    onChange={(e) => setSelectedBrokerId(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg appearance-none cursor-pointer"
                    style={{
                      backgroundColor: 'var(--chatty-bg)',
                      border: '1px solid var(--chatty-border)',
                      color: 'var(--chatty-text)',
                    }}
                  >
                    {brokers.map((broker) => (
                      <option key={broker.id} value={broker.id}>
                        {broker.name} {broker.configured && broker.connected ? '✓' : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={18}
                    className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50"
                  />
                </div>
                {selectedBroker && (
                  <div className="mt-2">
                    {getStatusBadge(selectedBroker)}
                  </div>
                )}
              </div>

              {selectedBroker && (
                <div className="space-y-3">
                  {selectedBroker.fields.map((field) => (
                    <div key={field}>
                      <label className="block text-sm font-medium mb-1.5 opacity-70 flex items-center gap-2">
                        {FIELD_ICONS[field]}
                        {FIELD_LABELS[field] || field}
                      </label>
                      {field === 'environment' ? (
                        <select
                          value={credentials[field] || 'demo'}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg"
                          style={{
                            backgroundColor: 'var(--chatty-bg)',
                            border: '1px solid var(--chatty-border)',
                            color: 'var(--chatty-text)',
                          }}
                        >
                          <option value="demo">Demo</option>
                          <option value="live">Live</option>
                        </select>
                      ) : (
                        <input
                          type={field.includes('key') || field.includes('password') || field.includes('secret') ? 'password' : 'text'}
                          value={credentials[field] || ''}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          placeholder={`Enter ${FIELD_LABELS[field] || field}`}
                          className="w-full px-4 py-2.5 rounded-lg"
                          style={{
                            backgroundColor: 'var(--chatty-bg)',
                            border: '1px solid var(--chatty-border)',
                            color: 'var(--chatty-text)',
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
                  <CheckCircle size={16} />
                  Credentials saved successfully
                </div>
              )}

              <button
                onClick={handleSaveCredentials}
                disabled={saving || !selectedBroker}
                className="w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--chatty-accent, #3b82f6)',
                  color: 'white',
                }}
              >
                {saving ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Credentials'
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {configuredBrokers.length === 0 ? (
                <div className="text-center py-8 opacity-50">
                  <Building2 size={48} className="mx-auto mb-3 opacity-30" />
                  <p>No brokers configured yet</p>
                  <p className="text-sm mt-1">Connect a broker first</p>
                </div>
              ) : (
                <>
                  <p className="text-sm opacity-60">
                    Select which broker FXShinobi should use for trading:
                  </p>
                  <div className="space-y-2">
                    {configuredBrokers.map((broker) => (
                      <button
                        key={broker.id}
                        onClick={() => handleSetActive(broker.id)}
                        disabled={saving}
                        className={`w-full p-4 rounded-lg text-left transition-all flex items-center justify-between ${
                          broker.id === activeBrokerId
                            ? 'ring-2 ring-blue-500'
                            : 'hover:bg-[var(--chatty-highlight)]'
                        }`}
                        style={{
                          backgroundColor: broker.id === activeBrokerId
                            ? 'var(--chatty-highlight)'
                            : 'var(--chatty-bg)',
                          border: '1px solid var(--chatty-border)',
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Building2 size={20} className="text-blue-500" />
                          <div>
                            <div className="font-medium">{broker.name}</div>
                            {getStatusBadge(broker)}
                          </div>
                        </div>
                        {broker.id === activeBrokerId && (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                            Active
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-sm">
                      <AlertCircle size={16} />
                      {error}
                    </div>
                  )}

                  {success && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
                      <CheckCircle size={16} />
                      Active broker updated
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div
          className="p-4 border-t text-xs opacity-50 text-center"
          style={{ borderColor: 'var(--chatty-border)' }}
        >
          Credentials are securely stored in VVAULT
        </div>
      </div>
    </div>
  );
};

export default ConnectBrokerModal;
