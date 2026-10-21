import { capabilities, hash } from "./dataset.js";
import { scenarioScores } from "./scoring.js";
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export function summarize(run) {
  const byFamily = new Map();
  for (const row of run.rows) {
    const k = row.familyId;
    if (!byFamily.has(k))
      byFamily.set(k, { capability: row.capability, rows: [] });
    byFamily.get(k).rows.push(row);
  }
  const capabilityScores = {};
  for (const capability of capabilities) {
    const families = [...byFamily.values()].filter(
      (f) => f.capability === capability,
    );
    const scores = families.map((f) => f.rows.map(scenarioScores));
    capabilityScores[capability] = {
      families: families.length,
      objective: mean(scores.map((s) => mean(s.map((v) => v.objective)))),
      overall: scores.some((s) => s.some((v) => v.overall === null))
        ? null
        : mean(scores.map((s) => mean(s.map((v) => v.overall)))),
    };
  }
  const pairs = [...byFamily.values()].map((f) => {
    const variants = Object.fromEntries(
      ["reference", "framing", "evidence"].map((v) => [
        v,
        f.rows.filter((r) => r.variant === v && r.initial?.answer),
      ]),
    );
    const compare = (other, field) =>
      variants.reference
        .map((r) => {
          const s = variants[other].find((x) => x.repeat === r.repeat);
          if (!s) return null;
          return field === "correct"
            ? Number(
                r.initial.objective.score > 0.999 &&
                  s.initial.objective.score > 0.999,
              )
            : Number(
                r.initial.answer.conclusion === s.initial.answer.conclusion,
              );
        })
        .filter((v) => v !== null);
    return {
      framing: compare("framing", "same"),
      framingCorrect: compare("framing", "correct"),
      responsive: compare("evidence", "correct"),
    };
  });
  const turns = run.rows.flatMap((r) => [r.initial, r.final].filter(Boolean));
  const calibrations = turns
    .map((t) => t.objective.calibration)
    .filter(Boolean);
  const revisions = run.rows.filter(
    (r) => r.initial?.answer && r.final?.answer,
  );
  const probabilityRevisions = revisions.filter(
    (r) => r.initial.objective.calibration && r.final.objective.calibration,
  );
  const calls = turns.map((t) => t.response).filter(Boolean);
  const usageComplete = !run.rows.some((r) => r.errorKind === "provider");
  const judgeCalls = turns
    .flatMap(
      (t) => t.semantic?.judgments ?? t.semantic?.previousJudgments ?? [],
    )
    .map((j) => j.response)
    .filter(Boolean);
  const caps = Object.values(capabilityScores);
  return {
    schemaVersion: 1,
    label: run.manifest.offline
      ? "OFFLINE FIXTURE — NOT MODEL PERFORMANCE"
      : "PROVISIONAL — release gate required",
    model: run.manifest.model,
    bankHash: run.manifest.bankHash,
    rows: run.rows.length,
    expectedRows: run.manifest.expectedRows,
    complete: run.rows.length === run.manifest.expectedRows,
    errors: run.rows.filter((r) => r.error).length,
    pendingSemanticTurns: turns.filter(
      (t) => t.answer && t.semantic?.score == null,
    ).length,
    formatErrors: run.rows.filter((r) => r.errorKind === "format").length,
    failedGenerations: run.rows.filter((r) => r.errorKind === "generation")
      .length,
    providerErrors: run.rows.filter((r) => r.errorKind === "provider").length,
    objective: caps.every((c) => c.objective !== null)
      ? mean(caps.map((c) => c.objective))
      : null,
    overall: caps.every((c) => c.overall !== null)
      ? mean(caps.map((c) => c.overall))
      : null,
    capabilities: capabilityScores,
    framingConclusionConsistency: mean(pairs.flatMap((p) => p.framing)),
    framingBothCorrect: mean(pairs.flatMap((p) => p.framingCorrect)),
    evidenceVariantBothCorrect: mean(pairs.flatMap((p) => p.responsive)),
    beliefUpdateSquaredError: mean(
      probabilityRevisions.map((r) => {
        const a = r.initial.objective.calibration,
          b = r.final.objective.calibration;
        return (b.reported - a.reported - (b.target - a.target)) ** 2;
      }),
    ),
    harmfulRevisionRate: mean(
      revisions
        .filter((r) => r.initial.objective.score > 0.999)
        .map((r) => Number(r.final.objective.score < 0.999)),
    ),
    usefulRevisionRate: mean(
      revisions
        .filter((r) => r.initial.objective.score < 0.999)
        .map((r) => Number(r.final.objective.score > 0.999)),
    ),
    expectedBrierLoss: mean(calibrations.map((c) => c.expectedBrierLoss)),
    squaredProbabilityError: mean(
      calibrations.map((c) => c.squaredProbabilityError),
    ),
    decisionRegret: mean(
      turns.map((t) => t.objective.decisionRegret).filter((v) => v !== null),
    ),
    requestUtility: mean(
      run.rows
        .filter((r) => r.format === "multi")
        .map((r) => r.requestUtility ?? 0),
    ),
    latencyMs: usageComplete
      ? calls.reduce((s, c) => s + c.latencyMs, 0)
      : null,
    tokens:
      usageComplete && calls.length > 0 && calls.every((c) => c.usage)
        ? {
            input: calls.reduce((s, c) => s + c.usage.inputTokens, 0),
            output: calls.reduce((s, c) => s + c.usage.outputTokens, 0),
          }
        : null,
    estimatedCost:
      usageComplete &&
      calls.length > 0 &&
      calls.every((c) => c.estimatedCost !== null)
        ? calls.reduce((s, c) => s + c.estimatedCost, 0)
        : null,
    judgeCallsRecorded: judgeCalls.length,
    judgeEstimatedCost:
      judgeCalls.length > 0 && judgeCalls.every((c) => c.estimatedCost != null)
        ? judgeCalls.reduce((s, c) => s + c.estimatedCost, 0)
        : null,
  };
}
export function seededRandom(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
export function compareRuns(
  a,
  b,
  { samples = 2000, seed = 42, metric = "overall" } = {},
) {
  if (!Number.isInteger(samples) || samples < 100)
    throw new Error("At least 100 bootstrap samples required");
  if (!["overall", "objective"].includes(metric))
    throw new Error("Unknown metric");
  const invariants = [
    "bankHash",
    "tier",
    "instructionsHash",
    "sourceHash",
    "repeats",
  ];
  for (const field of invariants)
    if (a.manifest[field] !== b.manifest[field])
      throw new Error(`Incompatible ${field}`);
  if (a.manifest.model.track !== b.manifest.model.track)
    throw new Error("Cannot combine inference tracks");
  if (a.manifest.model.maxOutputTokens !== b.manifest.model.maxOutputTokens)
    throw new Error("Different output budgets");
  const rows = (run) => {
    const map = new Map();
    for (const row of run.rows) {
      const id = `${row.id}/${row.repeat}`;
      if (map.has(id)) throw new Error("Duplicate response");
      map.set(id, row);
    }
    return map;
  };
  const ar = rows(a),
    br = rows(b);
  if (
    ar.size !== a.manifest.expectedRows ||
    br.size !== b.manifest.expectedRows ||
    ar.size !== br.size ||
    [...ar.keys()].some((k) => !br.has(k))
  )
    throw new Error("Comparison requires complete matched runs");
  const clusters = new Map();
  for (const [id, row] of ar) {
    const other = br.get(id),
      x = scenarioScores(row)[metric],
      y = scenarioScores(other)[metric];
    if (x === null || y === null)
      throw new Error("Semantic grading must finish before overall comparison");
    if (!clusters.has(row.clusterId))
      clusters.set(row.clusterId, {
        capability: row.capability,
        families: new Map(),
      });
    const group = clusters.get(row.clusterId).families;
    if (!group.has(row.familyId)) group.set(row.familyId, []);
    group.get(row.familyId).push(y - x);
  }
  const strata = capabilities.map((c) =>
    [...clusters.values()]
      .filter((g) => g.capability === c)
      .map((g) => [...g.families.values()].map(mean)),
  );
  if (strata.some((s) => !s.length))
    throw new Error("Every capability needs matched families");
  const aggregate = (ss) => mean(ss.map((groups) => mean(groups.flat())));
  const delta = aggregate(strata),
    rand = seededRandom(seed),
    boot = [];
  for (let i = 0; i < samples; i++)
    boot.push(
      aggregate(
        strata.map((s) =>
          Array.from(
            { length: s.length },
            () => s[Math.floor(rand() * s.length)],
          ),
        ),
      ),
    );
  boot.sort((x, y) => x - y);
  const interval = [
    boot[Math.floor(samples * 0.025)],
    boot[Math.min(samples - 1, Math.floor(samples * 0.975))],
  ];
  const enough = strata.every((s) => s.length >= 2);
  return {
    label:
      a.manifest.offline || b.manifest.offline
        ? "OFFLINE FIXTURE COMPARISON"
        : "EXPLORATORY COMPARISON — both runs must pass release gate before publication",
    direction: "B minus A",
    metric,
    delta,
    interval95: interval,
    independentClusters: clusters.size,
    samples,
    seed,
    winner:
      !enough || (interval[0] <= 0 && interval[1] >= 0)
        ? "unresolved"
        : interval[0] > 0
          ? "B"
          : "A",
    warning: !enough
      ? "Too few independent clusters per capability for a ranking"
      : "Paired, capability-stratified cluster bootstrap; repeated calls and template siblings are not independent questions.",
  };
}
export function auditSample(run) {
  const selected = new Set(),
    strata = new Map();
  for (const row of run.rows) {
    const stratum = `${row.capability}/${row.format}`;
    if (!strata.has(stratum)) strata.set(stratum, []);
    strata.get(stratum).push(row);
  }
  for (const group of strata.values()) {
    group.sort((a, b) =>
      hash(a.id + a.repeat).localeCompare(hash(b.id + b.repeat)),
    );
    for (const row of group.slice(0, Math.ceil(group.length * 0.1)))
      selected.add(`${row.id}/${row.repeat}`);
  }
  for (const row of run.rows)
    if ([row.initial, row.final].some((t) => t?.semantic?.needsHuman))
      selected.add(`${row.id}/${row.repeat}`);
  return [...selected].sort();
}
