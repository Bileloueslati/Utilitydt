import StyleDictionary from "style-dictionary";
import { formats, transformGroups } from "style-dictionary/enums";

const baseSources = [
  "tokens-generated/primitive.json",
  "tokens-generated/semantic-light.json"
];

const darkSources = [
  ...baseSources,
  "tokens-generated/semantic-dark.json"
];

const light = new StyleDictionary({
  source: baseSources,

  platforms: {
    css: {
      transformGroup: transformGroups.css,

      buildPath: "src/theme/",

      files: [
        {
          destination: "light.css",
          format: formats.cssVariables
        }
      ]
    }
  }
});

const dark = new StyleDictionary({
  source: darkSources,

  platforms: {
    css: {
      transformGroup: transformGroups.css,

      buildPath: "src/theme/",

      files: [
        {
          destination: "dark.css",
          format: "css/theme-dark"
        }
      ]
    }
  }
});

await light.buildAllPlatforms();
await dark.buildAllPlatforms();
