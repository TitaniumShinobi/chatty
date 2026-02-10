import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react';

interface ImageAttachmentPreviewProps {
  files: File[];
  onRemove: (index: number) => void;
}

export default function ImageAttachmentPreview({ files, onRemove }: ImageAttachmentPreviewProps) {
  const [previews, setPreviews] = useState<string[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    const urls: string[] = [];
    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        urls.push(URL.createObjectURL(file));
      }
    });
    setPreviews(urls);

    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  const imageFiles = files.filter((f) => f.type.startsWith('image/'));
  const imageCount = imageFiles.length;

  if (imageCount === 0) return null;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const prevImage = () => {
    setCarouselIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const nextImage = () => {
    setCarouselIndex((prev) => (prev < imageCount - 1 ? prev + 1 : prev));
  };

  const prevLightbox = () => {
    setLightboxIndex((prev) => (prev > 0 ? prev - 1 : imageCount - 1));
  };

  const nextLightbox = () => {
    setLightboxIndex((prev) => (prev < imageCount - 1 ? prev + 1 : 0));
  };

  const getOriginalIndex = (imageIndex: number) => {
    let count = 0;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        if (count === imageIndex) return i;
        count++;
      }
    }
    return -1;
  };

  if (imageCount === 1) {
    return (
      <>
        <div className="relative w-full max-w-md mb-3">
          <img
            src={previews[0]}
            alt={imageFiles[0].name}
            className="w-full h-48 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => openLightbox(0)}
          />
          <button
            type="button"
            onClick={() => onRemove(getOriginalIndex(0))}
            className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
          >
            <X size={14} className="text-white" />
          </button>
          <button
            type="button"
            onClick={() => openLightbox(0)}
            className="absolute bottom-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
          >
            <Maximize2 size={14} className="text-white" />
          </button>
        </div>
        {lightboxOpen && (
          <Lightbox
            previews={previews}
            index={lightboxIndex}
            onClose={closeLightbox}
            onPrev={prevLightbox}
            onNext={nextLightbox}
            fileNames={imageFiles.map((f) => f.name)}
          />
        )}
      </>
    );
  }

  const visibleCount = Math.min(3, imageCount);
  const hiddenCount = imageCount - visibleCount;

  return (
    <>
      <div className="relative mb-3">
        <div className="flex gap-2 overflow-hidden">
          {previews.slice(0, 3).map((preview, i) => (
            <div key={i} className="relative flex-shrink-0">
              <img
                src={preview}
                alt={imageFiles[i].name}
                className="w-24 h-24 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => openLightbox(i)}
              />
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
              {i === 2 && hiddenCount > 0 && (
                <div
                  className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors"
                  onClick={() => openLightbox(i)}
                >
                  <span className="text-white text-lg font-semibold">+{hiddenCount}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {imageCount > 3 && (
          <div className="flex items-center gap-1 mt-2">
            <button
              type="button"
              onClick={prevImage}
              disabled={carouselIndex === 0}
              className="p-1 rounded-full bg-app-butter-300 hover:bg-app-butter-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-1">
              {Array.from({ length: Math.ceil(imageCount / 3) }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    Math.floor(carouselIndex / 3) === i
                      ? 'bg-app-orange-500'
                      : 'bg-app-butter-300'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={nextImage}
              disabled={carouselIndex >= imageCount - 3}
              className="p-1 rounded-full bg-app-butter-300 hover:bg-app-butter-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {lightboxOpen && (
        <Lightbox
          previews={previews}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevLightbox}
          onNext={nextLightbox}
          fileNames={imageFiles.map((f) => f.name)}
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
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
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
        <div className="mt-4 text-white text-sm">
          {fileNames[index]} ({index + 1} of {previews.length})
        </div>
      </div>
    </div>
  );
}
