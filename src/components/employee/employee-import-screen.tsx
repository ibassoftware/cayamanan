"use client"

// Employee import wizard — five steps (choose file / pick sheet / map columns / preview /
// commit), the last two folded into one visible "step" the same way this screen already
// grouped preview+confirm before this became a wizard. No upload endpoint exists or
// should exist here (task packet): a CSV/TSV file is read as text, an .xlsx workbook is
// parsed client-side only for sheet names/header/sample rows (via `read-excel-file`'s
// browser build) — the *authoritative* parse always happens server-side, in
// employee.importPreview/employee.importCommit, which re-resolve the same raw
// text/base64 from scratch. Never logs parsed rows or mapped values — csvText/xlsx
// content/preview rows can carry PII (birth date, personal email, mobile) and stay out
// of the console entirely.
import { Suspense, useEffect, useId, useRef, useState, type ChangeEvent } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertTriangle, Download, Sparkles } from "lucide-react"
import readXlsxFile from "read-excel-file/browser"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ConfirmDialog } from "@/components/data/confirm-dialog"
import { ErrorPanel, LoadingPanel, NoPermissionPanel } from "@/components/data/state-panels"
import {
  IMPORT_TEMPLATE_COLUMNS,
  applyAiSuggestions,
  buildTemplateCsv,
  canCommitImport,
  canProceedFromMapping,
  checkCsvSize,
  checkXlsxSize,
  collectValueColumns,
  columnLabel,
  duplicateMappedFields,
  formatCellValue,
  formatSpreadsheetCell,
  initialMappingFromHeader,
  isImportTemplateField,
  missingRequiredFields,
  normalizeSpreadsheetRow,
  operationBadgeVariant,
  operationLabel,
  parseCsvPreview,
  summaryText,
  wizardStepLabel,
  wizardSteps,
  type ImportOperation,
  type MappingRow,
  type SuggestedMapping,
  type WizardStepId,
} from "@/components/employee/import-state"
import { callAction } from "@/lib/actions-client"
import { isSessionExpired, SESSION_EXPIRED_LOGIN_PATH } from "@/lib/session-expired"
import type { ActionResult } from "@/platform/errors"

const UNMAPPED_VALUE = "__unmapped__"

interface PreviewRow {
  rowNumber: number
  employeeNo: string | null
  operation: ImportOperation
  values: Record<string, unknown>
  errors: string[]
}

interface PreviewOutput {
  rows: PreviewRow[]
  summary: { toCreate: number; toUpdate: number; withErrors: number }
}

interface CommitOutput {
  created: number
  updated: number
  employeeNumbers: string[]
}

type ImportSource =
  | { kind: "csv"; csv: string }
  | { kind: "xlsx"; contentBase64: string; sheet?: string }

interface XlsxSheetData {
  name: string
  header: string[]
  rows: string[][]
}

/** Reads a `File` as base64, without ever materializing the whole binary as a JS string
 * one character at a time — `readAsDataURL` already does the encoding natively, this
 * just strips the `data:...;base64,` prefix. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      const commaIndex = result.indexOf(",")
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1))
    }
    reader.onerror = () => reject(new Error("Could not read file"))
    reader.readAsDataURL(file)
  })
}

/**
 * Resolves `?attachmentId=` (a file already staged in a chat attachment) into CSV text,
 * the same way a pasted/typed file would be treated — per the task packet, an attachment
 * source is always text here, never routed through the xlsx path. Split out from the main
 * screen because `useSearchParams` requires a `Suspense` boundary (see
 * `components/me/security-screen.tsx`'s identical pattern).
 */
