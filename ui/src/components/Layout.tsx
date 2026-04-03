import { useState, useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getProjects, getUsers, searchIssues, getAssignments, getUnreadCounts } from '@/lib/api'
import { STATUS_COLORS, ISSUE_TYPE_ICONS, getInitials } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  PlusCircle,
  ChevronRight,
  LogOut,
  MessageCircle,
  ListTodo,
  Columns3,
  FileText,
  Sun,
  Moon,
  Search,
  SlidersHorizontal,
  X,
  Settings,
  HelpCircle,
} from 'lucide-react'
import { getEmail, getRole, isAdmin, isDemo, clearSession, getTheme, setTheme } from '@/lib/auth'

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

interface LayoutProps {
  children: ReactNode
  onLogout?: () => void
}

export function Layout({ children, onLogout }: LayoutProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects })
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: getUsers })
  const { data: assignments } = useQuery({ queryKey: ['assignments'], queryFn: () => getAssignments() })
  const { data: unreadCounts } = useQuery({ queryKey: ['unreadCounts'], queryFn: getUnreadCounts, refetchInterval: 10000 })
  const [dark, setDark] = useState(getTheme() === 'dark')
  const currentEmail = getEmail()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [searchFilters, setSearchFilters] = useState({ project: '', status: '', type: '', assignee: '' })
  const searchRef = useRef<HTMLDivElement>(null)
  const debouncedQ = useDebouncedValue(searchQuery, 300)

  const hasFilters = Object.values(searchFilters).some(Boolean)
  const searchEnabled = debouncedQ.length >= 2 || hasFilters

  const { data: searchResults } = useQuery({
    queryKey: ['globalSearch', debouncedQ, searchFilters],
    queryFn: () => {
      const parts: string[] = []
      if (searchFilters.project) parts.push(`project = ${searchFilters.project}`)
      if (searchFilters.status) parts.push(`status = "${searchFilters.status}"`)
      if (searchFilters.type) parts.push(`issuetype = "${searchFilters.type}"`)
      if (searchFilters.assignee) parts.push(`assignee = "${searchFilters.assignee}"`)
      return searchIssues(parts.join(' AND '), debouncedQ || undefined)
    },
    enabled: searchEnabled,
  })

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Close on navigate
  useEffect(() => {
    setSearchOpen(false)
    setSearchQuery('')
  }, [location.pathname])

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setShowFilters(false)
    setSearchFilters({ project: '', status: '', type: '', assignee: '' })
  }

  const results = searchResults?.issues || []
  const selectClass = 'w-full border dark:border-slate-600 rounded px-1.5 py-1 text-[11px] bg-white dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-primary/50'

  const toggleTheme = () => {
    const next = dark ? 'light' : 'dark'
    setTheme(next)
    setDark(!dark)
  }

  const demoMode = isDemo()
  const nav = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false, hideDemo: false },
    { to: '/people', label: 'Team', icon: Users, adminOnly: false, hideDemo: true },
    { to: '/create-project', label: 'New Project', icon: PlusCircle, adminOnly: true, hideDemo: true },
  ]

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r dark:border-slate-700 flex flex-col shrink-0">
        <div className="h-14 flex items-center px-5 border-b dark:border-slate-700">
          <FolderKanban className="w-6 h-6 text-primary mr-2" />
          <span className="font-bold text-lg tracking-tight">Velocity</span>
        </div>

        {/* Global Search */}
        <div ref={searchRef} className="px-3 py-2 border-b dark:border-slate-700 relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => { if (e.key === 'Escape') closeSearch() }}
              placeholder="Search issues..."
              className="w-full pl-8 pr-8 py-1.5 text-sm border dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`absolute right-2 top-1.5 p-0.5 rounded transition-colors ${showFilters ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="Toggle filters"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Filter row */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <select value={searchFilters.project} onChange={(e) => { setSearchFilters({ ...searchFilters, project: e.target.value }); setSearchOpen(true) }} className={selectClass}>
                <option value="">All projects</option>
                {(projects || []).map((p: any) => <option key={p.key} value={p.key}>{p.key}</option>)}
              </select>
              <select value={searchFilters.status} onChange={(e) => { setSearchFilters({ ...searchFilters, status: e.target.value }); setSearchOpen(true) }} className={selectClass}>
                <option value="">All statuses</option>
                {['To Do', 'In Progress', 'In Review', 'Done'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={searchFilters.type} onChange={(e) => { setSearchFilters({ ...searchFilters, type: e.target.value }); setSearchOpen(true) }} className={selectClass}>
                <option value="">All types</option>
                {['Epic', 'Feature', 'Story', 'Task', 'Bug', 'Sub-task'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={searchFilters.assignee} onChange={(e) => { setSearchFilters({ ...searchFilters, assignee: e.target.value }); setSearchOpen(true) }} className={selectClass}>
                <option value="">All assignees</option>
                {(users || []).map((u: any) => <option key={u.accountId} value={u.accountId}>{u.displayName}</option>)}
              </select>
              {hasFilters && (
                <button
                  onClick={() => setSearchFilters({ project: '', status: '', type: '', assignee: '' })}
                  className="col-span-2 text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 justify-center py-0.5"
                >
                  <X className="w-3 h-3" /> Clear filters
                </button>
              )}
            </div>
          )}

          {/* Results dropdown */}
          {searchOpen && searchEnabled && (
            <div className="absolute left-3 right-3 top-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
              {results.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No issues found</p>
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground px-3 py-1.5 border-b dark:border-slate-700">
                    {searchResults?.total || 0} result{(searchResults?.total || 0) !== 1 ? 's' : ''}
                  </p>
                  {results.slice(0, 10).map((issue: any) => {
                    const f = issue.fields
                    const statusName = f?.status?.name || 'To Do'
                    const typeName = f?.issuetype?.name || 'Task'
                    return (
                      <Link
                        key={issue.key}
                        to={`/issues/${issue.key}`}
                        onClick={closeSearch}
                        className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 border-b last:border-b-0 dark:border-slate-700 transition-colors"
                      >
                        <span className="text-xs shrink-0">{ISSUE_TYPE_ICONS[typeName] || '\u{1F4CB}'}</span>
                        <span className="text-xs font-medium text-muted-foreground shrink-0 w-16">{issue.key}</span>
                        <span className="text-sm truncate flex-1">{f?.summary}</span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-medium shrink-0 ${STATUS_COLORS[statusName] || 'bg-slate-100'}`}>
                          {statusName}
                        </span>
                        {f?.assignee && (
                          <span className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-[8px] font-bold shrink-0" title={f.assignee.displayName}>
                            {getInitials(f.assignee.displayName)}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-0.5">
            {nav.filter(item => (!item.adminOnly || isAdmin()) && (!item.hideDemo || !demoMode)).map((item) => {
              const active = location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              )
            })}
          </div>

          {projects && projects.length > 0 && (
            <div className="mt-6">
              <p className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Projects
              </p>
              <div className="space-y-0.5">
                {projects.map((p: any) => {
                  const boardActive = location.pathname === `/projects/${p.key}`
                  const backlogActive = location.pathname === `/projects/${p.key}/backlog`
                  const sprintActive = location.pathname === `/projects/${p.key}/sprints`
                  const scopeActive = location.pathname === `/projects/${p.key}/scope`
                  const chatActive = location.pathname === `/projects/${p.key}/chat`
                  const settingsActive = location.pathname === `/projects/${p.key}/settings`
                  const myAssignment = (assignments || []).find(
                    (a: any) => a.email === currentEmail && a.project_key === p.key && !a.end_date
                  )
                  const canManageProject = isAdmin() || myAssignment?.role === 'Project Admin'
                  const canViewScope = isAdmin() || myAssignment?.role === 'Project Admin' || myAssignment?.role === 'Product Owner'
                  const subLinkClass = (active: boolean) =>
                    `flex items-center gap-2 pl-11 pr-3 py-1.5 rounded-md text-xs transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`
                  return (
                    <div key={p.key}>
                      <Link
                        to={`/projects/${p.key}`}
                        className={`flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${
                          boardActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                            {p.key[0]}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 opacity-40" />
                      </Link>
                      <Link to={`/projects/${p.key}/backlog`} className={subLinkClass(backlogActive)}>
                        <ListTodo className="w-3 h-3" />
                        Backlog
                      </Link>
                      <Link to={`/projects/${p.key}/sprints`} className={subLinkClass(sprintActive)}>
                        <Columns3 className="w-3 h-3" />
                        Sprint Board
                      </Link>
                      {canViewScope && !demoMode && (
                        <Link to={`/projects/${p.key}/scope`} className={subLinkClass(scopeActive)}>
                          <FileText className="w-3 h-3" />
                          Scope
                        </Link>
                      )}
                      {!demoMode && (
                        <Link to={`/projects/${p.key}/chat`} className={subLinkClass(chatActive)}>
                          <MessageCircle className="w-3 h-3" />
                          Chat
                          {(unreadCounts?.[p.key] || 0) > 0 && (
                            <span className="ml-auto flex items-center gap-1">
                              <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                                {(unreadCounts?.[p.key] ?? 0) > 99 ? '99+' : unreadCounts?.[p.key]}
                              </span>
                            </span>
                          )}
                        </Link>
                      )}
                      {canManageProject && !demoMode && (
                        <Link to={`/projects/${p.key}/settings`} className={subLinkClass(settingsActive)}>
                          <Settings className="w-3 h-3" />
                          Settings
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </nav>

        <div className="border-t dark:border-slate-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground truncate">{getEmail() || 'Velocity'}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">{getRole()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <a
                href="mailto:604671@cognizant.com?subject=Velocity - Help Request"
                className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                title="Need help? Contact 604671@cognizant.com"
              >
                <HelpCircle className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={toggleTheme}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              {onLogout && (
                <button
                  onClick={() => { clearSession(); onLogout() }}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto p-6">{children}</div>
      </main>
    </div>
  )
}
