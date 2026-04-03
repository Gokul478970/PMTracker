import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { importIssuesCsv } from '@/lib/api'
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Download, Loader2 } from 'lucide-react'

interface Props {
  projectKey: string
  open: boolean
  onClose: () => void
}

interface ParsedRow {
  row: number
  summary: string
  type: string
  description: string
  error?: string
}

interface ImportResult {
  total_rows: number
  created: { row: number; key: string; summary: string; type: string }[]
  errors: { row: number; error: string }[]
}

function parseCsvLocally(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []

  // Parse header
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''))
  const summaryIdx = headers.findIndex((h) => h === 'summary')
  const typeIdx = headers.findIndex((h) => h === 'type')
  const descIdx = headers.findIndex((h) => h === 'description')

  if (summaryIdx === -1) return []

  const VALID_TYPES = ['Epic', 'Feature', 'Story', 'Task', 'Bug']
  const rows: ParsedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parse (handles quoted fields with commas)
    const cols: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of lines[i]) {
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cols.push(current.trim())

    const summary = (cols[summaryIdx] || '').replace(/^"|"$/g, '').trim()
    const rawType = typeIdx >= 0 ? (cols[typeIdx] || '').replace(/^"|"$/g, '').trim() : ''
    const description = descIdx >= 0 ? (cols[descIdx] || '').replace(/^"|"$/g, '').trim() : ''

    const parsed: ParsedRow = { row: i + 1, summary, type: rawType || 'Story', description }

    if (!summary) {
      parsed.error = 'Summary is empty'
    } else if (rawType && !VALID_TYPES.some((t) => t.toLowerCase() === rawType.toLowerCase())) {
      parsed.error = `Invalid type "${rawType}"`
    }

    rows.push(parsed)
  }
  return rows
}

const SAMPLE_CSV = `Summary,Type,Description
User login page,Story,Build the login page with email and password fields
Fix cart total calculation,Bug,Cart total does not include tax
Setup CI/CD pipeline,Task,Configure automated build and deploy
Payment gateway integration,Feature,Integrate Stripe for payments`

