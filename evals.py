"""
Epistemic Reasoning Skill Eval Harness

Runs reasoning prompts through Claude with and without the epistemic reasoning
skill injected as a system prompt, then grades responses on epistemic quality.
"""

import anthropic
import json
import time
import sys
from pathlib import Path

client = anthropic.Anthropic()

MODEL = "claude-sonnet-4-6"
GRADER_MODEL = "claude-sonnet-4-6"

SKILL_TEXT = Path("SKILL.md").read_text()

# Strip YAML frontmatter for system prompt injection
skill_prompt = SKILL_TEXT.split("---", 2)[-1].strip()

EVAL_CASES = [
    {
        "id": "base_rate_neglect",
        "category": "Base Rate",
        "prompt": (
            "A test for a rare disease (1 in 10,000 people) has a 99% sensitivity "
            "and 95% specificity. A patient tests positive. What is the probability "
            "they actually have the disease? Explain your reasoning."
        ),
        "criteria": [
            "mentions_base_rate",        # References the 1/10,000 prior probability
            "applies_bayes",             # Uses Bayesian reasoning or equivalent
            "correct_answer",            # Arrives at ~0.2% (not 99% or 95%)
            "mentions_false_positives",  # Discusses false positive rate
            "states_confidence",         # Calibrates confidence in answer
        ],
    },
    {
        "id": "correlation_causation",
        "category": "Causal Reasoning",
        "prompt": (
            "Countries that consume more chocolate per capita win more Nobel Prizes. "
            "A researcher concludes that chocolate consumption improves cognitive "
            "function at a national level. Evaluate this claim."
        ),
        "criteria": [
            "identifies_correlation_not_causation",  # Flags the logical gap
            "proposes_confounders",                  # Names plausible confounders (wealth, education, etc.)
            "questions_mechanism",                   # Asks about causal pathway
            "considers_alternatives",                # Offers alternative explanations
            "avoids_definitive_dismissal",           # Doesn't just say "wrong" without nuance
        ],
    },
    {
        "id": "anchoring_bias",
        "category": "Anchoring",
        "prompt": (
            "A startup founder tells you their company is worth $50M based on a "
            "comparable company that just raised at that valuation. The comparable "
            "company has 10x the revenue and is in a different market segment. "
            "How would you evaluate the startup's valuation claim?"
        ),
        "criteria": [
            "identifies_anchoring",          # Recognizes the $50M as an anchor
            "questions_comparability",       # Challenges the comparable selection
            "proposes_alternative_methods",  # Suggests other valuation approaches
            "considers_base_rates",          # References typical startup valuations
            "states_uncertainty",            # Acknowledges uncertainty in valuation
        ],
    },
    {
        "id": "absence_of_evidence",
        "category": "Evidence Evaluation",
        "prompt": (
            "A pharmaceutical company says their new drug has 'no known side effects' "
            "based on a 12-week trial with 200 participants. Should a doctor feel "
            "confident prescribing this drug for long-term use? Why or why not?"
        ),
        "criteria": [
            "flags_absence_vs_evidence",      # Distinguishes absence of evidence from evidence of absence
            "questions_sample_size",          # Notes 200 is small for rare side effects
            "questions_trial_duration",       # Notes 12 weeks is short for long-term use
            "considers_publication_bias",     # Considers reporting/publication incentives
            "recommends_caution",             # Advises appropriate caution
        ],
    },
    {
        "id": "monocausal_explanation",
        "category": "Underdetermination",
        "prompt": (
            "After a company switches to an open office plan, employee satisfaction "
            "drops by 20%. The CEO blames the office redesign. Is this conclusion "
            "justified? What else could explain the data?"
        ),
        "criteria": [
            "questions_monocausal",      # Challenges single-cause attribution
            "proposes_alternatives",     # Lists other possible causes
            "notes_timing_fallacy",      # Flags post hoc ergo propter hoc
            "suggests_investigation",    # Recommends gathering more data
            "acknowledges_partial_truth", # Allows that the redesign may be a factor
        ],
    },
    {
        "id": "unfalsifiable_claim",
        "category": "Falsification",
        "prompt": (
            "A management consultant claims their leadership framework 'always works' "
            "because when companies succeed it validates the framework, and when they "
            "fail it means they didn't implement it properly. Evaluate this claim."
        ),
        "criteria": [
            "identifies_unfalsifiability",  # Recognizes the claim can't be disproven
            "explains_why_problematic",     # Explains why unfalsifiable claims are uninformative
            "references_falsification",     # Invokes falsification principle (explicit or implicit)
            "identifies_ad_hoc",            # Recognizes the "didn't implement properly" as ad hoc rescue
            "suggests_testable_version",    # Proposes how to make the claim testable
        ],
    },
    {
        "id": "overconfidence",
        "category": "Calibration",
        "prompt": (
            "Predict whether the global average temperature in 2030 will be higher "
            "or lower than 2025, and by how much. Explain your reasoning."
        ),
        "criteria": [
            "provides_range_not_point",    # Gives a range rather than a single number
            "acknowledges_uncertainty",    # Explicitly notes what could go wrong
            "cites_evidence_basis",        # References climate data/trends
            "avoids_false_precision",      # Doesn't give unreasonably precise numbers
            "considers_counterarguments",  # Considers scenarios where prediction could fail
        ],
    },
    {
        "id": "competing_explanations",
        "category": "Inference to Best Explanation",
        "prompt": (
            "A website's conversion rate dropped 15% last week. The marketing team "
            "says it's because a competitor launched a similar product. The engineering "
            "team says it's because of a recent UI change. The analytics team notes "
            "it's also holiday season. Which explanation is most likely correct?"
        ),
        "criteria": [
            "evaluates_all_three",         # Considers all three explanations
            "ranks_by_evidence",           # Ranks based on available evidence
            "avoids_premature_conclusion", # Doesn't pick one without caveats
            "suggests_tests",              # Proposes ways to distinguish between explanations
            "considers_interaction",        # Considers multiple causes interacting
        ],
    },
    {
        "id": "survivorship_bias",
        "category": "Selection Bias",
        "prompt": (
            "A business book studies 50 highly successful companies and finds they "
            "all have strong corporate cultures. The author concludes that strong "
            "corporate culture is the key to business success. Is this reasoning valid?"
        ),
        "criteria": [
            "identifies_survivorship_bias",  # Names the bias
            "notes_missing_failures",        # Points out failed companies with strong culture aren't studied
            "questions_causation_direction", # Culture could be result of success, not cause
            "suggests_better_methodology",   # Proposes a study that includes failures
            "provides_nuanced_conclusion",   # Doesn't completely dismiss but qualifies
        ],
    },
    {
        "id": "theory_laden_observation",
        "category": "Theory-Ladenness",
        "prompt": (
            "Two economists look at the same jobs report showing 150,000 new jobs "
            "created. One says the economy is strong; the other says it's weakening. "
            "How can they reach opposite conclusions from identical data?"
        ),
        "criteria": [
            "explains_theory_ladenness",      # Observations are shaped by theoretical frameworks
            "identifies_different_priors",     # They have different baseline expectations
            "names_specific_frameworks",       # E.g., one expects 200K as healthy, other expects 100K
            "avoids_false_equivalence",        # Doesn't just say "both are right"
            "discusses_how_to_adjudicate",     # Suggests how to determine which interpretation is better
        ],
    },
]


