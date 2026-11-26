import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import electron from "vite-plugin-electron";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: './',
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: [
                'electron-updater',
                'tiktok-live-connector',
                /^tiktok-live-connector\/.*/,
                'ws',
                'bufferutil',
                'utf-8-validate',
              ],
            },
          },
        },
      },
      {
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              input: 'electron/preload.ts',
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
    ]),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) return 'firebase-vendor';
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/react/')) {
            return 'react-vendor';
          }
          if (
            id.includes('@reduxjs/toolkit') ||
            id.includes('react-redux') ||
            id.includes('redux-persist') ||
            id.includes('immer')
          ) {
            return 'redux-vendor';
          }
          if (id.includes('@radix-ui') || id.includes('lucide-react') || id.includes('sonner')) {
            return 'ui-vendor';
          }
        },
      },
    },
  },
}));
