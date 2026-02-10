import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  build: {
    lib: {
      entry: 'src/cli/cliCore.ts',
      formats: ['cjs'],
      fileName: () => 'cli-core.cjs',
      name: 'CliCore'
    },
    rollupOptions: { external: [] },
    outDir: 'dist',
    emptyOutDir: false
  }
});
