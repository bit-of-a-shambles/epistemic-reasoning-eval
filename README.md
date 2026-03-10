# Epistemic Reasoning Skill Eval

A/B evaluation comparing Claude's reasoning quality with and without an [epistemic reasoning skill](https://github.com/duartemartins/.claude/skills/epistemic-reasoning/SKILL.md) injected as a system prompt.

Uses [promptfoo](https://promptfoo.dev) with both LLM-as-judge (Opus grading Sonnet) and programmatic JavaScript assertions.

## Results (2026-03-10, v2 — original 20 tests)

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

### Interpretation (v2)

The skill produces **no measurable aggregate effect** on Sonnet 4.6 (delta -0.003, well within noise for N=3). The original 20 tests are too easy — Sonnet 4.6 scores 94%+ on both conditions.

## Hard Tests (v3 — pending results)

10 harder questions designed to achieve a **60-70% baseline pass rate**, giving room for the skill to show improvement. Key design principles:

1. **Trap answers** — questions where the epistemically sophisticated-sounding answer is wrong
2. **Counterintuitive correct answers** — e.g., base rate neglect is sometimes the RIGHT approach (asymmetric costs)
3. **Multiple interacting biases** — not just "name the fallacy"
4. **Computation required** — not just pattern recognition
5. **Nuanced conclusions** — "both sides are partially right" cases that resist binary thinking

### Test Cases

| # | Test | What Makes It Hard |
|---|------|--------------------|
| 1 | Base rate + asymmetric costs | Trap: "base rate neglect is bad" → but treating is still correct due to lethality |
| 2 | Simpson's paradox (reversed) | Trap: "use disaggregated data" → here the subgroup data IS correct, drug is worse |
| 3 | Conjunction fallacy (complex) | Must resist narrative pull of detailed description |
| 4 | Prosecutor's fallacy (compute) | Must actually calculate, not just name the fallacy |
| 5 | Survivorship bias (nuanced) | Trap: just dismiss as "survivorship bias" → must note necessary-vs-sufficient |
| 6 | Publication bias (wrong fix) | Trap: "do another study" → must demand unpublished data first |
| 7 | Goodhart's law (both right) | Trap: dismiss all improvement as gaming → genuine improvement coexists with gaming |
| 8 | Stat sig vs practical sig | Must take a clear position against the policy, not just explain the distinction |
| 9 | Regression to mean + confounds | Trap: dismiss everything as RTM → must also address the confounds |
| 10 | Epistemic nihilism | Trap: "everything is uncertain" → must still make actionable claims from evidence |

### Grading

All 10 tests use **programmatic JavaScript assertions** (no LLM-as-judge). Each test has 4 assertions checking for specific reasoning elements. A test passes only if all 4 assertions pass.

### Running

```bash
# Hard tests only (10 repeats, ~$1.50)
npx promptfoo eval -c promptfooconfig.hard.yaml --no-cache

# Original tests (3 repeats, ~$2.50)
npx promptfoo eval

# View results
npx promptfoo view
```

## Setup

```bash
npm install
export ANTHROPIC_API_KEY=your-key
```

## Design

- **Test model:** Claude Sonnet 4.6 (temperature 0)
- **Grader (original tests):** Claude Opus 4.6 via `llm-rubric`
- **Grader (hard tests):** Programmatic JavaScript assertions (free, deterministic)
- **Conditions:** baseline (no system prompt) vs with_skill (full epistemic reasoning skill)
- **Framework:** promptfoo

## Cost

- Original 20 tests (3 runs): ~$2.50 (Sonnet generation + Opus grading)
- Hard 10 tests (10 runs): ~$1.50 (Sonnet generation only, no grading cost)
