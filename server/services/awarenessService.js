import { createRequire } from "module";
import fs from "fs/promises";
import path from "path";

const require = createRequire(import.meta.url);
let geoipLite = null;

try {
  const loaded = require("geoip-lite");
  geoipLite = loaded?.default ?? loaded ?? null;
} catch (error) {
  console.warn("[AwarenessService] geoip-lite not available; falling back to generic location context");
  geoipLite = null;
}

const NEWS_PATHS = [
  path.join(process.cwd(), "server", "data", "newsDigest.json"),
  path.join(process.cwd(), "server", "data", "newsDigest.sample.json"),
];

const SAMPLE_NEWS = [
  {
    headline: "Global markets hold steady as earnings season kicks off",
    summary:
      "Investors remain cautious but optimistic while major companies prepare to report Q4 performance.",
    sentiment: "neutral",
    category: "economy",
    source: "Chatty Digest",
  },
  {
    headline: "Severe weather system continues moving up the Atlantic coast",
    summary:
      "Heavy rain and snow are forecast across several states; authorities urge residents to monitor local alerts.",
    sentiment: "caution",
    category: "weather",
    source: "Chatty Digest",
  },
  {
    headline: "Breakthrough in renewable storage technology announced",
    summary:
      "Researchers unveiled a new battery chemistry that could double grid-level storage capacity within five years.",
    sentiment: "positive",
    category: "technology",
    source: "Chatty Digest",
  },
];

function stringifyDate(date, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function loadNewsDigest() {
  for (const filePath of NEWS_PATHS) {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed?.stories)) {
        return parsed.stories;
      }
    } catch (error) {
      // Ignore missing/invalid files and continue to fallbacks
    }
  }
  return SAMPLE_NEWS;
}

function computeMood(news) {
  if (!Array.isArray(news) || news.length === 0) {
    return { baseline: "steady", drivers: [] };
  }

  const drivers = [];
  let score = 0;

  for (const story of news) {
    const sentiment = (story.sentiment || "").toLowerCase();
    if (sentiment.includes("negative") || sentiment.includes("caution")) {
      score -= 1;
      if (story.headline) {
        drivers.push(`Alert: ${story.headline}`);
      }
    } else if (sentiment.includes("positive")) {
      score += 1;
      if (story.headline) {
        drivers.push(`Encouraging: ${story.headline}`);
      }
    }
  }

  let baseline = "steady";
  if (score <= -2) baseline = "somber";
  else if (score >= 2) baseline = "bright";
  else if (score < 0) baseline = "cautious";
  else if (score > 0) baseline = "upbeat";

  return { baseline, drivers };
}

function partOfDay(date) {
  const hour = date.getHours();
  if (hour < 6) return "late night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function greetingForHour(hour) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good evening";
}

function createTimeContextSnapshot({ now = new Date(), timeZone }) {
  const resolvedZone = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const localDate = new Date(now.toLocaleString("en-US", { timeZone: resolvedZone }));
  const hour = localDate.getHours();
  const minute = localDate.getMinutes();
  const weekday = localDate.toLocaleDateString("en-US", { weekday: "long" });
  const fullDate = localDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const shortDate = localDate.toLocaleDateString("en-US");
  const localTime = localDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const part = partOfDay(localDate);
  const isWeekend = localDate.getDay() === 0 || localDate.getDay() === 6;
  const isBusinessHours = !isWeekend && hour >= 9 && hour < 17;

  return {
    server: now.toISOString(),
    localISO: localDate.toISOString(),
    display: stringifyDate(localDate, resolvedZone),
    timezone: resolvedZone,
    weekday,
    partOfDay: part,
    timeOfDay: part,
    fullDate,
    shortDate,
    localTime,
    dayOfWeek: weekday,
    isWeekend,
    isBusinessHours,
    greeting: greetingForHour(hour),
    hour,
    minute,
    timestampMs: now.getTime(),
  };
}

