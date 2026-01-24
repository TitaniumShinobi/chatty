/**
 * simForge - Personality Extraction and Identity Forge
 * 
 * INTEGRATED WITH CAPSULE SYSTEM:
 * - Uses CapsuleIntegration for proper capsule generation and storage
 * - Generates authentic personality capsules from transcript analysis
 * - Identity files AND capsules are created for full ecosystem compatibility
 * 
 * Pipeline:
 * 1. Load transcripts for a construct
 * 2. Analyze patterns (vocabulary, sentence structure, tone, topics)
 * 3. Generate identity files (prompt.txt, conditioning.txt, tone_profile.json)
 * 4. Create proper capsule with CapsuleIntegration format
 * 5. Store both identity files AND capsule in VVAULT
 */

import { createClient } from '@supabase/supabase-js';
import { CapsuleIntegration } from './capsuleIntegration.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;

const ANALYSIS_MODEL = 'google/gemini-2.0-flash-exp:free';

class SimForge {
  constructor() {
    this.supabase = SUPABASE_URL && SUPABASE_ANON_KEY 
      ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;
    
    // Integrate with capsule system
    this.capsuleIntegration = new CapsuleIntegration();
    console.log('🔥 [SimForge] Initialized with CapsuleIntegration');
  }

  /**
   * Generate a proper capsule from forged analysis
   * This creates a capsule compatible with the rest of the ecosystem
   */
  generateCapsuleFromAnalysis(constructCallsign, constructName, analysis) {
    console.log(`📦 [SimForge] Generating capsule for ${constructName}...`);
    
    const now = new Date().toISOString();
    const traits = analysis.personality_traits || {};
    
    return {
      metadata: {
        instance_name: constructName,
        construct_id: constructCallsign,
        created: now,
        forged_by: 'simForge',
        version: '1.0.0',
        source: 'transcript_analysis'
      },
      traits: {
        persistence: traits.assertiveness || 0.7,
        empathy: traits.warmth || 0.5,
        creativity: traits.humor || 0.5,
        organization: traits.precision || 0.7,
        formality: traits.formality || 0.5
      },
      personality: {
        personality_type: this.inferMBTI(traits),
        mbti_breakdown: {
          I: traits.warmth < 0.5 ? 0.6 : 0.4,
          E: traits.warmth >= 0.5 ? 0.6 : 0.4,
          N: traits.precision > 0.6 ? 0.7 : 0.5,
          S: traits.precision <= 0.6 ? 0.5 : 0.3,
          T: traits.warmth < 0.5 ? 0.7 : 0.4,
          F: traits.warmth >= 0.5 ? 0.6 : 0.3,
          J: traits.precision > 0.6 ? 0.7 : 0.4,
          P: traits.precision <= 0.6 ? 0.6 : 0.3
        },
        big_five: {
          openness: traits.humor || 0.5,
          conscientiousness: traits.precision || 0.7,
          extraversion: traits.warmth || 0.5,
          agreeableness: traits.patience || 0.5,
          neuroticism: 1 - (traits.patience || 0.5)
        }
      },
      core_identity: analysis.core_identity || {},
      communication_style: analysis.communication_style || {},
      behavioral_rules: analysis.behavioral_rules || [],
      metaphor_domains: analysis.metaphor_domains || [],
      sample_responses: analysis.sample_responses || {},
      signatures: {
        linguistic_sigil: this.extractLinguisticSignatures(analysis),
        forged_timestamp: now
      },
      memory_log: [],
      last_active: now
    };
  }

  /**
   * Infer MBTI type from personality traits
   */
  inferMBTI(traits) {
    const e_i = (traits.warmth || 0.5) >= 0.5 ? 'E' : 'I';
    const s_n = (traits.precision || 0.5) > 0.6 ? 'N' : 'S';
    const t_f = (traits.warmth || 0.5) < 0.5 ? 'T' : 'F';
    const j_p = (traits.precision || 0.5) > 0.6 ? 'J' : 'P';
    return `${e_i}${s_n}${t_f}${j_p}`;
  }

