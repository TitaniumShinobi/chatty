/**
 * VVAULT Connector Configuration
 * 
 * Centralized configuration for VVAULT integration
 */

const path = require('path');
const os = require('os');

const DEFAULT_VVAULT_ROOT = process.env.VVAULT_ROOT_PATH ||
    '/Users/devonwoodson/Documents/GitHub/vvault';

/**
 * Default VVAULT configuration
 */
const defaultConfig = {
    // Absolute VVAULT base path
    vvaultPath: DEFAULT_VVAULT_ROOT,
    
    // Directory structure within VVAULT
    directories: {
        users: 'users',
        transcripts: 'transcripts', 
        capsules: 'capsules'
    },
    
    // File naming conventions
    naming: {
        // Transcript files: YYYY-MM-DDTHH-MM-SSZ_role.txt
        transcriptPattern: '{timestamp}_{role}.txt',
        
        // Capsule files: {capsuleId}.json
        capsulePattern: '{capsuleId}.json'
    },
    
    // Security settings
    security: {
        // Ensure append-only writes (flag: 'wx' prevents overwrites)
        appendOnly: true,
        
        // File permissions for created files
        filePermissions: 0o644,
        
        // Directory permissions for created directories  
        dirPermissions: 0o755
    },
    
    // Validation settings
    validation: {
        // Required fields for transcript writes
        requiredTranscriptFields: ['userId', 'sessionId', 'timestamp', 'role', 'content'],
        
        // Valid roles for transcripts
        validRoles: ['user', 'assistant', 'system'],
        
        // Maximum content length (prevent abuse)
        maxContentLength: 100000, // 100KB
        
        // Maximum filename length
        maxFilenameLength: 255
    },
    
    // Error handling
    errorHandling: {
        // Retry attempts for file operations
        maxRetries: 3,
        
        // Retry delay in milliseconds
        retryDelay: 100,
        
        // Whether to create missing directories automatically
        autoCreateDirs: true
    },
    
    // Logging
    logging: {
        // Enable debug logging
        debug: process.env.NODE_ENV === 'development',
        
        // Log file operations
        logFileOps: true,
        
        // Log errors with stack traces
        logStackTraces: true
    }
};

/**
 * Environment-specific configuration overrides
 */
const envConfig = {
    development: {
        logging: {
            debug: true,
            logFileOps: true
        }
    },
    
    production: {
        logging: {
            debug: false,
            logFileOps: false
        },
        
        security: {
            filePermissions: 0o600, // More restrictive in production
            dirPermissions: 0o700
        }
    },
    
    test: {
        vvaultPath: path.join(os.tmpdir(), 'vvault-test'),
        logging: {
            debug: false,
            logFileOps: false
        }
    }
};

/**
 * Get configuration with environment overrides
 * 
 * @param {string} environment - Environment name (development, production, test)
 * @returns {Object} Merged configuration
 */
function getConfig(environment = process.env.NODE_ENV || 'development') {
    const baseConfig = { ...defaultConfig };
    const envOverrides = envConfig[environment] || {};
    
    // Deep merge configuration
    return deepMerge(baseConfig, envOverrides);
}

/**
 * Deep merge two objects
 * 
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                result[key] = deepMerge(target[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
    }
    
    return result;
}

/**
 * Validate configuration
 * 
 * @param {Object} config - Configuration to validate
 * @returns {Object} Validation result
 */
function validateConfig(config) {
    const errors = [];
    const warnings = [];
    
    // Check VVAULT path
    if (!config.vvaultPath) {
        errors.push('vvaultPath is required');
    }
    
    // Check required directories
    const requiredDirs = ['users', 'transcripts', 'capsules'];
    for (const dir of requiredDirs) {
        if (!config.directories[dir]) {
            errors.push(`Directory '${dir}' is required`);
        }
    }
    
    // Check validation settings
    if (!Array.isArray(config.validation.requiredTranscriptFields)) {
        errors.push('requiredTranscriptFields must be an array');
    }
    
    if (!Array.isArray(config.validation.validRoles)) {
        errors.push('validRoles must be an array');
    }
    
    if (config.validation.maxContentLength <= 0) {
        warnings.push('maxContentLength should be positive');
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

module.exports = {
    defaultConfig,
    getConfig,
    validateConfig,
    deepMerge,
    VVAULT_ROOT: DEFAULT_VVAULT_ROOT,
    getUserTranscriptsPath(userId) {
        return path.join(DEFAULT_VVAULT_ROOT, 'users', userId, 'transcripts');
    },
    getSessionPath(userId, sessionId) {
        return path.join(DEFAULT_VVAULT_ROOT, 'users', userId, 'transcripts', sessionId);
    }
};
