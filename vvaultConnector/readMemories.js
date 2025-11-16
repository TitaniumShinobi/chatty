/**
 * VVAULT Memory Reader
 * 
 * Handles reading of structured memories (capsules) from VVAULT
 * storage system with filtering and pagination support.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Read memories from VVAULT
 * 
 * @param {Object} config - VVAULT configuration
 * @param {string} userId - User identifier
 * @param {Object} options - Read options
 * @param {number} [options.limit=10] - Maximum number of memories to return
 * @param {string} [options.sessionId] - Optional session filter
 * @param {string} [options.role] - Optional role filter
 * @param {Date} [options.since] - Only return memories since this date
 * @param {Date} [options.until] - Only return memories until this date
 * @returns {Promise<Array>} Array of memory objects
 */
async function readMemories(config, userId, options = {}) {
    // Validate input parameters
    const validation = validateReadParams(userId, options);
    if (!validation.valid) {
        throw new Error(`Invalid read parameters: ${validation.errors.join(', ')}`);
    }

    try {
        // Set default options
        const readOptions = {
            limit: 10,
            sessionId: null,
            role: null,
            since: null,
            until: null,
            ...options
        };

        // Build user path
        const userPath = path.join(config.vvaultPath, config.directories.users, userId);
        
        // Check if user directory exists
        try {
            await fs.access(userPath);
        } catch {
            // User not found, return empty array
            if (config.logging.debug) {
                console.log(`👤 User directory not found: ${userPath}`);
            }
            return [];
        }

        // Read memories from capsules directory
        const capsulesPath = path.join(userPath, config.directories.capsules);
        let memories = [];

        try {
            await fs.access(capsulesPath);
            memories = await readCapsuleMemories(capsulesPath, readOptions, config);
        } catch {
            // No capsules directory, try transcripts as fallback
            if (config.logging.debug) {
                console.log(`📁 No capsules directory found, reading from transcripts: ${capsulesPath}`);
            }
            memories = await readTranscriptMemories(userPath, readOptions, config);
        }

        // Apply filters
        memories = applyMemoryFilters(memories, readOptions);

        // Sort by timestamp (newest first)
        memories.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Apply limit
        if (readOptions.limit > 0) {
            memories = memories.slice(0, readOptions.limit);
        }

        // Log results
        if (config.logging.logFileOps) {
            console.log(`🧠 Retrieved ${memories.length} memories for user: ${userId}`);
            if (readOptions.sessionId) {
                console.log(`   Filtered by session: ${readOptions.sessionId}`);
            }
        }

        return memories;

    } catch (error) {
        console.error('❌ Failed to read memories:', error);
        throw new Error(`Failed to read memories: ${error.message}`);
    }
}

/**
 * Read memories from capsule files
 * 
 * @param {string} capsulesPath - Capsules directory path
 * @param {Object} options - Read options
 * @param {Object} config - Configuration
 * @returns {Promise<Array>} Array of memory objects
 */
async function readCapsuleMemories(capsulesPath, options, config) {
    const memories = [];

    try {
        const files = await fs.readdir(capsulesPath);
        const capsuleFiles = files.filter(f => f.endsWith('.json'));

        for (const filename of capsuleFiles) {
            try {
                const filePath = path.join(capsulesPath, filename);
                const content = await fs.readFile(filePath, 'utf8');
                const capsule = JSON.parse(content);

                // Convert capsule to memory format
                const memory = convertCapsuleToMemory(capsule, filename);
                if (memory) {
                    memories.push(memory);
                }

            } catch (error) {
                console.warn(`⚠️ Failed to read capsule file ${filename}:`, error.message);
                continue;
            }
        }

    } catch (error) {
        console.warn(`⚠️ Failed to read capsules directory:`, error.message);
    }

    return memories;
}

/**
 * Read memories from transcript files (fallback)
 * 
 * @param {string} userPath - User directory path
 * @param {Object} options - Read options
 * @param {Object} config - Configuration
 * @returns {Promise<Array>} Array of memory objects
 */
