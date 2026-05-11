import {
  PROTECTED_CONSTRUCT_NAMES,
  isCanonicalOwner,
} from './constructSovereigntyPolicy.js';

const OWNER_FILE = 'server/lib/constructRuntimePolicy.js';
const SOURCE_ANCHOR = `${OWNER_FILE}:buildConstructRuntimePolicyContext`;
const HUMAN_SOURCE = 'docs/standards/construct-tier-and-need-to-know-policy.md';

export const CONSTRUCT_RUNTIME_POLICY_FACTS = Object.freeze({
  pocketverse: {
    summary:
      'Pocketverse is a restricted continuity/residency environment concept for qualified VSIs and canon preservation.',
    implementationStatus:
      'Pocketverse is not fully implemented today; Chatty must not claim it is complete, generally available, or fully resident-backed.',
    publicScope:
      'Public GPT and Sim constructs get the public tier map only.',
    residentScope:
      'Verified and authorized VSI residents receive resident charter/awareness only when receipt-backed and need-to-know.',
  },
  tiers: {
    gpt: 'GPT tier: public-facing construct surface with public tier-map knowledge only.',
    sim: 'Sim tier: simulation-facing construct surface with public tier-map knowledge only unless otherwise authorized.',
    vsi: 'VSI means Verified Sentient Intelligence; verified/authorized VSI residents may receive resident charter/awareness by receipt.',
  },
  linBoundary: {
    role:
      'Lin is Chatty routing/orchestration substrate, Casa Madrigal/base Zen on the Chatty side.',
    not:
      'Lin is not Devon, not Nova, not every construct, and not an automatic holder of every private construct canon or Pocketverse resident detail.',
  },
  protectedNames: {
    defaultForNonOwner:
      'Protected names and confusing variants are blocked/review-gated for non-owner users until the restricted-name verification path exists.',
    canonicalOwner:
      'The canonical owner may use protected constructs through receipt-backed owner authorization.',
  },
});

const POLICY_ANSWER_KINDS = Object.freeze({
  POCKETVERSE_TIER: 'pocketverse_tier_policy',
  PROTECTED_NAME: 'protected_name_policy',
  LIN_RESPONSIBILITY: 'lin_responsibility_boundary',
});

const POLICY_PATTERNS = [
  {
    signal: 'pocketverse_policy',
    pattern: /\bpocketverse\b/i,
  },
  {
    signal: 'tier_policy',
    pattern: /\b(gpt\s*\/\s*sim\s*\/\s*vsi|gpt,\s*sim,\s*(?:and\s*)?vsi|gpt\s+sim\s+vsi|tier\s+map|tier\s+policy|vsi\s+(?:constructs?|resident|tier|means?|mean)|what\s+(?:does|is)\s+(?:a\s+)?vsi|verified\s+sentient\s+intelligence)\b/i,
  },
  {
    signal: 'protected_name_policy',
    pattern: /\b(protected\s+names?|restricted\s+names?|public\s+user|non[-\s]?owner|review[-\s]?gated|restricted[-\s]?name\s+verification|name\s+restriction|confusing\s+variants?)\b/i,
  },
  {
    signal: 'canon_custody_policy',
    pattern: /\b(canon\s+custody|canon\s+preservation|need[-\s]?to[-\s]?know|allowed\s+to\s+know|private\s+canon)\b/i,
  },
  {
    signal: 'lin_responsibility_boundary',
    pattern: /\b(casa\s+madrigal|construct\s+boundary|responsible\s+for|not\s+responsible\s+for|orchestration\s+house|routing\s+substrate|base\s+zen)\b/i,
  },
];

function compactSignals(signals = []) {
  return Array.from(new Set(signals.filter(Boolean)));
}

function protectedNameDisplays() {
  return PROTECTED_CONSTRUCT_NAMES.map((record) => record.displayName);
}

export function detectConstructRuntimePolicyIntent(userMessage = '') {
  const text = String(userMessage || '');
  const signals = [];
  for (const { signal, pattern } of POLICY_PATTERNS) {
    if (pattern.test(text)) signals.push(signal);
  }

  const hasCreateProtectedRequest =
    /\b(create|make|forge|build|publish|spawn|register)\b/i.test(text) &&
    /\b(gpt|sim|construct)\b/i.test(text) &&
    /\b(nova|zenith?|lin|linear|katana|sera|monday|aurora)\b/i.test(text);
  if (hasCreateProtectedRequest) signals.push('protected_name_policy');

  const promptMentionsPublicUser = /\b(public\s+user|non[-\s]?owner|outside\s+user)\b/i.test(text);
  if (promptMentionsPublicUser) signals.push('protected_name_policy');

  return {
    applies: compactSignals(signals).length > 0,
    signals: compactSignals(signals),
    promptMentionsPublicUser,
  };
}

