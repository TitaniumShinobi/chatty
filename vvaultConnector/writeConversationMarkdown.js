/**
 * VVAULT Conversation Markdown Writer
 * 
 * Creates a single .md file per conversation in VVAULT root structure,
 * matching the format of ChatGPT exports (You said: / Synth said:)
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Write or append to conversation markdown file
 * 
 * @param {Object} config - VVAULT configuration
 * @param {Object} params - Conversation parameters
 * @param {string} params.userId - User identifier
 * @param {string} params.sessionId - Session/conversation identifier
 * @param {string} params.title - Conversation title
 * @param {string} params.timestamp - ISO timestamp
 * @param {string} params.role - Message role (user/assistant)
 * @param {string} params.content - Message content
 * @param {string} [params.constructName] - Construct name (e.g., "Synth", "Lin")
 * @returns {Promise<Object>} Write result with file path
 */
async function writeConversationMarkdown(config, params) {
    try {
        // Determine construct ID from userId or use default
        // Format: /vvault/{constructId}/Chatty/{year}/{title}.md
        const constructId = params.constructId || params.userId || 'nova-001';
        const year = new Date(params.timestamp || Date.now()).getFullYear();
        
        // Sanitize title for filename (remove special chars, limit length)
        const sanitizedTitle = sanitizeFilename(params.title || 'Untitled conversation');
        
        // Build directory structure: /vvault/{constructId}/Chatty/{year}/
        const constructDir = path.join(config.vvaultPath, constructId);
        const chattyDir = path.join(constructDir, 'Chatty');
        const yearDir = path.join(chattyDir, year.toString());
        
        // Ensure directories exist
        await ensureDirectoriesExist(yearDir, config);
        
        // Create markdown filename: {title}.md
        const filename = `${sanitizedTitle}.md`;
        const filePath = path.join(yearDir, filename);
        
        // Determine construct name for "said:" format
        const constructName = params.constructName || 
                             (params.sessionId && params.sessionId.includes('synth') ? 'Synth' : null) ||
                             (params.sessionId && params.sessionId.includes('lin') ? 'Lin' : null) ||
                             'Chatty';
        
        // Format message content in ChatGPT style
        let messageContent = '';
        if (params.role === 'user') {
            messageContent = `You said:\n${params.content}\n\n`;
        } else if (params.role === 'assistant') {
            messageContent = `${constructName} said:\n${params.content}\n\n`;
        } else {
            // System messages use metadata format
            messageContent = `---\n**System**: ${params.content}\n---\n\n`;
        }
        
        // Check if file exists - if not, create with header
        let fileExists = false;
        try {
            await fs.access(filePath);
            fileExists = true;
        } catch {
            // File doesn't exist, will create with header
        }
        
        // If file doesn't exist, create with header
        if (!fileExists) {
            const header = generateMarkdownHeader(params, constructName);
            await fs.writeFile(filePath, header + '\n\n', { 
                flag: 'w',
                mode: config.security.filePermissions,
                encoding: 'utf8'
            });
        }
        
        // Append message content to file
        await fs.appendFile(filePath, messageContent, { 
            encoding: 'utf8'
        });
        
        // Log successful write
        if (config.logging.logFileOps) {
            console.log(`📝 Conversation markdown updated: ${filePath}`);
            console.log(`   User: ${params.userId}, Session: ${params.sessionId}`);
            console.log(`   Role: ${params.role}, Content length: ${params.content.length}`);
        }
        
        return {
            success: true,
            filePath,
            filename,
            userId: params.userId,
            sessionId: params.sessionId,
            role: params.role,
            timestamp: params.timestamp,
            contentLength: params.content.length
        };
        
    } catch (error) {
        console.error('❌ Failed to write conversation markdown:', error);
        throw new Error(`Failed to write conversation markdown: ${error.message}`);
    }
}

/**
 * Generate markdown header for new conversation file
 */
function generateMarkdownHeader(params, constructName) {
    const timestamp = new Date(params.timestamp || Date.now());
    const dateStr = timestamp.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    return `# ${params.title || 'Untitled Conversation'}

**Created**: ${dateStr}  
**Session ID**: ${params.sessionId}  
**Construct**: ${constructName}

---`;
}

/**
 * Sanitize filename - remove special chars, limit length
 */
function sanitizeFilename(title) {
    // Remove special characters, keep only alphanumeric, spaces, hyphens, underscores
    let sanitized = title.replace(/[^a-zA-Z0-9\s\-_]/g, '');
    
    // Replace multiple spaces with single space
    sanitized = sanitized.replace(/\s+/g, ' ');
    
    // Trim and limit length (max 100 chars for filename)
    sanitized = sanitized.trim().substring(0, 100);
    
    // Replace spaces with underscores for filename safety
    sanitized = sanitized.replace(/\s/g, '_');
    
    // Ensure it's not empty
    if (!sanitized) {
        sanitized = 'Untitled_conversation';
    }
    
    return sanitized;
}

/**
 * Ensure directories exist with proper permissions
 */
async function ensureDirectoriesExist(dirPath, config) {
    if (!config.errorHandling.autoCreateDirs) {
        return;
    }
    
    try {
        await fs.mkdir(dirPath, { 
            recursive: true,
            mode: config.security.dirPermissions
        });
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error;
        }
    }
}

module.exports = writeConversationMarkdown;

