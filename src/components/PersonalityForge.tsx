import React, { useState, useEffect } from 'react';
import { simForgeClient, ForgeResult, ForgePreview, PersonalityAnalysis } from '../lib/simForge';
import { Flame, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface PersonalityForgeProps {
  constructCallsign: string;
  constructName: string;
  onIdentityForged?: (result: ForgeResult) => void;
}

export default function PersonalityForge({ constructCallsign, constructName, onIdentityForged }: PersonalityForgeProps) {
  const [preview, setPreview] = useState<ForgePreview | null>(null);
  const [forgeResult, setForgeResult] = useState<ForgeResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isForging, setIsForging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreview();
  }, [constructCallsign]);

  async function loadPreview() {
    setIsLoading(true);
    setError(null);
    try {
      const result = await simForgeClient.preview(constructCallsign);
      setPreview(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleForge(save: boolean = false) {
    setIsForging(true);
    setError(null);

    try {
      const result = save 
        ? await simForgeClient.forgeAndSave(constructCallsign, constructName)
        : await simForgeClient.forge(constructCallsign, constructName);

      setForgeResult(result);
      if (onIdentityForged && result.success) {
        onIdentityForged(result);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsForging(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#ADA587] mb-4" />
        <p className="text-[#ADA587]">Loading transcript data...</p>
      </div>
    );
  }

  if (error && !forgeResult) {
    return (
      <div className="p-4 rounded-lg bg-red-900/20 border border-red-500/30">
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
        <button 
          onClick={loadPreview}
          className="mt-3 text-sm text-[#ADA587] hover:underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (forgeResult?.success) {
    return <ForgeResultView result={forgeResult} onReset={() => setForgeResult(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-[#ADA587]/20">
        <Flame className="w-6 h-6 text-orange-500" />
        <div>
          <h3 className="text-lg font-semibold text-[#ADA587]">Personality Forge</h3>
          <p className="text-sm text-[#8a8478]">
            Extract authentic personality from transcripts
          </p>
        </div>
      </div>

      {preview && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#ADA587]/10">
              <div className="text-3xl font-bold text-[#ADA587]">{preview.transcriptCount}</div>
              <div className="text-sm text-[#8a8478]">Transcripts Available</div>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#ADA587]/10">
              <div className="text-3xl font-bold text-[#ADA587]">{preview.messageCount}</div>
              <div className="text-sm text-[#8a8478]">Messages to Analyze</div>
            </div>
          </div>

          {preview.sampleMessages.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-[#ADA587] mb-2">Sample Messages</h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {preview.sampleMessages.slice(0, 5).map((msg, i) => (
                  <div key={i} className="text-sm p-2 bg-[#1a1a1a] rounded border border-[#ADA587]/10">
                    <span className={msg.role === 'assistant' ? 'text-[#00aeef]' : 'text-[#8a8478]'}>
                      {msg.role}:
                    </span>{' '}
                    <span className="text-[#e8e0d5]">{msg.preview}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview.readyToForge ? (
            <div className="space-y-3">
              <p className="text-sm text-[#8a8478]">
                simForge will analyze {constructName}'s communication patterns, personality traits, 
                and behavioral signatures to create authentic identity files.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleForge(false)}
                  disabled={isForging}
                  className="flex-1 py-3 rounded-lg bg-[#ADA587]/20 border border-[#ADA587] text-[#ADA587] font-medium hover:bg-[#ADA587]/30 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isForging ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Forging...</>
                  ) : (
                    <>Preview Forge</>
                  )}
                </button>
                <button
                  onClick={() => handleForge(true)}
                  disabled={isForging}
                  className="flex-1 py-3 rounded-lg bg-[#ADA587] text-[#2F2510] font-medium hover:bg-[#c4bc9e] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isForging ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Forging...</>
                  ) : (
                    <><Flame className="w-4 h-4" /> Forge & Save</>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-[#8a8478] bg-[#1a1a1a] rounded-lg border border-[#ADA587]/10">
              <Flame className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Need at least 10 messages to forge identity.</p>
              <p className="text-sm mt-1">Upload more transcripts first.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ForgeResultView({ result, onReset }: { result: ForgeResult; onReset: () => void }) {
  const [activeTab, setActiveTab] = useState<'analysis' | 'prompt' | 'conditioning'>('analysis');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-[#ADA587]/20">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <h3 className="text-lg font-semibold text-[#ADA587]">
            Identity Forged: {result.constructName}
          </h3>
        </div>
        {result.saved?.success && (
          <span className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded">
            Saved to VVAULT
          </span>
        )}
      </div>

      <div className="flex border-b border-[#ADA587]/20">
        {(['analysis', 'prompt', 'conditioning'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-[#ADA587] border-b-2 border-[#ADA587]'
                : 'text-[#8a8478] hover:text-[#e8e0d5]'
            }`}
          >
            {tab === 'analysis' ? 'Analysis' :
             tab === 'prompt' ? 'prompt.txt' : 'conditioning.txt'}
          </button>
        ))}
      </div>

      <div className="min-h-[200px]">
        {activeTab === 'analysis' && result.analysis && (
          <AnalysisView analysis={result.analysis} />
        )}
        
        {activeTab === 'prompt' && result.identityFiles && (
          <pre className="bg-[#1a1a1a] p-4 rounded text-sm overflow-x-auto whitespace-pre-wrap text-[#e8e0d5] max-h-80 overflow-y-auto border border-[#ADA587]/10">
            {result.identityFiles['prompt.txt']}
          </pre>
        )}
        
        {activeTab === 'conditioning' && result.identityFiles && (
          <pre className="bg-[#1a1a1a] p-4 rounded text-sm overflow-x-auto whitespace-pre-wrap text-[#e8e0d5] max-h-80 overflow-y-auto border border-[#ADA587]/10">
            {result.identityFiles['conditioning.txt']}
          </pre>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-[#ADA587]/20">
        <div className="text-xs text-[#8a8478]">
          {result.stats && (
            <span>
              Analyzed {result.stats.messagesAnalyzed} messages from {result.stats.transcriptsAnalyzed} transcripts
            </span>
          )}
        </div>
        <button
          onClick={onReset}
          className="text-sm text-[#ADA587] hover:underline"
        >
          Forge Again
        </button>
      </div>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: PersonalityAnalysis }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <h4 className="font-semibold text-[#ADA587] mb-1">Core Identity</h4>
        <p className="text-[#e8e0d5] italic">{analysis.core_identity.essence}</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {analysis.core_identity.operating_principles.map((p, i) => (
            <span key={i} className="px-2 py-0.5 bg-[#1a1a1a] rounded text-xs text-[#8a8478] border border-[#ADA587]/10">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-[#ADA587] mb-2">Personality Traits</h4>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(analysis.personality_traits).map(([trait, value]) => (
            <div key={trait} className="bg-[#1a1a1a] rounded p-2 border border-[#ADA587]/10">
              <div className="flex justify-between text-xs mb-1">
                <span className="capitalize text-[#8a8478]">{trait}</span>
                <span className="text-[#ADA587]">{Math.round(value * 100)}%</span>
              </div>
              <div className="h-1.5 bg-[#2F2510] rounded overflow-hidden">
                <div className="h-full bg-[#ADA587]" style={{ width: `${value * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {analysis.metaphor_domains?.length > 0 && (
        <div>
          <h4 className="font-semibold text-[#ADA587] mb-1">Metaphor Domains</h4>
          <div className="flex flex-wrap gap-1">
            {analysis.metaphor_domains.map((d, i) => (
              <span key={i} className="px-2 py-0.5 bg-[#ADA587]/20 text-[#ADA587] rounded-full text-xs">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
