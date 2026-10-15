import { defineConfig } from 'vite';
import { resolve } from 'path';

// Relative paths so the built game works from any web address.
// admin.html is the owner's private statistics page (15 Oct); the claude.ai
// copy (device-only) leaves it out.
const pages = { main: resolve(__dirname, 'index.html') };
if (process.env.VITE_AUTH !== 'device') pages.admin = resolve(__dirname, 'admin.html');
export default defineConfig({
  base: './',
  server: { port: 5173, host: true },
  build: { rollupOptions: { input: pages } },
});
