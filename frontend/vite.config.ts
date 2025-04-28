import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'remove-use-client',
      transform(code, id) {
        if (id.endsWith('.tsx') || id.endsWith('.jsx')) {
          return code.replace(/"use client"\s*;?/, '');
        }
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    assetsInlineLimit: 0, // Disable inlining assets
  },
  server: {
    hmr: {
      host: 'localhost',
      protocol: 'ws',
    },
  },
  publicDir: 'public',
})
