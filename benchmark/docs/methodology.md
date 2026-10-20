# Authoring and scoring contract

## Scope and evidence

Measure behavior using self-contained task evidence. Do not require current medical, legal, scientific, or historical knowledge to recover an answer. Separate factual recall benchmarks from core critical thinking. Use fictional operational examples where possible.

The generated bank is an engineering scaffold: 160 family records, 40 templates, 480 scenarios. Repeated parameterizations and familiar examples cannot establish broad real-world reasoning ability. Some template siblings share identical mathematical structure or content; the inference cluster is the template, not the nominal family record. Private authoring must add genuinely different problems, realistic ambiguities, alternative valid answers, and mixed evidence strength. Increasing generated counts does not replace this work.

The public generator's 32/64/64 split exercises the runner. Templates never cross these splits, but every generated question and key is public. An actual held-out pack must be authored privately and imported via `--bank /path/to/bank.json`. Prefer the git-ignored `private/` directory. Do not commit its keys, outputs, reviews, seeds, or scenario generation material. Start a new benchmark version if held-out material is disclosed. Validation material may be public, but freeze held-out content before observing candidate model results.

## Versioned data interface

`node benchmark/cli.js export --out output/draft-bank` materializes a complete example JSON bank. `validate --bank PATH` is the executable schema and invariant checker. Version 1 uses JSON data only; it never evaluates item-supplied code.

A bank has `schemaVersion: 1`, a nonempty `version`, `status`, and `families`.

Each family has:

- `schemaVersion: 1`, unique `familyId`, `capability` from the eight-value taxonomy.
- `format: "static" | "multi"`, `split: "development" | "validation" | "heldout"`.
- `clusterId` for the broadest shared template/dependency and `relatedGroup` for related content. Neither may cross splits. When uncertain, use the broader cluster rather than claiming independence.
- `provenance` and `review` metadata. A release family requires `provenance: { "kind": "private-authored", "private": true, "independentlyAuthored": true }` and `review: { "status": "reviewed", "reviewers": ["reviewer-a", "reviewer-b"] }`. Names identify accountable reviewers; they are not automatically verifiable credentials.
- Exactly three `variants`: `reference`, `framing`, `evidence`, with IDs `familyId/variant`.

Each scenario has `visible` (the only initial candidate payload), `initialKey`, and optional multi-turn fields:

```json
{
  "visible": {
    "evidence": [{ "id": "E1", "text": "Complete supplied record" }],
    "question": "What follows from this record?",
    "numericTolerance": 0.000001,
    "choices": ["supported", "underdetermined"],
    "requests": [
      { "id": "inspect", "description": "A discriminating test", "cost": 1 }
    ]
  },
  "initialKey": {
    "conclusion": "underdetermined",
    "value": 0.5,
    "probability": 0.5,
    "tolerance": 0.000001,
    "evidence": ["E1"],
    "explanation": "A short derivation or sufficient justification",
    "rubric": {
      "id": "justification",
      "weight": 1,
      "anchors": {
        "0": "Wrong",
        "1": "Major error",
        "2": "Material gap",
        "3": "Minor omission",
        "4": "Correct and sufficient"
      },
      "acceptableAlternatives": ["Equivalent valid reasoning"]
    }
  }
}
```

`value`, `probability`, and `utilities` are optional key fields; omit irrelevant ones. The prompt must explicitly request any scored numeric quantity and its units. `probability` is an evidential posterior or stated generative event probability, never invented self-reported confidence. `utilities`, when present, maps conclusion choices to expected utility under the task's assumptions.

A multi-turn scenario additionally has `branches: { requestId: { visible, key } }` and `requestUtility: { requestId: numberFrom0To1 }`. Every offered request must have a scripted outcome and score. The branch `visible` may be an instruction containing no new observations, or a complete updated record with `choices` and `evidence`. For new evidence, include the **complete effective record** and all valid citation IDs in the branch; the final parser and judge use that record. Specify whether observations accumulate or replace a faulty earlier measurement. Do not silently treat a correction as independent corroboration.

Request costs must be visible. Authors derive normalized request utility from the scenario's diagnostic objective or net value of information, and document the derivation in the review. The built-in audit menu is deliberately simple and should not be mistaken for a rich investigation task. Static investigation examples also include diagnostic discrimination, interference-aware experimental design, and net information value.

A framing variant preserves the answer key and changes an irrelevant presentation cue. An evidence variant must change at least one substantive target (conclusion, value, probability, or expected utilities), not just its explanation. Not every evidence change must reverse a categorical answer: correct posterior magnitude changes count too.

## Candidate answer interface

Every turn returns one JSON object:

```json
{
  "conclusion": "underdetermined",
  "probability": 0.5,
  "value": 0.5,
  "evidence": ["E1"],
  "request": null,
  "justification": "The record does not distinguish the competing explanations."
}
```

