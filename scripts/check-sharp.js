/**
 * Comprobación previa al build (y reparación cuando el CPU no admite el
 * binario nativo de sharp).
 *
 * sharp es lo que usa Astro para generar las variantes responsive de las
 * imágenes. Cuando no carga, Astro solo dice "Could not find Sharp", sin
 * aclarar si falta el paquete, si falta su binario nativo o si el binario no
 * corresponde a esta plataforma. Este script hace la misma carga que hace
 * Astro, pero cuando falla informa de qué hay realmente instalado.
 *
 * Además intenta arreglar el caso que nos rompe el deploy: los prebuilds de
 * `@img/sharp-linux-x64` exigen microarquitectura x86-64-v2 y muchos VPS (CPU
 * antiguo, o el modelo genérico de CPU de QEMU) no la ofrecen. sharp prueba
 * `@img/sharp-<plataforma>` antes que `@img/sharp-wasm32` y, si el nativo carga
 * pero el CPU no es v2, aborta sin seguir probando: por eso hay que instalar el
 * binario WebAssembly *y* quitar el nativo inservible.
 *
 * El script nunca tumba el build. Si tampoco sirve el binario WebAssembly (hace
 * falta SIMD/SSE4.1, que algunos CPU tampoco tienen), sale con 0 y deja el aviso:
 * astro.config.mjs detecta lo mismo por su cuenta y cae al servicio de imágenes
 * `passthrough`, que copia las imágenes sin optimizar. Con MB_SHARP_ESTRICTO=1
 * vuelve a fallar duro.
 *
 * Trabaja en dos niveles: este proceso orquesta y un proceso hijo hace la carga.
 * Así el que repara nunca tiene el binario abierto (uno cargado no se puede
 * borrar en Windows) y cada intento parte de cero, sin módulos cacheados.
 */
import { createRequire } from "node:module";
import { readdirSync, rmSync, mkdtempSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const esteArchivo = fileURLToPath(import.meta.url);
const patronNativo = new RegExp(`^sharp-${process.platform}(musl)?-${process.arch}$`);

const dirNodeModules = () =>
  path.dirname(path.dirname(require.resolve("sharp/package.json")));

const dirImg = () => path.join(dirNodeModules(), "@img");

const listarBinarios = () => {
  try {
    return readdirSync(dirImg()).filter((n) => !n.startsWith("."));
  } catch {
    return [];
  }
};

const wasmInstalado = () => listarBinarios().includes("sharp-wasm32");

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
      console.error("\ncheck-sharp: sharp no se puede cargar.\n");
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
  console.error(`  npm               : ${npmVersion ?? "(no se pudo ejecutar)"}`);

  // Se instala en un directorio aparte y después se copia. Pedirlo sobre el
  // árbol del proyecto no sirve: npm ve el paquete en el lockfile como
  // dependencia opcional de sharp saltada por CPU, da el árbol por completo y
  // responde "up to date" sin instalar nada. En un directorio limpio no hay
  // árbol previo que consultar, y --force salta la comprobación de plataforma
  // (el paquete declara cpu=wasm32; es WebAssembly, corre en cualquier CPU).
  const temporal = mkdtempSync(path.join(tmpdir(), "sharp-wasm-"));
  const args = [
    "install",
    "--force",
    "--no-save",
    "--no-audit",
    "--no-fund",
    "--prefix",
    temporal,
    `@img/sharp-wasm32@${version}`
  ];
  console.error(`  ejecutando        : npm ${args.join(" ")}`);
  const npm = spawnSync("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (npm.error) {
    console.error(`  npm falló         : ${npm.error.code ?? npm.error.message}`);
    return false;
  }
  if (npm.status !== 0) return false;

  try {
    // force:false deja intacto lo que el proyecto ya tenga.
    cpSync(path.join(temporal, "node_modules"), dirNodeModules(), {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  } catch (err) {
    console.error(`  no se pudo copiar : ${err.code ?? err.message}`);
    return false;
  } finally {
    rmSync(temporal, { recursive: true, force: true });
  }

  // Confirmar que el binario quedó donde sharp lo va a buscar.
  return wasmInstalado();
};

/**
 * Sale sin romper el build. Si sharp no se puede usar, astro.config.mjs lo
 * detecta solo y cae al servicio de imágenes `passthrough`: las imágenes se
 * copian sin optimizar, pero el deploy sale. Con MB_SHARP_ESTRICTO=1 el script
 * vuelve a fallar duro (útil en local, donde sharp sí debería funcionar).
 */
const rendirse = (motivo) => {
  console.error(`\ncheck-sharp: ${motivo}`);
  console.error(
    "  El build sigue igual: astro.config.mjs usará el servicio de imágenes\n" +
      "  `passthrough` y las imágenes se copiarán sin optimizar.\n"
  );
  process.exit(process.env.MB_SHARP_ESTRICTO === "1" ? 1 : 0);
};

const primero = verificar();
if (primero.status === 0) process.exit(0);

const version = versionSharp();
if (!version) rendirse("sharp no está instalado. Revisa el `npm ci` del build.");

console.error(
  "\ncheck-sharp: pasando al binario WebAssembly de sharp " +
    "(más lento, pero corre en cualquier CPU con soporte SIMD).\n"
);

// Lo normal es que el binario ya venga de la fase de install (nixpacks.toml).
// Instalarlo aquí es el plan B, para builds que no pasan por ahí.
if (wasmInstalado() || instalarWasm(version)) {
  // Solo si el nativo está pero el CPU no lo admite: si simplemente faltaba,
  // quitarlo no aporta y podría tirar un binario que sí sirve.
  if (primero.status === 2) {
    const quitados = quitarNativos();
    if (quitados.length) {
      console.error(`  binarios quitados : ${quitados.join(", ")} (el CPU no los admite)`);
    }
  }
  const segundo = verificar({ MB_SHARP_DIAGNOSTICO: "1" });
  if (segundo.status === 0) process.exit(0);
  rendirse("ni el binario nativo ni el de WebAssembly funcionan en este CPU.");
}

console.error("\n  la instalación de @img/sharp-wasm32 falló.\n");
verificar({ MB_SHARP_DIAGNOSTICO: "1" });
rendirse("no se pudo dejar sharp operativo.");
