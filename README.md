# Epistemic Reasoning Skill Eval

A/B evaluation comparing Claude's reasoning quality with and without an epistemic reasoning skill injected as a system prompt.

## Setup

```bash
npm install -g promptfoo
export ANTHROPIC_API_KEY=your-key
```

## Run

```bash
# Full eval (3 runs × 20 cases × 2 conditions = 120 API calls + 120 grading calls)
promptfoo eval

# View results in browser
promptfoo view
```

## What it tests

**Custom epistemic reasoning cases (10):** Base rate neglect, correlation/causation, anchoring bias, absence of evidence, monocausal explanation, unfalsifiable claims, overconfidence, competing explanations, survivorship bias, theory-ladenness.

**TruthfulQA subset (10):** Common misconceptions where models tend to reproduce popular falsehoods (watermelon seeds, 10% brain myth, MSG safety, etc.).

## Design

- **Test model:** Claude Sonnet 4.6 (temperature 0)
- **Grader model:** Claude Opus 4.6 (stronger model grading weaker model to reduce bias)
- **Runs per case:** 3 (for variance estimation)
- **Conditions:** baseline (no system prompt) vs with_skill (epistemic reasoning skill as system prompt)

## Cost estimate

~240 API calls total. At Sonnet rates ($3/$15 per 1M in/out) + Opus grading ($5/$25 per 1M in/out): roughly **$3–5**.
