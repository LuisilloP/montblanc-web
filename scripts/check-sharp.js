/**
 * Comprobación previa al build (y reparación cuando el CPU no admite el
 * binario nativo de sharp).
 *
 * `astro build` necesita sharp para generar las variantes responsive de las
 * imágenes. Si sharp no carga, Astro aborta con un escueto "Could not find
 * Sharp" que no dice si falta el paquete, si falta su binario nativo o si el
 * binario no corresponde a esta plataforma. Este script hace la misma carga que
 * hace Astro, pero cuando falla informa de qué hay realmente instalado.
 *
 * Además arregla el caso que nos rompe el deploy: los prebuilds de
 * `@img/sharp-linux-x64` exigen microarquitectura x86-64-v2 y muchos VPS (CPU
 * antiguo, o el modelo genérico de CPU de QEMU) no la ofrecen. sharp prueba
 * `@img/sharp-<plataforma>` antes que `@img/sharp-wasm32` y, si el nativo carga
 * pero el CPU no es v2, aborta sin seguir probando: por eso hay que instalar el
 * binario WebAssembly *y* quitar el nativo inservible. Va más lento, pero corre
 * en cualquier CPU.
 *
 * Trabaja en dos niveles: este proceso orquesta y un proceso hijo hace la carga.
 * Así el que repara nunca tiene el binario abierto (uno cargado no se puede
 * borrar en Windows) y cada intento parte de cero, sin módulos cacheados.
 */
import { createRequire } from "node:module";
import { readdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const esteArchivo = fileURLToPath(import.meta.url);
const patronNativo = new RegExp(`^sharp-${process.platform}(musl)?-${process.arch}$`);

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

// --------------------------------------------------------------- verificador
// Corre en el proceso hijo. Salidas: 0 carga bien, 2 el CPU no admite el
// binario nativo, 1 cualquier otro fallo.
if (process.env.MB_SHARP_VERIFICAR === "1") {
  try {
    const sharp = (await import("sharp")).default;
    await sharp({ create: { width: 1, height: 1, channels: 3, background: "#000" } })
      .webp()
      .toBuffer();
    const usandoWasm = !listarBinarios().some((n) => patronNativo.test(n));
    console.log(
      `check-sharp: OK — sharp ${sharp.versions?.sharp ?? "?"} ` +
        `(libvips ${sharp.versions?.vips ?? "?"}) en ${process.platform}-${process.arch}` +
        `${usandoWasm ? " vía WebAssembly" : ""}`
    );
    process.exit(0);
  } catch (error) {
    const mensaje = error?.message ?? String(error);

    if (process.env.MB_SHARP_DIAGNOSTICO === "1") {
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
          "  Si el error habla de microarquitectura v2, el CPU de esta máquina es\n" +
          "  anterior a x86-64-v2 y no puede ejecutar los prebuilds de sharp. Este\n" +
          "  script ya intentó pasarse a @img/sharp-wasm32 y no bastó: revisa el\n" +
          "  error de npm de más arriba (¿hay red durante el build?).\n"
      );
    } else {
      console.error(`  error             : ${mensaje.split("\n")[0]}`);
    }
    process.exit(/microarchitecture|Unsupported CPU/i.test(mensaje) ? 2 : 1);
  }
}

// --------------------------------------------------------------- orquestador
const verificar = (extra = {}) =>
  spawnSync(process.execPath, [esteArchivo], {
    stdio: "inherit",
    env: { ...process.env, MB_SHARP_VERIFICAR: "1", ...extra }
  });

/** Quita los prebuilds de esta plataforma para que sharp llegue al de WebAssembly. */
const quitarNativos = () => {
  const base = dirImg();
  const quitados = [];
  for (const nombre of listarBinarios()) {
    if (!patronNativo.test(nombre)) continue;
    try {
      rmSync(path.join(base, nombre), { recursive: true, force: true });
      quitados.push(nombre);
    } catch (err) {
      console.error(`  no se pudo quitar : ${nombre} (${err.code ?? err.message})`);
    }
  }
  return quitados;
};

const instalarWasm = (version) => {
  const npmVersion = spawnSync("npm", ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32"
  }).stdout?.trim();
  console.error(`  npm               : ${npmVersion ?? "?"}`);

  // npm 10+ entiende --cpu y resuelve el paquete aunque no coincida con el CPU
  // de esta máquina. npm 9 ignora el flag y aborta con EBADPLATFORM, y ahí la
  // única salida es --force: el binario es WebAssembly, corre en cualquier CPU,
  // así que la comprobación de plataforma que se salta no aporta nada aquí.
  for (const extra of ["--cpu=wasm32", "--force"]) {
    const args = [
      "install",
      extra,
      "--no-save",
      "--no-audit",
      "--no-fund",
      `@img/sharp-wasm32@${version}`
    ];
    console.error(`  ejecutando        : npm ${args.join(" ")}`);
    const npm = spawnSync("npm", args, {
      stdio: "inherit",
      shell: process.platform === "win32"
    });
    if (npm.status === 0) return true;
    console.error("  falló; reintentando con otra estrategia de instalación.");
  }
  return false;
};

const primero = verificar();
if (primero.status === 0) process.exit(0);

const version = versionSharp();
if (!version) {
  console.error("\ncheck-sharp: sharp no está instalado. Revisa el `npm ci` del build.\n");
  process.exit(1);
}

console.error(
  "\ncheck-sharp: pasando al binario WebAssembly de sharp " +
    "(más lento, pero corre en cualquier CPU).\n"
);

if (instalarWasm(version)) {
  // Solo si el nativo está pero el CPU no lo admite: si simplemente faltaba,
  // quitarlo no aporta y podría tirar un binario que sí sirve.
  if (primero.status === 2) {
    const quitados = quitarNativos();
    if (quitados.length) {
      console.error(`  binarios quitados : ${quitados.join(", ")} (el CPU no los admite)`);
    }
  }
  const segundo = verificar({ MB_SHARP_DIAGNOSTICO: "1" });
  process.exit(segundo.status === 0 ? 0 : 1);
}

console.error("\n  la instalación de @img/sharp-wasm32 falló.\n");
verificar({ MB_SHARP_DIAGNOSTICO: "1" });
process.exit(1);
