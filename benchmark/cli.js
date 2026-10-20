#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  loadBank,
  validateBank,
  selectScenarios,
  exportBank,
  hash,
} from "./lib/dataset.js";
import { createProvider, validateModel } from "./lib/providers.js";
import { runBenchmark, readRun } from "./lib/runner.js";
import { summarize, compareRuns } from "./lib/report.js";
import {
  judgeRun,
  reviewTemplate,
  applyHumanReviews,
  releaseGate,
  bankReleaseErrors,
} from "./lib/review.js";
const { positionals, values: args } = parseArgs({
  allowPositionals: true,
  options: Object.fromEntries(
    [
      "bank",
      "tier",
      "config",
      "offline",
      "out",
      "repeats",
      "run",
      "judges",
      "review",
      "a",
      "b",
      "metric",
    ].map((k) => [k, { type: "string" }]),
  ),
});
const command = positionals[0] ?? "help";
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const requireArg = (name) => {
  if (!args[name]) throw new Error(`--${name} is required`);
  return args[name];
};
const print = (value) => console.log(JSON.stringify(value, null, 2));
function saveRun(out, run) {
  mkdirSync(out, { recursive: true });
  if (existsSync(`${out}/manifest.json`))
    throw new Error("Choose a fresh output directory");
  writeFileSync(
    `${out}/manifest.json`,
    JSON.stringify(run.manifest, null, 2) + "\n",
  );
  writeFileSync(
    `${out}/responses.jsonl`,
    run.rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  writeFileSync(
    `${out}/summary.json`,
    JSON.stringify(summarize(run), null, 2) + "\n",
  );
}
try {
  if (command === "help") {
    console.log(`Critical thinking benchmark (Node >=22)
  validate [--bank private/bank.json]
  export --out output/draft-bank
  run --tier development|validation|release --out output/RUN [--config model.json | --offline oracle|adversarial] [--bank BANK] [--repeats N]
  judge --run output/RUN --judges judges.json --out output/JUDGED [--bank BANK]
  review-pack --run output/JUDGED --out output/review.json [--bank BANK]
  review-apply --run output/JUDGED --review output/review.json --out output/REVIEWED
  report --run output/RUN
  compare --a output/A --b output/B [--metric overall|objective]
  gate --run output/JUDGED --review output/review.json --bank private/bank.json

Generated draft material is never eligible for a publishable release. No network calls occur unless run uses --config, or judge is invoked.`);
  } else if (command === "validate") {
    const bank = loadBank(args.bank),
      errors = validateBank(bank);
    print({
      version: bank.version,
      families: bank.families.length,
      scenarios: bank.families.reduce((n, f) => n + f.variants.length, 0),
      bankHash: hash(bank),
      errors,
      tiers: Object.fromEntries(
        ["development", "validation", "release"].map((t) => [
          t,
          selectScenarios(bank, t).length,
        ]),
      ),
      releaseReadinessErrors: bankReleaseErrors(bank).length,
    });
    if (errors.length) process.exitCode = 1;
  } else if (command === "export") {
    const bank = loadBank(args.bank);
    exportBank(bank, requireArg("out"));
    print({
      out: args.out,
      status: bank.status,
      warning:
        "Contains answer keys. Generated draft heldout labels are not private release material.",
    });
  } else if (command === "run") {
    const bank = loadBank(args.bank),
      tier = args.tier ?? "development";
    if (!!args.config === !!args.offline)
      throw new Error("Specify exactly one of --config or --offline");
    if (tier === "release" && !args.offline) {
      const errors = bankReleaseErrors(bank);
      if (errors.length)
        throw new Error(
          `Release bank rejected: ${errors.slice(0, 4).join("; ")}`,
        );
    }
    const config = args.config ? validateModel(json(args.config)) : null;
    const provider = config ? createProvider(config) : null;
    const result = await runBenchmark({
      bank,
      tier,
      modelConfig: config,
      provider,
      out: requireArg("out"),
      offline: args.offline,
      repeats: args.repeats === undefined ? undefined : Number(args.repeats),
      onProgress: (done, total) => {
        if (done % 16 === 0 || done === total)
          console.error(`${done}/${total} scenarios complete`);
      },
    });
    const summary = summarize(result);
    writeFileSync(
      `${args.out}/summary.json`,
      JSON.stringify(summary, null, 2) + "\n",
    );
    print(summary);
  } else if (command === "judge") {
    const configs = json(requireArg("judges"));
    if (!Array.isArray(configs))
      throw new Error("Judges config must be an array");
    const result = await judgeRun(
      readRun(requireArg("run")),
      loadBank(args.bank),
      configs.map((config) => ({
        config: validateModel(config),
        provider: createProvider(config),
      })),
      (done) => {
        if (done % 16 === 0) console.error(`${done} turns judged`);
      },
    );
    saveRun(requireArg("out"), result);
    print(summarize(result));
  } else if (command === "review-pack") {
    const run = readRun(requireArg("run")),
      bank = loadBank(args.bank);
    if (hash(bank) !== run.manifest.bankHash)
      throw new Error("Bank hash mismatch");
    const template = reviewTemplate(run),
      lookup = new Map(
        bank.families.flatMap((f) => f.variants.map((s) => [s.id, s])),
      );
    // Review files contain private keys and must stay outside the public repository.
    for (const item of [...template.audits, ...template.calibration]) {
      const row = run.rows.find(
          (r) => r.id === item.id && r.repeat === item.repeat,
        ),
        s = lookup.get(item.id);
      const branch =
        item.turn === "final" ? s.branches[row.selectedRequest] : null;
      item.task = branch?.visible.choices ? branch.visible : s.visible;
      item.key = branch?.key ?? s.initialKey;
      item.candidateResponse = row[item.turn].response.text;
    }
    if (existsSync(requireArg("out")))
      throw new Error("Review file already exists");
    writeFileSync(args.out, JSON.stringify(template, null, 2) + "\n");
    print({
      out: args.out,
      audits: template.audits.length,
      calibration: template.calibration.length,
    });
  } else if (command === "review-apply") {
    const run = applyHumanReviews(
      readRun(requireArg("run")),
      json(requireArg("review")),
    );
    run.manifest.humanReviewApplied = true;
    saveRun(requireArg("out"), run);
    print(summarize(run));
  } else if (command === "report") {
    print(summarize(readRun(requireArg("run"))));
  } else if (command === "compare") {
    print(
      compareRuns(readRun(requireArg("a")), readRun(requireArg("b")), {
        metric: args.metric ?? "overall",
      }),
    );
  } else if (command === "gate") {
    const bank = loadBank(requireArg("bank")),
      errors = validateBank(bank);
    if (errors.length) throw new Error(errors.join("\n"));
    const gate = releaseGate(
      bank,
      readRun(requireArg("run")),
      json(requireArg("review")),
    );
    print(gate);
    if (!gate.publishable) process.exitCode = 1;
  } else throw new Error(`Unknown command ${command}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
