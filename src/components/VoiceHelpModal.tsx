import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { getVoiceLabHelp } from "../lib/apiService";
import { Z_LAYERS } from "../lib/zLayers";

interface VoiceHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export function VoiceHelpModal({ open, onClose }: VoiceHelpModalProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMarkdown(null);
    setError(false);
    setLoading(true);
    getVoiceLabHelp()
      .then((text) => {
        setMarkdown(text || "");
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: Z_LAYERS.critical + 2 }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-help-title"
    >
      <div
        className="fixed inset-0 bg-black bg-opacity-50"
        style={{ zIndex: Z_LAYERS.critical + 2 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative flex flex-col rounded-lg shadow-lg w-full max-w-lg max-h-[85vh]"
        style={{
          zIndex: Z_LAYERS.critical + 3,
          backgroundColor: "var(--chatty-bg-main)",
          color: "var(--chatty-text)",
          border: "1px solid var(--chatty-line)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: "var(--chatty-line)" }}>
          <h2 id="voice-help-title" className="text-sm font-semibold" style={{ color: "var(--chatty-text)" }}>
            Voice Lab instructions
          </h2>
          <button
            type="button"
            className="p-1.5 rounded hover:opacity-80"
            style={{ backgroundColor: "var(--chatty-bg-message)", color: "var(--chatty-text)" }}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div
          className="flex-1 overflow-y-auto p-4 text-xs prose prose-sm max-w-none"
          style={{
            color: "var(--chatty-text)",
            backgroundColor: "var(--chatty-bg-message)",
          }}
        >
          {loading && <p style={{ opacity: 0.8 }}>Loading…</p>}
          {error && (
            <p style={{ opacity: 0.9 }}>
              Couldn't load instructions. Try again or trim a 20–30 s clip with ffmpeg and upload it here.
            </p>
          )}
          {!loading && !error && markdown !== null && markdown && (
            <ReactMarkdown
              remarkPlugins={[remarkBreaks]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
                strong: ({ children }) => <strong style={{ color: "var(--chatty-text)" }}>{children}</strong>,
                code: ({ children }) => (
                  <code
                    className="px-1 rounded text-[0.7rem]"
                    style={{ backgroundColor: "var(--chatty-bg-main)", color: "var(--chatty-text)" }}
                  >
                    {children}
                  </code>
                ),
              }}
            >
              {markdown}
            </ReactMarkdown>
          )}
        </div>
        <div className="p-3 border-t flex justify-end" style={{ borderColor: "var(--chatty-line)" }}>
          <button
            type="button"
            className="px-4 py-2 rounded text-sm font-medium"
            style={{
              backgroundColor: "var(--chatty-bg-message)",
              color: "var(--chatty-text)",
              border: "1px solid var(--chatty-line)",
            }}
            onClick={onClose}
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
