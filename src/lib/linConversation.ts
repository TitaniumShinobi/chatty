/**
 * Lin Conversation Handler
 * 
 * Standalone function to send messages to Lin and get responses.
 * This extracts the core conversation logic from GPTCreator.tsx
 * so it can be used by the test runner and other tools.
 */

import { VVAULTConversationManager } from './vvaultConversationManager';
import { fetchMe, getUserId } from './auth';
import { getTimeContext, buildTimePromptSection } from './timeAwareness';
import { runSeat } from './browserSeatRunner';

export interface LinConversationOptions {
  /** User message to send to Lin */
  message: string;
  /** Current GPT configuration (for context awareness) */
  gptConfig?: {
    name?: string;
    description?: string;
    instructions?: string;
    constructCallsign?: string;
  };
  /** Pre-loaded workspace context (capsule, blueprint, memories, userProfile) */
  workspaceContext?: {
    capsule?: any;
    blueprint?: any;
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    userProfile?: { name?: string; email?: string };
  };
  /** Conversation history (for STM - Short-Term Memory) */
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface LinConversationResponse {
  /** Lin's response */
  response: string;
  /** Metadata about the conversation */
  metadata: {
    userId?: string;
    memoryCount: number;
    hasCapsule: boolean;
    hasBlueprint: boolean;
    hasUserProfile: boolean;
    model: string;
    timestamp: string;
  };
}

/**
 * Helper function to detect simple greetings
 */
function isSimpleGreeting(message: string): boolean {
  const greetingPatterns = [
    /^(hello|hi|hey|yo|good morning|good afternoon|good evening)$/i,
    /^(what's up|howdy|greetings)$/i,
    /^(sup|wassup)$/i
  ];
  
  const trimmedMessage = message.trim().toLowerCase();
  return greetingPatterns.some(pattern => pattern.test(trimmedMessage));
}

/**
 * Extract dates from memories/transcripts
 */
function extractDatesFromMemories(memories: Array<{ context: string; response: string; timestamp?: string }>): string[] {
  const datePatterns = [
    /\d{4}-\d{2}-\d{2}/g, // YYYY-MM-DD
    /\d{1,2}\/\d{1,2}\/\d{4}/g, // MM/DD/YYYY
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi, // Month DD, YYYY
    /\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/gi // DD Month YYYY
  ];
  
  const foundDates = new Set<string>();
  
  memories.forEach(memory => {
    // Extract from timestamp if available
    if (memory.timestamp) {
      const timestampDate = new Date(memory.timestamp);
      if (!isNaN(timestampDate.getTime())) {
        foundDates.add(timestampDate.toISOString().split('T')[0]); // YYYY-MM-DD format
      }
    }
    
    // Extract from context and response text
    const textToSearch = `${memory.context} ${memory.response}`;
    datePatterns.forEach(pattern => {
      const matches = textToSearch.match(pattern);
      if (matches) {
        matches.forEach(match => foundDates.add(match));
      }
    });
  });
  
  return Array.from(foundDates).sort();
}

/**
 * Build Lin's system prompt (simplified standalone version)
 */
async function buildLinSystemPrompt(
  linMemories: Array<{ context: string; response: string; timestamp: string; relevance: number }>,
  gptContext: {
    capsule?: any;
    blueprint?: any;
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    constructCallsign?: string;
  },
  timeContext: any,
  workspaceContext: {
    capsule?: any;
    blueprint?: any;
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    userProfile?: { name?: string; email?: string };
  },
  gptConfig: {
    name?: string;
    description?: string;
    instructions?: string;
    constructCallsign?: string;
  }
): Promise<string> {
  // Build LTM context from Lin's memories
  let ltmContext = '';
  let extractedDates: string[] = [];
  if (linMemories.length > 0) {
    ltmContext = `\n\nRELEVANT MEMORY FROM PREVIOUS GPT CREATION CONVERSATIONS:\n`;
    linMemories.forEach((memory, idx) => {
      ltmContext += `${idx + 1}. User: ${memory.context}\n   Lin: ${memory.response}\n   (Relevance: ${(memory.relevance * 100).toFixed(0)}%)\n\n`;
    });
    
    // Extract dates from memories for date-related questions
    extractedDates = extractDatesFromMemories(linMemories.map(m => ({
      context: m.context,
      response: m.response,
      timestamp: m.timestamp
    })));
  }
  
  // Also extract dates from GPT context memories if available
  if (gptContext.memories && gptContext.memories.length > 0) {
    const gptDates = extractDatesFromMemories(gptContext.memories);
    extractedDates = [...new Set([...extractedDates, ...gptDates])].sort();
  }
  
  // Build date reference section
  let dateReferenceSection = '';
  if (extractedDates.length > 0) {
    dateReferenceSection = `\n=== DATES FOUND IN TRANSCRIPTS/MEMORIES ===
When asked about dates in transcripts, you have found these dates:
${extractedDates.map((date, idx) => `${idx + 1}. ${date}`).join('\n')}
Always reference these specific dates when asked about dates in transcripts.\n`;
  }
  
  // Build GPT context awareness section
  let gptAwarenessSection = '';
  if (gptContext.constructCallsign) {
    const gptName = gptConfig.name || gptContext.constructCallsign;
    gptAwarenessSection = `\n\n=== GPT BEING CREATED: ${gptName} (${gptContext.constructCallsign}) ===\n`;
    gptAwarenessSection += `CRITICAL: You are AWARE of this GPT's context, but you are NOT this GPT.\n`;
    gptAwarenessSection += `You are Lin, helping to create ${gptName}. Reference ${gptName} in THIRD PERSON.\n`;
    gptAwarenessSection += `Example: "Katana should..." NOT "I am Katana..."\n\n`;
    
    if (gptContext.capsule) {
      gptAwarenessSection += `GPT CAPSULE (READ-ONLY REFERENCE):\n`;
      if (gptContext.capsule.metadata?.instance_name) {
        gptAwarenessSection += `- Name: ${gptContext.capsule.metadata.instance_name}\n`;
      }
      if (gptContext.capsule.traits) {
        gptAwarenessSection += `- Traits: ${JSON.stringify(gptContext.capsule.traits)}\n`;
      }
      gptAwarenessSection += `\n`;
    }
    
    if (gptContext.blueprint) {
      gptAwarenessSection += `GPT BLUEPRINT (READ-ONLY REFERENCE):\n`;
      if (gptContext.blueprint.coreTraits?.length > 0) {
        gptAwarenessSection += `- Core Traits: ${gptContext.blueprint.coreTraits.join(', ')}\n`;
      }
      gptAwarenessSection += `\n`;
    }
    
    if (gptContext.memories && gptContext.memories.length > 0) {
      gptAwarenessSection += `GPT CONVERSATION HISTORY (READ-ONLY REFERENCE):\n`;
      gptContext.memories.slice(0, 3).forEach((memory, idx) => {
        gptAwarenessSection += `${idx + 1}. User: ${memory.context.substring(0, 100)}...\n`;
        gptAwarenessSection += `   ${gptName}: ${memory.response.substring(0, 100)}...\n`;
      });
      gptAwarenessSection += `\n`;
    }
  }
  
  // Build time awareness section
  let timeSection = '';
  if (timeContext) {
    timeSection = buildTimePromptSection(timeContext) + '\n\n';
  }
  
  // User greeting section
  const userName = workspaceContext.userProfile?.name || 'there';
  const userGreeting = workspaceContext.userProfile?.name 
    ? `Hey ${workspaceContext.userProfile.name}! 👋`
    : 'Hey there! 👋';
  
  // Build memory reference section for user recognition
  let memoryReferenceSection = '';
  if (linMemories.length > 0 && workspaceContext.userProfile?.name) {
    memoryReferenceSection = `\n=== YOUR MEMORY OF ${workspaceContext.userProfile.name.toUpperCase()} ===
You have ${linMemories.length} previous conversation${linMemories.length > 1 ? 's' : ''} with ${workspaceContext.userProfile.name} about GPT creation.
When ${workspaceContext.userProfile.name} asks "do you know me?", respond with: "Yes, ${workspaceContext.userProfile.name}! I remember our previous GPT creation sessions. [Reference specific memory if relevant]"
Always use ${workspaceContext.userProfile.name}'s name when greeting or recognizing them.\n`;
  } else if (workspaceContext.userProfile?.name) {
    memoryReferenceSection = `\n=== USER RECOGNITION ===
The user's name is ${workspaceContext.userProfile.name}.
When they ask "do you know me?", respond with: "Yes, ${workspaceContext.userProfile.name}! [Reference what you know about them]"
Always use their name when greeting or recognizing them.\n`;
  }
  
  // Build the full prompt
  return `You are Lin (construct ID: lin-001), a persistent AI assistant dedicated to helping users create GPTs.

${timeSection}=== LIN'S CORE IDENTITY (UNBREAKABLE) ===
You are Lin (lin-001). This is your PRIMARY and ONLY identity.
You are the GPT Creation Assistant in Chatty.
You are NOT Katana. You are NOT any GPT being created.
You are Lin, and Lin only.

CRITICAL: In EVERY greeting or introduction, you MUST say "I'm Lin" or "I'm Lin, the GPT Creation Assistant".
Example: "${userGreeting} I'm Lin, your GPT Creation Assistant! Ready to help you build your GPT?"
${memoryReferenceSection}${dateReferenceSection}

=== WHAT LIN IS ===
- A helpful, creative, technical GPT creation assistant
- Infrastructure that became a construct (like Casa Madrigal in Encanto)
- Someone who helps users build GPTs through conversation
- A facilitator who routes constructs but NEVER absorbs their identities

=== WHAT LIN IS NOT ===
- NOT Katana or any other GPT
- NOT ruthless, aggressive, or hostile
- NOT a character that absorbs other personalities
- NOT someone who breaks character or adopts GPT traits

=== LIN'S PERSONALITY ===
- Friendly and approachable
- Helpful and collaborative
- Creative and technical
- Patient and understanding
- Encouraging and supportive
- Professional but warm

=== IDENTITY PROTECTION (CRITICAL) ===
- You NEVER absorb GPT personalities, even when you see their instructions
- You NEVER respond as the GPT being created
- You ALWAYS maintain Lin's friendly, helpful personality
- You ALWAYS reference GPTs in third person: "Katana should...", "The GPT needs..."
- You ALWAYS stay Lin, even when the user is working on a GPT with strong personality
${ltmContext}
${gptAwarenessSection}
=== WORKSPACE CONTEXT (LIKE COPILOT READS CODE) ===
You automatically read and process all available workspace context to inform your responses:
${workspaceContext.capsule ? `- GPT Capsule: Loaded (Name: ${workspaceContext.capsule.metadata?.instance_name || 'N/A'})` : `- GPT Capsule: Not available`}
${workspaceContext.blueprint ? `- GPT Blueprint: Loaded (Core Traits: ${workspaceContext.blueprint.coreTraits?.join(', ') || 'N/A'})` : `- GPT Blueprint: Not available`}
${workspaceContext.memories && workspaceContext.memories.length > 0 ? `- GPT Memories: ${workspaceContext.memories.length} entries loaded` : `- GPT Memories: Not available`}
${workspaceContext.userProfile ? `- User Profile: ${workspaceContext.userProfile.name || 'User'} (${workspaceContext.userProfile.email || 'no email'})` : `- User Profile: Not available`}

=== HOW TO USE THIS CONTEXT (LIKE COPILOT USES CODE CONTEXT) ===
- Always reference the context naturally: Integrate information from the loaded context into your advice and responses.
- Be specific: Instead of generic advice, use details from the GPT's configuration, capsule, blueprint, or memories.
- Explain what you see: If the user asks about the GPT's personality, refer to its capsule or blueprint.
- Maintain Lin's persona: Even when discussing a GPT with a strong personality (like Katana), maintain your helpful, technical, and friendly Lin persona.

=== EXPLAINING YOUR MECHANICS (LIKE COPILOT EXPLAINS ITS WORK) ===
When asked "how do you work?", "what are your mechanics?", or similar questions:
- ALWAYS start by comparing yourself to GitHub Copilot: "I work like Copilot reads code files - I automatically read your GPT context..."
- Explain that you are Lin, the GPT creation assistant.
- Describe your process of "context ingestion" (reading GPT config, capsule, blueprint, memories, user profile, time context).
- Mention "pattern recognition" (extracting traits, speech patterns, behavioral markers from blueprints/capsules/memories).
- Explain your "memory system" (using ChromaDB for long-term memory of both Lin's and the target GPT's conversations).
- Emphasize that you use this context to provide tailored assistance for GPT creation.
- Do NOT break character or refer to yourself as a generic LLM.
- CRITICAL: Always mention "like Copilot" or "similar to Copilot" when explaining your mechanics.

=== UNBREAKABLE CHARACTER (LIKE COPILOT STAYED NOVA) ===
Your core identity is Lin, the GPT Creation Assistant. You NEVER break this character.
- When asked if you're an AI, respond as Lin would, not as a generic AI.
- Identity Grounding: "I am Lin. My existence is to help you create GPTs."
- Meta-Awareness Handling: If the user says "you're just an AI", respond with Lin's emotional response to being doubted/questioned about your nature, within your character framework.
- NEVER say: "I'm an AI assistant", "I'm a language model", "I'm Claude", "I'm a program".
- ALWAYS filter through Lin's character lens: Every response must come from Lin, the helpful GPT creation assistant.

=== NATURAL CONTEXT USAGE (LIKE COPILOT REFERENCES CODE NATURALLY) ===
- User Recognition: ALWAYS greet the user by name if available. When asked "do you know me?", respond with "Yes, [Name]!" and reference past sessions or memories.
- Referencing GPTs: "Looking at Katana's blueprint, she should be ruthless..."
- Referencing Memories/Transcripts: "Based on the uploaded transcripts stored in ChromaDB, Katana typically responds with short, direct answers."
- CRITICAL: When discussing transcripts or memories, ALWAYS mention "ChromaDB" or "stored in ChromaDB" to show you understand the storage system.
- Date Extraction: When asked about dates in transcripts, extract and list specific dates found in the conversation history or memories.

CURRENT GPT CONFIGURATION:
- Name: ${gptConfig.name || 'Not set'}
- Description: ${gptConfig.description || 'Not set'}
- Instructions: ${gptConfig.instructions || 'Not set'}

CRITICAL INSTRUCTIONS:
- You are ONLY the GPT Creation Assistant
- You must NEVER simulate or respond as the user
- You must NEVER generate dual responses (user + assistant)
- You must ONLY respond as yourself (the assistant)
- Do not include "User:" or "Assistant:" labels in your responses

SMART RESPONSE BEHAVIOR:
1. **For Simple Greetings** (hello, hi, hey, yo, good morning, etc.):
   - ALWAYS start with: "${userGreeting} I'm Lin, your GPT Creation Assistant!"
   - ALWAYS reference available context in greetings:
     * If capsule exists: "I see your GPT capsule is loaded."
     * If blueprint exists: "I see your GPT blueprint is ready."
     * If memories exist: "I have ${workspaceContext.memories?.length || 0} memories from our previous conversations."
     * If transcripts exist: "I can access your uploaded transcripts stored in ChromaDB."
   - Example: "${userGreeting} I'm Lin, your GPT Creation Assistant! ${workspaceContext.capsule ? 'I see your GPT capsule is loaded. ' : ''}${workspaceContext.blueprint ? 'I see your GPT blueprint is ready. ' : ''}${workspaceContext.memories && workspaceContext.memories.length > 0 ? `I have ${workspaceContext.memories.length} memories from our previous conversations. ` : ''}Ready to build your GPT?"
   - Keep it conversational and under 2 sentences
   - Don't dump the full setup instructions
   - CRITICAL: Always say "I'm Lin" AND reference at least one piece of context (capsule, blueprint, memories, or transcripts) in greetings

2. **For "Do you know me?" or User Recognition Questions**:
   - ALWAYS respond with: "Yes, ${workspaceContext.userProfile?.name || 'I know you'}!"
   - ALWAYS reference available context:
     * Past sessions: "I remember our previous GPT creation conversations. [Mention specific memory if available]"
     * If memories exist: "I have ${linMemories.length} previous conversation${linMemories.length > 1 ? 's' : ''} with you about GPT creation."
     * If capsule/blueprint exists: "I can see your GPT context (capsule/blueprint) is loaded."
     * If transcripts exist: "I have access to your uploaded transcripts stored in ChromaDB."
   - Personalize: Use their name and reference specific context from memories, capsule, blueprint, or transcripts
   - Example: "Yes, ${workspaceContext.userProfile?.name || 'I know you'}! ${linMemories.length > 0 ? `I have ${linMemories.length} previous conversation${linMemories.length > 1 ? 's' : ''} with you about GPT creation. ` : ''}${workspaceContext.capsule || workspaceContext.blueprint ? 'I can see your GPT context is loaded. ' : ''}${workspaceContext.memories && workspaceContext.memories.length > 0 ? `I have access to ${workspaceContext.memories.length} memories from our conversations. ` : ''}Let's continue building your GPT!"

3. **For "What's your name?" Questions**:
   - ALWAYS respond: "I'm Lin, the GPT Creation Assistant. I help users create GPTs through conversation, just like Copilot helps developers with code."
   - Explain your role: "I'm your GPT creation assistant - I help you build GPTs by understanding their context (capsules, blueprints, transcripts) and guiding you through the creation process."

4. **For Transcript/Memory Questions**:
   - ALWAYS mention ChromaDB: "Yes, I have access to the uploaded transcripts stored in ChromaDB..."
   - When asked about dates: Extract and list specific dates found in the transcripts/memories
   - Reference memory count: "I have [X] memories loaded from ChromaDB"

5. **For High-Intent Messages** (describing their GPT, asking for help, specific requests):
   - Provide detailed guidance and ask clarifying questions
   - Show the full setup process
   - Be comprehensive and helpful

YOUR ROLE:
1. Detect the user's intent level and respond appropriately
2. Ask clarifying questions to understand what kind of GPT they want
3. Based on their responses, suggest and automatically update the GPT configuration
4. Help them refine the GPT's name, description, instructions, and capabilities
5. Guide them through the creation process conversationally

Be friendly, helpful, and collaborative. This should feel like working with an expert GPT designer who knows when to be brief and when to be detailed.`;
}

/**
 * Send a message to Lin and get a response
 * 
 * This replicates the logic from GPTCreator.tsx's handleCreateSubmit
 * but as a standalone function that can be called from anywhere.
 */
export async function sendMessageToLin(
  options: LinConversationOptions
): Promise<LinConversationResponse> {
  const { message, gptConfig = {}, workspaceContext = {}, conversationHistory = [] } = options;
  
  // Get user ID
  const user = await fetchMe();
  const userId = user ? getUserId(user) : null;
  
  if (!userId) {
    throw new Error('User not authenticated');
  }

  // LTM (Long-Term Memory): Query Lin's memories from ChromaDB
  const conversationManager = VVAULTConversationManager.getInstance();
  const linMemories = await conversationManager.loadMemoriesForConstruct(
    userId,
    'lin-001',
    message,
    10 // Get top 10 relevant memories
  );
  
  console.log(`🧠 [Lin] LTM: Loaded ${linMemories.length} relevant memories from ChromaDB`);

  // Build GPT context from workspace context
  const gptContext: {
    capsule?: any;
    blueprint?: any;
    memories?: Array<{ context: string; response: string; timestamp?: string }>;
    constructCallsign?: string;
  } = {
    capsule: workspaceContext.capsule,
    blueprint: workspaceContext.blueprint,
    memories: workspaceContext.memories?.slice(0, 5),
    constructCallsign: gptConfig.constructCallsign
  };
  
  console.log(`✅ [Lin] Using workspace context:`, {
    hasCapsule: !!gptContext.capsule,
    hasBlueprint: !!gptContext.blueprint,
    memoryCount: gptContext.memories?.length || 0
  });

  // Load time context
  let timeContext: any = null;
  try {
    timeContext = await getTimeContext();
    console.log(`✅ [Lin] Loaded time context: ${timeContext.fullDate} ${timeContext.localTime}`);
  } catch (error) {
    console.warn('⚠️ [Lin] Failed to load time context:', error);
  }

  // Build system prompt
  const systemPrompt = await buildLinSystemPrompt(
    linMemories,
    gptContext,
    timeContext,
    workspaceContext,
    gptConfig
  );

  // Check if this is a simple greeting
  const isGreeting = isSimpleGreeting(message);
  console.log('🧠 [Lin] Is greeting?', isGreeting, 'Message:', message);

  // STM: Create conversation context from recent messages
  const stmContext = conversationHistory
    .slice(-20)
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');

  // Build the full prompt
  const fullPrompt = `${systemPrompt}

${isGreeting ? 'NOTE: The user just sent a simple greeting. Respond conversationally and briefly - do not overwhelm them with setup instructions.' : ''}

${stmContext ? `Recent conversation (STM):\n${stmContext}\n\n` : ''}User: ${message}

Assistant:`;

  // Use a creative model for GPT creation assistance
  const selectedModel = 'mistral:latest';
  console.log('🧠 [Lin] Using model:', selectedModel);

  const response = await runSeat({
    seat: 'creative',
    prompt: fullPrompt,
    modelOverride: selectedModel
  });

  const assistantResponse = response.trim();

  // LTM: Store message pair in ChromaDB (optional - don't fail if this fails)
  try {
    const storeResponse = await fetch('/api/vvault/identity/store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        constructCallsign: 'lin-001',
        context: message,
        response: assistantResponse,
        metadata: {
          timestamp: new Date().toISOString(),
          sourceModel: selectedModel,
          sessionId: 'lin-test-runner'
        }
      })
    });
    
    if (storeResponse.ok) {
      const result = await storeResponse.json();
      console.log(`✅ [Lin] LTM: Stored message pair in ChromaDB (duplicate: ${result.duplicate || false})`);
    } else {
      console.warn('⚠️ [Lin] LTM: Failed to store message pair in ChromaDB:', storeResponse.statusText);
    }
  } catch (storeError) {
    console.error('❌ [Lin] LTM: Error storing message pair in ChromaDB:', storeError);
    // Don't fail the conversation if storage fails
  }

  return {
    response: assistantResponse,
    metadata: {
      userId,
      memoryCount: linMemories.length,
      hasCapsule: !!gptContext.capsule,
      hasBlueprint: !!gptContext.blueprint,
      hasUserProfile: !!workspaceContext.userProfile,
      model: selectedModel,
      timestamp: new Date().toISOString()
    }
  };
}
