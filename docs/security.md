# Dependency check

The wiki asks for dependencies without known vulnerabilities. We check this with `npm audit`, which compares `package-lock.json` with the public list of known vulnerabilities.

## How to check
```bash
npm audit
```
To check only the packages that run in the deployed app (no lint or test tools):
```bash
npm audit --omit=dev
```

## Result on 18 Nov 2026
- **Before:** 7 moderate findings, all from one cause: an old `minimatch` inside the lint tooling (`typescript-eslint` 8.72.2, advisory GHSA-g3hv-75wg-m249). Only used when we run `npm run lint`, never in the deployed app. `npm audit --omit=dev` found 0.
- **Fix:** `npm audit fix`. It changed only `package-lock.json`: `typescript-eslint` 8.72.2 → 8.73.0 with `minimatch` 11.0.9. All changed packages are dev tools; `package.json` and its pinned versions stay the same.
- **After:** `npm audit` finds **0 vulnerabilities**. Lint, typecheck and all tests (291 files, 3576 tests) pass.

Run the check again before each release and after adding a package.
