import { defineConfig } from 'vite';

// Relative paths so the built game works from any web address.
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
});
