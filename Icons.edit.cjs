
/* eslint-disable */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(
  'packages/@stellar/core/src/components/atoms/icons'
);

const write = process.argv.includes('--write');

if (!fs.existsSync(root)) {
  console.error(`Dossier introuvable : ${root}`);
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    // Ne jamais modifier le dossier flags.
    if (entry.isDirectory() && entry.name === 'flags') {
      return [];
    }

    const file = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return walk(file);
    }

    return entry.isFile() &&
      entry.name.endsWith('.tsx') &&
      !entry.name.endsWith('.stories.tsx')
      ? [file]
      : [];
  });
}

let changed = 0;
let skipped = 0;

for (const file of walk(root)) {
  const original = fs.readFileSync(file, 'utf8');

  // Ignore les composants déjà migrés.
  if (original.includes('private defaultAttrs')) {
    skipped++;
    continue;
  }

  // Repère attrs avec son objet de valeurs par défaut.
  const propPattern =
    /@Prop\(\)\s*attrs\?\s*:\s*\{([\s\S]*?)\}\s*=\s*\{([\s\S]*?)\}\s*;/;

  const match = original.match(propPattern);

  if (!match) {
    skipped++;
    continue;
  }

  const [, types, defaults] = match;

  // Conserve les propriétés et les valeurs par défaut propres à l'icône.
  let updated = original.replace(
    propPattern,
    `@Prop()\n  attrs?: {${types}};\n\n  private defaultAttrs = {${defaults}};`
  );

  const renderPattern = /render\s*\(\s*\)\s*\{/;
  const renderMatch = updated.match(renderPattern);

  if (!renderMatch || renderMatch.index === undefined) {
    skipped++;
    console.warn('render() non reconnu :', file);
    continue;
  }

  const renderStart = renderMatch.index + renderMatch[0].length;
  const beforeRender = updated.slice(0, renderStart);
  let renderBody = updated.slice(renderStart);

  // Utilise attrs dans la condition et dans le JSX.
  renderBody = renderBody.replace(/\bthis\.attrs\b/g, 'attrs');

  // Fusionne les valeurs par défaut avec les attributs reçus.
  updated =
    beforeRender +
    '\n    const attrs = { ...this.defaultAttrs, ...this.attrs };' +
    renderBody;

  // Vérification minimale avant d'accepter la transformation.
  if (
    !updated.includes('private defaultAttrs') ||
    !updated.includes('const attrs = { ...this.defaultAttrs, ...this.attrs };')
  ) {
    skipped++;
    console.warn('Transformation incomplète :', file);
    continue;
  }

  changed++;

  console.log(
    `${write ? 'Modifié' : 'À modifier'} : ${path.relative(
      process.cwd(),
      file
    )}`
  );

  if (write) {
    fs.writeFileSync(file, updated, 'utf8');
  }
}

console.log(
  `\n${changed} fichier(s) ${write ? 'modifié(s)' : 'à modifier'}.`
);
console.log(`${skipped} fichier(s) ignoré(s).`);

if (!write) {
  console.log('\nSimulation uniquement : aucun fichier modifié.');
  console.log('Ajoute --write pour appliquer les changements.');
}
