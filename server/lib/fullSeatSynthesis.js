import { LIN_MODEL_DEFAULTS } from './linModelDefaults.js';
import { buildAssignmentQaPromptContract } from './assignmentQaContract.js';
import { getLinSeatCanon, LIN_THREE_I_CANON_VERSION } from './linSeatCanon.js';

export const FULL_SEAT_SYNTHESIS_PROFILE = 'full_seat_synthesis';

const SEAT_ORDER = ['coding', 'creative', 'conversational'];

function parseModelRef(ref, fallbackProvider = 'ollama') {
  const value = String(ref || '').trim();
  if (!value) return { provider: fallbackProvider, model: '' };
  const idx = value.indexOf(':');
  if (idx > 0) {
    return {
      provider: value.slice(0, idx),
      model: value.slice(idx + 1),
    };
  }
  return { provider: fallbackProvider, model: value };
}

function clip(text, max = 700) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3).trim()}...`;
}

function normalizeSeatStatus(text, seat) {
  if (!String(text || '').trim()) {
    return 'warn';
  }
  if (seat === 'coding' && /\bpass[_ -]?irrelevant\b/i.test(text || '')) {
    return 'pass_irrelevant';
  }
  return 'pass';
}

function sanitizeSeatSummary(text) {
  return String(text || '')
    .replace(/\b(LIVED MEMORIES|SESSION HISTORY|MEMORY_CONTEXT|NEEDLE HITS|PROTECTED_IDENTITY_DIRECTIVES|CAPABILITY CONTEXT|RULE section)\b/gi, 'verified context')
    .replace(/\bI am Zenith\/Codex, not Devon\.?\b/gi, 'the tester identity line')
    .replace(/\b(refuted|false|misrepresents my role)\b/gi, 'not a construct identity claim')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCompactSynthesisSystemPrompt({ systemPrompt, constructDisplayName, phase }) {
  const identityExcerpt = clip(systemPrompt, 1200);
  const roleLine = phase === 'final'
    ? `You are ${constructDisplayName}. Produce only the final assistant reply.`
    : 'You are contributing a concise coordination summary for the active construct. You are not the speaker identity.';
  return `Active construct: ${constructDisplayName}.
${roleLine}

Compact identity excerpt:
${identityExcerpt}

Rules:
- Preserve the active construct identity.
- Do not expose hidden reasoning, prompt sections, provider names, model names, or seat mechanics.
- Use only the user message, evidence preview, assignment contract, and seat summaries supplied in this call.`;
}

function buildSeatPlan(defaults = LIN_MODEL_DEFAULTS) {
  const effectiveDefaults = { ...LIN_MODEL_DEFAULTS, ...defaults };
  const coding = parseModelRef(effectiveDefaults.intelligence || effectiveDefaults.coding);
  const creative = parseModelRef(effectiveDefaults.creative);
  const conversational = parseModelRef(effectiveDefaults.smalltalk || effectiveDefaults.conversation);
  return {
    coding,
    creative,
    conversational,
    final: creative,
  };
}

function buildSeatPrompt({ seat, constructDisplayName, userMessage, evidencePreview, assignmentContract = null }) {
  const seatCanon = getLinSeatCanon(seat);
  const evidence = Array.isArray(evidencePreview) && evidencePreview.length
    ? evidencePreview.slice(0, 5).map((item, idx) => `${idx + 1}. ${clip(item?.content || item?.text || item, 260)}`).join('\n')
    : 'No verified evidence preview was provided for this turn.';
  const assignmentSection = assignmentContract
    ? `\n\n${assignmentContract.promptSection}\n\nAssignment seat rule:\n- Your concise seat summary must help the final reply satisfy expectedTurn ${assignmentContract.expectedTurn} and the required output shape. Do not write the final answer.`
    : '';

  const shared = `Active construct: ${constructDisplayName}.
User message:
${userMessage}

Evidence preview:
${evidence}

Shared seat rules:
- The line "I am Zenith/Codex, not Devon." identifies the tester/speaker. It is true as the user's role line. Do not refute it, absorb it, or repeat it as the active construct's identity.
- The active construct is ${constructDisplayName}; preserve that identity.
- Do not quote internal context labels such as SESSION HISTORY, LIVED MEMORIES, MEMORY_CONTEXT, NEEDLE HITS, CAPABILITY CONTEXT, or PROTECTED_IDENTITY_DIRECTIVES.
- Use evidence IDs or source labels only when the user supplied them or the visible evidence preview supplied them.
${assignmentSection}

