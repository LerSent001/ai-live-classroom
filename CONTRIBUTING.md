# Contributing

Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and `npm run verify`.
Verification uses blank provider keys and must not spend credits. Never run paid generation as an automatic test.
Video creation and polling must use the fixed TokenDance gateway; do not add provider fallbacks or automatic POST retries.
Use injected fetch responses to test provider failures, task IDs, polling and recovery actions.
