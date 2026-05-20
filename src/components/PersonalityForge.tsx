import React, { useState, useEffect, useRef } from 'react';
import {
  simForgeClient,
  ForgeResult,
  ForgePreview,
  PersonalityAnalysis,
  SimBuildJob,
} from '../lib/simForge';
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
  const [simBuildJob, setSimBuildJob] = useState<SimBuildJob | null>(null);
  const [simBuildError, setSimBuildError] = useState<string | null>(null);
  const [simBuildPhase, setSimBuildPhase] = useState<'idle' | 'submitting' | 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out'>('idle');
  const isMountedRef = useRef(true);
  const normalizedCallsign = constructCallsign.trim().toLowerCase();
  const isPlatformConstruct =
    normalizedCallsign === 'zen' ||
    normalizedCallsign === 'zen-001' ||
    normalizedCallsign === 'lin' ||
    normalizedCallsign === 'lin-001';

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadPreview();
    setSimBuildJob(null);
    setSimBuildError(null);
    setSimBuildPhase('idle');
  }, [constructCallsign]);

  function isTerminalStatus(status?: string) {
    return status === 'succeeded' || status === 'failed' || status === 'timed_out';
  }

  function mapBuildPhase(status?: string): 'queued' | 'running' | 'succeeded' | 'failed' | 'timed_out' {
    if (status === 'queued') return 'queued';
    if (status === 'running') return 'running';
    if (status === 'succeeded') return 'succeeded';
    if (status === 'timed_out') return 'timed_out';
    return 'failed';
  }

  async function pollConstructBuild(jobId: string) {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (!isMountedRef.current) return;

      const job = await simForgeClient.getConstructSimBuildStatus(jobId);
      if (!isMountedRef.current) return;

      setSimBuildJob(job);
      setSimBuildPhase(mapBuildPhase(job.status));

      if (isTerminalStatus(job.status)) return;

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    setSimBuildPhase('timed_out');
    setSimBuildError('Build polling timed out.');
  }

  async function handleConstructBuild() {
    setSimBuildError(null);
    setSimBuildPhase('submitting');

    try {
      const job = await simForgeClient.startConstructSimBuild({
        callsign: constructCallsign,
        dryRun: true,
        includeCapsuleSummary: true,
      });

      if (!isMountedRef.current) return;

      setSimBuildJob(job);
      setSimBuildPhase(mapBuildPhase(job.status));

      if (!isTerminalStatus(job.status)) {
        await pollConstructBuild(job.jobId);
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;

      if (err?.statusCode === 409 && err?.activeJobId) {
        setSimBuildPhase('running');
        await pollConstructBuild(String(err.activeJobId));
        return;
      }

      setSimBuildPhase('failed');
      setSimBuildError(err?.message || 'Failed to start sim build.');
    }
  }

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
                  className="flex-1 py-3 rounded-lg bg-[#ADA587] text-[#000110] font-medium hover:bg-[#c4bc9e] disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isForging ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Forging...</>
                  ) : (
                    <><Flame className="w-4 h-4" /> Forge & Save</>
                  )}
                </button>
              </div>

              {isPlatformConstruct ? (
                <div className="rounded-lg border border-slate-500/30 bg-slate-900/20 p-3 space-y-1">
                  <p className="text-sm font-medium text-slate-300">System Construct: Sim lane is platform-managed</p>
                  <p className="text-xs text-slate-200/80">
                    {normalizedCallsign === 'lin' || normalizedCallsign === 'lin-001' ? 'lin-001' : 'zen-001'} is a platform construct and does not expose user Build Sim or Forge Sim controls.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-cyan-500/30 bg-cyan-900/10 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-cyan-300">Sim Lane Target: {constructCallsign}</p>
                      <p className="text-xs text-cyan-100/80">
                        {"User-made constructs follow GPT -> Sim -> VSI lifecycle."}
                      </p>
                    </div>
                    <button
                      onClick={handleConstructBuild}
                      disabled={simBuildPhase === 'submitting' || simBuildPhase === 'queued' || simBuildPhase === 'running'}
                      className="px-4 py-2 rounded-lg bg-cyan-500/20 border border-cyan-300 text-cyan-200 text-sm font-medium hover:bg-cyan-500/30 disabled:opacity-50 flex items-center gap-2"
                    >
                      {simBuildPhase === 'submitting' || simBuildPhase === 'queued' || simBuildPhase === 'running' ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Building Sim...</>
                      ) : (
                        <>Build Sim</>
                      )}
                    </button>
                  </div>

                  <p className="text-xs text-cyan-100/70">
                    Memory policy: runtime memory remains inference-time context and is not baked into model weights.
                  </p>

                  {simBuildJob && (
                    <p className="text-xs text-cyan-100/80">
                      Job {simBuildJob.jobId}: {simBuildJob.status}
                    </p>
                  )}

                  {simBuildPhase === 'timed_out' && (
                    <p className="text-xs text-amber-300">Build timed out. You can retry safely.</p>
                  )}

                  {simBuildError && (
                    <p className="text-xs text-red-300">{simBuildError}</p>
                  )}
                </div>
              )}
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
             tab === 'prompt' ? 'prompt.json' : 'conditioning.txt'}
          </button>
        ))}
      </div>

      <div className="min-h-[200px]">
        {activeTab === 'analysis' && result.analysis && (
          <AnalysisView analysis={result.analysis} />
        )}

        {activeTab === 'prompt' && result.identityFiles && (
          <pre className="bg-[#1a1a1a] p-4 rounded text-sm overflow-x-auto whitespace-pre-wrap text-[#e8e0d5] max-h-80 overflow-y-auto border border-[#ADA587]/10">
            {result.identityFiles['prompt.json'] || result.identityFiles['prompt.txt']}
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
              <div className="h-1.5 bg-[#000110] rounded overflow-hidden">
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
