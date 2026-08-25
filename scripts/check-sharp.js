/**
 * Comprobación previa al build.
 *
 * `astro build` necesita sharp para generar las variantes responsive de las
 * imágenes. Si sharp no carga, Astro aborta con un escueto "Could not find
 * Sharp" que no dice si falta el paquete, si falta su binario nativo o si el
 * binario no corresponde a esta plataforma.
 *
 * Este script hace la misma carga que hace Astro, pero cuando falla informa de
 * qué hay realmente instalado. Así el log del contenedor sirve para diagnosticar
 * en lugar de obligar a adivinar.
 */
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import process from "node:process";

const require = createRequire(import.meta.url);

const listarBinarios = () => {
  try {
    const dir = require.resolve("sharp/package.json").replace(/sharp[\\/]package\.json$/, "@img");
    return readdirSync(dir).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
};

try {
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000" } })
    .webp()
    .toBuffer();
  console.log(
    `check-sharp: OK — sharp ${sharp.versions?.sharp ?? "?"} ` +
      `(libvips ${sharp.versions?.vips ?? "?"}) en ${process.platform}-${process.arch}`
  );
} catch (error) {
  const binarios = listarBinarios();
  console.error("\ncheck-sharp: sharp no se puede cargar, y el build lo necesita.\n");
  console.error(`  plataforma        : ${process.platform}-${process.arch}`);
  console.error(`  node              : ${process.version}`);
  console.error(`  binario esperado  : @img/sharp-${process.platform}-${process.arch}`);
  console.error(
    `  paquetes @img     : ${binarios.length ? binarios.join(", ") : "(ninguno instalado)"}`
  );
  console.error(`\n  error original    : ${error?.message ?? error}\n`);
  console.error(
    "  Si la lista de paquetes @img está vacía o no incluye el binario esperado,\n" +
      "  el instalador omitió las dependencias opcionales de sharp. Reinstalar con\n" +
      "  `npm ci --include=optional` suele resolverlo.\n"
  );
  process.exit(1);
}
