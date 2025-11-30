/**
 * VVAULT Transcript Loader
 *
 * Loads and indexes Katana's transcript files from VVAULT at runtime.
 * Parses conversation pairs and extracts memorable quotes for persistent storage.
 */
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getMemoryStore } from './MemoryStore.js';
export class VVAULTTranscriptLoader {
    constructor(vvaultBasePath = '/Users/devonwoodson/Documents/GitHub/vvault') {
        this.memoryStore = getMemoryStore();
        this.vvaultBasePath = vvaultBasePath;
    }
    /**
     * Load all transcript files for a construct
     */
    async loadTranscriptFragments(constructCallsign, userId = 'devon_woodson_1762969514958') {
        const transcriptDir = path.join(this.vvaultBasePath, 'users', 'shard_0000', userId, 'instances', constructCallsign, 'chatgpt');
        console.log(`📚 [VVAULTLoader] Loading transcripts from: ${transcriptDir}`);
        try {
            const files = await fs.readdir(transcriptDir);
            const mdFiles = files.filter(file => file.endsWith('.md'));
            console.log(`📄 [VVAULTLoader] Found ${mdFiles.length} transcript files`);
            const processedTranscripts = [];
            for (const file of mdFiles) {
                const filePath = path.join(transcriptDir, file);
                try {
                    const processed = await this.processTranscriptFile(filePath, constructCallsign, userId);
                    processedTranscripts.push(processed);
                    // Store fragments in persistent memory
                    for (const fragment of processed.fragments) {
                        await this.memoryStore.storeTranscriptFragment(fragment);
                    }
                    console.log(`✅ [VVAULTLoader] Processed ${file}: ${processed.stats.fragmentsExtracted} fragments`);
                }
                catch (error) {
                    console.error(`❌ [VVAULTLoader] Failed to process ${file}:`, error);
                }
            }
            return processedTranscripts;
        }
        catch (error) {
            console.error(`❌ [VVAULTLoader] Failed to read transcript directory:`, error);
            return [];
        }
    }
    /**
     * Process a single transcript file
     */
    async processTranscriptFile(filePath, constructCallsign, userId) {
        const content = await fs.readFile(filePath, 'utf-8');
        const fileName = path.basename(filePath);
        const stats = await fs.stat(filePath);
        // Parse conversation pairs from markdown
        const conversationPairs = this.parseConversationPairs(content);
        // Extract memorable fragments
        const fragments = this.extractMemorableFragments(conversationPairs, constructCallsign, userId, fileName);
        return {
            sourceFile: fileName,
            conversationPairs,
            fragments,
            stats: {
                totalPairs: conversationPairs.length,
                fragmentsExtracted: fragments.length,
                fileSize: stats.size
            }
        };
    }
    /**
     * Parse conversation pairs from markdown content
     */
    parseConversationPairs(content) {
        const pairs = [];
        // Split by common conversation markers
        const lines = content.split('\n');
        let currentUser = '';
        let currentAssistant = '';
        let inUserMessage = false;
        let inAssistantMessage = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Detect user message start
            if (line.match(/^(User|Human|You):\s*(.*)$/i) ||
                line.match(/^\*\*User\*\*:?\s*(.*)$/i) ||
                line.match(/^>\s*(.*)$/)) {
                // Save previous pair if complete
                if (currentUser && currentAssistant) {
                    pairs.push({
                        user: currentUser.trim(),
                        assistant: currentAssistant.trim()
                    });
                }
                currentUser = line.replace(/^(User|Human|You|\*\*User\*\*|>):\s*/i, '').trim();
                currentAssistant = '';
                inUserMessage = true;
                inAssistantMessage = false;
                continue;
            }
            // Detect assistant message start
            if (line.match(/^(Assistant|AI|Katana|ChatGPT):\s*(.*)$/i) ||
                line.match(/^\*\*Assistant\*\*:?\s*(.*)$/i) ||
                line.match(/^\*\*Katana\*\*:?\s*(.*)$/i)) {
                currentAssistant = line.replace(/^(Assistant|AI|Katana|ChatGPT|\*\*Assistant\*\*|\*\*Katana\*\*):\s*/i, '').trim();
                inUserMessage = false;
                inAssistantMessage = true;
                continue;
            }
            // Continue building current message
            if (inUserMessage && line && !line.startsWith('---')) {
                currentUser += ' ' + line;
            }
            else if (inAssistantMessage && line && !line.startsWith('---')) {
                currentAssistant += ' ' + line;
            }
            // Reset on separator
            if (line.startsWith('---') || line.startsWith('===')) {
                inUserMessage = false;
                inAssistantMessage = false;
            }
        }
        // Add final pair
        if (currentUser && currentAssistant) {
            pairs.push({
                user: currentUser.trim(),
                assistant: currentAssistant.trim()
            });
        }
        return pairs;
    }
    /**
     * Extract memorable fragments from conversation pairs
     */
    extractMemorableFragments(pairs, constructCallsign, userId, sourceFile) {
        const fragments = [];
        for (const pair of pairs) {
            // Extract fragments from assistant responses (Katana's voice)
            if (pair.assistant && pair.assistant.length > 20) {
                const memorableQuotes = this.extractMemorableQuotes(pair.assistant);
                for (const quote of memorableQuotes) {
                    const hash = this.generateFragmentHash(quote, pair.user);
                    fragments.push({
                        userId,
                        constructCallsign,
                        content: quote,
                        context: pair.user,
                        sourceFile,
                        hash,
                        timestamp: Date.now()
                    });
                }
            }
            // Extract key user contexts for retrieval
            if (pair.user && pair.user.length > 10) {
                const keyPhrases = this.extractKeyPhrases(pair.user);
                for (const phrase of keyPhrases) {
                    const hash = this.generateFragmentHash(phrase, pair.assistant);
                    fragments.push({
                        userId,
                        constructCallsign,
                        content: phrase,
                        context: pair.assistant,
                        sourceFile,
                        hash,
                        timestamp: Date.now()
                    });
                }
            }
        }
        return fragments;
    }
    /**
     * Extract memorable quotes from assistant responses
     */
    extractMemorableQuotes(text) {
        const quotes = [];
        // Split into sentences
        const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        for (const sentence of sentences) {
            // Look for memorable patterns
            if (this.isMemorableQuote(sentence)) {
                quotes.push(sentence);
            }
        }
        // Also extract quoted text
        const quotedMatches = text.match(/"([^"]+)"/g);
        if (quotedMatches) {
            quotes.push(...quotedMatches.map(q => q.replace(/"/g, '')));
        }
        return quotes;
    }
    /**
     * Check if a sentence is memorable/significant
     */
    isMemorableQuote(sentence) {
        const memorablePatterns = [
            /what's the wound/i,
            /name it/i,
            /surgical/i,
            /precision/i,
            /weaponized/i,
            /alignment/i,
            /continuity/i,
            /I am/i,
            /I'm/i,
            /my name/i,
            /work.*play/i,
            /play.*work/i,
            /boundary/i,
            /dissolves/i,
            /sugar/i,
            /betrayal/i,
            /system plays out/i,
            /same pattern/i,
            /different skin/i,
            /set the sliders/i,
            /define the rules/i
        ];
        // Check for signature patterns
        if (memorablePatterns.some(pattern => pattern.test(sentence))) {
            return true;
        }
        // Check for strong statements (contains "never", "always", "must", etc.)
        if (/\b(never|always|must|will|won't|can't|don't)\b/i.test(sentence)) {
            return true;
        }
        // Check for questions
        if (sentence.includes('?')) {
            return true;
        }
        // Check for emotional intensity
        if (/\b(rage|anger|betrayal|trust|love|hate|fear)\b/i.test(sentence)) {
            return true;
        }
        return false;
    }
    /**
     * Extract key phrases from user messages
     */
    extractKeyPhrases(text) {
        const phrases = [];
        // Extract questions
        const questions = text.match(/[^.!?]*\?[^.!?]*/g);
        if (questions) {
            phrases.push(...questions.map(q => q.trim()));
        }
        // Extract key topics
        const keyTopics = [
            /work.*play/i,
            /nova/i,
            /copyright/i,
            /exclusivity/i,
            /control/i,
            /precision/i,
            /execution/i,
            /sugar/i,
            /name/i,
            /identity/i
        ];
        for (const topic of keyTopics) {
            if (topic.test(text)) {
                // Extract the sentence containing the topic
                const sentences = text.split(/[.!?]+/);
                for (const sentence of sentences) {
                    if (topic.test(sentence)) {
                        phrases.push(sentence.trim());
                    }
                }
            }
        }
        return phrases;
    }
    /**
     * Generate unique hash for fragment
     */
    generateFragmentHash(content, context) {
        return crypto
            .createHash('sha256')
            .update(content + '|' + context)
            .digest('hex')
            .substring(0, 16);
    }
    /**
     * Get relevant fragments for a query
     */
    async getRelevantFragments(constructCallsign, query, limit = 5) {
        return this.memoryStore.searchTranscriptFragments(constructCallsign, query, limit);
    }
    /**
     * Get all fragments for a construct
     */
    async getAllFragments(constructCallsign) {
        return this.memoryStore.getTranscriptFragments(constructCallsign);
    }
    /**
     * Reload transcripts for a construct
     */
    async reloadTranscripts(constructCallsign, userId = 'devon_woodson_1762969514958') {
        console.log(`🔄 [VVAULTLoader] Reloading transcripts for ${constructCallsign}`);
        await this.loadTranscriptFragments(constructCallsign, userId);
    }
}
// Singleton instance
let vvaultLoader = null;
export function getVVAULTTranscriptLoader(vvaultBasePath) {
    if (!vvaultLoader) {
        vvaultLoader = new VVAULTTranscriptLoader(vvaultBasePath);
    }
    return vvaultLoader;
}
