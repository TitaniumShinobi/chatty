/**
 * Attachment Storage Service
 * 
 * Handles uploading attachments (images, documents) to Supabase Storage
 * and returns persistent URLs for long-term storage.
 */

import { getSupabaseClient } from './supabaseClient.js';
import crypto from 'crypto';

const BUCKET_NAME = 'chatty-attachments';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Ensure the storage bucket exists
 */
async function ensureBucketExists() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('⚠️ [AttachmentStorage] Supabase not available');
    return false;
  }

  try {
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('❌ [AttachmentStorage] Failed to list buckets:', listError.message);
      return false;
    }

    const bucketExists = buckets?.some(b => b.name === BUCKET_NAME);
    if (!bucketExists) {
      console.log(`📦 [AttachmentStorage] Creating bucket: ${BUCKET_NAME}`);
      const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
        allowedMimeTypes: [
          'image/jpeg',
          'image/png', 
          'image/gif',
          'image/webp',
          'application/pdf',
          'text/plain',
          'text/markdown',
          'application/json'
        ]
      });
      if (createError) {
        console.error('❌ [AttachmentStorage] Failed to create bucket:', createError.message);
        return false;
      }
      console.log('✅ [AttachmentStorage] Bucket created successfully');
    }
    return true;
  } catch (error) {
    console.error('❌ [AttachmentStorage] Bucket setup error:', error.message);
    return false;
  }
}

/**
 * Upload a single attachment to Supabase Storage
 * 
 * @param {Object} params
 * @param {string} params.userId - User ID for path organization
 * @param {string} params.constructId - Construct ID (e.g., katana-001)
 * @param {string} params.conversationId - Conversation/thread ID
 * @param {string} params.fileName - Original filename
 * @param {string} params.mimeType - MIME type (e.g., image/png)
 * @param {string} params.base64Data - Base64 encoded file data
 * @returns {Promise<{url: string, path: string} | null>}
 */
export async function uploadAttachment({ userId, constructId, conversationId, fileName, mimeType, base64Data }) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('⚠️ [AttachmentStorage] Supabase not available, skipping upload');
    return null;
  }

  await ensureBucketExists();

  try {
    const uniqueId = crypto.randomUUID().slice(0, 8);
    const timestamp = Date.now();
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${userId}/${constructId}/${conversationId}/${timestamp}_${uniqueId}_${safeFileName}`;

    const buffer = Buffer.from(base64Data, 'base64');

    console.log(`📤 [AttachmentStorage] Uploading: ${storagePath} (${(buffer.length / 1024).toFixed(1)}KB)`);

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false
      });

    if (error) {
      console.error('❌ [AttachmentStorage] Upload failed:', error.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(storagePath);

    console.log(`✅ [AttachmentStorage] Uploaded successfully: ${urlData.publicUrl}`);

    return {
      url: urlData.publicUrl,
      path: storagePath
    };
  } catch (error) {
    console.error('❌ [AttachmentStorage] Upload error:', error.message);
    return null;
  }
}

/**
 * Upload multiple attachments and return metadata
 * 
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.constructId
 * @param {string} params.conversationId
 * @param {Array<{name: string, type: string, data: string}>} params.attachments
 * @returns {Promise<Array<{id: string, name: string, mimeType: string, size: number, url: string, role: string}>>}
 */
export async function uploadAttachments({ userId, constructId, conversationId, attachments }) {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const results = await Promise.all(
    attachments.map(async (attachment) => {
      const { name, type, data } = attachment;
      
      const uploadResult = await uploadAttachment({
        userId,
        constructId,
        conversationId,
        fileName: name,
        mimeType: type,
        base64Data: data
      });

      const sizeInBytes = data ? Math.ceil((data.length * 3) / 4) : 0;
      const role = type.startsWith('image/') ? 'image' : 
                   type.startsWith('application/pdf') || type.startsWith('text/') ? 'document' : 
                   'other';

      return {
        id: crypto.randomUUID(),
        name,
        mimeType: type,
        size: sizeInBytes,
        url: uploadResult?.url || null,
        role
      };
    })
  );

  return results.filter(r => r.url !== null);
}

/**
 * Delete an attachment from storage
 */
export async function deleteAttachment(storagePath) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([storagePath]);

    if (error) {
      console.error('❌ [AttachmentStorage] Delete failed:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('❌ [AttachmentStorage] Delete error:', error.message);
    return false;
  }
}