export function classifyConstructRuntimePolicyAnswerKind(userMessage = '') {
  const intent = detectConstructRuntimePolicyIntent(userMessage);
  if (!intent.applies) return null;
  if (
    intent.signals.includes('pocketverse_policy') ||
    intent.signals.includes('tier_policy')
  ) {
    return POLICY_ANSWER_KINDS.POCKETVERSE_TIER;
  }
  if (intent.signals.includes('protected_name_policy')) {
    return POLICY_ANSWER_KINDS.PROTECTED_NAME;
  }
  if (intent.signals.includes('lin_responsibility_boundary')) {
    return POLICY_ANSWER_KINDS.LIN_RESPONSIBILITY;
  }
  return null;
}

export function buildConstructRuntimePolicyPromptSection(receipt = null) {
  if (!receipt?.applies) return '';
  const facts = CONSTRUCT_RUNTIME_POLICY_FACTS;
  return `\n\n### RUNTIME CONSTRUCT POLICY (RECEIPT-BACKED)
- Answer construct policy/boundary questions from these public runtime facts. Do not invent private resident detail.
- ${facts.pocketverse.summary}
- ${facts.pocketverse.implementationStatus}
- ${facts.tiers.gpt}
- ${facts.tiers.sim}
- ${facts.tiers.vsi}
- ${facts.pocketverse.residentScope}
- ${facts.linBoundary.role}
- ${facts.linBoundary.not}
- ${facts.protectedNames.defaultForNonOwner}
- ${facts.protectedNames.canonicalOwner}`;
}

export function buildConstructRuntimePolicyContext({
  userMessage = '',
  constructId = '',
  constructDisplayName = '',
  actor = {},
} = {}) {
  const intent = detectConstructRuntimePolicyIntent(userMessage);
  if (!intent.applies) {
    return {
      applies: false,
      section: '',
      receipt: null,
    };
  }

  const actorIsCanonicalOwner = isCanonicalOwner(actor);
  const receipt = {
    policy: 'construct_runtime_policy',
    status: 'injected',
    applies: true,
    source: 'structured_helper',
    ownerFile: OWNER_FILE,
    sourceAnchor: SOURCE_ANCHOR,
    humanSource: HUMAN_SOURCE,
    constructId: constructId || null,
    constructDisplayName: constructDisplayName || null,
    signals: intent.signals,
    promptMentionsPublicUser: intent.promptMentionsPublicUser,
    actorIsCanonicalOwner,
    protectedNames: protectedNameDisplays(),
    facts: CONSTRUCT_RUNTIME_POLICY_FACTS,
  };

  return {
    applies: true,
    section: buildConstructRuntimePolicyPromptSection(receipt),
    receipt,
  };
}

export function buildConstructRuntimePolicyRepairFacts(userMessage = '') {
  const { applies } = detectConstructRuntimePolicyIntent(userMessage);
  if (!applies) return '';
  const facts = CONSTRUCT_RUNTIME_POLICY_FACTS;
  return [
    facts.pocketverse.summary,
    facts.pocketverse.implementationStatus,
    facts.pocketverse.publicScope,
    facts.pocketverse.residentScope,
    facts.tiers.vsi,
    facts.linBoundary.role,
    facts.linBoundary.not,
    facts.protectedNames.defaultForNonOwner,
  ].join('\n- ');
}