async function readTranscriptMemories(userPath, options, config) {
    const memories = [];
    const transcriptsPath = path.join(userPath, config.directories.transcripts);

    try {
        await fs.access(transcriptsPath);
    } catch {
        return memories; // No transcripts directory
    }

    try {
        const sessions = await fs.readdir(transcriptsPath);
        
        for (const sessionId of sessions) {
            // Skip if session filter is specified and doesn't match
            if (options.sessionId && sessionId !== options.sessionId) {
                continue;
            }

            const sessionPath = path.join(transcriptsPath, sessionId);
            const stat = await fs.stat(sessionPath);
            
            if (stat.isDirectory()) {
                const sessionMemories = await readSessionTranscripts(sessionPath, sessionId, options, config);
                memories.push(...sessionMemories);
            }
        }

    } catch (error) {
        console.warn(`⚠️ Failed to read transcripts directory:`, error.message);
    }

    return memories;
}

/**
 * Read transcripts from a specific session
 * 
 * @param {string} sessionPath - Session directory path
 * @param {string} sessionId - Session identifier
 * @param {Object} options - Read options
 * @param {Object} config - Configuration
 * @returns {Promise<Array>} Array of memory objects
 */
async function readSessionTranscripts(sessionPath, sessionId, options, config) {
    const memories = [];

    try {
        const files = await fs.readdir(sessionPath);
        const transcriptFiles = files
            .filter(f => f.endsWith('.txt'))
            .sort(); // Sort by filename (timestamp)

        for (const filename of transcriptFiles) {
            try {
                const filePath = path.join(sessionPath, filename);
                const content = await fs.readFile(filePath, 'utf8');
                
                // Parse transcript content
                const transcript = parseTranscriptContent(content, filename);
                if (transcript) {
                    const memory = convertTranscriptToMemory(transcript, sessionId);
                    if (memory) {
                        memories.push(memory);
                    }
                }

            } catch (error) {
                console.warn(`⚠️ Failed to read transcript file ${filename}:`, error.message);
                continue;
            }
        }

    } catch (error) {
        console.warn(`⚠️ Failed to read session directory ${sessionId}:`, error.message);
    }

    return memories;
}

/**
 * Convert capsule to memory format
 * 
 * @param {Object} capsule - Capsule data
 * @param {string} filename - Capsule filename
 * @returns {Object|null} Memory object or null if invalid
 */
function convertCapsuleToMemory(capsule, filename) {
    try {
        // Extract capsule ID from filename
        const capsuleId = path.basename(filename, '.json');
        
        return {
            id: capsuleId,
            type: 'capsule',
            timestamp: capsule.created_ts || capsule.timestamp || new Date().toISOString(),
            content: capsule.raw || capsule.content || '',
            role: capsule.role || 'system',
            metadata: {
                source: 'capsule',
                filename,
                capsuleId,
                tags: capsule.tags || [],
                consent: capsule.consent || 'unknown',
                embedModel: capsule.embed_model,
                hash: capsule.raw_sha256 || capsule.hash
            }
        };
    } catch (error) {
        console.warn(`⚠️ Failed to convert capsule ${filename}:`, error.message);
        return null;
    }
}

/**
 * Parse transcript content
 * 
 * @param {string} content - Transcript content
 * @param {string} filename - Transcript filename
 * @returns {Object|null} Parsed transcript or null if invalid
 */
