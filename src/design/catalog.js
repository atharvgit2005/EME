// Versioned editorial decisions shared by footage and motion graphics.
const VERSION = "eme-design.v1";
const { LIMITS, DEFAULTS } = require("./parameters.js");
const PROFILES = {
  neobrutalism: {
    name: "Neobrutalism",
    description:
      "Bold black type, yellow blocks, heavy borders and hard offset shadows.",
    background: "#ffe44d",
    surface: "#ffe44d",
    foreground: "#111111",
    accent: "#111111",
    borderPx: 4,
    shadowPx: 9,
    textStrokePx: 1,
    titleRatio: 0.092,
    marginRatio: 0.075,
    entrySeconds: 0.2,
    exitSeconds: 0.2,
    travelRatio: 0.014,
    wordsPerSecond: 2.8,
  },
  editorial: {
    name: "Editorial",
    description: "Generous spacing, warm paper and restrained motion.",
    background: "#202522",
    surface: "#202522",
    foreground: "#f5f0e5",
    accent: "#e8b071",
    titleRatio: 0.069,
    marginRatio: 0.085,
    entrySeconds: 0.4,
    exitSeconds: 0.3,
    travelRatio: 0.009,
    wordsPerSecond: 2.5,
  },
  balanced: {
    name: "Balanced",
    description: "Clear hierarchy, cool neutral surfaces and moderate motion.",
    background: "#17252d",
    surface: "#17252d",
    foreground: "#f1f5f7",
    accent: "#89d3cf",
    titleRatio: 0.075,
    marginRatio: 0.075,
    entrySeconds: 0.3,
    exitSeconds: 0.25,
    travelRatio: 0.018,
    wordsPerSecond: 2.8,
  },
  energetic: {
    name: "Energetic",
    description: "Larger type, compact spacing and a brisk entrance.",
    background: "#291d29",
    surface: "#291d29",
    foreground: "#fff4ec",
    accent: "#ffb48c",
    titleRatio: 0.082,
    marginRatio: 0.065,
    entrySeconds: 0.2,
    exitSeconds: 0.2,
    travelRatio: 0.028,
    wordsPerSecond: 3,
  },
};
const RECIPES = {
  "lower-third": {
    name: "Footage lower third",
    maxTitleLines: 2,
    maxBodyLines: 2,
    requiresVideo: true,
  },
  "title-card": {
    name: "Title card",
    maxTitleLines: 3,
    maxBodyLines: 3,
    requiresVideo: false,
  },
  "statistic-card": {
    name: "Statistic card",
    maxTitleLines: 2,
    maxBodyLines: 3,
    requiresVideo: false,
  },
};
for (const entry of [...Object.values(PROFILES), ...Object.values(RECIPES)])
  Object.freeze(entry);
Object.freeze(PROFILES);
Object.freeze(RECIPES);
function catalog() {
  return structuredClone({
    version: VERSION,
    profiles: PROFILES,
    recipes: RECIPES,
    parameters: {
      defaults: DEFAULTS,
      limits: LIMITS,
      variationModes: ["styles", "parameters"],
      variationAxes: Object.keys(LIMITS),
    },
    motion:
      "Smoothstep entrance sampled into native linear x/y/opacity keyframes; static hold; fade exit.",
    limits: [
      "No automatic story or shot selection in v1.",
      "Lower thirds do not establish subject-safe placement. Use the scene placement tool for that requirement.",
      "Cards cover footage during their interval. Audio is preserved.",
    ],
  });
}
module.exports = { VERSION, PROFILES, RECIPES, catalog };