function AttachmentLoader({
  active,
  onStart,
  onResolved,
  onError,
}: {
  active: boolean
  onStart: () => void
  onResolved: (content: string, filename: string) => void
  onError: (message: string) => void
}) {
  const searchParams = useSearchParams()
  const attachmentId = searchParams.get("attachmentId")
  // A guard, not real UI state — a ref (not useState) so setting it is never itself a
  // synchronous setState-in-effect the fetch-once check has to fire alongside.
  const attemptedRef = useRef(false)

  useEffect(() => {
    if (!attachmentId || attemptedRef.current || !active) return
    attemptedRef.current = true
    onStart()
    void (async () => {
      const response = await callAction<{ filename: string; mimeType: string; content: string }>(
        "ai.getAttachment",
        { attachmentId },
      )
      if (!response.ok) {
        // Generic on purpose (ai.getAttachment collapses "not yours" and "doesn't exist"
        // into one NOT_FOUND) — the user is told to re-upload, never given a reason to
        // distinguish the two.
        onError("That attachment isn't available anymore. Please upload or paste the file again.")
        return
      }
      onResolved(response.data.content, response.data.filename)
    })()
  }, [attachmentId, active, onStart, onResolved, onError])

  return null
}

export function EmployeeImportScreen() {
  const router = useRouter()
  const fileInputId = useId()
  const csvTextId = useId()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<WizardStepId>("file")

  // Step 1: choose file
  const [sourceKind, setSourceKind] = useState<"csv" | "xlsx" | null>(null)
  const [csvText, setCsvText] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [xlsxFileName, setXlsxFileName] = useState<string | null>(null)
  const [xlsxBase64, setXlsxBase64] = useState<string | null>(null)
  const [xlsxSheets, setXlsxSheets] = useState<XlsxSheetData[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [parsingXlsx, setParsingXlsx] = useState(false)
  const [attachmentLoading, setAttachmentLoading] = useState(false)
  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  // Step 2: pick sheet
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null)

  // Step 3: map columns
  const [header, setHeader] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<MappingRow[]>([])
  const [matchingWithAi, setMatchingWithAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // Step 4/5: preview + commit
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<ActionResult<PreviewOutput> | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [commitResult, setCommitResult] = useState<CommitOutput | null>(null)

  const hasMultipleSheets = xlsxSheets.length > 1
  const steps = wizardSteps(hasMultipleSheets)
  const stepNumber = (id: WizardStepId) => steps.indexOf(id) + 1
  const chosenFileName = fileName ?? xlsxFileName

  function resetAll() {
    setStep("file")
    setSourceKind(null)
    setCsvText("")
    setFileName(null)
    setXlsxFileName(null)
    setXlsxBase64(null)
    setXlsxSheets([])
    setFileError(null)
    setParsingXlsx(false)
    setAttachmentError(null)
    setSelectedSheet(null)
    setHeader([])
    setSampleRows([])
    setMapping([])
    setAiError(null)
    setPreview(null)
    setCommitResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function beginMapping(nextHeader: string[], nextSampleRows: string[][]) {
    setHeader(nextHeader)
    setSampleRows(nextSampleRows)
    setMapping(initialMappingFromHeader(nextHeader))
    setAiError(null)
    setPreview(null)
    setCommitResult(null)
    setStep("mapping")
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setAttachmentError(null)
    const isXlsx = /\.xlsx$/i.test(file.name)

    if (isXlsx) {
      const sizeCheck = checkXlsxSize(file.size)
      if (!sizeCheck.ok) {
        setFileError(sizeCheck.message)
        if (fileInputRef.current) fileInputRef.current.value = ""
        return
      }
      setFileError(null)
      setParsingXlsx(true)
      try {
        const [workbook, base64] = await Promise.all([readXlsxFile(file), fileToBase64(file)])
        const sheets: XlsxSheetData[] = workbook
          .map(({ sheet, data }) => {
            const [rawHeader, ...rawRows] = data
            const parsedHeader = (rawHeader ?? []).map(formatSpreadsheetCell)
            const rows = rawRows.map((row) =>
              normalizeSpreadsheetRow(row.map(formatSpreadsheetCell), parsedHeader.length),
            )
            return { name: sheet, header: parsedHeader, rows }
          })
          .filter((sheet) => sheet.header.length > 0)

        if (sheets.length === 0) {
          setFileError("This workbook has no sheets with a header row.")
          setParsingXlsx(false)
          return
        }

        setSourceKind("xlsx")
        setXlsxFileName(file.name)
        setXlsxBase64(base64)
        setXlsxSheets(sheets)
        setCsvText("")
        setFileName(null)
      } catch {
        setFileError("Couldn't read that .xlsx file. Try again, or export it as CSV instead.")
      }
      setParsingXlsx(false)
      return
    }

    // csv/tsv/txt path
    const sizeCheck = checkCsvSize(file.size, "bytes")
    if (!sizeCheck.ok) {
      setFileError(sizeCheck.message)
      setFileName(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      setSourceKind("csv")
      setCsvText(text)
      setFileName(file.name)
      setXlsxFileName(null)
      setXlsxBase64(null)
      setXlsxSheets([])
      setFileError(null)
    }
    reader.onerror = () => {
      setFileError("Couldn't read that file. Try again, or paste the CSV text instead.")
    }
    reader.readAsText(file)
  }

  function handlePasteChange(value: string) {
    setSourceKind("csv")
    setCsvText(value)
    setFileName(null)
    setXlsxFileName(null)
    setXlsxBase64(null)
    setXlsxSheets([])
    const sizeCheck = checkCsvSize(value.length)
    setFileError(sizeCheck.ok ? null : sizeCheck.message)
  }

  function handleAttachmentResolved(content: string, filename: string) {
    setAttachmentLoading(false)
    // Never clobber a file the user already picked/pasted themselves in the meantime.
    if (sourceKind !== null) return
    setSourceKind("csv")
    setCsvText(content)
    setFileName(filename)
  }

  function handleContinueFromFile() {
    if (sourceKind === "csv") {
      const sizeCheck = checkCsvSize(csvText.length)
      if (!sizeCheck.ok) {
        setFileError(sizeCheck.message)
        return
      }
      const parsed = parseCsvPreview(csvText)
      if (parsed.header.length === 0) {
        setFileError("Couldn't find a header row in this file.")
        return
      }
      setFileError(null)
      beginMapping(parsed.header, parsed.sampleRows)
      return
    }

    if (sourceKind === "xlsx") {
      if (hasMultipleSheets) {
        setStep("sheet")
        return
      }
      const sheet = xlsxSheets[0]
      if (!sheet) {
        setFileError("This workbook has no sheets.")
        return
      }
      setSelectedSheet(sheet.name)
      beginMapping(sheet.header, sheet.rows.slice(0, 3))
    }
  }

  function handleContinueFromSheet() {
    const sheet = xlsxSheets.find((s) => s.name === selectedSheet) ?? xlsxSheets[0]
    if (!sheet) return
    setSelectedSheet(sheet.name)
    beginMapping(sheet.header, sheet.rows.slice(0, 3))
  }

  function handleFieldChange(index: number, value: string) {
    setMapping((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row
        if (value === UNMAPPED_VALUE) return { ...row, field: null, confidence: null }
        return { ...row, field: isImportTemplateField(value) ? value : null, confidence: null }
      }),
    )
  }

  async function handleMatchWithAi() {
    setMatchingWithAi(true)
    setAiError(null)
    const response = await callAction<{ mappings: SuggestedMapping[] }>("employee.suggestColumnMapping", {
      header,
      sampleRows,
    })
    setMatchingWithAi(false)
    if (isSessionExpired(response)) {
      router.push(SESSION_EXPIRED_LOGIN_PATH)
      return
    }
    if (!response.ok) {
      setAiError(response.error.message)
      return
    }
    setMapping((prev) => applyAiSuggestions(prev, response.data.mappings))
  }

  function buildSource(): ImportSource {
    if (sourceKind === "xlsx" && xlsxBase64) {
      return { kind: "xlsx", contentBase64: xlsxBase64, sheet: selectedSheet ?? undefined }
    }
    return { kind: "csv", csv: csvText }
  }

  async function handlePreview() {
    setPreviewing(true)
    setPreview(null)
    setCommitResult(null)
    const response = await callAction<PreviewOutput>("employee.importPreview", {
      source: buildSource(),
      mapping: mapping.map(({ column, field }) => ({ column, field })),
    })
    setPreviewing(false)
    if (isSessionExpired(response)) {
      router.push(SESSION_EXPIRED_LOGIN_PATH)
      return
    }
    setPreview(response)
  }

  function handleContinueFromMapping() {
    if (!canProceedFromMapping(mapping)) return
    setStep("preview")
    void handlePreview()
  }

  function handleDownloadTemplate() {
    const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "employee-import-template.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const missing = missingRequiredFields(mapping)
  const duplicates = duplicateMappedFields(mapping)

  const summary = preview?.ok ? preview.data.summary : null
  const rows = preview?.ok ? preview.data.rows : []
  // `employeeNo` already has its own fixed column to its left — drop it from the dynamic
  // value columns so it isn't shown twice.
  const valueColumns = collectValueColumns(rows).filter((column) => column !== "employeeNo")
  const toCommit = summary ? summary.toCreate + summary.toUpdate : 0

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={null}>
        <AttachmentLoader
          active={step === "file" && sourceKind === null}
          onStart={() => setAttachmentLoading(true)}
          onResolved={handleAttachmentResolved}
          onError={(message) => setAttachmentError(message)}
        />
      </Suspense>

      <div className="flex items-center justify-between gap-4">
        <h1 className="tc-app-title">Import employees</h1>
        <Button variant="outline" onClick={handleDownloadTemplate}>
          <Download aria-hidden="true" />
          Download template
        </Button>
      </div>

      {commitResult ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Import complete</CardTitle>
            <CardDescription>
              {commitResult.created} employee{commitResult.created === 1 ? "" : "s"} created,{" "}
              {commitResult.updated} updated.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {commitResult.employeeNumbers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {commitResult.employeeNumbers.map((no) => (
                  <Badge key={no} variant="brand">
                    {no}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Button nativeButton={false} render={<Link href="/app/employees" />}>
                Go to employee list
              </Button>
              <Button variant="outline" onClick={resetAll}>
                Import another file
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <nav aria-label="Import steps" className="flex flex-wrap items-center gap-2">
            {steps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <Badge variant={s === step ? "brand" : i < stepNumber(step) - 1 ? "success" : "outline"}>
                  {i + 1}. {wizardStepLabel(s)}
                </Badge>
                {i < steps.length - 1 && (
                  <span aria-hidden="true" className="text-body-subtle">
                    →
                  </span>
                )}
              </div>
            ))}
          </nav>

          {step === "file" && (
            <Card>
              <CardHeader>
                <CardTitle>{stepNumber("file")}. Choose a file or paste CSV/TSV</CardTitle>
                <CardDescription>
                  The first row must be a header naming the columns. .csv, .tsv and .xlsx files
                  are supported.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {attachmentLoading && (
                  <p className="text-sm text-body-subtle">Loading the attached file…</p>
                )}
                {attachmentError && (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" />
                    <AlertDescription>{attachmentError}</AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col gap-2">
                  <label htmlFor={fileInputId} className="text-sm font-medium text-heading">
                    File
                  </label>
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    accept=".csv,.tsv,.txt,.xlsx"
                    onChange={handleFileChange}
                    className="block w-full rounded-lg border border-input bg-transparent text-sm text-heading file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-heading"
                  />
                  {parsingXlsx && <p className="text-sm text-body-subtle">Reading workbook…</p>}
                  {chosenFileName && !parsingXlsx && (
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-body-subtle">
                        Loaded &ldquo;{chosenFileName}&rdquo;.
                      </p>
                      <Button variant="ghost" size="sm" onClick={resetAll}>
                        Clear
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <label htmlFor={csvTextId} className="text-sm font-medium text-heading">
                    Or paste CSV/TSV text
                  </label>
                  <Textarea
                    id={csvTextId}
                    value={sourceKind === "xlsx" ? "" : csvText}
                    onChange={(e) => handlePasteChange(e.target.value)}
                    placeholder={"employeeNo,firstName,lastName,hireDate\nEMP-2001,Maria,Santos,2026-01-15"}
                    className="min-h-40 font-mono text-sm"
                    disabled={sourceKind === "xlsx"}
                  />
                </div>

                {fileError && (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" />
                    <AlertDescription>{fileError}</AlertDescription>
                  </Alert>
                )}

                <div>
                  <Button
                    onClick={handleContinueFromFile}
                    disabled={
                      (sourceKind === "csv" && csvText.trim().length === 0) ||
                      (sourceKind === "xlsx" && xlsxSheets.length === 0) ||
                      sourceKind === null ||
                      parsingXlsx ||
                      attachmentLoading ||
                      Boolean(fileError)
                    }
                  >
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "sheet" && (
            <Card>
              <CardHeader>
                <CardTitle>{stepNumber("sheet")}. Pick a sheet</CardTitle>
                <CardDescription>
                  &ldquo;{xlsxFileName}&rdquo; has {xlsxSheets.length} sheets — choose the one with
                  employee data.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Select value={selectedSheet ?? xlsxSheets[0]?.name} onValueChange={(v) => v && setSelectedSheet(v)}>
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue placeholder="Choose a sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {xlsxSheets.map((sheet) => (
                      <SelectItem key={sheet.name} value={sheet.name}>
                        {sheet.name} ({sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep("file")}>
                    Back
                  </Button>
                  <Button onClick={handleContinueFromSheet}>Continue</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "mapping" && (
            <Card>
              <CardHeader>
                <CardTitle>{stepNumber("mapping")}. Map columns</CardTitle>
                <CardDescription>
                  Match each column to an employee field. Employee number is required — everything
                  else is optional.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-xl text-sm text-body-subtle">
                    &ldquo;Match with AI&rdquo; sends the header and up to 3 sample rows shown below
                    to fill in any columns still unmapped.
                  </p>
                  <Button variant="outline" onClick={handleMatchWithAi} disabled={matchingWithAi}>
                    <Sparkles aria-hidden="true" />
                    {matchingWithAi ? "Matching…" : "Match with AI"}
                  </Button>
                </div>

                {aiError && (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" />
                    <AlertDescription>{aiError}</AlertDescription>
                  </Alert>
                )}

                <div className="min-w-0 overflow-x-auto rounded-lg ring-1 ring-foreground/10 contain-layout">
                  <table className="w-full min-w-max border-collapse text-sm">
                    <thead>
                      <tr className="border-border border-b bg-muted text-left">
                        <th scope="col" className="px-3 py-2 font-medium text-heading">
                          Column
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium text-heading">
                          Sample value
                        </th>
                        <th scope="col" className="px-3 py-2 font-medium text-heading">
                          Employee field
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {mapping.map((row, index) => (
                        <tr key={`${row.column}-${index}`} className="border-border border-b align-top last:border-b-0">
                          <td className="px-3 py-2 whitespace-nowrap text-heading">{row.column}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-body-subtle">
                            {formatCellValue(sampleRows[0]?.[index])}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1">
                              <Select
                                value={row.field ?? UNMAPPED_VALUE}
                                onValueChange={(v) => v && handleFieldChange(index, v)}
                              >
                                <SelectTrigger className="w-full min-w-52">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={UNMAPPED_VALUE}>— Not mapped —</SelectItem>
                                  {IMPORT_TEMPLATE_COLUMNS.map((field) => (
                                    <SelectItem key={field} value={field}>
                                      {columnLabel(field)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {row.confidence === "low" && <Badge variant="warning">Low confidence</Badge>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {missing.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" />
                    <AlertDescription>
                      Map a column to {missing.map(columnLabel).join(", ")} before continuing.
                    </AlertDescription>
                  </Alert>
                )}
                {duplicates.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle aria-hidden="true" />
                    <AlertDescription>
                      More than one column maps to {duplicates.map(columnLabel).join(", ")} — map each
                      field to only one column.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(hasMultipleSheets ? "sheet" : "file")}>
                    Back
                  </Button>
                  <Button onClick={handleContinueFromMapping} disabled={!canProceedFromMapping(mapping)}>
                    Continue to preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === "preview" && (
            <>
              <div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("mapping")
                    setPreview(null)
                  }}
                >
                  Back to column mapping
                </Button>
              </div>

              {previewing && <LoadingPanel className="max-w-none" label="Building preview…" />}

              {!previewing && preview && !preview.ok && preview.error.code === "FORBIDDEN" && (
                <NoPermissionPanel
                  className="max-w-none"
                  description="Importing employees is restricted to Admins and HR/Payroll."
                />
              )}

              {!previewing && preview && !preview.ok && preview.error.code !== "FORBIDDEN" && (
                <ErrorPanel
                  className="max-w-none"
                  title="Couldn't preview this file"
                  message={preview.error.message}
                  onRetry={handlePreview}
                />
              )}

              {!previewing && preview?.ok && (
                <Card>
                  <CardHeader>
                    <CardTitle>{stepNumber("preview")}. Preview</CardTitle>
                    <CardDescription>{summaryText(preview.data.summary)}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {preview.data.rows.length === 0 ? (
                      <p className="text-sm text-body-subtle">No data rows found.</p>
                    ) : (
                      <div className="min-w-0 overflow-x-auto rounded-lg ring-1 ring-foreground/10 contain-layout">
                        <table className="w-full min-w-max border-collapse text-sm">
                          <thead>
                            <tr className="border-border border-b bg-muted text-left">
                              <th scope="col" className="px-3 py-2 font-medium text-heading">
                                Row
                              </th>
                              <th scope="col" className="px-3 py-2 font-medium text-heading">
                                Employee no.
                              </th>
                              <th scope="col" className="px-3 py-2 font-medium text-heading">
                                Status
                              </th>
                              {valueColumns.map((column) => (
                                <th key={column} scope="col" className="px-3 py-2 font-medium text-heading whitespace-nowrap">
                                  {columnLabel(column)}
                                </th>
                              ))}
                              <th scope="col" className="px-3 py-2 font-medium text-heading">
                                Errors
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.data.rows.map((row) => (
                              <tr key={row.rowNumber} className="border-border border-b align-top last:border-b-0">
                                <td className="px-3 py-2 text-body-subtle">{row.rowNumber}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-heading">{row.employeeNo ?? "—"}</td>
                                <td className="px-3 py-2">
                                  <Badge variant={operationBadgeVariant(row.operation)}>{operationLabel(row.operation)}</Badge>
                                </td>
                                {valueColumns.map((column) => (
                                  <td key={column} className="px-3 py-2 whitespace-nowrap text-body-subtle">
                                    {formatCellValue(row.values[column])}
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-fg-danger">
                                  {row.errors.length > 0 ? (
                                    <ul className="list-disc pl-4">
                                      {row.errors.map((message) => (
                                        // Row errors have no stable id of their own; the message
                                        // text itself is the natural key here (never reorders
                                        // independent of its row).
                                        <li key={message}>{message}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <span className="text-body-subtle">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {!previewing && preview?.ok && (
                <Card>
                  <CardHeader>
                    <CardTitle>{stepNumber("preview") + 1}. Confirm</CardTitle>
                    <CardDescription>
                      This import is all-or-nothing: nothing is written until every row is valid.
                      {summary && summary.withErrors > 0
                        ? " Fix every row with an error above, then re-map or re-check the file, before you can import."
                        : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setConfirmOpen(true)} disabled={!canCommitImport(summary, false)}>
                      Import {toCommit} employee{toCommit === 1 ? "" : "s"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      <ConfirmDialog<CommitOutput>
        open={confirmOpen}
        title="Import employees from this file?"
        description={
          summary
            ? `This will create ${summary.toCreate} and update ${summary.toUpdate} employee record(s). Nothing is written until every row succeeds — if anything fails, none of it is applied.`
            : ""
        }
        confirmLabel="Import"
        confirmVariant="default"
        onOpenChange={setConfirmOpen}
        onConfirm={() =>
          callAction<CommitOutput>("employee.importCommit", {
            source: buildSource(),
            mapping: mapping.map(({ column, field }) => ({ column, field })),
          })
        }
        onSuccess={(data) => {
          setConfirmOpen(false)
          setCommitResult(data)
        }}
      />
    </div>
  )
}
