// DriftHistoryModal: Display historical drift tracking data
import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Clock, TrendingUp, Activity } from 'lucide-react';
import { Z_LAYERS } from '../lib/zLayers';

interface DriftDetection {
  constructId: string;
  currentFingerprint: string;
  previousFingerprint: string;
  driftScore: number;
  detectedAt: number;
  components: {
    personaChanged: boolean;
    roleLockChanged: boolean;
    behaviorChanged: boolean;
    legalDocChanged: boolean;
  };
  metadata: Record<string, any>;
}

interface DriftHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  constructId: string;
}

export const DriftHistoryModal: React.FC<DriftHistoryModalProps> = ({
  isOpen,
  onClose,
  constructId
}) => {
  const [driftHistory, setDriftHistory] = useState<DriftDetection[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    totalDetections: number;
    highDriftCount: number;
    averageDriftScore: number;
    recentDetections: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen && constructId) {
      loadDriftHistory();
    }
  }, [isOpen, constructId]);

  const loadDriftHistory = async () => {
    setLoading(true);
    try {
      // Import fingerprint detector dynamically
      const { fingerprintDetector } = await import('../utils/fingerprint');
      
      const [history, driftStats] = await Promise.all([
        fingerprintDetector.getDriftHistory(constructId, 20),
        fingerprintDetector.getDriftStats()
      ]);
      
      setDriftHistory(history);
      setStats(driftStats);
    } catch (error) {
      console.error('Failed to load drift history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getDriftSeverity = (score: number) => {
    if (score >= 0.8) return { label: 'Critical', color: '#ef4444' };
    if (score >= 0.5) return { label: 'High', color: '#f97316' };
    if (score >= 0.3) return { label: 'Medium', color: '#eab308' };
    if (score >= 0.1) return { label: 'Low', color: '#22c55e' };
    return { label: 'Minimal', color: '#6b7280' };
  };

  const getComponentIcon = (component: string) => {
    switch (component) {
      case 'personaChanged': return '👤';
      case 'roleLockChanged': return '🔒';
      case 'behaviorChanged': return '🎭';
      case 'legalDocChanged': return '📄';
      default: return '❓';
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: Z_LAYERS.modal }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <Activity className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Drift History</h2>
            <span className="text-sm text-gray-500">Construct: {constructId.slice(0, 8)}...</span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats Overview */}
        {stats && (
          <div className="p-6 bg-gray-50 border-b">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.totalDetections}</div>
                <div className="text-sm text-gray-600">Total Detections</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.highDriftCount}</div>
                <div className="text-sm text-gray-600">High Drift</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {(stats.averageDriftScore * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Avg Score</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.recentDetections}</div>
                <div className="text-sm text-gray-600">Last 24h</div>
              </div>
            </div>
          </div>
        )}

        {/* Drift History List */}
        <div className="p-6 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading drift history...</span>
            </div>
          ) : driftHistory.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>No drift detections found</p>
              <p className="text-sm">This construct appears stable</p>
            </div>
          ) : (
            <div className="space-y-4">
              {driftHistory.map((drift, index) => {
                const severity = getDriftSeverity(drift.driftScore);
                return (
                  <div
                    key={index}
                    className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <AlertTriangle 
                          className="w-5 h-5" 
                          style={{ color: severity.color }}
                        />
                        <span className="font-medium">Drift Detection</span>
                        <span 
                          className="px-2 py-1 rounded-full text-xs font-medium"
                          style={{ 
                            backgroundColor: `${severity.color}20`,
                            color: severity.color
                          }}
                        >
                          {severity.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {formatDate(drift.detectedAt)}
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium">Drift Score: {(drift.driftScore * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${drift.driftScore * 100}%`,
                            backgroundColor: severity.color
                          }}
                        />
                      </div>
                    </div>

                    <div className="mb-3">
                      <div className="text-sm font-medium text-gray-700 mb-2">Component Changes:</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(drift.components).map(([component, changed]) => (
                          <div
                            key={component}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                              changed 
                                ? 'bg-red-100 text-red-700' 
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            <span>{getComponentIcon(component)}</span>
                            <span>{component.replace('Changed', '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {drift.metadata && Object.keys(drift.metadata).length > 0 && (
                      <div className="text-xs text-gray-500">
                        <details>
                          <summary className="cursor-pointer hover:text-gray-700">
                            View Metadata
                          </summary>
                          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                            {JSON.stringify(drift.metadata, null, 2)}
                          </pre>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {driftHistory.length} drift detections
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
