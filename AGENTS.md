# AGENTS.md

Rules for every AI coding tool (Claude Code, Codex, Cursor, Copilot) and every human working on AP TransitOS. Read this file fully before any task.

## Project in one line

AP TransitOS is one connected public transport platform for Andhra Pradesh: citizen web app (PWA), driver app, conductor scanner, depot operations and a government command center, all in one monorepo.

## Read before any task

1. `progress/handoff.md`: what exists today, how it works, patterns to copy, known gotchas. Always read it fully.
2. `docs/00-index.md` (map of all docs).
3. Today's prompt in `prompts/day-NN.md`.
4. The docs that prompt lists under "Read first".
5. The README of every package you will touch: `apps/api`, `apps/web`, `packages/shared`, `packages/ui`, `packages/config`.

The docs in `docs/` are **locked**. Do not edit them during a feature task. If a doc is wrong or missing something, stop, write the question in `progress/decisions-log.md`, and tell the human. A locked doc changes only after both devs agree and the decision is logged.

## Repo layout

```
apps/web          Next.js 16 (citizen, driver, conductor, ops, gov, admin)
apps/api          NestJS 11 (REST + Socket.IO + BullMQ workers)
packages/shared   zod schemas, enums, status map, fare and time helpers (used by web and api)
packages/ui       design tokens + React components
packages/config   eslint, tsconfig, prettier presets
scripts/          repo scripts (check-dashes, simulator, seed helpers)
docs/             locked reference docs
prompts/          daily prompts
progress/         daily log + decisions log
```

## Ownership

| Area | Owner | Reviewer |
| --- | --- | --- |
| `apps/web`, `packages/ui`, i18n messages | Dev A (frontend) | Dev B |
| `apps/api`, Prisma schema, seeds, infra, CI | Dev B (backend) | Dev A |
| `packages/shared` | Both. Any change needs the other dev's review | Both |

## Hard rules

1. **No em dash or en dash anywhere.** Not in code, comments, UI copy, docs, commit messages or seed data. Use a comma, colon, period, parentheses, or the word "to" for ranges ("06:30 to 12:10"). `pnpm check:dashes` must pass.
2. **No hardcoded UI strings.** Every visible string is a next-intl key in both `apps/web/messages/en.json` and `apps/web/messages/te.json`, added in the same commit.
3. **Tokens only.** No raw hex colours, no arbitrary pixel values, no inline styles. Use the Tailwind theme generated from `packages/ui/src/tokens.css`.
4. **One status system.** Status labels, colours and icons come only from `packages/shared/src/status.ts`. Colour is never the only signal: always show the label and icon too.
5. **Server is the source of truth.** Never trust the client for payment result, ticket status, eligibility, fare, seat availability or location ownership.
6. **Every mutating endpoint** has: zod validation, auth guard, permission check, rate limit, and an audit log entry when listed in `docs/12-security.md`.
7. **Money** is stored as integer paise. **Time** is stored in UTC, shown in `Asia/Kolkata`.
8. **No new dependency** unless it is listed in `docs/04-tech-stack.md`. Need one? Log it in `progress/decisions-log.md` first.
9. **Accessibility is not optional.** WCAG 2.2 AA. Touch targets at least 44 px (56 px in driver and conductor apps). Visible focus ring. Works with keyboard and screen reader.
10. **Every screen has four states:** loading (skeleton), empty, error (with retry), success. See `docs/11-screens.md`.
11. **Business rules are not invented.** If a rule is not in `docs/07-ticket-and-pass-rules.md`, ask. Do not guess fares, refund rates or eligibility.
12. **Check the installed framework docs, not memory.** Next.js 16 ships its own guides in `apps/web/node_modules/next/dist/docs/`. APIs may differ from what an AI tool learned. Read the relevant guide before using a Next.js API you are unsure about.
13. **No secrets in code or logs.** Use `.env` (never committed). Never log OTPs, tokens, payment signatures or full phone numbers outside dev mode.

## Trigger phrase: "I am Mukheeth, complete the work"

If the human says they are Mukheeth (GitHub `syedmukheeth`, Dev B, backend and reviewer) or Saad (`Saadahmed05`, Dev A, frontend) and asks you to complete, continue or finish the work, do this without asking for more instructions:

1. Read this file, then `progress/handoff.md` fully, then `prompts/next/README.md`.
2. `git fetch --all`, branch from the latest `main` (or from `a/kurnool-spots` if its PR is not merged yet), named `a/<short-name>` or `b/<short-name>` for the dev who is speaking.
3. Do every item under "Agent tasks" in `prompts/next/README.md`, in order, one commit per logical step. Tick each item in that file as it is done and fix real failures instead of skipping tests.
4. Do not edit locked docs, do not invent business rules, do not add dependencies. Items under "Human tasks" are not yours: list them in your final message.
5. Finish with the Definition of done, update `progress/handoff.md` and `progress/daily-log.md`, push and open a PR to upstream `main`. Ownership in the table above still decides who reviews.

## Commits and pull requests

- Title only by default. Imperative mood, under 60 characters, no trailing period. Example: `Add seat hold with Redis TTL`.
- Add a body only when the reason is not obvious. Keep it to 1 or 2 short lines.
- **Never** add `Co-authored-by`, `Generated-by`, `AI-assisted` or any AI attribution line, in commits or PR descriptions.
- Before every commit check: no AI attribution, author is the dev's own git account.
- If your editor or AI tool adds co-author trailers automatically, turn that setting off. Do not add git hooks to work around it.
- One feature per branch: `a/<short-name>` for Dev A, `b/<short-name>` for Dev B. Merge to `main` through a PR reviewed by the other dev.

## Commands

```bash
pnpm install          # install everything (needs pnpm 11: npm i -g pnpm@11)
pnpm dev              # web on :3000, api on :4000
pnpm dev:worker       # background worker (WORKER=1)
pnpm lint             # eslint + check:dashes
pnpm typecheck        # tsc across the repo
pnpm test             # vitest across the repo + script tests
pnpm build            # build everything
pnpm db:migrate       # prisma migrate dev on your own Neon branch (Dev B)
pnpm db:seed          # seed AP demo data (from Day 2)
pnpm e2e              # playwright (from Day 5)
pnpm check:dashes     # fails on U+2014 or U+2013
pnpm --filter api exec prisma <command>   # any Prisma CLI command
```

## Definition of done

See `prompts/_shared/definition-of-done.md`. A task is not done until every box is checked and the end of day report is written in `progress/daily-log.md`.

At the end of every day, update the "Current state" section of `progress/handoff.md` (git state, what works, what is not done, new decisions, new gotchas) and the package READMEs if a pattern changed. The next session, human or AI, starts from that file.
