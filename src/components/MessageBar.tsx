import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus, Paperclip, X, Loader2, Check, FlaskConical } from "lucide-react";
import ImageAttachmentPreview from "./ImageAttachmentPreview";
import SendButton from "./SendButton";
import styles from "./MessageBar.module.css";
import LiveMicLevel from "./LiveMicLevel";
import VoiceOrb, { type VoiceOrbState } from "./VoiceOrb";
import MicrophoneIcon from "./icons/MicrophoneIcon";
import RippleIcon from "./icons/RippleIcon";
import { useTtsPlayback } from "../context/TtsPlaybackContext";
import { 
  CHAT_UPLOAD_LIMITS, 
  ALL_ALLOWED_TYPES,
  isImageFile, 
  getFileSizeLimit 
} from "../config/chatConfig";
import { Z_LAYERS } from "../lib/zLayers";
import { useVoiceController } from "../voice/useVoiceController";

const isDevEnv = () => {
  if (typeof process !== "undefined" && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== "production";
  }
  if (typeof window !== "undefined") {
    const hostname = window.location?.hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  }
  return false;
};

export type MessageBarSubmitOptions = {
  fromVoice?: boolean;
  durationMs?: number;
  diagnostic?: boolean;
  diagnosticArmed?: boolean;
};

export interface ImageAttachment {
  name: string;
  type: string;
  data: string; // base64
  file?: File; // Preview file used by GUI rendering
}

interface MessageBarProps {
  onSubmit: (text: string, files?: File[], imageAttachments?: ImageAttachment[], options?: MessageBarSubmitOptions) => void;
  placeholder?: string;
  showVoiceButton?: boolean;
  showFileAttachment?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  initialValue?: string;
  onValueChange?: (value: string) => void;
  maxRows?: number;
  isSending?: boolean;
  canRetry?: boolean;
  onRetry?: () => void;
  allowEmptySubmit?: boolean;
  showDiagnosticSend?: boolean;
  showOrchestrationButton?: boolean;
  onOrchestrationClick?: () => void;
  orchestrationLogVisible?: boolean;
  diagnosticSendArmed?: boolean;
}

interface SendAvailabilityParams {
  disabled: boolean;
  isSending: boolean;
  canRetry: boolean;
  allowEmptySubmit: boolean;
  inputValue: string;
  docFileCount: number;
  imageFileCount: number;
}

type ScienceButtonMode = "hidden" | "diagnostic" | "orchestration";

export function resolveScienceButtonMode({
  showDiagnosticSend,
  showOrchestrationButton,
  isVoiceMode,
  hasOrchestrationClick,
}: {
  showDiagnosticSend: boolean;
  showOrchestrationButton: boolean;
  isVoiceMode: boolean;
  hasOrchestrationClick: boolean;
}): ScienceButtonMode {
  if (isVoiceMode || (!showDiagnosticSend && !showOrchestrationButton)) {
    return "hidden";
  }
  return hasOrchestrationClick ? "orchestration" : "diagnostic";
}

export function shouldUseArmedDiagnosticSubmit({
  diagnosticSendArmed,
  submitOptions,
}: {
  diagnosticSendArmed: boolean;
  submitOptions?: { diagnostic?: boolean };
}): boolean {
  return diagnosticSendArmed && submitOptions?.diagnostic !== true;
}

export function shouldDisableSendButton({
  disabled,
  isSending,
  canRetry,
  allowEmptySubmit,
  inputValue,
  docFileCount,
  imageFileCount,
}: SendAvailabilityParams): boolean {
  if (disabled || isSending) return true;
  if (canRetry) return false;

  const hasComposerContent =
    inputValue.trim().length > 0 || docFileCount > 0 || imageFileCount > 0;
  return !allowEmptySubmit && !hasComposerContent;
}

