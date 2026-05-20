import {
  buildZenProductModeProfile,
  isZenProductAlias,
  resolveZenProductSurface,
  type ZenProductMode,
  type ZenProductPermissions,
  type ZenProductScope,
  type ZenProductSurface,
} from "./zenProductRegistry";

export type ZenSurface = ZenProductSurface;

export type ZenModeEnvelope = {
  constructId: "zen-001";
  sessionId: "zen-001_chat_with_zen-001";
  surface: ZenSurface;
  mode: ZenProductMode;
  scope: ZenProductScope;
  permissions: ZenProductPermissions;
  mutationRequiresApproval: boolean;
  commandTokens: string[];
  cleanedPrompt: string;
};

type ZenCommandKind = "dev" | "safe" | "recover";

const ZEN_CONSTRUCT_ID = "zen-001" as const;
const ZEN_SESSION_ID = "zen-001_chat_with_zen-001" as const;

const COMMAND_ALIASES: Record<string, ZenCommandKind> = {
  "/dev": "dev",
  "/safe": "safe",
  "/recover": "recover",
};

function isCommandToken(token: string): token is `/${string}` {
  return token.startsWith("/");
}

function resolveSurface(surface: string | ZenSurface | undefined): ZenSurface {
  return resolveZenProductSurface(surface, "chatty");
}

function resolveTargetSurface(token: string | undefined, fallback: ZenSurface): ZenSurface {
  if (!token) {
    return fallback;
  }

  return resolveZenProductSurface(token, fallback);
}

function resolveCommandKind(token: string | undefined): ZenCommandKind | null {
  if (!token) {
    return null;
  }

  return COMMAND_ALIASES[token.toLowerCase()] || null;
}

function stripLeadingCommands(raw: string, fallbackSurface: ZenSurface): {
  commandTokens: string[];
  commandKind: ZenCommandKind | null;
  surface: ZenSurface;
  cleanedPrompt: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      commandTokens: [],
      commandKind: null,
      surface: fallbackSurface,
      cleanedPrompt: "",
    };
  }

  const tokens = trimmed.split(/\s+/);
  const commandTokens: string[] = [];
  let commandKind: ZenCommandKind | null = null;
  let surface = fallbackSurface;
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];
    if (!isCommandToken(token)) {
      break;
    }

    const normalized = token.toLowerCase();
    const maybeCommand = resolveCommandKind(normalized);
    if (maybeCommand && commandKind === null) {
      commandKind = maybeCommand;
      commandTokens.push(normalized);
      index += 1;

      const nextToken = tokens[index];
      const maybeTarget = resolveTargetSurface(nextToken, surface);
      if (nextToken && isZenProductAlias(nextToken)) {
        surface = maybeTarget;
        commandTokens.push(nextToken.toLowerCase());
        index += 1;
      }
      continue;
    }

    break;
  }

  const cleanedPrompt = tokens.slice(index).join(" ").trim();
  return {
    commandTokens,
    commandKind,
    surface,
    cleanedPrompt,
  };
}

function buildCommandEnvelope(
  surface: ZenSurface,
  commandKind: ZenCommandKind | null
): Pick<
  ZenModeEnvelope,
  "surface" | "mode" | "scope" | "permissions" | "mutationRequiresApproval"
> {
  return buildZenProductModeProfile(surface, commandKind || "default");
}

export function parseZenModeEnvelope(
  rawText: string,
  surface: ZenSurface = "chatty"
): ZenModeEnvelope {
  const fallbackSurface = resolveSurface(surface);
  const parsed = stripLeadingCommands(rawText, fallbackSurface);
  const envelope = buildCommandEnvelope(parsed.surface, parsed.commandKind);

  return {
    constructId: ZEN_CONSTRUCT_ID,
    sessionId: ZEN_SESSION_ID,
    surface: envelope.surface,
    mode: envelope.mode,
    scope: envelope.scope,
    permissions: envelope.permissions,
    mutationRequiresApproval: envelope.mutationRequiresApproval,
    commandTokens: parsed.commandTokens,
    cleanedPrompt: parsed.cleanedPrompt,
  };
}

export const ZEN_SINGLETON_CONSTRUCT_ID = ZEN_CONSTRUCT_ID;
export const ZEN_SINGLETON_SESSION_ID = ZEN_SESSION_ID;
