const normalize = (parts: string[]): string => {
  const joined = parts
    .filter(part => !!part)
    .map(part => part.replace(/\\/g, '/'))
    .join('/')
  return joined.replace(/\/+/g, '/')
}

export const join = (...parts: string[]): string => normalize(parts)
export const resolve = (...parts: string[]): string => {
  if (parts.length === 0) {
    return '.'
  }
  return normalize(parts)
}
export const dirname = (target: string): string => {
  if (!target) return '.'
  const trimmed = target.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = trimmed.split('/')
  if (segments.length <= 1) return '.'
  segments.pop()
  return segments.join('/') || '.'
}
export const basename = (target: string): string => {
  if (!target) return ''
  const trimmed = target.replace(/\\/g, '/').replace(/\/+$/, '')
  const segments = trimmed.split('/')
  return segments.pop() || ''
}

const pathShim = {
  join,
  resolve,
  dirname,
  basename
}

export default pathShim
