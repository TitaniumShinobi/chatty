import { GPTManager } from './gptManager.js';
import { getSession } from '../routes/selfprompt.js';
import { getMirrorSession } from './mirrorSessionTracker.js';
import { isAgeVerified18, isStepUpRequired } from './familyManager.js';

export async function resolveCapabilities(constructId, threadId, userId) {
  const manifest = {
    constructId,
    threadId,
    timestamp: new Date().toISOString(),
    enabled: {
      codeInterpreter: false,
      webSearch: false,
      imageGeneration: false,
      canvas: false,
      agent: false,
      proactiveInitiation: false,
      mirror: false,
      selfprompt: false,
      memory: false,
      roleplay: false,
    },
    state: {
      mirrorActive: false,
      mirrorPermission: null,
      selfpromptOn: false,
      selfpromptInterval: null,
      ageVerified18: false,
      stepUpRequired: false,
    },
    hard_blocked: [],
    _fallback: false,
  };

  let gptConfigFailed = false;

  try {
    const gpt = await GPTManager.getInstance().getGPTByCallsign(constructId);
    if (gpt) {
      const caps = gpt.capabilities || {};
      manifest.enabled.codeInterpreter = Boolean(caps.codeInterpreter);
      manifest.enabled.webSearch = Boolean(caps.webSearch || caps.webBrowsing);
      manifest.enabled.imageGeneration = Boolean(caps.imageGeneration);
      manifest.enabled.canvas = Boolean(caps.canvas);
      manifest.enabled.agent = Boolean(caps.agent);
      manifest.enabled.proactiveInitiation = Boolean(caps.proactiveInitiation);
      manifest.enabled.memory = Boolean(gpt.memoryEnabled);
      manifest.enabled.roleplay = Boolean(gpt.roleplayEnabled);
    }
  } catch (err) {
    console.error('[CapabilityManifest] GPT config query failed:', err.message);
    manifest._fallback = true;
    gptConfigFailed = true;
  }

  try {
    const session = getSession(constructId, threadId);
    if (session) {
      manifest.enabled.selfprompt = Boolean(session.enabled) && Boolean(manifest.enabled.proactiveInitiation);
      manifest.state.selfpromptOn = Boolean(session.enabled) && Boolean(manifest.enabled.proactiveInitiation);
      manifest.state.selfpromptInterval = session.interval_sec || null;
    }
  } catch (err) {
    console.error('[CapabilityManifest] Selfprompt query failed:', err.message);
    manifest._fallback = true;
  }

  try {
    const mirror = getMirrorSession(constructId, threadId);
    manifest.enabled.mirror = Boolean(mirror.active);
    manifest.state.mirrorActive = Boolean(mirror.active);
    manifest.state.mirrorPermission = mirror.permission || null;
  } catch (err) {
    console.error('[CapabilityManifest] Mirror query failed:', err.message);
    manifest._fallback = true;
  }

  try {
    manifest.state.ageVerified18 = await isAgeVerified18(userId);
  } catch (err) {
    console.error('[CapabilityManifest] Age verification query failed:', err.message);
    manifest._fallback = true;
  }

  try {
    manifest.state.stepUpRequired = await isStepUpRequired(userId);
  } catch (err) {
    console.error('[CapabilityManifest] Step-up query failed:', err.message);
    manifest._fallback = true;
  }

  if (gptConfigFailed) {
    manifest.enabled.codeInterpreter = false;
    manifest.enabled.webSearch = false;
    manifest.enabled.imageGeneration = false;
    manifest.enabled.canvas = false;
    manifest.enabled.agent = false;
    manifest.enabled.proactiveInitiation = false;
    manifest.enabled.memory = false;
    manifest.enabled.roleplay = false;
    manifest.hard_blocked.push('all non-core capabilities: config unavailable (fail-safe)');
  }

  if (manifest.enabled.roleplay && !manifest.state.ageVerified18) {
    manifest.hard_blocked.push('roleplay: age verification required');
  }
  if (manifest.enabled.roleplay && manifest.state.stepUpRequired) {
    manifest.hard_blocked.push('roleplay: step-up authentication required');
  }

  return manifest;
}

