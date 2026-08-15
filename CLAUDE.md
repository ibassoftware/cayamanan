# Cayamanan — AI-first HRIS SaaS

Payroll is the mission-critical core. Everything else (employees, contracts, attendance, leave, benefits, self-service, HR admin, recruitment, performance, documents, reporting, analytics, AI assistants, integrations) is built around it, multi-company and multi-tenant.

## Engineering priorities
1. correctness 2. payroll integrity 3. security & privacy 4. maintainability 5. simplicity 6. performance 7. token efficiency

Correctness and security always override token savings.

## General rules
- Follow the existing architecture; inspect before changing; keep changes minimal and reviewable.
- Add tests for meaningful behaviour.
- Use exact decimal arithmetic for money — never binary floating point. Rounding is explicit.
- Enforce tenant and company isolation server-side. Never trust a client-supplied tenant id.
- Never expose salary, bank, tax or PII data outside its authorization boundary — including logs, errors, exports and analytics.
- Finalized historical payroll must not change silently when configuration changes.
- Deterministic software is authoritative for all payroll calculations. AI explains, flags and assists; it never computes the amount.
- Audit high-risk actions (salary, bank details, termination, permissions, payroll approve/finalize/reopen/adjust). Do not audit trivial UI events.

## Agent routing
Opus decides · Sonnet builds · Haiku finds and verifies. Use the cheapest model that reliably does the job, and escalate along Haiku → Sonnet MEDIUM → Sonnet HIGH → Opus HIGH.

- Discovery ("where is X?") → `codebase-explorer` **first**, before any Sonnet/Opus agent reads the repo.
- Normal feature → `engineering-lead` → explorer → specialist(s) → `qa-engineer`.
- Payroll amounts → `payroll-engineer`, then `payroll-domain-reviewer`.
- Architecture / conflicting designs / high-reversal-cost decisions → `product-architect`.
- Reviewers (`security-privacy-reviewer`, `database-reviewer`, `payroll-domain-reviewer`) are read-only and are invoked when the change warrants it, not by default.

## Working rules for all agents
- Search before reading; read only what the task needs.
- Pass task packets and decisions, not conversation history or reasoning transcripts.
- One owner per implementation task — extra perspectives come from reviewers, not second implementers.
- Report deltas (changed / passed / failed / needs attention), not system tours. Stop when acceptance criteria are met.
- Don't add docs, comments or abstractions that aren't needed.

## Repository
Next.js 16 (App Router, Turbopack, TS, Tailwind v4, `src/`) · Mastra agents · Postgres + Redis · Drizzle · Vitest · OpenAI.

**Infra must be up first:** `docker compose up -d` (Postgres 5432, Redis 6379).

| | |
|---|---|
| dev / build / start | `npm run dev` · `npm run build` · `npm start` |
| test | `npm test` (migrates the test DB, then vitest) |
| lint | `npm run lint` |
| migrations | `npm run db:generate` → `npm run db:migrate` · seed: `npm run db:seed` |

Layout: `src/platform/` (db, actions registry, money, errors, audit, effective-dating) · `src/modules/<domain>/` (schema + actions) · `src/app/app/` (the ERP shell) · `src/mastra/` (agents) · `drizzle/` (migrations) · `tests/`.

**Non-obvious rules**
- Never import `getBootstrapDb` or build a raw pool inside `src/modules/**` — it connects as superuser and bypasses RLS. Use `withTenantContext`; ESLint enforces this by import.
- All DB access runs inside a tenant-scoped transaction. RLS is `FORCE`d and fails closed: no context ⇒ zero rows. Cross-company reads require the explicit `crossCompanyReporting` option.
- `pg` returns `numeric` as a **string** — that is deliberate. Never `parseFloat` it; use `Money`.
- Design system is TypeUI **Terracotta, light only**. No dark mode, no theme toggle.

Plans for all 14 slices live in `docs/plan/` (local-only, not committed). Keep this file small; detailed docs belong in `docs/`.
