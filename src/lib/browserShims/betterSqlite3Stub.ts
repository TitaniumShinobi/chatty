type StatementResult = {
  changes: number
  lastInsertRowid: number
}

class StatementStub {
  run(..._args: any[]): StatementResult {
    return { changes: 0, lastInsertRowid: 0 }
  }

  get(..._args: any[]): null {
    return null
  }

  all(..._args: any[]): any[] {
    return []
  }

  iterate(..._args: any[]): Iterable<any> {
    return {
      [Symbol.iterator]() {
        return {
          next: () => ({ done: true, value: undefined })
        }
      }
    }
  }

  raw(): this {
    return this
  }
}

const logOnce = (() => {
  let logged = false
  return (message: string) => {
    if (!logged) {
      console.warn(message)
      logged = true
    }
  }
})()

class BetterSqlite3BrowserShim {
  constructor(filename: string) {
    logOnce(
      `better-sqlite3 stub instantiated in browser (database path: ${filename}). Database operations are no-ops.`
    )
  }

  exec(_sql: string): this {
    return this
  }

  prepare(_sql: string): StatementStub {
    return new StatementStub()
  }

  close() {
    // no-op
  }
}

export default BetterSqlite3BrowserShim
