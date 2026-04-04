/**
 * Unit tests for src/lib/auth.ts
 *
 * localStorage is provided by the jsdom environment.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  getToken,
  getEmail,
  getRole,
  isAdmin,
  isDemo,
  setSession,
  clearSession,
  isAuthenticated,
  getTheme,
  setTheme,
} from '@/lib/auth'

const ADMIN_EMAIL = '604671@cognizant.com'

beforeEach(() => {
  localStorage.clear()
  // Reset dark class on document element
  document.documentElement.classList.remove('dark')
})

// ---------------------------------------------------------------------------
// getToken / getEmail / getRole
// ---------------------------------------------------------------------------
describe('getToken()', () => {
  it('returns null when not set', () => {
    expect(getToken()).toBeNull()
  })

  it('returns stored token', () => {
    localStorage.setItem('pmtracker_token', 'tok-abc')
    expect(getToken()).toBe('tok-abc')
  })
})

describe('getEmail()', () => {
  it('returns null when not set', () => {
    expect(getEmail()).toBeNull()
  })

  it('returns stored email', () => {
    localStorage.setItem('pmtracker_email', 'user@example.com')
    expect(getEmail()).toBe('user@example.com')
  })
})

describe('getRole()', () => {
  it('returns Dev when nothing stored', () => {
    expect(getRole()).toBe('Dev')
  })

  it('returns stored role', () => {
    localStorage.setItem('pmtracker_role', 'PM')
    expect(getRole()).toBe('PM')
  })

  it('falls back to Admin role for admin email even without role key', () => {
    localStorage.setItem('pmtracker_email', ADMIN_EMAIL)
    // Role key not set — should fall back via email check
    expect(getRole()).toBe('Admin')
  })
})

// ---------------------------------------------------------------------------
// isAdmin / isDemo
// ---------------------------------------------------------------------------
describe('isAdmin()', () => {
  it('false when not logged in', () => {
    expect(isAdmin()).toBe(false)
  })

  it('true for Admin role', () => {
    localStorage.setItem('pmtracker_role', 'Admin')
    expect(isAdmin()).toBe(true)
  })

  it('true for admin email even without role key', () => {
    localStorage.setItem('pmtracker_email', ADMIN_EMAIL)
    expect(isAdmin()).toBe(true)
  })

  it('false for regular Dev role', () => {
    localStorage.setItem('pmtracker_role', 'Dev')
    expect(isAdmin()).toBe(false)
  })
})

describe('isDemo()', () => {
  it('false by default', () => {
    expect(isDemo()).toBe(false)
  })

  it('true when role is Demo', () => {
    localStorage.setItem('pmtracker_role', 'Demo')
    expect(isDemo()).toBe(true)
  })

  it('false for Admin role', () => {
    localStorage.setItem('pmtracker_role', 'Admin')
    expect(isDemo()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// setSession / clearSession / isAuthenticated
// ---------------------------------------------------------------------------
describe('setSession()', () => {
  it('sets token, email and role', () => {
    setSession('my-token', 'alice@example.com', 'PM')
    expect(getToken()).toBe('my-token')
    expect(getEmail()).toBe('alice@example.com')
    expect(getRole()).toBe('PM')
  })

  it('works without a role argument', () => {
    setSession('tok', 'bob@example.com')
    expect(getToken()).toBe('tok')
    expect(getEmail()).toBe('bob@example.com')
    // Role falls back to Dev (nothing stored)
    expect(getRole()).toBe('Dev')
  })
})

describe('clearSession()', () => {
  it('removes token, email and role', () => {
    setSession('tok', 'alice@example.com', 'PM')
    clearSession()
    expect(getToken()).toBeNull()
    expect(getEmail()).toBeNull()
    // After clear, role key removed — falls back to Dev
    expect(getRole()).toBe('Dev')
  })
})

describe('isAuthenticated()', () => {
  it('false when session is clear', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('true after setSession', () => {
    setSession('valid-token', 'user@example.com')
    expect(isAuthenticated()).toBe(true)
  })

  it('false after clearSession', () => {
    setSession('valid-token', 'user@example.com')
    clearSession()
    expect(isAuthenticated()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
describe('getTheme() / setTheme()', () => {
  it('defaults to light', () => {
    expect(getTheme()).toBe('light')
  })

  it('setTheme persists to localStorage', () => {
    setTheme('dark')
    expect(getTheme()).toBe('dark')
  })

  it('setTheme(dark) adds dark class to documentElement', () => {
    setTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('setTheme(light) removes dark class', () => {
    setTheme('dark')
    setTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
