
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const themeDir = path.join(rootDir, 'packages/@stellar/core/src/theme');

const lightFile = path.join(themeDir, 'light.css');
const darkFile = path.join(themeDir, 'dark.css');
const outputFile = path.join(themeDir, 'theme.generated.ts');

/**
 * Reads CSS custom properties from a theme file.
 */
function readTokens(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Theme file not found: ${filePath}`);
  }

  const css = fs
    .readFileSync(filePath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const tokens = new Map();
  const regex = /--([\w-]+)\s*:\s*([^;{}]+);/g;

  for (const match of css.matchAll(regex)) {
    const name = match[1];
    const value = match[2].trim();

    if (tokens.has(name)) {
      throw new Error(
        `Duplicate CSS variable "--${name}" in ${path.basename(filePath)}.`,
      );
    }

    tokens.set(name, value);
  }

  if (tokens.size === 0) {
    throw new Error(`No CSS variables found in ${filePath}`);
  }

  return tokens;
}

/**
 * Validates that both themes define the same CSS variables.
 */
function validateTokens(lightTokens, darkTokens) {
  const lightNames = new Set(lightTokens.keys());
  const darkNames = new Set(darkTokens.keys());

  const missingInDark = [...lightNames].filter(
    (name) => !darkNames.has(name),
  );

  const missingInLight = [...darkNames].filter(
    (name) => !lightNames.has(name),
  );

  if (missingInDark.length || missingInLight.length) {
    const details = [
      missingInDark.length
        ? `Missing in dark.css: ${missingInDark.join(', ')}`
        : '',
      missingInLight.length
        ? `Missing in light.css: ${missingInLight.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    throw new Error(`Theme token mismatch.\n${details}`);
  }

  console.log(
    `Token validation passed: both themes contain ${lightTokens.size} variables.`,
  );
}

/**
 * Converts a CSS variable name into a hierarchical theme path.
 */
function tokenPath(name) {
  const parts = name.split('-');

  if (parts[0] === 'numeric') {
    const category = parts[1];

    if (category === 'padding') {
      const axis = parts[2];
      const value = parts.slice(3).join('.');

      if (axis === 'px') {
        return ['spacing', 'x', value];
      }

      if (axis === 'py') {
        return ['spacing', 'y', value];
      }
    }

    if (category === 'gap') {
      return ['spacing', 'gap', parts.slice(2).join('.')];
    }

    if (category === 'corner' && parts[2] === 'rounded') {
      return ['shape', 'borderRadius', parts.slice(3).join('-')];
    }
  }

  return parts;
}

/**
 * Resolves collisions between parent tokens and nested tokens.
 */
function getNormalizedEntries(tokens) {
  const entries = [...tokens.entries()].map(([name, value]) => ({
    name,
    value,
    path: tokenPath(name),
  }));

  for (const entry of entries) {
    const hasChildren = entries.some(
      (other) =>
        other !== entry &&
        other.path.length > entry.path.length &&
        entry.path.every((part, index) => other.path[index] === part),
    );

    if (hasChildren) {
      entry.path = [...entry.path, 'default'];
    }
  }

  const paths = new Map();

  for (const entry of entries) {
    const key = JSON.stringify(entry.path);

    if (paths.has(key)) {
      throw new Error(
        `Theme path collision: "${entry.name}" and "${paths.get(key)}" map to "${entry.path.join('.')}".`,
      );
    }

    paths.set(key, entry.name);
  }

  return entries;
}

/**
 * Inserts a value into a nested object.
 */
function setNested(target, parts, value, tokenName) {
  let current = target;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLeaf = index === parts.length - 1;

    if (isLeaf) {
      if (Object.prototype.hasOwnProperty.call(current, part)) {
        throw new Error(`Duplicate theme path for token "${tokenName}".`);
      }

      current[part] = value;
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(current, part)) {
      current[part] = {};
    }

    if (
      current[part] === null ||
      typeof current[part] !== 'object' ||
      Array.isArray(current[part])
    ) {
      throw new Error(`Theme path conflict for token "${tokenName}".`);
    }

    current = current[part];
  }
}

/**
 * Builds a nested object containing static token values.
 */
function buildStaticTheme(entries) {
  const result = {};

  for (const entry of entries) {
    setNested(result, entry.path, entry.value, entry.name);
  }

  return result;
}

/**
 * Builds a nested object containing CSS variable names.
 */
function buildCurrentTheme(entries) {
  const result = {};

  for (const entry of entries) {
    setNested(result, entry.path, entry.name, entry.name);
  }

  return result;
}

/**
 * Creates valid TypeScript property names.
 */
function propertyName(name) {
  if (/^[a-zA-Z_$][\w$]*$/.test(name)) {
    return name;
  }

  return JSON.stringify(name);
}

/**
 * Serializes a static theme object.
 */
function serializeStaticObject(value, indent = 0) {
  const padding = ' '.repeat(indent);
  const childPadding = ' '.repeat(indent + 2);

  const properties = Object.entries(value).map(([key, child]) => {
    const property = propertyName(key);

    if (child !== null && typeof child === 'object') {
      return `${childPadding}${property}: ${serializeStaticObject(child, indent + 2)},`;
    }

    return `${childPadding}${property}: ${JSON.stringify(child)},`;
  });

  return `{\n${properties.join('\n')}\n${padding}}`;
}

/**
 * Serializes getters that read the current CSS variable value.
 */
function serializeCurrentObject(value, indent = 0) {
  const padding = ' '.repeat(indent);
  const childPadding = ' '.repeat(indent + 2);

  const properties = Object.entries(value).map(([key, child]) => {
    const property = propertyName(key);

    if (child !== null && typeof child === 'object') {
      return `${childPadding}${property}: ${serializeCurrentObject(child, indent + 2)},`;
    }

    return [
      `${childPadding}get ${property}() {`,
      `${childPadding}  return getCssVariable(${JSON.stringify(`--${child}`)});`,
      `${childPadding}},`,
    ].join('\n');
  });

  return `{\n${properties.join('\n')}\n${padding}}`;
}

/**
 * Generates the TypeScript theme module.
 */
function main() {
  const lightTokens = readTokens(lightFile);
  const darkTokens = readTokens(darkFile);

  validateTokens(lightTokens, darkTokens);

  const lightEntries = getNormalizedEntries(lightTokens);
  const darkEntries = getNormalizedEntries(darkTokens);

  const lightTheme = buildStaticTheme(lightEntries);
  const darkTheme = buildStaticTheme(darkEntries);
  const currentTheme = buildCurrentTheme(lightEntries);

  const generated = `// Auto-generated file. Do not edit manually.

const light = ${serializeStaticObject(lightTheme)} as const;

const dark = ${serializeStaticObject(darkTheme)} as const;

/**
 * Theme type generated from the light and dark themes.
 */
export type StellarTheme = typeof light | typeof dark;

/**
 * Reads the current computed value of a CSS custom property.
 */
function getCssVariable(name: string): string {
  if (typeof document === 'undefined') {
    return '';
  }

  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Reads active CSS variables dynamically from the browser.
 */
const current = ${serializeCurrentObject(currentTheme)};

export const theme = {
  light,
  dark,
  current,
} as const;
`;

  if (process.argv.includes('--write')) {
    fs.writeFileSync(outputFile, generated, 'utf8');
    console.log(`Generated file: ${outputFile}`);
  } else {
    console.log(generated);
    console.log('\nRun with --write to save the generated file.');
  }
}

try {
  main();
} catch (error) {
  console.error(`Theme generation failed: ${error.message}`);
  process.exitCode = 1;
}
