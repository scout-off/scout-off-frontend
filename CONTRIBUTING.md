# Contributing Guide

## Introduction

Thank you for contributing to the ScoutOff frontend. This repository is the Next.js frontend for the ScoutOff decentralized scouting platform. Contributions are welcome from anyone who wants to improve the code, tests, documentation, or developer experience.

The typical contribution workflow is:

1. Fork or clone the repository.
2. Create a feature branch.
3. Make changes and run local validation.
4. Open a pull request against `main`.

## Local Development Setup

> For a complete end-to-end guide covering contracts, backend, and wallet setup, see [DEVELOPMENT.md](DEVELOPMENT.md).

### Prerequisites

- Git
- Node.js 20.x or later
- npm (comes bundled with Node.js)

### Clone the repository

```bash
git clone https://github.com/scout-off/scout-off-frontend.git
cd scout-off-frontend
```

### Install dependencies

```bash
npm install
```

### Install Husky hooks

Husky hooks are installed automatically by the `prepare` script during `npm install`. If the hooks are missing, run:

```bash
npm run prepare
```

### Set up `.env.local`

Copy the example file and fill in environment-specific values:

```bash
cp .env.example .env.local
```

### Start the development environment

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Environment Configuration

This project uses `.env.local` for local environment variables. The repository includes `.env.example` with the variables that must be declared.

### Required environment variables

Copy every key from `.env.example` into `.env.local` and provide values appropriate for your local setup.

- `NEXT_PUBLIC_CONTRACT_ID`
- `NEXT_PUBLIC_NETWORK`
- `NEXT_PUBLIC_HORIZON_URL`
- `NEXT_PUBLIC_SOROBAN_RPC`
- `PINATA_API_KEY`
- `PINATA_SECRET`
- `NEXT_PUBLIC_IPFS_GATEWAY`
- `NEXT_PUBLIC_API_URL`
- `PLATFORM_CONTACT_FEE_XLM`
- `NEXT_PUBLIC_ADMIN_ADDRESS`
- `NEXT_PUBLIC_APP_URL`

> Keep `.env.local` out of version control. Do not commit any secrets, API keys, or private credentials.

### Environment validation

The project includes a validation script that checks whether environment variables used in source code are declared in `.env.example`.

Run the validator with:

```bash
node scripts/validate-env.js
```

### Common validation errors

- `Missing from .env.example:` means a `process.env.*` value is used in `.ts` or `.tsx` files but is not declared in `.env.example`.
- Fix it by adding the missing variable name to `.env.example` or removing the unused environment reference.
- If the script cannot read `.env.example`, make sure the file exists in the repository root.

## Branch Naming Convention

Use clear, descriptive branch names based on the type of work.

- `feat/<description>` — new feature or user-facing improvement
- `fix/<description>` — bug fix
- `test/<description>` — test coverage or test infrastructure work
- `chore/<description>` — repository maintenance, tooling, or dependency updates

### Good examples

- `feat/player-profile-ipfs-upload`
- `fix/validator-approval-modal`
- `test/player-search-hook`
- `chore/update-dependencies`

### Bad examples

- `new-feature`
- `bugfix`
- `work`
- `temp`

## Development Workflow

1. Create a branch from `main`:

```bash
git checkout main
git pull origin main
git checkout -b feat/your-description
```

2. Make changes in your branch.
3. Run validation and tests locally.
4. Push your branch and open a pull request against `main`.

## Running Tests

The repository exposes the following test-related commands:

- `npm run dev` — start the local Next.js development server
- `npm run lint` — run ESLint
- `npm run test` — run Jest tests
- `npm run format` — format files with Prettier
- `npm run format:check` — check formatting with Prettier
- `npm run prepare` — install Husky hooks

### Smart Contract Tests

When your changes include contract integration, run the smart contract tests from the contracts repository:

```bash
cd ../scout-off-contracts && cargo test
```

Run smart contract tests when your frontend changes depend on on-chain contract behavior, contract IDs, or Soroban interaction logic.

## Husky Pre-Commit Hooks

This project uses Husky to run checks before each commit. The repository has a pre-commit hook at `.husky/pre-commit` that executes `npx --no-install lint-staged`.

`lint-staged` runs:

- `eslint --fix` on staged `.js`, `.jsx`, `.ts`, and `.tsx` files
- `prettier --write` on staged `.json`, `.css`, `.md`, and `.mdx` files

These hooks help keep commits clean and consistent.

### Bypassing hooks

Only bypass hooks in an emergency:

```bash
git commit --no-verify
```

Do not use `--no-verify` for PRs targeting `main`.

## Pull Request Checklist

- [ ] Tests pass locally
- [ ] Environment validation passes (`node scripts/validate-env.js`)
- [ ] No secrets or credentials committed
- [ ] New features include tests where applicable
- [ ] Documentation updated where necessary
- [ ] Code follows project conventions and formatting

## Security Guidelines

- Never commit secrets, private keys, API tokens, or credentials.
- Keep `.env.local` and any local secret files out of Git.
- Use `.env.example` as the template for required environment variables.
- When sharing setup instructions, only share variable names, not values.

## Additional Notes

- The frontend repository is configured for GitHub Actions in `.github/workflows/ci.yml`.
- `npm run lint`, `npm run test`, and `node scripts/validate-env.js` are all part of the CI validation path.
- If Husky hooks are not active after cloning, run `npm run prepare`.

Thank you for helping improve ScoutOff.
