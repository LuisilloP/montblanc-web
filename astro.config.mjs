// @ts-check
import { createRequire } from 'node:module';
import { defineConfig, passthroughImageService, sharpImageService } from 'astro/config';
import icon from 'astro-icon';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

/**
 * Elige el servicio de imágenes según lo que la máquina pueda ejecutar.
 *
 * Lo normal es usar sharp: genera las variantes responsive y reconvierte los
 * formatos. Pero sus binarios exigen CPU moderno — el nativo pide
 * microarquitectura x86-64-v2 y el de WebAssembly pide SIMD (SSE4.1) — y el VPS
 * donde despliega Dokploy no ofrece ninguna de las dos. Ahí sharp no carga de
 * ninguna forma, así que el build usa `passthrough`: las imágenes se copian tal
 * cual, sin optimizar. Se pierde el redimensionado, no el deploy; los assets ya
 * vienen en .webp y pesan poco (el mayor ~120 KB).
 *
 * Con MB_IMAGE_SERVICE=passthrough se fuerza el modo sin sharp (útil para
 * reproducir en local lo que hará el servidor).
 */
function servicioDeImagenes() {
  if (process.env.MB_IMAGE_SERVICE === 'passthrough') {
    console.warn('[imagenes] MB_IMAGE_SERVICE=passthrough — build sin optimizar imágenes.');
    return passthroughImageService();
  }

  try {
    // Cargar sharp basta para detectar el problema: el binario se abre al
    // importar, y ahí es donde revienta cuando el CPU no lo admite.
    const sharp = createRequire(import.meta.url)('sharp');
    console.log(`[imagenes] sharp ${sharp.versions.sharp} (libvips ${sharp.versions.vips}).`);
    return sharpImageService();
  } catch (error) {
    const detalle = (error instanceof Error ? error.message : String(error)).split('\n')[0];
    console.warn(`[imagenes] sharp no está disponible: ${detalle}`);
    console.warn('[imagenes] Se continúa sin optimizar imágenes (servicio passthrough).');
    return passthroughImageService();
  }
}

// https://astro.build/config
export default defineConfig({
  site: 'https://clinicamontblanc.cl',
  integrations: [icon(), sitemap()],
  image: {
    service: servicioDeImagenes()
  },
  vite: {
    plugins: [tailwindcss()]
  }
});
