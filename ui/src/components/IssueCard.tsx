import { Link } from 'react-router-dom'
import { STATUS_COLORS, PRIORITY_CONFIG, ISSUE_TYPE_ICONS, getInitials } from '@/lib/utils'

interface Props {
  issue: any
  compact?: boolean
}

export function IssueCard({ issue, compact }: Props) {
  const f = issue.fields
  const statusName = f.status?.name || 'To Do'
  const priorityName = f.priority?.name || 'Medium'
  const typeName = f.issuetype?.name || 'Task'
  const assignee = f.assignee
  const isDone = statusName === 'Done'

  return (
    <Link
      to={`/issues/${issue.key}`}
      className={`block bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 shadow-sm hover:shadow-md transition-all p-3.5 group ${isDone ? 'opacity-50 bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs">{ISSUE_TYPE_ICONS[typeName] || '\u{1F4CB}'}</span>
            <span className="text-xs font-medium text-muted-foreground">{issue.key}</span>
          </div>
          <p className={`text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 ${isDone ? 'line-through' : ''}`}>
            {f.summary}
          </p>
        </div>
        {assignee && (
          <div
            className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0"
            title={assignee.displayName}
          >
            {getInitials(assignee.displayName)}
          </div>
        )}
      </div>

      {!compact && (
        <div className="flex items-center gap-2 mt-2.5">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_COLORS[statusName] || 'bg-slate-100 text-slate-600'}`}>
            {statusName}
          </span>
          <span className={`text-xs ${PRIORITY_CONFIG[priorityName]?.color || 'text-slate-400'}`}>
            {priorityName}
          </span>
          {f.customfield_10001 != null && (
            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded">
              {f.customfield_10001} SP
            </span>
          )}
          {f.estimate_hours != null && (
            <span className="text-[10px] bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded">
              {f.estimate_hours}h
            </span>
          )}
          {(f.labels || []).slice(0, 2).map((l: string) => (
            <span key={l} className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded">
              {l}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
