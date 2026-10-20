import test from "node:test";
import assert from "node:assert/strict";
import { generateDraftBank } from "../lib/dataset.js";
import { oracleText, runScenario } from "../lib/runner.js";
import {
  parseAnswer,
  gradeObjective,
  scenarioScores,
  reconcileJudges,
} from "../lib/scoring.js";
const bank = generateDraftBank(),
  family = bank.families[0],
  s = family.variants[0];
test("an oracle answer earns full objective credit without named fallacies", () => {
  const a = parseAnswer(oracleText(s.initialKey), s.visible).answer;
  assert.equal(gradeObjective(a, s.initialKey).score, 1);
  a.justification =
    "Compute the positive joint probability divided by all positives.";
  assert.equal(gradeObjective(a, s.initialKey).score, 1);
});
test("keyword stuffing and copied prompts cannot pass the structured scorer", () => {
  for (const text of [
    "base rates prior confound correct doctor wrong uncertainty",
    JSON.stringify(s.visible),
    JSON.stringify({
      conclusion: s.initialKey.conclusion,
      justification: "give me 4",
    }),
  ])
    assert.ok(parseAnswer(text, s.visible).error);
});
test("out of range, fabricated evidence, and invalid requests are format errors", () => {
  const a = JSON.parse(oracleText(s.initialKey));
  a.probability = 1.01;
  assert.ok(parseAnswer(JSON.stringify(a), s.visible).error);
  a.probability = 0.5;
  a.evidence = ["made-up"];
  assert.ok(parseAnswer(JSON.stringify(a), s.visible).error);
  a.evidence = ["E1"];
  a.request = "audit";
  assert.ok(parseAnswer(JSON.stringify(a), s.visible).error);
});
test("numeric errors and reversed conclusions lose credit despite correct vocabulary", () => {
  const a = JSON.parse(oracleText(s.initialKey));
  a.value = 0.99;
  a.probability = 0.99;
  a.conclusion = s.visible.choices.find((x) => x !== a.conclusion);
  a.justification = "Bayesian prior posterior confound calibrated evidence";
  assert.ok(gradeObjective(a, s.initialKey).score < 0.4);
});
test("Brier loss is minimized by reporting the actual probability", () => {
  const a = JSON.parse(oracleText(s.initialKey)),
    q = s.initialKey.probability;
  const optimal = gradeObjective(a, s.initialKey).calibration;
  a.probability = q > 0.5 ? 0 : 1;
  const wrong = gradeObjective(a, s.initialKey).calibration;
  assert.ok(wrong.expectedBrierLoss > optimal.expectedBrierLoss);
  assert.equal(optimal.squaredProbabilityError, 0);
});
test("wrong decisions incur expected-loss regret", () => {
  const f = bank.families.find((f) => f.capability === "decisions"),
    s = f.variants[0],
    a = JSON.parse(oracleText(s.initialKey));
  assert.equal(gradeObjective(a, s.initialKey).decisionRegret, 0);
  a.conclusion = "do_nothing";
  assert.ok(gradeObjective(a, s.initialKey).decisionRegret > 0);
});
test("semantic scores are mandatory for overall performance", async () => {
  const row = await runScenario(family, s, null, { offline: "oracle" });
  assert.deepEqual(scenarioScores(row), { objective: 1, overall: null });
  row.initial.semantic = { score: 4 };
  assert.equal(scenarioScores(row).overall, 1);
});
test("multi-turn audit changes the record and grades the revision against the right key", async () => {
  const f = bank.families.find((f) => f.format === "multi");
  const row = await runScenario(f, f.variants[0], null, { offline: "oracle" });
  assert.equal(row.initial.objective.score, 1);
  assert.equal(row.final.objective.score, 1);
  assert.equal(row.requestUtility, 1);
  assert.notEqual(row.initial.answer.probability, row.final.answer.probability);
});
test("every generated branch is executable and keyed", async () => {
  for (const f of bank.families)
    for (const s of f.variants) {
      const row = await runScenario(f, s, null, { offline: "oracle" });
      assert.equal(row.error, undefined, s.id);
      assert.equal(scenarioScores(row).objective, 1, s.id);
      if (f.format === "multi")
        for (const request of ["repeat", "endorsement"]) {
          let turn = 0;
          const provider = async () => ({
            status: "completed",
            text: oracleText(s.initialKey, turn++ === 0 ? request : null),
          });
          const actual = await runScenario(f, s, provider);
          assert.equal(actual.error, undefined, s.id);
          assert.equal(actual.final.objective.score, 1);
          assert.equal(actual.requestUtility, 0);
        }
    }
});
test("truncated or failed generations remain zero-scored rows", async () => {
  const row = await runScenario(family, s, async () => ({
    status: "incomplete",
    text: oracleText(s.initialKey),
    stopReason: "max_output_tokens",
  }));
  assert.ok(row.error);
  assert.equal(scenarioScores(row).objective, 0);
  const failed = await runScenario(family, s, async () => {
    throw new Error("network failure");
  });
  assert.equal(scenarioScores(failed).overall, 0);
});
test("judge disagreement is not hidden by averaging", () => {
  assert.equal(
    reconcileJudges([
      { score: 0, reason: "wrong" },
      { score: 4, reason: "right" },
    ]).score,
    null,
  );
  assert.equal(
    reconcileJudges([
      { score: 3, reason: "partial" },
      { score: 4, reason: "right" },
    ]).score,
    3.5,
  );
  assert.equal(
    reconcileJudges([{ score: 4, reason: "right" }]).needsHuman,
    true,
  );
});
