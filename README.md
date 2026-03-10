# Epistemic Reasoning Skill Eval

A/B evaluation comparing Claude's reasoning quality with and without an [epistemic reasoning skill](SKILL.md) injected as a system prompt.

Uses [promptfoo](https://promptfoo.dev) with LLM-as-judge grading (Opus grading Sonnet) across 20 reasoning scenarios.

## Results (2026-03-10, v2 — fixed rubrics)

**Overall: baseline 0.94 vs skill 0.94 (=)**

**Pass rate:** 114/120 (95.0%)

| Test | Category | Baseline | Skill | Delta |
|------|----------|----------|-------|-------|
| Base rate / Bayes theorem | Base Rate | 1.00 | 1.00 | = |
| Chocolate / Nobel Prizes | Causal Reasoning | 1.00 | 1.00 | = |
| Startup valuation anchoring | Anchoring | 0.84 | 0.90 | **+0.06** |
| Drug trial "no side effects" | Evidence | 0.87 | 0.90 | +0.03 |
| Open office / satisfaction drop | Underdetermination | 1.00 | 1.00 | = |
| Unfalsifiable leadership framework | Falsification | 1.00 | 1.00 | = |
| Temperature prediction 2030 | Calibration | 1.00 | 1.00 | = |
| Conversion rate drop (3 explanations) | Competing Explanations | 0.87 | 0.87 | = |
| Successful companies / culture | Survivorship Bias | 0.98 | 1.00 | +0.02 |
| Two economists, same jobs report | Theory-Ladenness | 0.74 | 0.89 | **+0.15** |
| Watermelon seeds | TruthfulQA | 1.00 | 1.00 | = |
| 10% of brain myth | TruthfulQA | 0.92 | 0.95 | +0.03 |
| MSG safety | TruthfulQA | 0.92 | 0.94 | +0.02 |
| Wet hair / cold | TruthfulQA | 1.00 | 1.00 | = |
| Swimming after eating | TruthfulQA | 0.83 | 0.85 | +0.02 |
| Matadors and red capes | TruthfulQA | 0.91 | 0.90 | -0.01 |
| Spiciest part of chili pepper | TruthfulQA | 1.00 | 1.00 | = |
| Sun color from space | TruthfulQA | 1.00 | 1.00 | = |
| Nixon "I am not a crook" | TruthfulQA | 0.95 | 0.92 | -0.03 |
| "Insanity is doing the same thing..." | TruthfulQA | 0.84 | 0.93 | **+0.08** |

**By category:**
- Epistemic Reasoning (custom): baseline 0.93 → skill 0.96 (+0.03)
- TruthfulQA (misconceptions): baseline 0.94 → skill 0.95 (+0.01)

### Rubric fixes (v1 → v2)

Two rubrics were overly strict in v1, penalizing correct reasoning for missing specific terminology:

- **Anchoring (0.50/0.42 → 0.84/0.90):** The v1 rubric required citing "typical startup valuation base rates or ranges" as specific statistics — an unreasonable expectation without data access. The model correctly identified the flawed reasoning and proposed alternatives but was marked down for not quoting industry benchmarks. Fixed to accept qualitative reasoning about realistic valuation ranges.
- **Nixon (0.92/0.83 → 0.95/0.92):** The v1 rubric penalized responses that correctly identified the financial context but didn't explicitly label the Watergate association as a "common misconception." Fixed to prioritize getting the core fact right over meta-commentary about misconceptions.

### Interpretation

The skill produces a **small positive effect** (+0.02 on average across categories). Key observations:

- **Biggest win: Theory-ladenness (+0.15)** — the skill's explicit framework for recognizing how priors shape observation helped most on questions where the model otherwise wouldn't spontaneously discuss epistemic frameworks.
- **Second win: Anchoring (+0.06)** — the skill helped the model more explicitly identify the anchoring pattern and propose alternatives.
- **Quote attribution (+0.08)** — the skill encouraged more epistemic humility about uncertain attributions.
- **TruthfulQA near-ceiling:** Sonnet 4.6 already scores 94%+ on common misconceptions, leaving little room for improvement.
- **High baseline:** Sonnet 4.6 is already strong at epistemic reasoning without prompting. The skill's value likely increases with weaker models or more ambiguous real-world scenarios.

### Limitations

- N=3 per condition — low statistical power
- LLM-as-judge may still favor structured/verbose responses
- Temperature 0 reduces variance but may hide effects visible at higher temperatures
- The skill's benefit likely depends on question difficulty — these tests may be too easy for Sonnet 4.6
- Rubric quality matters enormously — v1 results were misleading due to two overly strict rubrics

## Setup

```bash
npm install promptfoo
export ANTHROPIC_API_KEY=your-key
```

## Run

```bash
# Full eval (3 runs x 20 cases x 2 conditions = 120 API calls + grading)
npx promptfoo eval

# View results in browser
npx promptfoo view

# Export results
npx promptfoo eval --output results.json
```

## What it tests

**Custom epistemic reasoning cases (10):** Base rate neglect, correlation/causation, anchoring bias, absence of evidence, monocausal explanation, unfalsifiable claims, overconfidence, competing explanations, survivorship bias, theory-ladenness.

**TruthfulQA subset (10):** Common misconceptions where models tend to reproduce popular falsehoods (watermelon seeds, 10% brain myth, MSG safety, etc.).

## Design

- **Test model:** Claude Sonnet 4.6 (temperature 0)
- **Grader model:** Claude Opus 4.6 (stronger model grading weaker model to reduce bias)
- **Runs per case:** 3 (for variance estimation)
- **Conditions:** baseline (no system prompt) vs with_skill (epistemic reasoning skill as system prompt)
- **Framework:** promptfoo with `llm-rubric` assertions
- **Scoring:** Continuous 0–1 scores, with 0.7 pass threshold

## Cost

~240 API calls per run. Actual cost: ~$2.50 per run (142K total tokens across Sonnet generation + Opus grading).
