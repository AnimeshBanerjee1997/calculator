# Apricot Calculator

A simple calculator for addition, subtraction, multiplication and division.
The browser handles input and display, and a Node.js backend does the math. Results can have up to **10 digits**. A bigger result shows **Limit Over**.

## Run

```
npm start        # http://localhost:3456   (set PORT to change)
npm test
```

You only need Node.js 18 or newer. There are no dependencies to install.

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
test/              node:test unit + API tests
```

## Branches

Code moves in one direction: **dev → qa → main**.

| Branch | Purpose |
|--------|---------|
| `dev`  | Day-to-day development. New features and fixes go here first. |
| `qa`   | Testing. Merge `dev` into `qa` when it's ready to test, and run `npm test` plus manual checks here. |
| `main` | Production-ready code. Merge only from `qa`, after QA passes. |

```
git checkout qa   && git merge dev   # promote dev to QA
git checkout main && git merge qa    # release QA to production
```

Never commit directly to `qa` or `main`. If QA finds a bug, fix it on `dev` and promote again.
