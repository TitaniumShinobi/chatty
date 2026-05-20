/**
 * Lightweight associative memory sampler for conversational turns.
 * Selects up to `maxFragments` short fragments from recent history using
 * similarity, recency, and a dash of randomness to keep responses feeling alive.
 */

const MAX_FRAGMENT_LEN = 220;
const MIN_FRAGMENT_LEN = 24;
const RECITAL_FILTERS = [
  /according to the document/i,
  /in the document/i,
  /based on the provided context/i,
  /\.pdf/i,
  /policy/i,
  /guideline/i,
  /according to .*policy/i,
];

function tokenize(text = "") {
  return (text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccardSimilarity(a = "", b = "") {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  const setA = new Set(ta);
  const setB = new Set(tb);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Mulberry32 deterministic RNG for stable sampling when seed is provided.
function mulberry32(seed) {
  let t = seed + 0x6d2b79f5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildRng(seed) {
  if (Number.isInteger(seed)) return mulberry32(seed);
  return Math.random;
}

function shouldDrop(text = "") {
  if (!text) return true;
  if (text.length < MIN_FRAGMENT_LEN) return true;
  return RECITAL_FILTERS.some((re) => re.test(text));
}

function normalizeFragment(text = "") {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length > MAX_FRAGMENT_LEN) {
    return `${trimmed.slice(0, MAX_FRAGMENT_LEN - 1)}…`;
  }
  return trimmed;
}

/**
 * @param {Object} opts
 * @param {string} opts.userMessage
 * @param {Array<{role:string, content:string}>} opts.history
 * @param {number} [opts.maxFragments=2]
 * @param {number} [opts.seed] optional deterministic seed
 * @returns {{ fragments: string[], debug: object }}
 */
export function sampleAssociativeFragments({
  userMessage = "",
  history = [],
  maxFragments = 2,
  seed = null,
} = {}) {
  if (!Array.isArray(history) || history.length === 0 || maxFragments <= 0) {
    return { fragments: [], debug: { activation: "no_history" } };
  }

  const rng = buildRng(Number.isFinite(seed) ? seed : null);
  const activationRoll = rng();
  const activationCount = activationRoll < 0.05 ? 2 : activationRoll < 0.30 ? 1 : 0; // 5% →2, 25%→1, 70%→0

  if (activationCount === 0) {
    return { fragments: [], debug: { activation: "skipped", roll: activationRoll } };
  }

  const candidates = [];
  const total = history.length;
  history.forEach((msg, idx) => {
    const content = typeof msg?.content === "string" ? msg.content : "";
    if (shouldDrop(content)) return;
    const recency = total > 1 ? 1 - idx / total : 1; // closer to 1 for recent
    const similarity = jaccardSimilarity(userMessage, content);
    const randomWeight = rng();
    const score = 0.6 * similarity + 0.2 * randomWeight + 0.2 * recency;
    candidates.push({
      text: normalizeFragment(content),
      recency,
      similarity,
      randomWeight,
      score,
      idx,
    });
  });

  if (!candidates.length) {
    return { fragments: [], debug: { activation: "no_candidates" } };
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked = [];
  const seen = new Set();
  for (const cand of candidates) {
    if (picked.length >= activationCount || picked.length >= maxFragments) break;
    if (seen.has(cand.text)) continue;
    seen.add(cand.text);
    picked.push(cand.text);
  }

  return {
    fragments: picked,
    debug: {
      activation: "selected",
      activationCount,
      roll: activationRoll,
      candidateCount: candidates.length,
      topScores: candidates.slice(0, 3).map((c) => ({ score: c.score, recency: c.recency, similarity: c.similarity })),
    },
  };
}
