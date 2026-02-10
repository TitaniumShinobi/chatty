import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2, FileText, FileImage } from 'lucide-react';
import { Attachment } from '../types';

interface AttachmentDisplayProps {
  attachments: Attachment[];
  onRemove?: (index: number) => void;
  readOnly?: boolean;
  showFilenames?: boolean;
}

export default function AttachmentDisplay({ 
  attachments, 
  onRemove, 
  readOnly = false,
  showFilenames = true 
}: AttachmentDisplayProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const imageAttachments = attachments.filter(a => a.role === 'image' || a.mimeType?.startsWith('image/'));
  const docAttachments = attachments.filter(a => a.role === 'document' || (!a.mimeType?.startsWith('image/') && a.role !== 'image'));
  const imageCount = imageAttachments.length;

  useEffect(() => {
    const urls: string[] = [];
    
    imageAttachments.forEach((att) => {
      if (att.url) {
        urls.push(att.url);
      } else if (att.data) {
        urls.push(`data:${att.mimeType};base64,${att.data}`);
      } else if (att.file) {
        urls.push(URL.createObjectURL(att.file));
      }
    });
    
    setPreviews(urls);

    return () => {
      urls.forEach((url) => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [attachments]);

  if (attachments.length === 0) return null;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const prevLightbox = () => {
    setLightboxIndex((prev) => (prev > 0 ? prev - 1 : imageCount - 1));
  };

  const nextLightbox = () => {
    setLightboxIndex((prev) => (prev < imageCount - 1 ? prev + 1 : 0));
  };

  const getOriginalIndex = (imageIndex: number) => {
    let count = 0;
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      if (att.role === 'image' || att.mimeType?.startsWith('image/')) {
        if (count === imageIndex) return i;
        count++;
      }
    }
    return -1;
  };

  const truncateFilename = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop() || '';
    const baseName = name.slice(0, name.length - ext.length - 1);
    const truncatedBase = baseName.slice(0, maxLength - ext.length - 4) + '...';
    return `${truncatedBase}.${ext}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      {imageCount > 0 && (
        <div className="mb-3">
          {imageCount === 1 ? (
            <div className="relative w-full max-w-md">
              <img
                src={previews[0]}
                alt={imageAttachments[0].name}
                className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => openLightbox(0)}
              />
              {!readOnly && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(getOriginalIndex(0))}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                >
                  <X size={14} className="text-white" />
                </button>
              )}
              <button
                type="button"
                onClick={() => openLightbox(0)}
                className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
              >
                <Maximize2 size={14} className="text-white" />
              </button>
              {showFilenames && (
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 rounded text-white text-xs max-w-[70%] truncate">
                  {truncateFilename(imageAttachments[0].name, 30)}
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto">
              {previews.slice(0, 4).map((preview, i) => (
                <div key={i} className="relative flex-shrink-0">
                  <img
                    src={preview}
                    alt={imageAttachments[i]?.name || `Image ${i + 1}`}
                    className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => openLightbox(i)}
                  />
                  {!readOnly && onRemove && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(getOriginalIndex(i));
                      }}
                      className="absolute top-1 right-1 p-1 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
                    >
                      <X size={12} className="text-white" />
                    </button>
                  )}
                  {i === 3 && imageCount > 4 && (
                    <div
                      className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors"
                      onClick={() => openLightbox(i)}
                    >
                      <span className="text-white text-lg font-semibold">+{imageCount - 4}</span>
                    </div>
                  )}
                  {showFilenames && i < 3 && (
                    <div className="absolute bottom-1 left-1 right-1 px-1 py-0.5 bg-black/60 rounded text-white text-[10px] truncate">
                      {truncateFilename(imageAttachments[i]?.name || '', 15)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {docAttachments.length > 0 && (
        <div className="mb-3 space-y-1">
          {docAttachments.map((doc, i) => (
            <div key={i} className="flex items-center gap-2 p-2 bg-app-chat-100 rounded-lg">
              <FileText size={16} className="text-app-text-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-app-text-900 truncate">{doc.name}</div>
                {doc.size && (
                  <div className="text-xs text-app-text-600">{formatFileSize(doc.size)}</div>
                )}
              </div>
              {!readOnly && onRemove && (
                <button
                  type="button"
                  onClick={() => {
                    const docIndex = attachments.findIndex(a => a.id === doc.id);
                    if (docIndex !== -1) onRemove(docIndex);
                  }}
                  className="p-1 hover:bg-app-chat-200 rounded transition-colors"
                >
                  <X size={14} className="text-app-text-600" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {showFilenames && attachments.length > 0 && !readOnly && (
        <div className="text-xs text-app-text-600 mb-2">
          Uploaded: {attachments.map(a => a.name).join(', ')}
          {attachments.length > 3 && ` (+${attachments.length - 3} more)`}
        </div>
      )}

      {lightboxOpen && (
        <Lightbox
          previews={previews}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevLightbox}
          onNext={nextLightbox}
          fileNames={imageAttachments.map((a) => a.name)}
        />
      )}
    </>
  );
}

interface LightboxProps {
  previews: string[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  fileNames: string[];
}

function Lightbox({ previews, index, onClose, onPrev, onNext, fileNames }: LightboxProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
      >
        <X size={24} className="text-white" />
      </button>

      {previews.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <ChevronLeft size={32} className="text-white" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <ChevronRight size={32} className="text-white" />
          </button>
        </>
      )}

      <div
        className="max-w-[90vw] max-h-[90vh] flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={previews[index]}
          alt={fileNames[index]}
          className="max-w-full max-h-[80vh] object-contain rounded-lg"
        />
        <div className="mt-4 px-4 py-2 bg-black/60 rounded-lg text-white text-sm">
          {fileNames[index]} ({index + 1} of {previews.length})
        </div>
      </div>
    </div>
  );
}