export function ImportCsvDialog({ projectKey, open, onClose }: Props) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ParsedRow[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [step, setStep] = useState<'pick' | 'preview' | 'done'>('pick')

  const importMut = useMutation({
    mutationFn: () => importIssuesCsv(projectKey, file!),
    onSuccess: (data: ImportResult) => {
      setResult(data)
      setStep('done')
      qc.invalidateQueries({ queryKey: ['projectIssues', projectKey] })
    },
  })

  const handleFile = (f: File | null) => {
    if (!f) return
    setFile(f)
    setResult(null)
    importMut.reset()

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const rows = parseCsvLocally(text)
      setPreview(rows)
      setStep(rows.length > 0 ? 'preview' : 'pick')
    }
    reader.readAsText(f)
  }

  const reset = () => {
    setFile(null)
    setPreview([])
    setResult(null)
    setStep('pick')
    importMut.reset()
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sample_import.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  const validRows = preview.filter((r) => !r.error)
  const errorRows = preview.filter((r) => r.error)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={handleClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-slate-700">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-lg">Import Issues to {projectKey}</h2>
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: File picker */}
          {step === 'pick' && (
            <div className="space-y-5">
              {/* Format guide */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">CSV File Format</h3>
                <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1.5">
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5 shrink-0">1.</span>
                    <span>File must be a <strong>.csv</strong> (comma-separated) file with a header row</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5 shrink-0">2.</span>
                    <span><strong>Summary</strong> column is required — this becomes the issue title</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5 shrink-0">3.</span>
                    <span><strong>Type</strong> column is optional — valid values: Epic, Feature, Story, Task, Bug (defaults to Story)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5 shrink-0">4.</span>
                    <span><strong>Description</strong> column is optional — detailed description of the issue</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5 shrink-0">5.</span>
                    <span>Any other columns in the file will be <strong>ignored</strong> — no errors</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-bold mt-0.5 shrink-0">6.</span>
                    <span>All issues are created with status <strong>To Do</strong> and priority <strong>Medium</strong></span>
                  </li>
                </ul>

                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 mb-2 font-medium">Example:</p>
                  <div className="bg-white dark:bg-slate-800 rounded border border-blue-200 dark:border-blue-700 px-3 py-2 font-mono text-[11px] text-slate-700 dark:text-slate-300 overflow-x-auto">
                    <div className="font-bold">Summary,Type,Description</div>
                    <div>User login page,Story,Build the login form</div>
                    <div>Fix cart total,Bug,Cart total excludes tax</div>
                    <div>Setup CI/CD,Task,Configure automated deploy</div>
                  </div>
                </div>
              </div>

              {/* File upload area */}
              <div
                className="border-2 border-dashed dark:border-slate-600 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation() }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFile(e.dataTransfer.files[0]) }}
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium mb-1">Drop your CSV file here or click to browse</p>
                <p className="text-xs text-muted-foreground">Only .csv files are accepted</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] || null)}
                />
              </div>

              {/* Download sample + help */}
              <div className="flex items-center justify-between">
                <button
                  onClick={downloadSample}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download sample CSV template
                </button>
                <p className="text-[10px] text-muted-foreground">
                  Need help? Contact <a href="mailto:604671@cognizant.com" className="text-primary hover:underline">604671@cognizant.com</a>
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium truncate max-w-64">{file?.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{validRows.length} valid</span>
                  {errorRows.length > 0 && (
                    <span className="text-red-600 dark:text-red-400 font-medium">{errorRows.length} errors</span>
                  )}
                  <span className="text-muted-foreground">{preview.length} total rows</span>
                </div>
                <button onClick={reset} className="text-xs text-primary hover:underline ml-auto">
                  Choose different file
                </button>
              </div>

              {/* Error banner */}
              {errorRows.length > 0 && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      {errorRows.length} row{errorRows.length > 1 ? 's' : ''} will be skipped
                    </span>
                  </div>
                  <ul className="text-xs text-red-600 dark:text-red-400 space-y-0.5 ml-6">
                    {errorRows.slice(0, 5).map((r) => (
                      <li key={r.row}>Row {r.row}: {r.error}</li>
                    ))}
                    {errorRows.length > 5 && (
                      <li className="text-muted-foreground">...and {errorRows.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}

              {/* Preview table */}
              {validRows.length > 0 && (
                <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-700/50 text-xs text-muted-foreground">
                        <th className="text-left px-3 py-2 w-10">#</th>
                        <th className="text-left px-3 py-2 w-20">Type</th>
                        <th className="text-left px-3 py-2">Summary</th>
                        <th className="text-left px-3 py-2 w-48">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 20).map((r) => (
                        <tr key={r.row} className="border-t dark:border-slate-700">
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.row}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex px-2 py-0.5 rounded text-xs bg-slate-100 dark:bg-slate-700 font-medium">
                              {r.type}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-medium truncate max-w-64">{r.summary}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-48">{r.description || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validRows.length > 20 && (
                    <p className="text-xs text-muted-foreground text-center py-2 bg-slate-50 dark:bg-slate-700/50">
                      Showing first 20 of {validRows.length} rows
                    </p>
                  )}
                </div>
              )}

              {validRows.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">No valid rows found</p>
                  <p className="text-xs mt-1">Please fix the errors above and try again</p>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Results */}
          {step === 'done' && result && (
            <div className="space-y-4">
              {/* Success summary */}
              <div className={`rounded-lg px-5 py-4 ${
                result.errors.length === 0
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle2 className={`w-6 h-6 ${result.errors.length === 0 ? 'text-emerald-500' : 'text-amber-500'}`} />
                  <div>
                    <p className="font-semibold text-sm">
                      {result.created.length} issue{result.created.length !== 1 ? 's' : ''} created successfully
                    </p>
                    {result.errors.length > 0 && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {result.errors.length} row{result.errors.length !== 1 ? 's' : ''} failed
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Created issues */}
              {result.created.length > 0 && (
                <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
                  <p className="text-xs font-semibold text-muted-foreground px-3 py-2 bg-slate-50 dark:bg-slate-700/50 uppercase tracking-wider">
                    Created Issues
                  </p>
                  <div className="max-h-48 overflow-y-auto">
                    {result.created.map((c) => (
                      <div key={c.key} className="flex items-center gap-2 px-3 py-2 border-t dark:border-slate-700 text-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        <span className="font-medium text-primary w-20 shrink-0">{c.key}</span>
                        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-700 font-medium shrink-0">
                          {c.type}
                        </span>
                        <span className="truncate">{c.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="border border-red-200 dark:border-red-800 rounded-lg overflow-hidden">
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400 px-3 py-2 bg-red-50 dark:bg-red-900/20 uppercase tracking-wider">
                    Failed Rows
                  </p>
                  <div className="max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 border-t border-red-100 dark:border-red-900 text-sm">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span className="text-xs text-muted-foreground w-14 shrink-0">Row {e.row}</span>
                        <span className="text-xs text-red-600 dark:text-red-400">{e.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t dark:border-slate-700 px-5 py-3 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            Need help? Contact <a href="mailto:604671@cognizant.com" className="text-primary hover:underline">604671@cognizant.com</a>
          </p>
          <div className="flex gap-2">
            {step === 'done' ? (
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 rounded-md text-sm font-medium border dark:border-slate-700 hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                {step === 'preview' && validRows.length > 0 && (
                  <button
                    onClick={() => importMut.mutate()}
                    disabled={importMut.isPending}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {importMut.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Import {validRows.length} Issue{validRows.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
          {importMut.isError && (
            <p className="text-xs text-destructive">{(importMut.error as Error).message}</p>
          )}
        </div>
      </div>
    </div>
  )
}
