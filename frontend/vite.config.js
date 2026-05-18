import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {}, // Provides fallback for older libraries
  },
 
  // Treat .js files as JSX
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },

  server: {
    port: 3000,
    
    // Development proxy to avoid CORS issues
    // Browser calls /api/* on Vite origin; Vite forwards to Express backend
    // This avoids "fetch failed" when backend is on :5000 (different port/host)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false,
        // Rewrite /api/... → /api/... (no path modification)
        pathRewrite: {},
      },
    },
  },
});