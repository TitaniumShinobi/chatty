export const CHAT_UPLOAD_LIMITS = {
  MAX_IMAGE_ATTACHMENTS: 5,
  MAX_DOC_ATTACHMENTS: 3,
  MAX_TOTAL_ATTACHMENTS: 5,
  MAX_IMAGE_SIZE_MB: 10,
  MAX_DOC_SIZE_MB: 20,
  MAX_TOTAL_PAYLOAD_MB: 50,
};

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
];

export const ALLOWED_DOC_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ALL_ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];

export function isImageFile(file: File): boolean {
  return ALLOWED_IMAGE_TYPES.includes(file.type) || file.type.startsWith('image/');
}

export function isDocFile(file: File): boolean {
  return ALLOWED_DOC_TYPES.includes(file.type);
}

export function getFileSizeLimit(file: File): number {
  if (isImageFile(file)) {
    return CHAT_UPLOAD_LIMITS.MAX_IMAGE_SIZE_MB * 1024 * 1024;
  }
  return CHAT_UPLOAD_LIMITS.MAX_DOC_SIZE_MB * 1024 * 1024;
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  const sizeLimit = getFileSizeLimit(file);
  
  if (file.size > sizeLimit) {
    const limitMB = sizeLimit / (1024 * 1024);
    return { valid: false, error: `File too large (max ${limitMB}MB)` };
  }
  
  if (!ALL_ALLOWED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return { valid: false, error: `Unsupported file type: ${file.type}` };
  }
  
  return { valid: true };
}

export function validateAttachments(
  existingImages: number,
  existingDocs: number,
  newFiles: File[]
): { valid: boolean; error?: string; validFiles: File[] } {
  const validFiles: File[] = [];
  let imageCount = existingImages;
  let docCount = existingDocs;
  
  for (const file of newFiles) {
    const validation = validateFile(file);
    if (!validation.valid) {
      continue;
    }
    
    if (isImageFile(file)) {
      if (imageCount >= CHAT_UPLOAD_LIMITS.MAX_IMAGE_ATTACHMENTS) {
        continue;
      }
      imageCount++;
    } else {
      if (docCount >= CHAT_UPLOAD_LIMITS.MAX_DOC_ATTACHMENTS) {
        continue;
      }
      docCount++;
    }
    
    if (imageCount + docCount > CHAT_UPLOAD_LIMITS.MAX_TOTAL_ATTACHMENTS) {
      break;
    }
    
    validFiles.push(file);
  }
  
  return { valid: true, validFiles };
}
