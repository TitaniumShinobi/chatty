/**
 * Attachment Service
 * 
 * Handles uploading attachments to the backend storage and 
 * converting between different attachment formats.
 */

import { Attachment } from '../types';

interface UploadAttachmentsParams {
  userId: string;
  constructId: string;
  conversationId: string;
  attachments: Array<{
    name: string;
    type: string;
    data: string; // base64
  }>;
}

interface UploadResult {
  success: boolean;
  attachments: Attachment[];
  error?: string;
}

/**
 * Upload attachments to backend storage and get permanent URLs
 */
export async function uploadAttachments(params: UploadAttachmentsParams): Promise<UploadResult> {
  try {
    const response = await fetch('/api/attachments/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ [AttachmentService] Upload failed:', errorData);
      return {
        success: false,
        attachments: [],
        error: errorData.error || 'Upload failed',
      };
    }

    const data = await response.json();
    return {
      success: true,
      attachments: data.attachments || [],
    };
  } catch (error) {
    console.error('❌ [AttachmentService] Upload error:', error);
    return {
      success: false,
      attachments: [],
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Convert ImageAttachment (with base64 data) to Attachment type for local display
 * Used for in-flight attachments that haven't been uploaded yet
 */
export function imageAttachmentsToAttachments(
  imageAttachments: Array<{ name: string; type: string; data: string; file?: File }>
): Attachment[] {
  return imageAttachments.map((img) => ({
    id: crypto.randomUUID(),
    name: img.name,
    mimeType: img.type,
    size: img.data ? Math.ceil((img.data.length * 3) / 4) : 0,
    role: 'image' as const,
    data: img.data,
    file: img.file,
  }));
}

/**
 * Convert File objects to Attachment type for documents
 */
export function filesToAttachments(files: File[]): Attachment[] {
  return files.map((file) => ({
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    size: file.size,
    role: file.type.startsWith('image/') ? 'image' as const : 'document' as const,
    file,
  }));
}

/**
 * Check if an attachment has a persistent URL (uploaded to storage)
 */
export function isPersistedAttachment(attachment: Attachment): boolean {
  return !!attachment.url && !attachment.url.startsWith('data:') && !attachment.url.startsWith('blob:');
}
