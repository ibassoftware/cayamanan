# Employee import samples

Fixtures for exercising the employee import path by hand. Regenerate with:

```bash
node scripts/make-import-samples.mjs
```

| File | What it is for |
|---|---|
| `employees-clean.csv` / `.xlsx` | Canonical headers, five valid employees. Should preview as 5 to create, 0 errors, and commit cleanly. |
| `employees-messy.csv` / `.xlsx` | Non-canonical headers and one distinct defect per row. Should preview with errors and leave the commit button disabled. |

## What each defect in `employees-messy` is testing

The headers are deliberately what a real HR spreadsheet looks like — `Emp No.`, `Given Name`,
`Surname`, `Date Hired`, `Biometrics ID` — so the column-mapping step has to do real work rather than
matching names that already happen to be right.

| Row | Defect | What it should prove |
|---|---|---|
| 2 | (none) | A valid row still resolves while others fail. |
| 3 | Missing first name | A required field surfaces as a row-level error, not a file-level rejection. |
| 4 | `15/07/2025` | A non-ISO date is caught rather than silently misread as 7 March. |
| 5 | `EMP-3001` repeated | A duplicate employee number **within the file** is rejected on the later row. |
| 6 | Blank hire date, `not-an-email`, and a biometric id colliding with row 3's | Several errors on one row are all reported; the duplicate biometric id must be refused by the partial unique index, since two people sharing a device id would mis-attribute attendance and therefore pay. |

Because the import is **all-or-nothing**, a preview of this file must write nothing at all — the point
is that the commit button stays disabled until every row is valid, not that four rows sneak through.

## Current limitation

The import screen accepts **CSV and TSV only** today. The `.xlsx` files are here ready for the import
wizard (`docs/plan/04c-first-public-build.md` §I), which adds spreadsheet parsing via `read-excel-file`
along with the AI-assisted column mapping the messy file is designed to stress.

One thing the wizard has to handle: `read-excel-file/node` returns `[{ sheet, data }]` — an array of
sheets — when no sheet is named, not a bare array of rows. A workbook with several tabs needs a sheet
chosen rather than assuming the first is the right one.
