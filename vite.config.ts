import path from "node:path";
import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";

type LifecycleLogContext = Record<string, unknown>;

function emitDevLifecycleLog(event: string, context: LifecycleLogContext = {}) {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope: "vite-dev",
      event,
      ...context,
    }),
  );
}

function safeReason(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function devLifecycleLogPlugin(): Plugin {
  return {
    name: "chatty-dev-lifecycle-log",
    apply: "serve",
    configureServer(server) {
      const processAny = process as NodeJS.Process & {
        __chattyViteLifecycleHandlersInstalled?: boolean;
      };

      if (!processAny.__chattyViteLifecycleHandlersInstalled) {
        processAny.__chattyViteLifecycleHandlersInstalled = true;
        process.on("uncaughtException", (error) => {
          emitDevLifecycleLog("process.uncaughtException", {
            message: error?.message || String(error),
            stack: error?.stack || null,
          });
        });
        process.on("unhandledRejection", (reason) => {
          emitDevLifecycleLog("process.unhandledRejection", {
            reason: safeReason(reason),
          });
        });
        process.on("exit", (code) => {
          emitDevLifecycleLog("process.exit", { code });
        });
        process.on("SIGINT", () => {
          emitDevLifecycleLog("process.signal", { signal: "SIGINT" });
        });
        process.on("SIGTERM", () => {
          emitDevLifecycleLog("process.signal", { signal: "SIGTERM" });
        });
      }

      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        emitDevLifecycleLog("server.listening", {
          address:
            typeof address === "string"
              ? address
              : address
                ? `${address.address}:${address.port}`
                : null,
        });
      });
      server.httpServer?.on("close", () => {
        emitDevLifecycleLog("server.close");
      });
      server.httpServer?.on("error", (error: any) => {
        emitDevLifecycleLog("server.error", {
          code: error?.code || null,
          message: error?.message || String(error),
        });
      });
    },
  };
}

// Plugin to redirect seatRunner imports to browserSeatRunner in browser builds
function excludeSeatRunnerPlugin(): Plugin {
  return {
    name: "exclude-seat-runner",
    resolveId(id, importer) {
      // Only redirect if this is being imported in browser context (not in Node.js/server)
      // Check if the import path matches seatRunner patterns
      const isRelativeEngineSeatRunner =
        Boolean(importer) &&
        importer!.includes(`${path.sep}src${path.sep}engine${path.sep}`) &&
        /^(?:\.{1,2}\/)+seatRunner(?:\.(?:js|ts))?$/.test(id);
      if (
        (isRelativeEngineSeatRunner ||
          id.includes("engine/seatRunner") ||
          id === "../engine/seatRunner" ||
          id === "../../engine/seatRunner") &&
        importer &&
        !importer.includes("node_modules")
      ) {
        // Redirect to browserSeatRunner for browser builds
        return {
          id: path.resolve(__dirname, "src/lib/browserSeatRunner.ts"),
          external: false,
        };
      }
      return null;
    },
  };
}

function stripSupabaseLocalhostDefaultPlugin(): Plugin {
  // Some third-party libs include unused dev defaults like "http://localhost:9999".
  // We don't want any loopback URLs in the production bundle, even as unused strings.
  const FROM = "http://localhost:9999";
  const TO = "http://0.0.0.0:9999";
  return {
    name: "strip-supabase-localhost-default",
    apply: "build",
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        if (item.code.includes(FROM)) {
          item.code = item.code.split(FROM).join(TO);
        }
      }
    },
  };
}

// https://vitejs.dev/config/
// Ensure .env.local has VITE_* vars and restart Vite after changes
export default defineConfig({
  base: "/",
  plugins: [react(), devLifecycleLogPlugin(), excludeSeatRunnerPlugin(), stripSupabaseLocalhostDefaultPlugin()],
  define: {
    global: "globalThis",
  },
  build: {
    rollupOptions: {
      external: [
        /^server\/.*/,
      ],
      output: {
        manualChunks: {
          'vendor-markdown': ['react-markdown', 'remark-breaks', 'remark-math', 'rehype-raw', 'rehype-katex'],
          'vendor-syntax': ['react-syntax-highlighter'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: [
      // Exclude Node.js-only modules from Vite's dependency optimization
      "src/engine/seatRunner",
      "../engine/seatRunner",
      "../../engine/seatRunner",
    ],
  },
  resolve: {
    alias: [
      // Assets folder alias
      {
        find: "@assets",
        replacement: path.resolve(__dirname, "assets"),
      },
      // Redirect Node.js-only modules to browser-friendly stubs
      {
        find: "better-sqlite3",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/betterSqlite3Stub.ts",
        ),
      },
      {
        find: "node:fs/promises",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/nodeFsPromisesStub.ts",
        ),
      },
      {
        find: "fs/promises",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/nodeFsPromisesStub.ts",
        ),
      },
      {
        find: "node:fs",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/nodeFsStub.ts",
        ),
      },
      {
        find: "fs",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/nodeFsStub.ts",
        ),
      },
      {
        find: "path",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/nodePathStub.ts",
        ),
      },
      {
        find: "crypto",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/nodeCryptoStub.ts",
        ),
      },
      {
        find: "util",
        replacement: path.resolve(
          __dirname,
          "src/lib/browserShims/nodeUtilStub.ts",
        ),
      },
      // Force any seatRunner imports in the browser to use the browser runner
      // Match various import path patterns
      {
        find: /^.*\/engine\/seatRunner(\.ts)?$/,
        replacement: path.resolve(__dirname, "src/lib/browserSeatRunner.ts"),
      },
      {
        find: /^.*engine\/seatRunner(\.ts)?$/,
        replacement: path.resolve(__dirname, "src/lib/browserSeatRunner.ts"),
      },
      {
        find: "../engine/seatRunner",
        replacement: path.resolve(__dirname, "src/lib/browserSeatRunner.ts"),
      },
      {
        find: "../../engine/seatRunner",
        replacement: path.resolve(__dirname, "src/lib/browserSeatRunner.ts"),
      },
    ],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    origin: "http://localhost:5173",
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 5173,
      clientPort: 5173,
      overlay: false,
    },
    allowedHosts: ["localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://localhost:5050",
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
        cookieDomainRewrite: "", // strip domain for Set-Cookie
        cookiePathRewrite: "/", // ensure path is /
        configure: (proxy) => {
          proxy.on("error", (err, req) => {
            emitDevLifecycleLog("proxy.error", {
              code: (err as any)?.code || null,
              message: err?.message || String(err),
              method: req?.method || null,
              url: req?.url || null,
            });
          });
          proxy.on("proxyReq", (_proxyReq, req) => {
            emitDevLifecycleLog("proxy.request", {
              method: req.method,
              url: req.url,
            });
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            emitDevLifecycleLog("proxy.response", {
              method: req.method,
              url: req.url,
              statusCode: proxyRes.statusCode,
            });
          });
        },
      },
      "/ollama": {
        target: "http://localhost:11434",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/ollama/, ""),
      },
    },
  },
  // no custom define block; use import.meta.env.VITE_*
});
