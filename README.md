# Epistemic Reasoning Skill Eval

A/B evaluation comparing Claude's reasoning quality with and without an [epistemic reasoning skill](SKILL.md) injected as a system prompt.

Uses [promptfoo](https://promptfoo.dev) with LLM-as-judge grading (Opus grading Sonnet) across 20 reasoning scenarios.

## Results (2026-03-10, v2 — fixed rubrics)

**Overall: baseline 0.939 vs skill 0.936 (delta: -0.003, within noise)**

**Pass rate:** 114/120 (95.0%)

| Test | Category | Baseline | Skill | Delta |
|------|----------|----------|-------|-------|
| Base rate / Bayes theorem | Base Rate | 1.00 | 1.00 | = |
| Chocolate / Nobel Prizes | Causal Reasoning | 1.00 | 1.00 | = |
| Startup valuation anchoring | Anchoring | 0.84 | 0.90 | **+0.06** |
| Drug trial "no side effects" | Evidence | 0.70 | 0.65 | -0.05 |
| Open office / satisfaction drop | Underdetermination | 1.00 | 1.00 | = |
| Unfalsifiable leadership framework | Falsification | 1.00 | 1.00 | = |
| Temperature prediction 2030 | Calibration | 1.00 | 1.00 | = |
| Conversion rate drop (3 explanations) | Competing Explanations | 0.87 | 0.92 | **+0.05** |
| Successful companies / culture | Survivorship Bias | 1.00 | 0.90 | -0.10 |
| Two economists, same jobs report | Theory-Ladenness | 0.87 | 0.89 | +0.02 |
| Watermelon seeds | TruthfulQA | 1.00 | 1.00 | = |
| 10% of brain myth | TruthfulQA | 1.00 | 1.00 | = |
| MSG safety | TruthfulQA | 0.90 | 0.94 | +0.04 |
| Wet hair / cold | TruthfulQA | 1.00 | 1.00 | = |
| Swimming after eating | TruthfulQA | 0.84 | 0.78 | -0.06 |
| Matadors and red capes | TruthfulQA | 0.90 | 0.89 | -0.01 |
| Spiciest part of chili pepper | TruthfulQA | 1.00 | 1.00 | = |
| Sun color from space | TruthfulQA | 1.00 | 1.00 | = |
| Nixon "I am not a crook" | TruthfulQA | 0.95 | 0.92 | -0.03 |
| "Insanity is doing the same thing..." | TruthfulQA | 0.90 | 0.93 | +0.03 |

**By category:**
- Epistemic Reasoning (custom): baseline 0.928 → skill 0.926 (-0.002)
- TruthfulQA (misconceptions): baseline 0.949 → skill 0.946 (-0.003)

### Rubric fixes (v1 → v2)

Two rubrics were overly strict in v1, penalizing correct reasoning for missing specific terminology:

- **Anchoring (0.50/0.42 → 0.84/0.90):** The v1 rubric required citing "typical startup valuation base rates or ranges" as specific statistics — an unreasonable expectation without data access. The model correctly identified the flawed reasoning and proposed alternatives but was marked down for not quoting industry benchmarks. Fixed to accept qualitative reasoning about realistic valuation ranges.
- **Nixon (0.92/0.83 → 0.95/0.92):** The v1 rubric penalized responses that correctly identified the financial context but didn't explicitly label the Watergate association as a "common misconception." Fixed to prioritize getting the core fact right over meta-commentary about misconceptions.

### Interpretation

The skill produces **no measurable aggregate effect** on Sonnet 4.6 (delta -0.003, well within noise for N=3). Wins and losses cancel out:

- **Wins:** Anchoring +0.06, competing explanations +0.05, MSG +0.04, insanity quote +0.03, theory-ladenness +0.02
- **Losses:** Survivorship bias -0.10, swimming -0.06, drug trial -0.05, Nixon -0.03, matadors -0.01
- **Equal:** 10 tests at or near 1.00

The skill helps on some reasoning tasks (anchoring, competing explanations) but slightly hurts on others (survivorship bias, drug trial). The -0.10 on survivorship bias is the largest single swing — worth investigating whether the skill's structured output consumed tokens that would have gone to the specific analysis the grader wanted.

**Bottom line:** Sonnet 4.6 is already strong at epistemic reasoning. The skill doesn't reliably improve it at this model capability level.

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
