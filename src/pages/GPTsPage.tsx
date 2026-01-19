import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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

export default function AIsPage({ initialOpen = false }: AIsPageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const aiService = AIService.getInstance();
  const [isCreatorOpen, setCreatorOpen] = useState(initialOpen);
  const [ais, setAIs] = useState<AIConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState<AIConfig | null>(null);
  const [avatarBlobs, setAvatarBlobs] = useState<Record<string, string>>({});

  // Load avatars as blobs (fallback if proxy fails)
  useEffect(() => {
    const loadAvatars = async () => {
      const blobMap: Record<string, string> = {};
      const blobPromises: Promise<void>[] = [];

      for (const ai of ais) {
        const avatarUrl = ai.avatar;
        if (avatarUrl && avatarUrl.startsWith("/api/")) {
          const promise = (async () => {
            try {
              console.log(
                `🖼️ [AIsPage] Loading avatar blob for ${ai.id} from: ${avatarUrl}`,
              );
              const response = await fetch(avatarUrl, {
                credentials: "include",
                mode: "cors",
              });
              console.log(`🖼️ [AIsPage] Avatar fetch response for ${ai.id}:`, {
                status: response.status,
                statusText: response.statusText,
                ok: response.ok,
              });

              if (response.ok) {
                const blob = await response.blob();
                console.log(`🖼️ [AIsPage] Avatar blob created for ${ai.id}:`, {
                  size: blob.size,
                  type: blob.type,
                });
                blobMap[ai.id] = URL.createObjectURL(blob);
                console.log(`✅ [AIsPage] Avatar blob URL set for ${ai.id}`);
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
      console.log(
        `📊 [AIsPage] Loaded ${Object.keys(blobMap).length} avatar blobs:`,
        Object.keys(blobMap),
      );
      setAvatarBlobs(blobMap);
    };

    if (ais.length > 0) {
      loadAvatars();
    }

    // Cleanup blob URLs on unmount or when ais change
    return () => {
      Object.values(avatarBlobs).forEach(URL.revokeObjectURL);
    };
  }, [ais]);

  // Route controls modal state
  useEffect(() => {
    const editMatch = location.pathname.match(/\/app\/ais\/edit\/([^/]+)/);
    if (location.pathname.endsWith("/new")) {
      setCreatorOpen(true);
      setEditingConfig(null);
    } else if (editMatch) {
      setCreatorOpen(true);
      loadAIForEdit(editMatch[1]);
    } else {
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
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/9aa5e079-2a3d-44e1-a152-645d01668332",
        {
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
        },
      ).catch(() => {});
      // #endregion
      const allAIs = await aiService.getAllAIs();
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/9aa5e079-2a3d-44e1-a152-645d01668332",
        {
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
        },
      ).catch(() => {});
      // #endregion
      console.log(`📊 [AIsPage] Loaded ${allAIs.length} AIs`);
      console.log(
        `📊 [AIsPage] AIs:`,
        allAIs.map((a) => ({
          id: a.id,
          name: a.name,
          constructCallsign: a.constructCallsign,
        })),
      );
      setAIs(allAIs);
    } catch (error: any) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7243/ingest/9aa5e079-2a3d-44e1-a152-645d01668332",
        {
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
        },
      ).catch(() => {});
      // #endregion
      console.error("Failed to load AIs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAIForEdit = async (id: string) => {
    try {
      const ai = await aiService.getAI(id);
      setEditingConfig(ai);
    } catch (error) {
      console.error("Failed to load AI for edit:", error);
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
      console.log(
        `✅ [AIsPage] Cloned AI ${id} → ${clonedAI.id} (${clonedAI.constructCallsign})`,
      );
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
    setCreatorOpen(false);
    navigate("/app/ais");
    setEditingConfig(null);
    loadAIs(); // Refresh the list
  };

  const handleAICreated = () => {
    loadAIs(); // Refresh the list
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
        ) : (
          <div className="space-y-3">
            {/* AI Cards */}
            {ais.map((ai) => {
              const avatarSrc = avatarBlobs[ai.id] || ai.avatar;
              console.log(
                `🖼️ [AIsPage] Rendering avatar for ${ai.id} (${ai.name}):`,
                {
                  hasAvatar: !!ai.avatar,
                  avatarUrl: ai.avatar,
                  hasBlob: !!avatarBlobs[ai.id],
                  finalSrc: avatarSrc,
                },
              );

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
                        onLoad={() => {
                          console.log(
                            `✅ [AIsPage] Avatar loaded successfully for ${ai.name}`,
                          );
                        }}
                        onError={(e) => {
                          console.error(
                            `❌ [AIsPage] Failed to load avatar for ${ai.name}:`,
                            {
                              avatarUrl: ai.avatar,
                              blobUrl: avatarBlobs[ai.id],
                              currentSrc: e.currentTarget.currentSrc,
                            },
                          );
                          e.currentTarget.style.display = "none";
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
      <AICreator
        isVisible={isCreatorOpen}
        onClose={handleClose}
        onGPTCreated={handleAICreated}
        initialConfig={editingConfig as any}
      />
    </div>
  );
}
