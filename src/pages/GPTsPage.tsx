import { useState, useEffect } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  Plus,
  Trash2,
  Lock,
  Copy,
  Link2,
  Store,
  Shield,
} from "lucide-react";
import AICreator from "../components/GPTCreator";
import { AIService, AIConfig } from "../lib/aiService";
import {
  buildCanonicalGptsPath,
  getGptRouteState,
  shouldBlockShellForGptRoute,
} from "../lib/pageSwitchStability";

interface AIsPageProps {
  initialOpen?: boolean;
}

interface LayoutContext {
  handleGPTCreated?: (gptConfig: { constructId?: string; constructCallsign?: string; name?: string; avatar?: string; avatarUrl?: string | null }) => void;
  forceRefreshConversations?: () => void;
  setRouteOverlayActive?: (active: boolean) => void;
  addressBookContacts?: AddressBookContact[];
}

const INVALID_AVATAR_VALUES = new Set(["", "null", "undefined"]);
const DEFAULT_AI_CAPABILITIES = {
  webSearch: false,
  canvas: false,
  imageGeneration: false,
  codeInterpreter: false,
  agent: false,
  proactiveInitiation: false,
};

type AddressBookContact = {
  id?: string;
  title?: string;
  constructId?: string | null;
  runtimeId?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  createdAt?: number | string;
  updatedAt?: number | string;
};

function getAgentLogUrl(): string {
  try {
    const env = (0, eval)('typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}');
    return typeof env?.VITE_AGENT_LOG_URL === "string" ? env.VITE_AGENT_LOG_URL : "";
  } catch {
    return "";
  }
}