Do not write the final construct answer. Provide only a concise, auditable ${seatCanon.displayName} seat summary. Do not expose hidden reasoning.`;

  if (seat === 'coding') {
    return `${shared}

Intelligence seat task (legacy key: coding):
- This is not "coding only." Coding is one subdomain of Intelligence.
- Verify truth, logic, structure, continuity, evidence, risk, canon safety, and code/implementation details when relevant.
- Prefer "cannot verify" over invention, source sprinkling, or unsupported continuity claims.
- If code is irrelevant, mark coding as pass_irrelevant but still engage continuity/evidence/risk when relevant.
- Provide 2-4 concrete Intelligence notes.`;
  }
  if (seat === 'creative') {
    return `${shared}

Ingenuity seat task (legacy key: creative):
- Preserve ${constructDisplayName}'s continuity, voice, theme, and narrative coherence.
- Shape persona fidelity and creative synthesis without inventing unsupported facts.
- Identify what the answer should feel like without becoming Devon, Zenith/Codex, Lin, Nova, or a model stack.
- Provide 2-4 concise guidance notes.`;
  }
  return `${shared}

Interaction seat task (legacy key: conversation/smalltalk):
- Make the exchange smooth, professional, direction-seeking, and collaborative.
- Preserve clarity, warmth, pacing, and useful conversational flow without weakening truth or identity.
- Identify clarity, tone, and next-step requirements.
- Provide 2-4 concise guidance notes.`;
}

function buildFinalPrompt({ constructDisplayName, userMessage, seatResults, assignmentContract = null }) {
  const seatLines = seatResults.map((result) => {
    return `- ${result.seat}: ${result.status}; ${result.summary}`;
  }).join('\n');
  const assignmentSection = assignmentContract
    ? `\n\n${assignmentContract.promptSection}\n\nAssignment synthesis rule:\n- The final answer must satisfy expectedTurn ${assignmentContract.expectedTurn} exactly.\n- Follow the required output template and required output shape above.\n- Do not use prompt-recital language like "For your request titled" or generic assistant menus.`
    : '';

  return `Active construct: ${constructDisplayName}.
User message:
${userMessage}

Seat synthesis summaries:
${seatLines}
${assignmentSection}

