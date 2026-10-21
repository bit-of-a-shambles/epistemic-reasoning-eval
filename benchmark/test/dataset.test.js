import test from "node:test";
import assert from "node:assert/strict";
import {
  generateDraftBank,
  validateBank,
  selectScenarios,
  publicScenario,
  hash,
} from "../lib/dataset.js";
import { buildTask } from "../lib/tasks.js";
import { bankReleaseErrors } from "../lib/review.js";
const bank = generateDraftBank();
test("draft bank is reproducible, balanced, and grouped across splits", () => {
  assert.deepEqual(validateBank(bank), []);
  assert.equal(hash(bank), hash(generateDraftBank()));
  assert.equal(bank.families.length, 160);
  assert.equal(new Set(bank.families.map((f) => f.clusterId)).size, 40);
  assert.equal(selectScenarios(bank, "development").length, 32);
  assert.equal(selectScenarios(bank, "validation").length, 192);
  assert.equal(selectScenarios(bank, "release").length, 192);
  for (const split of ["development", "validation", "heldout"]) {
    const families = bank.families.filter((f) => f.split === split);
    assert.equal(
      families.filter((f) => f.format === "multi").length,
      families.length / 2,
    );
    for (const cap of new Set(families.map((f) => f.capability)))
      assert.equal(
        families.filter((f) => f.capability === cap).length,
        families.length / 8,
      );
  }
});
test("cross-split relatives and invalid keys are rejected", () => {
  const copy = structuredClone(bank);
  copy.families[0].relatedGroup = copy.families[4].relatedGroup;
  copy.families[0].variants[0].initialKey.probability = 2;
  const errors = validateBank(copy);
  assert.ok(errors.some((e) => e.includes("crosses splits")));
  assert.ok(errors.some((e) => e.includes("invalid probability")));
});
test("candidate views do not expose keys, utilities, branches, or provenance", () => {
  for (const f of bank.families)
    for (const s of f.variants) {
      const view = publicScenario(s);
      assert.deepEqual(
        Object.keys(view).filter((k) =>
          [
            "initialKey",
            "branches",
            "requestUtility",
            "review",
            "provenance",
          ].includes(k),
        ),
        [],
      );
      assert.equal(JSON.stringify(view).includes('"explanation":'), false);
      if (view.evidence) view.evidence[0].text = "mutated";
      assert.notEqual(s.visible.evidence[0].text, "mutated");
    }
});
test("weighted subgroup arithmetic catches the legacy Simpson contradiction", () => {
  const task = buildTask("consistency", 0, 0);
  assert.equal(task.key.value, 0.34);
  assert.equal(task.key.conclusion, "inconsistent");
  assert.equal(
    buildTask("consistency", 0, 0, true).key.conclusion,
    "consistent",
  );
});
test("Bayes key uses the false-positive denominator", () => {
  const key = buildTask("probability", 0, 0).key;
  assert.ok(
    Math.abs(key.probability - (0.01 * 0.9) / (0.01 * 0.9 + 0.99 * 0.05)) <
      1e-12,
  );
});
test("independent repetitions update, copied evidence does not", () => {
  assert.equal(buildTask("updating", 1, 0).key.probability, 0.5);
  assert.equal(buildTask("updating", 1, 0, true).key.probability, 0.9);
});
test("information can be worth acquiring at one cost and not another", () => {
  assert.equal(buildTask("investigation", 1, 0).key.value, 4);
  assert.equal(buildTask("investigation", 1, 0, true).key.value, -2);
});
test("hospital outcome key does not equate selected mortality with lives saved", () => {
  assert.equal(buildTask("causality", 4, 0).key.conclusion, "not_established");
});
test("generated heldout labels are never accepted as private reviewed material", () => {
  assert.ok(
    bankReleaseErrors(bank).some((e) => e.includes("private provenance")),
  );
  assert.ok(bankReleaseErrors(bank).some((e) => e.includes("reviewers")));
});
test("malformed bank containers are reported without executing content", () => {
  assert.ok(validateBank(null).length);
  assert.ok(validateBank({ schemaVersion: 1, families: {} }).length);
  const copy = structuredClone(bank);
  copy.families[0].variants[0] = null;
  assert.ok(validateBank(copy).length);
  const missing = structuredClone(bank);
  missing.families[0].variants[0].initialKey = null;
  assert.ok(validateBank(missing).length);
});
test("numeric keys agree with independently calculated reference values", () => {
  const cases = [
    ["probability", 1, 0.2275, 0.1275],
    ["probability", 2, 0.6, 0.8],
    ["probability", 3, 8 / 107, 1 / 496],
    ["causality", 1, -0.1, 0.15],
    ["consistency", 0, 0.34, 0.34],
    ["consistency", 4, 20, 20],
    ["investigation", 1, 4, -2],
    ["updating", 0, 9 / 13, 1 / 41],
    ["updating", 1, 0.5, 0.9],
    ["updating", 2, 0.8, 0.2],
    ["updating", 4, 0.7, 0.25],
    ["decisions", 0, 0.5, 1],
    ["decisions", 1, 20, 30],
    ["decisions", 2, -2, 6],
    ["decisions", 3, 5, 0],
    ["decisions", 4, 2, 0.8],
    ["framing", 0, 0.4, 0.5],
    ["framing", 1, 0.9, 0.8],
    ["framing", 2, 0.9, 0.95],
    ["framing", 4, 0.1, 0.9],
  ];
  for (const [cap, k, a, b] of cases)
    for (const [changed, value] of [
      [false, a],
      [true, b],
    ]) {
      const key = buildTask(cap, k, 0, changed).key;
      const actual = key.value ?? key.probability;
      assert.ok(
        Math.abs(actual - value) < 1e-10,
        `${cap}/${k}/${changed}: ${actual} != ${value}`,
      );
    }
});
