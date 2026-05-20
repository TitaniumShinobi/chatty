export const CANONICAL_GPTS_BASE_PATH = "/app/gpts";

const GPT_ROUTE_FAMILY_PATTERN = /^\/app\/(?:gpts|ais)(?:\/|$)/;
const GPT_NEW_ROUTE_PATTERN = /^\/app\/(?:gpts|ais)\/new$/;
const GPT_EDIT_ROUTE_PATTERN = /^\/app\/(?:gpts|ais)\/edit\/([^/]+)$/;

export type GptRouteState =
  | { kind: "list"; editId: null }
  | { kind: "new"; editId: null }
  | { kind: "edit"; editId: string }
  | { kind: "other"; editId: null };

export type VvaultFailureClassification =
  | "unreachable"
  | "unauthorized"
  | null;

export type VvaultUiStatus =
  | "canonicalAvailable"
  | "authRequired"
  | "unreachable";

export type VvaultUiStatusCopy = {
  title: string;
  message: string;
};

export function buildCanonicalGptsPath(pathSuffix = ""): string {
  return `${CANONICAL_GPTS_BASE_PATH}${pathSuffix}`;
}

export function isGptRouteFamilyPath(pathname: string | null | undefined): boolean {
  return GPT_ROUTE_FAMILY_PATTERN.test(pathname || "");
}

export function getGptRouteState(pathname: string | null | undefined): GptRouteState {
  const normalizedPathname = pathname || "";

  if (GPT_NEW_ROUTE_PATTERN.test(normalizedPathname)) {
    return { kind: "new", editId: null };
  }

  const editMatch = normalizedPathname.match(GPT_EDIT_ROUTE_PATTERN);
  if (editMatch) {
    return { kind: "edit", editId: editMatch[1] };
  }

  if (
    normalizedPathname === buildCanonicalGptsPath() ||
    normalizedPathname === "/app/ais"
  ) {
    return { kind: "list", editId: null };
  }

  return isGptRouteFamilyPath(normalizedPathname)
    ? { kind: "list", editId: null }
    : { kind: "other", editId: null };
}

export function shouldBlockShellForGptRoute({
  pathname,
  isCreatorOpen,
  isEditLoading,
}: {
  pathname: string | null | undefined;
  isCreatorOpen: boolean;
  isEditLoading: boolean;
}): boolean {
  return isGptRouteFamilyPath(pathname) && (isCreatorOpen || isEditLoading);
}

export function shouldHonorAsyncChatNavigation({
  startPath,
  currentPath,
}: {
  startPath: string | null | undefined;
  currentPath: string | null | undefined;
}): boolean {
  return (startPath || "") === (currentPath || "");
}

export function classifyVvaultFailure(
  message: string | null | undefined,
): {
  backendUnavailable: boolean;
  classification: VvaultFailureClassification;
} {
  const normalized = (message || "").toLowerCase();

  if (
    normalized.includes("401") ||
    normalized.includes("unauthorized") ||
    normalized.includes("authentication required") ||
    normalized.includes("shared vvault authentication required")
  ) {
    return {
      backendUnavailable: true,
      classification: "unauthorized",
    };
  }

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("backend route not found") ||
    normalized.includes("404") ||
    normalized.includes("enoent") ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed")
  ) {
    return {
      backendUnavailable: true,
      classification: "unreachable",
    };
  }

  return {
    backendUnavailable: false,
    classification: null,
  };
}

export function deriveVvaultUiStatus({
  backendUnavailable,
  classification,
}: {
  backendUnavailable: boolean;
  classification: VvaultFailureClassification;
}): VvaultUiStatus {
  if (!backendUnavailable) {
    return "canonicalAvailable";
  }

  if (classification === "unauthorized") {
    return "authRequired";
  }

  return "unreachable";
}

export function getVvaultUiStatusCopy(
  status: VvaultUiStatus,
): VvaultUiStatusCopy | null {
  if (status === "canonicalAvailable") {
    return null;
  }

  if (status === "authRequired") {
    return {
      title: "VVAULT auth required",
      message:
        "Canonical VVAULT read/write is blocked until the shared session is authorized.",
    };
  }

  return {
    title: "VVAULT unavailable",
    message:
      "Canonical VVAULT read/write is unavailable. Chatty will not treat local state as canonical.",
  };
}
