const createError = (name: string) =>
  new Error(`${name} is a Node.js-only helper and is unavailable in the browser build.`)

export const promisify = <T extends (...args: any[]) => any>(fn: T) => {
  return (..._args: Parameters<T>) => {
    return Promise.reject(createError('util.promisify'))
  }
}

export default {
  promisify
}
