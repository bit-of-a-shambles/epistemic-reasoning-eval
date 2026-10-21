import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
const run = (...args) =>
  JSON.parse(
    execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
test("CLI supports an entire offline export/run/report/review/compare/gate workflow", () => {
  const dir = mkdtempSync(join(tmpdir(), "thinking-cli-"));
  try {
    const exported = run("export", "--out", join(dir, "bank"));
    assert.equal(exported.status, "development-only");
    const bank = join(dir, "bank", "bank.json");
    assert.equal(run("validate", "--bank", bank).errors.length, 0);
    const a = join(dir, "a"),
      b = join(dir, "b");
    assert.equal(
      run(
        "run",
        "--bank",
        bank,
        "--tier",
        "validation",
        "--offline",
        "adversarial",
        "--out",
        a,
      ).objective,
      0,
    );
    assert.equal(
      run(
        "run",
        "--bank",
        bank,
        "--tier",
        "validation",
        "--offline",
        "oracle",
        "--out",
        b,
      ).objective,
      1,
    );
    assert.equal(run("report", "--run", a).formatErrors, 192);
    const comparison = run(
      "compare",
      "--a",
      a,
      "--b",
      b,
      "--metric",
      "objective",
    );
    assert.equal(comparison.delta, 1);
    assert.equal(comparison.winner, "B");
    const review = join(dir, "review.json");
    run("review-pack", "--run", b, "--bank", bank, "--out", review);
    const pack = JSON.parse(readFileSync(review, "utf8"));
    assert.equal(pack.audits[0].reviewed, false);
    assert.ok(pack.audits[0].task);
    assert.ok(pack.audits[0].key);
    const result = spawnSync(
      process.execPath,
      [cli, "gate", "--bank", bank, "--run", b, "--review", review],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).publishable, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("CLI rejects unknown options and a live release against generated public data", () => {
  assert.notEqual(
    spawnSync(process.execPath, [cli, "run", "--unknown", "yes"], {
      encoding: "utf8",
    }).status,
    0,
  );
  const result = spawnSync(
    process.execPath,
    [
      cli,
      "run",
      "--tier",
      "release",
      "--config",
      "does-not-exist.json",
      "--out",
      "unused",
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Release bank rejected/);
});
