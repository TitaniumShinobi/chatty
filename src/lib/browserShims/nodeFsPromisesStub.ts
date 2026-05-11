const makeBrowserShim = (name: string) => () => {
  throw new Error(`${name} is a Node.js-only module and is not available in the browser build.`)
}

const browserFsPromisesError = makeBrowserShim('fs/promises')

const readFile = browserFsPromisesError
const writeFile = browserFsPromisesError
const mkdir = browserFsPromisesError
const rename = browserFsPromisesError
const unlink = browserFsPromisesError
const readdir = browserFsPromisesError
const stat = browserFsPromisesError
const access = browserFsPromisesError
const rm = browserFsPromisesError

export {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
}

export default {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
}
