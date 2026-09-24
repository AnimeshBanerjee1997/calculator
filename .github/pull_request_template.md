## What changed

<!-- One or two sentences. -->

## Promotion path

- [ ] This PR is **dev → qa** or **qa → main**. Any other source is rejected (no hotfixes).

## Regression checklist

- [ ] `npm run test:all` passes locally
- [ ] New behaviour has tests (the coverage gate enforces the minimum)
- [ ] Bug fix? Added a `BUG-NNN` test that fails without the fix, and listed it in `docs/REGRESSION.md`
- [ ] Golden baseline changed? Every changed result is intended and explained below

## Baseline changes (if any)

<!-- Why did results in calc-golden.json change? -->
