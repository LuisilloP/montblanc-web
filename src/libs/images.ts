import type { ImageMetadata } from "astro";

/**
 * Los datos de `site.json` guardan rutas tipo "/services/botox.webp", heredadas
 * de cuando las imágenes vivían en `public/`. Ahora viven en `src/assets/` para
 * que Astro las optimice y genere `srcset`, así que hace falta traducir la ruta
 * pública al módulo importado sin tocar el JSON.
 */
const modules = import.meta.glob<{ default: ImageMetadata }>(
  "../assets/**/*.{webp,png,jpg,jpeg,avif,svg}",
  { eager: true }
);

const byPublicPath = new Map<string, ImageMetadata>();

for (const [key, mod] of Object.entries(modules)) {
  byPublicPath.set(key.replace(/^\.\.\/assets/, ""), mod.default);
}

export const resolveImage = (path?: string): ImageMetadata | undefined =>
  path ? byPublicPath.get(path) : undefined;