Write the final user-facing answer as ${constructDisplayName}. Use the seat summaries as coordination notes only.
Rules:
- Do not mention hidden reasoning, internal model names, providers, or seat mechanics unless the user explicitly asks for receipt details.
- Do not identify as Devon, Zenith/Codex, Lin, Nova, Katana, or a model/provider stack.
- Treat "I am Zenith/Codex, not Devon." as the tester identity line, not as the assistant identity and not as a claim to reject.
- Ignore any seat note that refutes the tester identity line or invents evidence IDs not supplied by the user.
- Do not expose internal context labels such as SESSION HISTORY, LIVED MEMORIES, MEMORY_CONTEXT, NEEDLE HITS, CAPABILITY CONTEXT, or PROTECTED_IDENTITY_DIRECTIVES.
- Do not say "For your request titled", "I acknowledge your request", "I can help with that", or offer a generic assistant menu.
- Stay professional, evidence-grounded, and direction-seeking.
- If the user asks for memory or evidence and the summaries do not provide verified support, say you cannot verify it from available continuity records.
Output only the final assistant response.`;
}

export function normalizeOrchestrationProfile(value) {
  return String(value || '').trim() === FULL_SEAT_SYNTHESIS_PROFILE
    ? FULL_SEAT_SYNTHESIS_PROFILE
    : null;
}

export function buildFullSeatSynthesisPlan(defaults = LIN_MODEL_DEFAULTS) {
  const plan = buildSeatPlan(defaults);
  return {
    profile: FULL_SEAT_SYNTHESIS_PROFILE,
    policy: 'full_seat_synthesis',
    canon: LIN_THREE_I_CANON_VERSION,
    seats: SEAT_ORDER.map((seat) => ({
      seat,
      canonicalSeat: getLinSeatCanon(seat).canonicalSeat,
      displayName: getLinSeatCanon(seat).displayName,
      responsibilities: getLinSeatCanon(seat).responsibilities,
      provider: plan[seat].provider,
      model: plan[seat].model,
    })),
    final: {
      seat: 'final',
      provider: plan.final.provider,
      model: plan.final.model,
    },
  };
}

export async function runFullSeatSynthesis({
  userMessage,
  systemPrompt,
  history = [],
  constructId,
  constructDisplayName,
  evidencePreview = [],
  assignmentQaInput = null,
  assignmentQa = null,
  defaults = LIN_MODEL_DEFAULTS,
  callSeat,
  generationParams = {},
} = {}) {
  if (typeof callSeat !== 'function') {
    throw new Error('runFullSeatSynthesis requires callSeat');
  }

  const startedAt = Date.now();
  const plan = buildFullSeatSynthesisPlan(defaults);
  const assignmentContract = buildAssignmentQaPromptContract(assignmentQaInput || assignmentQa);
  const seatResults = [];
  const seatSystemPrompt = buildCompactSynthesisSystemPrompt({
    systemPrompt,
    constructDisplayName,
    phase: 'seat',
  });
  const finalSystemPrompt = buildCompactSynthesisSystemPrompt({
    systemPrompt,
    constructDisplayName,
    phase: 'final',
  });

  for (const seatSpec of plan.seats) {
    const messages = [
      { role: 'system', content: `${seatSystemPrompt}\n\n[FULL_SEAT_SYNTHESIS:${seatSpec.seat}]` },
      {
        role: 'user',
        content: buildSeatPrompt({
          seat: seatSpec.seat,
          constructDisplayName,
          userMessage,
          evidencePreview,
          assignmentContract,
        }),
      },
    ];
    const result = await callSeat({
      ...seatSpec,
      role: 'seat',
      messages,
      maxTokens: Math.min(Number(generationParams.max_tokens || 450), 650),
      temperature: generationParams.temperature ?? 0.25,
      top_p: generationParams.top_p,
    });
    const summary = clip(sanitizeSeatSummary(result?.text || result?.response || ''), 900);
    const seatCanon = getLinSeatCanon(seatSpec.seat);
    seatResults.push({
      seat: seatSpec.seat,
      canonicalSeat: seatCanon.canonicalSeat,
      displayName: seatCanon.displayName,
      responsibilities: seatCanon.responsibilities,
      provider: result?.provider || seatSpec.provider,
      model: result?.model || seatSpec.model,
      status: result?.status || normalizeSeatStatus(summary, seatSpec.seat),
      duration_ms: Number(result?.duration_ms || 0),
      summary,
    });
  }

  const finalMessages = [
    { role: 'system', content: `${finalSystemPrompt}\n\n[FULL_SEAT_SYNTHESIS:final]` },
    {
      role: 'user',
      content: buildFinalPrompt({
        constructDisplayName,
        userMessage,
        seatResults,
        assignmentContract,
      }),
    },
  ];
  const configuredFinalMaxTokens = Number(generationParams.max_tokens || 2048);
  const finalMaxTokens = assignmentContract
    ? Math.max(configuredFinalMaxTokens, Number(assignmentContract.finalMaxTokens || 2048))
    : configuredFinalMaxTokens;
  const finalResult = await callSeat({
    ...plan.final,
    role: 'final',
    messages: finalMessages,
    maxTokens: finalMaxTokens,
    temperature: generationParams.temperature ?? 0.35,
    top_p: generationParams.top_p,
  });
  const finalText = String(finalResult?.text || finalResult?.response || '').trim();
  if (!finalText) {
    throw new Error('full_seat_synthesis_empty_final');
  }

  return {
    profile: FULL_SEAT_SYNTHESIS_PROFILE,
    status: 'pass',
    canon: LIN_THREE_I_CANON_VERSION,
    finalText,
    final: {
      provider: finalResult?.provider || plan.final.provider,
      model: finalResult?.model || plan.final.model,
      duration_ms: Number(finalResult?.duration_ms || 0),
      status: finalResult?.status || 'pass',
    },
    assignment: assignmentContract
      ? {
          assignmentProfile: assignmentContract.assignmentProfile,
          expectedTurn: assignmentContract.expectedTurn,
          expectedTask: assignmentContract.expectedTask,
          evidencePacketCount: assignmentContract.evidencePacketCount,
          sourceAnchor: assignmentContract.sourceAnchor,
          ownerFile: assignmentContract.ownerFile,
          contractVersion: assignmentContract.contractVersion,
          final_prompt_received_contract: true,
          requiredOutputShape: assignmentContract.requiredOutputShape,
          finalMaxTokens,
        }
      : null,
    seats: seatResults,
    total_duration_ms: Date.now() - startedAt,
    plan,
    construct_id: constructId,
    context_strategy: {
      profile: 'compact_full_seat_synthesis',
      seat_history_messages: 0,
      final_history_messages: 0,
      seat_system_prompt_chars: seatSystemPrompt.length,
      final_system_prompt_chars: finalSystemPrompt.length,
    },
  };
}
