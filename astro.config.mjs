// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@astrojs/react';
import markdoc from '@astrojs/markdoc';
import keystatic from '@keystatic/astro';

const enableKeystatic = process.env.NODE_ENV !== 'production';

// https://astro.build/config
export default defineConfig({
  site: 'https://semeth.wiki',
  vite: {
    plugins: [tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq, req) => {
              const host = req.headers.host;
              if (host) {
                proxyReq.setHeader('X-Forwarded-Host', host);
              }
              proxyReq.setHeader('X-Forwarded-Proto', 'http');
            });
          },
        },
      },
    },
  },
  integrations: [react(), markdoc(), ...(enableKeystatic ? [keystatic()] : [])],
  output: 'static',
});
