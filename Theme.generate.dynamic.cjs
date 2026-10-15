
/* eslint-disable */

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const themeDir = path.join(
  root,
  'packages/@stellar/core/src/theme'
);

const lightFile = path.join(themeDir, 'light.css');
const darkFile = path.join(themeDir, 'dark.css');

const outputFile = path.join(
  themeDir,
  'theme.generated.ts'
);

const write = process.argv.includes('--write');

/**
 * Reads CSS custom properties from a theme file.
 */
function readTokens(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const css = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const tokens = new Map();
  const regex = /(--[\w-]+)\s*:\s*([^;{}]+);/g;

  for (const match of css.matchAll(regex)) {
    const [, name, rawValue] = match;

    if (tokens.has(name)) {
      throw new Error(`Duplicate CSS variable: ${name}`);
    }

    tokens.set(name, rawValue.trim());
  }

  if (tokens.size === 0) {
    throw new Error(`No CSS tokens found in ${file}`);
  }

  return tokens;
}

/**
 * Converts numeric CSS values to numbers.
 * Preserves other CSS values as strings.
 */
function toNumberOrString(value) {
  const normalized = value.trim();

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
}

/**
 * Converts CSS variable names into public theme paths.
 */
function tokenPath(cssName) {
  const parts = cssName.replace(/^--/, '').split('-');

  if (parts[0] === 'color') {
    return parts;
  }

  if (parts[0] === 'elevation') {
    return parts;
  }

  if (parts[0] === 'shadow') {
    return parts;
  }

  // Example: numeric-padding-x-px-1 -> spacing.x["1"]
  if (parts[0] === 'numeric' && parts[1] === 'padding') {
    const axis = parts[2];
    const unit = parts[3];
    const index = parts.slice(4).join('-');

    if (
      ['x', 'y'].includes(axis) &&
      unit === `p${axis}` &&
      index
    ) {
      return [
        'spacing',
        axis,
        index.replace(/^(\d+)-(\d+)$/, '$1.$2'),
      ];
    }
  }

  // Example: numeric-gap-gap-2 -> spacing.gap["2"]
  if (
    parts[0] === 'numeric' &&
    parts[1] === 'gap' &&
    parts[2] === 'gap'
  ) {
    const index = parts.slice(3).join('-');

    if (index) {
      return [
        'spacing',
        'gap',
        index.replace(/^(\d+)-(\d+)$/, '$1.$2'),
      ];
    }
  }

  // Example: numeric-corner-rounded-md -> shape.borderRadius.md
  if (
    parts[0] === 'numeric' &&
    parts[1] === 'corner' &&
    parts[2] === 'rounded'
  ) {
    return ['shape', 'borderRadius', ...parts.slice(3)];
  }

  // Preserve the original segments for unknown token families.
  return parts;
}

/**
 * Inserts a token into a nested object.
 */
function setNested(target, keys, value, cssName) {
  let current = target;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const last = i === keys.length - 1;

    if (last) {
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        throw new Error(
          `Path collision at "${keys.join('.')}" (${cssName})`
        );
      }

      current[key] = value;
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(current, key) &&
      (
        current[key] === null ||
        typeof current[key] !== 'object' ||
        Array.isArray(current[key])
      )
    ) {
      throw new Error(
        `Structure collision at "${keys.join('.')}" (${cssName})`
      );
    }

    current[key] ??= {};
    current = current[key];
  }
}

/**
 * Builds a nested theme object.
 * Moves parent tokens to a "default" property when necessary.
 */
function buildTheme(tokens) {
  const entries = [...tokens].map(([name, rawValue]) => ({
    name,
    value: toNumberOrString(rawValue),
    keys: tokenPath(name),
  }));

  const result = {};

  for (const entry of entries) {
    const hasChildren = entries.some(
      (other) =>
        other.keys.length > entry.keys.length &&
        entry.keys.every(
          (key, index) => key === other.keys[index]
        )
    );

    let keys = entry.keys;

    if (hasChildren) {
      if (keys[keys.length - 1] === 'default') {
        throw new Error(
          `Cannot normalize "${entry.name}": ` +
          'its path already ends with "default".'
        );
      }

      keys = [...keys, 'default'];
    }

    setNested(result, keys, entry.value, entry.name);
  }

  return result;
}

/**
 * Ensures both themes define exactly the same token names.
 */
function validateTokens(light, dark) {
  const missingInDark = [...light.keys()].filter(
    (name) => !dark.has(name)
  );

  const missingInLight = [...dark.keys()].filter(
    (name) => !light.has(name)
  );

  if (missingInDark.length || missingInLight.length) {
    if (missingInDark.length) {
      console.error('Missing from dark.css:', missingInDark);
    }

    if (missingInLight.length) {
      console.error('Missing from light.css:', missingInLight);
    }

    throw new Error(
      'Theme token mismatch. Align light.css and dark.css before generating.'
    );
  }

  console.log('Token validation passed.');
}

/**
 * Generates the TypeScript theme module.
 */
function main() {
  const lightTokens = readTokens(lightFile);
  const darkTokens = readTokens(darkFile);

  validateTokens(lightTokens, darkTokens);

  const lightTheme = buildTheme(lightTokens);
  const darkTheme = buildTheme(darkTokens);

  const generated = `// Auto-generated file. Do not edit manually.

const light = ${JSON.stringify(lightTheme, null, 2)} as const;

const dark = ${JSON.stringify(darkTheme, null, 2)} as const;

export type StellarTheme = typeof light | typeof dark;

/**
 * Returns the active theme based on the root DOM attributes.
 * Defaults to light when the theme cannot be determined.
 */
function getActiveTheme(): StellarTheme {
  if (typeof document === 'undefined') {
    return light;
  }

  const root = document.documentElement;

  const mode =
    root.getAttribute('data-theme') ??
    root.getAttribute('theme-mode');

  return mode?.toLowerCase() === 'dark' ? dark : light;
}

/**
 * Public theme API.
 * The current theme is resolved each time it is accessed.
 */
export const theme = {
  light,
  dark,

  get current(): StellarTheme {
    return getActiveTheme();
  },
} as const;
`;

  console.log(\`Light theme tokens: \${lightTokens.size}\`);
  console.log(\`Dark theme tokens: \${darkTokens.size}\`);

  if (!write) {
    console.log('\\nDry run: no files were modified.');
    console.log('Run with --write to generate the TypeScript file.');
    console.log(\`Output: \${outputFile}\`);
    return;
  }

  fs.writeFileSync(outputFile, generated, 'utf8');

  console.log(\`Generated: \${outputFile}\`);
}

try {
  main();
} catch (error) {
  console.error('Theme generation failed:', error.message);
  process.exitCode = 1;
}
