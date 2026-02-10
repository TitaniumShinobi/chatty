// Simple GPT store for local storage
export type GPT = { 
  id: string
  name: string
  description: string
  instructions: string
  conversationStarters: string[]
  capabilities: {
    webSearch: boolean
    canvas: boolean
    imageGeneration: boolean
    codeInterpreter: boolean
  }
  modelId: string
  avatar?: string
  createdAt: number
}

const KEY = 'chatty:gpts'

export const gptStore = {
  list(): GPT[] { 
    try { 
      return JSON.parse(localStorage.getItem(KEY) || '[]')
    } catch { 
      return []
    }
  },
  
  save(gpt: GPT) { 
    const all = gptStore.list()
    const i = all.findIndex(x => x.id === gpt.id)
    if (i >= 0) {
      all[i] = gpt
    } else {
      all.push(gpt)
    }
    localStorage.setItem(KEY, JSON.stringify(all))
  },
  
  delete(id: string) {
    const all = gptStore.list()
    const filtered = all.filter(x => x.id !== id)
    localStorage.setItem(KEY, JSON.stringify(filtered))
    return filtered.length < all.length
  },
  
  get(id: string): GPT | null {
    const all = gptStore.list()
    return all.find(x => x.id === id) || null
  }
}
