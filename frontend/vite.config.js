import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { requireProductionApiUrl } from './src/api/apiUrl.js';
import { contentSecurityPolicy, cspMetaTag } from './contentSecurityPolicy.js';

export default defineConfig(({ command, mode }) => {
  const plugins = [react(), tailwindcss()];
  // A build needs the backend URL: without it the files would point at localhost. Read the way Vite
  // reads it (shell variables first, then .env files); the build stops with a message if it is
  // missing or not an http(s) URL. The development server keeps its localhost fallback.
  if (command === 'build') {
    const apiUrl = requireProductionApiUrl(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_URL);
    plugins.push(cspMetaTag(contentSecurityPolicy(apiUrl)));
  }
  return {
    plugins,
    server: { port: 5173 },
  };
});
