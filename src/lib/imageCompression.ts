export async function compressImageForUpload(
  file: File,
  maxBytes = 700_000,
  maxDimension = 1280,
  jpegQuality = 0.82,
): Promise<Blob> {
  if (file.size <= maxBytes) {
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image for compression"));
      img.src = objectUrl;
    });

    const originalWidth = image.naturalWidth || image.width;
    const originalHeight = image.naturalHeight || image.height;

    if (!originalWidth || !originalHeight) {
      throw new Error("Invalid image dimensions");
    }

    const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
    const targetWidth = Math.max(1, Math.round(originalWidth * scale));
    const targetHeight = Math.max(1, Math.round(originalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("Image compression failed"));
            return;
          }
          resolve(result);
        },
        "image/jpeg",
        jpegQuality,
      );
    });

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.replace(/^data:.*;base64,/, ""));
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read blob as base64"));
    reader.readAsDataURL(blob);
  });
}
