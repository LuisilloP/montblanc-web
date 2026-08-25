# Mont Blanc — sitio web

Sitio de una página para la Clínica Dental Mont Blanc (Ovalle, Región de Coquimbo).
Construido con [Astro](https://astro.build) y [Tailwind CSS 4](https://tailwindcss.com),
sin framework de interfaz: todo se renderiza en el build y se sirve como HTML estático.

## Comandos

| Comando           | Qué hace                                              |
| :---------------- | :---------------------------------------------------- |
| `npm install`     | Instala dependencias                                   |
| `npm run dev`     | Servidor de desarrollo en `localhost:4321`             |
| `npm run build`   | Compila el sitio a `./dist/`                           |
| `npm run preview` | Previsualiza el build antes de desplegar               |

Requiere Node 20.18.1 o superior (ver `.nvmrc`).

## Dónde está cada cosa

```
src/
├── data/
│   ├── site.json              ← TODO el contenido del sitio
│   ├── seo.json               ← metadatos y datos estructurados
│   └── montblanc.reviews.json ← reseñas de Google (se actualiza a mano)
├── assets/                    ← imágenes; Astro las optimiza y genera srcset
├── components/sections/       ← una sección de la página por archivo
├── layouts/BaseLayout.astro   ← <head>, SEO, JSON-LD, botón flotante
├── libs/
│   ├── images.ts              ← traduce rutas de site.json a assets importados
│   ├── navbar.ts              ← menú, foco atrapado y sección activa
│   └── reveal.ts              ← animaciones de aparición al hacer scroll
└── styles/global.css          ← tokens de color, tipografía y componentes
```

## Editar el contenido

Casi todo se cambia sin tocar código, en `src/data/site.json`: textos, horarios,
servicios, convenios, preguntas frecuentes, enlaces de WhatsApp y datos de contacto.

**Imágenes.** Las rutas de `site.json` (`/services/botox.webp`) apuntan a
`src/assets/`, no a `public/`. Para añadir una imagen, déjala en la carpeta
correspondiente de `src/assets/` y referénciala con esa misma ruta sin el prefijo
`src/assets`. `src/libs/images.ts` hace la traducción y Astro genera las variantes
responsive automáticamente.

Sube a `src/assets/` a resolución razonable: ningún hueco de la maqueta pasa de
~900 px de ancho, así que subir un archivo de 5000 px sólo alarga el build.

En `public/` sólo van los archivos que necesitan una URL fija: el favicon, la
imagen de Open Graph, el vídeo del hero y `robots.txt`.

## Notas de implementación

- **Tipografía.** Playfair Display sólo en `h1`–`h3` y cifras destacadas; Inter en
  el cuerpo y la interfaz. Ambas se declaran en `global.css` como
  `--font-heading` y `--font-body`.
- **Color de texto en oro.** Usar `--goldText` (`#8A5B2A`), que cumple contraste AA.
  `--gold` y `--goldLight` son para superficies y bordes, no para texto.
- **La regla `a { color: inherit }` debe seguir dentro de `@layer base`.** Fuera de
  una capa gana a todas las utilidades de Tailwind y ningún enlace puede fijar su
  propio color.
- **Vídeo del hero.** No se descarga en móvil, con `prefers-reduced-motion` ni con
  el ahorro de datos activado: en esos casos se muestra `hero-poster.webp`.
- **Anclajes.** Las secciones con `id` llevan `scroll-margin-top: var(--header-offset)`
  para no quedar bajo la barra fija.
