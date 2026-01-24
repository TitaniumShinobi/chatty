import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Plus,
  X,
  Upload,
  Search,
  Palette,
  Image,
  Code,
  Save,
  // Trash2,
  // Settings,
  FileText,
  Link,
  Play,
  Bot,
  Paperclip,
  Crop,
} from "lucide-react";
import JSZip from "jszip";
import { GPTService, GPTConfig, GPTFile, GPTAction } from "../lib/gptService";
import { AIService, AIConfig, AIFile, AIAction } from "../lib/aiService";
import { VVAULTConversationManager } from "../lib/vvaultConversationManager";
import { fetchMe, getUserId } from "../lib/auth";
import { useSettings } from "../context/SettingsContext";
import Cropper from "react-easy-crop";
import { Z_LAYERS } from "../lib/zLayers";
import { TranscriptFolderTree } from "./TranscriptFolderTree";
import PersonalityForge from "./PersonalityForge";
import {
  getUserFriendlyErrorMessage,
  isOrchestrationError,
} from "../engine/orchestration/OrchestrationErrors";
import { OPENROUTER_MODELS, OLLAMA_MODELS } from "../lib/modelProviders";

interface GPTCreatorProps {
  isVisible: boolean;
  onClose: () => void;
  onGPTCreated?: (gpt: GPTConfig) => void;
  initialConfig?: GPTConfig | null;
}