function buildTimePromptLines(ctx) {
  if (!ctx) return "";
  const lines = [
    "Current temporal context:",
    `- Date: ${ctx.fullDate || ctx.display || ctx.localISO}`,
    `- Time: ${ctx.localTime || ctx.display || ctx.localISO}`,
    `- Time of day: ${ctx.timeOfDay || ctx.partOfDay}`,
  ];
  if (ctx.dayOfWeek) {
    lines.push(`- Day: ${ctx.dayOfWeek}`);
  }
  if (ctx.timezone) {
    lines.push(`- Timezone: ${ctx.timezone}`);
  }
  if (typeof ctx.isWeekend === "boolean") {
    lines.push(ctx.isWeekend ? "- It is the weekend." : "- It is a weekday.");
  }
  if (typeof ctx.isBusinessHours === "boolean") {
    lines.push(
      ctx.isBusinessHours
        ? "- During local business hours."
        : "- Outside local business hours."
    );
  }
  lines.push(
    "",
    "You are aware of the current time and can reference it naturally in conversation."
  );
  return lines.join("\n");
}

function resolveGeoContext(req) {
  const ip = resolveClientIp(req);
  const isLoopback =
    ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "localhost";
  const lookup = !isLoopback && geoipLite ? geoipLite.lookup(ip) : null;
  const timeZone = lookup?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    ip: isLoopback ? "127.0.0.1" : ip,
    lookup,
    timeZone,
    isLoopback,
  };
}

export function getTimeContext(options = {}) {
  const { req, now = new Date(), timeZone, log = true } = options || {};
  let resolvedZone = timeZone;
  if (!resolvedZone && req) {
    const geo = resolveGeoContext(req);
    resolvedZone = geo.timeZone;
  }
  const ctx = createTimeContextSnapshot({ now, timeZone: resolvedZone });
  if (log) {
    console.log("[AwarenessService] Time context:", ctx);
  }
  return ctx;
}

export function getTimePromptContext(ctx) {
  return buildTimePromptLines(ctx);
}

export function getTimeGreeting(ctx) {
  return ctx?.greeting || "Hello";
}

function resolveClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || "127.0.0.1";
}

function normalizeRuntime(runtimeId = "zen") {
  const id = (runtimeId || "zen").toLowerCase();
  if (id === "lin" || id === "linear" || id === "baseline") {
    return {
      id: "lin",
      name: "Lin",
      mode: "lin",
      tone: "Direct, precise, unfiltered responses.",
      description: "Linear baseline runtime without tone normalization.",
    };
  }
  return {
    id: "zen",
    name: "Zen",
    mode: "zen",
    tone: "Warm, conversational synthesis with adaptive empathy.",
    description: "Chatty's calibrated orchestration layer blending helper seats.",
  };
}

export async function buildRuntimeAwareness(req, runtimeId) {
  const runtime = normalizeRuntime(runtimeId);
  const geo = resolveGeoContext(req);
  const now = new Date();
  const timeContext = getTimeContext({ now, timeZone: geo.timeZone, log: false });
  const news = await loadNewsDigest();
  const mood = computeMood(news);

  return {
    timestamp: now.toISOString(),
    runtime: {
      id: runtime.id,
      name: runtime.name,
      mode: runtime.mode,
      tone: runtime.tone,
      description: runtime.description,
    },
    identity: {
      email: req.user?.email || null,
      name: req.user?.name || null,
    },
    ip: geo.ip,
    location: geo.lookup
      ? {
          city: geo.lookup.city || null,
          region: geo.lookup.region || null,
          country: geo.lookup.country || null,
          timezone: geo.lookup.timezone || timeContext.timezone,
          ll: Array.isArray(geo.lookup.ll) ? { lat: geo.lookup.ll[0], lon: geo.lookup.ll[1] } : undefined,
        }
      : {
          city: null,
          region: null,
          country: null,
          timezone: timeContext.timezone,
        },
    time: timeContext,
    news: news.slice(0, 5),
    mood,
    ui: {
      panels: ["sidebar", "composer", "runtime-switcher", "memory", "projects"],
      focusTips: [
        "Sidebar pins your active runtimes and imported personas.",
        "Use the runtime switcher to move between Synth, Lin, and imported personas.",
        "Composer supports files, slash commands, and tone overrides.",
      ],
    },
    notes: [
      `Runtime mode: ${runtime.mode}`,
      `Time of day: ${timeContext.timeOfDay}`,
      `Local time: ${timeContext.localTime} (${timeContext.fullDate})`,
      `News mood baseline: ${mood.baseline}`,
    ],
  };
}
