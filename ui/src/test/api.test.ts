/**
 * Unit tests for src/lib/api.ts
 *
 * fetch is stubbed via vi.stubGlobal so no real HTTP is made.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(status: number, body: unknown) {
  const resp = {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    statusText: status === 401 ? 'Unauthorized' : 'Error',
  }
  return vi.fn().mockResolvedValue(resp)
}

// Reload module with fresh mocks each test via vi.resetModules()
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// authRegister
// ---------------------------------------------------------------------------
describe('authRegister()', () => {
  it('calls POST /api/auth/register with email', async () => {
    const fetchMock = mockFetch(200, { email: 'user@cognizant.com', message: 'ok' })
    vi.stubGlobal('fetch', fetchMock)
    const { authRegister } = await import('@/lib/api')

    const result = await authRegister('user@cognizant.com')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.email).toBe('user@cognizant.com')
  })

  it('throws on non-ok response', async () => {
    const fetchMock = mockFetch(400, { detail: 'Invalid email' })
    vi.stubGlobal('fetch', fetchMock)
    const { authRegister } = await import('@/lib/api')

    await expect(authRegister('bad@gmail.com')).rejects.toThrow('Invalid email')
  })
})

// ---------------------------------------------------------------------------
// authLogin
// ---------------------------------------------------------------------------
describe('authLogin()', () => {
  it('returns token on success', async () => {
    const fetchMock = mockFetch(200, { token: 'tok-123', email: 'a@cognizant.com', role: 'Dev' })
    vi.stubGlobal('fetch', fetchMock)
    const { authLogin } = await import('@/lib/api')

    const result = await authLogin('a@cognizant.com', 'password')
    expect(result.token).toBe('tok-123')
  })

  it('throws on invalid credentials', async () => {
    const fetchMock = mockFetch(401, { detail: 'Invalid email or password.' })
    vi.stubGlobal('fetch', fetchMock)
    const { authLogin } = await import('@/lib/api')

    await expect(authLogin('a@cognizant.com', 'wrong')).rejects.toThrow(
      'Invalid email or password.',
    )
  })
})

// ---------------------------------------------------------------------------
// authDemoLogin
// ---------------------------------------------------------------------------
describe('authDemoLogin()', () => {
  it('calls POST /api/auth/demo-login', async () => {
    const fetchMock = mockFetch(200, { token: 'demo-tok', role: 'Demo', email: 'demo@demo.local' })
    vi.stubGlobal('fetch', fetchMock)
    const { authDemoLogin } = await import('@/lib/api')

    const result = await authDemoLogin('999940')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/demo-login',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.role).toBe('Demo')
  })

  it('throws on bad OTP', async () => {
    const fetchMock = mockFetch(400, { detail: 'Invalid OTP.' })
    vi.stubGlobal('fetch', fetchMock)
    const { authDemoLogin } = await import('@/lib/api')

    await expect(authDemoLogin('000000')).rejects.toThrow('Invalid OTP.')
  })
})

// ---------------------------------------------------------------------------
// getProjects (authenticated request helper)
// ---------------------------------------------------------------------------
describe('getProjects()', () => {
  it('sends Authorization header when token in localStorage', async () => {
    localStorage.setItem('pmtracker_token', 'my-bearer-token')
    const fetchMock = mockFetch(200, [{ key: 'PROJ', name: 'My Project' }])
    vi.stubGlobal('fetch', fetchMock)
    const { getProjects } = await import('@/lib/api')

    await getProjects()
    const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = opts.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer my-bearer-token')
  })

  it('returns project list', async () => {
    const projects = [{ key: 'PROJ', name: 'My Project' }]
    vi.stubGlobal('fetch', mockFetch(200, projects))
    const { getProjects } = await import('@/lib/api')

    const result = await getProjects()
    expect(result).toEqual(projects)
  })

  it('throws on API error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { detail: 'Server error' }))
    const { getProjects } = await import('@/lib/api')

    await expect(getProjects()).rejects.toThrow('Server error')
  })
})

// ---------------------------------------------------------------------------
// getProject
// ---------------------------------------------------------------------------
describe('getProject()', () => {
  it('calls correct endpoint', async () => {
    const fetchMock = mockFetch(200, { key: 'ECOM', name: 'E-Commerce Platform' })
    vi.stubGlobal('fetch', fetchMock)
    const { getProject } = await import('@/lib/api')

    const result = await getProject('ECOM')
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('/api/projects/ECOM')
    expect(result.key).toBe('ECOM')
  })
})

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------
describe('createIssue()', () => {
  it('sends POST /api/issues with JSON body', async () => {
    const payload = { project_key: 'ECOM', summary: 'Test', issue_type: 'Story' }
    const fetchMock = mockFetch(201, { key: 'ECOM-8', fields: { summary: 'Test' } })
    vi.stubGlobal('fetch', fetchMock)
    const { createIssue } = await import('@/lib/api')

    const result = await createIssue(payload)
    expect(result.key).toBe('ECOM-8')
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/issues')
    expect(opts.method).toBe('POST')
  })
})

// ---------------------------------------------------------------------------
// deleteIssue
// ---------------------------------------------------------------------------
describe('deleteIssue()', () => {
  it('sends DELETE /api/issues/{key}', async () => {
    const fetchMock = mockFetch(200, { deleted: true })
    vi.stubGlobal('fetch', fetchMock)
    const { deleteIssue } = await import('@/lib/api')

    await deleteIssue('ECOM-5')
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/issues/ECOM-5')
    expect(opts.method).toBe('DELETE')
  })
})

// ---------------------------------------------------------------------------
// 401 auto-clears session
// ---------------------------------------------------------------------------
describe('401 response handling', () => {
  it('clears localStorage on 401', async () => {
    localStorage.setItem('pmtracker_token', 'expired-token')
    const resp = {
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ detail: 'Session expired' }),
      statusText: 'Unauthorized',
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resp))
    // Also stub window.location.reload to prevent jsdom error
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: vi.fn() },
      writable: true,
    })
    const { getProjects } = await import('@/lib/api')

    await expect(getProjects()).rejects.toThrow()
    expect(localStorage.getItem('pmtracker_token')).toBeNull()
  })
})
