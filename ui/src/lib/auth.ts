const TOKEN_KEY = 'pmtracker_token'
const EMAIL_KEY = 'pmtracker_email'
const ROLE_KEY = 'pmtracker_role'
const THEME_KEY = 'pmtracker_theme'
const ADMIN_EMAIL = '604671@cognizant.com'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY)
}

export function getRole(): string {
  const stored = localStorage.getItem(ROLE_KEY)
  if (stored) return stored
  // Fallback: check email
  if (getEmail() === ADMIN_EMAIL) return 'Admin'
  return 'Dev'
}

export function isAdmin(): boolean {
  return getRole() === 'Admin' || getEmail() === ADMIN_EMAIL
}

export function isDemo(): boolean {
  return getRole() === 'Demo'
}

export function getTheme(): 'light' | 'dark' {
  return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'light'
}

export function setTheme(theme: 'light' | 'dark') {
  localStorage.setItem(THEME_KEY, theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function initTheme() {
  const theme = getTheme()
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function setSession(token: string, email: string, role?: string) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(EMAIL_KEY, email)
  if (role) localStorage.setItem(ROLE_KEY, role)
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(EMAIL_KEY)
  localStorage.removeItem(ROLE_KEY)
}

export function isAuthenticated(): boolean {
  return !!getToken()
}
