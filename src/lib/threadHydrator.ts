import { type User, getUserId } from './auth'
import {
  VVAULTConversationManager,
  type ConversationThread
} from './vvaultConversationManager'

const conversationManager = VVAULTConversationManager.getInstance()

/**
 * Hydrate all threads for a user, ensuring Synth exists, deduplicated, and sorted.
 */
export async function hydrateThreads(user: User): Promise<ConversationThread[]> {
  const userId = getUserId(user)
  console.log(`🧼 Hydrating threads for ${user.email} (${userId})`)

  const synthThread = await ensureFreshSynthConversation(user)
  console.log('🧪 Synth thread ready:', synthThread.id)

  const recoveredThreads = await conversationManager.loadUserConversations(user)
  console.log(`📁 Loaded ${recoveredThreads.length} threads from VVAULT`)

  const dedupedThreads = dedupeThreads([synthThread, ...recoveredThreads])

  const synthId = synthThread.id
  const sortedThreads = dedupedThreads.sort((a, b) => {
    const aIsSynth =
      a.id === synthId || (a.title || '').trim().toLowerCase() === 'synth'
    const bIsSynth =
      b.id === synthId || (b.title || '').trim().toLowerCase() === 'synth'
    if (aIsSynth && !bIsSynth) return -1
    if (bIsSynth && !aIsSynth) return 1
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })

  console.log('✅ Final thread list:', sortedThreads.map(t => t.title || t.id))

  return sortedThreads
}

function dedupeThreads(threads: ConversationThread[]): ConversationThread[] {
  const seen = new Set<string>()
  const result: ConversationThread[] = []

  for (const thread of threads) {
    if (thread && !seen.has(thread.id)) {
      seen.add(thread.id)
      result.push(thread)
    }
  }

  return result
}

async function ensureFreshSynthConversation(user: User): Promise<ConversationThread> {
  try {
    const ensured = await conversationManager.ensureFreshSynthConversation(user)
    if (ensured) {
      return ensured
    }
  } catch (error) {
    console.warn('⚠️ ensureFreshSynthConversation failed, creating Synth manually:', error)
  }

  const userId = getUserId(user)
  // Explicitly use 'synth' for Synth conversations only
  return await conversationManager.createConversation(userId, 'Synth', undefined, 'synth')
}
