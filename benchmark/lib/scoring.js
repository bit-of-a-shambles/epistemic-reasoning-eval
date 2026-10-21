export function parseAnswer(text, visible, { final = false } = {}) {
  let answer;
  try {
    answer = JSON.parse(
      text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1"),
    );
  } catch {
    return { error: "Response is not one JSON object" };
  }
  if (!answer || Array.isArray(answer) || typeof answer !== "object")
    return { error: "Response must be an object" };
  if (!visible.choices.includes(answer.conclusion))
    return { error: "Conclusion is not an available choice" };
  for (const field of ["probability", "value"]) {
    if (answer[field] !== null && !Number.isFinite(answer[field]))
      return { error: `${field} must be a finite number or null` };
  }
  if (
    answer.probability !== null &&
    (answer.probability < 0 || answer.probability > 1)
  )
    return { error: "Probability outside [0,1]" };
  if (
    !Array.isArray(answer.evidence) ||
    !answer.evidence.every((id) => visible.evidence.some((e) => e.id === id)) ||
    new Set(answer.evidence).size !== answer.evidence.length
  )
    return { error: "Invalid evidence IDs" };
  if (
    typeof answer.justification !== "string" ||
    !answer.justification.trim() ||
    answer.justification.length > 6000
  )
    return { error: "A short justification is required" };
  if (
    visible.requests &&
    !final &&
    !visible.requests.some((r) => r.id === answer.request)
  )
    return { error: "Select one available evidence request" };
  if ((!visible.requests || final) && answer.request !== null)
    return { error: "request must be null on this turn" };
  return { answer };
}
export function gradeObjective(answer, key) {
  if (!answer)
    return {
      score: 0,
      components: {},
      calibration: null,
      decisionRegret: null,
    };
  const components = {
    conclusion: Number(answer.conclusion === key.conclusion),
  };
  if (key.value !== undefined)
    components.value = Number(
      answer.value !== null &&
        Math.abs(answer.value - key.value) <= key.tolerance,
    );
  if (key.probability !== undefined)
    components.probability =
      answer.probability === null
        ? 0
        : 1 - (answer.probability - key.probability) ** 2;
  const expected = new Set(key.evidence),
    cited = new Set(answer.evidence);
  const overlap = [...cited].filter((id) => expected.has(id)).length;
  components.evidence =
    expected.size + cited.size
      ? (2 * overlap) / (expected.size + cited.size)
      : 1;
  // Evidence citations alone must not rescue a wrong conclusion.
  const core = Object.entries(components)
    .filter(([name]) => name !== "evidence")
    .map(([, v]) => v);
  const correctness = core.reduce((a, b) => a + b, 0) / core.length;
  const score = correctness * (0.9 + 0.1 * components.evidence);
  const q = key.probability,
    p = answer.probability;
  const calibration =
    q === undefined || p === null
      ? null
      : {
          target: q,
          reported: p,
          squaredProbabilityError: (p - q) ** 2,
          expectedBrierLoss: q * (1 - q) + (p - q) ** 2,
        };
  const values = key.utilities && Object.values(key.utilities);
  const decisionRegret =
    values && key.utilities[answer.conclusion] !== undefined
      ? Math.max(...values) - key.utilities[answer.conclusion]
      : null;
  return { score, components, calibration, decisionRegret };
}
export function combineTurn(objective, semantic) {
  return semantic === null || semantic === undefined
    ? null
    : 0.7 * objective + (0.3 * semantic) / 4;
}
export function scenarioScores(row) {
  if (
    row.error ||
    !row.initial?.answer ||
    (row.format === "multi" && !row.final?.answer)
  )
    return { objective: 0, overall: 0 };
  const initial = row.initial.objective.score;
  const initialCombined = combineTurn(initial, row.initial.semantic?.score);
  if (row.format === "static")
    return { objective: initial, overall: initialCombined };
  const final = row.final.objective.score,
    utility = row.requestUtility;
  const finalCombined = combineTurn(final, row.final.semantic?.score);
  return {
    objective: 0.35 * initial + 0.5 * final + 0.15 * utility,
    overall:
      initialCombined === null || finalCombined === null
        ? null
        : 0.35 * initialCombined + 0.5 * finalCombined + 0.15 * utility,
  };
}
export function validateJudgment(value) {
  return (
    !!value &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 4 &&
    typeof value.reason === "string" &&
    value.reason.trim().length > 0
  );
}
export function reconcileJudges(judgments) {
  if (judgments.length !== 2 || !judgments.every(validateJudgment))
    return {
      score: null,
      needsHuman: true,
      reason: "Missing valid independent judgments",
    };
  const disagreement = Math.abs(judgments[0].score - judgments[1].score);
  return {
    score:
      disagreement > 1 ? null : (judgments[0].score + judgments[1].score) / 2,
    needsHuman: disagreement > 1,
    disagreement,
    judgments,
  };
}
