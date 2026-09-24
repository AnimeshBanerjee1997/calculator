# Apricot Calculator

A simple calculator for addition, subtraction, multiplication and division.
The browser handles input and display, and a Node.js backend does the math. Results can have up to **10 digits**. A bigger result shows **Limit Over**.

## Run

```
npm install      # once, installs the test tooling
npm start        # http://localhost:3456   (set PORT to change)
npm test         # unit + regression tests
npm run test:all # everything CI runs, incl. browser tests (run `npx playwright install chromium` once first)
```

You need Node.js 22.8 or newer. The app itself has no runtime dependencies.

## Rules

- Each number you type can have at most 10 digits.
- A result can have at most 10 digits in total. If the whole-number part needs more than 10 digits, the backend returns `LIMIT_OVER`.
- If a result has a decimal part, it is rounded (half-up) so the total stays at 10 digits. For example, `1 ÷ 3 = 0.333333333`.
- The backend uses exact decimal math with BigInt, so `0.1 + 0.2 = 0.3`.
- Dividing by zero shows an error message.

## API

`POST /api/calculate` with the body `{ "a": "12", "b": "3", "operation": "add" | "subtract" | "multiply" | "divide" }`

- `200 { "ok": true, "result": "15" }`
- `422 { "ok": false, "error": "LIMIT_OVER" | "DIVIDE_BY_ZERO", "message": "..." }`
- `400` for an invalid number, a number with more than 10 digits, or an unknown operation

## Keyboard

`0–9`, `.`, `+ - * /`, `Enter` or `=`, `Backspace`, `Esc` (clear all), `F9` (±)

## Structure

```
server.js          HTTP server: static files + /api/calculate
lib/calc.js        exact decimal math and the 10-digit limit
public/            frontend (index.html, styles.css, app.js)
test/unit/         engine unit tests
test/regression/   golden baseline, property, API contract and bug-registry tests
test/e2e/          Playwright browser tests
scripts/           baseline generator
.github/workflows/ CI gates for dev → qa → main
```

## Branches and releases

Code moves in one direction: **dev → qa → main**. There are no hotfixes.

| Branch | Purpose |
|--------|---------|
| `dev`  | Day-to-day development. Every push runs the full regression suite. |
| `qa`   | Testing. Changes arrive only through a PR from `dev`, which must pass the suite. Once merged, the suite runs again on qa and, if it passes, the code is released to `main` automatically. |
| `main` | Production-ready code. Changes arrive only through the automated release PR from `qa`. |

To release, open a pull request from `dev` into `qa`. The pipeline does the rest.
See [docs/REGRESSION.md](docs/REGRESSION.md) for the full framework and the one-time GitHub setup.
