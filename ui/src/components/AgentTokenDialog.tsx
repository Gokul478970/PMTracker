import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAgentKeys, createAgentKey, deleteAgentKey } from '@/lib/api'
import { X, Key, Copy, Check, Trash2, AlertTriangle, Plus, Loader2 } from 'lucide-react'
import { timeAgo } from '@/lib/utils'

interface Props {
  agentName: string
  open: boolean
  onClose: () => void
}

export function AgentTokenDialog({ agentName, open, onClose }: Props) {
  const qc = useQueryClient()
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { data: allKeys, isLoading } = useQuery({
    queryKey: ['agentKeys'],
    queryFn: getAgentKeys,
    enabled: open,
  })

  const keys = (allKeys || []).filter((k: any) => k.agent_name === agentName)

  const createMut = useMutation({
    mutationFn: () => createAgentKey(agentName),
    onSuccess: (data) => {
      setNewKey(data.api_key)
      setCopied(false)
      qc.invalidateQueries({ queryKey: ['agentKeys'] })
    },
  })

  const revokeMut = useMutation({
    mutationFn: (id: string) => deleteAgentKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agentKeys'] }),
  })

  const handleCopy = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setNewKey(null)
    setCopied(false)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Key className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{agentName}</h2>
              <p className="text-xs text-muted-foreground">API Key Management</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Newly created key banner */}
          {newKey && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Copy your API key now. It won't be shown again.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white dark:bg-slate-900 border dark:border-slate-700 rounded px-3 py-2 text-xs font-mono break-all text-foreground select-all">
                  {newKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 p-2 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
                  title="Copy to clipboard"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Existing keys */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Active Keys ({keys.length})
            </h3>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : keys.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No API keys generated yet for this agent.
              </div>
            ) : (
              <div className="space-y-2">
                {keys.map((k: any) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 rounded-lg px-4 py-3 border dark:border-slate-700"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Key className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <code className="text-sm font-mono text-foreground">{k.key_prefix}</code>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>Created {timeAgo(k.created)}</span>
                        <span>&middot;</span>
                        <span>{k.last_used ? `Last used ${timeAgo(k.last_used)}` : 'Never used'}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm(`Revoke key ${k.key_prefix}? Agents using this key will lose access.`)) {
                          revokeMut.mutate(k.id)
                        }
                      }}
                      className="shrink-0 p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Revoke key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t dark:border-slate-700 flex items-center justify-between">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm rounded-lg border dark:border-slate-600 text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {createMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Generate New Key
          </button>
        </div>
      </div>
    </div>
  )
}
