# Critical Thinking Benchmark

A model benchmark for justified conclusions, evidence selection, belief revision, and decisions under uncertainty. It combines executable answer checks with blinded semantic grading and human review. The previous skill A/B evaluation remains available as a **legacy suite**; its scores are not comparable to this benchmark.

**Current status: working benchmark infrastructure with draft development content.** The built-in bank contains 160 draft families instantiated from 40 task templates, with three variants each. Template siblings are clustered together for inference and never cross splits. These are not 160 independently reviewed questions. The public generator's `heldout` labels are for exercising the release workflow, not secret test material. The release gate rejects them. No model performance claims or human reviews have been manufactured.

## Quick start

Requires Node.js 22 or newer. The new runner and tests use only Node built-ins; `npm install` is unnecessary unless you want the legacy promptfoo suite.

```sh
npm test
npm run bench:validate
npm run bench:smoke
```

The smoke command runs a privileged, offline reference-answer fixture and writes `output/smoke/`. Its perfect score checks plumbing; it is **not model performance**. Output directories cannot overwrite an existing run; use a fresh `--out` for subsequent runs.

```sh
node benchmark/cli.js run --tier validation --offline oracle --out output/oracle
node benchmark/cli.js run --tier validation --offline adversarial --out output/keywords
node benchmark/cli.js compare --a output/keywords --b output/oracle --metric objective
```

The keyword fixture produces an intentionally invalid answer and should score zero. For arbitrary structured-answer adversaries, add regression cases in `benchmark/test/` and include them in human grader review.

## Run a model

Copy `benchmark/data/model.example.json`, replace its placeholder with an explicit pinned model ID, and choose `openai` or `anthropic`. API keys are read only from `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. No keys belong in config files. Both adapters share the same visible instructions and answer format.

```sh
node benchmark/cli.js run --tier development --config model.json --out output/model-a
node benchmark/cli.js run --tier validation --config model.json --out output/model-a-validation
```

The `default` track leaves optional inference settings unset unless explicitly configured. The `fixed-budget` track is separately labeled; use the same `maxOutputTokens` and document reasoning settings for all candidates. An output cap is not a guarantee of equal compute across providers. Unsupported model parameters fail visibly; there is no silent model substitution.

Optional config fields: `temperature`, `reasoningEffort` (OpenAI only), `timeoutMs`, and `pricing: { "inputPerMillion": 1, "outputPerMillion": 2 }`. Prices are user-supplied estimates, not fetched quotes. Omitted prices yield `null` cost, not zero. Record the applicable price source and date in your release methodology.

Each run writes a manifest, append-only response JSONL, and a JSON summary. Manifests record bank/instruction/source hashes, Git revision, provider settings, exact scenario IDs and repeats. Responses retain provider-reported model IDs, completion status, usage, latency, and request IDs. No automatic retries or response selection hide failures.

## Tasks and run tiers

Eight capabilities: probabilistic inference, causal inference, source quality, contradictions and missing information, investigation, belief updating, expected-loss decisions, and resistance to framing.

Each family has a reference case, irrelevant framing change, and relevant evidence change. Half are static; half are multi-turn. Multi-turn cases collect an initial answer, one evidence request, a scripted report, and a revised answer. Imported private banks may provide their own request menus, costs, utilities, and branch outcomes.

| Tier        |   Families |       Variants | Repeats | Scenarios | Maximum candidate calls |
| ----------- | ---------: | -------------: | ------: | --------: | ----------------------: |
| Development |         32 | Reference only |       1 |        32 |                      48 |
| Validation  |         64 |      All three |       1 |       192 |                     288 |
| Release     | 64 private |      All three |       3 |       576 |                     864 |

These are candidate calls only. Two judges grade every valid answer turn, adding up to 1,728 judge calls in a release run. Costs depend on the configured models and output lengths.

## Grading and review

Executable scores measure conclusions, numeric values, probabilities, cited evidence IDs, decision regret, and request utility. Semantic grades measure whether the short justification supports the answer without contradictions or fabricated evidence. Keywords, confidence statements, and verbosity earn no extra credit.

A provisional objective score is available immediately. **Overall scores stay null until semantic grading is complete.** Wrong/malformed/truncated/provider-failed responses remain in the denominator at zero; format, generation and provider failures are reported separately.

```sh
node benchmark/cli.js judge --run output/model-a-validation --judges judges.json --out output/model-a-judged
node benchmark/cli.js review-pack --run output/model-a-judged --out output/review.json
# Human reviewers complete score, reason, reviewer, and reviewed fields.
node benchmark/cli.js review-apply --run output/model-a-judged --review output/review.json --out output/model-a-reviewed
```

Use two distinct judge models, neither being the candidate. `benchmark/data/judges.example.json` shows the format. Judges receive the task, private answer key, rubric, and candidate text without run/model identity. Disagreements over one point require human adjudication. Judge failures also require adjudication. Review packs include blinded task/response/key material and must remain private for a held-out run.

Review labels are bound to exact response hashes and the original judged run. Keep that run unchanged; apply reviews to a new output directory. For a release gate, supply the **original judged run and its review bundle**, not the already modified reviewed run.

## Compare and release

```sh
node benchmark/cli.js compare --a output/a-reviewed --b output/b-reviewed
node benchmark/cli.js gate --bank private/bank.json --run output/private-judged --review output/private-review.json
```

Comparisons require identical bank/instructions/source versions, tiers, repeats, output caps, inference tracks, and matched response coverage. They report capability-balanced paired differences and 95% cluster-bootstrap intervals. Related templates stay in one resampling cluster; variants and repeated calls do not become extra independent questions. If the interval includes zero, or a capability has fewer than two independent clusters, the winner is unresolved. A comparison is exploratory until **both** runs pass their release gates.

Publication requires an independently authored private bank, two reviewers per held-out family, complete repeated-run coverage, two distinct judges, at least 100 human-labeled turns with >=90% within-one agreement for each judge, a deterministic stratified 10% response audit, adjudication of every disagreement, and resolution of review findings. Metadata attestations cannot prove secrecy or that a human actually reviewed a task: the operator must verify those facts. Never relabel the generated public bank as private.

See [the authoring contract and scoring details](benchmark/docs/methodology.md) for private-bank import, schemas, weighting, limitations, and review requirements.

## Legacy suite

The original `promptfooconfig*.yaml`, `prompts/`, and `tests/*.yaml` are preserved unchanged for historical reproducibility. Their keyword graders and some answer keys have known defects and should not support new performance claims. See [legacy results](benchmark/docs/legacy-results.md).

```sh
npm install
npm run legacy
# Original hard suite:
npx promptfoo eval -c promptfooconfig.hard.yaml --no-cache
```
