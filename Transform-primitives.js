import fs from "fs";

const inputPath = "./tokens/primitive.json";
const outputPath = "./tokens-generated/primitive.json";

const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));

function transform(node) {
  const result = {};

  for (const key in node) {
    const value = node[key];

    // cas token final
    if (value && typeof value === "object" && "$value" in value) {
      result[key.toLowerCase()] = {
        value: value.$value
      };
    }

    // cas objet
    else if (typeof value === "object") {
      result[key.toLowerCase()] = transform(value);
    }
  }

  return result;
}

const output = transform(input);

fs.mkdirSync("./tokens-generated", { recursive: true });

fs.writeFileSync(
  outputPath,
  JSON.stringify(output, null, 2)
);

console.log("✅ primitives transformed");
