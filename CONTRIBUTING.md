# Contributing

Before opening a pull request, make sure all four gates pass locally:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same four commands and `npm run verify` (a no-spend check).
Keep changes to the prompts in `src/lib/classroom-config.ts` covered by offline tests.
Never submit real planning or video requests just to test. The legacy
`scripts/probe-h3-expansion.mjs` probe costs money and requires explicit owner consent.
