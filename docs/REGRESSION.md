# Regression Testing Framework

**Principle:** anything that worked before must still work after every change.
So every change runs the *entire* suite, not just tests near the edited code, and
nothing reaches `main` without passing that suite on the exact commit being released.

## Release pipeline

```
 feature work
      │  git push
      ▼
 ┌─────────┐  Dev CI: full suite on every push
 │   dev   │
 └────┬────┘
      │  PR dev → qa        QA Gate: source must be dev  +  full suite
      ▼
 ┌─────────┐  QA Regression & Promote: full suite on the merged qa commit,
 │   qa    │  then opens a "Release: qa → main" PR and merges it
 └────┬────┘
      │  PR qa → main       Main Gate: source must be qa  +  full suite
      ▼
 ┌─────────┐  Post-release Verification: full suite on main (every release + weekly)
 │  main   │
 └─────────┘
```

**No hotfixes.** A PR into `main` from any branch other than `qa`, and a PR into `qa`
from any branch other than `dev`, fails the **Source branch policy** check, and the
branch rulesets refuse to merge it. A production bug is fixed on `dev` and goes through
qa like everything else.

| Workflow | Trigger | What it does |
|---|---|---|
| `dev-ci.yml` | push to `dev` | full suite (early feedback) |
| `qa-gate.yml` | PR into `qa` | source must be `dev`, then full suite |
| `qa-promote.yml` | push to `qa` | full suite on the qa commit → open + merge release PR into `main` |
| `main-gate.yml` | PR into `main` | source must be `qa`, then full suite |
| `main-verify.yml` | push to `main`, weekly | full suite on production code |
| `regression.yml` | called by all of the above | the suite itself |

## What the suite contains

| Layer | Location | Catches |
|---|---|---|
| Unit | `test/unit/` | each documented rule of the engine |
| Golden master | `test/regression/golden.test.js` + `baselines/calc-golden.json` | **any** change to 1,600 recorded results (20 edge-case operands × 20 × 4 operations) |
| Property-based | `test/regression/properties.test.js` | wrong answers on 12,000 seeded random inputs, checked against independent BigInt maths and invariants (commutativity, a − a = 0, correct rounding, ≤ 10 digits, no `-0`) |
| API contract | `test/regression/api-contract.test.js` | changed status codes, response shapes, content types |
| Bug registry | `test/regression/bugs.test.js`, `BUG-*` in `test/e2e/` | a fixed bug coming back |
| End-to-end | `test/e2e/calculator.spec.js` | broken UI flows in a real browser (desktop + mobile) |
| Coverage gate | `npm run test:coverage` | new code with no tests (lines ≥ 95%, branches ≥ 85%, functions ≥ 95%) |

CI also runs the property tests with a fresh random seed (the run ID) on each run,
to explore new inputs. If that run fails, the log prints the seed. Reproduce it with:

```
REGRESSION_SEED=<seed> node --test test/regression/properties.test.js
```

Each test was checked against deliberately broken code: raising the digit limit to 11,
switching the rounding mode, cutting division precision, and restoring each fixed bug.
Every one of those changes turned the suite red.

## Running locally

```
npm test                 # unit + regression (about 2 s)
npm run test:coverage    # same, with coverage thresholds
npx playwright install chromium   # once
npm run test:e2e         # browser tests
npm run test:all         # everything CI runs
```

## When a golden test fails

1. **Unintended change → it's a regression.** Fix the code.
2. **Intended change** (for example, a new rounding rule): run `npm run baseline:update`
   and commit the updated `calc-golden.json`. The PR diff then shows exactly which
   results changed, so reviewers can check each one. Explain why in the PR.

Never update the baseline just to make a red build green.

## When you fix a bug

Add a test named `BUG-NNN: <what went wrong>` to `test/regression/bugs.test.js`
(or to the e2e spec for UI bugs) and add it to the table below. Confirm it **fails**
without your fix. Never delete entries.

| ID | Bug | Test |
|---|---|---|
| BUG-001 | Floating-point drift (0.1 + 0.2) | `bugs.test.js` |
| BUG-002 | Rounding carry into an 11th digit must be Limit Over | `bugs.test.js` |
| BUG-003 | A malformed URL (`/%E0`) crashed the whole server | `bugs.test.js` |
| BUG-004 | Results must never be `-0` | `bugs.test.js` |
| BUG-005 | Static path check matched sibling folders like `public-x/` | `bugs.test.js` |
| BUG-006 | ± right after an operator flipped the first number | `calculator.spec.js` |
| BUG-007 | Keys pressed during a pending calculation changed the display | `calculator.spec.js` |
| BUG-008 | Old expression stayed on screen after starting a new number | `calculator.spec.js` |

## One-time GitHub setup

These settings make the pipeline enforceable. They can't be set from the repo files.

1. **Settings → Actions → General → Workflow permissions:** choose *Read and write
   permissions* and tick *Allow GitHub Actions to create and approve pull requests*.
2. **Settings → General → Pull Requests:** tick *Allow auto-merge*. Leave
   *Automatically delete head branches* **unticked**, or every release would delete `qa`.
3. **Settings → Rules → Rulesets**, one ruleset targeting `main` and `qa`, *Active*:
   - Restrict deletions, Block force pushes
   - Require a pull request before merging (0 approvals if you work alone)
   - Require status checks to pass, with these checks added:
     `Source branch policy` and `regression / Regression verdict`
   - Leave the bypass list empty.
4. **Recommended: `PROMOTION_TOKEN` secret.** GitHub's built-in token cannot merge a
   release that changes files in `.github/workflows/`, and PRs it opens don't trigger
   the Main Gate. Create a fine-grained personal access token for this repo only, with
   *Contents: Read and write*, *Pull requests: Read and write* and *Workflows: Read and
   write*. Save it as the Actions secret `PROMOTION_TOKEN`.
   Without it, promotion still works for ordinary code changes, but you merge a release
   PR that touches workflows by hand (it's still gated by the same checks).
