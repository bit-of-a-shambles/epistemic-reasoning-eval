import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateDraftBank, hash } from "../lib/dataset.js";
import { runBenchmark, runScenario, readRun } from "../lib/runner.js";
import { summarize, compareRuns, auditSample } from "../lib/report.js";
import {
  judgeRun,
  reviewTemplate,
  applyHumanReviews,
  releaseGate,
  calibrationResult,
} from "../lib/review.js";
const bank = generateDraftBank();
async function fixture(tier = "validation") {
  const path = mkdtempSync(join(tmpdir(), "thinking-eval-"));
  try {
    return await runBenchmark({ bank, tier, offline: "oracle", out: path });
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
}
test("full validation oracle reports quality separately from unavailable semantic grades", async () => {
  const run = await fixture(),
    summary = summarize(run);
  assert.equal(summary.rows, 192);
  assert.equal(summary.objective, 1);
  assert.equal(summary.overall, null);
  assert.equal(summary.framingConclusionConsistency, 1);
  assert.equal(summary.evidenceVariantBothCorrect, 1);
  assert.equal(summary.squaredProbabilityError, 0);
  assert.equal(summary.tokens, null);
  assert.equal(summary.estimatedCost, null);
  assert.match(summary.label, /OFFLINE/);
});
test("repeated calls and siblings do not inflate independent sample count", async () => {
  const a = await fixture(),
    b = structuredClone(a);
  const result = compareRuns(a, b, { metric: "objective", samples: 100 });
  assert.equal(result.delta, 0);
  assert.deepEqual(result.interval95, [0, 0]);
  assert.equal(result.independentClusters, 16);
  assert.equal(result.winner, "unresolved");
  const c = structuredClone(a);
  c.manifest.repeats = 2;
  c.manifest.expectedRows *= 2;
  c.rows.push(...structuredClone(c.rows).map((r) => ({ ...r, repeat: 1 })));
  const d = structuredClone(c);
  assert.equal(
    compareRuns(c, d, { metric: "objective", samples: 100 })
      .independentClusters,
    16,
  );
});
test("paired comparisons reject missing rows, incompatible budgets, and pending semantic grades", async () => {
  const a = await fixture(),
    b = structuredClone(a);
  b.rows.pop();
  assert.throws(
    () => compareRuns(a, b, { metric: "objective" }),
    /complete matched/,
  );
  const c = structuredClone(a);
  c.manifest.model.maxOutputTokens = 12;
  assert.throws(() => compareRuns(a, c, { metric: "objective" }), /budgets/);
  assert.throws(() => compareRuns(a, a), /Semantic/);
});
test("audits are deterministic, stratified, and include all judge disagreements", async () => {
  const run = await fixture();
  const sample = auditSample(run);
  assert.deepEqual(sample, auditSample(run));
  assert.ok(sample.length >= Math.ceil(run.rows.length * 0.1));
  const row = run.rows.find((r) => !sample.includes(`${r.id}/${r.repeat}`));
  row.initial.semantic = { score: null, needsHuman: true };
  assert.ok(auditSample(run).includes(`${row.id}/${row.repeat}`));
});
test("human review templates require real labels, bind exact outputs, and supply calibration slots", async () => {
  const run = await fixture(),
    bundle = reviewTemplate(run);
  assert.ok(bundle.audits.length + bundle.calibration.length >= 100);
  assert.equal(calibrationResult(run, bundle).pass, false);
  const item = bundle.audits[0];
  Object.assign(item, {
    reviewed: true,
    score: 3,
    reason: "One relevant caveat missing",
    reviewer: "reviewer-fixture",
  });
  const reviewed = applyHumanReviews(run, bundle);
  const row = reviewed.rows.find(
    (r) => r.id === item.id && r.repeat === item.repeat,
  );
  assert.equal(row[item.turn].semantic.score, 3);
  const changed = structuredClone(run);
  changed.rows[0].initial.response.text += " ";
  assert.throws(() => applyHumanReviews(changed, bundle), /exact run/);
});
test("judge receives blinded task, response and key but no model metadata or other branches", async () => {
  const f = bank.families[0],
    row = await runScenario(f, f.variants[0], null, { offline: "oracle" });
  const run = {
    manifest: {
      bankHash: hash(bank),
      model: { provider: "openai", model: "candidate-secret-label" },
    },
    rows: [row],
  };
  const payloads = [];
  const provider = async (messages) => {
    payloads.push(messages);
    return {
      text: JSON.stringify({
        score: 4,
        reason: "Correct calculation and conclusion",
      }),
      status: "completed",
    };
  };
  const judged = await judgeRun(run, bank, [
    { config: { provider: "openai", model: "judge-a" }, provider },
    { config: { provider: "anthropic", model: "judge-b" }, provider },
  ]);
  assert.equal(judged.rows[0].initial.semantic.score, 4);
  assert.equal(
    JSON.stringify(payloads).includes("candidate-secret-label"),
    false,
  );
  assert.equal(JSON.stringify(payloads).includes("requestUtility"), false);
  await assert.rejects(
    () =>
      judgeRun(run, bank, [
        { config: { provider: "openai", model: "same" }, provider },
        { config: { provider: "openai", model: "same" }, provider },
      ]),
    /distinct/,
  );
});
test("release gate rejects generated data and offline oracle results", async () => {
  const run = await fixture("release"),
    bundle = reviewTemplate(run),
    gate = releaseGate(bank, run, bundle);
  assert.equal(run.rows.length, 576);
  assert.equal(gate.publishable, false);
  assert.ok(gate.errors.includes("Offline fixtures cannot be published"));
  assert.ok(gate.errors.some((e) => e.includes("private provenance")));
  assert.ok(gate.errors.some((e) => e.includes("100 human labels")));
});
test("release gates admit a complete privately authored reviewed and calibrated fixture", async () => {
  // Synthetic attestations below are TEST FIXTURES only; they are not benchmark reviews.
  const b = structuredClone(bank);
  for (const f of b.families.filter((f) => f.split === "heldout")) {
    f.provenance = {
      kind: "private-authored",
      private: true,
      independentlyAuthored: true,
    };
    f.review = {
      status: "reviewed",
      reviewers: ["fixture-reviewer-a", "fixture-reviewer-b"],
    };
  }
  const run = await fixture("release");
  run.manifest.offline = null;
  run.manifest.bankHash = hash(b);
  run.manifest.judges = [
    { provider: "openai", model: "fixture-a" },
    { provider: "anthropic", model: "fixture-b" },
  ];
  for (const row of run.rows)
    for (const turn of ["initial", "final"])
      if (row[turn])
        row[turn].semantic = {
          score: 4,
          needsHuman: false,
          judgments: [
            { score: 4, reason: "fixture" },
            { score: 4, reason: "fixture" },
          ],
        };
  const bundle = reviewTemplate(run);
  for (const review of [...bundle.audits, ...bundle.calibration])
    Object.assign(review, {
      score: 4,
      reason: "fixture only",
      reviewer: "human-fixture",
      reviewed: true,
    });
  assert.equal(calibrationResult(run, bundle).pass, true);
  const gate = releaseGate(b, run, bundle);
  assert.deepEqual(gate.errors, []);
  assert.equal(gate.publishable, true);
  bundle.findings.push({
    description: "unresolved fixture defect",
    resolved: false,
  });
  assert.equal(releaseGate(b, run, bundle).publishable, false);
});
test("on-disk runs are append-only and refuse accidental overwrite", async () => {
  const path = mkdtempSync(join(tmpdir(), "thinking-eval-"));
  try {
    const run = await runBenchmark({
      bank,
      tier: "development",
      offline: "adversarial",
      out: path,
    });
    assert.equal(summarize(run).objective, 0);
    assert.equal(readRun(path).rows.length, 32);
    await assert.rejects(
      () =>
        runBenchmark({
          bank,
          tier: "development",
          offline: "oracle",
          out: path,
        }),
      /already contains/,
    );
    writeFileSync(`${path}/unrelated.txt`, "preserved");
  } finally {
    rmSync(path, { recursive: true, force: true });
  }
});