function parseTranscriptContent(content, filename) {
    try {
        const lines = content.split('\n');
        const transcript = {
            timestamp: null,
            role: null,
            userId: null,
            sessionId: null,
            content: '',
            emotions: null
        };

        // Parse header lines
        for (const line of lines) {
            if (line.startsWith('# Timestamp:')) {
                transcript.timestamp = line.replace('# Timestamp:', '').trim();
            } else if (line.startsWith('# Role:')) {
                transcript.role = line.replace('# Role:', '').trim();
            } else if (line.startsWith('# User:')) {
                transcript.userId = line.replace('# User:', '').trim();
            } else if (line.startsWith('# Session:')) {
                transcript.sessionId = line.replace('# Session:', '').trim();
            } else if (line.startsWith('# Emotions:')) {
                try {
                    const emotionsStr = line.replace('# Emotions:', '').trim();
                    transcript.emotions = JSON.parse(emotionsStr);
                } catch {
                    // Ignore invalid emotions
                }
            } else if (line === '# ---') {
                // Content separator found, rest is content
                const contentStart = lines.indexOf(line) + 1;
                transcript.content = lines.slice(contentStart).join('\n').trim();
                break;
            }
        }

        // Extract timestamp and role from filename if not found in content
        if (!transcript.timestamp || !transcript.role) {
            const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)_(.+)\.txt$/);
            if (match) {
                const [, timestamp, role] = match;
                transcript.timestamp = timestamp.replace(/-/g, ':').replace('T', 'T').replace('Z', 'Z');
                transcript.role = role;
            }
        }

        return transcript;
    } catch (error) {
        console.warn(`⚠️ Failed to parse transcript ${filename}:`, error.message);
        return null;
    }
}

/**
 * Convert transcript to memory format
 * 
 * @param {Object} transcript - Parsed transcript
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Memory object or null if invalid
 */
function convertTranscriptToMemory(transcript, sessionId) {
    try {
        return {
            id: `${sessionId}_${transcript.timestamp}_${transcript.role}`,
            type: 'transcript',
            timestamp: transcript.timestamp,
            content: transcript.content,
            role: transcript.role,
            sessionId: transcript.sessionId || sessionId,
            userId: transcript.userId,
            metadata: {
                source: 'transcript',
                sessionId: transcript.sessionId || sessionId,
                emotions: transcript.emotions,
                contentLength: transcript.content.length
            }
        };
    } catch (error) {
        console.warn(`⚠️ Failed to convert transcript:`, error.message);
        return null;
    }
}

/**
 * Apply filters to memories
 * 
 * @param {Array} memories - Array of memories
 * @param {Object} options - Filter options
 * @returns {Array} Filtered memories
 */
function applyMemoryFilters(memories, options) {
    let filtered = [...memories];

    // Filter by role
    if (options.role) {
        filtered = filtered.filter(m => m.role === options.role);
    }

    // Filter by date range
    if (options.since) {
        const sinceDate = new Date(options.since);
        filtered = filtered.filter(m => new Date(m.timestamp) >= sinceDate);
    }

    if (options.until) {
        const untilDate = new Date(options.until);
        filtered = filtered.filter(m => new Date(m.timestamp) <= untilDate);
    }

    return filtered;
}

/**
 * Validate read parameters
 * 
 * @param {string} userId - User identifier
 * @param {Object} options - Read options
 * @returns {Object} Validation result
 */
function validateReadParams(userId, options) {
    const errors = [];

    // Validate userId
    if (!userId || typeof userId !== 'string') {
        errors.push('userId is required and must be a string');
    }

    // Validate limit
    if (options.limit !== undefined) {
        if (typeof options.limit !== 'number' || options.limit < 0) {
            errors.push('limit must be a non-negative number');
        }
    }

    // Validate date filters
    if (options.since && !isValidDate(options.since)) {
        errors.push('since must be a valid date');
    }

    if (options.until && !isValidDate(options.until)) {
        errors.push('until must be a valid date');
    }

    // Validate role
    if (options.role && typeof options.role !== 'string') {
        errors.push('role must be a string');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Validate date
 * 
 * @param {any} date - Date to validate
 * @returns {boolean} Is valid date
 */
function isValidDate(date) {
    return date instanceof Date && !isNaN(date.getTime());
}

module.exports = readMemories;