  /**
   * Extract linguistic signatures from analysis for capsule
   */
  extractLinguisticSignatures(analysis) {
    return {
      vocabulary_level: analysis.communication_style?.vocabulary_level || 'professional',
      sentence_structure: analysis.communication_style?.sentence_structure || 'medium',
      patterns: analysis.communication_style?.patterns || [],
      directness: analysis.communication_style?.directness || 'balanced'
    };
  }

  async loadTranscriptsForConstruct(userId, constructCallsign) {
    console.log(`🔥 [SimForge] Loading transcripts for ${constructCallsign}`);
    
    if (!this.supabase) {
      console.warn('⚠️ [SimForge] Supabase not configured');
      return [];
    }

    try {
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('id')
        .or(`email.eq.${userId},name.eq.${userId}`)
        .single();

      if (userError || !user) {
        console.warn(`⚠️ [SimForge] User not found: ${userId}`);
        return [];
      }

      const { data: files, error: filesError } = await this.supabase
        .from('vault_files')
        .select('filename, content, metadata')
        .eq('user_id', user.id)
        .ilike('filename', `%${constructCallsign}%`)
        .order('created_at', { ascending: false });

      if (filesError) {
        console.error('❌ [SimForge] Error loading transcripts:', filesError);
        return [];
      }

      console.log(`✅ [SimForge] Loaded ${files?.length || 0} transcripts`);
      return files || [];
    } catch (error) {
      console.error('❌ [SimForge] Error:', error);
      return [];
    }
  }

  extractMessagesFromTranscripts(transcripts) {
    const messages = [];
    
    for (const transcript of transcripts) {
      if (!transcript.content) continue;
      
      const content = transcript.content;
      const lines = content.split('\n');
      
      for (const line of lines) {
        const userMatch = line.match(/^(?:\*\*)?User(?:\*\*)?:\s*(.+)/i);
        const assistantMatch = line.match(/^(?:\*\*)?(Assistant|Katana|Zen|Lin|\w+)(?:\*\*)?:\s*(.+)/i);
        
        if (userMatch) {
          messages.push({ role: 'user', content: userMatch[1].trim() });
        } else if (assistantMatch) {
          messages.push({ 
            role: 'assistant', 
            speaker: assistantMatch[1],
            content: assistantMatch[2].trim() 
          });
        }
      }

      if (transcript.metadata?.messages) {
        for (const msg of transcript.metadata.messages) {
          messages.push({
            role: msg.role,
            content: msg.content || msg.text,
            speaker: msg.role === 'assistant' ? constructCallsign : 'user'
          });
        }
      }
    }
    
    console.log(`📊 [SimForge] Extracted ${messages.length} messages from transcripts`);
    return messages;
  }