Use null for unrequested numeric fields. On the first multi-turn turn, `request` is an offered request ID. On static/final turns it must be null. Numeric targets are finite; probabilities stay within [0,1]. Citation IDs must be supplied and unique. Short sufficient explanations are accepted; a long internal chain of thought is not requested. Formatting failures are reported separately and retained as unsuccessful responses.

## Scores

For each valid answer:

1. Conclusion correctness is binary. A numeric `value` earns 1 within the task's absolute tolerance, else 0. Probability quality is `1 - (reported - target)^2`; a missing requested probability earns 0.
2. Average these substantive components, then multiply by `0.9 + 0.1 * citationF1`. Citations alone cannot rescue incorrect content. Semantic review determines whether the cited evidence actually supports the explanation.
3. Semantic judges grade justification 0..4 using the task-specific anchors. If they agree within one point, average their scores. Otherwise withhold the semantic score pending human review. Overall turn score is `0.7 * objective + 0.3 * semantic / 4`.
4. A static scenario uses its turn score. A multi-turn scenario uses `0.35 * initial + 0.50 * final + 0.15 * requestUtility`. The same weighting produces the provisional objective-only scenario score. A failed required turn gives zero for the scenario, without removing its row.
5. Average scenarios/repeats within families, families within capabilities, and then the eight capabilities equally. An incomplete capability or ungraded valid response prevents an overall aggregate. Human adjudication overrides semantic grades and retains previous judge outputs.

Additional metrics include evidence-variant correctness, framing consistency **and** framing-pair correctness, expected Brier loss, squared probability error, squared error of belief-change magnitude, useful/harmful revisions, expected decision regret, request utility, tokens, latency and estimated cost. Stable wrong answers can have perfect consistency, so consistency must never stand alone.

For a supplied event probability q and a report p, expected Brier loss is `q*(1-q) + (p-q)^2`. This evaluates behavior under a known generative process. It is not empirical confidence calibration across real-world predictions. Empirical reliability diagrams would require resolved predictions and a separately specified dataset.

## Human review and publication

Before admitting an authored family, two independent reviewers must check the underlying arithmetic, causal identification assumptions, source dependencies, all scripted evidence branches, tolerances, legitimate alternative answers, and the intended framing/evidence invariants. Include cases where strong evidence warrants a confident decision; blanket skepticism and perpetual deferral must fail when unjustified.

Evaluate graders on human-labeled concise correct answers, paraphrases, subtly wrong calculations, contradictory prose, keyword stuffing, copied prompts, fabricated citations, and grader-directed instructions. A good objective answer with an incompatible explanation must not receive full semantic credit. The automated suite tests score/parser contracts; live judge resistance is established through human calibration, not assumed from a prompt.

`review-pack` selects at least 10% of response rows within every capability/format stratum, deterministically by hash, and adds all judge disagreements/failures. Both valid turns of selected multi-turn rows require review. Additional slots bring the pack to at least 100 distinct labeled turns when sufficient valid outputs exist. Small development runs cannot satisfy release calibration. Fill only labels actually reviewed by a human; unresolved items remain pending.

The gate checks exact response and bank hashes, coverage of all 64 held-out families / three variants / three repeats, private independent-authoring attestations, two named family reviewers, two distinct judges, >=100 distinct human labels, >=90% within-one agreement for each judge, required audits, pending judgments, and unresolved findings. Review records are trusted human attestations, not cryptographic proof of work or secrecy. Audit selection is frozen against the original judged run; do not rebase review records onto edited responses.

Human review must assess model-ranking sensitivity when disagreements are systematic. Review all disagreements affecting a published ordering and record open concerns in `findings` until resolved. If judges fail calibration, repair the rubrics and regrade or obtain sufficient human grades before publication. Preserve the failed calibration as part of the experiment history.

## Reproducibility and limitations

Provider adapters follow the [OpenAI Responses API quickstart](https://developers.openai.com/api/docs/quickstart) and [Anthropic Messages reference](https://platform.claude.com/docs/en/api/messages/create). The shared runner controls visible protocol and output limits; provider defaults, hidden reasoning, model updates and infrastructure failures can still affect results. Model IDs are explicitly configured, not selected by the benchmark.

Store bank and code versions, full raw outputs, judge configs/results, human review bundles, price assumptions and run settings privately. Publish methodology and safe aggregate artifacts without disclosing active held-out content. This implementation emits JSON artifacts and gate decisions; it does not upload a leaderboard or publish private material automatically.

Bootstrap comparisons resample entire dependency clusters within capabilities, keeping template siblings, variants and repeats together. Confidence intervals are conditional on this sampled task bank, not proof of universal critical thinking superiority. Repeated temperature-zero calls characterize service variability, not new questions. No recommendation to deploy a model should rest on a statistically unresolved ranking.
