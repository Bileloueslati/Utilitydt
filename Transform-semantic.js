import fs from "fs";

const inputPath = "./tokens/semantic.json";
const lightPath = "./tokens-generated/semantic-light.json";
const darkPath = "./tokens-generated/semantic-dark.json";

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));

function normalizeReference(ref) {
  if (typeof ref !== "string") return ref;

  return ref
    .replace("{Primitive.", "{primitive.")
    .replace(/}/g, "}")
    .toLowerCase();
}

function transform(node) {
  const light = {};
  const dark = {};

  for (const key in node) {
    const value = node[key];

    // token avec thème
    if (value?.$value?.Light !== undefined) {
      light[key.toLowerCase()] = {
        value: normalizeReference(value.$value.Light)
      };

      dark[key.toLowerCase()] = {
        value: normalizeReference(value.$value.Dark)
      };
    }

    // token simple
    else if (value?.$value !== undefined) {
      light[key.toLowerCase()] = { value: value.$value };
      dark[key.toLowerCase()] = { value: value.$value };
    }

    // objet
    else if (typeof value === "object") {
      const result = transform(value);

      light[key.toLowerCase()] = result.light;
      dark[key.toLowerCase()] = result.dark;
    }
  }

  return { light, dark };
}

const result = transform(input);

fs.mkdirSync("./tokens-generated", { recursive: true });

fs.writeFileSync(lightPath, JSON.stringify(result.light, null, 2));
fs.writeFileSync(darkPath, JSON.stringify(result.dark, null, 2));

console.log("✅ semantic tokens generated");
