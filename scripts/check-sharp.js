/**
 * Comprobación previa al build (y reparación cuando el CPU no admite el
 * binario nativo).
 *
 * `astro build` necesita sharp para generar las variantes responsive de las
 * imágenes. Si sharp no carga, Astro aborta con un escueto "Could not find
 * Sharp" que no dice si falta el paquete, si falta su binario nativo o si el
 * binario no corresponde a esta plataforma.
 *
 * Este script hace la misma carga que hace Astro, pero cuando falla informa de
 * qué hay realmente instalado. Así el log del contenedor sirve para diagnosticar
 * en lugar de obligar a adivinar.
 *
 * Además intenta arreglarlo solo en el caso que nos afecta en producción: los
 * prebuilds de `@img/sharp-linux-x64` exigen microarquitectura x86-64-v2 y
 * muchos VPS (CPU antiguo o modelo genérico de QEMU) no la ofrecen. sharp
 * prueba `@img/sharp-<plataforma>` antes que `@img/sharp-wasm32` y, si el
 * nativo carga pero el CPU no es v2, aborta sin seguir probando. Por eso la
 * reparación instala el binario WebAssembly *y* borra el nativo inservible:
 * es la única forma de que sharp llegue al fallback. Va más lento, pero corre
 * en cualquier CPU.
 */
import { createRequire } from "node:module";
import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);

// El reintento corre en un proceso hijo: importar sharp otra vez en este mismo
// proceso devolvería el módulo ya cacheado (y fallido).
const esReintento = process.env.MB_SHARP_REINTENTO === "1";

const dirImg = () =>
  path.join(path.dirname(path.dirname(require.resolve("sharp/package.json"))), "@img");

const listarBinarios = () => {
  try {
    return readdirSync(dirImg()).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
};

const versionSharp = () => {
  try {
    return require("sharp/package.json").version;
  } catch {
    return null;
  }
};

/** Borra los prebuilds de esta plataforma para que sharp llegue al de WebAssembly. */
const borrarNativos = () => {
  const base = dirImg();
  const patron = new RegExp(`^sharp-${process.platform}(musl)?-${process.arch}$`);
  const borrados = [];
  for (const nombre of listarBinarios()) {
    if (!patron.test(nombre)) continue;
    try {
      rmSync(path.join(base, nombre), { recursive: true, force: true });
      borrados.push(nombre);
    } catch (err) {
      console.error(`  no se pudo quitar : ${nombre} (${err.code ?? err.message})`);
    }
  }
  return borrados;
};

const instalarWasm = (version) => {
  const args = [
    "install",
    "--no-save",
    "--no-audit",
    "--no-fund",
    "--cpu=wasm32",
    `@img/sharp-wasm32@${version}`
  ];
  console.error(`  ejecutando        : npm ${args.join(" ")}`);
  const npm = spawnSync("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  return npm.status === 0;
};

// El binario nativo se quita aquí, antes de importar sharp: una vez importado
// queda abierto por el proceso y ya no se puede borrar en todos los sistemas.
if (process.env.MB_SHARP_QUITAR_NATIVOS === "1") {
  const quitados = borrarNativos();
  if (quitados.length) {
    console.error(`  binarios quitados : ${quitados.join(", ")} (el CPU no los admite)`);
  }
}

try {
  const sharp = (await import("sharp")).default;
  await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000" } })
    .webp()
    .toBuffer();
  console.log(
    `check-sharp: OK — sharp ${sharp.versions?.sharp ?? "?"} ` +
      `(libvips ${sharp.versions?.vips ?? "?"}) en ${process.platform}-${process.arch}` +
      `${esReintento ? " vía WebAssembly" : ""}`
  );
} catch (error) {
  const mensaje = error?.message ?? String(error);
  const version = versionSharp();
  const cpuIncompatible = /microarchitecture|Unsupported CPU/i.test(mensaje);

  // Un solo intento de reparación, y solo si sharp está instalado: sin el
  // paquete no hay nada que reparar, hay que revisar el install.
  if (!esReintento && version) {
    console.error("\ncheck-sharp: sharp no se puede cargar. Probando con el binario WebAssembly.\n");
    console.error(`  plataforma        : ${process.platform}-${process.arch}`);
    console.error(`  error original    : ${mensaje.split("\n")[0]}`);

    if (instalarWasm(version)) {
      const hijo = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        stdio: "inherit",
        env: {
          ...process.env,
          MB_SHARP_REINTENTO: "1",
          // Solo si el nativo existe pero el CPU no lo admite: si faltaba,
          // quitarlo no aporta y podría tirar un binario que sí sirve.
          ...(cpuIncompatible ? { MB_SHARP_QUITAR_NATIVOS: "1" } : {})
        }
      });
      process.exit(hijo.status ?? 1);
    }
    console.error("\n  la instalación del binario WebAssembly falló.\n");
  }

  const binarios = listarBinarios();
  console.error("\ncheck-sharp: sharp no se puede cargar, y el build lo necesita.\n");
  console.error(`  plataforma        : ${process.platform}-${process.arch}`);
  console.error(`  node              : ${process.version}`);
  console.error(`  binario esperado  : @img/sharp-${process.platform}-${process.arch}`);
  console.error(
    `  paquetes @img     : ${binarios.length ? binarios.join(", ") : "(ninguno instalado)"}`
  );
  console.error(`\n  error original    : ${mensaje}\n`);
  console.error(
    "  Si la lista de paquetes @img está vacía o no incluye el binario esperado,\n" +
      "  el instalador omitió las dependencias opcionales de sharp. Reinstalar con\n" +
      "  `npm ci --include=optional` suele resolverlo.\n" +
      "\n" +
      "  Si el error habla de microarquitectura v2, el CPU del servidor es anterior\n" +
      "  a x86-64-v2 y no puede ejecutar los prebuilds de sharp. En ese caso este\n" +
      "  script ya intentó instalar @img/sharp-wasm32; revisa el error de npm de\n" +
      "  más arriba (¿hay red en el build?).\n"
  );
  process.exit(1);
}