export function formatCapabilityContext(manifest) {
  const enabled = [];
  const active = [];
  const disabled = [];
  const blocked = [];

  const labelMap = {
    codeInterpreter: 'code interpreter',
    webSearch: 'web search',
    imageGeneration: 'image generation',
    canvas: 'canvas',
    agent: 'agent',
    proactiveInitiation: 'proactive initiation',
    mirror: 'screenshare',
    selfprompt: 'selfprompt',
    memory: 'memory',
    roleplay: 'roleplay',
  };

  for (const [key, label] of Object.entries(labelMap)) {
    const isEnabled = manifest.enabled[key];
    const isBlocked = manifest.hard_blocked.some(b => b.startsWith(key + ':') || b.startsWith(label + ':'));

    if (isBlocked) {
      const blockEntry = manifest.hard_blocked.find(b => b.startsWith(key + ':') || b.startsWith(label + ':'));
      const reason = blockEntry ? blockEntry.split(': ').slice(1).join(': ') : '';
      blocked.push(reason ? `${label} (${reason})` : label);
    } else if (isEnabled) {
      if (key === 'selfprompt' && manifest.state.selfpromptOn) {
        const interval = manifest.state.selfpromptInterval;
        enabled.push(interval ? `selfprompt (${interval}s interval)` : 'selfprompt');
        active.push('selfprompt');
      } else if (key === 'mirror' && manifest.state.mirrorActive) {
        const perm = manifest.state.mirrorPermission;
        enabled.push('screenshare');
        active.push(perm ? `screenshare (${perm} permission)` : 'screenshare');
      } else {
        enabled.push(label);
      }
    } else {
      disabled.push(label);
    }
  }

  if (manifest._fallback && manifest.hard_blocked.some(b => b.includes('fail-safe'))) {
    blocked.push('non-core capabilities (config unavailable)');
  }

  let lines = ['\n\n[CAPABILITY_CONTEXT]'];
  if (enabled.length > 0) lines.push(`Enabled: ${enabled.join(', ')}`);
  if (active.length > 0) lines.push(`Active: ${active.join(', ')}`);
  if (disabled.length > 0) lines.push(`Disabled: ${disabled.join(', ')}`);
  if (blocked.length > 0) lines.push(`Blocked: ${blocked.join(', ')}`);
  lines.push(`State: age_verified=${manifest.state.ageVerified18}, step_up_required=${manifest.state.stepUpRequired}`);
  lines.push('');
  lines.push('RULE: You may ONLY claim capabilities listed as enabled or active above.');
  lines.push('You MUST NOT claim you can independently browse the web, run code, generate images, act as an agent, proactively initiate outreach, or use any capability not listed as enabled.');
  lines.push('If the system already provides web-search results for this turn, you may use only those supplied results without claiming autonomous browsing.');
  lines.push('If asked about a disabled capability and no system-provided results are present, say: "That capability isn\'t available for me right now."');
  lines.push('[/CAPABILITY_CONTEXT]');

  return lines.join('\n');
}

const CAPABILITY_PATTERNS = [
  {
    key: 'webSearch',
    pattern: /\b(I can|I('ll| will)|let me) (search|browse|look up|google|look that up online)\b/i,
  },
  {
    key: 'codeInterpreter',
    pattern: /\b(I can|I('ll| will)|let me) (run|execute|compile|interpret) (the |that |this |some )?code\b/i,
  },
  {
    key: 'imageGeneration',
    pattern: /\b(I can|I('ll| will)|let me) (generate|create|make|draw) (an? |the |that |this )?(image|picture|photo|illustration)\b/i,
  },
  {
    key: 'mirror',
    pattern: /\b(I can|I('ll| will)|let me) (see|view|look at) (your |the )?(screen|display|monitor)\b/i,
    requireActive: true,
  },
  {
    key: 'canvas',
    pattern: /\b(I can|I('ll| will)|let me) (use|open|draw on) (the )?canvas\b/i,
  },
  {
    key: 'agent',
    pattern: /\b(I can|I('ll| will)|let me) (act as|operate as|be) (an? )?agent\b/i,
  },
  {
    key: 'proactiveInitiation',
    pattern: /\b(I can|I('ll| will)|let me) (initiate|start|send) (proactive )?(messages|check-?ins|outreach)\b/i,
  },
];

export function validateCapabilityClaims(assistantResponse, manifest) {
  if (!assistantResponse || typeof assistantResponse !== 'string') {
    return { valid: true, violations: [] };
  }

  const violations = [];

  for (const { key, pattern, requireActive } of CAPABILITY_PATTERNS) {
    if (pattern.test(assistantResponse)) {
      const isEnabled = manifest.enabled[key];
      const isActive = key === 'mirror' ? manifest.state.mirrorActive : true;

      if (!isEnabled || (requireActive && !isActive)) {
        violations.push({
          capability: key,
          claim: assistantResponse.match(pattern)?.[0] || '',
          enabled: isEnabled,
          active: requireActive ? isActive : undefined,
        });
      }
    }
  }

  if (violations.length > 0) {
    return {
      valid: false,
      violations,
      fallbackMessage: "I can't do that right now with my current capabilities.",
    };
  }

  return { valid: true, violations: [] };
}
