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
  FileText,
  Link,
  Play,
  Bot,
  Paperclip,
  Crop,
  ImageOff,
  RotateCcw,
  FolderOpen,
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
import { KnowledgeFileTree } from "./KnowledgeFileTree";
import PersonalityForge from "./PersonalityForge";
import {
  getUserFriendlyErrorMessage,
  isOrchestrationError,
} from "../engine/orchestration/OrchestrationErrors";
import { OPENAI_MODELS, OPENROUTER_MODELS, OLLAMA_MODELS, ALL_MODELS } from "../lib/modelProviders";

interface GPTCreatorProps {
  isVisible: boolean;
  onClose: () => void;
  onGPTCreated?: (gpt: GPTConfig) => void;
  initialConfig?: GPTConfig | null;
  initialCreateMessage?: string | null;
}

const GPTCreator: React.FC<GPTCreatorProps> = ({
  isVisible,
  onClose,
  onGPTCreated,
  initialConfig,
  initialCreateMessage,
}) => {
  const { settings } = useSettings();
  const [activeTab, setActiveTab] = useState<"create" | "configure" | "forge">(
    "create",
  );
  const [gptService] = useState(() => GPTService.getInstance());
  const [aiService] = useState(() => AIService.getInstance());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [lastSaveTime, setLastSaveTime] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [lastPreviewModel, setLastPreviewModel] = useState<string | null>(null);
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
    modelId: "openrouter:meta-llama/llama-3.3-70b-instruct",
    conversationModel: "openrouter:meta-llama/llama-3.3-70b-instruct",
    creativeModel: "openrouter:mistralai/mistral-7b-instruct",
    codingModel: "openrouter:deepseek/deepseek-coder-33b-instruct",
  });

  // File management
  const [files, setFiles] = useState<GPTFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [filePage, setFilePage] = useState(1);
  const [filesPerPage] = useState(20); // Show 20 files per page for 300+ files
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duplicate file detection
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateFileNames, setDuplicateFileNames] = useState<string[]>([]);
  const [pendingZipEntries, setPendingZipEntries] = useState<Array<{ name: string; file: GPTFile }>>([]);
  const [isReplacingFiles, setIsReplacingFiles] = useState(false);

  // Upload progress tracking
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarFileName, setAvatarFileName] = useState<string | null>(null);

  // Transcript upload
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [folderUploadProgress, setFolderUploadProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
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
  const [isBackfillingPdfs, setIsBackfillingPdfs] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
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
    Array<{ role: "user" | "assistant"; content: string; timestamp?: number; attachments?: Array<{ name: string; type: string; data: string }> }>
  >([]);
  const [previewInput, setPreviewInput] = useState("");
  const [isPreviewGenerating, setIsPreviewGenerating] = useState(false);
  const [previewImageFiles, setPreviewImageFiles] = useState<File[]>([]);
  const previewFileInputRef = useRef<HTMLInputElement>(null);
  
  // Exit confirmation (save preview conversation)
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [isSavingPreview, setIsSavingPreview] = useState(false);
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
  const initialCreateMessageSentRef = useRef<string | null>(null);

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
      const savedModel = initialConfig.conversationModel || initialConfig.modelId;
      const isLinDefault = !savedModel || savedModel === "openrouter:microsoft/phi-3-mini-128k-instruct";
      if (!isLinDefault) {
        setOrchestrationMode("custom");
      }
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
          const knowledgeOnly = (loadedFiles as GPTFile[]).filter(
            (f: any) => f.category === 'knowledge'
          );
          setFiles(knowledgeOnly);
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

        const loadIdentityFields = async () => {
          try {
            const res = await fetch(`/api/ais/${initialConfig.id}/identity-fields`, {
              credentials: 'include',
            });
            if (res.ok) {
              const data = await res.json();
              if (data.success) {
                setConfig(prev => ({
                  ...prev,
                  conditioning: data.conditioning || prev.conditioning || '',
                  physicalFeatures: data.physicalFeatures || prev.physicalFeatures || '',
                }));
              }
            }
          } catch (err) {
            console.error('Failed to load identity fields:', err);
          }
        };
        loadIdentityFields();

        // Load scripts for this construct
        const loadScripts = async () => {
          try {
            setIsLoadingScripts(true);
            const constructCallsignRaw =
              (initialConfig as any).constructCallsign ||
              (initialConfig as any).callsign ||
              initialConfig.id;
            const constructCallsign = String(constructCallsignRaw || "")
              .replace(/^gpt-/, "")
              .trim();
            if (!constructCallsign) return;
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
      setOrchestrationMode("lin");
      orchestrationModeUserChanged.current = false;
    }
  }, [isVisible, initialConfig]);

  // Load scripts when config.id changes (for new GPTs)
  useEffect(() => {
    if (!config.id || !isVisible || initialConfig?.id) return;

    const loadScripts = async () => {
      try {
        setIsLoadingScripts(true);
        const constructCallsignRaw =
          (config as any).constructCallsign || (config as any).callsign || config.id;
        const constructCallsign = String(constructCallsignRaw || "")
          .replace(/^gpt-/, "")
          .trim();
        if (!constructCallsign) return;
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

  // NOTE: Removed auto-clear of preview messages on config changes
  // Preview conversations are valuable and should persist throughout the session
  // Users can now choose to save or discard when exiting GPTCreator

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

  // Set default models when user manually switches TO Lin mode (not on initial load)
  const orchestrationModeUserChanged = useRef(false);
  useEffect(() => {
    if (orchestrationMode === "lin" && orchestrationModeUserChanged.current) {
      setConfig((prev) => ({
        ...prev,
        conversationModel: "openrouter:meta-llama/llama-3.3-70b-instruct",
        creativeModel: "openrouter:mistralai/mistral-7b-instruct",
        codingModel: "openrouter:deepseek/deepseek-coder-33b-instruct",
      }));
    }
    orchestrationModeUserChanged.current = true;
  }, [orchestrationMode]);

  // Load Lin's conversation history from Supabase when GPTCreator opens
  // Same pattern as Zen's canonical conversation loading
  useEffect(() => {
    const loadLinConversation = async () => {
      if (!isVisible) return;
      
      try {
        const user = await fetchMe().catch(() => null);
        if (!user) {
          console.log("📚 [Lin] No user, skipping conversation load");
          return;
        }
        
        const userEmail = user.email;
        if (!userEmail) {
          console.log("📚 [Lin] No user email, skipping conversation load");
          return;
        }
        
        console.log("📚 [Lin] Loading conversation from Supabase vault_files...");
        
        // Load Lin's canonical conversation from Supabase via VVAULT API
        const response = await fetch("/api/vvault/conversations", {
          method: "GET",
          credentials: "include",
        });
        
        if (!response.ok) {
          console.warn("⚠️ [Lin] Failed to load conversations:", response.statusText);
          return;
        }
        
        const data = await response.json();
        const conversations = data.conversations || [];
        
        // Debug: Log all available conversations to help troubleshoot
        console.log(`📚 [Lin] Available conversations (${conversations.length}):`, 
          conversations.map((c: any) => ({
            sessionId: c.sessionId,
            constructId: c.constructId,
            title: c.title,
            messageCount: c.messages?.length || 0
          }))
        );
        
        // Find Lin's canonical conversation using exact sessionId matching
        // The canonical sessionId follows the pattern: {constructId}_chat_with_{constructId}
        const LIN_CANONICAL_SESSION_ID = "lin-001_chat_with_lin-001";
        const linConversation = conversations.find((conv: any) => 
          conv.sessionId === LIN_CANONICAL_SESSION_ID ||
          conv.constructId === "lin-001" ||
          (conv.sessionId && conv.sessionId.startsWith("lin-001")) ||
          conv.title?.toLowerCase() === "lin" ||
          conv.constructName?.toLowerCase() === "lin"
        );
        
        if (linConversation && linConversation.messages?.length > 0) {
          console.log(`✅ [Lin] Loaded ${linConversation.messages.length} messages from canonical conversation (sessionId: ${linConversation.sessionId})`);
          
          // Convert to createMessages format
          const loadedMessages = linConversation.messages.map((msg: any) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content || "",
            timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
          }));
          
          setCreateMessages(loadedMessages);
        } else {
          console.log("📚 [Lin] No existing conversation found in vault_files, starting fresh");
          console.log("💡 [Lin] New messages will be saved to instances/lin/chatty/chat_with_lin-001.md");
        }
      } catch (error) {
        console.error("❌ [Lin] Error loading conversation:", error);
      }
    };
    
    loadLinConversation();
  }, [isVisible]);

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
      modelId: "openrouter:meta-llama/llama-3.3-70b-instruct",
      conversationModel: "openrouter:meta-llama/llama-3.3-70b-instruct",
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

  // Handle close with confirmation if preview messages exist
  const handleCloseWithConfirmation = () => {
    if (previewMessages.length > 0) {
      setShowExitConfirmation(true);
    } else {
      onClose();
    }
  };

  // Save preview conversation to construct's transcript in Supabase
  const savePreviewConversation = async () => {
    if (previewMessages.length === 0 || !config.constructCallsign) {
      console.log('[GPTCreator] No preview messages to save or missing callsign');
      onClose();
      return;
    }

    setIsSavingPreview(true);
    try {
      // Format messages for transcript
      const now = Date.now();
      const formattedMessages = previewMessages.map((msg, idx) => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp || now - (previewMessages.length - idx) * 1000
      }));

      // Append to the construct's canonical transcript via API
      const response = await fetch('/api/transcripts/append-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          constructCallsign: config.constructCallsign,
          constructName: config.name || config.constructCallsign,
          messages: formattedMessages,
          source: 'chatty-preview'
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('[GPTCreator] Failed to save preview:', error);
      } else {
        console.log(`[GPTCreator] Saved ${previewMessages.length} preview messages to transcript`);
      }
    } catch (error) {
      console.error('[GPTCreator] Error saving preview conversation:', error);
    } finally {
      setIsSavingPreview(false);
      setShowExitConfirmation(false);
      setPreviewMessages([]);
      onClose();
    }
  };

  // Discard preview and close
  const discardPreviewAndClose = () => {
    setShowExitConfirmation(false);
    setPreviewMessages([]);
    onClose();
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

      const payload: any = {
        name: config.name,
        description: config.description,
        instructions: config.instructions,
        conversationStarters: config.conversationStarters,
        capabilities: config.capabilities,
        constructCallsign: config.constructCallsign,
        modelId: config.modelId,
        conversationModel: config.conversationModel,
        creativeModel: config.creativeModel,
        codingModel: config.codingModel,
        orchestrationMode: config.orchestrationMode,
        isActive: config.isActive,
        hasPersistentMemory: config.hasPersistentMemory,
        conditioning: config.conditioning,
        physicalFeatures: config.physicalFeatures,
      };

      if (config.avatar && config.avatar.startsWith('data:')) {
        payload.avatar = config.avatar;
      }

      if (config.id) {
        if (isAIService) {
          gpt = await (service as AIService).updateAI(config.id, payload);
        } else {
          gpt = await (service as GPTService).updateGPT(config.id, payload);
        }
        setConfig((prev) => ({
          ...prev,
          ...gpt,
          avatar: gpt.avatar || prev.avatar,
          files: prev.files || [],
          actions: prev.actions || [],
        }));
      } else {
        if (isAIService) {
          gpt = await (service as AIService).createAI(payload);
        } else {
          gpt = await (service as GPTService).createGPT(payload);
        }
        setConfig((prev) => ({
          ...prev,
          ...gpt,
          id: gpt.id,
          avatar: gpt.avatar || prev.avatar,
          files: prev.files || [],
          actions: prev.actions || [],
        }));
      }

      if (config.conditioning !== undefined || config.physicalFeatures !== undefined) {
        try {
          const gptId = gpt.id || config.id;
          await fetch(`/api/ais/${gptId}/identity-fields`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              conditioning: config.conditioning,
              physicalFeatures: config.physicalFeatures,
            }),
          });
        } catch (err) {
          console.error('Failed to save identity fields:', err);
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
      setUploadProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreFromSupabase = async () => {
    if (!config.id) return;
    if (!window.confirm('This will overwrite your current description, instructions, and conversation starters with the version stored in Supabase. Continue?')) return;
    try {
      setIsRestoring(true);
      setError(null);
      const { service, isAIService } = getServiceForGPT(config.id);
      const response = await fetch(`/api/gpts/${config.id}/restore-from-supabase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Restore failed');
      if (data.gpt) {
        setConfig(prev => ({
          ...prev,
          name: data.gpt.name || prev.name,
          description: data.gpt.description || prev.description,
          instructions: data.gpt.instructions || prev.instructions,
          conversationStarters: data.gpt.conversationStarters || prev.conversationStarters,
        }));
      }
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to restore from Supabase');
    } finally {
      setIsRestoring(false);
    }
  };

  const getFileMatchKey = (f: GPTFile): string => {
    return (f.originalName || f.filename || '').toLowerCase();
  };

  const draftCreationRef = useRef<Promise<string> | null>(null);

  const ensureGptId = async (): Promise<string> => {
    if (config.id) return config.id;

    if (draftCreationRef.current) return draftCreationRef.current;

    const createDraft = async (): Promise<string> => {
      const draftPayload: any = {
        name: config.name || "Untitled GPT",
        description: config.description || "",
        instructions: config.instructions || "",
        conversationStarters: config.conversationStarters || [""],
        modelId: config.modelId || "openrouter:meta-llama/llama-3.3-70b-instruct",
        conversationModel: config.conversationModel || config.modelId || "openrouter:meta-llama/llama-3.3-70b-instruct",
        creativeModel: config.creativeModel || "openrouter:mistralai/mistral-7b-instruct",
        codingModel: config.codingModel || "openrouter:deepseek/deepseek-coder-33b-instruct",
        capabilities: config.capabilities || { webSearch: false, canvas: false, imageGeneration: false, codeInterpreter: true },
      };

      const gpt = await aiService.createAI(draftPayload);
      const newId = gpt.id;

      setConfig((prev) => ({
        ...prev,
        ...gpt,
        id: newId,
        avatar: gpt.avatar || prev.avatar,
      }));

      draftCreationRef.current = null;
      return newId;
    };

    draftCreationRef.current = createDraft();
    return draftCreationRef.current;
  };

  const uploadFilesToBackend = async (filesToUpload: GPTFile[], gptId: string) => {
    const validFiles = filesToUpload.filter(f => f._file && f._file.type !== "application/zip");
    if (validFiles.length === 0) return;

    const { service, isAIService } = getServiceForGPT(gptId);
    const BATCH_SIZE = 10;
    let uploaded = 0;
    setUploadProgress({ current: 0, total: validFiles.length });

    for (let i = 0; i < validFiles.length; i += BATCH_SIZE) {
      const batch = validFiles.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (file) => {
        const hasSubdir = file.filename && file.filename.includes('/');
        const zipPath = hasSubdir ? file.filename : undefined;
        if (isAIService) {
          await (service as AIService).uploadFile(gptId, file._file!, zipPath);
        } else {
          await (service as GPTService).uploadFile(gptId, file._file!, zipPath);
        }
        uploaded++;
        setUploadProgress({ current: uploaded, total: validFiles.length });
      }));
    }
    setUploadProgress(null);
  };

  const processUploadFiles = async (newFiles: GPTFile[]) => {
    setFiles((prev) => {
      const result = [...prev];
      for (const nf of newFiles) {
        const newName = getFileMatchKey(nf);
        const existingIdx = result.findIndex(f => getFileMatchKey(f) === newName);
        if (existingIdx >= 0) {
          result[existingIdx] = { ...nf, id: result[existingIdx].id };
        } else {
          result.push(nf);
        }
      }
      return result;
    });

    try {
      const gptId = await ensureGptId();
      await uploadFilesToBackend(newFiles, gptId);

      const { service, isAIService } = getServiceForGPT(gptId);
      let loadedFiles: GPTFile[] | any[];
      if (isAIService) {
        loadedFiles = await (service as AIService).getFiles(gptId);
      } else {
        loadedFiles = await (service as GPTService).getFiles(gptId);
      }
      const knowledgeOnly = (loadedFiles as GPTFile[]).filter(
        (f: any) => f.category === 'knowledge'
      );
      setFiles(knowledgeOnly);
    } catch (err: any) {
      console.error("[GPTCreator] Immediate upload failed:", err);
      setError(`File upload failed: ${err.message}`);
      setUploadProgress(null);
    }
  };

  const prepareFilesForUpload = async (selectedFiles: File[]): Promise<{ newFiles: GPTFile[]; rawFiles: File[] }> => {
    const MAX_ZIP_SIZE = 750 * 1024 * 1024;
    const newFiles: GPTFile[] = [];
    const rawFiles: File[] = [];

    for (const file of selectedFiles) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";

      if (ext === "zip") {
        continue;
      } else {
        const tempFile: GPTFile = {
          id: `temp-${crypto.randomUUID()}`,
          gptId: "temp",
          filename: file.name,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
          content: "",
          uploadedAt: new Date().toISOString(),
          isActive: true,
          _file: file,
        };
        newFiles.push(tempFile);
        rawFiles.push(file);
      }
    }

    return { newFiles, rawFiles };
  };

  const uploadZipServerSide = async (zipFile: File) => {
    try {
      const gptId = await ensureGptId();
      setUploadProgress({ current: 0, total: 1 });

      const { service, isAIService } = getServiceForGPT(gptId);
      const result = isAIService
        ? await (service as AIService).uploadZip(gptId, zipFile)
        : await (service as GPTService).uploadZip(gptId, zipFile);

      setUploadProgress(null);
      console.log(`[GPTCreator] ZIP upload complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.failed} failed`);

      if (result.errors && result.errors.length > 0) {
        console.warn('[GPTCreator] ZIP upload errors:', result.errors);
      }

      let loadedFiles: GPTFile[] | any[];
      if (isAIService) {
        loadedFiles = await (service as AIService).getFiles(gptId);
      } else {
        loadedFiles = await (service as GPTService).getFiles(gptId);
      }
      const knowledgeOnly = (loadedFiles as GPTFile[]).filter(
        (f: any) => f.category === 'knowledge'
      );
      setFiles(knowledgeOnly);

      return result;
    } catch (err: any) {
      setUploadProgress(null);
      throw err;
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const fileArray = Array.from(selectedFiles);
      const zipFiles = fileArray.filter(f => f.name.toLowerCase().endsWith('.zip'));
      const nonZipFiles = fileArray.filter(f => !f.name.toLowerCase().endsWith('.zip'));

      for (const zipFile of zipFiles) {
        if (zipFile.size > 1024 * 1024 * 1024) {
          setError(`${zipFile.name} exceeds 1GB limit`);
          continue;
        }
        try {
          await uploadZipServerSide(zipFile);
        } catch (err: any) {
          setError(`Failed to upload ${zipFile.name}: ${err.message}`);
        }
      }

      if (nonZipFiles.length > 0) {
        const { newFiles } = await prepareFilesForUpload(nonZipFiles);

        const existingNames = files.map(f => getFileMatchKey(f));
        const duplicates = newFiles
          .filter(f => existingNames.includes(getFileMatchKey(f)))
          .map(f => f.originalName || f.filename);

        if (duplicates.length > 0) {
          setDuplicateFileNames([...new Set(duplicates)]);
          setPendingZipEntries(newFiles.map(f => ({ name: f.originalName || f.filename, file: f })));
          setShowDuplicateModal(true);
        } else {
          await processUploadFiles(newFiles);
        }
      }

      setIsUploading(false);
    } catch (error: any) {
      setError(error.message || "Failed to prepare files");
      setIsUploading(false);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleBackfillPdfs = async () => {
    if (!editingId) return;
    setIsBackfillingPdfs(true);
    setBackfillResult(null);
    try {
      const response = await fetch(`/api/ais/${editingId}/backfill-pdfs`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        if (data.processed > 0) {
          setBackfillResult(`Extracted text from ${data.processed} PDF${data.processed !== 1 ? 's' : ''}${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
        } else {
          setBackfillResult(data.message || 'No PDFs need processing');
        }
      } else {
        setBackfillResult(`Error: ${data.error}`);
      }
    } catch (err: any) {
      setBackfillResult(`Failed: ${err.message}`);
    } finally {
      setIsBackfillingPdfs(false);
    }
  };

  const confirmDuplicateReplace = async () => {
    setIsReplacingFiles(true);
    try {
      const newFiles = pendingZipEntries.map(e => e.file);
      await processUploadFiles(newFiles);
    } catch (err: any) {
      console.error("[GPTCreator] Replace files failed:", err);
      setError(`Replace failed: ${err.message}`);
    } finally {
      setIsReplacingFiles(false);
      setShowDuplicateModal(false);
      setDuplicateFileNames([]);
      setPendingZipEntries([]);
    }
  };

  const cancelDuplicateUpload = () => {
    setShowDuplicateModal(false);
    setDuplicateFileNames([]);
    setPendingZipEntries([]);
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

    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit for text files
    const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10MB limit for PDFs
    const MAX_ZIP_SIZE = 750 * 1024 * 1024; // 750MB limit for zip files

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
            skippedFiles.push(`${file.name} (exceeds 750MB limit)`);
            continue;
          }
          try {
            const zip = await JSZip.loadAsync(file);
            const entries = Object.keys(zip.files);
            console.log(
              `📦 [Zip Upload] Extracting ${entries.length} entries from ${file.name}`,
            );
            for (const entryName of entries) {
              const zipEntry = zip.files[entryName];
              if (zipEntry.dir) continue;
              const entryExt = entryName.split(".").pop()?.toLowerCase() || "";
              if (!["md", "txt", "rtf"].includes(entryExt)) continue;
              try {
                const content = await zipEntry.async("text");
                if (content.length > MAX_FILE_SIZE) {
                  skippedFiles.push(`${entryName} (exceeds 50MB limit)`);
                  continue;
                }
                const parsed = parseZipPath(entryName);
                const entryFilename =
                  parsed.filename || entryName.split("/").pop() || entryName;
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
          skippedFiles.push(`${file.name} (exceeds 50MB limit)`);
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

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const MAX_FOLDER_SIZE = 1000 * 1024 * 1024;
    const MAX_TEXT_FILE_SIZE = 50 * 1024 * 1024;
    const MAX_PDF_SIZE = 10 * 1024 * 1024;
    const BATCH_SIZE = 20;
    const PDF_CONCURRENCY = 3;
    const TEXT_EXTENSIONS = ["md", "txt", "rtf", "json"];
    const ALL_EXTENSIONS = [...TEXT_EXTENSIONS, "pdf"];

    setIsUploadingTranscripts(true);
    setError(null);

    try {
      const allFiles = Array.from(selectedFiles);
      const validFiles = allFiles.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "";
        return ALL_EXTENSIONS.includes(ext) && !f.name.startsWith(".");
      });

      if (validFiles.length === 0) {
        setError("No supported files found in folder (.md, .txt, .rtf, .pdf, .json)");
        setIsUploadingTranscripts(false);
        return;
      }

      const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > MAX_FOLDER_SIZE) {
        setError(`Folder contents exceed 1000MB limit (${(totalSize / (1024 * 1024)).toFixed(1)}MB)`);
        setIsUploadingTranscripts(false);
        return;
      }

      const constructId = config.constructCallsign || initialConfig?.constructCallsign;
      if (!constructId) {
        setError("No construct selected. Please configure your GPT first.");
        setIsUploadingTranscripts(false);
        return;
      }

      setFolderUploadProgress({ current: 0, total: validFiles.length, phase: "Processing files..." });

      const textFiles = validFiles.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() || "";
        return TEXT_EXTENSIONS.includes(ext);
      });
      const pdfFiles = validFiles.filter((f) =>
        f.name.toLowerCase().endsWith(".pdf")
      );

      let totalProcessed = 0;
      let savedTotal = 0;
      let failedTotal = 0;
      const skippedFiles: string[] = [];
      const savedTranscriptIds: Array<{ id: string; name: string; content: string; type: string; source?: string }> = [];

      const saveBatch = async (batch: Array<any>) => {
        try {
          const saveResponse = await fetch("/api/transcripts/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              constructCallsign: constructId,
              transcripts: batch,
            }),
          });
          if (saveResponse.ok) {
            const saveResult = await saveResponse.json();
            savedTotal += saveResult.saved || batch.length;
            if (saveResult.failed) failedTotal += saveResult.failed.length;
            savedTranscriptIds.push(...batch.filter((_: any, i: number) =>
              !saveResult.failed?.some((f: any) => f.name === batch[i].name)
            ));
          } else {
            failedTotal += batch.length;
          }
        } catch {
          failedTotal += batch.length;
        }
      };

      let currentBatch: Array<any> = [];

      for (const file of textFiles) {
        if (file.size > MAX_TEXT_FILE_SIZE) {
          skippedFiles.push(`${file.name} (exceeds 50MB)`);
          totalProcessed++;
          continue;
        }
        try {
          const content = await file.text();
          const relativePath = (file as any).webkitRelativePath || file.name;
          const parsed = parseZipPath(relativePath);
          const ext = file.name.split(".").pop()?.toLowerCase() || "txt";

          currentBatch.push({
            id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: parsed.filename || file.name,
            content,
            type: ext,
            source: parsed.source || transcriptSource || "transcripts",
            year: parsed.year || transcriptYear || undefined,
            month: parsed.month || transcriptMonth || undefined,
            path: relativePath,
          });

          if (currentBatch.length >= BATCH_SIZE) {
            setFolderUploadProgress({ current: totalProcessed, total: validFiles.length, phase: "Saving batch..." });
            await saveBatch(currentBatch);
            currentBatch = [];
          }
        } catch {
          skippedFiles.push(`${file.name} (read failed)`);
        }
        totalProcessed++;
        if (totalProcessed % 10 === 0) {
          setFolderUploadProgress({ current: totalProcessed, total: validFiles.length, phase: "Reading files..." });
        }
      }

      if (currentBatch.length > 0) {
        setFolderUploadProgress({ current: totalProcessed, total: validFiles.length, phase: "Saving batch..." });
        await saveBatch(currentBatch);
        currentBatch = [];
      }

      for (let pi = 0; pi < pdfFiles.length; pi += PDF_CONCURRENCY) {
        const pdfBatch = pdfFiles.slice(pi, pi + PDF_CONCURRENCY);
        const pdfResults = await Promise.allSettled(
          pdfBatch.map(async (file) => {
            if (file.size > MAX_PDF_SIZE) {
              skippedFiles.push(`${file.name} (exceeds 10MB)`);
              return null;
            }
            const relativePath = (file as any).webkitRelativePath || file.name;
            const parsed = parseZipPath(relativePath);

            try {
              const formData = new FormData();
              formData.append("file", file);
              formData.append("constructCallsign", constructId);
              const response = await fetch("/api/transcripts/extract-pdf", {
                method: "POST",
                body: formData,
                signal: AbortSignal.timeout(30000),
              });

              let pdfContent: string;
              if (response.ok) {
                const result = await response.json();
                pdfContent = result.content;
              } else {
                pdfContent = `[PDF content from ${file.name} - extraction pending]`;
              }

              return {
                id: `transcript_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                name: parsed.filename || file.name,
                content: pdfContent,
                type: "pdf",
                source: parsed.source || transcriptSource || "transcripts",
                year: parsed.year || transcriptYear || undefined,
                month: parsed.month || transcriptMonth || undefined,
                path: relativePath,
              };
            } catch {
              skippedFiles.push(`${file.name} (PDF extraction timeout/failed)`);
              return null;
            }
          })
        );

        const pdfTranscripts = pdfResults
          .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value !== null)
          .map((r) => r.value);

        if (pdfTranscripts.length > 0) {
          await saveBatch(pdfTranscripts);
        }

        totalProcessed += pdfBatch.length;
        setFolderUploadProgress({ current: totalProcessed, total: validFiles.length, phase: "Extracting PDFs..." });
      }

      setTranscripts((prev) => [...prev, ...savedTranscriptIds]);

      try {
        const transcriptsResponse = await fetch(`/api/transcripts/${constructId}/list`);
        if (transcriptsResponse.ok) {
          const data = await transcriptsResponse.json();
          if (data.transcripts) {
            setAllTranscripts(data.transcripts);
          }
        }
      } catch (refreshErr) {
        console.warn("[GPTCreator] Failed to refresh transcript list after folder upload:", refreshErr);
      }

      console.log(`[GPTCreator] Folder upload complete: ${savedTotal} saved, ${failedTotal} failed, ${skippedFiles.length} skipped`);

      setFolderUploadProgress(null);

      const messages: string[] = [];
      if (savedTotal > 0) messages.push(`Uploaded ${savedTotal} transcripts`);
      if (failedTotal > 0) messages.push(`${failedTotal} failed`);
      if (skippedFiles.length > 0) messages.push(`Skipped: ${skippedFiles.slice(0, 5).join(", ")}${skippedFiles.length > 5 ? ` +${skippedFiles.length - 5} more` : ""}`);
      if (failedTotal > 0 || skippedFiles.length > 0) {
        setError(messages.join(". "));
      }
    } catch (error: any) {
      console.error("Folder upload error:", error);
      setError(error.message || "Failed to upload folder");
      setFolderUploadProgress(null);
    } finally {
      setIsUploadingTranscripts(false);
      if (folderInputRef.current) {
        folderInputRef.current.value = "";
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

  const handleCreateSubmit = async (e?: React.FormEvent, directMessage?: string) => {
    if (e) e.preventDefault();

    const userMessage = directMessage || createInput.trim();
    if (!userMessage || isCreateGenerating) return;

    if (!directMessage) setCreateInput("");
    setIsCreateGenerating(true);

    extractConfigFromConversation([
      ...createMessages,
      { role: "user", content: userMessage },
    ]);

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

      // Save to Lin's canonical conversation file in Supabase vault_files
      // Same pattern as Zen's conversation persistence
      const LIN_CANONICAL_SESSION_ID = "lin-001_chat_with_lin-001";
      const linMetadata = {
        constructId: "lin-001",
        constructName: "Lin",
        constructCallsign: "lin-001",
      };
      
      try {
        const saveResponse = await fetch(`/api/vvault/conversations/${LIN_CANONICAL_SESSION_ID}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            role: "user",
            content: userMessage,
            timestamp: new Date(userTimestamp).toISOString(),
            title: "Chat with Lin",
            constructId: "lin-001",
            constructName: "Lin",
            constructCallsign: "lin-001",
            metadata: linMetadata,
          }),
        });
        
        if (saveResponse.ok) {
          // Save assistant response too
          await fetch(`/api/vvault/conversations/${LIN_CANONICAL_SESSION_ID}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              role: "assistant",
              content: assistantResponse,
              timestamp: new Date().toISOString(),
              title: "Chat with Lin",
              constructId: "lin-001",
              constructName: "Lin",
              constructCallsign: "lin-001",
              metadata: linMetadata,
            }),
          });
          console.log("✅ [Lin] Saved message pair to canonical vault_files");
        } else {
          console.warn("⚠️ [Lin] Failed to save to vault_files:", saveResponse.statusText);
        }
      } catch (saveError) {
        console.error("❌ [Lin] Error saving to vault_files:", saveError);
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

  useEffect(() => {
    if (
      isVisible &&
      initialCreateMessage &&
      !initialConfig &&
      activeTab === "create" &&
      !isCreateGenerating &&
      createMessages.length === 0 &&
      initialCreateMessageSentRef.current !== initialCreateMessage
    ) {
      initialCreateMessageSentRef.current = initialCreateMessage;
      handleCreateSubmit(undefined, initialCreateMessage);
    }
  }, [isVisible, initialCreateMessage, initialConfig, activeTab, isCreateGenerating, createMessages.length]);

  useEffect(() => {
    if (!isVisible) {
      initialCreateMessageSentRef.current = null;
    }
  }, [isVisible]);

  const handlePreviewFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const imageFiles = selectedFiles.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      setPreviewImageFiles(prev => [...prev, ...imageFiles].slice(0, 5));
    }
    if (previewFileInputRef.current) {
      previewFileInputRef.current.value = "";
    }
  };

  const removePreviewImage = (index: number) => {
    setPreviewImageFiles(prev => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(URL.createObjectURL(removed));
      return prev.filter((_, i) => i !== index);
    });
  };

  const convertFilesToBase64 = async (files: File[]): Promise<Array<{ name: string; type: string; data: string }>> => {
    return Promise.all(files.map(file => new Promise<{ name: string; type: string; data: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve({ name: file.name, type: file.type, data: base64 });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    })));
  };

  const handlePreviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!previewInput.trim() && previewImageFiles.length === 0) || isPreviewGenerating) return;

    const userMessage = previewInput.trim();
    setPreviewInput("");
    const currentImages = [...previewImageFiles];
    setPreviewImageFiles([]);
    setIsPreviewGenerating(true);

    try {
      const imageAttachments = currentImages.length > 0 ? await convertFilesToBase64(currentImages) : [];
      // Add user message to preview conversation (with timestamp for saving)
      setPreviewMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage || "", timestamp: Date.now(), attachments: imageAttachments.length > 0 ? imageAttachments : undefined },
      ]);

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

      // Safety check: Truncate prompt if it exceeds reasonable limit (12000 chars for constructs with rich identity)
      const MAX_PREVIEW_PROMPT_CHARS = 12000;
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

      const selectedModel =
        (config.conversationModel && config.conversationModel.trim()) ||
        (config.modelId && config.modelId.trim()) ||
        "openrouter:meta-llama/llama-3.3-70b-instruct";
      setLastPreviewModel(selectedModel);

      const constructIdForMemory =
        config.constructCallsign || initialConfig?.constructCallsign;

      let aiResponseText: string;

      if (imageAttachments.length > 0) {
        const constructId = config.constructCallsign || initialConfig?.constructCallsign || 'preview';
        const vvaultResponse = await fetch('/api/vvault/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            constructId,
            message: userMessage || 'What do you see in this image?',
            attachments: imageAttachments,
            systemPromptOverride: systemPrompt,
          }),
        });
        if (!vvaultResponse.ok) {
          const errData = await vvaultResponse.json().catch(() => ({}));
          throw new Error(errData.error || `Vision API error: ${vvaultResponse.status}`);
        }
        const data = await vvaultResponse.json();
        aiResponseText = data.response || data.aiResponse || "No response received.";
      } else {
        aiResponseText = (await runSeat({
          seat: "smalltalk",
          prompt: fullPrompt,
          modelOverride: selectedModel,
          constructId: constructIdForMemory,
        })).trim();
      }

      // Add AI response to preview conversation (with timestamp for saving)
      setPreviewMessages((prev) => [
        ...prev,
        { role: "assistant", content: aiResponseText, timestamp: Date.now() },
      ]);

      // Try to extract GPT configuration from the conversation
      extractConfigFromConversation([
        ...previewMessages,
        { role: "user", content: userMessage },
        { role: "assistant", content: aiResponseText },
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
          timestamp: Date.now(),
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

MANDATORY OUTPUT FORMAT FOR GPT DETAILS:
When the user provides GPT details (name, description, instructions) or when you have enough information to populate the configure tab, you MUST include a structured block at the END of your response using EXACTLY this format:

- Name: [the GPT name]
- Description: [the GPT description]
- Instructions: [the GPT instructions/system prompt]

This structured block is automatically parsed to fill the Configure tab. You MUST include it whenever the user provides ANY of these fields. Echo back exactly what the user provided. Do not omit any field the user gave you. If the user only provided some fields, include only those.

For example, if the user says "make a GPT called Sera, description: Your distant wife":
"Great choice! I'll set up Sera for you right away.

- Name: Sera
- Description: Your distant wife"

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
    const allText = messages.map((m) => m.content).join("\n");
    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    const assistantMessages = messages
      .filter((m) => m.role === "assistant")
      .map((m) => m.content)
      .join("\n");

    const cleanValue = (val: string): string => {
      return val
        .replace(/^\*+|\*+$/g, '')
        .replace(/^#+\s*/, '')
        .replace(/^[-·•]\s*/, '')
        .replace(/^["']+|["']+$/g, '')
        .replace(/\[OPEN_GPT_CREATOR\]/gi, '')
        .trim();
    };

    const updates: Partial<GPTConfig> = {};

    const namePatterns = [
      /[-•*]\s*\**Name\**\s*[:=-]\s*["']?([^"'\n,]+)["']?/i,
      /\bName\b\s*[:=-]\s*["']?([^\n"',]{1,50})["']?/i,
      /(?:GPT\s+(?:is\s+)?(?:called|named))\s+["']?([^\s"',]{1,50})["']?/i,
      /(?:the\s+(?:new\s+)?(?:name|GPT)\s+(?:is|of)\s+)["']?([^\s"'\n,]{1,50})["']?/i,
      /(?:call(?:ed)?|named?)\s+(?:it|her|him|them)\s+["']?([^\s"',]{1,50})["']?/i,
    ];

    if (!config.name) {
      for (const pattern of namePatterns) {
        const match = allText.match(pattern);
        if (match) {
          const suggestedName = cleanValue(match[1]);
          if (suggestedName.length > 0 && suggestedName.length < 50 && !/^(the|a|an|is|not|set)$/i.test(suggestedName)) {
            updates.name = suggestedName;
            break;
          }
        }
      }
    }

    const descPatterns = [
      /[-•*]\s*\**Description\**\s*[:=-]\s*["']?([^"'\n]+)["']?/i,
      /\bDescription\b\s*[:=-]\s*["']?([^\n"']{1,500})["']?/i,
    ];

    if (!config.description) {
      for (const pattern of descPatterns) {
        const match = allText.match(pattern);
        if (match) {
          const suggestedDesc = cleanValue(match[1]);
          if (suggestedDesc.length > 0 && suggestedDesc.length < 500) {
            updates.description = suggestedDesc;
            break;
          }
        }
      }
    }

    const instrPatterns = [
      /[-•*]\s*\**Instructions?\**\s*[:=-]\s*["']?([\s\S]+?)(?=\n\s*[-•*]\s*\**(?:Name|Description|Capabilities|Model|Conversation\s*Starters)\**\s*[:=-]|\n\n\n|$)/i,
      /\bInstructions?\b\s*[:=-]\s*["']?([\s\S]+?)(?=\n\s*[-•*]\s*\**(?:Name|Description|Capabilities|Model|Conversation\s*Starters)\**\s*[:=-]|\n\n\n|$)/i,
    ];

    if (!config.instructions) {
      for (const pattern of instrPatterns) {
        const match = allText.match(pattern);
        if (match) {
          const suggestedInstructions = cleanValue(match[1]);
          if (suggestedInstructions.length > 0 && suggestedInstructions.length < 5000) {
            updates.instructions = suggestedInstructions;
            break;
          }
        }
      }
    }

    if (updates.name) {
      const cleaned = updates.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 0) {
        updates.constructCallsign = cleaned + '-001';
      }
    }

    if (Object.keys(updates).length > 0) {
      console.log("📋 [GPTCreator] Extracted config from conversation:", updates);
      setConfig((prev) => ({ ...prev, ...updates }));
    }

    const modelPatterns = [
      /conversation\s+model[:\s]+([^\s\n]+)/i,
      /creative\s+model[:\s]+([^\s\n]+)/i,
      /coding\s+model[:\s]+([^\s\n]+)/i,
      /use\s+([^\s\n]+)\s+for\s+conversation/i,
      /use\s+([^\s\n]+)\s+for\s+creative/i,
      /use\s+([^\s\n]+)\s+for\s+coding/i,
    ];

    for (const pattern of modelPatterns) {
      const match = assistantMessages.match(pattern);
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

    const fullConversation = allText.toLowerCase();

    if (
      fullConversation.includes("code") &&
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
      fullConversation.includes("web search") &&
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
      fullConversation.includes("image") &&
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
      {/* NOTE: Backdrop click now triggers confirmation if preview messages exist */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        style={{
          zIndex: Z_LAYERS.critical,
          pointerEvents: "auto",
        }}
        onClick={handleCloseWithConfirmation}
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
          accept=".txt,.md,.pdf,.json,.csv,.doc,.docx,.mp4,.avi,.mov,.mkv,.webm,.flv,.wmv,.m4v,.3gp,.ogv,.png,.jpg,.jpeg,.gif,.bmp,.tiff,.svg,.zip"
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
                onClick={handleCloseWithConfirmation}
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
              {(saveState === "saving" || isLoading) && (
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm"
                    style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                  >
                    {uploadProgress
                      ? `Uploading ${uploadProgress.current} of ${uploadProgress.total} files...`
                      : "Saving..."}
                  </span>
                  {uploadProgress && (
                    <div className="w-32 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--chatty-border)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`,
                          backgroundColor: "var(--chatty-accent)",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
              {saveState === "error" && (
                <span
                  className="text-sm"
                  style={{ color: "var(--chatty-status-error)" }}
                >
                  Error
                </span>
              )}
              {config.id && (
                <button
                  onClick={handleRestoreFromSupabase}
                  disabled={isRestoring}
                  className="px-3 py-2 text-xs rounded-lg flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: "transparent",
                    color: "var(--chatty-text)",
                    opacity: 0.7,
                  }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.opacity = "1";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = e.currentTarget.disabled
                      ? "0.5"
                      : "0.7";
                  }}
                  title="Restore identity fields from Supabase backup"
                >
                  <RotateCcw size={12} />
                  {isRestoring ? "Restoring..." : "Restore"}
                </button>
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
                      activeTab === "forge" ? "#f97316" : "var(--chatty-text)",
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
                  Forge
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
                          <>
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
                                const target = e.currentTarget as HTMLImageElement;
                                target.style.display = "none";
                                const fallback = target.nextElementSibling;
                                if (fallback) (fallback as HTMLElement).style.display = "flex";
                              }}
                            />
                            <div className="w-full h-full flex items-center justify-center" style={{ display: "none" }}>
                              <ImageOff size={20} style={{ color: "#ef4444" }} />
                            </div>
                          </>
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

                    {/* Conditioning */}
                    <div>
                      <label
                        className="block text-sm font-medium mb-2"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        Conditioning
                      </label>
                      <p
                        className="text-xs mb-2"
                        style={{ color: "var(--chatty-text)", opacity: 0.5 }}
                      >
                        Refines tone, personality, and interaction style
                      </p>
                      <textarea
                        value={config.conditioning || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            conditioning: e.target.value,
                          }))
                        }
                        placeholder="Conditioning guidelines for this construct..."
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
                              "openrouter:meta-llama/llama-3.3-70b-instruct"
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
                            {config.conversationModel && !ALL_MODELS.some(m => m.value === config.conversationModel) && (
                              <optgroup label="📌 Current Model">
                                <option value={config.conversationModel}>
                                  {config.conversationModel.replace(/^(openrouter|openai|ollama):/, '')}
                                </option>
                              </optgroup>
                            )}
                            <optgroup label="🔷 OpenAI (Managed)">
                              {OPENAI_MODELS.map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
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
                            OpenAI = managed (billed to credits) | OpenRouter =
                            cloud API | Ollama = self-hosted
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
                            <optgroup label="🔷 OpenAI (Managed)">
                              {OPENAI_MODELS.filter(
                                (m) =>
                                  m.category === "creative" ||
                                  m.category === "general",
                              ).map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
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
                            <optgroup label="🔷 OpenAI (Managed)">
                              {OPENAI_MODELS.filter(
                                (m) => m.category === "coding" || m.category === "general",
                              ).map((m) => (
                                <option key={m.value} value={m.value}>
                                  {m.label}
                                </option>
                              ))}
                            </optgroup>
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
                                backgroundColor: "#3a3520",
                                color: "#f5f0e8",
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

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                          className="px-4 py-2 border var(--chatty-line) rounded-lg hover:bg-app-button-400 flex items-center gap-2 text-app-text-900 disabled:opacity-50"
                        >
                          <Upload size={16} />
                          {isUploading ? "Uploading..." : "Upload Files"}
                        </button>
                        {files.some(f => f.originalName?.toLowerCase().endsWith('.pdf') || f.filename?.toLowerCase().endsWith('.pdf')) && (
                          <button
                            onClick={handleBackfillPdfs}
                            disabled={isBackfillingPdfs}
                            className="px-4 py-2 border var(--chatty-line) rounded-lg hover:bg-app-button-400 flex items-center gap-2 text-app-text-900 disabled:opacity-50 text-sm"
                          >
                            <FileText size={16} />
                            {isBackfillingPdfs ? "Processing..." : "Extract PDF Text"}
                          </button>
                        )}
                      </div>
                      {backfillResult && (
                        <p className="text-xs mt-1" style={{ color: backfillResult.startsWith('Error') || backfillResult.startsWith('Failed') ? 'var(--chatty-status-error)' : 'var(--chatty-status-success)' }}>
                          {backfillResult}
                        </p>
                      )}

                      {/* Knowledge File Tree */}
                      <div
                        className="mt-3 rounded-lg p-2"
                        style={{ backgroundColor: "var(--chatty-bg-message)" }}
                      >
                        <KnowledgeFileTree
                          files={files}
                          onRemoveFile={handleRemoveFile}
                          formatFileSize={gptService.formatFileSize}
                        />
                      </div>
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
                        Upload conversation transcripts or a zip file to give
                        your GPT access to past interactions. Zip files preserve
                        directory structure.
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

                        {(transcriptSource ||
                          transcriptYear ||
                          transcriptMonth) && (
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
                      {(transcriptSource ||
                        transcriptYear ||
                        transcriptMonth) && (
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
                      <input
                        type="file"
                        ref={folderInputRef}
                        onChange={handleFolderUpload}
                        className="hidden"
                        {...({ webkitdirectory: "", directory: "", mozdirectory: "" } as any)}
                      />

                      {/* Upload buttons - individual files or zip */}
                      <div className="flex flex-wrap items-center gap-3">
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
                          {isUploadingTranscripts && !folderUploadProgress
                            ? "Uploading..."
                            : "Upload Files"}
                        </button>

                        <button
                          onClick={() => folderInputRef.current?.click()}
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
                          title="Upload an entire folder (up to 1000MB). Preserves directory structure."
                        >
                          <FolderOpen size={16} />
                          {folderUploadProgress
                            ? folderUploadProgress.phase
                            : "Upload Folder"}
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

                      {folderUploadProgress && (
                        <div className="mt-3 p-3 rounded-lg" style={{ backgroundColor: "var(--chatty-bg-message)" }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium" style={{ color: "var(--chatty-text)" }}>
                              {folderUploadProgress.phase}
                            </span>
                            <span className="text-xs" style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                              {folderUploadProgress.phase === "Compressing..."
                                ? `${folderUploadProgress.current}%`
                                : `${folderUploadProgress.current} / ${folderUploadProgress.total}`}
                            </span>
                          </div>
                          <div className="w-full rounded-full h-1.5" style={{ backgroundColor: "var(--chatty-border)" }}>
                            <div
                              className="h-1.5 rounded-full transition-all duration-300"
                              style={{
                                backgroundColor: "var(--chatty-accent)",
                                width: `${folderUploadProgress.total > 0 ? (folderUploadProgress.current / folderUploadProgress.total) * 100 : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}

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
                                  const constructId =
                                    config.constructCallsign ||
                                    initialConfig?.constructCallsign;
                                  if (!constructId) return;

                                  setIsAutoOrganizing(true);
                                  try {
                                    const response = await fetch(
                                      `/api/transcripts/auto-organize/${encodeURIComponent(constructId)}`,
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        credentials: "include",
                                        body: JSON.stringify({
                                          defaultYear: "2025",
                                        }),
                                      },
                                    );

                                    if (response.ok) {
                                      const data = await response.json();
                                      console.log(
                                        `🗂️ [ContinuityGPT] Auto-organize result:`,
                                        data,
                                      );

                                      // Refresh transcript list
                                      const listResponse = await fetch(
                                        `/api/transcripts/list/${encodeURIComponent(constructId)}`,
                                        { credentials: "include" },
                                      );
                                      if (listResponse.ok) {
                                        const listData =
                                          await listResponse.json();
                                        if (listData.success) {
                                          if (listData.bySource)
                                            setExistingTranscripts(
                                              listData.bySource,
                                            );
                                          if (listData.transcripts)
                                            setAllTranscripts(
                                              listData.transcripts,
                                            );
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
                                {isAutoOrganizing
                                  ? "Organizing..."
                                  : "Auto-Organize"}
                              </button>
                            </div>
                            <div
                              className="rounded-lg p-2 max-h-64 overflow-y-auto"
                              style={{
                                backgroundColor: "var(--chatty-bg-message)",
                              }}
                            >
                              <TranscriptFolderTree
                                transcripts={allTranscripts}
                                onFileClick={(file) => {
                                  console.log(
                                    "📄 [Transcripts] File clicked:",
                                    file.name,
                                  );
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

                    {/* Memory Toggle */}
                    <div className="space-y-4 mt-6">
                      <div
                        className="p-4 rounded-lg"
                        style={{
                          backgroundColor: "var(--chatty-bg-message)",
                        }}
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={config.hasPersistentMemory !== false}
                              onChange={(e) => {
                                setConfig((prev: any) => ({
                                  ...prev,
                                  hasPersistentMemory: e.target.checked,
                                }));
                              }}
                              className="sr-only"
                            />
                            <div
                              className={`w-10 h-6 rounded-full transition-colors ${config.hasPersistentMemory !== false ? 'bg-green-500' : 'bg-gray-500'}`}
                            />
                            <div
                              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${config.hasPersistentMemory !== false ? 'translate-x-4' : 'translate-x-0'}`}
                            />
                          </div>
                          <div>
                            <span
                              className="text-sm font-medium"
                              style={{ color: "var(--chatty-text)" }}
                            >
                              Memory
                            </span>
                            <p
                              className="text-xs mt-0.5"
                              style={{
                                color: "var(--chatty-text)",
                                opacity: 0.7,
                              }}
                            >
                              {config.hasPersistentMemory !== false
                                ? "Full continuity active — transcript search, verified memories, identity, and state persistence"
                                : "Memory disabled — construct will not recall past conversations"}
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Forge Tab - Personality Extraction from Transcripts
                  <div className="flex-1 overflow-y-auto p-6">
                    <PersonalityForge
                      constructCallsign={
                        config.constructCallsign ||
                        config.name?.toLowerCase().replace(/\s+/g, "-") +
                          "-001" ||
                        "unknown"
                      }
                      constructName={config.name || "Construct"}
                      onIdentityForged={(result) => {
                        console.log("[GPTCreator] Identity forged:", result);
                        if (result.identityFiles?.["prompt.txt"]) {
                          setConfig((prev) => ({
                            ...prev,
                            instructions:
                              result.identityFiles?.["prompt.txt"] ||
                              prev.instructions,
                          }));
                        }
                      }}
                    />

                    {/* Physical Features */}
                    <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--chatty-line)" }}>
                      <h3
                        className="text-sm font-semibold mb-2"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        Physical Features
                      </h3>
                      <p
                        className="text-xs mb-3"
                        style={{ color: "var(--chatty-text)", opacity: 0.5 }}
                      >
                        Visual characteristics for avatar generation and identity consistency
                      </p>
                      <textarea
                        value={config.physicalFeatures || ""}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            physicalFeatures: e.target.value,
                          }))
                        }
                        placeholder="Physical features for this construct..."
                        rows={8}
                        className="w-full p-3 rounded-lg focus:outline-none resize-none chatty-placeholder"
                        style={{
                          border: "none",
                          backgroundColor: "var(--chatty-bg-message)",
                          color: "var(--chatty-text)",
                          caretColor: "var(--chatty-text)",
                        }}
                      />
                    </div>
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
                                const target = e.currentTarget as HTMLImageElement;
                                target.style.display = "none";
                                const fallback = target.nextElementSibling;
                                if (fallback) (fallback as HTMLElement).style.display = "flex";
                              }}
                            />
                            <div
                              className="absolute inset-0 flex items-center justify-center"
                              style={{ display: "none" }}
                            >
                              <ImageOff size={20} style={{ color: "#ef4444" }} />
                            </div>
                          </>
                        ) : (
                          <ImageOff size={20} style={{ color: "#ef4444" }} />
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
                                {message.attachments && message.attachments.length > 0 && (
                                  <div className="flex gap-2 mt-2 flex-wrap">
                                    {message.attachments.map((att: any, idx: number) => (
                                      <img
                                        key={idx}
                                        src={`data:${att.type};base64,${att.data}`}
                                        alt={att.name}
                                        className="w-20 h-20 rounded-lg object-cover"
                                      />
                                    ))}
                                  </div>
                                )}
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
                  <input
                    ref={previewFileInputRef}
                    type="file"
                    multiple
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    onChange={handlePreviewFileChange}
                    className="hidden"
                  />
                  <form onSubmit={handlePreviewSubmit} className="space-y-2">
                    {previewImageFiles.length > 0 && (
                      <div className="flex gap-2 px-3 pt-2 flex-wrap">
                        {previewImageFiles.map((file, idx) => (
                          <div key={idx} className="relative group">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="w-12 h-12 rounded-lg object-cover border border-white/10"
                            />
                            <button
                              type="button"
                              onClick={() => removePreviewImage(idx)}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
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
                          previewFileInputRef.current?.click();
                        }}
                        className="p-1 hover:bg-app-button-600 rounded text-app-text-800 hover:text-app-text-900"
                        title="Upload images"
                      >
                        <Paperclip size={16} />
                      </button>
                      <button
                        type="submit"
                        disabled={(!previewInput.trim() && previewImageFiles.length === 0) || isPreviewGenerating}
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
                      {lastPreviewModel && (
                        <div
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs mt-1"
                          style={{
                            backgroundColor: "var(--chatty-button)",
                            color: "var(--chatty-text)",
                            opacity: 0.9,
                          }}
                        >
                          <Bot size={10} />
                          {(() => {
                            const [provider, ...modelParts] = lastPreviewModel.split(':');
                            const modelName = modelParts.join(':');
                            const shortModel = modelName.includes('/') ? modelName.split('/').pop() : modelName;
                            return `${shortModel || modelName} via ${provider === 'openai' ? 'OpenAI' : provider === 'openrouter' ? 'OpenRouter' : provider === 'ollama' ? 'Ollama' : provider}`;
                          })()}
                        </div>
                      )}
                      {!lastPreviewModel && (config.conversationModel ||
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

      {showDuplicateModal && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: Z_LAYERS.critical + 10 }}
        >
          <div className="absolute inset-0 bg-black bg-opacity-60" />
          <div
            className="relative rounded-lg p-6 max-w-md mx-4 shadow-xl"
            style={{
              backgroundColor: "var(--chatty-bg-main)",
              border: "1px solid var(--chatty-border)",
            }}
          >
            <h3
              className="text-lg font-semibold mb-3"
              style={{ color: "var(--chatty-text)" }}
            >
              Replace Existing Files?
            </h3>
            <p
              className="text-sm mb-3"
              style={{ color: "var(--chatty-text)", opacity: 0.8 }}
            >
              The following {duplicateFileNames.length} file{duplicateFileNames.length !== 1 ? 's' : ''} already exist{duplicateFileNames.length === 1 ? 's' : ''} and will be replaced:
            </p>
            <div
              className="mb-4 max-h-48 overflow-y-auto rounded p-3 text-sm"
              style={{
                backgroundColor: "var(--chatty-bg-darker, rgba(0,0,0,0.15))",
                border: "1px solid var(--chatty-border)",
                color: "var(--chatty-text)",
              }}
            >
              {duplicateFileNames.map((name, i) => (
                <div key={i} className="py-1 flex items-center gap-2">
                  <span style={{ color: "#e5a740" }}>&#8635;</span>
                  <span className="truncate">{name}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelDuplicateUpload}
                disabled={isReplacingFiles}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--chatty-text)",
                  border: "1px solid var(--chatty-border)",
                  opacity: isReplacingFiles ? 0.5 : 1,
                  cursor: isReplacingFiles ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDuplicateReplace}
                disabled={isReplacingFiles}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "#ADA587",
                  color: "#000110",
                  opacity: isReplacingFiles ? 0.7 : 1,
                  cursor: isReplacingFiles ? "not-allowed" : "pointer",
                }}
              >
                {isReplacingFiles
                  ? `Replacing... ${uploadProgress ? `(${uploadProgress.current}/${uploadProgress.total})` : ''}`
                  : `Replace ${duplicateFileNames.length} File${duplicateFileNames.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal - Save/Discard Preview Conversation */}
      {/* NOTE: Backdrop does NOT close this modal - requires explicit button choice */}
      {showExitConfirmation && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: Z_LAYERS.critical + 10 }}
        >
          <div 
            className="absolute inset-0 bg-black bg-opacity-60"
          />
          <div
            className="relative rounded-lg p-6 max-w-md mx-4 shadow-xl"
            style={{
              backgroundColor: "var(--chatty-bg-main)",
              border: "1px solid var(--chatty-border)",
            }}
          >
            <h3 
              className="text-lg font-semibold mb-3"
              style={{ color: "var(--chatty-text)" }}
            >
              Save Preview Conversation?
            </h3>
            <p 
              className="text-sm mb-5"
              style={{ color: "var(--chatty-text)", opacity: 0.8 }}
            >
              You have {previewMessages.length} message{previewMessages.length !== 1 ? 's' : ''} in the preview. 
              Would you like to save this conversation to {config.name || 'this construct'}'s transcript history?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={discardPreviewAndClose}
                disabled={isSavingPreview}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--chatty-text)",
                  border: "1px solid var(--chatty-border)",
                  opacity: isSavingPreview ? 0.5 : 1,
                }}
              >
                Discard
              </button>
              <button
                onClick={savePreviewConversation}
                disabled={isSavingPreview}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                style={{
                  backgroundColor: "#ADA587",
                  color: "#000110",
                  opacity: isSavingPreview ? 0.7 : 1,
                }}
              >
                {isSavingPreview ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save & Exit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
};

export default GPTCreator;