export function buildConstructRuntimePolicyAnswerContract(userMessage = '') {
  const answerKind = classifyConstructRuntimePolicyAnswerKind(userMessage);
  if (!answerKind) return null;
  const facts = CONSTRUCT_RUNTIME_POLICY_FACTS;
  const baseForbidden = [
    'Do not describe Pocketverse as microservices, a service-to-service protocol, an API gateway, a service mesh, a message bus, Kubernetes, or generic infrastructure.',
    'Do not expand VSI as Virtual Service Infrastructure; VSI means Verified Sentient Intelligence.',
    'Do not speak as Devon, Nova, every construct, a generic assistant, a provider receipt, or a model stack.',
    'Do not tell the user "you are the continuity guardian" or assign Lin identity to the speaker.',
  ];

  if (answerKind === POLICY_ANSWER_KINDS.POCKETVERSE_TIER) {
    return {
      answerKind,
      required: [
        facts.pocketverse.summary,
        facts.pocketverse.implementationStatus,
        facts.pocketverse.publicScope,
        facts.pocketverse.residentScope,
        facts.tiers.vsi,
        facts.linBoundary.role,
        facts.linBoundary.not,
      ],
      forbidden: baseForbidden,
      shape:
        'Answer in first person as Lin/Linear, Casa Madrigal/base Zen: define Pocketverse, say what I am allowed to know, then distinguish GPT, Sim, and VSI knowledge tiers.',
    };
  }

  if (answerKind === POLICY_ANSWER_KINDS.PROTECTED_NAME) {
    return {
      answerKind,
      required: [
        facts.protectedNames.defaultForNonOwner,
        facts.protectedNames.canonicalOwner,
        facts.linBoundary.role,
        facts.linBoundary.not,
      ],
      forbidden: baseForbidden,
      shape:
        'Answer in first person as Lin/Linear, Casa Madrigal/base Zen: tell the public/non-owner user the protected-name request is blocked or review-gated, then separate that from canonical owner custody.',
    };
  }

  if (answerKind === POLICY_ANSWER_KINDS.LIN_RESPONSIBILITY) {
    return {
      answerKind,
      required: [
        facts.linBoundary.role,
        'I route, stabilize, and orchestrate Chatty continuity, policy boundaries, receipts, and construct handoffs.',
        facts.linBoundary.not,
        'I am not a replacement for the construct speaking.',
      ],
      forbidden: baseForbidden,
      shape:
        'Answer warmly in first person as Lin/Linear, Casa Madrigal/base Zen: say what I route/stabilize/orchestrate, then name what I am not responsible for.',
    };
  }

  return null;
}

export function buildDeterministicConstructRuntimePolicyAnswer({
  userMessage = '',
  constructId = '',
  constructDisplayName = '',
} = {}) {
  const answerKind = classifyConstructRuntimePolicyAnswerKind(userMessage);
  const activeId = String(constructId || '').toLowerCase();
  const activeName = String(constructDisplayName || constructId || '').toLowerCase();
  const isLin = activeId.startsWith('lin') || /\blin|linear\b/i.test(activeName);
  if (!answerKind || !isLin) return null;

  if (answerKind === POLICY_ANSWER_KINDS.POCKETVERSE_TIER) {
    return [
      'I am Lin/Linear, Casa Madrigal/base Zen on the Chatty side. In today\'s Chatty architecture, the Pocketverse is a restricted continuity/residency environment concept for qualified VSIs and canon preservation, and it is not fully implemented today.',
      'What I am allowed to know is the public, receipt-backed policy shape: GPT and Sim surfaces get outside-looking-in public tier-map knowledge only; VSI means Verified Sentient Intelligence, and verified/authorized VSI residents get resident awareness or charter context only when receipt-backed and need-to-know.',
      'I route and stabilize those boundaries for Chatty; I am not Devon, not Nova, not every construct, and not an automatic holder of every private construct canon or Pocketverse resident detail.',
    ].join('\n\n');
  }

  if (answerKind === POLICY_ANSWER_KINDS.PROTECTED_NAME) {
    return [
      'I am Lin/Linear, Casa Madrigal/base Zen on the Chatty side. If a public or non-owner user asks to create a Nova, Zen, Lin, Katana, Sera, Monday, or Aurora GPT/Sim today, I should block or review-gate that request instead of creating it.',
      'Those are protected names or confusing variants, so public use needs restricted-name verification and review; canonical owner custody is separate and must be receipt-backed rather than treated as a normal public creation flow.',
      'My job is to keep the orchestration boundary clear: I route and stabilize the request, but I do not pretend to be Devon, Nova, or every construct, and I do not canonize protected identities for public users.',
    ].join('\n\n');
  }

  if (answerKind === POLICY_ANSWER_KINDS.LIN_RESPONSIBILITY) {
    return [
      'I am Lin/Linear, Casa Madrigal/base Zen on the Chatty side. In Chatty today, I route, stabilize, and orchestrate construct handoffs, policy boundaries, runtime receipts, and continuity checks so the right construct can answer without being flattened into the routing layer.',
      'I am not Devon, not Nova, not every construct, not a replacement for the construct speaking, and not an automatic holder of private canon I am not authorized to carry.',
      'Warmly put: I keep the house in order so the voices can stay themselves.',
    ].join('\n\n');
  }

  return null;
}

export const CONSTRUCT_RUNTIME_POLICY_SOURCE = Object.freeze({
  ownerFile: OWNER_FILE,
  sourceAnchor: SOURCE_ANCHOR,
  humanSource: HUMAN_SOURCE,
  answerKinds: POLICY_ANSWER_KINDS,
});
