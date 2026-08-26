/**
 * Recorta las fichas compuestas de "Antes y después" en dos fotos limpias.
 *
 * Los originales que entregó la clínica son una sola imagen de 1400x1185 que ya
 * trae quemados el titular, el logo, el marco y las etiquetas Antes/Después. Eso
 * obliga a la web a repetir la cabecera de la sección dentro de cada tarjeta, a
 * dibujar el texto encima de la foto (donde choca con el "Después" quemado) y a
 * gastar casi un tercio del alto en adorno. Con las fotos sueltas, el titular y
 * las etiquetas los pone el HTML: se traducen, se leen y no se pixelan.
 *
 * Las cajas de recorte se detectan, no se fijan a mano, porque las fichas no
 * comparten diagrama: los retratos van lado a lado y los primeros planos de la
 * boca van apilados. Las fotos son gris claro sobre fondo blanco, así que basta
 * con perfilar cuántos píxeles no-blancos hay por fila y por columna: dos
 * bandas de filas significa apilado, una sola significa lado a lado.
 *
 * Cada par sale con dimensiones idénticas, pero la proporción es la nativa de
 * la foto: forzar 4:5 a un primer plano de la arcada le cortaría las piezas de
 * los extremos. El componente decide el diagrama a partir de esa proporción.
 *
 *   node scripts/recortar-casos.js            # solo informa las cajas
 *   node scripts/recortar-casos.js --escribir # además genera los .webp
 *
 * Los compuestos ya no están en el árbol: `src/assets/**` se importa entero con
 * un glob eager, así que dejarlos ahí los habría metido en el bundle sin que
 * nadie los use. Para volver a correr esto hay que recuperarlos primero:
 *
 *   git show 80358cb:src/assets/cases/implantes_dentales.webp > src/assets/cases/implantes_dentales.webp
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dirCasos = path.join(raiz, "src", "assets", "cases");

/** Origen compuesto -> prefijo de los dos archivos que salen de él. */
const FICHAS = [
  { origen: "implantes_dentales.webp", id: "protesis-01" },
  { origen: "tratamiento_periodontal.webp", id: "periodoncia-protesis-01" },
  { origen: "restauracion.webp", id: "restauracion-01" },
  { origen: "periodoncia.webp", id: "periodoncia-01" },
  { origen: "Sculptra.webp", id: "armonizacion-01" },
  { origen: "rinomodelacion.webp", id: "rinomodelacion-01" }
];

// Un píxel cuenta como "contenido" bajo este valor de gris. El papel de la
// ficha es blanco puro; el fondo de estudio de las fotos ronda el 200.
const UMBRAL_GRIS = 245;
// Fracción de la línea que debe ser contenido para considerarla parte de la foto.
// En apilado las etiquetas "Antes"/"Después" van al costado, así que la foto no
// cruza la ficha entera: el umbral de fila tiene que quedar por debajo de eso.
const COBERTURA_FILA = 0.5;
const COBERTURA_COLUMNA = 0.5;
// Tamaño mínimo de una banda de fotos. Filtra los filetes dorados de la
// cabecera, que también cruzan media ficha pero miden dos o tres píxeles.
const LADO_MINIMO_BANDA = 100;
// Lado mínimo de cada foto, para descartar restos de texto entre columnas.
const LADO_MINIMO_FOTO = 150;

// Ancho de salida según orientación. El alto sale de la proporción detectada.
const ANCHO_RETRATO = 800;
const ANCHO_APAISADO = 1100;
const CALIDAD = 82;

/** Tramos contiguos de `perfil` que superan `umbral`, de mayor a menor. */
const tramos = (perfil, umbral, minimo) => {
  const encontrados = [];
  let inicio = null;
  perfil.forEach((valor, i) => {
    if (valor >= umbral) {
      if (inicio === null) inicio = i;
    } else if (inicio !== null) {
      if (i - inicio >= minimo) encontrados.push({ inicio, fin: i, largo: i - inicio });
      inicio = null;
    }
  });
  if (inicio !== null && perfil.length - inicio >= minimo) {
    encontrados.push({ inicio, fin: perfil.length, largo: perfil.length - inicio });
  }
  return encontrados.sort((a, b) => b.largo - a.largo);
};