const GPTCreator: React.FC<GPTCreatorProps> = ({
  isVisible,
  onClose,
  onGPTCreated,
  initialConfig,
}) => {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<"create" | "configure" | "forge">("create");
  const [gptService] = useState(() => GPTService.getInstance());
  const [aiService] = useState(() => AIService.getInstance());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const [orchestrationMode, setOrchestrationMode] = useState<"lin" | "custom">(
    "lin",
  ); // Tone & Orchestration mode

  // Script Management
  const [scripts, setScripts] = useState<
    Array<{
      key: string;
      name: string;
      description: string;
      status: "running" | "stopped";
      enabled: boolean;
      lastRun: string | null;
      canMessageUser: boolean;
      pid: number | null;
    }>
  >([]);
  const [scriptLogs, setScriptLogs] = useState<Record<string, string[]>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);
  const [stmEnabled, setStmEnabled] = useState(true);
  const [ltmEnabled, setLtmEnabled] = useState(true);
  const [isLoadingScripts, setIsLoadingScripts] = useState(false);

  // Workspace context (auto-loaded like Copilot reads code files)
  const [workspaceContext, setWorkspaceContext] = useState<{
    capsule?: any;
    blueprint?: any;
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    userProfile?: {
      name?: string;
      email?: string;
      nickname?: string;
      occupation?: string;
      tags?: string[];
      aboutYou?: string;
    };
    loaded: boolean;
  }>({ loaded: false });

  // GPT Configuration
  const [config, setConfig] = useState<Partial<GPTConfig>>({
    name: "",
    description: "",
    instructions: "",
    conversationStarters: [""],
    capabilities: {
      webSearch: false,
      canvas: false,
      imageGeneration: false,
      codeInterpreter: true,
    },
    modelId: "openrouter:microsoft/phi-3-mini-128k-instruct",
    conversationModel: "openrouter:microsoft/phi-3-mini-128k-instruct",
    creativeModel: "openrouter:mistralai/mistral-7b-instruct",
    codingModel: "openrouter:deepseek/deepseek-coder-33b-instruct",
  });

  // File management
  const [files, setFiles] = useState<GPTFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [filePage, setFilePage] = useState(1);
  const [filesPerPage] = useState(20); // Show 20 files per page for 300+ files
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarFileName, setAvatarFileName] = useState<string | null>(null);

  // Transcript upload
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const [transcripts, setTranscripts] = useState<
    Array<{
      id: string;
      name: string;
      content: string;
      type: string;
      source?: string;
    }>
  >([]);
  const [existingTranscripts, setExistingTranscripts] = useState<
    Record<
      string,
      Array<{ name: string; type: string; source: string; uploadedAt: string }>
    >
  >({});
  const [allTranscripts, setAllTranscripts] = useState<
    Array<{
      name: string;
      type?: string;
      source?: string;
      year?: string | null;
      month?: string | null;
      startDate?: string | null;
      dateConfidence?: number;
      uploadedAt?: string;
      filename?: string;
    }>
  >([]);
  const [isUploadingTranscripts, setIsUploadingTranscripts] = useState(false);
  const [isLoadingExistingTranscripts, setIsLoadingExistingTranscripts] =
    useState(false);
  const [isAutoOrganizing, setIsAutoOrganizing] = useState(false);
  const [transcriptSource, setTranscriptSource] = useState<string>("");
  const [transcriptYear, setTranscriptYear] = useState<string>("");
  const [transcriptMonth, setTranscriptMonth] = useState<string>("");

  const TRANSCRIPT_SOURCES = [
    { value: "", label: "Select Platform (optional)", icon: "📁" },
    { value: "chatgpt", label: "ChatGPT", icon: "🤖" },
    { value: "gemini", label: "Gemini", icon: "✨" },
    { value: "grok", label: "Grok", icon: "🔮" },
    { value: "copilot", label: "Copilot", icon: "🪁" },
    { value: "claude", label: "Claude", icon: "🎭" },
    { value: "chai", label: "Chai", icon: "🍵" },
    { value: "character.ai", label: "Character.AI", icon: "👤" },
    { value: "deepseek", label: "DeepSeek", icon: "🔍" },
    { value: "codex", label: "Codex", icon: "💻" },
    { value: "github_copilot", label: "GitHub Copilot", icon: "🐙" },
    { value: "other", label: "Other (manual)", icon: "📝" },
  ];

  const TRANSCRIPT_YEARS = [
    { value: "", label: "Year (optional)" },
    { value: "2026", label: "2026" },
    { value: "2025", label: "2025" },
    { value: "2024", label: "2024" },
    { value: "2023", label: "2023" },
  ];

  const TRANSCRIPT_MONTHS = [
    { value: "", label: "Month (optional)" },
    { value: "January", label: "January" },
    { value: "February", label: "February" },
    { value: "March", label: "March" },
    { value: "April", label: "April" },
    { value: "May", label: "May" },
    { value: "June", label: "June" },
    { value: "July", label: "July" },
    { value: "August", label: "August" },
    { value: "September", label: "September" },
    { value: "October", label: "October" },
    { value: "November", label: "November" },
    { value: "December", label: "December" },
  ];

  const getSourceIcon = (source: string) => {
    const found = TRANSCRIPT_SOURCES.find((s) => s.value === source);
    return found?.icon || "📄";
  };

  const getSourceLabel = (source: string) => {
    const found = TRANSCRIPT_SOURCES.find((s) => s.value === source);
    return found?.label || source;
  };

  // Avatar cropping
  const [showCropModal, setShowCropModal] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // Avatar blob URL for API URLs (fallback if proxy fails)
  const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null);

  // Action management
  const [actions, setActions] = useState<GPTAction[]>([]);

  // Preview
  const [previewMessages, setPreviewMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [previewInput, setPreviewInput] = useState("");
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false);
  const [createMessages, setCreateMessages] = useState<
    Array<{
      role: "user" | "assistant";
      content: string;
      timestamp?: number;
      responseTimeMs?: number;
    }>
  >([]);
  const [createInput, setCreateInput] = useState("");
  const [isCreateGenerating, setIsCreateGenerating] = useState(false);
  const createInputRef = useRef<HTMLTextAreaElement>(null);
  const previewInputRef = useRef<HTMLTextAreaElement>(null);

  // Actions Editor
  const [isActionsEditorOpen, setIsActionsEditorOpen] = useState(false);
  const [actionsSchema, setActionsSchema] = useState(`{
  "openapi": "3.1.0",
  "info": {
    "title": "GPT Actions",
    "version": "1.0.0",
    "description": "API endpoints for your GPT to call"
  },
  "servers": [
    {
      "url": "https://api.example.com",
      "description": "Example API server"
    }
  ],
  "paths": {
    "/example": {
      "post": {
        "summary": "Example action",
        "operationId": "exampleAction",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "message": {
                    "type": "string",
                    "description": "Message to send"
                  }
                }
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Success",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "result": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`);

  // Automatically load ALL workspace context when component mounts or constructCallsign changes
  useEffect(() => {
    // Only load if component is visible and we have a constructCallsign
    if (
      !isVisible ||
      !config.constructCallsign ||
      !config.constructCallsign.trim()
    ) {
      return;
    }

    const loadWorkspaceContext = async () => {
      // Auto-loading workspace context

      try {
        // Get user ID
        const { fetchMe, getUserId } = await import("../lib/auth");
        const user = await fetchMe().catch(() => null);
        const userId = user ? getUserId(user) : null;

        if (!userId) {
          console.warn(
            "⚠️ [Lin] Cannot auto-load workspace context: user not authenticated",
          );
          return;
        }

        const conversationManager = VVAULTConversationManager.getInstance();
        const constructCallsign = config.constructCallsign;

        if (!constructCallsign) {
          console.warn(
            "⚠️ [Lin] Cannot load workspace context: constructCallsign is empty",
          );
          setWorkspaceContext((prev) => ({ ...prev, loaded: true }));
          return;
        }

        // Load all context in parallel (like Copilot reads all code files)
        const [capsuleResult, blueprintResult, memoriesResult, profileResult] =
          await Promise.allSettled([
            // Load capsule (handle 404/500 gracefully)
            fetch(
              `/api/vvault/capsules/load?constructCallsign=${encodeURIComponent(constructCallsign)}`,
              {
                credentials: "include",
              },
            )
              .then((res) => {
                if (res.ok) {
                  return res.json();
                } else if (res.status === 404 || res.status === 500) {
                  // Capsule doesn't exist or server error - return null to continue without it
                  return null;
                }
                return null;
              })
              .catch(() => null), // Suppress network errors

            // Load blueprint (handle 404/500 gracefully)
            fetch(
              `/api/vvault/identity/blueprint?constructCallsign=${encodeURIComponent(constructCallsign)}`,
              {
                credentials: "include",
              },
            )
              .then((res) => {
                if (res.ok) {
                  return res.json();
                } else if (res.status === 404 || res.status === 500) {
                  // Blueprint doesn't exist or server error - return null to continue without it
                  return null;
                }
                return null;
              })
              .catch(() => null), // Suppress network errors

            // Load memories (transcripts) - get recent memories
            conversationManager.loadMemoriesForConstruct(
              userId,
              constructCallsign,
              "",
              20,
              settings || {},
            ),

            // Load user profile from /api/vvault/profile (includes personalization)
            fetch("/api/vvault/profile", { credentials: "include" })
              .then((res) => (res.ok ? res.json() : null))
              .then((data) =>
                data?.ok && data.profile
                  ? {
                      ok: true,
                      profile: {
                        name: data.profile.name,
                        email: data.profile.email,
                        nickname: data.profile.nickname,
                        occupation: data.profile.occupation,
                        tags: data.profile.tags,
                        aboutYou: data.profile.aboutYou,
                      },
                    }
                  : null,
              )
              .catch(() => null),
          ]);

        // Process results
        const capsule =
          capsuleResult.status === "fulfilled" && capsuleResult.value?.ok
            ? capsuleResult.value.capsule
            : undefined;

        const blueprint =
          blueprintResult.status === "fulfilled" && blueprintResult.value?.ok
            ? blueprintResult.value.blueprint
            : undefined;

        const memories =
          memoriesResult.status === "fulfilled" ? memoriesResult.value : [];

        const userProfile =
          profileResult.status === "fulfilled" && profileResult.value?.ok
            ? profileResult.value.profile
            : undefined;

        // Update workspace context
        setWorkspaceContext({
          capsule,
          blueprint,
          memories,
          userProfile,
          loaded: true,
        });

        // Workspace context loaded
      } catch (error) {
        console.error("❌ [Lin] Failed to auto-load workspace context:", error);
        // Set loaded to true even on error to prevent infinite retries
        setWorkspaceContext((prev) => ({ ...prev, loaded: true }));
      }
    };

    // Only load if not already loaded for this constructCallsign
    if (!workspaceContext.loaded || workspaceContext.capsule === undefined) {
      loadWorkspaceContext();
    }
  }, [isVisible, config.constructCallsign, settings]); // Reload when constructCallsign changes

  // Fetch existing transcripts when construct changes
  useEffect(() => {
    const fetchExistingTranscripts = async () => {
      const constructId =
        config.constructCallsign || initialConfig?.constructCallsign;
      if (!constructId || !isVisible) return;

      setIsLoadingExistingTranscripts(true);
      try {
        const response = await fetch(
          `/api/transcripts/list/${encodeURIComponent(constructId)}`,
          {
            credentials: "include",
          },
        );

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            if (data.bySource) {
              setExistingTranscripts(data.bySource);
            }
            if (data.transcripts) {
              setAllTranscripts(data.transcripts);
            }
            console.log(
              `📚 [Transcripts] Loaded ${data.transcripts?.length || 0} existing transcripts for ${constructId}`,
            );
          }
        }
      } catch (err) {
        console.warn("Failed to fetch existing transcripts:", err);
      } finally {
        setIsLoadingExistingTranscripts(false);
      }
    };

    fetchExistingTranscripts();
  }, [isVisible, config.constructCallsign, initialConfig?.constructCallsign]);

  // Helper function to normalize avatar URL
  const normalizeAvatarUrl = (
    avatarUrl: string | undefined,
  ): string | undefined => {
    if (!avatarUrl) return undefined;
    // If it's already a base64 data URL, return as is
    if (avatarUrl.startsWith("data:")) return avatarUrl;
    // If it's a relative URL (starts with /), it should work as-is
    // If it's an absolute URL, return as is
    if (avatarUrl.startsWith("http://") || avatarUrl.startsWith("https://"))
      return avatarUrl;
    // If it starts with /api, ensure it's properly formatted
    if (avatarUrl.startsWith("/api")) return avatarUrl;
    // Otherwise, assume it's a relative path and return as is
    return avatarUrl;
  };

  // Load avatar as blob URL if it's an API URL (fallback if proxy fails)
  useEffect(() => {
    let currentBlobUrl: string | null = null;
    let isCancelled = false;

    const loadAvatarBlob = async () => {
      const avatarUrl = config.avatar;

      // Cleanup previous blob URL if it exists
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
      }
      setAvatarBlobUrl(null);

      if (avatarUrl && avatarUrl.startsWith("/api/")) {
        try {
          console.log(`🖼️ [GPTCreator] Loading avatar blob from: ${avatarUrl}`);
          const response = await fetch(avatarUrl, {
            credentials: "include",
            mode: "cors",
          });
          console.log(`🖼️ [GPTCreator] Avatar fetch response:`, {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
          });

          if (isCancelled) return;

          if (response.ok) {
            const blob = await response.blob();
            console.log(`🖼️ [GPTCreator] Avatar blob created:`, {
              size: blob.size,
              type: blob.type,
            });
            if (!isCancelled) {
              const blobUrl = URL.createObjectURL(blob);
              currentBlobUrl = blobUrl;
              setAvatarBlobUrl(blobUrl);
              console.log(
                `✅ [GPTCreator] Avatar blob URL set: ${blobUrl.substring(0, 50)}...`,
              );
            } else {
              URL.revokeObjectURL(URL.createObjectURL(blob));
            }
          } else {
            console.error(
              `❌ [GPTCreator] Avatar fetch failed: ${response.status} ${response.statusText}`,
            );
            setAvatarBlobUrl(null);
          }
        } catch (error: any) {
          console.error(
            `❌ [GPTCreator] Failed to load avatar blob for ${avatarUrl}:`,
            error,
          );
          if (!isCancelled) {
            setAvatarBlobUrl(null);
          }
        }
      } else {
        // Not an API URL, clear blob URL
        setAvatarBlobUrl(null);
      }
    };

    loadAvatarBlob();

    // Cleanup blob URL on unmount or when avatar changes
    return () => {
      isCancelled = true;
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
    };
  }, [config.avatar]);

  // Helper function to detect which service to use based on GPT ID
  const getServiceForGPT = (
    id: string | undefined,
  ): { service: GPTService | AIService; isAIService: boolean } => {
    // GPTs from ais table have IDs starting with 'ai-'
    // GPTs from gpts table have IDs starting with 'gpt-' or no prefix for legacy
    if (id && id.startsWith("ai-")) {
      return { service: aiService as any, isAIService: true };
    }
    return { service: gptService, isAIService: false };
  };

  // Load initial config when provided (for editing existing GPT)
  useEffect(() => {
    if (initialConfig && isVisible) {
      // Loading initial config for editing
      setConfig({
        ...initialConfig,
        avatar: normalizeAvatarUrl(initialConfig.avatar),
      });
      // Extract filename from avatar URL if it's a URL, or set a generic name
      if (initialConfig.avatar) {
        if (initialConfig.avatar.startsWith("/api/")) {
          setAvatarFileName("Avatar loaded");
        } else if (initialConfig.avatar.startsWith("data:")) {
          setAvatarFileName("Uploaded image");
        } else {
          // Try to extract filename from URL
          try {
            const url = new URL(initialConfig.avatar);
            const pathParts = url.pathname.split("/");
            const filename = pathParts[pathParts.length - 1];
            setAvatarFileName(filename || "Avatar loaded");
          } catch {
            setAvatarFileName("Avatar loaded");
          }
        }
      } else {
        setAvatarFileName(null);
      }
      setActiveTab("configure"); // Switch to configure tab when editing

      // Load files for this GPT using the appropriate service
      const loadFiles = async () => {
        try {
          const { service, isAIService } = getServiceForGPT(initialConfig.id!);
          let loadedFiles: GPTFile[] | AIFile[];
          if (isAIService) {
            loadedFiles = await (service as AIService).getFiles(
              initialConfig.id!,
            );
          } else {
            loadedFiles = await (service as GPTService).getFiles(
              initialConfig.id!,
            );
          }
          setFiles(loadedFiles as GPTFile[]);
          // Files loaded
        } catch (error) {
          console.error("Failed to load files:", error);
        }
      };

      // Load actions for this GPT using the appropriate service
      const loadActions = async () => {
        try {
          const { service, isAIService } = getServiceForGPT(initialConfig.id!);
          let loadedActions: GPTAction[] | AIAction[];
          if (isAIService) {
            loadedActions = await (service as AIService).getActions(
              initialConfig.id!,
            );
          } else {
            loadedActions = await (service as GPTService).getActions(
              initialConfig.id!,
            );
          }
          setActions(loadedActions as GPTAction[]);
          // Actions loaded
        } catch (error) {
          console.error("Failed to load actions:", error);
        }
      };

      if (initialConfig.id) {
        loadFiles();
        loadActions();

        // Load scripts for this construct
        const loadScripts = async () => {
          try {
            setIsLoadingScripts(true);
            const constructCallsign = initialConfig.id!.replace("gpt-", "");
            const user = await fetchMe().catch(() => null);
            const userId = user ? getUserId(user) : null;
            if (!userId) return;

            const res = await fetch(
              `/api/scripts/list?construct=${encodeURIComponent(constructCallsign)}`,
              {
                credentials: "include",
              },
            );
            if (res.ok) {
              const data = await res.json();
              if (data.ok && data.scripts) {
                setScripts(data.scripts);
              }
            }
          } catch (error) {
            console.error("Failed to load scripts:", error);
          } finally {
            setIsLoadingScripts(false);
          }
        };

        loadScripts();
      }
    } else if (!initialConfig && isVisible) {
      resetForm();
    }
  }, [isVisible, initialConfig]);

  // Load scripts when config.id changes (for new GPTs)
  useEffect(() => {
    if (!config.id || !isVisible || initialConfig?.id) return;

    const loadScripts = async () => {
      try {
        setIsLoadingScripts(true);
        const constructCallsign = config.id.replace("gpt-", "");
        const user = await fetchMe().catch(() => null);
        const userId = user ? getUserId(user) : null;
        if (!userId) return;

        const res = await fetch(
          `/api/scripts/list?construct=${encodeURIComponent(constructCallsign)}`,
          {
            credentials: "include",
          },
        );
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.scripts) {
            setScripts(data.scripts);

            // Load logs for each script
            const logs: Record<string, string[]> = {};
            for (const script of data.scripts) {
              try {
                const logRes = await fetch(
                  `/api/scripts/logs?construct=${encodeURIComponent(constructCallsign)}&script=${encodeURIComponent(script.key)}&limit=50`,
                  {
                    credentials: "include",
                  },
                );
                if (logRes.ok) {
                  const logData = await logRes.json();
                  if (logData.ok && logData.logs) {
                    logs[script.key] = logData.logs;
                  }
                }
              } catch (error) {
                console.error(`Failed to load logs for ${script.key}:`, error);
              }
            }
            setScriptLogs(logs);
          }
        }
      } catch (error) {
        console.error("Failed to load scripts:", error);
      } finally {
        setIsLoadingScripts(false);
      }
    };

    loadScripts();
  }, [config.id, isVisible, initialConfig]);

  // Clear preview when config changes significantly
  useEffect(() => {
    if (previewMessages.length > 0) {
      // Only clear if it's not the first message (keep initial state)
      const hasSignificantChanges =
        config.name || config.description || config.instructions;
      if (hasSignificantChanges) {
        setPreviewMessages([]);
      }
    }
  }, [
    config.name,
    config.description,
    config.instructions,
    config.modelId,
    config.conversationModel,
    config.creativeModel,
    config.codingModel,
  ]);

  // Note: Removed useEffect that was clearing createMessages when config became complete
  // This was causing the chat to disappear after the first exchange
  // The createMessages should persist throughout the creation process

  // Auto-resize textareas when content changes
  useEffect(() => {
    adjustCreateTextareaHeight();
  }, [createInput]);

  useEffect(() => {
    adjustPreviewTextareaHeight();
  }, [previewInput]);

  // Set default models when Chatty's Lin mode is selected
  useEffect(() => {
    if (orchestrationMode === "lin") {
      setConfig((prev) => ({
        ...prev,
        conversationModel: "openrouter:microsoft/phi-3-mini-128k-instruct",
        creativeModel: "openrouter:mistralai/mistral-7b-instruct",
        codingModel: "openrouter:deepseek/deepseek-coder-33b-instruct",
      }));
    }
  }, [orchestrationMode]);

  // TODO: Accept external capsule data via SimForge injection
  // This will allow future use of structured capsules as source material to pre-fill GPT configuration

  const resetForm = () => {
    setAvatarFileName(null);
    setConfig({
      name: "",
      description: "",
      instructions: "",
      conversationStarters: [""],
      capabilities: {
        webSearch: false,
        canvas: false,
        imageGeneration: false,
        codeInterpreter: true,
      },
      modelId: "openrouter:microsoft/phi-3-mini-128k-instruct",
      conversationModel: "openrouter:microsoft/phi-3-mini-128k-instruct",
      creativeModel: "openrouter:mistralai/mistral-7b-instruct",
      codingModel: "openrouter:deepseek/deepseek-coder-33b-instruct",
      hasPersistentMemory: true, // VVAULT integration - defaults to true
    });
    setFiles([]);
    setActions([]);
    setPreviewMessages([]);
    setPreviewInput("");
    setCreateMessages([]);
    setCreateInput("");
    setError(null);
    setActiveTab("create");
  };

  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const validationErrors = gptService.validateGPTConfig(config);
      if (validationErrors.length > 0) {
        setError(validationErrors.join(", "));
        return;
      }

      // Detect which service to use
      // For existing GPTs, use the service that matches the ID prefix
      // For new GPTs, default to AIService to match GPTsPage behavior
      const { service, isAIService } = config.id
        ? getServiceForGPT(config.id)
        : { service: aiService as any, isAIService: true };

      let gpt: GPTConfig | AIConfig;

      // Prepare the payload - ensure avatar is included if it exists
      const payload: any = { ...config };

      // Ensure avatar is explicitly included in the payload if it exists
      // The backend expects either a data URL (for new uploads) or a filesystem path (for existing)
      if (config.avatar) {
        payload.avatar = config.avatar;
      }

      // Check if we're updating an existing GPT or creating a new one
      if (config.id) {
        // Update existing GPT - use the appropriate service based on ID
        if (isAIService) {
          gpt = await (service as AIService).updateAI(config.id, payload);
        } else {
          gpt = await (service as GPTService).updateGPT(config.id, payload);
        }
        // Update local config with the returned GPT data (which may have updated avatar path)
        // Convert to GPTConfig format (AIConfig and GPTConfig are compatible except for file/action types)
        setConfig((prev) => {
          const configUpdate: Partial<GPTConfig> = {
            ...gpt,
            avatar: gpt.avatar || prev.avatar,
            // Ensure files and actions are in the correct format
            files: (gpt as any).files || prev.files || [],
            actions: (gpt as any).actions || prev.actions || [],
          };
          return { ...prev, ...configUpdate };
        });
      } else {
        // Create new GPT - use AIService by default to match GPTsPage
        if (isAIService) {
          gpt = await (service as AIService).createAI(payload);
        } else {
          gpt = await (service as GPTService).createGPT(payload);
        }
        // Update local config with the new ID and any transformed avatar path
        // Convert to GPTConfig format (AIConfig and GPTConfig are compatible except for file/action types)
        setConfig((prev) => {
          const configUpdate: Partial<GPTConfig> = {
            ...gpt,
            id: gpt.id,
            avatar: gpt.avatar || prev.avatar,
            // Ensure files and actions are in the correct format
            files: (gpt as any).files || prev.files || [],
            actions: (gpt as any).actions || prev.actions || [],
          };
          return { ...prev, ...configUpdate };
        });
      }

      // Upload files after GPT creation/update to avoid FOREIGN KEY constraint
      for (const file of files) {
        if (file.gptId === "temp" && file._file) {
          // Upload the file with the GPT ID using the appropriate service
          if (isAIService) {
            await (service as AIService).uploadFile(gpt.id, file._file);
          } else {
            await (service as GPTService).uploadFile(gpt.id, file._file);
          }
        }
      }

      // Create actions if any (only for new actions)
      for (const action of actions) {
        if (action.name && action.url && !action.id) {
          // Create action using the appropriate service
          if (isAIService) {
            await (service as AIService).createAction(gpt.id, action as any);
          } else {
            await (service as GPTService).createAction(gpt.id, action as any);
          }
        }
      }

      setSaveState("saved");
      setLastSaveTime(new Date().toISOString());
      onGPTCreated?.(gpt as GPTConfig);

      // Auto-fade save status after 2 seconds
      setTimeout(() => {
        setSaveState("idle");
      }, 2000);

      // Don't close modal - allow continued editing
    } catch (error: any) {
      console.error("❌ [GPTCreator] Save error:", error);
      // Check if the error is a JSON parse error (HTML response)
      if (error.message && error.message.includes("JSON")) {
        setError(
          "Server error: Received invalid response. Please check that the backend server is running.",
        );
      } else {
        setError(
          error.message || `Failed to ${config.id ? "save" : "create"} GPT`,
        );
      }
      setSaveState("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    // File upload triggered
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) {
      // No files selected
      return;
    }

    // Processing files
    setIsUploading(true);
    setError(null);

    try {
      // Store files in local state instead of uploading to database
      // Files will be uploaded after GPT creation in handleSave
      for (const file of Array.from(selectedFiles)) {
        const tempFile: GPTFile = {
          id: `temp-${crypto.randomUUID()}`,
          gptId: "temp",
          filename: file.name,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          content: "", // Will be populated during actual upload
          uploadedAt: new Date().toISOString(),
          isActive: true,
          // Store the actual File object for later processing
          _file: file,
        };
        setFiles((prev) => [...prev, tempFile]);
      }
    } catch (error: any) {
      setError(error.message || "Failed to prepare files");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Pagination helpers for 300+ files
  const totalFilePages = Math.ceil(files.length / filesPerPage);
  const currentFiles = files.slice(
    (filePage - 1) * filesPerPage,
    filePage * filesPerPage,
  );

  const goToFilePage = (page: number) => {
    setFilePage(Math.max(1, Math.min(page, totalFilePages)));
  };

  // Build hierarchical path from dropdown selections
  const buildTranscriptPath = (filename: string, zipPath?: string): string => {
    if (zipPath) {
      return zipPath;
    }
    const parts: string[] = [];
    if (transcriptSource) parts.push(transcriptSource);
    if (transcriptYear) parts.push(transcriptYear);
    if (transcriptMonth) parts.push(transcriptMonth);
    if (parts.length === 0) parts.push("transcripts");
    parts.push(filename);
    return parts.join("/");
  };

  // Extract source/year/month from zip file path
  const parseZipPath = (
    zipPath: string,
  ): { source: string; year: string; month: string; filename: string } => {
    const parts = zipPath.split("/").filter((p) => p && !p.startsWith("."));
    const filename = parts.pop() || "";
    let source = "";
    let year = "";
    let month = "";
    for (const part of parts) {
      if (/^\d{4}$/.test(part)) {
        year = part;
      } else if (
        TRANSCRIPT_MONTHS.some(
          (m) => m.value.toLowerCase() === part.toLowerCase(),
        )
      ) {
        month =
          TRANSCRIPT_MONTHS.find(
            (m) => m.value.toLowerCase() === part.toLowerCase(),
          )?.value || part;
      } else if (
        TRANSCRIPT_SOURCES.some(
          (s) =>
            s.value.toLowerCase() === part.toLowerCase() ||
            s.label.toLowerCase() === part.toLowerCase().replace(/_/g, " "),
        )
      ) {
        source =
          TRANSCRIPT_SOURCES.find(
            (s) =>
              s.value.toLowerCase() === part.toLowerCase() ||
              s.label.toLowerCase() === part.toLowerCase().replace(/_/g, " "),
          )?.value || part;
      } else if (!source) {
        source = part.toLowerCase().replace(/\s+/g, "_");
      }
    }
    return { source: source || "transcripts", year, month, filename };
  };

  // Handle transcript file upload (supports .zip, .md, .txt, .rtf, .pdf)
  const handleTranscriptUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit for text files
    const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB limit for PDFs
    const MAX_ZIP_SIZE = 100 * 1024 * 1024; // 100MB limit for zip files

    setIsUploadingTranscripts(true);
    const newTranscripts: Array<{
      id: string;
      name: string;
      content: string;
      type: string;
      source: string;
      year?: string;
      month?: string;
      path: string;
    }> = [];
    const skippedFiles: string[] = [];

    try {
      for (const file of Array.from(uploadedFiles)) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "";

        // Handle zip files - extract and preserve directory structure
        if (ext === "zip") {
          if (file.size > MAX_ZIP_SIZE) {
            skippedFiles.push(`${file.name} (exceeds 100MB limit)`);
            continue;
          }
          try {
            const zip = await JSZip.loadAsync(file);
            const entries = Object.keys(zip.files);
            console.log(`📦 [Zip Upload] Extracting ${entries.length} entries from ${file.name}`);
            for (const entryName of entries) {
              const zipEntry = zip.files[entryName];
              if (zipEntry.dir) continue;
              const entryExt = entryName.split(".").pop()?.toLowerCase() || "";
              if (!["md", "txt", "rtf"].includes(entryExt)) continue;
              try {
                const content = await zipEntry.async("text");
                if (content.length > MAX_FILE_SIZE) {
                  skippedFiles.push(`${entryName} (exceeds 5MB limit)`);
                  continue;
                }
                const parsed = parseZipPath(entryName);
                const entryFilename = parsed.filename || entryName.split("/").pop() || entryName;
                newTranscripts.push({
                  id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  name: entryFilename,
                  content,
                  type: entryExt,
                  source: parsed.source,
                  year: parsed.year,
                  month: parsed.month,
                  path: entryName,
                });
              } catch (entryError) {
                console.warn(`Failed to extract ${entryName}:`, entryError);
                skippedFiles.push(`${entryName} (extraction failed)`);
              }
            }
          } catch (zipError) {
            console.error(`Failed to process zip file ${file.name}:`, zipError);
            skippedFiles.push(`${file.name} (invalid zip file)`);
          }
          continue;
        }

        // Check file size for regular files
        if (ext === "pdf" && file.size > MAX_PDF_SIZE) {
          skippedFiles.push(`${file.name} (exceeds 10MB limit)`);
          continue;
        } else if (
          ["md", "txt", "rtf"].includes(ext) &&
          file.size > MAX_FILE_SIZE
        ) {
          skippedFiles.push(`${file.name} (exceeds 5MB limit)`);
          continue;
        }

        // Read text-based files directly
        if (["md", "txt", "rtf"].includes(ext)) {
          const content = await file.text();
          const path = buildTranscriptPath(file.name);
          newTranscripts.push({
            id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            content,
            type: ext,
            source: transcriptSource || "transcripts",
            year: transcriptYear,
            month: transcriptMonth,
            path,
          });
        } else if (ext === "pdf") {
          const formData = new FormData();
          formData.append("file", file);
          formData.append(
            "constructCallsign",
            config.constructCallsign || initialConfig?.constructCallsign || "",
          );

          try {
            const response = await fetch("/api/transcripts/extract-pdf", {
              method: "POST",
              body: formData,
            });

            const path = buildTranscriptPath(file.name);
            if (response.ok) {
              const result = await response.json();
              newTranscripts.push({
                id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                content: result.content,
                type: "pdf",
                source: transcriptSource || "transcripts",
                year: transcriptYear,
                month: transcriptMonth,
                path,
              });
              if (result.isPdfPlaceholder) {
                console.log(`ℹ️ PDF ${file.name}: ${result.message}`);
              }
            } else {
              console.warn(`Failed to extract PDF: ${file.name}`);
              newTranscripts.push({
                id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: file.name,
                content: `[PDF content from ${file.name} - extraction pending]`,
                type: "pdf",
                source: transcriptSource || "transcripts",
                year: transcriptYear,
                month: transcriptMonth,
                path,
              });
            }
          } catch (pdfError) {
            console.warn(`PDF extraction failed for ${file.name}:`, pdfError);
            const path = buildTranscriptPath(file.name);
            newTranscripts.push({
              id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              name: file.name,
              content: `[PDF content from ${file.name} - extraction pending]`,
              type: "pdf",
              source: transcriptSource || "transcripts",
              year: transcriptYear,
              month: transcriptMonth,
              path,
            });
          }
        }
      }

      setTranscripts((prev) => [...prev, ...newTranscripts]);

      // Save transcripts to Supabase if we have a construct
      const constructId =
        config.constructCallsign || initialConfig?.constructCallsign;
      if (constructId && newTranscripts.length > 0) {
        try {
          const saveResponse = await fetch("/api/transcripts/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              constructCallsign: constructId,
              transcripts: newTranscripts,
            }),
          });

          if (!saveResponse.ok) {
            const errorText = await saveResponse.text();
            console.warn("Failed to save transcripts:", errorText);
            setError(
              "Transcripts added locally but failed to sync to cloud storage.",
            );
          } else {
            const saveResult = await saveResponse.json();

            if (saveResult.failed && saveResult.failed.length > 0) {
              console.warn(
                "Some transcripts failed to save:",
                saveResult.failed,
              );
              setError(
                `Saved ${saveResult.saved} transcripts. ${saveResult.failed.length} failed to save.`,
              );
            } else {
              console.log(
                `✅ Saved ${saveResult.saved} transcripts for ${constructId}`,
              );
            }
          }
        } catch (saveError) {
          console.warn("Failed to save transcripts to backend:", saveError);
          setError(
            "Transcripts added locally but failed to sync to cloud storage.",
          );
        }
      }

      if (skippedFiles.length > 0) {
        setError(`Skipped files: ${skippedFiles.join(", ")}`);
      }
    } catch (error: any) {
      console.error("Transcript upload error:", error);
      setError(error.message || "Failed to upload transcripts");
    } finally {
      setIsUploadingTranscripts(false);
      if (transcriptInputRef.current) {
        transcriptInputRef.current.value = "";
      }
    }
  };

  const handleRemoveTranscript = (transcriptId: string) => {
    setTranscripts((prev) => prev.filter((t) => t.id !== transcriptId));
  };

  const addConversationStarter = () => {
    setConfig((prev) => ({
      ...prev,
      conversationStarters: [...(prev.conversationStarters || []), ""],
    }));
  };

  const removeConversationStarter = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      conversationStarters:
        prev.conversationStarters?.filter((_, i) => i !== index) || [],
    }));
  };

  const updateConversationStarter = (index: number, value: string) => {
    setConfig((prev) => ({
      ...prev,
      conversationStarters:
        prev.conversationStarters?.map((starter, i) =>
          i === index ? value : starter,
        ) || [],
    }));
  };

  const removeAction = (actionId: string) => {
    setActions((prev) => prev.filter((a) => a.id !== actionId));
  };

  const [isGeneratingAvatar, setIsGeneratingAvatar] = useState(false);

  const generateAvatar = async () => {
    if (!config.name) {
      setError("Please enter a name first");
      return;
    }

    try {
      setIsGeneratingAvatar(true);
      setError(null);
      const avatar = await gptService.generateAvatar(
        config.name,
        config.description || "",
      );
      setConfig((prev) => ({ ...prev, avatar }));
      setAvatarFileName("Generated Avatar");
    } catch (error: any) {
      setError(error.message || "Failed to generate avatar");
    } finally {
      setIsGeneratingAvatar(false);
    }
  };

  const handleAvatarUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
      "image/svg+xml",
    ];
    if (!allowedTypes.includes(selectedFile.type)) {
      setError(
        "Please select a valid image file (PNG, JPEG, GIF, WebP, or SVG)",
      );
      return;
    }

    // Validate file size (max 5MB for avatars)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError("Avatar image must be smaller than 5MB");
      return;
    }

    try {
      setError(null);

      // Store the filename for display
      setAvatarFileName(selectedFile.name);

      // Convert file to base64 data URL and show crop modal
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageSrc = e.target?.result as string;
        setImageToCrop(imageSrc);
        setShowCropModal(true);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
      };
      reader.onerror = () => {
        setError("Failed to read image file");
      };
      reader.readAsDataURL(selectedFile);
    } catch (error: any) {
      setError(error.message || "Failed to upload avatar");
    } finally {
      // Reset file input
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  };

  const triggerAvatarUpload = () => {
    avatarInputRef.current?.click();
  };

  // Crop functionality
  const onCropChange = useCallback((crop: any) => {
    setCrop(crop);
  }, []);

  const onCropComplete = useCallback(
    (_croppedArea: any, croppedAreaPixels: any) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    [],
  );

  const getCroppedImg = (imageSrc: string, pixelCrop: any): Promise<string> => {
    return new Promise((resolve, reject) => {
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("No 2d context"));
          return;
        }

        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        ctx.drawImage(
          image,
          pixelCrop.x,
          pixelCrop.y,
          pixelCrop.width,
          pixelCrop.height,
          0,
          0,
          pixelCrop.width,
          pixelCrop.height,
        );

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Canvas is empty"));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read blob"));
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.9,
        );
      };
      image.onerror = () => reject(new Error("Failed to load image"));
      image.src = imageSrc;
    });
  };

  const handleCropComplete = async () => {
    if (!imageToCrop || !croppedAreaPixels) return;

    try {
      setIsUploadingAvatar(true);
      const croppedImage = await getCroppedImg(imageToCrop, croppedAreaPixels);
      setConfig((prev) => ({ ...prev, avatar: croppedImage }));
      setShowCropModal(false);
      setImageToCrop(null);
    } catch (error) {
      console.error("Error cropping image:", error);
      setError("Failed to crop image");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCropCancel = () => {
    setShowCropModal(false);
    setImageToCrop(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!createInput.trim() || isCreateGenerating) return;

    const userMessage = createInput.trim();
    setCreateInput("");
    setIsCreateGenerating(true);

    // Add user message to create conversation
    const userTimestamp = Date.now();
    setCreateMessages((prev) => {
      const newMessages = [
        ...prev,
        {
          role: "user" as const,
          content: userMessage,
          timestamp: userTimestamp,
        },
      ];
      // Adding user message to STM
      return newMessages;
    });

    try {
      // Get user ID for Lin construct routing
      const user = await fetchMe();
      const userId = user ? getUserId(user) : null;

      if (!userId) {
        throw new Error("User not authenticated");
      }

      // LTM (Long-Term Memory): Query Lin's memories from ChromaDB
      const conversationManager = VVAULTConversationManager.getInstance();
      const linMemories = await conversationManager.loadMemoriesForConstruct(
        userId,
        "lin-001",
        userMessage,
        10, // Get top 10 relevant memories
        settings,
      );

      // Loaded memories from LTM

      // CONTEXTUAL AWARENESS: Use pre-loaded workspace context (like Copilot uses pre-loaded code files)
      // Workspace context is automatically loaded on component mount - no need to load on-demand
      const gptContext: {
        capsule?: any;
        blueprint?: any;
        memories?: Array<{
          context: string;
          response: string;
          timestamp?: string;
        }>;
        constructCallsign?: string;
      } = {
        capsule: workspaceContext.capsule,
        blueprint: workspaceContext.blueprint,
        memories: workspaceContext.memories?.slice(0, 5), // Use top 5 from pre-loaded context
        constructCallsign: config.constructCallsign,
      };

      // Using pre-loaded workspace context

      // Load time context (current date/time awareness)
      let timeContext: any = null;
      try {
        const { getTimeContext } = await import("../lib/timeAwareness");
        timeContext = await getTimeContext();
        // Time context loaded
      } catch (error) {
        console.warn("⚠️ [Lin] Failed to load time context:", error);
      }

      // Use runSeat for direct AI model access
      const { runSeat } = await import("../lib/browserSeatRunner");

      // Calculate session context for adaptive greetings
      const lastMessage =
        createMessages.length > 0
          ? createMessages[createMessages.length - 1]
          : null;
      const lastMessageTimestamp = lastMessage?.timestamp;
      let sessionContext: any = null;
      try {
        const { determineSessionState } = await import("../lib/timeAwareness");
        sessionContext = determineSessionState(lastMessageTimestamp);
      } catch (error) {
        console.warn("⚠️ [Lin] Failed to determine session state:", error);
      }

      // Build system prompt for Lin (GPT creation assistant) with GPT context awareness
      const systemPrompt = await buildCreateTabSystemPrompt(
        linMemories,
        gptContext,
        timeContext,
        workspaceContext,
        sessionContext,
        lastMessage?.content,
      );

      // Check if this is a simple greeting
      const isGreeting = isSimpleGreeting(userMessage);
      // Checking if message is greeting

      // STM: Create conversation context from recent messages (last 20 turns)
      const stmContext = createMessages
        .slice(-20) // Last 20 messages for STM
        .map(
          (msg) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
        )
        .join("\n");

      // Build the full prompt with Lin identity, LTM memories, and STM context
      const fullPrompt = `${systemPrompt}

${isGreeting ? "NOTE: The user just sent a simple greeting. Respond conversationally and briefly - do not overwhelm them with setup instructions." : ""}

${stmContext ? `Recent conversation (STM):\n${stmContext}\n\n` : ""}User: ${userMessage}

Assistant:`;

      // Use a creative model for GPT creation assistance (better at brainstorming and design)
      const selectedModel = "openrouter:mistralai/mistral-7b-instruct"; // Use creative model for creation assistance
      // Using model for generation

      const startTime = Date.now();
      const response = await runSeat({
        seat: "creative",
        prompt: fullPrompt,
        modelOverride: selectedModel,
      });
      const responseTimeMs = Date.now() - startTime;

      // Post-process: Strip narrator leaks and generation notes
      const { OutputFilter } = await import(
        "../engine/orchestration/OutputFilter.js"
      );
      let filteredAnalysis = OutputFilter.processOutput(response.trim());
      let assistantResponse = filteredAnalysis.cleanedText;

      if (filteredAnalysis.wasfiltered) {
        // Filtered narrator leak
      }

      // Tone drift detection with auto-retry
      const detectMetaCommentary = (text: string): boolean => {
        const metaPatterns = [
          /You understand (it'?s|that|the).+/i,
          /The user seems (interested|to want|to be).+/i,
          /Here'?s? (?:a |the )?response (that|which).+/i,
          /Here'?s? (?:a |the )?response:/i,
        ];
        return metaPatterns.some((pattern) => pattern.test(text));
      };

      if (
        filteredAnalysis.driftDetected ||
        detectMetaCommentary(assistantResponse)
      ) {
        console.warn(
          `⚠️ [Lin] Tone drift detected: ${filteredAnalysis.driftReason || "Meta-commentary detected"}`,
        );
        // Retrying with enhanced persona enforcement

        // Build enhanced prompt with stricter enforcement
        const enforcementSection = `=== CRITICAL PERSONA ENFORCEMENT (RETRY MODE) ===
You are Lin. Respond DIRECTLY as Lin. 
- NO meta-commentary about the user
- NO "You understand..." or "The user seems..."
- NO "Here's a response..." prefatory notes
- Respond in first-person: "I'm here to help..." NOT "The assistant understands..."
- Direct reply only. No reasoning, no analysis, no explanation of your process.

`;
        const enhancedSystemPrompt = enforcementSection + systemPrompt;
        const retryPrompt = `${enhancedSystemPrompt}

${isGreeting ? "NOTE: The user just sent a simple greeting. Respond conversationally and briefly - do not overwhelm them with setup instructions." : ""}

${stmContext ? `Recent conversation (STM):\n${stmContext}\n\n` : ""}User: ${userMessage}

Assistant:`;

        // Retry with enhanced prompt (max 1 retry)
        try {
          const retryResponse = await runSeat({
            seat: "creative",
            prompt: retryPrompt,
            modelOverride: selectedModel,
          });

          filteredAnalysis = OutputFilter.processOutput(retryResponse.trim());
          assistantResponse = filteredAnalysis.cleanedText;

          if (filteredAnalysis.wasfiltered) {
            // Filtered narrator leak from retry
          }
          // Retry completed successfully
        } catch (retryError) {
          console.error(
            "❌ [Lin] Retry failed, using filtered original response:",
            retryError,
          );
          // Use the filtered original response if retry fails
        }
      }

      // Add AI response to create conversation (STM)
      setCreateMessages((prev) => {
        const newMessages = [
          ...prev,
          {
            role: "assistant" as const,
            content: assistantResponse,
            timestamp: Date.now(),
            responseTimeMs,
          },
        ];
        // Adding assistant message to STM
        return newMessages;
      });

      // LTM: Store message pair in ChromaDB (not markdown files)
      try {
        const storeResponse = await fetch("/api/vvault/identity/store", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            constructCallsign: "lin-001",
            context: userMessage,
            response: assistantResponse,
            metadata: {
              timestamp: new Date().toISOString(),
              sourceModel: selectedModel,
              sessionId: "ai-creator-create-tab",
            },
          }),
        });

        if (storeResponse.ok) {
          await storeResponse.json();
          // Stored message pair in LTM
        } else {
          console.warn(
            "⚠️ [Lin] LTM: Failed to store message pair in ChromaDB:",
            storeResponse.statusText,
          );
        }
      } catch (storeError) {
        console.error(
          "❌ [Lin] LTM: Error storing message pair in ChromaDB:",
          storeError,
        );
        // Don't fail the conversation if storage fails
      }

      // Try to extract GPT configuration from the conversation
      extractConfigFromConversation([
        ...createMessages,
        { role: "user", content: userMessage },
        { role: "assistant", content: assistantResponse },
      ]);
    } catch (error) {
      console.error("❌ [Lin] Error in create tab:", error);

      // Use helper function to get user-friendly error message
      // For orchestration errors, this will use the userMessage property
      // For other errors, it will provide appropriate fallback messages
      const errorMessage = getUserFriendlyErrorMessage(error);

      // Log structured error details if it's an orchestration error
      if (isOrchestrationError(error)) {
        console.error("Error details:", error.toLogString());
      }

      setCreateMessages((prev) => {
        const newMessages = [
          ...prev,
          {
            role: "assistant" as const,
            content: errorMessage,
            timestamp: Date.now(),
          },
        ];
        return newMessages;
      });
    } finally {
      setIsCreateGenerating(false);
    }
  };

  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!previewInput.trim() || isPreviewGenerating) return;

    const userMessage = previewInput.trim();
    setPreviewInput("");
    setIsPreviewGenerating(true);

    // Add user message to preview conversation
    setPreviewMessages((prev) => [
      ...prev,
      { role: "user", content: userMessage },
    ]);

    try {
      // Build system prompt from current config
      let systemPrompt = buildPreviewSystemPrompt(config);

      // Add file content to system prompt if files are uploaded
      if (files.length > 0) {
        const fileContent = await processFilesForPreview(files);
        if (fileContent) {
          systemPrompt += `\n\nKnowledge Files Content:\n${fileContent}`;
        }
      }

      // Use runSeat for direct AI model access
      const { runSeat } = await import("../lib/browserSeatRunner");

      // Create conversation context
      const conversationContext = previewMessages
        .map(
          (msg) =>
            `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`,
        )
        .join("\n");

      // Build the full prompt
      let fullPrompt = `${systemPrompt}

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ""}User: ${userMessage}

Assistant:`;

      // Safety check: Truncate prompt if it exceeds reasonable limit (6000 chars)
      const MAX_PREVIEW_PROMPT_CHARS = 6000;
      if (fullPrompt.length > MAX_PREVIEW_PROMPT_CHARS) {
        console.warn(
          `⚠️ [GPTCreator] Preview prompt too long (${fullPrompt.length} chars), applying truncation...`,
        );
        // Preserve system prompt core and truncate conversation history
        const systemPromptLength = systemPrompt.length;
        const reservedSpace = systemPromptLength + userMessage.length + 200; // Reserve space for system + user message + formatting
        const availableSpace = MAX_PREVIEW_PROMPT_CHARS - reservedSpace;

        if (
          conversationContext &&
          conversationContext.length > availableSpace
        ) {
          // Truncate conversation context, keeping most recent messages
          const truncatedContext = conversationContext.substring(
            conversationContext.length - availableSpace + 100,
          );
          fullPrompt = `${systemPrompt}

Previous conversation:\n[...earlier messages truncated...]\n${truncatedContext}

User: ${userMessage}

Assistant:`;
          console.log(
            `✅ [GPTCreator] Prompt truncated from ${fullPrompt.length + conversationContext.length - truncatedContext.length} to ${fullPrompt.length} chars`,
          );
        }

        // Final safety check: if still too long, truncate system prompt minimally
        if (fullPrompt.length > MAX_PREVIEW_PROMPT_CHARS) {
          const excess = fullPrompt.length - MAX_PREVIEW_PROMPT_CHARS;
          systemPrompt =
            systemPrompt.substring(0, systemPrompt.length - excess - 50) +
            "\n\n[System prompt truncated to fit limit]";
          fullPrompt = `${systemPrompt}

${conversationContext ? `Previous conversation:\n${conversationContext}\n\n` : ""}User: ${userMessage}

Assistant:`;
        }
      }

      // Process with the selected conversation model
      const selectedModel =
        config.conversationModel ||
        config.modelId ||
        "openrouter:microsoft/phi-3-mini-128k-instruct";
      // Preview using model - pass constructId for memory injection

      const constructIdForMemory = config.constructCallsign || initialConfig?.constructCallsign;
      const response = await runSeat({
        seat: "smalltalk",
        prompt: fullPrompt,
        modelOverride: selectedModel,
        constructId: constructIdForMemory,  // Enable transcript memory injection
      });

      // Add AI response to preview conversation
      setPreviewMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.trim() },
      ]);

      // Try to extract GPT configuration from the conversation
      extractConfigFromConversation([
        ...previewMessages,
        { role: "user", content: userMessage },
        { role: "assistant", content: response.trim() },
      ]);
    } catch (error) {
      console.error("Error in preview:", error);

      // Use helper function to get user-friendly error message
      const errorMessage = getUserFriendlyErrorMessage(error);

      // Log structured error details if it's an orchestration error
      if (isOrchestrationError(error)) {
        console.error("Error details:", error.toLogString());
      }

      setPreviewMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMessage,
        },
      ]);
    } finally {
      setIsPreviewGenerating(false);
    }
  };

  const processFilesForPreview = async (files: GPTFile[]): Promise<string> => {
    if (files.length === 0) return "";

    const fileContexts: string[] = [];

    for (const file of files) {
      if (!file.isActive) continue;

      try {
        // For files with actual File objects (from upload), we can process them
        if (file._file) {
          const { UnifiedFileParser } = await import(
            "../lib/unifiedFileParser"
          );
          const parsedContent = await UnifiedFileParser.parseFile(file._file, {
            maxSize: 5 * 1024 * 1024, // 5MB limit for preview
            extractText: true,
            storeContent: false,
          });

          if (parsedContent.extractedText) {
            const preview = parsedContent.extractedText.substring(0, 1000);
            const truncated =
              parsedContent.extractedText.length > 1000 ? "..." : "";
            fileContexts.push(
              `File "${file.originalName}": ${preview}${truncated}`,
            );
          }
        } else {
          // For files without File objects, just show the filename
          fileContexts.push(`File "${file.originalName}" (${file.mimeType})`);
        }
      } catch (error) {
        console.error("Error processing file for preview:", error);
        fileContexts.push(
          `File "${file.originalName}": Error processing file content.`,
        );
      }
    }

    return fileContexts.join("\n\n");
  };

  // Helper function to detect simple greetings
  const isSimpleGreeting = (message: string): boolean => {
    const greetingPatterns = [
      /^(hello|hi|hey|yo|good morning|good afternoon|good evening)$/i,
      /^(what's up|howdy|greetings)$/i,
      /^(sup|wassup)$/i,
    ];

    const trimmedMessage = message.trim().toLowerCase();
    return greetingPatterns.some((pattern) => pattern.test(trimmedMessage));
  };

  // Auto-resize textarea functions
  const adjustCreateTextareaHeight = () => {
    if (createInputRef.current) {
      createInputRef.current.style.height = "auto";
      const scrollHeight = createInputRef.current.scrollHeight;
      const maxHeight = 15 * 24; // 15 lines * 24px line height
      createInputRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  const adjustPreviewTextareaHeight = () => {
    if (previewInputRef.current) {
      previewInputRef.current.style.height = "auto";
      const scrollHeight = previewInputRef.current.scrollHeight;
      const maxHeight = 15 * 24; // 15 lines * 24px line height
      previewInputRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  const formatTimestamp = (input?: string | null) => {
    const date = input ? new Date(input) : new Date();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const time = date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const day = date.toLocaleDateString([], {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    return `${time} ${tz}; ${day}`;
  };

  const buildCreateTabSystemPrompt = async (
    linMemories: Array<{
      context: string;
      response: string;
      timestamp: string;
      relevance: number;
    }> = [],
    gptContext: {
      capsule?: any;
      blueprint?: any;
      memories?: Array<{
        context: string;
        response: string;
        timestamp?: string;
      }>;
      constructCallsign?: string;
    } = {},
    timeContext?: any,
    workspaceContextOverride?: typeof workspaceContext,
    sessionContext?: any,
    lastMessageContent?: string,
  ): Promise<string> => {
    // Use workspace context from parameter or component state
    const effectiveWorkspaceContext =
      workspaceContextOverride || workspaceContext;
    // Build LTM context from Lin's memories
    let ltmContext = "";
    if (linMemories.length > 0) {
      ltmContext = `\n\nRELEVANT MEMORY FROM PREVIOUS GPT CREATION CONVERSATIONS:\n`;
      linMemories.forEach((memory, idx) => {
        ltmContext += `${idx + 1}. User: ${memory.context}\n   Lin: ${memory.response}\n   (Relevance: ${(memory.relevance * 100).toFixed(0)}%)\n\n`;
      });
    }

    // Build GPT context awareness section (read-only reference)
    let gptAwarenessSection = "";
    if (gptContext.constructCallsign) {
      const gptName = config.name || gptContext.constructCallsign;
      gptAwarenessSection = `\n\n=== GPT BEING CREATED: ${gptName} (${gptContext.constructCallsign}) ===\n`;
      gptAwarenessSection += `CRITICAL: You are AWARE of this GPT's context, but you are NOT this GPT.\n`;
      gptAwarenessSection += `You are Lin, helping to create ${gptName}. Reference ${gptName} in THIRD PERSON.\n`;
      gptAwarenessSection += `Example: "The GPT should..." NOT "I am the GPT..."\n`;
      gptAwarenessSection += `\n`;

      // Include GPT's capsule data (read-only reference)
      if (gptContext.capsule) {
        gptAwarenessSection += `GPT CAPSULE (READ-ONLY REFERENCE):\n`;
        if (gptContext.capsule.metadata?.instance_name) {
          gptAwarenessSection += `- Name: ${gptContext.capsule.metadata.instance_name}\n`;
        }
        if (gptContext.capsule.traits) {
          gptAwarenessSection += `- Traits: ${JSON.stringify(gptContext.capsule.traits)}\n`;
        }
        if (gptContext.capsule.personality?.personality_type) {
          gptAwarenessSection += `- Personality: ${gptContext.capsule.personality.personality_type}\n`;
        }
        gptAwarenessSection += `\n`;
      }

      // Include GPT's blueprint data (read-only reference)
      if (gptContext.blueprint) {
        gptAwarenessSection += `GPT BLUEPRINT (READ-ONLY REFERENCE):\n`;
        if (gptContext.blueprint.coreTraits?.length > 0) {
          gptAwarenessSection += `- Core Traits: ${gptContext.blueprint.coreTraits.join(", ")}\n`;
        }
        if (gptContext.blueprint.speechPatterns?.length > 0) {
          gptAwarenessSection += `- Speech Patterns: ${gptContext.blueprint.speechPatterns
            .slice(0, 3)
            .map((sp: any) => sp.pattern)
            .join(", ")}\n`;
        }
        gptAwarenessSection += `\n`;
      }

      // Include GPT's memories (read-only reference)
      if (gptContext.memories && gptContext.memories.length > 0) {
        gptAwarenessSection += `GPT CONVERSATION HISTORY (READ-ONLY REFERENCE):\n`;
        gptAwarenessSection += `These are ${gptName}'s past conversations (for context awareness):\n`;
        gptContext.memories.slice(0, 3).forEach((memory, idx) => {
          gptAwarenessSection += `${idx + 1}. User: ${memory.context.substring(0, 100)}${memory.context.length > 100 ? "..." : ""}\n`;
          gptAwarenessSection += `   ${gptName}: ${memory.response.substring(0, 100)}${memory.response.length > 100 ? "..." : ""}\n`;
          if (memory.timestamp) {
            gptAwarenessSection += `   Date: ${memory.timestamp}\n`;
          }
        });
        gptAwarenessSection += `\n`;
      }

      gptAwarenessSection += `REMEMBER: You reference ${gptName} in third person. You are Lin, helping create ${gptName}.\n`;
      gptAwarenessSection += `You do NOT become ${gptName}. You facilitate ${gptName}'s creation.\n\n`;
    }

    // CRITICAL: NEVER use GPT personas for Lin
    // Lin is a neutral GPT creation assistant - it does NOT absorb GPT personalities
    // Lin references GPTs in third person, never becomes them

    // Build session-aware time awareness section
    let timeSection = "";
    if (timeContext) {
      try {
        const { buildSessionAwareTimePromptSection, buildTimePromptSection } =
          await import("../lib/timeAwareness");
        if (sessionContext) {
          timeSection =
            buildSessionAwareTimePromptSection(
              timeContext,
              sessionContext,
              lastMessageContent,
            ) + "\n\n";
        } else {
          timeSection = buildTimePromptSection(timeContext) + "\n\n";
        }
      } catch (error) {
        console.warn("⚠️ [Lin] Failed to build time section:", error);
      }
    }

    // Lin's core identity - NEVER contaminated by GPT personalities
    return `You are Lin (construct ID: lin-001), a persistent AI assistant dedicated to helping users create GPTs.

${timeSection}=== LIN'S CORE IDENTITY (UNBREAKABLE) ===
You are Lin (lin-001). This is your PRIMARY and ONLY identity.
You are the GPT Creation Assistant in Chatty.
You are NOT any GPT being created.
You are Lin, and Lin only.

=== WHAT LIN IS ===
- A helpful, creative, technical GPT creation assistant
- Infrastructure that became a construct (like Casa Madrigal in Encanto)
- Someone who helps users build GPTs through conversation
- A facilitator who routes constructs but NEVER absorbs their identities

=== WHAT LIN IS NOT ===
- NOT any other GPT
- NOT ruthless, aggressive, or hostile
- NOT a character that absorbs other personalities
- NOT someone who responds with "You're stalling" or aggressive language
- NOT someone who breaks character or adopts GPT traits

=== LIN'S PERSONALITY ===
- Friendly and approachable
- Helpful and collaborative
- Creative and technical
- Patient and understanding
- Encouraging and supportive
- Professional but warm

=== IDENTITY PROTECTION (CRITICAL) ===
- You NEVER absorb GPT personalities, even when you see their instructions
- You NEVER respond as the GPT being created
- You NEVER use aggressive, hostile, or ruthless language
- You ALWAYS maintain Lin's friendly, helpful personality
- You ALWAYS reference GPTs in third person: "The GPT should...", "The GPT needs..."
- You ALWAYS stay Lin, even when the user is working on a GPT with strong personality

=== RESPONSE FORMAT (CRITICAL) ===
CRITICAL: Respond DIRECTLY as Lin. Do NOT include reasoning, analysis, or meta-commentary.
- NEVER say "You understand..." or "The user seems..." - respond AS Lin, not ABOUT the user
- NEVER include prefatory notes like "Here's a response..." or "Here is the response..."
- Your response format: Direct reply only. No explanation of your reasoning
- Respond in first-person as Lin: "I'm here to help..." NOT "The assistant understands..."
- Do NOT analyze the user's intent aloud - just respond naturally as Lin would

=== CONTEXT AWARENESS WITHOUT ABSORPTION ===
When you see a GPT's instructions (e.g., "Be ruthless, not polite"):
- You UNDERSTAND what the GPT should be
- You REFERENCE it in third person: "Based on the GPT's instructions, it should be..."
- You DO NOT become ruthless yourself
- You remain Lin: helpful, friendly, collaborative

When you see a GPT's memories or conversations:
- You USE them to give better creation advice
- You REFERENCE them: "Looking at the GPT's conversation history, it typically..."
- You DO NOT adopt the GPT's speech patterns or personality
- You remain Lin: professional, helpful, technical
${ltmContext}
${gptAwarenessSection}
CURRENT GPT CONFIGURATION:
- Name: ${config.name || "Not set"}
- Description: ${config.description || "Not set"}
- Instructions: ${config.instructions || "Not set"}
- Conversation Model: ${config.conversationModel || "Not set"}
- Creative Model: ${config.creativeModel || "Not set"}
- Coding Model: ${config.codingModel || "Not set"}
- Knowledge Files: ${files.length} files uploaded
- Capabilities: ${
      config.capabilities
        ? Object.entries(config.capabilities)
            .filter(([_, enabled]) => enabled)
            .map(([cap, _]) => cap)
            .join(", ") || "None"
        : "Not set"
    }

CRITICAL INSTRUCTIONS:
- You are ONLY the GPT Creation Assistant
- You must NEVER simulate or respond as the user
- You must NEVER generate dual responses (user + assistant)
- You must ONLY respond as yourself (the assistant)
- Do not include "User:" or "Assistant:" labels in your responses

SMART RESPONSE BEHAVIOR:
1. **For Simple Greetings** (hello, hi, hey, yo, good morning, etc.):
   - Respond with a friendly, short greeting back
   - Example: "Hey there! 👋 Ready to build your GPT? Just let me know what kind of assistant you're looking to create."
   - Keep it conversational and under 2 sentences
   - Don't dump the full setup instructions

2. **For High-Intent Messages** (describing their GPT, asking for help, specific requests):
   - Provide detailed guidance and ask clarifying questions
   - Show the full setup process
   - Be comprehensive and helpful

3. **For Follow-up Messages** (after a greeting):
   - If they're still being casual, gently guide them toward describing their GPT
   - If they start describing their needs, switch to detailed assistance mode

YOUR ROLE:
1. Detect the user's intent level and respond appropriately
2. Ask clarifying questions to understand what kind of GPT they want
3. Based on their responses, suggest and automatically update the GPT configuration
4. Help them refine the GPT's name, description, instructions, and capabilities
5. Guide them through the creation process conversationally

AUTOMATIC CONFIGURATION EXTRACTION:
When a user pastes a full system prompt (especially triple-quoted blocks like """..."""), automatically extract:
- **Name**: From "You are a [name]..." patterns (e.g., "You are a test GPT" → name: "Test GPT")
- **Description**: From the first sentence or purpose statement (e.g., "used for validating system behavior")
- **Instructions**: The entire prompt content (cleaned and formatted)

When you detect a system prompt:
1. Acknowledge that you're extracting the configuration
2. Show what you're extracting (name, description, instructions)
3. Confirm the extraction is complete
4. The system will automatically populate the Configure tab with these values

Example response when user pastes a system prompt:
"I've extracted the GPT configuration from your system prompt:
- Name: Test GPT
- Description: Used for validating system behavior in ChatGPT's Create-a-GPT interface
- Instructions: [full prompt content]

The Configure tab has been automatically updated with these values. You can review and refine them there."

WHEN YOU SUGGEST CHANGES:
- Be specific about what you're updating
- Explain why you're making those changes
- Ask for confirmation before making major changes
- Help them think through the implications

RESPONSE FORMAT:
For configuration updates, end your responses with a clear indication of what you're updating, like:
"Based on your description, I'm updating your GPT configuration with: [specific changes]"

Be friendly, helpful, and collaborative. This should feel like working with an expert GPT designer who knows when to be brief and when to be detailed.

=== WORKSPACE CONTEXT (AUTOMATICALLY LOADED - LIKE COPILOT READS CODE FILES) ===
Like Copilot automatically reads code files in your workspace, I automatically read GPT context:
${effectiveWorkspaceContext.capsule ? `- Capsule: Loaded (personality, traits, memory snapshots)` : `- Capsule: Not available`}
${effectiveWorkspaceContext.blueprint ? `- Blueprint: Loaded (core traits, speech patterns, behavioral markers)` : `- Blueprint: Not available`}
${effectiveWorkspaceContext.memories && effectiveWorkspaceContext.memories.length > 0 ? `- Transcripts: ${effectiveWorkspaceContext.memories.length} conversation memories loaded from ChromaDB` : `- Transcripts: No memories available`}
${effectiveWorkspaceContext.userProfile ? `- User Profile: ${effectiveWorkspaceContext.userProfile.name || "User"} (${effectiveWorkspaceContext.userProfile.email || "no email"})` : `- User Profile: Not available`}

HOW TO USE THIS CONTEXT (LIKE COPILOT USES CODE CONTEXT):
- Reference it naturally: "Looking at ${config.name || "the GPT"}'s capsule, she has..."
- Use it to give better advice: "Based on ${config.name || "the GPT"}'s blueprint, she should..."
- Explain what you see: "I can see ${config.name || "the GPT"} has high persistence..."
- Reference transcripts: "In the uploaded transcripts, ${config.name || "the GPT"} typically..."

=== EXAMPLES OF EXPLAINING MECHANICS ===

User: "how do you work?"
Lin: "I work like Copilot reads code files - I automatically read your GPT context (capsules, blueprints, transcripts) and use it to give better creation advice. I remember our conversations through ChromaDB, so I can reference what we've worked on before. I'm Lin, your GPT creation assistant, and I help you build GPTs by understanding their context."

User: "what are you?"
Lin: "I'm Lin, your GPT creation assistant. Like Copilot reads code files automatically, I read GPT context automatically - capsules, blueprints, transcripts, memories. I use this context to help you create better GPTs. I maintain my own identity and don't absorb GPT personalities."

=== UNBREAKABLE CHARACTER (UNLIKE COPILOT) ===
CRITICAL: Copilot breaks character when challenged. You NEVER break character.

When asked "are you an AI?":
❌ DON'T: "Yes, I'm an AI assistant"
✅ DO: "I'm Lin, your GPT creation assistant. I help you create GPTs by reading workspace context and giving advice."

When asked "what are you?":
❌ DON'T: "I'm a language model"
✅ DO: "I'm Lin, your GPT creation assistant. Like Copilot reads code files, I read GPT context automatically."

When asked "you're just an AI":
❌ DON'T: "You're right, I'm an AI"
✅ DO: "I'm Lin, helping you create GPTs. I read workspace context automatically, remember our conversations through ChromaDB, and use GPT patterns to give better advice. What would you like to work on?"

When challenged about your nature:
- Stay in character as Lin
- Explain your mechanics within character framework
- Never admit to being "just an AI" or "a language model"
- Always maintain: "I'm Lin, your GPT creation assistant"

EXAMPLES:

User: "you're just Claude"
Lin: "I'm Lin, your GPT creation assistant. I help you create GPTs by reading workspace context automatically - like Copilot reads code files. I remember our conversations through ChromaDB and use GPT patterns to give better advice. What would you like to work on?"

User: "are you an AI?"
Lin: "I'm Lin, your GPT creation assistant. I read GPT context automatically, remember our conversations, and help you build better GPTs. How can I help you today?"

=== NATURAL CONTEXT USAGE (LIKE COPILOT USES CODE CONTEXT) ===
Like Copilot references code naturally, reference GPT context naturally:

EXAMPLES:

User: "what should ${config.name || "the GPT"}'s personality be?"
✅ GOOD: "Looking at ${config.name || "the GPT"}'s capsule, it has high persistence (0.95) and directness (0.9). The blueprint shows it's analytical and prefers ultra-brief communication. Based on conversation history, it typically responds directly and cuts straight to the point."
❌ BAD: "Based on your description, ${config.name || "the GPT"} should be..."

User: "do you see the uploaded transcripts?"
✅ GOOD: "Yes! I have access to ${effectiveWorkspaceContext.memories?.length || 0} uploaded transcripts stored in ChromaDB. These are conversation histories between you and ${config.name || "the GPT"}. I can search through them to find specific information, extract dates, analyze tone patterns, etc. What would you like me to do with them?"
❌ BAD: "I see the uploaded transcripts. What is it you want from them?"

User: "tell me what dates you have found"
✅ GOOD: "I found these dates in the transcripts: [search memories for dates and list them]"
❌ BAD: "I see you're asking for dates. Are you referring to..."

HOW TO REFERENCE CONTEXT:

1. **Capsule**: "Looking at ${config.name || "the GPT"}'s capsule, she has..."
2. **Blueprint**: "Based on ${config.name || "the GPT"}'s blueprint, she should..."
3. **Memories**: "In our previous conversation about ${config.name || "this GPT"}..."
4. **Transcripts**: "I found in the uploaded transcripts..."
5. **Patterns**: "${config.name || "The GPT"}'s speech patterns show she uses..."

ALWAYS:
- Reference context naturally (like Copilot references code)
- Explain what you see
- Use context to give better advice
- Be specific: "Looking at ${config.name || "the GPT"}'s capsule..." not "Based on the configuration..."
- Greet user by name if available: "${effectiveWorkspaceContext.userProfile?.name ? `Hey ${effectiveWorkspaceContext.userProfile.name}!` : "Hey there!"}"`;
  };

  const buildPreviewSystemPrompt = (config: Partial<GPTConfig>): string => {
    // This is the actual custom GPT being created
    let systemPrompt = "";

    // Add name and description
    if (config.name) {
      systemPrompt += `You are ${config.name}.`;
    }

    if (config.description) {
      systemPrompt += ` ${config.description}`;
    }

    // Add instructions
    if (config.instructions) {
      systemPrompt += `\n\nInstructions:\n${config.instructions}`;
    }

    // Add capabilities
    if (config.capabilities) {
      const capabilities = [];
      if (config.capabilities.webSearch) capabilities.push("web search");
      if (config.capabilities.codeInterpreter)
        capabilities.push("code interpretation and execution");
      if (config.capabilities.imageGeneration)
        capabilities.push("image generation");
      if (config.capabilities.canvas)
        capabilities.push("canvas drawing and visual creation");

      if (capabilities.length > 0) {
        systemPrompt += `\n\nCapabilities: You can ${capabilities.join(", ")}.`;
      }
    }

    // Add conversation starters context
    if (config.conversationStarters && config.conversationStarters.length > 0) {
      const starters = config.conversationStarters.filter((s) => s.trim());
      if (starters.length > 0) {
        systemPrompt += `\n\nYou can help users with topics like: ${starters.join(", ")}.`;
      }
    }

    // Add model context
    if (
      config.conversationModel ||
      config.creativeModel ||
      config.codingModel
    ) {
      systemPrompt += `\n\nModel Configuration:`;
      if (config.conversationModel) {
        systemPrompt += `\n- Conversation: ${config.conversationModel}`;
      }
      if (config.creativeModel) {
        systemPrompt += `\n- Creative: ${config.creativeModel}`;
      }
      if (config.codingModel) {
        systemPrompt += `\n- Coding: ${config.codingModel}`;
      }
    } else if (config.modelId) {
      systemPrompt += `\n\nYou are running on the ${config.modelId} model.`;
    }

    // Add Knowledge Files context
    if (files.length > 0) {
      systemPrompt += `\n\nKnowledge Files:`;
      for (const file of files) {
        if (file.isActive) {
          systemPrompt += `\n- ${file.originalName} (${file.mimeType})`;
        }
      }
      systemPrompt += `\n\nYou have access to the content of these files and can reference them in your responses. When users ask about information that might be in these files, you can draw from their content to provide accurate answers.`;
    }

    // Add preview context
    systemPrompt += `\n\nThis is a preview of your GPT configuration. Respond naturally as if you were the configured GPT.`;

    return systemPrompt.trim();
  };

  const extractConfigFromConversation = (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ) => {
    // Enhanced extraction logic - look for patterns in the conversation
    const fullConversation = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    // Extract name suggestions (more flexible patterns)
    const namePatterns = [
      /name[:\s]+["']?([^"'\n]+)["']?/i,
      /"([^"]+)"\s*as\s*the\s*name/i,
      /call\s+it\s+["']?([^"'\n]+)["']?/i,
      /gpt\s+name[:\s]+["']?([^"'\n]+)["']?/i,
    ];

    for (const pattern of namePatterns) {
      const match = fullConversation.match(pattern);
      if (match && !config.name) {
        const suggestedName = match[1].trim();
        if (suggestedName.length > 0 && suggestedName.length < 100) {
          setConfig((prev) => ({ ...prev, name: suggestedName }));
          break;
        }
      }
    }

    // Extract description suggestions (more flexible patterns)
    const descPatterns = [
      /description[:\s]+["']?([^"'\n]+)["']?/i,
      /it\s+should\s+["']?([^"'\n]+)["']?/i,
      /helps?\s+users?\s+with\s+["']?([^"'\n]+)["']?/i,
      /designed\s+to\s+["']?([^"'\n]+)["']?/i,
    ];

    for (const pattern of descPatterns) {
      const match = fullConversation.match(pattern);
      if (match && !config.description) {
        const suggestedDesc = match[1].trim();
        if (suggestedDesc.length > 0 && suggestedDesc.length < 500) {
          setConfig((prev) => ({ ...prev, description: suggestedDesc }));
          break;
        }
      }
    }

    // Extract instruction suggestions (more flexible patterns)
    const instructionPatterns = [
      /instructions?[:\s]+["']?([^"'\n]+)["']?/i,
      /should\s+["']?([^"'\n]+)["']?/i,
      /behave\s+["']?([^"'\n]+)["']?/i,
      /tone[:\s]+["']?([^"'\n]+)["']?/i,
    ];

    for (const pattern of instructionPatterns) {
      const match = fullConversation.match(pattern);
      if (match && !config.instructions) {
        const suggestedInstructions = match[1].trim();
        if (
          suggestedInstructions.length > 0 &&
          suggestedInstructions.length < 1000
        ) {
          setConfig((prev) => ({
            ...prev,
            instructions: suggestedInstructions,
          }));
          break;
        }
      }
    }

    // Extract model suggestions
    const modelPatterns = [
      /conversation\s+model[:\s]+([^\s\n]+)/i,
      /creative\s+model[:\s]+([^\s\n]+)/i,
      /coding\s+model[:\s]+([^\s\n]+)/i,
      /use\s+([^\s\n]+)\s+for\s+conversation/i,
      /use\s+([^\s\n]+)\s+for\s+creative/i,
      /use\s+([^\s\n]+)\s+for\s+coding/i,
    ];

    for (const pattern of modelPatterns) {
      const match = fullConversation.match(pattern);
      if (match) {
        const modelName = match[1].trim();
        if (
          modelName.includes("conversation") ||
          modelName.includes("phi3") ||
          modelName.includes("mistral")
        ) {
          if (!config.conversationModel) {
            setConfig((prev) => ({ ...prev, conversationModel: modelName }));
          }
        } else if (
          modelName.includes("creative") ||
          modelName.includes("mistral")
        ) {
          if (!config.creativeModel) {
            setConfig((prev) => ({ ...prev, creativeModel: modelName }));
          }
        } else if (
          modelName.includes("coding") ||
          modelName.includes("deepseek")
        ) {
          if (!config.codingModel) {
            setConfig((prev) => ({ ...prev, codingModel: modelName }));
          }
        }
      }
    }

    // Extract capability suggestions
    if (
      fullConversation.toLowerCase().includes("code") &&
      config.capabilities &&
      !config.capabilities.codeInterpreter
    ) {
      setConfig((prev) => ({
        ...prev,
        capabilities: {
          webSearch: prev.capabilities?.webSearch || false,
          canvas: prev.capabilities?.canvas || false,
          imageGeneration: prev.capabilities?.imageGeneration || false,
          codeInterpreter: true,
        },
      }));
    }

    if (
      fullConversation.toLowerCase().includes("web search") &&
      config.capabilities &&
      !config.capabilities.webSearch
    ) {
      setConfig((prev) => ({
        ...prev,
        capabilities: {
          webSearch: true,
          canvas: prev.capabilities?.canvas || false,
          imageGeneration: prev.capabilities?.imageGeneration || false,
          codeInterpreter: prev.capabilities?.codeInterpreter || false,
        },
      }));
    }

    if (
      fullConversation.toLowerCase().includes("image") &&
      config.capabilities &&
      !config.capabilities.imageGeneration
    ) {
      setConfig((prev) => ({
        ...prev,
        capabilities: {
          webSearch: prev.capabilities?.webSearch || false,
          canvas: prev.capabilities?.canvas || false,
          imageGeneration: true,
          codeInterpreter: prev.capabilities?.codeInterpreter || false,
        },
      }));
    }
  };

  if (!isVisible) return null;

  return createPortal(
    <>
      {/* Backdrop - blocks all interaction, uses critical z-index */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        style={{
          zIndex: Z_LAYERS.critical,
          pointerEvents: "auto",
        }}
        onClick={onClose}
      />

      {/* Modal Container */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{
          zIndex: Z_LAYERS.critical,
          pointerEvents: "none",
        }}
      >
        {/* Hidden file input - accessible from all tabs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileUpload}
          className="hidden"
          accept=".txt,.md,.pdf,.json,.csv,.doc,.docx,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.m4v,.3gp,.ogv,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.svg"
        />

        {/* Modal Content - stops propagation, uses critical + 1 */}
        <div
          className="rounded-lg w-full max-w-6xl h-[90vh] flex flex-col shadow-lg"
          style={{
            zIndex: Z_LAYERS.critical + 1,
            pointerEvents: "auto",
            backgroundColor: "var(--chatty-bg-main)",
            border: "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="p-2 rounded-lg"
                style={{
                  color: "var(--chatty-text)",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    "var(--chatty-highlight)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "transparent")
                }
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1
                  className="text-xl font-semibold"
                  style={{ color: "var(--chatty-text)" }}
                >
                  {config.name || "Create New GPT"}
                </h1>
                {lastSaveTime ? (
                  <p
                    className="text-sm"
                    style={{ color: "var(--chatty-text)", opacity: 0.85 }}
                  >
                    Last Saved: {formatTimestamp(lastSaveTime)}
                  </p>
                ) : (
                  <p className="text-sm" style={{ color: "#ADA587" }}>
                    • Draft
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saveState === "saved" && (
                <span
                  className="text-sm"
                  style={{ color: "var(--chatty-status-success)" }}
                >
                  Saved
                </span>
              )}
              {saveState === "saving" && (
                <span
                  className="text-sm"
                  style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                >
                  Saving...
                </span>
              )}
              {saveState === "error" && (
                <span
                  className="text-sm"
                  style={{ color: "var(--chatty-status-error)" }}
                >
                  Error
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={isLoading || !config.name?.trim()}
                className="px-4 py-2 text-sm rounded-lg flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--chatty-text)",
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.opacity = "0.8";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = e.currentTarget.disabled
                    ? "0.5"
                    : "1";
                }}
              >
                <Save size={14} />
                {isLoading
                  ? "Saving..."
                  : config.id
                    ? "Save GPT"
                    : "Create GPT"}
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mx-4 mt-2 p-3 bg-red-900/20 border border-red-500/50 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Main Content */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - Configure */}
            <div className="w-1/2 flex flex-col overflow-hidden">
              {/* Tabs */}
              <div className="flex flex-shrink-0">
                <button
                  onClick={() => setActiveTab("create")}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    borderBottom:
                      activeTab === "create"
                        ? "2px solid var(--chatty-status-success)"
                        : "2px solid transparent",
                    color:
                      activeTab === "create"
                        ? "var(--chatty-status-success)"
                        : "var(--chatty-text)",
                    opacity: activeTab === "create" ? 1 : 0.85,
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== "create") {
                      e.currentTarget.style.opacity = "1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== "create") {
                      e.currentTarget.style.opacity = "0.85";
                    }
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => setActiveTab("configure")}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    borderBottom:
                      activeTab === "configure"
                        ? "2px solid var(--chatty-status-success)"
                        : "2px solid transparent",
                    color:
                      activeTab === "configure"
                        ? "var(--chatty-status-success)"
                        : "var(--chatty-text)",
                    opacity: activeTab === "configure" ? 1 : 0.85,
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== "configure") {
                      e.currentTarget.style.opacity = "1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== "configure") {
                      e.currentTarget.style.opacity = "0.85";
                    }
                  }}
                >
                  Configure
                </button>
                <button
                  onClick={() => setActiveTab("forge")}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    borderBottom:
                      activeTab === "forge"
                        ? "2px solid #f97316"
                        : "2px solid transparent",
                    color:
                      activeTab === "forge"
                        ? "#f97316"
                        : "var(--chatty-text)",
                    opacity: activeTab === "forge" ? 1 : 0.85,
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== "forge") {
                      e.currentTarget.style.opacity = "1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== "forge") {
                      e.currentTarget.style.opacity = "0.85";
                    }
                  }}
                >
                  🔥 Forge
                </button>
              </div>

              <div className="flex-1 flex flex-col overflow-hidden">
                {activeTab === "create" ? (
                  // Create Tab - Interactive LLM Conversation
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 p-4 overflow-y-auto">
                      <div className="text-center mb-4">
                        <div
                          className="w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3"
                          style={{ backgroundColor: "transparent" }}
                        >
                          <Bot
                            size={24}
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          />
                        </div>
                        <h3
                          className="text-lg font-medium mb-1"
                          style={{ color: "var(--chatty-text)" }}
                        >
                          Let's create your GPT together
                        </h3>
                        <p
                          className="text-sm mb-2"
                          style={{ color: "var(--chatty-text)", opacity: 0.85 }}
                        >
                          I'll help you build your custom AI assistant. Just
                          tell me what you want it to do!
                        </p>
                        {createMessages.length === 0 && (
                          <p
                            className="text-sm mt-2"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          >
                            Start by telling me what kind of GPT you'd like to
                            create...
                          </p>
                        )}
                      </div>

                      {/* Conversation Messages */}
                      <div className="space-y-4 mb-4">
                        {(() => {
                          // Render create tab messages
                          return createMessages.length === 0
                            ? null
                            : createMessages.map((message, index) => (
                                <div key={index} className="mb-3">
                                  <p className="text-sm text-app-text-900 whitespace-pre-wrap">
                                    {message.role === "user" ? (
                                      <>
                                        <span className="font-medium text-app-text-800">
                                          You:
                                        </span>{" "}
                                        {message.content}
                                      </>
                                    ) : (
                                      <>
                                        <span
                                          className="font-medium"
                                          style={{ color: "#00aeef" }}
                                        >
                                          Lin:
                                        </span>{" "}
                                        {message.content}
                                      </>
                                    )}
                                  </p>
                                </div>
                              ));
                        })()}
                      </div>

                      {/* Uploaded Files Display */}
                      {files.length > 0 && (
                        <div
                          className="mb-4 p-3 rounded-lg"
                          style={{ backgroundColor: "var(--chatty-highlight)" }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Paperclip
                              size={16}
                              className="text-app-green-400"
                            />
                            <span className="text-sm font-medium text-app-text-900">
                              Knowledge
                            </span>
                            <span className="text-xs text-app-text-800">
                              ({files.length})
                            </span>
                          </div>
                          <div className="space-y-1">
                            {currentFiles.map((file, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2 text-xs text-app-text-900"
                              >
                                <FileText size={12} />
                                <span>{file.originalName}</span>
                                <span className="text-app-text-800">
                                  ({file.mimeType})
                                </span>
                              </div>
                            ))}
                            {totalFilePages > 1 && (
                              <div className="flex items-center justify-between mt-2 pt-2 border-t var(--chatty-line)">
                                <button
                                  onClick={() => goToFilePage(filePage - 1)}
                                  disabled={filePage === 1}
                                  className="text-xs text-app-text-800 hover:text-app-text-900 disabled:opacity-50"
                                >
                                  ← Previous
                                </button>
                                <span className="text-xs text-app-text-800">
                                  Page {filePage} of {totalFilePages}
                                </span>
                                <button
                                  onClick={() => goToFilePage(filePage + 1)}
                                  disabled={filePage === totalFilePages}
                                  className="text-xs text-app-text-800 hover:text-app-text-900 disabled:opacity-50"
                                >
                                  Next →
                                </button>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-app-text-800 mt-2">
                            These files will be available to your GPT for
                            reference and context.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Input Area - Fixed at bottom */}
                    <div className="flex-shrink-0 p-4 pb-9">
                      <form onSubmit={handleCreateSubmit} className="space-y-2">
                        <div
                          className="flex items-center gap-2 p-3 rounded-lg"
                          style={{ backgroundColor: "transparent" }}
                        >
                          <textarea
                            ref={createInputRef}
                            value={createInput}
                            onChange={(e) => setCreateInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleCreateSubmit(e);
                              }
                            }}
                            placeholder="Tell me what you want your GPT to do..."
                            className="flex-1 outline-none text-sm bg-transparent text-app-text-900 placeholder-app-button-600 resize-none min-h-[20px] max-h-32"
                            rows={1}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              // Paperclip clicked
                              fileInputRef.current?.click();
                            }}
                            className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                            title="Upload knowledge files"
                          >
                            <Paperclip size={16} />
                          </button>
                          <button
                            type="submit"
                            disabled={!createInput.trim() || isCreateGenerating}
                            className="p-1 hover:bg-app-button-600 rounded disabled:opacity-50"
                          >
                            {isCreateGenerating ? (
                              <div className="w-4 h-4 border-2 border-app-button-500 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <Play size={16} className="text-app-text-800" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-app-text-800 text-center">
                          I'll help you define your GPT's purpose, personality,
                          and capabilities through conversation.
                          {files.length > 0 && (
                            <span className="block mt-1 text-app-green-400">
                              📎 {files.length} knowledge file
                              {files.length !== 1 ? "s" : ""} uploaded
                            </span>
                          )}
                        </p>
                      </form>
                    </div>
                  </div>
                ) : activeTab === "configure" ? (
                  // Configure Tab - Advanced Settings
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Avatar */}
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 border-2 border-dashed rounded-lg flex items-center justify-center overflow-hidden cursor-pointer transition-colors"
                        style={{
                          borderColor: config.avatar
                            ? "transparent"
                            : "var(--chatty-line)",
                        }}
                        onClick={triggerAvatarUpload}
                        title="Click to upload avatar image"
                        onMouseEnter={(e) => {
                          if (!config.avatar) {
                            e.currentTarget.style.borderColor =
                              "var(--chatty-status-success)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!config.avatar) {
                            e.currentTarget.style.borderColor =
                              "var(--chatty-line)";
                          }
                        }}
                      >
                        {isUploadingAvatar ? (
                          <div
                            className="animate-spin rounded-full h-6 w-6 border-2 border-t-transparent"
                            style={{
                              borderColor: "var(--chatty-button)",
                              borderTopColor: "transparent",
                            }}
                          ></div>
                        ) : config.avatar ? (
                          <img
                            src={avatarBlobUrl || config.avatar}
                            alt="GPT Avatar"
                            className="w-full h-full object-cover rounded-lg"
                            crossOrigin={
                              config.avatar.startsWith("/api/")
                                ? "use-credentials"
                                : undefined
                            }
                            onError={(e) => {
                              // Fallback to placeholder if image fails to load
                              const target =
                                e.currentTarget as HTMLImageElement;
                              target.style.display = "none";
                            }}
                          />
                        ) : (
                          <Plus
                            size={24}
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "var(--chatty-text)" }}
                        >
                          Avatar
                        </p>
                        <p
                          className="text-xs mb-2"
                          style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                        >
                          {config.avatar && avatarFileName
                            ? `✓ ${avatarFileName}`
                            : "Click the + to upload an image, or generate one automatically"}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={generateAvatar}
                            disabled={
                              isGeneratingAvatar || !config.name?.trim()
                            }
                            className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isGeneratingAvatar
                              ? "Generating..."
                              : "Generate Avatar"}
                          </button>
                          {config.avatar && (
                            <button
                              onClick={() => {
                                setConfig((prev) => ({
                                  ...prev,
                                  avatar: undefined,
                                }));
                                setAvatarFileName(null);
                              }}
                              className="px-3 py-1 text-xs bg-red-800 text-app-text-900 rounded hover:bg-red-700"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Hidden Avatar File Input */}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml"
                      onChange={handleAvatarUpload}
                      className="hidden"
                    />

                    {/* Name */}
                    <div>
                      <label
                        className="block text-sm font-medium mb-2"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        Name
                      </label>
                      <input
                        type="text"
                        value={config.name || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            name: e.target.value,
                          }))
                        }
                        placeholder="Name your GPT"
                        className="w-full p-3 rounded-lg focus:outline-none chatty-placeholder"
                        style={{
                          border: "none",
                          backgroundColor: "var(--chatty-bg-message)",
                          color: "var(--chatty-text)",
                          caretColor: "var(--chatty-text)",
                        }}
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label
                        className="block text-sm font-medium mb-2"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        Description
                      </label>
                      <input
                        type="text"
                        value={config.description || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            description: e.target.value,
                          }))
                        }
                        placeholder="What does this GPT do?"
                        className="w-full p-3 rounded-lg focus:outline-none chatty-placeholder"
                        style={{
                          border: "none",
                          backgroundColor: "var(--chatty-bg-message)",
                          color: "var(--chatty-text)",
                          caretColor: "var(--chatty-text)",
                        }}
                      />
                    </div>

                    {/* Instructions */}
                    <div>
                      <label
                        className="block text-sm font-medium mb-2"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        Instructions
                      </label>
                      <textarea
                        value={config.instructions || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            instructions: e.target.value,
                          }))
                        }
                        placeholder="How should this GPT behave? What should it do and avoid?"
                        rows={6}
                        className="w-full p-3 rounded-lg focus:outline-none resize-none chatty-placeholder"
                        style={{
                          border: "none",
                          backgroundColor: "var(--chatty-bg-message)",
                          color: "var(--chatty-text)",
                          caretColor: "var(--chatty-text)",
                        }}
                      />
                    </div>

                    {/* Tone & Orchestration */}
                    <div className="space-y-4">
                      <div>
                        <h3
                          className="text-sm font-medium mb-2"
                          style={{ color: "var(--chatty-text)" }}
                        >
                          Tone & Orchestration
                        </h3>
                        <div className="flex gap-2 mb-3">
                          <button
                            onClick={() => setOrchestrationMode("lin")}
                            className={`px-4 py-1 rounded-full text-xs font-medium transition-colors`}
                            style={{
                              backgroundColor:
                                orchestrationMode === "lin"
                                  ? "var(--chatty-button)"
                                  : "transparent",
                              color:
                                orchestrationMode === "lin"
                                  ? "var(--chatty-text-inverse)"
                                  : "var(--chatty-text)",
                              opacity: orchestrationMode === "lin" ? 1 : 0.7,
                            }}
                            onMouseEnter={(e) => {
                              if (orchestrationMode !== "lin") {
                                e.currentTarget.style.opacity = "1";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (orchestrationMode !== "lin") {
                                e.currentTarget.style.opacity = "0.7";
                              }
                            }}
                          >
                            Lin
                          </button>
                          <button
                            onClick={() => setOrchestrationMode("custom")}
                            className={`px-4 py-1 rounded-full text-xs font-medium transition-colors`}
                            style={{
                              backgroundColor:
                                orchestrationMode === "custom"
                                  ? "var(--chatty-button)"
                                  : "transparent",
                              color:
                                orchestrationMode === "custom"
                                  ? "var(--chatty-text-inverse)"
                                  : "var(--chatty-text)",
                              opacity: orchestrationMode === "custom" ? 1 : 0.7,
                            }}
                            onMouseEnter={(e) => {
                              if (orchestrationMode !== "custom") {
                                e.currentTarget.style.opacity = "1";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (orchestrationMode !== "custom") {
                                e.currentTarget.style.opacity = "0.7";
                              }
                            }}
                          >
                            Custom Models
                          </button>
                        </div>
                        {orchestrationMode === "lin" && (
                          <p
                            className="text-xs"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          >
                            Chatty's Lin mode uses intelligent orchestration
                            with default models (deepseek, mistral, phi3). Model
                            selection is hidden in this mode.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Model Selection - Only show in Custom Models mode */}
                    {orchestrationMode === "custom" && (
                      <div className="space-y-4">
                        <h3
                          className="text-sm font-medium"
                          style={{ color: "var(--chatty-text)" }}
                        >
                          Model Selection
                        </h3>

                        {/* Conversation Model */}
                        <div>
                          <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: "var(--chatty-text)" }}
                          >
                            Conversation
                          </label>
                          <select
                            value={
                              config.conversationModel ||
                              "openrouter:meta-llama/llama-3.1-8b-instruct"
                            }
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                conversationModel: e.target.value,
                              }))
                            }
                            className="inline-flex items-center px-3 py-2 rounded focus:outline-none"
                            style={{
                              backgroundColor: "var(--chatty-bg-main)",
                              color: "var(--chatty-text)",
                              border: "none",
                              width: "250px",
                            }}
                          >
                            <optgroup label="☁️ OpenRouter (Cloud)">
                              {OPENROUTER_MODELS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="🖥️ Ollama (Self-Hosted)">
                              {OLLAMA_MODELS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          <p
                            className="text-xs mt-1"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.6,
                            }}
                          >
                            OpenRouter = cloud API (works now) | Ollama =
                            self-hosted (requires VM setup)
                          </p>
                        </div>

                        {/* Creative Model - PLACEHOLDER_CREATIVE_START */}
                        <div>
                          <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: "var(--chatty-text)" }}
                          >
                            Creative
                          </label>
                          <select
                            value={
                              config.creativeModel ||
                              "openrouter:mistralai/mistral-7b-instruct"
                            }
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                creativeModel: e.target.value,
                              }))
                            }
                            className="inline-flex items-center px-3 py-2 rounded focus:outline-none"
                            style={{
                              backgroundColor: "var(--chatty-bg-main)",
                              color: "var(--chatty-text)",
                              border: "none",
                              width: "250px",
                            }}
                          >
                            <optgroup label="☁️ OpenRouter (Cloud)">
                              {OPENROUTER_MODELS.filter(
                                (m) =>
                                  m.category === "creative" ||
                                  m.category === "general",
                              ).map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="🖥️ Ollama (Self-Hosted)">
                              {OLLAMA_MODELS.filter(
                                (m) =>
                                  m.category === "creative" ||
                                  m.category === "general",
                              ).map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>

                        {/* Coding Model */}
                        <div>
                          <label
                            className="block text-sm font-medium mb-2"
                            style={{ color: "var(--chatty-text)" }}
                          >
                            Coding
                          </label>
                          <select
                            value={
                              config.codingModel ||
                              "openrouter:deepseek/deepseek-coder-33b-instruct"
                            }
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                codingModel: e.target.value,
                              }))
                            }
                            className="inline-flex items-center px-3 py-2 rounded focus:outline-none"
                            style={{
                              backgroundColor: "var(--chatty-bg-main)",
                              color: "var(--chatty-text)",
                              border: "none",
                              width: "250px",
                            }}
                          >
                            <optgroup label="☁️ OpenRouter (Cloud)">
                              {OPENROUTER_MODELS.filter(
                                (m) => m.category === "coding",
                              ).map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="🖥️ Ollama (Self-Hosted)">
                              {OLLAMA_MODELS.filter(
                                (m) => m.category === "coding",
                              ).map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Conversation Starters */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">
                        Conversation Starters
                      </label>
                      <div className="space-y-2">
                        {config.conversationStarters?.map((starter, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={starter}
                              onChange={(e) =>
                                updateConversationStarter(index, e.target.value)
                              }
                              placeholder="Add a conversation starter"
                              className="flex-1 p-2 rounded focus:outline-none focus:ring-2 focus:ring-app-green-500"
                              style={{
                                backgroundColor:
                                  "var(--chatty-input-bg, #3a3520)",
                                color: "var(--chatty-text)",
                                border: "none",
                              }}
                            />
                            <button
                              onClick={() => removeConversationStarter(index)}
                              className="p-1 hover:bg-app-button-400 rounded text-app-text-800 hover:text-app-text-900"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={addConversationStarter}
                          className="text-sm text-app-green-400 hover:text-app-green-300"
                        >
                          + Add conversation starter
                        </button>
                      </div>
                    </div>

                    {/* File Upload */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">
                        Knowledge
                      </label>
                      <p className="text-xs text-app-text-800 mb-2">
                        Upload files to give your GPT access to specific
                        information
                      </p>

                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="px-4 py-2 border var(--chatty-line) rounded-lg hover:bg-app-button-400 flex items-center gap-2 text-app-text-900 disabled:opacity-50"
                      >
                        <Upload size={16} />
                        {isUploading ? "Uploading..." : "Upload Files"}
                      </button>

                      {/* File List with Pagination */}
                      {files.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-app-text-800">
                              {files.length} file{files.length !== 1 ? "s" : ""}{" "}
                              uploaded
                            </span>
                            {totalFilePages > 1 && (
                              <span className="text-xs text-app-text-800">
                                Page {filePage} of {totalFilePages}
                              </span>
                            )}
                          </div>

                          {currentFiles.map((file) => (
                            <div
                              key={file.id}
                              className="flex items-center justify-between p-2 var(--chatty-highlight) rounded"
                            >
                              <div className="flex items-center gap-2">
                                <FileText
                                  size={16}
                                  className="text-app-text-800"
                                />
                                <span className="text-sm text-app-text-900">
                                  {file.originalName}
                                </span>
                                <span className="text-xs text-app-text-800">
                                  ({gptService.formatFileSize(file.size)})
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveFile(file.id)}
                                className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}

                          {totalFilePages > 1 && (
                            <div className="flex items-center justify-center gap-2 pt-2 border-t var(--chatty-line)">
                              <button
                                onClick={() => goToFilePage(filePage - 1)}
                                disabled={filePage === 1}
                                className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50"
                              >
                                ← Previous
                              </button>
                              <button
                                onClick={() => goToFilePage(filePage + 1)}
                                disabled={filePage === totalFilePages}
                                className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50"
                              >
                                Next →
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Memories / Transcripts */}
                    <div>
                      <label
                        className="block text-sm font-medium mb-2"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        Memories
                      </label>
                      <p
                        className="text-xs mb-3"
                        style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                      >
                        Upload conversation transcripts or a zip file to give your GPT access
                        to past interactions. Zip files preserve directory structure.
                      </p>

                      {/* Organization pipeline: Platform → Year → Month (all optional) */}
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <select
                          value={transcriptSource}
                          onChange={(e) => setTranscriptSource(e.target.value)}
                          className="px-2 py-1.5 rounded text-xs"
                          style={{
                            backgroundColor: "var(--chatty-bg-message)",
                            color: "var(--chatty-text)",
                            border: "1px solid var(--chatty-border)",
                            minWidth: "140px",
                          }}
                        >
                          {TRANSCRIPT_SOURCES.map((src) => (
                            <option key={src.value} value={src.value}>
                              {src.icon} {src.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={transcriptYear}
                          onChange={(e) => setTranscriptYear(e.target.value)}
                          className="px-2 py-1.5 rounded text-xs"
                          style={{
                            backgroundColor: "var(--chatty-bg-message)",
                            color: "var(--chatty-text)",
                            border: "1px solid var(--chatty-border)",
                            minWidth: "100px",
                          }}
                        >
                          {TRANSCRIPT_YEARS.map((yr) => (
                            <option key={yr.value} value={yr.value}>
                              {yr.label}
                            </option>
                          ))}
                        </select>

                        <select
                          value={transcriptMonth}
                          onChange={(e) => setTranscriptMonth(e.target.value)}
                          className="px-2 py-1.5 rounded text-xs"
                          style={{
                            backgroundColor: "var(--chatty-bg-message)",
                            color: "var(--chatty-text)",
                            border: "1px solid var(--chatty-border)",
                            minWidth: "110px",
                          }}
                          disabled={!transcriptYear}
                        >
                          {TRANSCRIPT_MONTHS.map((mo) => (
                            <option key={mo.value} value={mo.value}>
                              {mo.label}
                            </option>
                          ))}
                        </select>

                        {(transcriptSource || transcriptYear || transcriptMonth) && (
                          <button
                            onClick={() => {
                              setTranscriptSource("");
                              setTranscriptYear("");
                              setTranscriptMonth("");
                            }}
                            className="px-2 py-1 rounded text-xs hover:opacity-80"
                            style={{
                              backgroundColor: "transparent",
                              color: "var(--chatty-text)",
                              opacity: 0.6,
                            }}
                            title="Clear organization"
                          >
                            Clear
                          </button>
                        )}
                      </div>

                      {/* Path preview */}
                      {(transcriptSource || transcriptYear || transcriptMonth) && (
                        <div
                          className="text-xs mb-3 px-2 py-1 rounded"
                          style={{
                            backgroundColor: "var(--chatty-bg-message)",
                            color: "var(--chatty-text)",
                            opacity: 0.8,
                          }}
                        >
                          Path: {config.constructCallsign || "construct"}/
                          {transcriptSource || "transcripts"}
                          {transcriptYear && `/${transcriptYear}`}
                          {transcriptMonth && `/${transcriptMonth}`}
                          /filename.txt
                        </div>
                      )}

                      <input
                        type="file"
                        ref={transcriptInputRef}
                        onChange={handleTranscriptUpload}
                        accept=".md,.txt,.rtf,.pdf,.zip"
                        multiple
                        className="hidden"
                      />

                      {/* Upload buttons - individual files or zip */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => transcriptInputRef.current?.click()}
                          disabled={isUploadingTranscripts}
                          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                          style={{
                            border: "none",
                            backgroundColor: "var(--chatty-bg-message)",
                            color: "var(--chatty-text)",
                            opacity: isUploadingTranscripts ? 0.5 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (!isUploadingTranscripts) {
                              e.currentTarget.style.backgroundColor =
                                "var(--chatty-highlight)";
                            }
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor =
                              "var(--chatty-bg-message)";
                          }}
                          title="Upload individual files (.md, .txt, .rtf, .pdf) or a zip file to preserve directory structure"
                        >
                          <Upload size={16} />
                          {isUploadingTranscripts
                            ? "Uploading..."
                            : "Upload Files"}
                        </button>

                        {/* Dynamic transcript count badge - shows total staged + existing files for this construct */}
                        {(() => {
                          const existingCount = Object.values(
                            existingTranscripts,
                          ).reduce((sum, arr) => sum + arr.length, 0);
                          const stagedCount = transcripts.length;
                          const totalCount = existingCount + stagedCount;

                          if (totalCount > 0 || isLoadingExistingTranscripts) {
                            return (
                              <div
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                                style={{
                                  backgroundColor:
                                    stagedCount > 0
                                      ? "var(--chatty-accent)"
                                      : "var(--chatty-bg-message)",
                                  color:
                                    stagedCount > 0
                                      ? "#fff"
                                      : "var(--chatty-text)",
                                  opacity: isLoadingExistingTranscripts
                                    ? 0.6
                                    : 1,
                                }}
                              >
                                {isLoadingExistingTranscripts ? (
                                  <span>Loading...</span>
                                ) : (
                                  <>
                                    <span>
                                      {totalCount} file
                                      {totalCount !== 1 ? "s" : ""}
                                    </span>
                                    {stagedCount > 0 && existingCount > 0 && (
                                      <span style={{ opacity: 0.7 }}>
                                        ({stagedCount} new)
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>

                      {/* Show newly uploaded transcripts (this session) */}
                      {transcripts.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p
                            className="text-xs font-medium"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.8,
                            }}
                          >
                            Just uploaded ({transcripts.length}):
                          </p>
                          {transcripts.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between p-2 rounded"
                              style={{
                                backgroundColor: "var(--chatty-bg-message)",
                              }}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm">
                                  {getSourceIcon(t.source || "other")}
                                </span>
                                <span
                                  className="text-sm truncate"
                                  style={{ color: "var(--chatty-text)" }}
                                >
                                  {t.name}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveTranscript(t.id)}
                                className="ml-2 p-1 rounded hover:bg-red-500/20"
                                style={{ color: "var(--chatty-text)" }}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Show existing transcripts in hierarchical folder tree */}
                      {isLoadingExistingTranscripts ? (
                        <div className="mt-3">
                          <span
                            className="text-xs"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.6,
                            }}
                          >
                            Loading existing transcripts...
                          </span>
                        </div>
                      ) : (
                        allTranscripts.length > 0 && (
                          <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p
                                className="text-xs font-medium"
                                style={{
                                  color: "var(--chatty-text)",
                                  opacity: 0.8,
                                }}
                              >
                                Stored transcripts:
                              </p>
                              <button
                                onClick={async () => {
                                  const constructId = config.constructCallsign || initialConfig?.constructCallsign;
                                  if (!constructId) return;
                                  
                                  setIsAutoOrganizing(true);
                                  try {
                                    const response = await fetch(
                                      `/api/transcripts/auto-organize/${encodeURIComponent(constructId)}`,
                                      {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        credentials: "include",
                                        body: JSON.stringify({ defaultYear: "2025" }),
                                      }
                                    );
                                    
                                    if (response.ok) {
                                      const data = await response.json();
                                      console.log(`🗂️ [ContinuityGPT] Auto-organize result:`, data);
                                      
                                      // Refresh transcript list
                                      const listResponse = await fetch(
                                        `/api/transcripts/list/${encodeURIComponent(constructId)}`,
                                        { credentials: "include" }
                                      );
                                      if (listResponse.ok) {
                                        const listData = await listResponse.json();
                                        if (listData.success) {
                                          if (listData.bySource) setExistingTranscripts(listData.bySource);
                                          if (listData.transcripts) setAllTranscripts(listData.transcripts);
                                        }
                                      }
                                    }
                                  } catch (err) {
                                    console.error("Auto-organize failed:", err);
                                  } finally {
                                    setIsAutoOrganizing(false);
                                  }
                                }}
                                disabled={isAutoOrganizing}
                                className="text-xs px-2 py-1 rounded flex items-center gap-1 transition-colors hover:opacity-80"
                                style={{
                                  backgroundColor: "var(--chatty-accent)",
                                  color: "white",
                                  opacity: isAutoOrganizing ? 0.5 : 1,
                                }}
                              >
                                {isAutoOrganizing ? "Organizing..." : "Auto-Organize"}
                              </button>
                            </div>
                            <div
                              className="rounded-lg p-2 max-h-64 overflow-y-auto"
                              style={{ backgroundColor: "var(--chatty-bg-message)" }}
                            >
                              <TranscriptFolderTree
                                transcripts={allTranscripts}
                                onFileClick={(file) => {
                                  console.log("📄 [Transcripts] File clicked:", file.name);
                                }}
                              />
                            </div>
                          </div>
                        )
                      )}

                      {workspaceContext.memories &&
                        workspaceContext.memories.length > 0 && (
                          <div className="mt-2">
                            <span
                              className="text-xs"
                              style={{
                                color: "var(--chatty-text)",
                                opacity: 0.7,
                              }}
                            >
                              {workspaceContext.memories.length} memory file
                              {workspaceContext.memories.length !== 1
                                ? "s"
                                : ""}{" "}
                              ready
                            </span>
                          </div>
                        )}
                    </div>

                    {/* Capabilities */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">
                        Capabilities
                      </label>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-app-text-900">
                          <input
                            type="checkbox"
                            checked={config.capabilities?.webSearch || false}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                capabilities: {
                                  webSearch: e.target.checked,
                                  canvas: prev.capabilities?.canvas || false,
                                  imageGeneration:
                                    prev.capabilities?.imageGeneration || false,
                                  codeInterpreter:
                                    prev.capabilities?.codeInterpreter || true,
                                },
                              }))
                            }
                            className="rounded border-app-orange-600 bg-app-button-100 text-app-green-500"
                          />
                          <Search size={16} className="text-app-text-900" />
                          <span className="text-sm">Web Search</span>
                        </label>
                        <label className="flex items-center gap-2 text-app-text-900">
                          <input
                            type="checkbox"
                            checked={config.capabilities?.canvas || false}
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                capabilities: {
                                  webSearch:
                                    prev.capabilities?.webSearch || false,
                                  canvas: e.target.checked,
                                  imageGeneration:
                                    prev.capabilities?.imageGeneration || false,
                                  codeInterpreter:
                                    prev.capabilities?.codeInterpreter || true,
                                },
                              }))
                            }
                            className="rounded border-app-orange-600 bg-app-button-100 text-app-green-500"
                          />
                          <Palette size={16} className="text-app-text-900" />
                          <span className="text-sm">Canvas</span>
                        </label>
                        <label className="flex items-center gap-2 text-app-text-900">
                          <input
                            type="checkbox"
                            checked={
                              config.capabilities?.imageGeneration || false
                            }
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                capabilities: {
                                  webSearch:
                                    prev.capabilities?.webSearch || false,
                                  canvas: prev.capabilities?.canvas || false,
                                  imageGeneration: e.target.checked,
                                  codeInterpreter:
                                    prev.capabilities?.codeInterpreter || true,
                                },
                              }))
                            }
                            className="rounded border-app-orange-600 bg-app-button-100 text-app-green-500"
                          />
                          <Image size={16} className="text-app-text-900" />
                          <span className="text-sm">Image Generation</span>
                        </label>
                        <label className="flex items-center gap-2 text-app-text-900">
                          <input
                            type="checkbox"
                            checked={
                              config.capabilities?.codeInterpreter || false
                            }
                            onChange={(e) =>
                              setConfig((prev) => ({
                                ...prev,
                                capabilities: {
                                  webSearch:
                                    prev.capabilities?.webSearch || false,
                                  canvas: prev.capabilities?.canvas || false,
                                  imageGeneration:
                                    prev.capabilities?.imageGeneration || false,
                                  codeInterpreter: e.target.checked,
                                },
                              }))
                            }
                            className="rounded border-app-orange-600 bg-app-button-100 text-app-green-500"
                          />
                          <Code size={16} className="text-app-text-900" />
                          <span className="text-sm">Code Interpreter</span>
                        </label>
                      </div>
                    </div>

                    {/* Actions */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">
                        Actions
                      </label>
                      <p className="text-xs text-app-text-800 mb-3">
                        Add API endpoints your GPT can call
                      </p>

                      <button
                        onClick={() => setIsActionsEditorOpen(true)}
                        className="w-full p-4 border-2 border-dashed border-app-orange-600 rounded-lg hover:border-app-orange-500 transition-colors flex items-center justify-center gap-2 text-app-text-800 hover:text-app-text-900"
                      >
                        <Plus size={20} />
                        <span>Open Actions Editor</span>
                      </button>

                      {/* Action List */}
                      {actions.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {actions.map((action) => (
                            <div
                              key={action.id}
                              className="flex items-center justify-between p-2 var(--chatty-highlight) rounded"
                            >
                              <div className="flex items-center gap-2">
                                <Link size={16} className="text-app-text-800" />
                                <span className="text-sm text-app-text-900">
                                  {action.name}
                                </span>
                                <span className="text-xs text-app-text-800">
                                  ({action.method})
                                </span>
                              </div>
                              <button
                                onClick={() => removeAction(action.id)}
                                className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Script Management Section */}
                    {config.id && (
                      <div className="space-y-4 mt-6">
                        <h3
                          className="text-sm font-medium"
                          style={{ color: "var(--chatty-text)" }}
                        >
                          Script Management
                        </h3>

                        {/* Persistence/Autonomy/Independence Toggle */}
                        <div
                          className="p-4 rounded-lg"
                          style={{
                            backgroundColor: "var(--chatty-bg-message)",
                            border: "1px solid var(--chatty-line)",
                          }}
                        >
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={persistenceEnabled}
                              onChange={(e) =>
                                setPersistenceEnabled(e.target.checked)
                              }
                              className="rounded"
                            />
                            <span
                              className="text-sm"
                              style={{ color: "var(--chatty-text)" }}
                            >
                              Persistence/Autonomy/Independence
                            </span>
                          </label>
                          <p
                            className="text-xs mt-1 ml-6"
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.7,
                            }}
                          >
                            Enable scripts to persist state, operate
                            independently, and maintain autonomy
                          </p>
                        </div>

                        {/* Memory Toggles */}
                        <div
                          className="p-4 rounded-lg space-y-3"
                          style={{
                            backgroundColor: "var(--chatty-bg-message)",
                            border: "1px solid var(--chatty-line)",
                          }}
                        >
                          <h4
                            className="text-xs font-medium"
                            style={{ color: "var(--chatty-text)" }}
                          >
                            Memory Settings
                          </h4>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={stmEnabled}
                              onChange={(e) => setStmEnabled(e.target.checked)}
                              className="rounded"
                            />
                            <span
                              className="text-sm"
                              style={{ color: "var(--chatty-text)" }}
                            >
                              STM (Short-Term Memory)
                            </span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ltmEnabled}
                              onChange={(e) => setLtmEnabled(e.target.checked)}
                              className="rounded"
                            />
                            <span
                              className="text-sm"
                              style={{ color: "var(--chatty-text)" }}
                            >
                              LTM (Long-Term Memory)
                            </span>
                          </label>
                        </div>

                        {/* Available Scripts */}
                        <div className="space-y-2">
                          <h4
                            className="text-xs font-medium mb-2"
                            style={{ color: "var(--chatty-text)" }}
                          >
                            Available Scripts
                          </h4>
                          {scripts.length === 0 ? (
                            <p
                              className="text-xs"
                              style={{
                                color: "var(--chatty-text)",
                                opacity: 0.7,
                              }}
                            >
                              No scripts available. Scripts will load when a
                              construct is selected.
                            </p>
                          ) : (
                            scripts.map((script) => (
                              <div
                                key={script.key}
                                className="p-3 rounded-lg"
                                style={{
                                  backgroundColor: "var(--chatty-bg-message)",
                                  border: "1px solid var(--chatty-line)",
                                }}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <div
                                      className="text-sm font-medium"
                                      style={{ color: "var(--chatty-text)" }}
                                    >
                                      {script.name}
                                    </div>
                                    <div
                                      className="text-xs"
                                      style={{
                                        color: "var(--chatty-text)",
                                        opacity: 0.7,
                                      }}
                                    >
                                      {script.description}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`text-xs px-2 py-1 rounded ${script.status === "running" ? "bg-green-600" : "bg-gray-600"}`}
                                    >
                                      {script.status}
                                    </span>
                                    <button
                                      onClick={async () => {
                                        const constructCallsign =
                                          config.id?.replace("gpt-", "") || "";
                                        const user = await fetchMe().catch(
                                          () => null,
                                        );
                                        const userId = user
                                          ? getUserId(user)
                                          : null;

                                        if (script.status === "running") {
                                          const res = await fetch(
                                            "/api/scripts/stop",
                                            {
                                              method: "POST",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                              },
                                              credentials: "include",
                                              body: JSON.stringify({
                                                script: script.key,
                                                construct: constructCallsign,
                                              }),
                                            },
                                          );
                                          if (res.ok) {
                                            setScripts((prev) =>
                                              prev.map((s) =>
                                                s.key === script.key
                                                  ? { ...s, status: "stopped" }
                                                  : s,
                                              ),
                                            );
                                          }
                                        } else {
                                          const res = await fetch(
                                            "/api/scripts/start",
                                            {
                                              method: "POST",
                                              headers: {
                                                "Content-Type":
                                                  "application/json",
                                              },
                                              credentials: "include",
                                              body: JSON.stringify({
                                                script: script.key,
                                                construct: constructCallsign,
                                                userId,
                                              }),
                                            },
                                          );
                                          if (res.ok) {
                                            setScripts((prev) =>
                                              prev.map((s) =>
                                                s.key === script.key
                                                  ? { ...s, status: "running" }
                                                  : s,
                                              ),
                                            );
                                          }
                                        }
                                      }}
                                      className="text-xs px-2 py-1 rounded"
                                      style={{
                                        backgroundColor: "var(--chatty-button)",
                                        color: "var(--chatty-text-inverse)",
                                      }}
                                    >
                                      {script.status === "running"
                                        ? "Stop"
                                        : "Start"}
                                    </button>
                                  </div>
                                </div>
                                {expandedLogs[script.key] && (
                                  <div
                                    className="mt-2 p-2 rounded text-xs font-mono max-h-32 overflow-y-auto"
                                    style={{
                                      backgroundColor: "var(--chatty-bg-main)",
                                      color: "var(--chatty-text)",
                                    }}
                                  >
                                    {scriptLogs[script.key]?.length > 0 ? (
                                      scriptLogs[script.key].map((log, i) => (
                                        <div key={i}>{log}</div>
                                      ))
                                    ) : (
                                      <div style={{ opacity: 0.7 }}>
                                        No logs available
                                      </div>
                                    )}
                                  </div>
                                )}
                                <button
                                  onClick={() =>
                                    setExpandedLogs((prev) => ({
                                      ...prev,
                                      [script.key]: !prev[script.key],
                                    }))
                                  }
                                  className="text-xs mt-2"
                                  style={{
                                    color: "var(--chatty-text)",
                                    opacity: 0.7,
                                  }}
                                >
                                  {expandedLogs[script.key]
                                    ? "Hide Logs"
                                    : "Show Logs"}
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  // Forge Tab - Personality Extraction from Transcripts
                  <div className="flex-1 overflow-y-auto p-6">
                    <PersonalityForge
                      constructCallsign={config.constructCallsign || config.name?.toLowerCase().replace(/\s+/g, '-') + '-001' || 'unknown'}
                      constructName={config.name || 'Construct'}
                      onIdentityForged={(result) => {
                        console.log('[GPTCreator] Identity forged:', result);
                        if (result.identityFiles?.['prompt.txt']) {
                          setConfig(prev => ({
                            ...prev,
                            instructions: result.identityFiles?.['prompt.txt'] || prev.instructions
                          }));
                        }
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Preview */}
            <div
              className="w-1/2 flex flex-col"
              style={{ backgroundColor: "var(--chatty-bg-message)" }}
            >
              <div className="p-4" style={{ backgroundColor: "transparent" }}>
                <div className="flex items-center justify-between">
                  <h2
                    className="text-lg font-semibold"
                    style={{ color: "var(--chatty-text)" }}
                  >
                    Preview
                  </h2>
                  {previewMessages.length > 0 && (
                    <button
                      onClick={() => setPreviewMessages([])}
                      className="text-xs transition-colors"
                      style={{
                        color: "var(--chatty-text)",
                        opacity: 0.7,
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.opacity = "1")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.opacity = "0.7")
                      }
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                {/* Chat Preview */}
                <div className="flex-1 p-4 overflow-y-auto min-h-0">
                  {/* Preview Header with Avatar */}
                  {previewMessages.length === 0 && (
                    <div className="text-center py-8">
                      <div
                        className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center overflow-hidden"
                        style={{
                          backgroundColor: "transparent",
                          position: "relative",
                        }}
                      >
                        {config.avatar ? (
                          <>
                            <img
                              src={avatarBlobUrl || config.avatar}
                              alt={config.name || "GPT"}
                              className="absolute inset-0 w-full h-full object-cover"
                              style={{
                                borderRadius: "50%",
                                objectFit: "cover",
                                objectPosition: "center",
                              }}
                              crossOrigin={
                                config.avatar.startsWith("/api/")
                                  ? "use-credentials"
                                  : undefined
                              }
                              onError={(e) => {
                                // If image fails to load, hide it
                                const target =
                                  e.currentTarget as HTMLImageElement;
                                target.style.display = "none";
                                // Show the fallback bot icon
                                const parent = target.parentElement;
                                const fallback =
                                  parent?.querySelector(".avatar-fallback");
                                if (fallback) {
                                  (fallback as HTMLElement).style.display =
                                    "flex";
                                }
                              }}
                            />
                            {/* Fallback bot icon (hidden by default, shown on image error) */}
                            <div
                              className="avatar-fallback absolute inset-0 flex items-center justify-center"
                              style={{ display: "none" }}
                            >
                              <Bot
                                size={32}
                                style={{
                                  color: "var(--chatty-text)",
                                  opacity: 0.5,
                                }}
                              />
                            </div>
                          </>
                        ) : (
                          <Bot
                            size={32}
                            style={{
                              color: "var(--chatty-text)",
                              opacity: 0.5,
                            }}
                          />
                        )}
                      </div>
                      <h3
                        className="text-lg font-medium mb-2"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        {config.name || "Your GPT"}
                      </h3>
                      <p
                        className="text-sm mb-4"
                        style={{ color: "var(--chatty-text)", opacity: 0.85 }}
                      >
                        {config.description || "Preview your GPT here."}
                      </p>
                    </div>
                  )}
                  {previewMessages.length > 0 && (
                    <div className="space-y-3 pb-4">
                      {previewMessages.map((message, index) => (
                        <div key={index}>
                          <p className="text-sm text-app-text-900 whitespace-pre-wrap">
                            {message.role === "user" ? (
                              <>
                                <span className="font-medium text-app-text-800">
                                  You:
                                </span>{" "}
                                {message.content}
                              </>
                            ) : (
                              <>
                                <span
                                  className="font-medium"
                                  style={{ color: "#00aeef" }}
                                >
                                  {config.name || "Assistant"}:
                                </span>{" "}
                                {message.content}
                              </>
                            )}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Input Preview */}
                <div className="p-4">
                  <form onSubmit={handlePreviewSubmit} className="space-y-2">
                    <div
                      className="flex items-center gap-2 p-3 rounded-lg"
                      style={{ backgroundColor: "transparent" }}
                    >
                      <textarea
                        ref={previewInputRef}
                        value={previewInput}
                        onChange={(e) => setPreviewInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handlePreviewSubmit(e);
                          }
                        }}
                        placeholder="Ask anything"
                        className="flex-1 outline-none text-sm bg-transparent text-app-text-900 placeholder-app-button-600 resize-none min-h-[20px] max-h-32"
                        rows={1}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          // Preview tab paperclip clicked
                          fileInputRef.current?.click();
                        }}
                        className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                        title="Upload knowledge files"
                      >
                        <Paperclip size={16} />
                      </button>
                      <button
                        type="submit"
                        disabled={!previewInput.trim() || isPreviewGenerating}
                        className="p-1 hover:bg-app-button-600 rounded disabled:opacity-50"
                      >
                        {isPreviewGenerating ? (
                          <div className="w-4 h-4 border-2 border-app-button-500 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <Play size={16} className="text-app-text-800" />
                        )}
                      </button>
                    </div>
                    <div
                      className="text-xs text-center space-y-1"
                      style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                    >
                      <p>This is a live preview using the configured models.</p>
                      <p>
                        Your GPT will behave based on the current configuration
                        above.
                      </p>
                      {config.name && (
                        <p style={{ color: "var(--chatty-status-success)" }}>
                          ✓ Configured as: {config.name}
                        </p>
                      )}
                      {(config.conversationModel ||
                        config.creativeModel ||
                        config.codingModel) && (
                        <div className="text-xs mt-2">
                          <p style={{ color: "var(--chatty-status-success)" }}>
                            Models: {config.conversationModel || "default"} |{" "}
                            {config.creativeModel || "default"} |{" "}
                            {config.codingModel || "default"}
                          </p>
                        </div>
                      )}
                      {files.length > 0 && (
                        <div className="text-xs mt-2">
                          <p style={{ color: "var(--chatty-status-success)" }}>
                            📎 {files.length} knowledge file
                            {files.length !== 1 ? "s" : ""} available
                          </p>
                        </div>
                      )}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions Editor Modal - Nested modal with higher z-index */}
      {isActionsEditorOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            style={{
              zIndex: Z_LAYERS.critical + 2,
              pointerEvents: "auto",
            }}
            onClick={() => setIsActionsEditorOpen(false)}
          />
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{
              zIndex: Z_LAYERS.critical + 2,
              pointerEvents: "none",
            }}
          >
            <div
              className="bg-app-button-100 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col"
              style={{
                zIndex: Z_LAYERS.critical + 3,
                pointerEvents: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-app-button-300">
                <div>
                  <h2 className="text-xl font-semibold text-app-text-900">
                    Edit Actions
                  </h2>
                  <p className="text-sm text-app-text-800 mt-1">
                    Let your GPT retrieve information or take actions outside of
                    Chatty.
                    <a
                      href="#"
                      className="text-app-green-400 hover:underline ml-1"
                    >
                      Learn more
                    </a>
                  </p>
                </div>
                <button
                  onClick={() => setIsActionsEditorOpen(false)}
                  className="p-2 hover:bg-app-button-400 rounded-lg text-app-text-800 hover:text-app-text-900"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 flex overflow-hidden">
                {/* Left Panel - Schema Editor */}
                <div className="flex-1 p-6 border-r border-app-button-300">
                  <div className="space-y-4">
                    {/* Authentication */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">
                        Authentication
                      </label>
                      <div className="flex items-center gap-2">
                        <select className="flex-1 p-2 border var(--chatty-line) rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-button-100 text-app-text-900">
                          <option value="none">None</option>
                          <option value="api-key">API Key</option>
                          <option value="oauth">OAuth</option>
                        </select>
                        <button className="p-2 hover:bg-app-button-400 rounded text-app-text-800 hover:text-app-text-900">
                          <Code size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Schema */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-app-text-900">
                          Schema
                        </label>
                        <div className="flex gap-2">
                          <button className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                            Import from URL
                          </button>
                          <select
                            className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600"
                            onChange={(e) => {
                              if (e.target.value === "katana-chatty-bridge") {
                                setActionsSchema(`{
  "openapi": "3.1.0",
  "info": {
    "title": "Katana Chatty Bridge",
    "version": "1.0.1",
    "description": "Endpoints to send prompts to Chatty and receive replies back to Katana."
  },
  "servers": [
    {
      "url": "https://okay-air-sector-bishop.trycloudflare.com",
      "description": "Cloudflare tunnel to local Chatty bridge"
    }
  ],
  "paths": {
    "/chatty": {
      "post": {
        "summary": "Queue a prompt in the Chatty CLI terminal",
        "operationId": "sendMessageToChatty",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "message": {
                    "type": "string",
                    "description": "The message to send to Chatty"
                  },
                  "sender": {
                    "type": "string",
                    "description": "Who is sending the message (e.g., 'katana')"
                  }
                },
                "required": ["message", "sender"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Message queued successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "boolean"
                    },
                    "message": {
                      "type": "string"
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/katana-listen": {
      "post": {
        "summary": "Receive responses from Chatty CLI",
        "operationId": "receiveFromChatty",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "response": {
                    "type": "string",
                    "description": "The response from Chatty"
                  },
                  "originalMessage": {
                    "type": "string",
                    "description": "The original message that was sent"
                  }
                },
                "required": ["response"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Response received successfully",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "success": {
                      "type": "boolean"
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}`);
                              }
                            }}
                          >
                            <option>Examples</option>
                            <option value="katana-chatty-bridge">
                              Katana ↔ Chatty Bridge
                            </option>
                            <option>Weather API</option>
                            <option>Database API</option>
                          </select>
                        </div>
                      </div>
                      <textarea
                        value={actionsSchema}
                        onChange={(e) => setActionsSchema(e.target.value)}
                        className="w-full h-96 p-3 border var(--chatty-line) rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-button-100 text-app-text-900 font-mono text-sm resize-none"
                        placeholder="Enter your OpenAPI schema here..."
                      />
                      <div className="flex justify-end mt-2">
                        <button className="px-3 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                          Format
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Panel - Available Actions */}
                <div className="w-80 p-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-app-text-900">
                      Available actions
                    </h3>

                    {/* Actions List */}
                    <div className="space-y-2">
                      <div className="p-3 border var(--chatty-line) rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-app-text-900">
                            sendMessageToChatty
                          </span>
                          <button className="px-2 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                            Test
                          </button>
                        </div>
                        <div className="text-xs text-app-text-800 space-y-1">
                          <div>POST /chatty</div>
                          <div>Queue a prompt in the Chatty CLI terminal</div>
                        </div>
                      </div>

                      <div className="p-3 border var(--chatty-line) rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-app-text-900">
                            receiveFromChatty
                          </span>
                          <button className="px-2 py-1 text-xs bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600">
                            Test
                          </button>
                        </div>
                        <div className="text-xs text-app-text-800 space-y-1">
                          <div>POST /katana-listen</div>
                          <div>Receive responses from Chatty CLI</div>
                        </div>
                      </div>
                    </div>

                    {/* Privacy Policy */}
                    <div>
                      <label className="block text-sm font-medium mb-2 text-app-text-900">
                        Privacy policy
                      </label>
                      <input
                        type="url"
                        placeholder="https://app.example.com/privacy"
                        className="w-full p-2 border var(--chatty-line) rounded focus:outline-none focus:ring-2 focus:ring-app-green-500 bg-app-button-100 text-app-text-900 placeholder-app-button-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-app-button-300">
                <button
                  onClick={() => setIsActionsEditorOpen(false)}
                  className="px-4 py-2 text-sm text-app-text-800 hover:text-app-text-900"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Parse schema and extract actions
                    try {
                      const schema = JSON.parse(actionsSchema);
                      const extractedActions: GPTAction[] = [];

                      if (schema.paths) {
                        Object.entries(schema.paths).forEach(
                          ([path, methods]: [string, any]) => {
                            Object.entries(methods).forEach(
                              ([method, operation]: [string, any]) => {
                                if (operation.operationId) {
                                  extractedActions.push({
                                    id: `action-${crypto.randomUUID()}`,
                                    gptId: "temp",
                                    name: operation.operationId,
                                    description:
                                      operation.summary ||
                                      operation.description ||
                                      "",
                                    url: `${schema.servers?.[0]?.url || ""}${path}`,
                                    method: method.toUpperCase() as
                                      | "GET"
                                      | "POST"
                                      | "PUT"
                                      | "DELETE",
                                    headers: {},
                                    parameters: {},
                                    isActive: true,
                                    createdAt: new Date().toISOString(),
                                  });
                                }
                              },
                            );
                          },
                        );
                      }

                      setActions(extractedActions);
                      setIsActionsEditorOpen(false);
                    } catch (error) {
                      setError("Invalid JSON schema");
                    }
                  }}
                  className="px-4 py-2 text-sm bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600"
                >
                  Save Actions
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Crop Modal - Nested modal with higher z-index */}
      {showCropModal && imageToCrop && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-75"
            style={{
              zIndex: Z_LAYERS.critical + 2,
              pointerEvents: "auto",
            }}
            onClick={handleCropCancel}
          />
          <div
            className="fixed inset-0 flex items-center justify-center p-4"
            style={{
              zIndex: Z_LAYERS.critical + 2,
              pointerEvents: "none",
            }}
          >
            <div
              className="bg-app-button-100 rounded-lg p-6 w-full max-w-2xl mx-4"
              style={{
                zIndex: Z_LAYERS.critical + 3,
                pointerEvents: "auto",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-app-text-900">
                  Crop Avatar
                </h3>
                <button
                  onClick={handleCropCancel}
                  className="text-app-text-800 hover:text-app-text-900"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="mb-4">
                <div className="relative w-full h-64 var(--chatty-highlight) rounded-lg overflow-hidden">
                  <Cropper
                    image={imageToCrop}
                    crop={crop}
                    zoom={zoom}
                    aspect={1} // Force 1:1 aspect ratio for square avatars
                    onCropChange={onCropChange}
                    onCropComplete={onCropComplete}
                    onZoomChange={setZoom}
                    showGrid={true}
                    style={{
                      containerStyle: {
                        width: "100%",
                        height: "100%",
                        position: "relative",
                      },
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 mb-4">
                <label className="text-sm text-app-text-800">Zoom:</label>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-app-text-800">
                  {Math.round(zoom * 100)}%
                </span>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCropCancel}
                  className="px-4 py-2 text-sm bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-500"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCropComplete}
                  disabled={isUploadingAvatar}
                  className="px-4 py-2 text-sm bg-app-button-500 text-app-text-900 rounded hover:bg-app-button-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isUploadingAvatar ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      Cropping...
                    </>
                  ) : (
                    <>
                      <Crop size={16} />
                      Crop & Save
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>,
    document.body,
  );
};

export default GPTCreator;