export default function MessageBar({
  onSubmit,
  placeholder = "Ask Zen anything...",
  showFileAttachment = true, // Default to true now
  autoFocus = false,
  disabled = false,
  initialValue = "",
  onValueChange,
  maxRows = 6,
  isSending = false,
  canRetry = false,
  onRetry,
  allowEmptySubmit = false,
  showDiagnosticSend = isDevEnv(),
  showOrchestrationButton = false,
  onOrchestrationClick,
  orchestrationLogVisible = false,
  diagnosticSendArmed = false,
}: MessageBarProps) {
  const TEXTAREA_LINE_HEIGHT = 24;
  const COLLAPSED_HEIGHT = 44;

  const [inputValue, setInputValue] = useState(initialValue);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isMultiline, setIsMultiline] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [voicePopoverOpen, setVoicePopoverOpen] = useState(false);
  const sendAreaRef = useRef<HTMLDivElement>(null);
  const voicePopoverRef = useRef<HTMLDivElement | null>(null);
  const voiceCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptErrorToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sendAreaRect, setSendAreaRect] = useState<{ top: number; right: number; bottom: number; left: number } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const focusComposer = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  const {
    voiceState,
    isVoiceMode,
    isRecording,
    isTranscribing,
    partialTranscript,
    transcriptError,
    currentRecordingStream,
    startDictate,
    startVoice,
    stopRecording,
    exitVoiceMode,
    setTranscriptError,
  } = useVoiceController({
    onInsertText: (text: string) => {
      setInputValue((prev) => {
        const next = prev ? `${prev} ${text}` : text;
        onValueChange?.(next);
        return next;
      });
    },
    onSubmitVoice: (text: string, durationMs: number) => {
      onSubmit(text, undefined, undefined, { fromVoice: true, durationMs });
    },
    onFocusComposer: focusComposer,
    onError: (msg) => setTranscriptError(msg ?? null),
  });

  const { isTtsPlaying, currentAudioElement } = useTtsPlayback();

  const prefersDark = typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    return () => {
      if (voiceCloseTimeoutRef.current) clearTimeout(voiceCloseTimeoutRef.current);
      if (transcriptErrorToastTimeoutRef.current) {
        clearTimeout(transcriptErrorToastTimeoutRef.current);
        transcriptErrorToastTimeoutRef.current = null;
      }
    };
  }, []);

  // Close voice popover on Escape or outside click
  useEffect(() => {
    if (!voicePopoverOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVoicePopoverOpen(false);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inSendArea = sendAreaRef.current?.contains(target);
      const inPopover = voicePopoverRef.current?.contains(target);
      if (!inSendArea && !inPopover) setVoicePopoverOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("mousedown", handleClick, true);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("mousedown", handleClick, true);
    };
  }, [voicePopoverOpen]);

  const clearVoiceCloseTimeout = useCallback(() => {
    if (voiceCloseTimeoutRef.current) {
      clearTimeout(voiceCloseTimeoutRef.current);
      voiceCloseTimeoutRef.current = null;
    }
  }, []);

  const scheduleVoiceClose = useCallback(() => {
    clearVoiceCloseTimeout();
    voiceCloseTimeoutRef.current = setTimeout(() => setVoicePopoverOpen(false), 150);
  }, [clearVoiceCloseTimeout]);

  const updateSendAreaRect = useCallback(() => {
    const el = sendAreaRef.current;
    if (el) setSendAreaRect(el.getBoundingClientRect());
  }, []);

  // When voice popover opens, measure send area and keep position updated (scroll/resize)
  useEffect(() => {
    if (!voicePopoverOpen) {
      setSendAreaRect(null);
      return;
    }
    updateSendAreaRect();
    window.addEventListener("scroll", updateSendAreaRect, true);
    window.addEventListener("resize", updateSendAreaRect);
    return () => {
      window.removeEventListener("scroll", updateSendAreaRect, true);
      window.removeEventListener("resize", updateSendAreaRect);
    };
  }, [voicePopoverOpen, updateSendAreaRect]);

  const adjustTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const maxHeight = TEXTAREA_LINE_HEIGHT * maxRows;

      textarea.style.height = "auto";
      const contentHeight = Math.max(textarea.scrollHeight, TEXTAREA_LINE_HEIGHT);
      const hasMultilineContent =
        textarea.value.includes("\n") ||
        contentHeight > TEXTAREA_LINE_HEIGHT + 1;
      textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
      setIsMultiline(hasMultilineContent);
    }
  }, [maxRows, TEXTAREA_LINE_HEIGHT]);

  useEffect(() => {
    adjustTextareaHeight();
  }, [adjustTextareaHeight, inputValue]);

  const handleSubmit = async (
    e?: React.FormEvent,
    submitOptions?: { diagnostic?: boolean },
  ) => {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    const hasAttachments = docFiles.length > 0 || imageFiles.length > 0;
    const isSlashCommand = trimmed.startsWith("/") && !hasAttachments;
    const isDiagnosticSend = submitOptions?.diagnostic === true;
    const shouldUseArmedDiagnosticSend = shouldUseArmedDiagnosticSubmit({
      diagnosticSendArmed,
      submitOptions,
    });

    if (isSlashCommand) {
      if (!trimmed || disabled || isSending || isTranscribing) return;
      onSubmit(trimmed, undefined, undefined);
      setInputValue("");
      setIsMultiline(false);
      onValueChange?.("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      return;
    }

    if (isDiagnosticSend) {
      if (!trimmed || hasAttachments || disabled || isSending || isTranscribing) return;
      onSubmit(trimmed, undefined, undefined, { diagnostic: true });
      setInputValue("");
      setIsMultiline(false);
      onValueChange?.("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      return;
    }

    if (shouldUseArmedDiagnosticSend) {
      if (!trimmed || hasAttachments || disabled || isSending || isTranscribing) return;
      onSubmit(trimmed, undefined, undefined, {
        diagnostic: true,
        diagnosticArmed: true,
      });
      setInputValue("");
      setIsMultiline(false);
      onValueChange?.("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      return;
    }

    if (!trimmed && !hasAttachments && !allowEmptySubmit) return;

    if (!trimmed && !hasAttachments && allowEmptySubmit) {
      onSubmit("", undefined, undefined);
      if (inputValue.length > 0) {
        setInputValue("");
        onValueChange?.("");
        if (textareaRef.current) {
          textareaRef.current.style.height = "auto";
        }
      }
      return;
    }
    
    // Build two image variants:
    // 1) OCR upload payload (compressed, readable, sent via `data`)
    // 2) GUI thumbnail (small preview, stored in `file`)
    const { compressImageForUpload, blobToBase64 } = await import(
      "../lib/imageCompression"
    );
    const OCR_MAX_DIMENSION = 1280;
    const OCR_QUALITY = 0.82;
    const THUMBNAIL_MAX_DIMENSION = 384;
    const THUMBNAIL_QUALITY = 0.74;
    const imageAttachments: ImageAttachment[] = await Promise.all(
      imageFiles.map(async (file) => {
        const ocrBlob = await compressImageForUpload(
          file,
          0,
          OCR_MAX_DIMENSION,
          OCR_QUALITY,
        );
        const ocrBase64 = await blobToBase64(ocrBlob);

        const thumbnailBlob = await compressImageForUpload(
          file,
          0,
          THUMBNAIL_MAX_DIMENSION,
          THUMBNAIL_QUALITY,
        );
        const thumbnailFile = new File([thumbnailBlob], file.name, {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });

        return {
          name: file.name,
          type: "image/jpeg",
          data: ocrBase64,
          file: thumbnailFile,
        };
      }),
    );
    
    console.log(`📎 [MessageBar] Submitting with ${imageAttachments.length} images, ${docFiles.length} docs`);
    
    onSubmit(trimmed, docFiles.length > 0 ? docFiles : undefined, imageAttachments.length > 0 ? imageAttachments : undefined);
    setInputValue("");
    setDocFiles([]);
    setImageFiles([]);
    setIsMultiline(false);
    onValueChange?.("");
    
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    onValueChange?.(e.target.value);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const addFiles = (newFiles: File[]) => {
    for (const file of newFiles) {
      // Check file size
      const sizeLimit = getFileSizeLimit(file);
      if (file.size > sizeLimit) {
        console.warn(`File ${file.name} exceeds size limit (${Math.round(sizeLimit / 1024 / 1024)}MB)`);
        continue;
      }

      if (isImageFile(file)) {
        // Check image count limit
        if (imageFiles.length >= CHAT_UPLOAD_LIMITS.MAX_IMAGE_ATTACHMENTS) {
          console.warn(`Max image limit reached (${CHAT_UPLOAD_LIMITS.MAX_IMAGE_ATTACHMENTS})`);
          continue;
        }
        setImageFiles(prev => [...prev, file]);
      } else {
        // Check doc count limit
        if (docFiles.length >= CHAT_UPLOAD_LIMITS.MAX_DOC_ATTACHMENTS) {
          console.warn(`Max document limit reached (${CHAT_UPLOAD_LIMITS.MAX_DOC_ATTACHMENTS})`);
          continue;
        }
        setDocFiles(prev => [...prev, file]);
      }
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeDoc = (index: number) => {
    setDocFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files));
    }
  };

  // Expand only when the textarea is truly multiline or non-text composer states need extra height.
  const hasAttachmentContent = docFiles.length > 0 || imageFiles.length > 0;
  const hasComposerContent = inputValue.trim().length > 0 || hasAttachmentContent;
  const isExpanded = isMultiline || hasAttachmentContent || isRecording || isTranscribing;
  const showDictatePanel = isRecording || isTranscribing;
  const scienceButtonMode = resolveScienceButtonMode({
    showDiagnosticSend,
    showOrchestrationButton,
    isVoiceMode,
    hasOrchestrationClick: typeof onOrchestrationClick === "function",
  });
  const showDiagnosticButton = scienceButtonMode !== "hidden";
  const diagnosticDisabled =
    disabled ||
    isSending ||
    isTranscribing ||
    isRecording ||
    inputValue.trim().length === 0 ||
    hasAttachmentContent;

  return (
    <form 
      onSubmit={handleSubmit} 
      className="w-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Image Preview - shows above input when images are attached */}
      {imageFiles.length > 0 && (
        <div className="mb-3">
          <ImageAttachmentPreview
            files={imageFiles}
            onRemove={removeImage}
          />
        </div>
      )}

      <div className="relative w-full">
        {transcriptError && (
          <div
            role="alert"
            className="absolute left-4 right-4 text-xs rounded-lg px-3 py-2"
            style={{
              bottom: '100%',
              marginBottom: 4,
              backgroundColor: 'var(--chatty-bg-main)',
              color: 'var(--chatty-text)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              zIndex: Z_LAYERS.toast,
            }}
          >
            {transcriptError}
          </div>
        )}
        <div className={styles.row}>
          {showFileAttachment && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ALL_ALLOWED_TYPES.join(',')}
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleFileClick}
                className={styles.sideControl}
                style={{ color: "var(--chatty-text)" }}
                title="Attach files or images"
              >
                <Plus size={20} />
              </button>
            </>
          )}

          <div
            data-testid="message-pill"
            className={`${styles.messagePill} ${isDragging ? 'ring-2 ring-[var(--chatty-accent)]' : ''}`}
            style={{
              height: isExpanded ? "auto" : `${COLLAPSED_HEIGHT}px`,
              minHeight: COLLAPSED_HEIGHT,
              borderRadius: isExpanded ? "24px" : `${COLLAPSED_HEIGHT / 2}px`,
              paddingTop: isExpanded ? 8 : 0,
              paddingBottom: isExpanded ? 8 : 0,
              boxShadow: isFocused
                ? "0 4px 16px rgba(0, 0, 0, 0.15)"
                : "0 4px 12px rgba(0, 0, 0, 0.1)",
              transition: "border-radius 200ms ease, min-height 200ms ease, box-shadow 200ms ease",
            }}
          >
            {docFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pb-2">
                {docFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs"
                    style={{
                      backgroundColor: "var(--chatty-highlight)",
                      color: "var(--chatty-text)",
                    }}
                  >
                    <Paperclip size={12} />
                    <span className="truncate max-w-[150px]">{file.name}</span>
                    <span className="opacity-60">
                      ({Math.round(file.size / 1024)}KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDoc(idx)}
                      className="ml-1 hover:opacity-70"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showDictatePanel ? (
              <div
                className="flex flex-col gap-2 px-3"
                style={{ minHeight: 40, justifyContent: "center" }}
              >
                <div className="flex items-center gap-3">
                  {isRecording ? (
                    <>
                      <span className="text-sm shrink-0" style={{ color: 'var(--chatty-text)', opacity: 0.95 }}>
                        {isVoiceMode ? 'Speaking…' : 'Listening…'}
                      </span>
                      <LiveMicLevel stream={currentRecordingStream} style={{ flex: 1 }} />
                    </>
                  ) : (
                    <>
                      <span className="text-sm shrink-0" style={{ color: 'var(--chatty-text)', opacity: 0.95 }}>
                        {isVoiceMode ? 'Finalizing…' : 'Transcribing…'}
                      </span>
                      <Loader2
                        size={18}
                        className="animate-spin"
                        style={{ color: 'var(--chatty-accent)', flexShrink: 0 }}
                      />
                    </>
                  )}
                </div>
                {isVoiceMode && partialTranscript && (
                  <p
                    className="text-sm"
                    style={{ color: 'var(--chatty-text)', opacity: 0.9, margin: 0 }}
                  >
                    {partialTranscript}
                  </p>
                )}
              </div>
            ) : (
              <div
                className="flex items-center px-3"
                style={{
                  minHeight: isExpanded ? undefined : COLLAPSED_HEIGHT,
                  height: isExpanded ? "auto" : `${COLLAPSED_HEIGHT}px`,
                }}
              >
                <textarea
                  ref={textareaRef}
                  data-testid="message-input"
                  value={inputValue}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder={placeholder}
                  disabled={disabled}
                  rows={1}
                  className="bg-transparent outline-none text-base resize-none chatty-placeholder leading-normal"
                  style={{
                    color: "var(--chatty-text)",
                    height: isExpanded ? undefined : `${TEXTAREA_LINE_HEIGHT}px`,
                    minHeight: `${TEXTAREA_LINE_HEIGHT}px`,
                    maxHeight: isExpanded ? undefined : `${TEXTAREA_LINE_HEIGHT}px`,
                    width: "100%",
                    display: "block",
                    lineHeight: `${TEXTAREA_LINE_HEIGHT}px`,
                    backgroundColor: "transparent",
                    border: "none",
                    margin: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                    paddingLeft: 0,
                    paddingRight: 0,
                    overflowY: "hidden",
                  }}
                />
              </div>
            )}
          </div>

          <div className={styles.rightControls}>
            {isRecording && !isVoiceMode && (
              <button
                type="button"
                onClick={stopRecording}
                className={styles.sideControl}
                style={{ color: "var(--chatty-text)" }}
                title="Stop recording"
                aria-label="Stop recording"
              >
                <Check size={18} />
              </button>
            )}

            <div
              ref={sendAreaRef}
              className="relative flex-shrink-0"
              style={{
                zIndex: 1,
                display: 'flex',
                alignItems: 'flex-end',
              }}
              onMouseEnter={() => {
                clearVoiceCloseTimeout();
                setVoicePopoverOpen(true);
              }}
              onMouseLeave={scheduleVoiceClose}
              onFocusCapture={() => {
                clearVoiceCloseTimeout();
                setVoicePopoverOpen(true);
              }}
              onBlurCapture={() => {
                setTimeout(() => {
                  const wrapper = sendAreaRef.current;
                  const active = document.activeElement as Node | null;
                  if (wrapper && active && !wrapper.contains(active)) {
                    setVoicePopoverOpen(false);
                  }
                }, 0);
              }}
              aria-expanded={voicePopoverOpen}
              aria-haspopup="dialog"
            >
              {voicePopoverOpen &&
                sendAreaRect &&
                createPortal(
                  <div
                    ref={voicePopoverRef}
                    role="menu"
                    aria-label="Voice actions"
                    className="flex flex-col"
                    style={{
                      position: "fixed",
                      top: sendAreaRect.top,
                      left: Math.max(8, sendAreaRect.right - 44),
                      transform: "translateY(-100%) translateY(-6px)",
                      backgroundColor: "var(--chatty-bg-main)",
                      color: "var(--chatty-text)",
                      boxShadow: prefersDark
                        ? "0 12px 30px rgba(99,102,241,0.20), 0 0 30px rgba(99,102,241,0.14)"
                        : "0 4px 12px rgba(0,0,0,0.2)",
                      zIndex: Z_LAYERS.popover,
                      padding: 6,
                      borderRadius: 999,
                      opacity: 1,
                    }}
                    onMouseEnter={clearVoiceCloseTimeout}
                    onMouseLeave={scheduleVoiceClose}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-label={isRecording && isVoiceMode ? "Stop and send" : "Voice (send when done)"}
                      title={isRecording && isVoiceMode ? "Stop and send" : "Voice — speak and send as a message"}
                      onClick={() => {
                        if (!isTranscribing) {
                          setVoicePopoverOpen(false);
                          startVoice();
                        }
                      }}
                      disabled={isTranscribing}
                      className="p-2 rounded transition-colors"
                      style={{
                        color: isRecording && isVoiceMode ? "var(--chatty-accent)" : "var(--chatty-text)",
                        backgroundColor: "var(--chatty-bg-main)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--chatty-hover)";
                        e.currentTarget.style.color = "var(--chatty-accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--chatty-bg-main)";
                        e.currentTarget.style.color = isRecording && isVoiceMode ? "var(--chatty-accent)" : "var(--chatty-text)";
                      }}
                    >
                      {isTranscribing && isVoiceMode ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <RippleIcon size={20} />
                      )}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      aria-label={isRecording && !isVoiceMode ? "Stop recording" : "Dictate"}
                      title={isRecording && !isVoiceMode ? "Stop recording" : "Dictate — add to draft, send when ready"}
                      onClick={() => {
                        if (!isTranscribing) {
                          setVoicePopoverOpen(false);
                          startDictate();
                        }
                      }}
                      disabled={isTranscribing}
                      className="p-2 rounded transition-colors"
                      style={{
                        color: isRecording && !isVoiceMode ? "var(--chatty-accent)" : "var(--chatty-text)",
                        backgroundColor: "var(--chatty-bg-main)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--chatty-hover)";
                        e.currentTarget.style.color = "var(--chatty-accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "var(--chatty-bg-main)";
                        e.currentTarget.style.color = isRecording && !isVoiceMode ? "var(--chatty-accent)" : "var(--chatty-text)";
                      }}
                    >
                      {isTranscribing && !isVoiceMode ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <MicrophoneIcon size={20} />
                      )}
                    </button>
                  </div>,
                  document.body
                )}
              <div style={{ display: 'flex' }}>
                {isVoiceMode ? (
                  <SendButton
                    mode="end"
                    onClick={exitVoiceMode}
                    disabled={false}
                    ariaLabel="Exit voice mode"
                  />
                ) : (
                  <>
                    {showDiagnosticButton && (
                      <button
                        type="button"
                        onClick={() => {
                          if (scienceButtonMode === "orchestration" && onOrchestrationClick) {
                            onOrchestrationClick();
                            return;
                          }
                          void handleSubmit(undefined, { diagnostic: true });
                        }}
                        disabled={scienceButtonMode === "orchestration" ? false : diagnosticDisabled}
                        className={styles.sideControl}
                        style={{
                          color:
                            diagnosticSendArmed || orchestrationLogVisible
                              ? "var(--chatty-accent)"
                              : onOrchestrationClick
                                ? "var(--chatty-text)"
                                : diagnosticDisabled
                                  ? "var(--chatty-text-muted, var(--chatty-text))"
                                  : "var(--chatty-accent)",
                          opacity: onOrchestrationClick
                            ? 0.95
                            : diagnosticDisabled
                              ? 0.38
                              : 0.95,
                        }}
                        title={
                          onOrchestrationClick
                            ? diagnosticSendArmed
                              ? "Orchestration log and probe send are active for this turn"
                              : orchestrationLogVisible
                                ? "Hide orchestration log and send options"
                                : "Show orchestration log and send options"
                            : hasAttachmentContent
                              ? "Diagnostic send supports text-only probes"
                              : "Diagnostic send: Codex/Zen labeled, no conversation persistence"
                        }
                        aria-label={
                          onOrchestrationClick
                            ? orchestrationLogVisible
                              ? "Hide orchestration log"
                              : "Show orchestration log"
                            : "Diagnostic send without persistence"
                        }
                      >
                        <FlaskConical size={18} />
                      </button>
                    )}
                    <SendButton
                      onClick={() => {
                        const trimmed = inputValue.trim();
                        const hasAttachments = docFiles.length > 0 || imageFiles.length > 0;
                        if (canRetry && !trimmed && !hasAttachments && onRetry) {
                          onRetry();
                        } else {
                          handleSubmit();
                        }
                      }}
                      disabled={shouldDisableSendButton({
                        disabled: disabled || isTranscribing,
                        isSending,
                        canRetry,
                        allowEmptySubmit,
                        inputValue,
                        docFileCount: docFiles.length,
                        imageFileCount: imageFiles.length,
                      })}
                      soft={!hasComposerContent}
                      animating={isSending && !canRetry}
                      ariaLabel={
                        canRetry
                          ? "Retry / force prompt"
                          : allowEmptySubmit &&
                              !inputValue.trim() &&
                              docFiles.length === 0 &&
                              imageFiles.length === 0
                            ? "Continue conversation"
                            : "Send message"
                      }
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Voice-mode centerpiece: Lir'Vahxir orb (portal so it sits above conversation area) */}
      {isVoiceMode &&
        createPortal(
          <VoiceOrb
            active={true}
            state={
              isTtsPlaying
                ? ("aiSpeaking" as VoiceOrbState)
                : isRecording
                  ? ("userSpeaking" as VoiceOrbState)
                  : isTranscribing
                    ? ("transcribing" as VoiceOrbState)
                    : ("idle" as VoiceOrbState)
            }
            stream={isRecording ? currentRecordingStream : null}
            outputAudio={currentAudioElement}
          />,
          document.body
        )}

      {/* Drag overlay hint */}
      {isDragging && (
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 10 }}
        >
          <div 
            className="px-6 py-3 rounded-xl text-lg font-medium"
            style={{
              backgroundColor: "var(--chatty-accent)",
              color: "white",
            }}
          >
            Drop files here
          </div>
        </div>
      )}
    </form>
  );
}
