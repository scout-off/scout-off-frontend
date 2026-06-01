# Contributing

## Pre-commit Hooks

This project uses [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged) to enforce code quality before every commit.

On each commit the following run automatically:

1. **ESLint** (`eslint --fix`) on all staged `.ts` and `.tsx` files
2. **TypeScript type-check** (`tsc --noEmit`) across the entire project

If either step fails the commit is blocked. Fix the reported errors and try again.

### Bypassing hooks

Use `--no-verify` only in exceptional circumstances (e.g. a work-in-progress commit on a personal branch). **Never bypass hooks on commits destined for `main` or a PR.**

```bash
git commit --no-verify -m "wip: ..."
```

### Installing hooks after cloning

Hooks are installed automatically when you run `npm install` via the `prepare` script. If they are missing, run:

```bash
npm run prepare
```
