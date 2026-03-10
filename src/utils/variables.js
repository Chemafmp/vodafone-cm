/**
 * Resolve template variables in a string.
 * Variables use {{varName}} syntax.
 * @param {string} text - Text possibly containing {{varName}} placeholders
 * @param {Object} vars - Map of varName -> value
 * @returns {string}
 */
export function resolveVars(text, vars = {}) {
  if (!text || typeof text !== "string") return text;
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : match;
  });
}

/**
 * Extract all unique variable names from a string or array of strings.
 * @param {string|string[]} texts
 * @returns {string[]}
 */
export function extractVarNames(texts) {
  const arr = Array.isArray(texts) ? texts : [texts];
  const found = new Set();
  arr.forEach(t => {
    if (!t || typeof t !== "string") return;
    const matches = t.match(/\{\{(\w+)\}\}/g) || [];
    matches.forEach(m => found.add(m.slice(2, -2)));
  });
  return [...found];
}

/**
 * Extract all variables from a full template change object.
 * Scans title, steps (instructions, commands, rollback, expectedOutcome).
 */
export function extractTemplateVars(template) {
  const texts = [
    template.name,
    template.purpose,
    template.description,
    template.rollbackPlan,
    template.affectedDevices,
    ...(template.steps || []).flatMap(s => [
      s.name,
      s.instructions,
      s.rollback,
      s.expectedOutcome,
      ...(Array.isArray(s.commands) ? s.commands : []),
    ]),
  ].filter(Boolean);
  return extractVarNames(texts);
}

/**
 * Resolve all template variables in a full change object (title, steps, etc.)
 */
export function resolveChangeVars(change, vars = {}) {
  const r = text => resolveVars(text, vars);
  const rArr = arr => Array.isArray(arr) ? arr.map(r) : arr;
  return {
    ...change,
    name: r(change.name),
    purpose: r(change.purpose),
    description: r(change.description),
    rollbackPlan: r(change.rollbackPlan),
    affectedDevices: r(change.affectedDevices),
    steps: (change.steps || []).map(s => ({
      ...s,
      name: r(s.name),
      instructions: r(s.instructions),
      rollback: r(s.rollback),
      expectedOutcome: r(s.expectedOutcome),
      commands: rArr(s.commands),
    })),
  };
}