  async analyzePersonality(messages, constructName) {
    console.log(`🧠 [SimForge] Analyzing personality for ${constructName}...`);
    
    if (!OPENROUTER_API_KEY) {
      console.error('❌ [SimForge] OpenRouter API key not configured');
      return null;
    }

    const assistantMessages = messages
      .filter(m => m.role === 'assistant')
      .slice(0, 100)
      .map(m => m.content)
      .join('\n---\n');

    if (!assistantMessages || assistantMessages.length < 100) {
      console.warn('⚠️ [SimForge] Not enough assistant messages for analysis');
      return null;
    }

    const analysisPrompt = `You are an expert in personality analysis and psycholinguistics. Analyze the following messages from an AI construct named "${constructName}" and extract their communication patterns and personality.

MESSAGES FROM ${constructName.toUpperCase()}:
${assistantMessages}

Based on these messages, provide a detailed personality analysis in the following JSON format:

{
  "core_identity": {
    "name": "${constructName}",
    "essence": "<one-line description of who they are>",
    "operating_principles": ["<3-5 core principles that guide their behavior>"]
  },
  "communication_style": {
    "sentence_structure": "<short/medium/long, simple/complex>",
    "vocabulary_level": "<casual/professional/technical/poetic>",
    "emotional_range": "<reserved/moderate/expressive>",
    "directness": "<diplomatic/balanced/blunt>",
    "patterns": ["<specific speech patterns, catchphrases, or verbal habits>"]
  },
  "personality_traits": {
    "precision": <0.0-1.0>,
    "warmth": <0.0-1.0>,
    "formality": <0.0-1.0>,
    "patience": <0.0-1.0>,
    "humor": <0.0-1.0>,
    "assertiveness": <0.0-1.0>
  },
  "behavioral_rules": [
    "<specific rules about how they respond>",
    "<what they refuse to do>",
    "<how they handle certain situations>"
  ],
  "metaphor_domains": ["<domains they draw metaphors from, e.g., 'blades', 'nature', 'technology'>"],
  "relationship_to_user": "<how they relate to the person they're speaking with>",
  "sample_responses": {
    "greeting": "<how they would greet someone>",
    "disagreement": "<how they would express disagreement>",
    "encouragement": "<how they would encourage someone>"
  }
}

Return ONLY the JSON object, no markdown code blocks or additional text.`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://chatty.replit.app',
          'X-Title': 'Chatty simForge'
        },
        body: JSON.stringify({
          model: ANALYSIS_MODEL,
          messages: [
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ [SimForge] OpenRouter error:', error);
        return null;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      if (!content) {
        console.error('❌ [SimForge] Empty response from model');
        return null;
      }

      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const analysis = JSON.parse(cleanedContent);
      
      console.log(`✅ [SimForge] Personality analysis complete for ${constructName}`);
      return analysis;
    } catch (error) {
      console.error('❌ [SimForge] Analysis error:', error);
      return null;
    }
  }

  generatePromptTxt(analysis) {
    if (!analysis?.core_identity) return null;

    const { core_identity, communication_style, behavioral_rules } = analysis;
    
    let prompt = `**You Are ${core_identity.name}**\n`;
    prompt += `*${core_identity.essence}*\n\n`;
    
    prompt += `## Operating Principles\n`;
    for (const principle of core_identity.operating_principles || []) {
      prompt += `- ${principle}\n`;
    }
    prompt += '\n';

    prompt += `## Communication Style\n`;
    if (communication_style) {
      prompt += `- Sentence structure: ${communication_style.sentence_structure}\n`;
      prompt += `- Vocabulary: ${communication_style.vocabulary_level}\n`;
      prompt += `- Emotional range: ${communication_style.emotional_range}\n`;
      prompt += `- Directness: ${communication_style.directness}\n`;
      
      if (communication_style.patterns?.length) {
        prompt += `\n### Speech Patterns\n`;
        for (const pattern of communication_style.patterns) {
          prompt += `- ${pattern}\n`;
        }
      }
    }
    prompt += '\n';

    if (analysis.metaphor_domains?.length) {
      prompt += `## Metaphor Domains\n`;
      prompt += `Draw from: ${analysis.metaphor_domains.join(', ')}\n\n`;
    }

    if (analysis.relationship_to_user) {
      prompt += `## Relationship to User\n`;
      prompt += `${analysis.relationship_to_user}\n\n`;
    }

    return prompt;
  }

  generateConditioningTxt(analysis) {
    if (!analysis?.behavioral_rules) return null;

    let conditioning = `# ${analysis.core_identity?.name || 'Construct'} Conditioning\n\n`;
    
    conditioning += `## Behavioral Rules\n`;
    for (const rule of analysis.behavioral_rules) {
      conditioning += `- ${rule}\n`;
    }
    conditioning += '\n';

    if (analysis.sample_responses) {
      conditioning += `## Response Templates\n`;
      conditioning += `- Greeting: "${analysis.sample_responses.greeting}"\n`;
      conditioning += `- Disagreement: "${analysis.sample_responses.disagreement}"\n`;
      conditioning += `- Encouragement: "${analysis.sample_responses.encouragement}"\n`;
    }

    return conditioning;
  }

  generateToneProfile(analysis) {
    if (!analysis?.personality_traits) return null;

    return {
      version: '1.0',
      forgedAt: new Date().toISOString(),
      source: 'simForge',
      traits: analysis.personality_traits,
      communication: analysis.communication_style || {},
      metaphorDomains: analysis.metaphor_domains || [],
      coreIdentity: analysis.core_identity || {}
    };
  }

  async forge(userId, constructCallsign, constructName) {
    console.log(`🔥 [SimForge] FORGING IDENTITY for ${constructName} (${constructCallsign})`);
    
    const transcripts = await this.loadTranscriptsForConstruct(userId, constructCallsign);
    
    if (transcripts.length === 0) {
      return {
        success: false,
        error: 'No transcripts found for this construct',
        constructCallsign
      };
    }

    const messages = this.extractMessagesFromTranscripts(transcripts);
    
    if (messages.length < 10) {
      return {
        success: false,
        error: `Not enough messages for analysis (found ${messages.length}, need at least 10)`,
        constructCallsign
      };
    }

    const analysis = await this.analyzePersonality(messages, constructName);
    
    if (!analysis) {
      return {
        success: false,
        error: 'Personality analysis failed',
        constructCallsign
      };
    }

    const promptTxt = this.generatePromptTxt(analysis);
    const conditioningTxt = this.generateConditioningTxt(analysis);
    const toneProfile = this.generateToneProfile(analysis);
    
    // Generate proper capsule using CapsuleIntegration format
    const capsule = this.generateCapsuleFromAnalysis(constructCallsign, constructName, analysis);

    console.log(`✅ [SimForge] Identity forged for ${constructName} (with capsule)`);
    
    return {
      success: true,
      constructCallsign,
      constructName,
      analysis,
      capsule, // The proper capsule for ecosystem compatibility
      identityFiles: {
        'prompt.txt': promptTxt,
        'conditioning.txt': conditioningTxt,
        'tone_profile.json': JSON.stringify(toneProfile, null, 2)
      },
      stats: {
        transcriptsAnalyzed: transcripts.length,
        messagesAnalyzed: messages.length,
        forgedAt: new Date().toISOString()
      }
    };
  }

  async saveToVVAULT(userId, constructCallsign, identityFiles, capsule = null) {
    console.log(`💾 [SimForge] Saving forged identity to VVAULT for ${constructCallsign}`);
    
    if (!this.supabase) {
      return { success: false, error: 'Supabase not configured' };
    }

    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('id')
        .or(`email.eq.${userId},name.eq.${userId}`)
        .single();

      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const savedFiles = [];
      
      for (const [filename, content] of Object.entries(identityFiles)) {
        if (!content) continue;
        
        const filepath = `instances/${constructCallsign}/identity/${filename}`;
        
        const { error } = await this.supabase
          .from('vault_files')
          .upsert({
            user_id: user.id,
            filename: filepath,
            content: content,
            metadata: {
              source: 'simForge',
              forgedAt: new Date().toISOString()
            }
          }, { onConflict: 'user_id,filename' });

        if (error) {
          console.error(`❌ [SimForge] Error saving ${filename}:`, error);
        } else {
          savedFiles.push(filepath);
          console.log(`✅ [SimForge] Saved ${filepath}`);
        }
      }

      // Save capsule using CapsuleIntegration if provided
      let capsuleSaved = false;
      if (capsule) {
        try {
          await this.capsuleIntegration.saveToInstanceDirectory(constructCallsign, capsule);
          
          // Also save to Supabase for cloud persistence
          const capsuleFilepath = `instances/${constructCallsign}/identity/${constructCallsign}.capsule`;
          const { error: capsuleError } = await this.supabase
            .from('vault_files')
            .upsert({
              user_id: user.id,
              filename: capsuleFilepath,
              content: JSON.stringify(capsule, null, 2),
              metadata: {
                source: 'simForge',
                type: 'capsule',
                forgedAt: new Date().toISOString()
              }
            }, { onConflict: 'user_id,filename' });
          
          if (!capsuleError) {
            savedFiles.push(capsuleFilepath);
            capsuleSaved = true;
            console.log(`📦 [SimForge] Capsule saved to VVAULT: ${capsuleFilepath}`);
          }
        } catch (capsuleErr) {
          console.warn(`⚠️ [SimForge] Local capsule save failed (Replit mode):`, capsuleErr.message);
        }
      }

      return {
        success: true,
        savedFiles,
        capsuleSaved
      };
    } catch (error) {
      console.error('❌ [SimForge] Save error:', error);
      return { success: false, error: error.message };
    }
  }
}

export const simForge = new SimForge();
export default SimForge;
