import React, { useState } from 'react';
import { X, Link2, Key, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { storeFinanceCredentials } from '../../lib/vvaultFinanceClient';

interface ConnectServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSuccess?: () => void;
}

interface ServiceOption {
  id: string;
  name: string;
  description: string;
  fields: { key: string; label: string; type: 'text' | 'password'; required: boolean }[];
}

const AVAILABLE_SERVICES: ServiceOption[] = [
  {
    id: 'fxshinobi',
    name: 'FXShinobi',
    description: 'Connect your FXShinobi trading account',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'api_secret', label: 'API Secret', type: 'password', required: true },
    ],
  },
  {
    id: 'broker_generic',
    name: 'Generic Broker',
    description: 'Connect any broker with API access',
    fields: [
      { key: 'broker_name', label: 'Broker Name', type: 'text', required: true },
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
      { key: 'api_secret', label: 'API Secret', type: 'password', required: false },
    ],
  },
  {
    id: 'kalshi',
    name: 'Kalshi',
    description: 'Connect your Kalshi prediction market account',
    fields: [
      { key: 'email', label: 'Email', type: 'text', required: true },
      { key: 'api_key', label: 'API Key', type: 'password', required: true },
    ],
  },
];

const ConnectServiceModal: React.FC<ConnectServiceModalProps> = ({
  isOpen,
  onClose,
  userId,
  onSuccess,
}) => {
  const [selectedService, setSelectedService] = useState<ServiceOption | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const resetState = () => {
    setSelectedService(null);
    setCredentials({});
    setLoading(false);
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  if (!isOpen) return null;

  const handleServiceSelect = (service: ServiceOption) => {
    setSelectedService(service);
    setCredentials({});
    setError(null);
    setSuccess(false);
  };

  const handleFieldChange = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
  };

  const handleConnect = async () => {
    if (!selectedService) return;

    const missingRequired = selectedService.fields
      .filter((f) => f.required && !credentials[f.key])
      .map((f) => f.label);

    if (missingRequired.length > 0) {
      setError(`Missing required fields: ${missingRequired.join(', ')}`);
      return;
    }

    setLoading(true);
    setError(null);

    const result = await storeFinanceCredentials(userId, {
      serviceId: selectedService.id,
      serviceName: selectedService.name,
      credentials,
    });

    setLoading(false);

    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        handleClose();
      }, 1500);
    } else {
      setError(result.error || 'Failed to connect service');
    }
  };

  const handleBack = () => {
    setSelectedService(null);
    setCredentials({});
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
    >
      <div
        className="w-full max-w-md rounded-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--chatty-bg-modal, var(--chatty-bg))',
          border: '1px solid var(--chatty-border)',
        }}
      >
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--chatty-border)' }}
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 size={20} />
            {selectedService ? `Connect ${selectedService.name}` : 'Connect Service'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4">
          {success ? (
            <div className="text-center py-8">
              <CheckCircle size={48} className="mx-auto text-green-500 mb-4" />
              <h3 className="font-semibold text-lg mb-2">Connected Successfully!</h3>
              <p className="text-sm opacity-70">
                Your {selectedService?.name} account has been connected.
              </p>
            </div>
          ) : !selectedService ? (
            <div className="space-y-3">
              <p className="text-sm opacity-70 mb-4">
                Select a service to connect to your Finance dashboard:
              </p>
              {AVAILABLE_SERVICES.map((service) => (
                <button
                  key={service.id}
                  onClick={() => handleServiceSelect(service)}
                  className="w-full p-4 rounded-lg text-left transition-all hover:scale-[1.01]"
                  style={{
                    backgroundColor: 'var(--chatty-bg)',
                    border: '1px solid var(--chatty-border)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: 'var(--chatty-highlight)' }}
                    >
                      <Key size={20} />
                    </div>
                    <div>
                      <h3 className="font-medium">{service.name}</h3>
                      <p className="text-sm opacity-60">{service.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm opacity-70">{selectedService.description}</p>

              {selectedService.fields.map((field) => (
                <div key={field.key}>
                  <label className="block text-sm font-medium mb-1">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.key] || ''}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{
                      backgroundColor: 'var(--chatty-bg)',
                      border: '1px solid var(--chatty-border)',
                      color: 'var(--chatty-text)',
                    }}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                </div>
              ))}

              {error && (
                <div
                  className="flex items-center gap-2 p-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    color: '#EF4444',
                  }}
                >
                  <AlertCircle size={16} />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleBack}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{
                    border: '1px solid var(--chatty-border)',
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleConnect}
                  disabled={loading}
                  className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: '#10B981',
                    color: 'white',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConnectServiceModal;
