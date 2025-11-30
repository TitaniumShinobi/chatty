/**
 * Workspace Context Helper
 * 
 * Gets active file/buffer content from the editor (like Copilot reads code files).
 * This infrastructure is ready for Cursor/editor API integration.
 */

/**
 * Get workspace context (active file/buffer content)
 * 
 * This function can be extended to:
 * 1. Call Cursor/editor API to get active file content
 * 2. Read from file system if running in Node.js
 * 3. Accept context passed from UI
 * 
 * @param options - Options for getting workspace context
 * @returns Workspace context string (file/buffer content) or undefined
 */
export async function getWorkspaceContext(options?: {
  filePath?: string;
  editorContent?: string;
  maxLength?: number;
}): Promise<string | undefined> {
  const maxLength = options?.maxLength || 10000; // Default 10KB limit
  
  // Priority 1: Direct editor content (passed from UI)
  if (options?.editorContent) {
    return options.editorContent.length > maxLength
      ? options.editorContent.substring(0, maxLength) + '...'
      : options.editorContent;
  }
  
  // Priority 2: Fetch from API endpoint (for Cursor/editor integration)
  if (options?.filePath) {
    try {
      const response = await fetch('/api/workspace/context', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          filePath: options.filePath,
          maxLength
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data?.content) {
          return data.content.length > maxLength
            ? data.content.substring(0, maxLength) + '...'
            : data.content;
        }
      }
    } catch (error) {
      console.warn('⚠️ [workspaceContext] Could not fetch workspace context from API:', error);
    }
  }
  
  // Priority 3: Try to get from global editor context (if available)
  // This would be set by Cursor/editor integration
  if (typeof window !== 'undefined' && (window as any).__cursorWorkspaceContext) {
    const context = (window as any).__cursorWorkspaceContext;
    return context.length > maxLength
      ? context.substring(0, maxLength) + '...'
      : context;
  }
  
  // No workspace context available
  return undefined;
}

/**
 * Set workspace context (for Cursor/editor integration)
 * 
 * Cursor can call this to provide active file content:
 * window.__cursorWorkspaceContext = fileContent;
 * 
 * Or use the API endpoint: POST /api/workspace/context
 */
export function setWorkspaceContext(content: string): void {
  if (typeof window !== 'undefined') {
    (window as any).__cursorWorkspaceContext = content;
  }
}

