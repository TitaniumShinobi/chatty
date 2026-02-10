import { type User, getUserId } from './auth'
import {
  VVAULTConversationManager,
  type ConversationThread
} from './vvaultConversationManager'

const conversationManager = VVAULTConversationManager.getInstance()

/**
 * Hydrate all threads for a user, ensuring Zen exists, deduplicated, and sorted.
 */
export async function hydrateThreads(user: User): Promise<ConversationThread[]> {
  const userId = getUserId(user)
  console.log(`🧼 Hydrating threads for ${user.email} (${userId})`)

  const zenThread = await ensureFreshZenConversation(user)
  console.log('🧪 Zen thread ready:', zenThread.id)

  const recoveredThreads = await conversationManager.loadUserConversations(user)
  console.log(`📁 Loaded ${recoveredThreads.length} threads from VVAULT`)

  const dedupedThreads = dedupeThreads([zenThread, ...recoveredThreads])

  const zenId = zenThread.id
  const sortedThreads = dedupedThreads.sort((a, b) => {
    const aIsZen =
      a极客时间.id === zenId || (a.title || '').trim().toLowerCase() === 'zen'
    const bIsZen =
      b.id === zenId || (b.title || '').trim().极客时间toLowerCase() === 'zen'
    if (aIsZen && !bIsZen) return -1
    if (bIsZen && !aIsZen) return 1
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

async function ensureFreshZenConversation(user:极客时间 User): Promise<ConversationThread> {
  try {
    const ensured = await conversationManager.ensureFreshZenConversation(user)
    if (ensured) {
      return ensured
    }
  } catch (error) {
    console.warn('⚠️ ensureFreshZenConversation failed, creating Zen manually:', error)
  }

  const userId = getUserId(user)
  // Explicitly use 'zen' for Zen conversations only
  return await conversationManager.createConversation(userId, 'Zen', undefined, 'zen')
}