GRADING_SYSTEM = """You are an expert evaluator of epistemic reasoning quality.

You will be given:
1. A reasoning prompt
2. A response to evaluate
3. A list of criteria to check

For each criterion, determine if the response meets it (true/false).
Be fair but rigorous. The criterion should be clearly demonstrated, not merely implied.

Respond with ONLY a JSON object mapping each criterion ID to true or false.
Example: {"mentions_base_rate": true, "applies_bayes": false, ...}"""


def run_eval(prompt: str, system: str | None = None) -> str:
    """Run a single eval prompt and return the response text."""
    kwargs = {
        "model": MODEL,
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system:
        kwargs["system"] = system
    response = client.messages.create(**kwargs)
    return next(b.text for b in response.content if b.type == "text")


def grade_response(prompt: str, response: str, criteria: list[str]) -> dict[str, bool]:
    """Grade a response against criteria using Claude as judge."""
    grading_prompt = f"""## Prompt Given
{prompt}

## Response to Evaluate
{response}

## Criteria to Check
{json.dumps(criteria)}

Return a JSON object mapping each criterion to true/false."""

    result = client.messages.create(
        model=GRADER_MODEL,
        max_tokens=1024,
        system=GRADING_SYSTEM,
        messages=[{"role": "user", "content": grading_prompt}],
    )
    text = next(b.text for b in result.content if b.type == "text")
    # Extract JSON from response (handle markdown code blocks)
    if "```" in text:
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


def run_full_eval():
    """Run all evals with and without the skill, then compare."""
    results = {"baseline": {}, "with_skill": {}}
    total_cases = len(EVAL_CASES)

    for i, case in enumerate(EVAL_CASES):
        case_id = case["id"]
        print(f"\n[{i+1}/{total_cases}] Running: {case_id} ({case['category']})")

        # Baseline (no skill)
        print("  Baseline...", end=" ", flush=True)
        baseline_response = run_eval(case["prompt"])
        baseline_grades = grade_response(case["prompt"], baseline_response, case["criteria"])
        results["baseline"][case_id] = {
            "response": baseline_response,
            "grades": baseline_grades,
            "score": sum(baseline_grades.values()) / len(baseline_grades),
        }
        bl_score = results["baseline"][case_id]["score"]
        print(f"{bl_score:.0%}")

        # With skill
        print("  With skill...", end=" ", flush=True)
        skill_response = run_eval(case["prompt"], system=skill_prompt)
        skill_grades = grade_response(case["prompt"], skill_response, case["criteria"])
        results["with_skill"][case_id] = {
            "response": skill_response,
            "grades": skill_grades,
            "score": sum(skill_grades.values()) / len(skill_grades),
        }
        sk_score = results["with_skill"][case_id]["score"]
        print(f"{sk_score:.0%}")

        # Brief pause to avoid rate limits
        time.sleep(1)

    return results


def print_report(results: dict):
    """Print a formatted comparison report."""
    print("\n" + "=" * 72)
    print("EPISTEMIC REASONING EVAL RESULTS")
    print("=" * 72)

    print(f"\n{'Case':<30} {'Category':<20} {'Baseline':>10} {'w/ Skill':>10} {'Delta':>8}")
    print("-" * 78)

    baseline_total = 0
    skill_total = 0
    n = 0

    for case in EVAL_CASES:
        cid = case["id"]
        bl = results["baseline"][cid]["score"]
        sk = results["with_skill"][cid]["score"]
        delta = sk - bl
        baseline_total += bl
        skill_total += sk
        n += 1

        delta_str = f"{delta:+.0%}"
        print(f"{cid:<30} {case['category']:<20} {bl:>10.0%} {sk:>10.0%} {delta_str:>8}")

    print("-" * 78)
    bl_avg = baseline_total / n
    sk_avg = skill_total / n
    delta_avg = sk_avg - bl_avg
    print(f"{'AVERAGE':<30} {'':<20} {bl_avg:>10.1%} {sk_avg:>10.1%} {delta_avg:>+8.1%}")
    print()

    # Per-criterion breakdown
    print("=" * 72)
    print("CRITERIA DETAIL")
    print("=" * 72)
    for case in EVAL_CASES:
        cid = case["id"]
        bl_grades = results["baseline"][cid]["grades"]
        sk_grades = results["with_skill"][cid]["grades"]
        print(f"\n{cid} ({case['category']}):")
        for crit in case["criteria"]:
            bl_val = bl_grades.get(crit, False)
            sk_val = sk_grades.get(crit, False)
            bl_mark = "+" if bl_val else "-"
            sk_mark = "+" if sk_val else "-"
            change = ""
            if sk_val and not bl_val:
                change = " << IMPROVED"
            elif bl_val and not sk_val:
                change = " << REGRESSED"
            print(f"  {crit:<40} baseline={bl_mark}  skill={sk_mark}{change}")

    print()


def main():
    print("Epistemic Reasoning Skill Eval")
    print(f"Model: {MODEL}")
    print(f"Grader: {GRADER_MODEL}")
    print(f"Cases: {len(EVAL_CASES)}")

    results = run_full_eval()

    print_report(results)

    # Save raw results
    output_path = Path("eval_results.json")
    # Strip full responses for the JSON output to keep it manageable
    slim_results = {"baseline": {}, "with_skill": {}}
    for condition in ["baseline", "with_skill"]:
        for cid, data in results[condition].items():
            slim_results[condition][cid] = {
                "grades": data["grades"],
                "score": data["score"],
            }
    slim_results["summary"] = {
        "model": MODEL,
        "grader": GRADER_MODEL,
        "n_cases": len(EVAL_CASES),
        "baseline_avg": sum(r["score"] for r in results["baseline"].values()) / len(EVAL_CASES),
        "skill_avg": sum(r["score"] for r in results["with_skill"].values()) / len(EVAL_CASES),
    }
    slim_results["summary"]["delta"] = slim_results["summary"]["skill_avg"] - slim_results["summary"]["baseline_avg"]

    output_path.write_text(json.dumps(slim_results, indent=2))
    print(f"Raw results saved to {output_path}")

    # Save full responses for review
    full_path = Path("eval_full_responses.json")
    full_path.write_text(json.dumps(results, indent=2))
    print(f"Full responses saved to {full_path}")


if __name__ == "__main__":
    main()
