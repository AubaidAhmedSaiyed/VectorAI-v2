import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {}, // This provides a fallback for older libraries
  },
 
  // This tells esbuild to treat .js files as JSX
  optimizeDeps: {
    esbuildOptions: {
      loader: {
        '.js': 'jsx',
      },
    },
  },
  server: {
    port: 3000,
    // Browser calls /api/* on the Vite origin; Vite forwards to Express (avoids "fetch failed" when
    // cross-origin to :5000 is blocked or the wrong host is used).
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
});