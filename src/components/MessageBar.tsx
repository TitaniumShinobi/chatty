import React, { useState, useRef, useEffect } from "react";
import { Plus, Mic, Send, Paperclip } from "lucide-react";

interface MessageBarProps {
  onSubmit: (text: string, files?: File[]) => void;
  placeholder?: string;
  showVoiceButton?: boolean;
  showFileAttachment?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  initialValue?: string;
  onValueChange?: (value: string) => void;
  maxRows?: number;
}

export default function MessageBar({
  onSubmit,
  placeholder = "Ask Zen anything...",
  showVoiceButton = true,
  showFileAttachment = false,
  autoFocus = false,
  disabled = false,
  initialValue = "",
  onValueChange,
  maxRows = 6,
}: MessageBarProps) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [files, setFiles] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setInputValue(initialValue);
  }, [initialValue]);

  const adjustTextareaHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const lineHeight = 24;
      const maxHeight = lineHeight * maxRows;
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed && files.length === 0) return;
    
    onSubmit(trimmed, files.length > 0 ? files : undefined);
    setInputValue("");
    setFiles([]);
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
      setFiles(Array.from(e.target.files));
    }
  };

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const hasContent = inputValue.trim() || files.length > 0;

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div
        className="flex items-center gap-2 px-4 py-2 rounded-full transition-all"
        style={{
          backgroundColor: "var(--chatty-bg-message)",
          boxShadow: isFocused
            ? "0 4px 16px rgba(0, 0, 0, 0.15), 0 0 0 2px rgba(173, 165, 135, 0.2)"
            : "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        {showFileAttachment ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={handleFileClick}
              className="p-2 rounded-lg transition-colors flex-shrink-0"
              style={{ color: "var(--chatty-text)", opacity: 0.6 }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--chatty-highlight)";
                e.currentTarget.style.opacity = "1";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.opacity = "0.6";
              }}
              title="Attach files"
            >
              <Paperclip size={20} />
            </button>
          </>
        ) : (
          <Plus
            size={20}
            style={{ color: "var(--chatty-text)", opacity: 0.6 }}
            className="flex-shrink-0"
          />
        )}

        <div className="flex-1 flex flex-col">
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {files.map((file, idx) => (
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
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    className="ml-1 hover:opacity-70"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full bg-transparent outline-none text-base resize-none chatty-placeholder leading-normal"
            style={{
              color: "var(--chatty-text)",
              minHeight: "24px",
            }}
          />
        </div>

        {showVoiceButton && (
          <button
            type="button"
            className="p-2 rounded-lg transition-colors flex-shrink-0"
            style={{ color: "var(--chatty-text)", opacity: 0.7 }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--chatty-highlight)";
              e.currentTarget.style.opacity = "1";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.opacity = "0.7";
            }}
            title="Voice input"
          >
            <Mic size={20} />
          </button>
        )}

        <button
          type="submit"
          disabled={disabled || !hasContent}
          className="p-2 rounded-full transition-all flex-shrink-0"
          style={{
            backgroundColor: hasContent ? "var(--chatty-button)" : "transparent",
            color: hasContent ? "var(--chatty-text-inverse, #fffff0)" : "var(--chatty-text)",
            opacity: hasContent ? 1 : 0.5,
          }}
          onMouseEnter={(e) => {
            if (hasContent) {
              e.currentTarget.style.backgroundColor = "var(--chatty-hover)";
            }
          }}
          onMouseLeave={(e) => {
            if (hasContent) {
              e.currentTarget.style.backgroundColor = "var(--chatty-button)";
            }
          }}
        >
          <Send size={20} />
        </button>
      </div>
    </form>
  );
}
