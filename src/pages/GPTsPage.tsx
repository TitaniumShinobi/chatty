import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import {
  Plus,
  Bot,
  Trash2,
  Lock,
  Copy,
  Link2,
  Store,
  Shield,
} from "lucide-react";
import AICreator from "../components/GPTCreator";
import { AIService, AIConfig } from "../lib/aiService";

interface AIsPageProps {
  initialOpen?: boolean;
}

interface LayoutContext {
  handleGPTCreated?: (gptConfig: { constructId?: string; constructCallsign?: string; name?: string; avatar?: string; avatarUrl?: string | null }) => void;
  forceRefreshConversations?: () => void;
}

const INVALID_AVATAR_VALUES = new Set(["", "null", "undefined"]);

function sanitizeAvatarSrc(value?: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (INVALID_AVATAR_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function addRetryToken(url: string, retryNonce: number): string {
  if (
    !url ||
    retryNonce <= 0 ||
    url.startsWith("data:image/") ||
    url.startsWith("blob:")
  ) {
    return url;
  }
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}retry=${retryNonce}`;
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
  const [avatarBlobs, setAvatarBlobs] = useState<Record<string, string>>({});
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set());
  const [missingAvatars] = useState<Set<string>>(new Set());
  const [avatarRetryNonce, setAvatarRetryNonce] = useState(0);
  const avatarRetryTimersRef = useRef<Record<string, number>>({});

  const retryFailedAvatars = useCallback(() => {
    setFailedAvatars((prev) => {
      if (prev.size === 0) return prev;
      return new Set();
    });
    setAvatarRetryNonce((prev) => prev + 1);
  }, []);

  const markAvatarFailed = useCallback((avatarId: string) => {
    if (missingAvatars.has(avatarId)) return;

    setFailedAvatars((prev) => {
      const next = new Set(prev);
      next.add(avatarId);
      return next;
    });

    if (avatarRetryTimersRef.current[avatarId]) {
      window.clearTimeout(avatarRetryTimersRef.current[avatarId]);
    }
    avatarRetryTimersRef.current[avatarId] = window.setTimeout(() => {
      setFailedAvatars((prev) => {
        const next = new Set(prev);
        next.delete(avatarId);
        return next;
      });
      setAvatarRetryNonce((prev) => prev + 1);
      delete avatarRetryTimersRef.current[avatarId];
    }, 2500);
  }, [missingAvatars]);

  // Load avatars as blobs (fallback if proxy fails)
  useEffect(() => {
    const loadAvatars = async () => {
      const blobMap: Record<string, string> = {};
      const blobPromises: Promise<void>[] = [];

      for (const ai of ais) {
        const avatarUrl = ai.avatar;
        if (
          avatarUrl &&
          avatarUrl.startsWith("/api/")
        ) {
          const fetchUrl = addRetryToken(avatarUrl, avatarRetryNonce);
          const promise = (async () => {
            try {
              const response = await fetch(fetchUrl, {
                credentials: "include",
                mode: "cors",
                cache: "no-store",
              });

              if (response.ok) {
                const blob = await response.blob();
                blobMap[ai.id] = URL.createObjectURL(blob);
              } else if (response.status === 404) {
                console.warn(
                    `⚠️ [AIsPage] Avatar missing for ${ai.id}: ${avatarUrl}`,
                );
                markAvatarFailed(ai.id);
              } else {
                console.error(
                  `❌ [AIsPage] Avatar fetch failed for ${ai.id}: ${response.status} ${response.statusText}`,
                );
              }
            } catch (error: any) {
              console.error(
                `❌ [AIsPage] Failed to load avatar blob for ${ai.id}:`,
                error,
              );
            }
          })();
          blobPromises.push(promise);
        }
      }

      await Promise.all(blobPromises);
      setAvatarBlobs(blobMap);
    };

    if (ais.length > 0) {
      loadAvatars();
    }

    // Cleanup blob URLs on unmount or when ais change
    return () => {
      Object.values(avatarBlobs).forEach(URL.revokeObjectURL);
    };
  }, [ais, avatarRetryNonce, markAvatarFailed]);

  useEffect(() => {
    if (failedAvatars.size === 0) return;
    const retryInterval = window.setInterval(() => {
      retryFailedAvatars();
    }, 7000);
    return () => window.clearInterval(retryInterval);
  }, [failedAvatars, retryFailedAvatars]);

  useEffect(() => {
    const handleReconnect = () => {
      retryFailedAvatars();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        retryFailedAvatars();
      }
    };

    window.addEventListener("online", handleReconnect);
    window.addEventListener("focus", handleReconnect);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleReconnect);
      window.removeEventListener("focus", handleReconnect);
      document.removeEventListener("visibilitychange", handleVisibility);
      for (const timerId of Object.values(avatarRetryTimersRef.current)) {
        window.clearTimeout(timerId);
      }
      avatarRetryTimersRef.current = {};
    };
  }, [retryFailedAvatars]);

  // Route controls modal state
  useEffect(() => {
    const editMatch = location.pathname.match(/\/app\/ais\/edit\/([^/]+)/);
    if (location.pathname.endsWith("/new")) {
      setIsEditLoading(false);
      setCreatorOpen(true);
      setEditingConfig(null);
    } else if (editMatch) {
      setCreatorOpen(false);
      setEditingConfig(null);
      loadAIForEdit(editMatch[1]);
    } else {
      setIsEditLoading(false);
      setCreatorOpen(false);
      setEditingConfig(null);
    }
  }, [location.pathname]);

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
        const endpoint =
          import.meta.env.VITE_AGENT_LOG_URL || "";
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
        const endpoint =
          import.meta.env.VITE_AGENT_LOG_URL || "";
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
    } catch (error: any) {
      // #region agent log
      {
        const endpoint =
          import.meta.env.VITE_AGENT_LOG_URL || "";
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
      navigate(`/app/ais/edit/${clonedAI.id}`);
      // Refresh the list to show the new clone
      await loadAIs();
    } catch (error) {
      console.error("Failed to clone AI:", error);
    }
  };

  const handleEdit = (id: string) => {
    navigate(`/app/ais/edit/${id}`);
  };

  const handleClose = () => {
    setIsEditLoading(false);
    setCreatorOpen(false);
    navigate("/app/ais");
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
            onClick={() => navigate("/app/ais/new")}
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
        ) : loadError ? (
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
        ) : (
          <div className="space-y-3">
            {/* AI Cards */}
            {ais.map((ai) => {
              const directAvatar = sanitizeAvatarSrc(ai.avatar);
              const blobAvatar = sanitizeAvatarSrc(avatarBlobs[ai.id]);
              const directAvatarCanRender =
                directAvatar && !directAvatar.startsWith("/api/");
              const avatarSrc =
                blobAvatar || (directAvatarCanRender ? directAvatar : null);
              const imageSrc = avatarSrc ? addRetryToken(avatarSrc, avatarRetryNonce) : null;

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
                    {failedAvatars.has(ai.id) || missingAvatars.has(ai.id) ? (
                      <Bot size={20} style={{ color: "var(--chatty-text)" }} />
                    ) : imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={ai.name}
                        className="w-full h-full object-cover"
                        crossOrigin={
                          ai.avatar?.startsWith("/api/")
                            ? "use-credentials"
                            : undefined
                        }
                        onLoad={() => {
                          setFailedAvatars((prev) => {
                            if (!prev.has(ai.id)) return prev;
                            const next = new Set(prev);
                            next.delete(ai.id);
                            return next;
                          });
                        }}
                        onError={() => {
                          if (!missingAvatars.has(ai.id)) {
                            console.warn(
                              `⚠️ [AIsPage] Avatar failed to load for ${ai.name}`,
                            );
                          }
                          markAvatarFailed(ai.id);
                        }}
                      />
                    ) : (
                      <Bot size={20} style={{ color: "var(--chatty-text)" }} />
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
