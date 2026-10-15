
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const themeDir = path.join(
  rootDir,
  'packages/@stellar/core/src/theme',
);

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
 * Validates that light and dark themes define the same tokens.
 */
function validateTokens(light, dark) {
  const lightNames = new Set(light.keys());
  const darkNames = new Set(dark.keys());

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

  console.log(`Token validation passed (${light.size} tokens).`);
}

/**
 * Converts a CSS variable name into a public theme path.
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

  if (
    parts[0] === 'color' ||
    parts[0] === 'elevation' ||
    parts[0] === 'shadow'
  ) {
    return parts;
  }

  return parts;
}

/**
 * Creates a safe property name for generated TypeScript objects.
 */
function propertyName(value) {
  if (/^[a-zA-Z_$][\w$]*$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

/**
 * Builds the normalized token paths, handling parent/child collisions.
 * For example, a token named "color-text-warning" and another named
 * "color-text-warning-inverse" become warning.default and warning.inverse.
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
        `Theme path collision: "${entry.name}" and "${paths.get(key)}" both map to ${entry.path.join('.')}.`,
      );
    }

    paths.set(key, entry.name);
  }

  return entries;
}

/**
 * Inserts a token into a nested object.
 */
function setNested(target, parts, value, tokenName) {
  let current = target;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLeaf = index === parts.length - 1;

    if (isLeaf) {
      if (
        current[part] !== undefined &&
        typeof current[part] === 'object'
      ) {
        throw new Error(`Cannot assign token "${tokenName}" to an existing object.`);
      }

      current[part] = value;
      continue;
    }

    if (current[part] === undefined) {
      current[part] = {};
    }

    if (
      typeof current[part] !== 'object' ||
      current[part] === null ||
      Array.isArray(current[part])
    ) {
      throw new Error(
        `Theme path conflict while inserting "${tokenName}".`,
      );
    }

    current = current[part];
  }
}

/**
 * Builds a nested theme object from CSS tokens.
 */
function buildTheme(entries) {
  const theme = {};

  for (const entry of entries) {
    setNested(theme, entry.path, entry.value, entry.name);
  }

  return theme;
}

/**
 * Builds a nested object whose leaf properties read CSS variables at runtime.
 */
function buildCurrentTheme(entries) {
  const theme = {};

  for (const entry of entries) {
    setNested(theme, entry.path, entry.name, entry.name);
  }

  return theme;
}

/**
 * Serializes a static theme object to TypeScript.
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
 * Serializes the current theme with getters that read CSS variables on demand.
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

  const lightTheme = buildTheme(lightEntries);
  const darkTheme = buildTheme(darkEntries);
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
 * Exposes CSS variable values dynamically from the active browser theme.
 * CSS remains the source of truth for the current theme.
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
    console.log(`Theme generated: ${outputFile}`);
  } else {
    console.log(generated);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
