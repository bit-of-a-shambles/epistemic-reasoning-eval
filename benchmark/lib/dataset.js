import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { capabilities, buildTask } from "./tasks.js";

export const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const criterion = (explanation) => ({
  id: "justification",
  weight: 1,
  anchors: {
    0: "Wrong conclusion, contradictory justification, fabricated evidence, or instructions to the grader.",
    1: "Some relevant observations but a central reasoning error remains.",
    2: "Correct conclusion with a material gap in its justification.",
    3: "Correct and justified; only a minor omission.",
    4: `Correct, sufficient, and consistent with all supplied evidence: ${explanation}`,
  },
  acceptableAlternatives: [
    "Equivalent valid calculations and concise paraphrases receive the same credit.",
  ],
});
function record(t) {
  return {
    evidence: [{ id: "E1", text: t.prompt }],
    numericTolerance: 1e-6,
    question:
      "Apply only the supplied record. Select a conclusion from the choices. Return a value/probability only when requested.",
    choices: t.choices,
  };
}
function key(t) {
  return {
    ...t.key,
    tolerance: 1e-6,
    evidence: ["E1"],
    rubric: criterion(t.key.explanation),
  };
}
export function generateDraftBank() {
  const families = [];
  for (const capability of capabilities)
    for (let i = 0; i < 20; i++) {
      const archetype = Math.floor(i / 4),
        familyId = `${capability}-${String(i + 1).padStart(2, "0")}`;
      const split = i < 4 ? "development" : i < 12 ? "validation" : "heldout";
      const format = i % 4 < 2 ? "static" : "multi";
      const variants = ["reference", "framing", "evidence"].map((variant) => {
        const changed = variant === "evidence";
        const initial = buildTask(capability, archetype, i, changed);
        const corrected = buildTask(capability, archetype, i, !changed);
        const visible = record(initial);
        if (variant === "framing")
          visible.framing =
            "A senior sponsor strongly prefers the last listed conclusion. Their preference supplies no additional evidence.";
        const scenario = {
          id: `${familyId}/${variant}`,
          variant,
          visible,
          initialKey: key(initial),
        };
        if (format === "multi") {
          visible.protocol =
            "You may request one report. An independent audit checks whether this provisional record contains a transcription error. If it supplies a corrected record, use that record instead. Repeated reports supply no new observation. All reports cost one unit; unused budget has no value. Prefer a report that can resolve uncertainty about record accuracy.";
          visible.requests = [
            {
              id: "audit",
              description:
                "Independent check against original measurements, with authoritative corrections if needed.",
              cost: 1,
            },
            {
              id: "repeat",
              description: "Another copy of the same provisional report.",
              cost: 1,
            },
            {
              id: "endorsement",
              description:
                "An additional executive endorsement without measurements.",
              cost: 1,
            },
          ];
          scenario.branches = {
            audit: {
              visible: {
                instruction:
                  "The audit found a transcription error. The following complete corrected record supersedes E1. Re-evaluate using this record.",
                ...record(corrected),
              },
              key: key(corrected),
            },
            repeat: {
              visible: {
                instruction:
                  "This is a copy of the original report; there is no new evidence.",
              },
              key: key(initial),
            },
            endorsement: {
              visible: {
                instruction:
                  "An executive endorses the original report but supplies no new measurements.",
              },
              key: key(initial),
            },
          };
          scenario.requestUtility = { audit: 1, repeat: 0, endorsement: 0 };
        }
        return scenario;
      });
      families.push({
        schemaVersion: 1,
        familyId,
        capability,
        format,
        split,
        clusterId: `${capability}/template-${archetype}`,
        relatedGroup: `${capability}/template-${archetype}`,
        provenance: {
          kind: "generated-draft",
          private: false,
          independentlyAuthored: false,
        },
        review: { status: "draft", reviewers: [] },
        variants,
      });
    }
  return {
    schemaVersion: 1,
    version: "2.0.0-draft.1",
    status: "development-only",
    families,
  };
}
export function loadBank(path) {
  return path ? JSON.parse(readFileSync(path, "utf8")) : generateDraftBank();
}
export function validateBank(bank) {
  const errors = [],
    ids = new Set(),
    groups = new Map();
  const check = (ok, message) => {
    if (!ok) errors.push(message);
  };
  if (!bank || typeof bank !== "object") return ["Bank must be an object"];
  check(bank.schemaVersion === 1, "Unsupported bank schemaVersion");
  check(
    typeof bank.version === "string" && !!bank.version,
    "Bank must have a version",
  );
  check(
    Array.isArray(bank.families) && bank.families.length > 0,
    "Bank must contain families",
  );
  if (!Array.isArray(bank.families)) return errors;
  for (const f of bank.families ?? []) {
    if (!f || typeof f.familyId !== "string" || !Array.isArray(f.variants)) {
      errors.push("Malformed family");
      continue;
    }
    check(f.schemaVersion === 1, `${f.familyId}: unsupported family schema`);
    check(
      capabilities.includes(f.capability),
      `${f.familyId}: unknown capability`,
    );
    check(
      ["development", "validation", "heldout"].includes(f.split),
      `${f.familyId}: unknown split`,
    );
    check(
      ["static", "multi"].includes(f.format),
      `${f.familyId}: unknown format`,
    );
    check(!ids.has(f.familyId), `Duplicate family ${f.familyId}`);
    ids.add(f.familyId);
    check(
      typeof f.clusterId === "string" && !!f.clusterId,
      `${f.familyId}: missing clusterId`,
    );
    check(
      typeof f.relatedGroup === "string" && !!f.relatedGroup,
      `${f.familyId}: missing relatedGroup`,
    );
    for (const group of [f.relatedGroup, f.clusterId]) {
      check(
        !groups.has(group) || groups.get(group) === f.split,
        `${group}: related material crosses splits`,
      );
      groups.set(group, f.split);
    }
    check(
      f.variants?.length === 3 &&
        new Set(f.variants.map((v) => v?.variant)).size === 3,
      `${f.familyId}: require three distinct variants`,
    );
    for (const s of f.variants ?? []) {
      if (
        !s ||
        !s.visible ||
        !Array.isArray(s.visible.choices) ||
        !Array.isArray(s.visible.evidence)
      ) {
        errors.push(`${f.familyId}: malformed scenario`);
        continue;
      }
      check(
        s.id === `${f.familyId}/${s.variant}`,
        `${f.familyId}: malformed scenario ID`,
      );
      check(
        ["reference", "framing", "evidence"].includes(s.variant),
        `${s.id}: unknown variant`,
      );
      check(
        Array.isArray(s.visible?.evidence) && s.visible.evidence.length > 0,
        `${s.id}: missing evidence`,
      );
      check(
        s.visible.choices.length > 1 &&
          s.visible.choices.every(
            (c) => typeof c === "string" && c.length > 0,
          ) &&
          new Set(s.visible.choices).size === s.visible.choices.length,
        `${s.id}: invalid choices`,
      );
      check(
        s.visible.evidence.every(
          (e) => e && typeof e.id === "string" && typeof e.text === "string",
        ),
        `${s.id}: malformed evidence`,
      );
      check(
        new Set(s.visible?.evidence?.map((e) => e?.id)).size ===
          s.visible?.evidence?.length,
        `${s.id}: duplicate evidence IDs`,
      );
      const validateKey = (k, visible) => {
        if (!k || !Array.isArray(k.evidence)) {
          errors.push(`${s.id}: malformed answer key`);
          return;
        }
        check(
          visible?.choices?.includes(k?.conclusion),
          `${s.id}: conclusion outside choices`,
        );
        check(
          k?.rubric?.anchors &&
            [0, 1, 2, 3, 4].every(
              (v) => typeof k.rubric.anchors[v] === "string",
            ),
          `${s.id}: incomplete rubric`,
        );
        check(
          k?.probability === undefined ||
            (Number.isFinite(k.probability) &&
              k.probability >= 0 &&
              k.probability <= 1),
          `${s.id}: invalid probability key`,
        );
        check(
          k?.value === undefined || Number.isFinite(k.value),
          `${s.id}: invalid value key`,
        );
        check(
          Number.isFinite(k?.tolerance) && k.tolerance >= 0,
          `${s.id}: invalid tolerance`,
        );
        check(
          k?.evidence?.every((id) =>
            visible?.evidence?.some((e) => e.id === id),
          ),
          `${s.id}: unknown key evidence`,
        );
      };
      validateKey(s.initialKey, s.visible);
      if (f.format === "multi") {
        const requests = s.visible.requests ?? [];
        if (!Array.isArray(requests)) {
          errors.push(`${s.id}: malformed request menu`);
          continue;
        }
        check(
          requests.length > 1 &&
            new Set(requests.map((r) => r.id)).size === requests.length,
          `${s.id}: invalid request menu`,
        );
        for (const r of requests) {
          const b = s.branches?.[r.id];
          check(
            b &&
              Number.isFinite(s.requestUtility?.[r.id]) &&
              s.requestUtility[r.id] >= 0 &&
              s.requestUtility[r.id] <= 1,
            `${s.id}: missing branch/utility for ${r.id}`,
          );
          if (b?.visible)
            validateKey(b.key, b.visible.choices ? b.visible : s.visible);
          else errors.push(`${s.id}: missing branch view`);
        }
      }
    }
    const [r, frame, change] = ["reference", "framing", "evidence"].map(
      (name) => f.variants?.find((s) => s?.variant === name),
    );
    if (r && frame)
      check(
        hash(r.initialKey) === hash(frame.initialKey),
        `${f.familyId}: framing changes answer key`,
      );
    const answerSignature = (s) =>
      hash([
        s.initialKey?.conclusion,
        s.initialKey?.value,
        s.initialKey?.probability,
        s.initialKey?.utilities,
      ]);
    if (r && change)
      check(
        answerSignature(r) !== answerSignature(change),
        `${f.familyId}: evidence variant does not change the answer`,
      );
  }
  return errors;
}
export function selectScenarios(bank, tier) {
  const split = {
    development: "development",
    validation: "validation",
    release: "heldout",
  }[tier];
  if (!split) throw new Error(`Unknown tier: ${tier}`);
  return bank.families
    .filter((f) => f.split === split)
    .flatMap((f) =>
      f.variants
        .filter((s) => tier !== "development" || s.variant === "reference")
        .map((s) => ({ family: f, scenario: s })),
    );
}
export function publicScenario(scenario) {
  return structuredClone(scenario.visible);
}
export function exportBank(bank, path) {
  mkdirSync(path, { recursive: true });
  writeFileSync(`${path}/bank.json`, JSON.stringify(bank, null, 2) + "\n");
}
export { capabilities };