const detectar = async (archivo) => {
  const { data, info } = await sharp(archivo)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: ancho, height: alto } = info;

  const porFila = new Array(alto).fill(0);
  const contenido = new Uint8Array(ancho * alto);
  for (let y = 0; y < alto; y += 1) {
    let cuenta = 0;
    for (let x = 0; x < ancho; x += 1) {
      const esContenido = data[y * ancho + x] < UMBRAL_GRIS ? 1 : 0;
      contenido[y * ancho + x] = esContenido;
      cuenta += esContenido;
    }
    porFila[y] = cuenta / ancho;
  }

  /** Tramos de columna con contenido dentro de la franja de filas dada. */
  const columnasEntre = (desde, hasta) => {
    const filas = hasta - desde;
    const porColumna = new Array(ancho).fill(0);
    for (let x = 0; x < ancho; x += 1) {
      let cuenta = 0;
      for (let y = desde; y < hasta; y += 1) cuenta += contenido[y * ancho + x];
      porColumna[x] = cuenta / filas;
    }
    return tramos(porColumna, COBERTURA_COLUMNA, LADO_MINIMO_FOTO);
  };

  const bandas = tramos(porFila, COBERTURA_FILA, LADO_MINIMO_BANDA);
  if (!bandas.length) throw new Error("no se encontró ninguna banda de fotos");

  // Dos bandas de filas = ficha apilada (antes arriba, después abajo).
  if (bandas.length >= 2) {
    return bandas
      .slice(0, 2)
      .sort((a, b) => a.inicio - b.inicio)
      .map((banda) => {
        const [columna] = columnasEntre(banda.inicio, banda.fin);
        if (!columna) throw new Error("banda apilada sin columnas de contenido");
        return {
          left: columna.inicio,
          top: banda.inicio,
          width: columna.fin - columna.inicio,
          height: banda.fin - banda.inicio
        };
      });
  }

  // Una sola banda = ficha lado a lado.
  const [banda] = bandas;
  const columnas = columnasEntre(banda.inicio, banda.fin)
    .slice(0, 2)
    .sort((a, b) => a.inicio - b.inicio);
  if (columnas.length !== 2) {
    throw new Error(`se esperaban 2 fotos, se detectaron ${columnas.length}`);
  }

  return columnas.map((columna) => ({
    left: columna.inicio,
    top: banda.inicio,
    width: columna.fin - columna.inicio,
    height: banda.fin - banda.inicio
  }));
};

const escribir = process.argv.includes("--escribir");
let fallos = 0;

for (const ficha of FICHAS) {
  const archivo = path.join(dirCasos, ficha.origen);
  try {
    const [antes, despues] = await detectar(archivo);
    const razon = (c) => c.width / c.height;

    // Ambas fotos del par salen del mismo tamaño para que la tarjeta no cojee.
    // La proporción es la media de las dos cajas, que difieren en decimales.
    const proporcion = (razon(antes) + razon(despues)) / 2;
    const apaisada = proporcion >= 1;
    const salidaAncho = apaisada ? ANCHO_APAISADO : ANCHO_RETRATO;
    const salidaAlto = Math.round(salidaAncho / proporcion);
    // En retrato lo que sobra es hombro, no cara: recortar por abajo.
    const posicion = apaisada ? "centre" : "top";

    console.log(
      `${ficha.origen.padEnd(30)} ${apaisada ? "apaisada" : "retrato "} ` +
        `${salidaAncho}x${salidaAlto} (r=${proporcion.toFixed(3)})\n` +
        `${"".padEnd(30)} antes ${JSON.stringify(antes)}\n` +
        `${"".padEnd(30)} desp. ${JSON.stringify(despues)}`
    );

    if (!escribir) continue;

    for (const [sufijo, caja] of [
      ["antes", antes],
      ["despues", despues]
    ]) {
      const destino = path.join(dirCasos, `${ficha.id}-${sufijo}.webp`);
      await sharp(archivo)
        .extract(caja)
        .resize(salidaAncho, salidaAlto, { fit: "cover", position: posicion })
        .webp({ quality: CALIDAD })
        .toFile(destino);
      console.log(`  -> ${path.basename(destino)}`);
    }
  } catch (error) {
    fallos += 1;
    console.error(`${ficha.origen}: ${error.message}`);
  }
}

if (fallos) {
  console.error(`\n${fallos} ficha(s) sin recortar. Revisa los umbrales.`);
  process.exit(1);
}
