const makeBrowserShim = (name: string) => () => {
  throw new Error(`${name} is a Node.js-only module and is not available in the browser build.`)
}

const browserFsError = makeBrowserShim('fs')

const promisesProxy = new Proxy(
  {},
  {
    get: () => browserFsError,
    apply: () => browserFsError,
    construct: () => {
      throw browserFsError()
    }
  }
)

export const promises = promisesProxy
export const existsSync = browserFsError
export const mkdirSync = browserFsError
export const mkdir = browserFsError

export default {
  promises,
  existsSync,
  mkdirSync,
  mkdir
}
