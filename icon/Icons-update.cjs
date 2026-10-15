
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(
  'packages/@stellar/core/src/components/atoms/icons/customs'
);

const write = process.argv.includes('--write');

if (!fs.existsSync(root)) {
  console.error(`Dossier introuvable : ${root}`);
  process.exit(1);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
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

  // Ignore les fichiers déjà migrés.
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

  // Déplace les valeurs par défaut sans les modifier.
  let updated = original.replace(
    propPattern,
    `@Prop()\n  attrs?: {${types}};\n\n  private defaultAttrs = {${defaults}};`
  );

  // Repère render().
  const renderPattern = /render\s*\(\s*\)\s*\{/;
  const renderMatch = updated.match(renderPattern);

  if (!renderMatch || renderMatch.index === undefined) {
    skipped++;
    continue;
  }

  const renderStart = renderMatch.index + renderMatch[0].length;

  const beforeRender = updated.slice(0, renderStart);
  let renderBody = updated.slice(renderStart);

  // Préserve entièrement la condition return et son expression.
  const returnIndex = renderBody.indexOf('return');
  const conditionEnd =
    returnIndex === -1
      ? -1
      : renderBody.indexOf('? (', returnIndex);

  if (conditionEnd === -1) {
    skipped++;
    console.warn('Condition ternaire non reconnue :', file);
    continue;
  }

  // Ne remplace this.attrs qu'après le début de la branche JSX.
  const jsxStart = conditionEnd + '? ('.length;

  renderBody =
    renderBody.slice(0, jsxStart) +
    renderBody.slice(jsxStart).replace(/\bthis\.attrs\b/g, 'attrs');

  // Ajoute la fusion locale au début de render().
  updated =
    beforeRender +
    '\n    const attrs = { ...this.defaultAttrs, ...this.attrs };' +
    renderBody;

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
