
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
 * Returns a map containing variable names and values.
 */
function readTokens(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }

  const css = fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const tokens = new Map();
  const regex = /(--[\w-]+)\s*:\s*([^;]+);/g;

  for (const match of css.matchAll(regex)) {
    const name = match[1];
    const value = match[2].trim();

    if (tokens.has(name)) {
      throw new Error(
        `Duplicate CSS variable: ${name} in ${file}`
      );
    }

    tokens.set(name, value);
  }

  if (tokens.size === 0) {
    throw new Error(`No CSS tokens found in ${file}`);
  }

  return tokens;
}

/**
 * Converts numeric CSS values to JavaScript numbers.
 * Keeps colors, strings, and other values as strings.
 */
function toNumberOrString(value) {
  const normalized = value.trim();

  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized;
}

/**
 * Converts CSS variable names into nested theme paths.
 * Known token families receive a simplified public API.
 * Unknown families retain their original segments.
 */
function tokenPath(cssName) {
  const parts = cssName.replace(/^--/, '').split('-');

  // Keep color tokens grouped under theme.color.
  if (parts[0] === 'color') {
    return parts;
  }

  // Keep elevation tokens grouped under theme.elevation.
  if (parts[0] === 'elevation') {
    return parts;
  }

  // Keep shadow tokens grouped under theme.shadow.
  if (parts[0] === 'shadow') {
    return parts;
  }

  // Convert numeric padding tokens into spacing tokens.
  // Example: numeric-padding-x-px-1 -> spacing.x["1"]
  // Example: numeric-padding-y-py-0-5 -> spacing.y["0.5"]
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

  // Convert numeric gap tokens into spacing.gap.
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

  // Convert rounded corner tokens into border radius tokens.
  // Example: numeric-corner-rounded-md -> shape.borderRadius.md
  if (
    parts[0] === 'numeric' &&
    parts[1] === 'corner' &&
    parts[2] === 'rounded'
  ) {
    return ['shape', 'borderRadius', ...parts.slice(3)];
  }

  // Preserve the original structure for unknown token families.
  return parts;
}

/**
 * Inserts a value into a nested object.
 * Throws an error when a path collision is detected.
 */
function setNested(target, keys, value, cssName) {
  let current = target;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const last = i === keys.length - 1;

    if (last) {
      if (
        Object.prototype.hasOwnProperty.call(current, key)
      ) {
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
 * Builds a nested theme object from CSS tokens.
 * Moves leaf tokens to a "default" property when they
 * also act as parents for other token variants.
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
          'its path already ends with "default" ' +
          'and conflicts with a nested token.'
        );
      }

      keys = [...keys, 'default'];
    }

    setNested(result, keys, entry.value, entry.name);
  }

  return result;
}

/**
 * Compares token names between light and dark themes.
 * Reports missing variables without modifying either file.
 */
function compareTokens(light, dark) {
  const missingInDark = [...light.keys()].filter(
    (name) => !dark.has(name)
  );

  const missingInLight = [...dark.keys()].filter(
    (name) => !light.has(name)
  );

  if (missingInDark.length || missingInLight.length) {
    console.warn(
      'Warning: light.css and dark.css contain different token names.'
    );

    if (missingInDark.length) {
      console.warn('Missing from dark theme:', missingInDark);
    }

    if (missingInLight.length) {
      console.warn('Missing from light theme:', missingInLight);
    }
  } else {
    console.log(
      'Token validation passed: both themes contain the same variable names.'
    );
  }

  return missingInDark.length === 0 &&
    missingInLight.length === 0;
}

/**
 * Generates the TypeScript theme file.
 * Runs in dry-run mode unless the --write flag is provided.
 */
function main() {
  const lightTokens = readTokens(lightFile);
  const darkTokens = readTokens(darkFile);

  const tokensMatch = compareTokens(lightTokens, darkTokens);

  if (!tokensMatch) {
    throw new Error(
      'Theme token mismatch. Align light.css and dark.css before generating.'
    );
  }

  const theme = {
    light: buildTheme(lightTokens),
    dark: buildTheme(darkTokens),
  };

  const generated = [
    '// Auto-generated file. Do not edit manually.',
    '',
    'export const theme = ',
    JSON.stringify(theme, null, 2),
    ' as const;',
    '',
    'export type StellarTheme = typeof theme;',
    '',
  ].join('\n');

  console.log(`Light theme tokens: ${lightTokens.size}`);
  console.log(`Dark theme tokens: ${darkTokens.size}`);

  if (!write) {
    console.log('\nDry run: no files were modified.');
    console.log('Run with --write to generate the TypeScript file.');
    console.log(`Output file: ${outputFile}`);
    return;
  }

  fs.writeFileSync(outputFile, generated, 'utf8');

  console.log(`\nGenerated file: ${outputFile}`);
}

try {
  main();
} catch (error) {
  console.error('Theme generation failed:', error.message);
  process.exitCode = 1;
}