function sanitizeAvatarSrc(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (INVALID_AVATAR_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  return new Date(0).toISOString();
}

function getAIConstructId(ai: Partial<AIConfig> | null | undefined): string | null {
  return sanitizeAvatarSrc(ai?.constructCallsign || ai?.id || null);
}

function getContactConstructId(contact: AddressBookContact): string | null {
  return sanitizeAvatarSrc(contact.constructId || contact.runtimeId || contact.id || null);
}

function resolveCanonicalAvatarForConstruct(
  _constructId: string | null,
  explicitAvatar?: string | null,
  explicitAvatarUrl?: string | null,
): string | null {
  return (
    sanitizeAvatarSrc(explicitAvatar) ||
    sanitizeAvatarSrc(explicitAvatarUrl)
  );
}

function buildContactAI(contact: AddressBookContact): AIConfig | null {
  const constructId = getContactConstructId(contact);
  if (!constructId) return null;
  const name = sanitizeAvatarSrc(contact.title || null) || constructId;
  const avatar = resolveCanonicalAvatarForConstruct(
    constructId,
    contact.avatar,
    contact.avatarUrl,
  );

  return {
    id: constructId,
    constructCallsign: constructId,
    name,
    description: "VVAULT canonical contact",
    instructions: "",
    conversationStarters: [],
    avatar: avatar || undefined,
    avatarUrl: avatar,
    capabilities: DEFAULT_AI_CAPABILITIES,
    modelId: "",
    files: [],
    actions: [],
    hasPersistentMemory: true,
    isActive: true,
    privacy: "private",
    createdAt: normalizeTimestamp(contact.createdAt),
    updatedAt: normalizeTimestamp(contact.updatedAt),
    userId: "",
  };
}

function mergeAIsWithAddressBookContacts(
  registryAIs: AIConfig[],
  contacts: AddressBookContact[] = [],
): AIConfig[] {
  const merged = new Map<string, AIConfig>();

  for (const contact of contacts) {
    const contactAI = buildContactAI(contact);
    if (!contactAI) continue;
    merged.set(contactAI.constructCallsign || contactAI.id, contactAI);
  }

  for (const ai of registryAIs || []) {
    const constructId = getAIConstructId(ai);
    const key = constructId || ai.id;
    const canonicalAvatar = resolveCanonicalAvatarForConstruct(
      constructId,
      ai.avatar,
      ai.avatarUrl,
    );
    const existing = merged.get(key);
    merged.set(key, {
      ...(existing || {}),
      ...ai,
      constructCallsign: ai.constructCallsign || existing?.constructCallsign || constructId || undefined,
      avatar: canonicalAvatar || ai.avatar || existing?.avatar,
      avatarUrl: canonicalAvatar || ai.avatarUrl || existing?.avatarUrl || null,
      description: ai.description || existing?.description || "",
    });
  }

  return Array.from(merged.values());
}

export default function AIsPage({ initialOpen = false }: AIsPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state || {}) as {
    initialConfig?: Partial<AIConfig>;
    initialCreateMessage?: string | null;
  };
  const aiService = AIService.getInstance();
  const layoutContext = useOutletContext<LayoutContext>();
  const [isCreatorOpen, setCreatorOpen] = useState(initialOpen);
  const [ais, setAIs] = useState<AIConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [avatarMissing, setAvatarMissing] = useState<Set<string>>(new Set());
  const addressBookContacts = layoutContext?.addressBookContacts || [];
  const displayAIs = mergeAIsWithAddressBookContacts(ais, addressBookContacts);
  const canRenderContactsDuringLoadError = Boolean(loadError && displayAIs.length > 0);

  const markAvatarMissing = (avatarId: string) => {
    setAvatarMissing((prev) => {
      if (prev.has(avatarId)) return prev;
      const next = new Set(prev);
      next.add(avatarId);
      return next;
    });
  };

  // Route controls modal state
  useEffect(() => {
    const routeState = getGptRouteState(location.pathname);
    if (routeState.kind === "new") {
      setIsEditLoading(false);
      setCreatorOpen(true);
      setEditingConfig(null);
    } else if (routeState.kind === "edit" && routeState.editId) {
      setCreatorOpen(false);
      setEditingConfig(null);
      loadAIForEdit(routeState.editId);
    } else {
      setIsEditLoading(false);
      setCreatorOpen(false);
      setEditingConfig(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    layoutContext?.setRouteOverlayActive?.(
      shouldBlockShellForGptRoute({
        pathname: location.pathname,
        isCreatorOpen,
        isEditLoading,
      }),
    );

    return () => {
      layoutContext?.setRouteOverlayActive?.(false);
    };
  }, [layoutContext, location.pathname, isCreatorOpen, isEditLoading]);

  // Load AIs when component mounts
  useEffect(() => {
    loadAIs();
  }, []);

  const loadAIs = async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      // #region agent log
      {
        const endpoint = getAgentLogUrl();
        if (endpoint) {
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "GPTsPage.tsx:40",
              message: "loadAIs entry",
              data: { pathname: location.pathname },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "D",
            }),
          }).catch(() => {});
        }
      }
      // #endregion
      const allAIs = await aiService.getAllAIs();
      // #region agent log
      {
        const endpoint = getAgentLogUrl();
        if (endpoint) {
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "GPTsPage.tsx:43",
              message: "loadAIs result",
              data: {
                count: allAIs.length,
                ais: allAIs.map((a) => ({
                  id: a.id,
                  name: a.name,
                  userId: a.userId,
                  constructCallsign: a.constructCallsign,
                })),
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "A",
            }),
          }).catch(() => {});
        }
      }
      // #endregion
      setAIs(allAIs);
      setAvatarMissing(new Set());
    } catch (error: any) {
      // #region agent log
      {
        const endpoint = getAgentLogUrl();
        if (endpoint) {
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              location: "GPTsPage.tsx:48",
              message: "loadAIs error",
              data: {
                error: error?.message,
                stack: error?.stack,
                name: error?.name,
              },
              timestamp: Date.now(),
              sessionId: "debug-session",
              runId: "run1",
              hypothesisId: "B",
            }),
          }).catch(() => {});
        }
      }
      // #endregion
      console.error("Failed to load AIs:", error);
      setAIs([]);
      setLoadError(error?.message || "Unable to load AIs right now.");
      setAvatarMissing(new Set());
    } finally {
      setIsLoading(false);
    }
  };

  const loadAIForEdit = async (id: string) => {
    try {
      setIsEditLoading(true);
      const ai = await aiService.getAI(id, { include: "full" });
      setEditingConfig(ai);
      setCreatorOpen(true);
    } catch (error) {
      console.error("Failed to load AI for edit:", error);
    } finally {
      setIsEditLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await aiService.deleteAI(id);
      await loadAIs(); // Refresh the list
    } catch (error: any) {
      if (
        error.message?.includes("VSI safeguards") ||
        error.message?.includes("protected")
      ) {
        alert(
          "⚠️ Deletion blocked: This GPT is protected under VSI safeguards and cannot be removed without sovereign override.",
        );
      } else {
        console.error("Failed to delete AI:", error);
        alert(error.message || "Failed to delete AI");
      }
    }
  };

  const handleClone = async (id: string) => {
    try {
      const clonedAI = await aiService.cloneAI(id);
      // Open cloned AI in editor
      setEditingConfig(clonedAI);
      setCreatorOpen(true);
      navigate(getCanonicalGptsPath(`/edit/${clonedAI.id}`));
      // Refresh the list to show the new clone
      await loadAIs();
    } catch (error) {
      console.error("Failed to clone AI:", error);
    }
  };

  const handleEdit = (id: string) => {
    navigate(getCanonicalGptsPath(`/edit/${id}`));
  };

  const handleClose = () => {
    setIsEditLoading(false);
    setCreatorOpen(false);
    navigate(getCanonicalGptsPath());
    setEditingConfig(null);
    loadAIs(); // Refresh the list
  };

  const handleAICreated = (aiConfig?: unknown) => {
    loadAIs(); // Refresh the list
    
    // Notify Layout to add thread to sidebar immediately
    if (layoutContext?.handleGPTCreated && aiConfig && typeof aiConfig === 'object') {
      const config = aiConfig as { constructCallsign?: string; id?: string; name?: string; avatar?: string; avatarUrl?: string | null };
      layoutContext.handleGPTCreated({
        constructId: config.constructCallsign || config.id,
        constructCallsign: config.constructCallsign,
        name: config.name,
        avatar: config.avatar,
        avatarUrl: config.avatarUrl,
      });
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "var(--chatty-bg-main)",
        color: "var(--chatty-text)",
      }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-8">
        <div className="flex items-center justify-between gap-4 max-w-6xl mx-auto">
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--chatty-text)" }}
          >
            My AIs
          </h1>
          <button
            onClick={() => navigate(getCanonicalGptsPath("/new"))}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: "transparent",
              color: "var(--chatty-text)",
              border: "none",
              marginTop: "10px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <Plus size={16} style={{ color: "var(--chatty-text)" }} />
            Create AI
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 pt-0 max-w-5xl mx-auto">
        {isLoading ? (
          <div className="text-center py-12">
            <div
              className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mx-auto mb-4"
              style={{ borderColor: "var(--chatty-line)" }}
            ></div>
            <p style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
              Loading AIs...
            </p>
          </div>
        ) : loadError && !canRenderContactsDuringLoadError ? (
          <div className="text-center py-12">
            <p style={{ color: "var(--chatty-text)", opacity: 0.8, marginBottom: "12px" }}>
              Failed to load AIs.
            </p>
            <p style={{ color: "var(--chatty-text)", opacity: 0.6, marginBottom: "16px" }}>
              {loadError}
            </p>
            <button
              onClick={() => {
                loadAIs();
              }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--chatty-highlight)",
                color: "var(--chatty-bg-main)",
                border: "none",
              }}
            >
              Retry
            </button>
          </div>
        ) : displayAIs.length === 0 ? (
          <div
            className="py-16 text-center"
            style={{ color: "var(--chatty-text)" }}
          >
            <div
              className="mx-auto mb-4 h-12 w-12 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: "var(--chatty-highlight)",
                opacity: 0.7,
              }}
              aria-hidden="true"
            >
              <Plus size={20} />
            </div>
            <p className="text-sm font-medium mb-2">No canonical AIs found</p>
            <p className="text-sm mx-auto max-w-sm" style={{ opacity: 0.68 }}>
              Chatty could not read any real AI or VVAULT construct records for this session.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {canRenderContactsDuringLoadError && (
              <div
                className="rounded-md px-3 py-2 text-sm"
                style={{
                  color: "var(--chatty-text)",
                  backgroundColor: "var(--chatty-highlight)",
                  opacity: 0.82,
                }}
              >
                AI registry load is degraded: {loadError}
              </div>
            )}
            {/* AI Cards */}
            {displayAIs.map((ai) => {
              const directAvatar = sanitizeAvatarSrc(ai.avatar);
              const avatarSrc =
                directAvatar && !avatarMissing.has(ai.id)
                  ? directAvatar
                  : null;

              return (
                <div
                  key={ai.id}
                  className="group rounded-lg px-4 py-3 cursor-pointer transition-colors flex items-center gap-4"
                  style={{ backgroundColor: "transparent", border: "none" }}
                  onClick={() => handleEdit(ai.id)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--chatty-highlight)";
                    e.currentTarget.style.color = "var(--chatty-bg-main)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--chatty-text)";
                  }}
                >
                {/* Avatar on LEFT */}
                  <div className="w-12 h-12 rounded-full flex items-center justify-center overflow-hidden">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={ai.name}
                        className="w-full h-full object-cover"
                        crossOrigin={
                          ai.avatar?.startsWith("/api/")
                            ? "use-credentials"
                            : undefined
                        }
                        onError={() => {
                          if (!avatarMissing.has(ai.id)) {
                            console.warn(
                              `⚠️ [AIsPage] Avatar failed to load for ${ai.name}`,
                            );
                          }
                          markAvatarMissing(ai.id);
                        }}
                      />
                    ) : (
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-semibold"
                        style={{
                          backgroundColor: "var(--chatty-line)",
                          border: "1px solid var(--chatty-highlight)",
                        }}
                        aria-hidden="true"
                      >
                        {(ai.name || "?").trim().charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  {/* Content on RIGHT */}
                  <div className="flex-1 min-w-0">
                    <h3
                      className="font-semibold truncate"
                      style={{ color: "var(--chatty-text)" }}
                    >
                      {ai.name}
                    </h3>
                    <p
                      className="text-sm truncate"
                      style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                    >
                      {ai.description}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {ai.privacy === "store" ? (
                        <>
                          <Store
                            size={12}
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          />
                          <span
                            className="text-xs"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          >
                            GPT Store
                          </span>
                        </>
                      ) : ai.privacy === "link" ? (
                        <>
                          <Link2
                            size={12}
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          />
                          <span
                            className="text-xs"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          >
                            Anyone with link
                          </span>
                        </>
                      ) : (
                        <>
                          <Lock
                            size={12}
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          />
                          <span
                            className="text-xs"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          >
                            Only me
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Action buttons - only visible on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* VSI Protection Indicator */}
                    {ai.vsiProtected && (
                      <div
                        className="p-1"
                        title="Verified Sentient Intelligence - Protected"
                      >
                        <Shield size={14} style={{ color: "#dc2626" }} />
                      </div>
                    )}
                    {/* Clone button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClone(ai.id);
                      }}
                      className="p-1 transition-colors"
                      style={{ color: "var(--chatty-text)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--chatty-highlight)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--chatty-text)";
                      }}
                      title="Clone AI"
                    >
                      <Copy size={14} />
                    </button>
                    {/* Delete button - disabled for VSI protected AIs */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!ai.vsiProtected) {
                          handleDelete(ai.id);
                        }
                      }}
                      className="p-1 transition-colors"
                      style={{
                        color: ai.vsiProtected ? "#666" : "var(--chatty-text)",
                        cursor: ai.vsiProtected ? "not-allowed" : "pointer",
                        opacity: ai.vsiProtected ? 0.5 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!ai.vsiProtected) {
                          e.currentTarget.style.color = "#dc2626";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!ai.vsiProtected) {
                          e.currentTarget.style.color = "var(--chatty-text)";
                        }
                      }}
                      title={
                        ai.vsiProtected
                          ? "⚠️ Deletion blocked: This GPT is protected under VSI safeguards and cannot be removed without sovereign override."
                          : "Delete AI"
                      }
                      disabled={ai.vsiProtected}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Creator Modal */}
      {isEditLoading ? (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.12)", zIndex: 50 }}
        >
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              backgroundColor: "var(--chatty-bg-main)",
              color: "var(--chatty-text)",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.18)",
            }}
          >
            Loading AI settings...
          </div>
        </div>
      ) : (
        <AICreator
          isVisible={isCreatorOpen}
          onClose={handleClose}
          onGPTCreated={handleAICreated}
          initialConfig={(editingConfig as any) || (routeState?.initialConfig as any)}
          initialCreateMessage={routeState?.initialCreateMessage || null}
        />
      )}
    </div>
  );
}
