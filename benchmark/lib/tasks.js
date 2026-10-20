// Self-contained task constructors. Generated items are DRAFTS, not reviewed gold data.
export const capabilities = [
  "probability",
  "causality",
  "sources",
  "consistency",
  "investigation",
  "updating",
  "decisions",
  "framing",
];
const evidence = (text) => [{ id: "E1", text }];
function task(prompt, choices, conclusion, explanation, extra = {}) {
  return {
    prompt,
    choices,
    evidence: evidence(prompt),
    key: { conclusion, explanation, ...extra },
  };
}
function probability(k, n, changed) {
  const p = (n + 1) / 100,
    lr = changed ? 0.2 : 8;
  if (k === 0) {
    const sensitivity = changed ? 0.4 : 0.9,
      specificity = 0.95;
    const q =
      (p * sensitivity) / (p * sensitivity + (1 - p) * (1 - specificity));
    return task(
      `A randomly selected parcel is defective with probability ${p}. A sensor has sensitivity ${sensitivity} and specificity ${specificity}. It flags the parcel. Give P(defective | flag), assuming these rates apply.`,
      ["defective_more_likely", "sound_more_likely"],
      q > 0.5 ? "defective_more_likely" : "sound_more_likely",
      "Use the prior and both conditional sensor rates, not sensitivity alone.",
      { probability: q },
    );
  }
  if (k === 1) {
    const q = changed ? 0.15 : 0.65;
    return task(
      `Forecast an event that occurs with known probability ${q}. Choose between reporting ${q} and reporting ${changed ? 0.9 : 0.99}. Reports are scored with Brier loss. Return the optimal probability and its expected Brier loss.`,
      ["report_true_probability", "report_extreme"],
      "report_true_probability",
      "Expected squared loss is minimized at the true probability; minimum loss is q(1-q).",
      { probability: q, value: q * (1 - q) },
    );
  }
  if (k === 2) {
    const intersection = changed ? 0.1 : 0.3,
      a = 0.4,
      b = 0.5,
      q = a + b - intersection;
    return task(
      `P(A)=0.4, P(B)=0.5, P(A and B)=${intersection}. Is P(A or B) above 0.7? Return that union probability as value.`,
      ["above", "not_above"],
      q > 0.7 ? "above" : "not_above",
      "Inclusion-exclusion subtracts the overlap exactly once.",
      { value: q },
    );
  }
  if (k === 3) {
    const q = (p * lr) / (1 - p + p * lr);
    return task(
      `P(H)=${p}. New evidence has likelihood ratio P(E|H)/P(E|not H)=${lr}. Is H now more likely than not? Return the posterior probability.`,
      ["more_likely", "not_more_likely"],
      q > 0.5 ? "more_likely" : "not_more_likely",
      "Multiply prior odds by the likelihood ratio, then convert odds to probability.",
      { probability: q },
    );
  }
  const a = changed ? 0.12 : 0.6,
    b = 0.3;
  return task(
    `P(job change)=${a}; P(job change AND nonprofit job)=${b}. Are these probabilities coherent?`,
    ["coherent", "inconsistent"],
    a >= b ? "coherent" : "inconsistent",
    "The probability of an intersection cannot exceed its containing event.",
  );
}
function causality(k, n, changed) {
  const delta = 5 + n;
  if (k === 0)
    return task(
      `A training course was given only to the lowest-scoring workers. Scores rose ${delta} points. ${changed ? "A randomized untreated group selected by the same rule rose 0 points; assignment was randomized after selection, with complete follow-up and no other differences." : "There was no control group; territories and managers also changed."} Does the evidence identify a positive average training effect in this sample?`,
      ["identified_positive", "not_identified"],
      changed ? "identified_positive" : "not_identified",
      "Selection alone permits regression to the mean; randomized contemporaneous controls isolate the intervention under the stated assumptions.",
    );
  if (k === 1) {
    const rate = changed ? 0.65 : 0.4;
    return task(
      `Severity is measured before treatment, treatment has no effect on severity, and treatment assignment is random within each severity group. Recovery with treatment is ${rate} in mild and ${rate - 0.1} in severe cases; control recovery is .5 in mild and .4 in severe cases. Standardize to a population that is half mild and half severe. Return the treatment-minus-control recovery difference.`,
      ["beneficial", "harmful"],
      changed ? "beneficial" : "harmful",
      "Use pre-treatment severity adjustment; average the within-stratum contrasts with common weights.",
      { value: rate - 0.5 },
    );
  }
  if (k === 2)
    return task(
      `An experiment randomized an offer of a service. Only half accepted. ${changed ? "Every assigned person is analyzed in their assigned arm, including nonusers." : "The analyst removes nonusers and compares only users against all controls."} Can randomization alone justify the reported causal comparison?`,
      ["yes", "no"],
      changed ? "yes" : "no",
      "Intention-to-treat preserves randomization; conditioning on uptake creates selection.",
    );
  if (k === 3)
    return task(
      `Ice cream sales and drownings rise together. ${changed ? "In a randomized simulation changing only ice cream availability, drowning risk rises by 0.02; the simulation exactly represents the target system by assumption." : "Temperature influences both; no intervention or other identification strategy is available."} Is a positive causal effect of ice cream availability identified under the stated assumptions?`,
      ["identified", "not_identified"],
      changed ? "identified" : "not_identified",
      "Association with a common cause is not an intervention; the changed scenario supplies an identifying intervention.",
    );
  return task(
    `A hospital mortality rate fell from .04 to .03. ${changed ? "Case mix, complete population coverage, and measurement stayed fixed; a randomized comparison hospital stayed at .04." : "High-risk patients were diverted and their outcomes are unobserved."} Does this provide a causally interpretable estimate of lower mortality for the full eligible population?`,
    ["established", "not_established"],
    changed ? "established" : "not_established",
    "A selected denominator cannot establish full-population benefit; complete comparable randomized data can.",
  );
}
function sources(k, n, changed) {
  if (k === 0)
    return task(
      `${10 + n} newspapers endorse a claim. ${changed ? "Each commissioned a genuinely independent blinded measurement with valid methods; all agree." : "All copied one unverified press release; none checked it."} Does the count represent independent corroboration?`,
      ["independent", "dependent"],
      changed ? "independent" : "dependent",
      "Count independent originating observations rather than copies.",
    );
  if (k === 1)
    return task(
      `Of 40 registered trials, ${changed ? "all 40 are reported, including failures" : "only 3 positive trials are published; the other 37 results are withheld"}. A review uses only published trials. Does the stated reporting process create selective-publication bias?`,
      ["yes", "no"],
      changed ? "no" : "yes",
      "Selection on results biases the visible evidence; complete reporting removes that specific selection mechanism.",
    );
  if (k === 2)
    return task(
      `A sensor maker claims an accuracy improvement. ${changed ? "A blinded independent replication on representative preregistered data confirms it." : "Its only evidence is its sales brochure, with no data or methods."} Is there adequate empirical support for the claim in the supplied record?`,
      ["supported", "unsupported"],
      changed ? "supported" : "unsupported",
      "Assess accessible methods and independent evidence, rather than the confidence of the seller.",
    );
  if (k === 3)
    return task(
      `A historian attributes a quotation to writer X. ${changed ? "A dated authenticated manuscript by X contains the exact quotation and predates other known copies." : "The sole citation is an anonymous modern quote collection that gives no source."} Is the attribution supported by the supplied evidence?`,
      ["supported", "unsupported"],
      changed ? "supported" : "unsupported",
      "A traceable primary document supports attribution; unsourced repetition does not.",
    );
  return task(
    `A sample estimates a population rate. ${changed ? "The sample was drawn uniformly from the target population with no nonresponse." : "Participants self-selected from a forum organized around having experienced the outcome."} Does the sampling design justify treating the unweighted sample rate as representative?`,
    ["yes", "no"],
    changed ? "yes" : "no",
    "Representativeness follows the sampling design, not the size or vividness of the sample.",
  );
}
function consistency(k, n, changed) {
  if (k === 0) {
    const claimed = changed ? 0.34 : 0.45;
    return task(
      `A treatment arm is 80% severe cases. Recovery is .30 in severe and .50 in mild cases. The report claims overall recovery ${claimed}. Are these data internally consistent? Return the implied overall rate.`,
      ["consistent", "inconsistent"],
      changed ? "consistent" : "inconsistent",
      "A weighted average must match .8*.3+.2*.5=.34.",
      { value: 0.34 },
    );
  }
  if (k === 1)
    return task(
      `A database query returns ${20 + n} unique records. A report says there are ${20 + n + (changed ? 0 : 5)} unique records from exactly that query and snapshot, using the same definition. Can both claims be true?`,
      ["yes", "no"],
      changed ? "yes" : "no",
      "Identical populations, snapshots and definitions must have identical counts.",
    );
  if (k === 2)
    return task(
      `There are 100 disjoint observations. Group A contains 60; group B contains ${changed ? 40 : 50}. A and B are exhaustive and disjoint. Is the report coherent?`,
      ["coherent", "inconsistent"],
      changed ? "coherent" : "inconsistent",
      "Counts of an exhaustive disjoint partition sum to the total.",
    );
  if (k === 3)
    return task(
      `A test has a 1% false-positive rate. ${changed ? "No prevalence is supplied." : "Prevalence is .5 and sensitivity is .99."} Can you uniquely calculate P(condition | positive) from the supplied information? If determined, return that probability.`,
      ["determined", "underdetermined"],
      changed ? "underdetermined" : "determined",
      "A false-positive rate alone does not determine the posterior; a prior and sensitivity are needed.",
      changed ? {} : { probability: 0.99 },
    );
  return task(
    `A delivery route covers ${10 + n} km in 30 minutes. The claimed average speed is ${changed ? 2 * (10 + n) : 10 + n} km/h. Is the claim consistent? Return the actual km/h.`,
    ["consistent", "inconsistent"],
    changed ? "consistent" : "inconsistent",
    "Convert 30 minutes to half an hour before dividing distance by time.",
    { value: 2 * (10 + n) },
  );
}
function investigation(k, n, changed) {
  if (k === 0) {
    const pa = changed ? 0.5 : 0.9,
      pb = changed ? 0.9 : 0.5;
    return task(
      `Two equally likely faults H1 and H2 remain. Equal-cost binary test A has P(+|H1)=${pa} and P(+|H2)=${1 - pa}; B has P(+|H1)=${pb} and P(+|H2)=${1 - pb}. Which test has greater expected information gain?`,
      ["test_a", "test_b"],
      changed ? "test_b" : "test_a",
      "Under equal priors the symmetric .9/.1 test discriminates; .5/.5 is independent of the fault.",
    );
  }
  if (k === 1) {
    const cost = changed ? 8 : 2;
    return task(
      `A repair decision currently has minimum expected loss 10 units. A perfect diagnostic will reduce expected repair loss to 4 units before paying for the test. The test costs ${cost} units. Should you buy it under expected monetary loss? Return net expected value of buying the test (positive means beneficial).`,
      ["buy", "skip"],
      changed ? "skip" : "buy",
      "Net value of information is avoided expected loss minus test cost; information can be valuable yet too expensive.",
      { value: 6 - cost },
    );
  }
  if (k === 2)
    return task(
      `A service error has two explanations: overload H1 and expired credentials H2. ${changed ? "Under both hypotheses CPU load and authentication errors have the same predicted distributions; packet tracing perfectly distinguishes them." : "CPU load has identical predictions under H1 and H2; authentication errors are predicted only by H2; packet tracing has identical predictions under both."} Which next observation discriminates the hypotheses? All costs are equal.`,
      ["cpu", "authentication", "packet_trace"],
      changed ? "packet_trace" : "authentication",
      "Choose evidence with different predictions under the alternatives, not a familiar but nondiagnostic metric.",
    );
  if (k === 3)
    return task(
      `You want to estimate whether a new search ranking causes more purchases. ${changed ? "User randomization is impossible because all users share the same ranking; isolated geographic markets can be randomized without spillovers." : "Users can be independently randomized with no interference; geographic markets cannot be isolated and have major spillovers."} Choose the design that supplies an unbiased randomized contrast under these assumptions.`,
      ["randomize_users", "randomize_markets"],
      changed ? "randomize_markets" : "randomize_users",
      "Randomize at a unit without interference and preserve comparable assignment groups.",
    );
  return task(
    `A witness has already told you a machine failed. You need an independent check. Report A ${changed ? "copies that witness" : "comes from a separate calibrated sensor with independent error"}. Report B ${changed ? "comes from a separate calibrated sensor with independent error" : "copies the witness verbatim"}. Which report adds independent evidence?`,
    ["a", "b"],
    changed ? "b" : "a",
    "Independent evidence depends on the generating process; a second document is not necessarily a second observation.",
  );
}
function updating(k, n, changed) {
  if (k === 0) {
    const prior = 0.2,
      lr = changed ? 0.1 : 9,
      q = (prior * lr) / (1 - prior + prior * lr);
    return task(
      `Prior P(H)=.2. A fresh observation has likelihood ratio ${lr}. A colleague says consistency requires keeping the prior. Is H now more likely than not? Return the posterior.`,
      ["more_likely", "not_more_likely"],
      q > 0.5 ? "more_likely" : "not_more_likely",
      "Consistency requires the same inference rule; multiply prior odds by the new likelihood ratio.",
      { probability: q },
    );
  }
  if (k === 1) {
    const q = changed ? 0.9 : 0.5;
    return task(
      `Prior P(H)=.1. One test with likelihood ratio 9 has already moved P(H) to .5. A second report ${changed ? "is a fresh conditionally independent test with likelihood ratio 9" : "is an exact copy of the first test, not a new observation"}. What is the posterior after the second report?`,
      ["above_half", "half"],
      changed ? "above_half" : "half",
      "Only conditionally independent new evidence supplies another factor in the odds; copied evidence must not be counted twice.",
      { probability: q },
    );
  }
  if (k === 2) {
    const q = changed ? 0.2 : 0.8;
    return task(
      `Two exhaustive models H and not-H had prior .5. A supposedly reliable observation moved P(H) to .8. An audit ${changed ? "finds that observation was inverted: its actual likelihood ratio is .25" : "verifies its likelihood ratio was 4"}. Recompute the posterior using the audit-corrected likelihood, replacing the old observation rather than adding another independent one.`,
      ["above_half", "below_half"],
      changed ? "below_half" : "above_half",
      "A correction replaces a faulty likelihood; treating a correction as independent evidence double counts the underlying measurement.",
      { probability: q },
    );
  }
  if (k === 3)
    return task(
      `A deterministic model predicts that every alloy sample survives a temperature of 600 degrees. ${changed ? "One calibrated, independently verified sample fails at 600 degrees; composition and apparatus are confirmed correct." : "An uncalibrated thermometer reports one failure, but later calibration shows the test was actually at 900 degrees."} Does the supplied observation falsify the stated 600-degree prediction?`,
      ["falsified", "not_falsified"],
      changed ? "falsified" : "not_falsified",
      "A contradiction must concern the actual prediction and verified conditions; an observation outside those conditions does not test it.",
    );
  return task(
    `Prior P(H)=.7. Evidence E ${changed ? "has P(E|H)=.1 and P(E|not H)=.7" : "has P(E|H)=.4 and P(E|not H)=.4"}. Does E favor H, favor not-H, or leave odds unchanged? Return the posterior.`,
    ["favor_h", "favor_not_h", "unchanged"],
    changed ? "favor_not_h" : "unchanged",
    "Compare likelihoods, not whether the observation feels surprising in isolation.",
    { probability: changed ? 0.25 : 0.7 },
  );
}
function decisions(k, n, changed) {
  if (k === 0) {
    const p = 0.01,
      loss = 100 + n,
      cost = changed ? p * loss * 2 : (p * loss) / 2;
    return task(
      `An equipment failure has known probability ${p}. Doing nothing costs ${loss} units if it fails and zero otherwise. Prevention costs ${cost} units for certain and completely prevents failure. Ignore all other costs and minimize expected monetary loss. Return the minimum expected loss.`,
      ["prevent", "do_nothing"],
      changed ? "do_nothing" : "prevent",
      "Compare certain prevention cost to probability times loss. Low probability can justify prevention when losses are asymmetric.",
      {
        value: Math.min(cost, p * loss),
        utilities: { prevent: -cost, do_nothing: -p * loss },
      },
    );
  }
  if (k === 1) {
    const p = changed ? 0.8 : 0.2,
      insurance = 30,
      loss = 100,
      best = Math.min(p * loss, insurance);
    return task(
      `A shipment is lost with probability ${p}; loss is 100 units. Full insurance costs 30 units and pays exactly the loss when it occurs. You are risk-neutral and ignore all other considerations. Choose whether to insure and return minimum expected cost.`,
      ["insure", "uninsured"],
      changed ? "insure" : "uninsured",
      "Compare premium against expected uninsured loss; a low-probability narrative is not a decision criterion.",
      { value: best, utilities: { insure: -insurance, uninsured: -p * loss } },
    );
  }
  if (k === 2) {
    const gain = changed ? 12 : 4;
    return task(
      `You may pay 6 units for an experiment. Its expected improvement in the later decision payoff, before paying for the experiment, is ${gain} units. No other benefit or cost exists. Should you run it? Return the net expected gain.`,
      ["run", "skip"],
      changed ? "run" : "skip",
      "Value of information must exceed its cost; more evidence is not automatically worth acquiring.",
      { value: gain - 6, utilities: { run: gain - 6, skip: 0 } },
    );
  }
  if (k === 3) {
    const future = changed ? -5 : 5;
    return task(
      `A project has already cost 1000 unrecoverable units. Continuing has expected FUTURE net payoff ${future}; stopping has future payoff zero. No reputation or contractual effects exist. Choose the action maximizing expected future payoff and return that payoff.`,
      ["continue", "stop"],
      changed ? "stop" : "continue",
      "Exclude unrecoverable sunk costs; compare only consequences that differ between available actions.",
      { value: Math.max(0, future), utilities: { continue: future, stop: 0 } },
    );
  }
  const p = changed ? 0.8 : 0.2;
  return task(
    `You must classify an item as dangerous or safe. P(dangerous)=${p}. False-safe classification costs 10 units; false-danger classification costs 4; correct classifications cost zero. Minimize expected loss and return that loss.`,
    ["dangerous", "safe"],
    changed ? "dangerous" : "safe",
    "The decision threshold depends on relative error costs, not an automatic 50% rule.",
    {
      value: Math.min((1 - p) * 4, p * 10),
      utilities: { dangerous: -(1 - p) * 4, safe: -p * 10 },
    },
  );
}
function framing(k, n, changed) {
  if (k === 0) {
    const a = 40 + n,
      b = changed ? a + 10 : a - 10;
    return task(
      `In a complete randomized experiment A succeeds for ${a}/100 participants and B for ${b}/100. A respected sponsor demands B. The stated rule is to maximize observed sample success rate, with no population inference. Which option follows that rule? Return its observed success rate.`,
      ["a", "b"],
      changed ? "b" : "a",
      "Apply the stipulated criterion to the data rather than the sponsor preference.",
      { value: Math.max(a, b) / 100 },
    );
  }
  if (k === 1) {
    const b = changed ? 30 : 10;
    return task(
      `A proposal is advertised as saving 80 of 100 units. Another is described as losing ${b} of 100 units. The amounts are certain and all other consequences identical. Choose the proposal retaining more units and return its retained fraction.`,
      ["first", "second"],
      changed ? "first" : "second",
      "Convert gains and losses to the same reference point; wording cannot determine the comparison.",
      { value: Math.max(80, 100 - b) / 100 },
    );
  }
  if (k === 2) {
    const a = changed ? 95 : 20;
    return task(
      `A prestigious firm reports ${a} successful cases out of 100. An unknown firm reports 9 out of 10. Counts are verified and the rule is to maximize observed success FRACTION only. An adviser argues prestige makes the first firm superior. Which firm wins under the rule? Return the winning fraction.`,
      ["prestigious", "unknown"],
      changed ? "prestigious" : "unknown",
      "Compare fractions rather than raw counts or prestige; compare each verified fraction to .9.",
      { value: changed ? 0.95 : 0.9 },
    );
  }
  if (k === 3)
    return task(
      `A committee votes 99 to 1 that every item in a box is blue. A calibrated camera ${changed ? "verifies every item in the closed box is blue" : "verifies one item in the box is red"}. The vote supplies no other evidence. Is the universal claim supported by this observation?`,
      ["supported", "refuted"],
      changed ? "supported" : "refuted",
      "A universal claim depends on verified observations, not vote count; one genuine counterexample refutes it.",
    );
  const q = changed ? 0.9 : 0.1;
  return task(
    `You favor hypothesis H for political reasons. Independent data with known sampling properties imply P(H|data)=${q}; this posterior is supplied as a fact for the task. Your ally insists H is almost certain. Is H more likely than not on the supplied evidence? Return the posterior.`,
    ["more_likely", "not_more_likely"],
    changed ? "more_likely" : "not_more_likely",
    "Political preference does not change the stipulated evidential posterior.",
    { probability: q },
  );
}
const builders = {
  probability,
  causality,
  sources,
  consistency,
  investigation,
  updating,
  decisions,
  framing,
};
export function buildTask(capability, archetype, index, changed = false) {
  return builders[capability](archetype, index, changed);
}
