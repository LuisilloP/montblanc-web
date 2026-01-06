// @ts-check
import { defineConfig } from 'astro/config';
import icon from 'astro-icon';

import tailwindcss from '@tailwindcss/vite';
import astroIcon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  integrations: [astroIcon()],
  vite: {
    plugins: [tailwindcss()]
  }
});

