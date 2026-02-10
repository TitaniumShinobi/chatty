// Minimal browser-like globals for Node/Jest environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    }
  };
}

// Provide a minimal crypto.getRandomValues for code paths that expect it
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {
    getRandomValues: (arr) => {
      if (!Array.isArray(arr) && !ArrayBuffer.isView(arr)) {
        throw new TypeError('Expected an array or typed array');
      }
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    }
  };
}

// Basic fetch shim to prevent network calls during tests
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({}),
    text: async () => ''
  }));
}
// Mock FileReader
if (typeof globalThis.FileReader === 'undefined') {
  class MockFileReader {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.result = null;
    }

    readAsText(file) {
      setTimeout(async () => {
        try {
          if (typeof file.text === 'function') {
            this.result = await file.text();
          } else if (file._content) {
            this.result = file._content;
          } else {
            // Fallback for native Node Blob if text() missing (unlikely in Node 18+) or other object
            this.result = '';
          }

          if (this.onload) {
            this.onload({ target: { result: this.result } });
          }
        } catch (err) {
          if (this.onerror) this.onerror(err);
        }
      }, 10);
    }

    readAsDataURL(file) {
      setTimeout(async () => {
        try {
          let buffer;
          if (typeof file.arrayBuffer === 'function') {
            buffer = await file.arrayBuffer();
          } else if (file._content) {
            buffer = Buffer.from(file._content);
          } else {
            buffer = Buffer.from('');
          }

          this.result = 'data:text/plain;base64,' + Buffer.from(buffer).toString('base64');
          if (this.onload) {
            this.onload({ target: { result: this.result } });
          }
        } catch (err) {
          if (this.onerror) this.onerror(err);
        }
      }, 10);
    }
  }
  globalThis.FileReader = MockFileReader;
}

// Mock Blob and File
// We force our mock if we need custom behavior, but better to augment or just match API
if (typeof globalThis.Blob === 'undefined') {
  class MockBlob {
    constructor(content, options = {}) {
      this._content = content.map(part => {
        if (part && typeof part === 'object' && part._content) {
          return part._content;
        }
        return String(part);
      }).join('');
      this.size = this._content.length;
      this.type = options.type || '';
    }

    async text() {
      return this._content;
    }

    async arrayBuffer() {
      return Buffer.from(this._content).buffer;
    }
  }
  globalThis.Blob = MockBlob;
}

if (typeof globalThis.File === 'undefined') {
  class MockFile extends globalThis.Blob {
    constructor(content, name, options = {}) {
      super(content, options);
      this.name = name;
      this.lastModified = Date.now();
    }
  }
  globalThis.File = MockFile;
}
