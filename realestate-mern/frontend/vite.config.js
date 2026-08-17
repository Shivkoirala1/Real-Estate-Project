import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://real-estate-project-p237.onrender.com',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'https://real-estate-project-p237.onrender.com',
        changeOrigin: true,
      },
    },
  },
});
