import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getScopes, createScope, updateScope, deleteScope } from '@/lib/api'
import { Loader2, Plus, Trash2, Save, FileText } from 'lucide-react'

export function ProjectScope() {
  const { projectKey } = useParams<{ projectKey: string }>()
  const qc = useQueryClient()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const { data: scopes, isLoading } = useQuery({
    queryKey: ['scopes', projectKey],
    queryFn: () => getScopes(projectKey!),
    enabled: !!projectKey,
  })

  const createMut = useMutation({
    mutationFn: () => {
      const num = (scopes?.length || 0) + 1
      return createScope(projectKey!, `MVP ${num}`)
    },
    onSuccess: (newScope) => {
      qc.invalidateQueries({ queryKey: ['scopes', projectKey] })
      setActiveId(newScope.id)
    },
  })

  const deleteMut = useMutation({
    mutationFn: (scopeId: string) => deleteScope(projectKey!, scopeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scopes', projectKey] })
      setActiveId(null)
    },
  })

  // Auto-save with debounce
  const handleContentChange = (scopeId: string, content: string) => {
    setDrafts((d) => ({ ...d, [scopeId]: content }))

    if (saveTimers.current[scopeId]) {
      clearTimeout(saveTimers.current[scopeId])
    }
    saveTimers.current[scopeId] = setTimeout(async () => {
      setSaving((s) => ({ ...s, [scopeId]: true }))
      try {
        await updateScope(projectKey!, scopeId, { content })
        qc.invalidateQueries({ queryKey: ['scopes', projectKey] })
      } finally {
        setSaving((s) => ({ ...s, [scopeId]: false }))
      }
    }, 1000)
  }

  const handleNameChange = async (scopeId: string, name: string) => {
    await updateScope(projectKey!, scopeId, { name })
    qc.invalidateQueries({ queryKey: ['scopes', projectKey] })
  }

  // Set active to first scope if none selected
  useEffect(() => {
    if (!activeId && scopes && scopes.length > 0) {
      setActiveId(scopes[0].id)
    }
  }, [scopes, activeId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const activeScope = (scopes || []).find((s: any) => s.id === activeId)
  const currentContent = activeId && drafts[activeId] !== undefined
    ? drafts[activeId]
    : activeScope?.content || ''

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link to={`/projects/${projectKey}`} className="text-sm text-muted-foreground hover:text-foreground">
              {projectKey}
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <span className="text-sm font-medium">Scope</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Project Scope</h1>
        </div>
        <button
          onClick={() => createMut.mutate()}
          disabled={createMut.isPending}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          {createMut.isPending ? 'Creating...' : 'Add MVP'}
        </button>
      </div>

      {(!scopes || scopes.length === 0) ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">No scope entries yet. Create your first MVP to start defining requirements.</p>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create MVP 1
          </button>
        </div>
      ) : (
        <div className="flex gap-4 h-[calc(100vh-180px)]">
          {/* Sidebar - MVP list */}
          <div className="w-56 shrink-0 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 overflow-y-auto">
            <div className="p-2 space-y-1">
              {scopes.map((scope: any) => (
                <button
                  key={scope.id}
                  onClick={() => setActiveId(scope.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm text-left transition-colors ${
                    activeId === scope.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="truncate">{scope.name}</span>
                  </div>
                  {saving[scope.id] && (
                    <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Main content - editor */}
          {activeScope ? (
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 flex flex-col overflow-hidden">
              {/* Scope header */}
              <div className="flex items-center justify-between px-5 py-3 border-b dark:border-slate-700">
                <input
                  value={activeScope.name}
                  onChange={(e) => handleNameChange(activeScope.id, e.target.value)}
                  className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 w-full dark:text-slate-300"
                  placeholder="MVP Name"
                />
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {saving[activeScope.id] && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                    </span>
                  )}
                  {!saving[activeScope.id] && drafts[activeScope.id] === undefined && (
                    <span className="text-xs text-green-600">Saved</span>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${activeScope.name}"?`)) {
                        deleteMut.mutate(activeScope.id)
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                    title="Delete this MVP"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Text area */}
              <textarea
                value={currentContent}
                onChange={(e) => handleContentChange(activeScope.id, e.target.value)}
                className="flex-1 w-full p-5 text-sm leading-relaxed resize-none focus:outline-none font-mono dark:bg-slate-800 dark:text-slate-300"
                placeholder={`Enter requirements for ${activeScope.name} here...\n\nExample:\n- As a user, I want to...\n- The system should...\n- Acceptance criteria:\n  1. ...\n  2. ...`}
              />

              {/* Footer */}
              <div className="px-5 py-2 border-t dark:border-slate-700 text-xs text-muted-foreground flex justify-between">
                <span>Last updated: {activeScope.updated ? new Date(activeScope.updated).toLocaleString() : 'Never'}</span>
                <span>{currentContent.length} characters</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 flex items-center justify-center">
              <p className="text-muted-foreground">Select an MVP from the left to view or edit</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
