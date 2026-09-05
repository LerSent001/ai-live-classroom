# Contributing

Before opening a pull request, make sure all four gates pass locally:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CI runs the same four commands. Keep changes to the prompts in `src/lib/classroom-config.ts`
verifiable: run `node --experimental-strip-types scripts/probe-h3-expansion.mjs` (one paid clip)
and paste the "survived" line in the PR description.
