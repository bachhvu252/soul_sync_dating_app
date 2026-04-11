import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls to the Node.js backend during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy uploaded files (served by Node.js static middleware)
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Proxy media uploads directly to Flask
      '/api/media': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
});
