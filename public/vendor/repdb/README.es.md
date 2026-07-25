# RepDB Free Tier — README

Gracias por descargar RepDB. Este es el **plan gratuito** del dataset de
ejercicios de RepDB: 400 ejercicios con imágenes WebP en estilo flat
y textos completos en EN/DE/ES, gratis para uso personal **y comercial**
dentro de tus aplicaciones bajo una licencia de atribución en lenguaje claro
(ver `LICENSE.es.md` y el resumen más abajo).

## Contenido

```
free.json          — 400 ejercicios (esquema v3), completo EN + DE + ES
free.en.json       — vista monolingüe ligera (`name`/`description`/...)
free.de.json       — lo mismo, alemán
free.es.json       — lo mismo, español
exercise-list.json — manifiesto de cobertura: slug + nombre (EN/DE/ES) + categoría de TODOS los ejercicios del dataset de pago completo (no solo este plan gratuito)
index.html         — visor offline autónomo: ábrelo directamente en el navegador (file://), sin servidor
images/
  flat/            — WebP estilo flat, 512×512, fondo sólido diseñado
  muscles/         — diagramas anatómicos de músculos en WebP
  equipment/       — iconos de equipamiento en WebP
upgrade-samples/   — vistas previas de animaciones con calidad del plan Standard (5 clips WebP transparentes en bucle) — SOLO PARA EVALUACIÓN, ver la cláusula upgrade-samples en LICENSE.md
  README.md        — condiciones de las muestras: solo evaluación, cláusula upgrade-samples en LICENSE.md
README.md          — versión en inglés
README.de.md       — alemán
README.es.md       — este archivo (español)
LICENSE.md         — licencia de atribución del plan gratuito (inglés)
LICENSE.de.md      — alemán
LICENSE.es.md      — español
ATTRIBUTION.md     — atribución lista para README, HTML o créditos de la app
```

Cada ejercicio incluye nombre, descripción, instrucciones paso a paso y
consejos en inglés, alemán y español, más categoría, dificultad, músculos
primarios y secundarios, equipamiento, objetivos, tags y un valor MET para
estimar calorías.

## Atribución (obligatoria)

La licencia es gratuita para uso comercial dentro de aplicaciones, pero exige
**un enlace visible**:

