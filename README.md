<div align="center">

# Cayamanan

**An AI-first HRIS and payroll platform for Philippine businesses — free to run.**

*Because Filipinos deserve better.*

Built by [iBAS Software FR](https://github.com/ibassoftware)

</div>

---

## What this is

Payroll in the Philippines is unforgiving. Semi-monthly cutoffs, SSS with MPF and WISP, PhilHealth,
Pag-IBIG, BIR withholding, night differential, holiday premiums, 13th month, final pay — each with its own
rules, each versioned by law, each wrong in a way somebody notices on payday.

Most small and mid-sized Filipino businesses handle this in spreadsheets, or pay for software written for
somewhere else and bent into shape. Cayamanan is built for the Philippine rules first, and given away.

It is **AI-first** in a specific sense. Missy, the built-in assistant, is not a chat widget bolted to the
side. She reaches the same server-side actions the screens do, with the same permission checks and the same
audit trail — so "add Maria's training record" and clicking through the form are the same operation.

One boundary is absolute, and it is worth stating up front:

> **Deterministic software is authoritative for every payroll amount. AI explains, flags and assists.
> It never computes the amount.**

An LLM does not get to decide what lands in someone's payslip.

## Status

**Usable today for employee records.** If you keep your 201 files in spreadsheets, you can move them into
Cayamanan now — import them, keep them, and let Missy work on them. Recruitment is next. The table below
is the honest state of everything else, so you can judge for yourself what to adopt and when.

| Area | State |
|---|---|
| Platform, multi-tenancy, RLS, audit | Done |
| Identity, auth, roles | Done |
| Missy substrate — tools, confirmations, screen context | Done |
| Organization: departments, positions, locations, cost centers | Done |
| Employee 201 file — personal, government IDs, family, background, onboarding, documents | Done |
| Bulk import — CSV/TSV/xlsx with AI-assisted column mapping | Done |
| Recruitment & ATS | Next |
| Employment, contracts & compensation | Not started |
| Payroll engine | Not started |

## Roadmap

**Milestone 1 — People of record** *(largely complete)*
Organization structure, the full 201 file, employee documents, bulk import from CSV and Excel, and Missy
able to operate on all of it.

**Milestone 2 — Recruitment & ATS**
Job requisitions and approvals, a careers page, the applicant pipeline, résumé parsing and candidate
search, interview scheduling and scorecards, and offer management — ending in a one-click hand-off from
accepted offer to 201 file with nothing retyped. Hiring is where a company's HR data is created, so this
is where the record should start.

**Milestone 3 — Employment & compensation**
Effective-dated contracts, pay basis and rates, allowances and recurring deductions, statutory enrolment,
bank details, termination. Nothing is ever overwritten; a salary change closes one row and opens another.
This is also the prerequisite payroll cannot start without.

**Milestone 4 — Payroll**
The core. Holiday and schedule calendars, attendance import, versioned statutory tables (SSS, PhilHealth,
Pag-IBIG, BIR), the deterministic calculation engine, the run lifecycle from draft to finalized, payslips,
13th month, final pay, and statutory reports. A finalized run must recompute to the identical centavo
forever — that is a correctness requirement, not an aspiration.

**Milestone 5 — Beyond**
Leave management, benefits administration, performance, and employee self-service.

## Running it

Requires Node 22+, Docker, and an OpenAI API key.

```bash
docker compose up -d          # Postgres 5432, Redis 6379
npm install
npm run db:migrate
npm run db:seed               # demo tenant, company and logins
npm run dev
```

Then open http://localhost:3000. The seed prints its demo credentials.

| | |
|---|---|
| Test | `npm test` |
| Lint | `npm run lint` |
| Build | `npm run build` |
| New migration | `npm run db:generate` → `npm run db:migrate` |

The OpenAI key can come from `OPENAI_API_KEY`, or an admin can set it in **System settings**, where it is
encrypted at rest and never displayed again. Setting one there requires `SETTINGS_ENCRYPTION_KEY`
(`openssl rand -base64 32`).

## How it is built

Next.js 16 (App Router, TypeScript, Tailwind v4) · Mastra agents on OpenAI · Postgres with Drizzle ·
Redis · Vitest.

A few conventions that are load-bearing rather than stylistic:

- **Every read and every mutation is a registered action.** The UI and Missy call the same one, so a tool
  can never reach past a permission check. Exposing an action to Missy is a flag on the action, not chat
  plumbing.
- **Money is never a float.** Exact decimals throughout, rounding always explicit and named.
- **Tenancy is enforced in the database.** Postgres row-level security is `FORCE`d and fails closed — no
  tenant context means zero rows, not every row.
- **High-risk actions are confirmed and audited.** Salary, bank details, termination, bulk writes: Missy
  proposes, a human approves against a one-time token bound to the exact input.

## Contributing

Early days, and the architecture is still moving. Issues and discussion are welcome; please open an issue
before a large pull request so we can agree on the shape first.

## License

[**FSL-1.1-ALv2**](LICENSE.md) — the Functional Source License, a [Fair Source](https://fair.io) license.

In plain terms: run it, read it, modify it, deploy it inside your business, use it in non-commercial
research or teaching, and build professional services on it for other licensees. The one thing you cannot
do is offer it commercially as a substitute for Cayamanan itself.

**Each version converts to Apache 2.0 two years after its release**, with no restrictions at all from that
point. Fair Source is not Open Source today; every version becomes Open Source on a clock.

For a Filipino business wanting to run its own HR and payroll, this is free with no asterisk. The
non-compete exists so the project can be given away without someone else reselling it out from under the
people maintaining it.

## Credits

Built and maintained by **iBAS Software FR**.

Cayamanan — *kayamanan*, wealth — because a workforce is one.
