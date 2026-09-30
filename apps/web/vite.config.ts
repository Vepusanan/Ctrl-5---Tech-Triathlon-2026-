import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

const apiProxy = { '/api': 'http://localhost:3000' };

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['@waypoint/source', ...defaultClientConditions],
  },
  server: { port: 5173, strictPort: true, proxy: apiProxy },
  preview: { port: 4173, strictPort: true, proxy: apiProxy },
});