> Exercise data by [RepDB](https://repdb.co)

Ponlo en la pantalla de acerca de/créditos de tu app, en el README de tu
proyecto o en el pie de página de tu web — donde mejor encaje. Ese es todo el
precio. Ver `LICENSE.es.md`.

## Inicio rápido

### JSON — multilingüe completo

```js
const data = await fetch("/free.json").then(r => r.json());
console.log(data.exercises.length); // ejercicios en este plan gratuito
console.log(data.exercises[0].name_en, data.exercises[0].name_es);
```

### JSON — un solo idioma (más pequeño, más simple)

```js
const data = await fetch("/free.es.json").then(r => r.json());
console.log(data.exercises[0].name);              // "Rueda Abdominal" — campo directo
console.log(data.enum_labels.category[data.exercises[0].category]); // "Fuerza"
```

`enum_labels` cubre `category`, `force_type`, `mechanic`, `difficulty`,
`body_part` y `goals`, así puedes mostrar campos basados en slug sin tener
que mantener tu propia tabla de traducciones.

### Imágenes

Las imágenes de ejercicios son WebP de 512×512 en estilo de ilustración plana
(fondo sólido diseñado, listas para usar tal cual):

```
images/flat/bench-press-start.webp
images/flat/bench-press-peak.webp
```

La mayoría de los ejercicios tienen un par `start` + `peak` (posición inicial
y pico del movimiento). Los **ejercicios estáticos** (plank, dead-hang,
wall-sit, …) tienen en su lugar una única imagen `main`:

```
images/flat/plank-main.webp
```

No des el par por sentado — el campo `images` de cada ejercicio lista
exactamente qué variantes existen (`{"flat": ["start", "peak"]}` o
`{"flat": ["main"]}`); construye tus rutas a partir de él.

**Imágenes con alias.** Algunos ejercicios son variantes visuales de otro
ejercicio y reutilizan sus imágenes en lugar de traer las suyas propias.
Estos llevan un campo `image_alias` — construye los nombres de archivo a
partir del slug del alias, no del `id`:

```js
const slug = ex.image_alias ?? ex.id;
const path = `images/flat/${slug}-${variant}.webp`;
```

Músculos y equipamiento se referencian por su campo `image` en el JSON:

```js
const muscle = data.muscles["biceps_brachii"];
const imgPath = `images/muscles/${muscle.image}`;  // → images/muscles/biceps-brachii.webp

const equip = data.equipment["barbell"];
const imgPath = `images/equipment/${equip.image}`;  // → images/equipment/barbell.webp
```

## Snapshot y actualizaciones

El plan gratuito es un **snapshot con fecha** (2026-07-04) del dataset
de RepDB: los 400 ejercicios más antiguos a la fecha de corte. Podemos
actualizarlo de vez en cuando; seguirá por detrás del dataset de pago. Consulta
`exercise-list.json` para ver lo que contiene el dataset de pago actual.

## upgrade-samples/ — solo para evaluación

La carpeta `upgrade-samples/` contiene cinco animaciones de ejercicios en bucle
con **calidad del plan Standard** — WebP con fondo transparente, los mismos
clips que se muestran en https://repdb.co. Están ahí para que puedas juzgar la
calidad de las animaciones de los planes de pago antes de comprar — están
licenciados **solo para evaluación** y no pueden usarse en apps en producción
ni redistribuirse (ver la cláusula upgrade-samples en `LICENSE.md`). El plan
Standard añade animaciones en bucle como estas para la mayoría de los
ejercicios.

## Upgrade: Free vs Starter vs Standard

|  | Free | Starter | Standard |
|---|---|---|---|
| Ejercicios | 400 (snapshot con fecha) | dataset completo al comprar | dataset completo al comprar |
| Resolución de imagen | 512×512 | 1024×1024 | 1024×1024 |
| Estilo flat | ✓ | ✓ | ✓ |
| Estilo classic | — | ✓ fondo blanco | ✓ fondo **transparente** |
| Animaciones | — (5 muestras de vista previa) | — | ✓ WebP transparente en bucle (la mayoría de ejercicios) |
| Versiones futuras | puede recibir un snapshot más reciente | no incluidas salvo que se indique al comprar | no incluidas salvo que se indique al comprar |
| Licencia | atribución, uso en apps | comercial | comercial |

Planes y precios actuales: https://repdb.co/pricing

## Esquema de un vistazo

Nivel superior del JSON (`free.json` completo):
- `schema_version` — entero, actualmente `3`.
- `generated_at` — marca de tiempo de build en ISO8601 UTC.
- `locales` — `["de", "en", "es"]`.
- `exercises[]` — ver más abajo.
- `muscles` — tabla de lookup con traducciones; cada entrada tiene un campo
  `image`. Sirve desde `images/muscles/`.
- `equipment` — misma forma, desde `images/equipment/`.

Los archivos monolingües ligeros (`free.{en,de,es}.json`) sustituyen los
campos con sufijo `_en/_de/_es` por `name`/`description`/`instructions`/
`tips` directos para el idioma elegido, y añaden un mapa `enum_labels` en el
nivel superior.

Por ejercicio:
- `id` (slug), `name_{en,de,es}`, `description_{en,de,es}`
- `instructions_{en,de,es}` (array de strings)
- `tips_{en,de,es}` (array de strings, cuando existe)
- `category`, `force_type`, `mechanic`, `difficulty`
- `equipment`, `body_part`, `primary_muscles[]`, `secondary_muscles[]`
- `goals[]`, `tags[]`, `variation_group`
- `is_unilateral`, `is_bodyweight` — flags booleanos
- `met` — valor MET para estimar calorías
- `image_alias` — cuando existe, construye las rutas de imagen a partir de
  este slug en lugar del `id` (ver "Imágenes con alias" más arriba)
- `images` — qué variantes de imagen existen, p. ej.
  `{"flat": ["start", "peak"]}` o `{"flat": ["main"]}` para ejercicios
  estáticos

## Resumen de la licencia

Texto completo en `LICENSE.es.md` (vinculante: `LICENSE.md`). En resumen:

1. Gratis para uso personal **y comercial** dentro de aplicaciones.
2. Atribución obligatoria — un enlace visible «Exercise data by RepDB
   (repdb.co)».
3. Prohibida la redistribución como dataset, repositorio de datasets o API —
   solo uso dentro de aplicaciones.
4. Redimensionar/recortar/recolorear para uso en apps está permitido; los
   derivados escalados o sin fondo quedan sujetos a la misma prohibición de
   redistribución.
5. Prohibida la derivación mediante IA generativa — las imágenes no pueden
   usarse en pipelines de image-to-image, transferencia de estilo o entrenamiento
   de modelos; los resultados se consideran datasets derivados.
6. `upgrade-samples/` es solo para evaluación — no para uso en producción.
7. Sin garantía; no es asesoramiento médico.

## Soporte

¿Preguntas? support@repdb.co
