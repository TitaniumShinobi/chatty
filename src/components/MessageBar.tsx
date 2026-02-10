import React, { useState, useRef, useEffect } from "react";
import { Plus, Mic, Paperclip, X } from "lucide-react";
import ImageAttachmentPreview from "./ImageAttachmentPreview";
import { 
  CHAT_UPLOAD_LIMITS, 
  ALL_ALLOWED_TYPES,
  isImageFile, 
  getFileSizeLimit 
} from "../config/chatConfig";

export interface ImageAttachment {
  name: string;
  type: string;
  data: string; // base64
  file?: File; // Keep original file for preview
}

interface MessageBarProps {
  onSubmit: (text: string, files?: File[], imageAttachments?: ImageAttachment[]) => void;
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
  showFileAttachment = true, // Default to true now
  autoFocus = false,
  disabled = false,
  initialValue = "",
  onValueChange,
  maxRows = 6,
}: MessageBarProps) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed && docFiles.length === 0 && imageFiles.length === 0) return;
    
    // Convert images to base64
    const imageAttachments: ImageAttachment[] = await Promise.all(
      imageFiles.map(async (file) => ({
        name: file.name,
        type: file.type,
        data: await fileToBase64(file),
        file
      }))
    );
    
    console.log(`📎 [MessageBar] Submitting with ${imageAttachments.length} images, ${docFiles.length} docs`);
    
    onSubmit(trimmed, docFiles.length > 0 ? docFiles : undefined, imageAttachments.length > 0 ? imageAttachments : undefined);
    setInputValue("");
    setDocFiles([]);
    setImageFiles([]);
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

      <div
        className={`flex items-center gap-2 px-4 py-2 transition-all ${isDragging ? 'ring-2 ring-[var(--chatty-accent)]' : ''}`}
        style={{
          borderRadius: "24px",
          backgroundColor: "var(--chatty-bg-message)",
          boxShadow: isFocused
            ? "0 4px 16px rgba(0, 0, 0, 0.15)"
            : "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
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
              title="Attach files or images"
            >
              <Plus size={20} />
            </button>
          </>
        )}

        <div className="flex-1 flex flex-col">
          {/* Document file chips */}
          {docFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
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

      </div>
      
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
