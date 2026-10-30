const LIMITS = Object.freeze({
  titleScale: [0.8, 1.4],
  spacingScale: [0.75, 1.5],
  motionScale: [0, 1.75],
  holdScale: [0.8, 1.5],
});
const DEFAULTS = Object.freeze({
  titleScale: 1,
  spacingScale: 1,
  motionScale: 1,
  holdScale: 1,
});
const DIRECTIONS = {
  typography: ["titleScale", "larger", "smaller", 0.15],
  spacing: ["spacingScale", "more", "less", 0.15],
  motion: ["motionScale", "more", "less", 0.3],
  hold: ["holdScale", "longer", "shorter", 0.15],
};
function invalid(message) {
  throw Error("ERR_DESIGN_PARAMETERS: " + message);
}
function parameters(input = {}) {
  if (
    !input ||
    Object.getPrototypeOf(input) !== Object.prototype ||
    Object.keys(input).some((k) => !Object.hasOwn(LIMITS, k))
  )
    invalid("Unsupported design parameters.");
  const result = { ...DEFAULTS, ...input };
  for (const [key, [min, max]] of Object.entries(LIMITS))
    if (
      typeof result[key] !== "number" ||
      !Number.isFinite(result[key]) ||
      result[key] < min ||
      result[key] > max
    )
      invalid(`${key} must be between ${min} and ${max}.`);
  return result;
}
function adjust(base, adjustments = {}) {
  const result = parameters(base),
    axes = [],
    directions = {};
  if (!adjustments || Object.getPrototypeOf(adjustments) !== Object.prototype)
    invalid("Provide structured adjustments.");
  for (const [name, direction] of Object.entries(adjustments)) {
    const definition = DIRECTIONS[name];
    if (!definition || !definition.slice(1, 3).includes(direction))
      invalid("Unsupported adjustment: " + name);
    const [key, positive, , step] = definition,
      sign = direction === positive ? 1 : -1;
    const next = Math.round((result[key] + sign * step) * 100) / 100;
    if (next < LIMITS[key][0] || next > LIMITS[key][1])
      invalid(`${name} has reached its supported limit.`);
    result[key] = next;
    axes.push(key);
    directions[key] = sign;
  }
  return { parameters: result, axes, directions };
}
function variants(brief, directions = {}) {
  const base = parameters(brief.parameters);
  if (brief.variationMode !== "parameters")
    return brief.profiles.map((profileId) => ({
      profileId,
      variantId: "base",
      name: null,
      parameters: base,
    }));
  if (brief.profiles.length !== 1)
    invalid("Choose exactly one style for parameter variations.");
  const axes = brief.variationAxes || ["titleScale", "motionScale"];
  if (
    !Array.isArray(axes) ||
    !axes.length ||
    axes.length > 2 ||
    new Set(axes).size !== axes.length ||
    axes.some((k) => !Object.hasOwn(LIMITS, k))
  )
    invalid("Choose one or two distinct variation axes.");
  const list = [
    {
      profileId: brief.profiles[0],
      variantId: "requested",
      name: "Requested design",
      parameters: base,
    },
  ];
  const labels = {
    titleScale: ["Larger title", "Smaller title"],
    spacingScale: ["More spacing", "Tighter spacing"],
    motionScale: ["Stronger motion", "Quieter motion"],
    holdScale: ["Longer hold", "Shorter hold"],
  };
  for (const key of axes) {
    const sign = directions[key] || (key === "motionScale" ? -1 : 1),
      step = key === "motionScale" ? 0.3 : 0.12;
    const value =
      Math.round(
        Math.min(
          LIMITS[key][1],
          Math.max(LIMITS[key][0], base[key] + sign * step),
        ) * 100,
      ) / 100;
    if (value === base[key]) continue;
    list.push({
      profileId: brief.profiles[0],
      variantId: key,
      name: labels[key][sign > 0 ? 0 : 1],
      parameters: { ...base, [key]: value },
    });
  }
  return list;
}
function buckets(input) {
  const p = parameters(input);
  return Object.fromEntries(
    Object.entries(p).map(([key, value]) => [
      key,
      (Math.round(value * 10) / 10).toFixed(1),
    ]),
  );
}
module.exports = { LIMITS, DEFAULTS, parameters, adjust, variants, buckets };
