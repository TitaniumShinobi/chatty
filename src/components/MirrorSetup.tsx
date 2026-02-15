import React, { useState } from 'react';
import { Monitor, Smartphone, Layout, Eye, Pen, Layers, X, ArrowRight, ArrowLeft, Play } from 'lucide-react';

interface MirrorSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (config: { source: 'tab' | 'window' | 'screen'; permission: 'read' | 'write' | 'both' }) => void;
}

const MirrorSetup: React.FC<MirrorSetupProps> = ({ isOpen, onClose, onStart }) => {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<'tab' | 'window' | 'screen'>('tab');
  const [permission, setPermission] = useState<'read' | 'write' | 'both'>('write');

  if (!isOpen) return null;

  const handleStart = () => {
    onStart({ source, permission });
    setStep(1);
  };

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md bg-app-orange-800 border border-app-orange-700 rounded-xl shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-app-orange-700">
          <h2 className="text-white font-semibold text-lg">Mirror Setup</h2>
          <button onClick={handleClose} className="text-app-orange-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 px-4 pt-4">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-emerald-500' : 'bg-app-orange-700'}`} />
          ))}
        </div>

        <div className="p-6">
          {step === 1 && (
            <div>
              <p className="text-app-orange-400 text-sm mb-4">Select what to capture:</p>
              <div className="space-y-2">
                {([
                  { id: 'tab' as const, label: 'Browser Tab', desc: 'Share a single browser tab', icon: <Smartphone size={20} /> },
                  { id: 'window' as const, label: 'Window', desc: 'Share an application window', icon: <Layout size={20} /> },
                  { id: 'screen' as const, label: 'Full Screen', desc: 'Share your entire screen', icon: <Monitor size={20} /> },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSource(opt.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      source === opt.id
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-app-orange-800 border-app-orange-700 text-white hover:bg-app-orange-700'
                    }`}
                  >
                    <div className="flex-shrink-0">{opt.icon}</div>
                    <div>
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs text-app-orange-400">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-app-orange-400 text-sm mb-4">Select permission level:</p>
              <div className="space-y-2">
                {([
                  { id: 'read' as const, label: 'Read Only', desc: 'Capture screen but don\'t inject into chat', icon: <Eye size={20} /> },
                  { id: 'write' as const, label: 'Write', desc: 'Capture and inject structured context into chat', icon: <Pen size={20} /> },
                  { id: 'both' as const, label: 'Both', desc: 'Write + enable selfprompt availability', icon: <Layers size={20} /> },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPermission(opt.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                      permission === opt.id
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                        : 'bg-app-orange-800 border-app-orange-700 text-white hover:bg-app-orange-700'
                    }`}
                  >
                    <div className="flex-shrink-0">{opt.icon}</div>
                    <div>
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs text-app-orange-400">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <p className="text-app-orange-400 text-sm mb-6">Ready to start Mirror</p>
              <div className="bg-app-orange-700/50 rounded-lg p-4 mb-6 text-left space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-app-orange-400">Source</span>
                  <span className="text-white font-medium capitalize">{source}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-app-orange-400">Permission</span>
                  <span className="text-white font-medium capitalize">{permission}</span>
                </div>
              </div>
              <button
                onClick={handleStart}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors font-medium"
              >
                <Play size={16} /> Start Mirror
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-app-orange-700">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors ${
              step === 1 ? 'text-app-orange-700 cursor-not-allowed' : 'text-app-orange-400 hover:text-white'
            }`}
          >
            <ArrowLeft size={14} /> Back
          </button>
          {step < 3 && (
            <button
              onClick={() => setStep(step + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MirrorSetup;
