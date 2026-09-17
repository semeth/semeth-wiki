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
  },
  integrations: [react(), markdoc(), ...(enableKeystatic ? [keystatic()] : [])],
  output: 'static',
});
