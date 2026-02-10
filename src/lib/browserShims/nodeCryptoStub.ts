const fallbackUUID = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }
  return `uuid-${Math.random().toString(16).slice(2)}`
}

export const randomUUID = (): string => fallbackUUID()

const cryptoShim = {
  randomUUID
}

export default cryptoShim
