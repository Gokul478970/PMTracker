/**
 * Component tests for IssueCard, CreateIssueDialog and Login.
 *
 * Heavy router / query / API dependencies are mocked so tests focus on
 * rendering and user interaction logic only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withRouter(ui: React.ReactElement, initialEntry = '/') {
  return <MemoryRouter initialEntries={[initialEntry]}>{ui}</MemoryRouter>
}

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Mocks — keep before component imports to ensure modules see the mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api', () => ({
  authLogin: vi.fn(),
  authRegister: vi.fn(),
  authVerifyOtp: vi.fn(),
  authDemoLogin: vi.fn(),
  getUsers: vi.fn().mockResolvedValue([
    { accountId: 'u1', displayName: 'Alice Johnson', emailAddress: 'alice@example.com' },
  ]),
  getProjectIssues: vi.fn().mockResolvedValue({ issues: [], total: 0 }),
  getProjectVersions: vi.fn().mockResolvedValue([]),
  getBoards: vi.fn().mockResolvedValue([]),
  getBoardSprints: vi.fn().mockResolvedValue([]),
  createIssue: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  setSession: vi.fn(),
  getToken: vi.fn().mockReturnValue(null),
  isAuthenticated: vi.fn().mockReturnValue(false),
}))

// ---------------------------------------------------------------------------
// IssueCard
// ---------------------------------------------------------------------------
import { IssueCard } from '@/components/IssueCard'

function makeIssue(overrides: Record<string, unknown> = {}) {
  return {
    key: 'ECOM-1',
    fields: {
      summary: 'Implement user login',
      status: { name: 'To Do' },
      priority: { name: 'High' },
      issuetype: { name: 'Story' },
      assignee: { accountId: 'u1', displayName: 'Alice Johnson' },
      labels: ['auth', 'mvp'],
      customfield_10001: 5,
      estimate_hours: 3,
      ...overrides,
    },
  }
}

describe('IssueCard', () => {
  it('renders issue key and summary', () => {
    render(withRouter(<IssueCard issue={makeIssue()} />))
    expect(screen.getByText('ECOM-1')).toBeInTheDocument()
    expect(screen.getByText('Implement user login')).toBeInTheDocument()
  })

  it('renders status badge', () => {
    render(withRouter(<IssueCard issue={makeIssue()} />))
    expect(screen.getByText('To Do')).toBeInTheDocument()
  })

  it('renders assignee initials', () => {
    render(withRouter(<IssueCard issue={makeIssue()} />))
    expect(screen.getByText('AJ')).toBeInTheDocument()
  })

  it('renders story-points badge', () => {
    render(withRouter(<IssueCard issue={makeIssue()} />))
    expect(screen.getByText('5 SP')).toBeInTheDocument()
  })

  it('renders estimate hours badge', () => {
    render(withRouter(<IssueCard issue={makeIssue()} />))
    expect(screen.getByText('3h')).toBeInTheDocument()
  })

  it('renders labels (up to 2)', () => {
    render(withRouter(<IssueCard issue={makeIssue()} />))
    expect(screen.getByText('auth')).toBeInTheDocument()
    expect(screen.getByText('mvp')).toBeInTheDocument()
  })

  it('does not render status/labels in compact mode', () => {
    render(withRouter(<IssueCard issue={makeIssue()} compact />))
    expect(screen.queryByText('To Do')).not.toBeInTheDocument()
    expect(screen.queryByText('auth')).not.toBeInTheDocument()
  })

  it('renders without assignee gracefully', () => {
    const issue = makeIssue({ assignee: null })
    render(withRouter(<IssueCard issue={issue} />))
    expect(screen.queryByText('AJ')).not.toBeInTheDocument()
    expect(screen.getByText('ECOM-1')).toBeInTheDocument()
  })

  it('renders without labels gracefully', () => {
    const issue = makeIssue({ labels: [] })
    render(withRouter(<IssueCard issue={issue} />))
    expect(screen.getByText('ECOM-1')).toBeInTheDocument()
  })

  it('links to correct issue URL', () => {
    render(withRouter(<IssueCard issue={makeIssue()} />))
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/issues/ECOM-1')
  })

  it('applies done styling for Done status', () => {
    const issue = makeIssue({ status: { name: 'Done' } })
    render(withRouter(<IssueCard issue={issue} />))
    const summary = screen.getByText('Implement user login')
    expect(summary.className).toContain('line-through')
  })

  it('renders Bug emoji for Bug type', () => {
    const issue = makeIssue({ issuetype: { name: 'Bug' } })
    render(withRouter(<IssueCard issue={issue} />))
    expect(screen.getByText('🐛')).toBeInTheDocument()
  })

  it('renders Epic emoji for Epic type', () => {
    const issue = makeIssue({ issuetype: { name: 'Epic' } })
    render(withRouter(<IssueCard issue={issue} />))
    expect(screen.getByText('⚡')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Login component
// ---------------------------------------------------------------------------
import { Login } from '@/pages/Login'
import { authLogin, authRegister, authDemoLogin } from '@/lib/api'

describe('Login', () => {
  const onLogin = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders three tabs: Login, Register, Demo', () => {
    render(withRouter(<Login onLogin={onLogin} />))
    // Tab bar buttons: Sign In, Register, Try Demo
    expect(screen.getAllByText('Sign In').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Register').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Try Demo')).toBeInTheDocument()
  })

  it('shows login form by default', () => {
    render(withRouter(<Login onLogin={onLogin} />))
    expect(screen.getByPlaceholderText('you@cognizant.com')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument()
  })

  it('calls authLogin on form submit with credentials', async () => {
    const loginMock = vi.mocked(authLogin).mockResolvedValue({
      token: 'tok', email: 'u@cognizant.com', role: 'Dev',
    })
    render(withRouter(<Login onLogin={onLogin} />))

    const emailInput = screen.getByPlaceholderText('you@cognizant.com')
    await userEvent.type(emailInput, 'u@cognizant.com')
    await userEvent.type(screen.getByPlaceholderText('Enter password'), 'mypassword')
    fireEvent.submit(emailInput.closest('form')!)

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('u@cognizant.com', 'mypassword'))
  })

  it('calls onLogin callback after successful login', async () => {
    vi.mocked(authLogin).mockResolvedValue({
      token: 'tok', email: 'u@cognizant.com', role: 'Dev',
    })
    render(withRouter(<Login onLogin={onLogin} />))

    const emailInput = screen.getByPlaceholderText('you@cognizant.com')
    await userEvent.type(emailInput, 'u@cognizant.com')
    await userEvent.type(screen.getByPlaceholderText('Enter password'), 'mypassword')
    fireEvent.submit(emailInput.closest('form')!)

    await waitFor(() => expect(onLogin).toHaveBeenCalled())
  })

  it('shows error message on failed login', async () => {
    vi.mocked(authLogin).mockRejectedValue(new Error('Invalid email or password.'))
    render(withRouter(<Login onLogin={onLogin} />))

    const emailInput = screen.getByPlaceholderText('you@cognizant.com')
    await userEvent.type(emailInput, 'u@cognizant.com')
    await userEvent.type(screen.getByPlaceholderText('Enter password'), 'wrong')
    fireEvent.submit(emailInput.closest('form')!)

    await waitFor(() =>
      expect(screen.getByText('Invalid email or password.')).toBeInTheDocument(),
    )
  })

  it('switches to Register tab when clicked', async () => {
    render(withRouter(<Login onLogin={onLogin} />))
    // First 'Register' in DOM is the tab button; second is the footer link in the login form
    await userEvent.click(screen.getAllByRole('button', { name: 'Register' })[0])
    expect(screen.getByPlaceholderText('you@cognizant.com')).toBeInTheDocument()
  })

  it('validates @cognizant.com domain client-side on register', async () => {
    render(withRouter(<Login onLogin={onLogin} />))
    await userEvent.click(screen.getAllByRole('button', { name: 'Register' })[0])

    const emailInput = screen.getByPlaceholderText('you@cognizant.com')
    await userEvent.type(emailInput, 'bad@gmail.com')
    fireEvent.submit(emailInput.closest('form')!)

    await waitFor(() =>
      expect(screen.getByText('Only @cognizant.com email addresses are allowed.')).toBeInTheDocument(),
    )
    expect(authRegister).not.toHaveBeenCalled()
  })

  it('calls authRegister with correct email on valid register', async () => {
    vi.mocked(authRegister).mockResolvedValue({ email: 'u@cognizant.com', message: 'ok' })
    render(withRouter(<Login onLogin={onLogin} />))
    await userEvent.click(screen.getAllByRole('button', { name: 'Register' })[0])

    const emailInput = screen.getByPlaceholderText('you@cognizant.com')
    await userEvent.type(emailInput, 'u@cognizant.com')
    fireEvent.submit(emailInput.closest('form')!)

    await waitFor(() =>
      expect(authRegister).toHaveBeenCalledWith('u@cognizant.com'),
    )
  })

  it('switches to Demo tab when clicked', async () => {
    render(withRouter(<Login onLogin={onLogin} />))
    await userEvent.click(screen.getByText('Try Demo'))
    // Demo tab shows a 6-digit OTP field with placeholder '000000'
    expect(screen.getByPlaceholderText('000000')).toBeInTheDocument()
  })

  it('calls authDemoLogin on demo form submit', async () => {
    vi.mocked(authDemoLogin).mockResolvedValue({ token: 'demo-tok', role: 'Demo', email: 'demo@demo.local' })
    render(withRouter(<Login onLogin={onLogin} />))
    await userEvent.click(screen.getByText('Try Demo'))

    const otpInput = screen.getByPlaceholderText('000000')
    await userEvent.type(otpInput, '999940')
    fireEvent.submit(otpInput.closest('form')!)

    await waitFor(() => expect(authDemoLogin).toHaveBeenCalledWith('999940'))
  })
})

// ---------------------------------------------------------------------------
// CreateIssueDialog
// ---------------------------------------------------------------------------
import { CreateIssueDialog } from '@/components/CreateIssueDialog'
import { createIssue } from '@/lib/api'

describe('CreateIssueDialog', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when closed', () => {
    const { container } = render(
      withQuery(<CreateIssueDialog projectKey="ECOM" open={false} onClose={onClose} />),
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders form fields when open', async () => {
    render(withQuery(<CreateIssueDialog projectKey="ECOM" open={true} onClose={onClose} />))
    expect(await screen.findByPlaceholderText('What needs to be done?')).toBeInTheDocument()
  })

  it('closes on Escape key press', async () => {
    render(withQuery(<CreateIssueDialog projectKey="ECOM" open={true} onClose={onClose} />))
    await screen.findByPlaceholderText('What needs to be done?')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('calls createIssue with summary on submit', async () => {
    vi.mocked(createIssue).mockResolvedValue({ key: 'ECOM-99', fields: { summary: 'New feature' } })
    render(withQuery(<CreateIssueDialog projectKey="ECOM" open={true} onClose={onClose} />))

    const summaryInput = await screen.findByPlaceholderText('What needs to be done?')
    await userEvent.type(summaryInput, 'New feature')
    fireEvent.submit(summaryInput.closest('form')!)

    await waitFor(() =>
      expect(createIssue).toHaveBeenCalledWith(
        expect.objectContaining({ summary: 'New feature', project_key: 'ECOM' }),
      ),
    )
  })

  it('calls onClose after successful submit', async () => {
    vi.mocked(createIssue).mockResolvedValue({ key: 'ECOM-99', fields: { summary: 'Test' } })
    render(withQuery(<CreateIssueDialog projectKey="ECOM" open={true} onClose={onClose} />))

    const summaryInput = await screen.findByPlaceholderText('What needs to be done?')
    await userEvent.type(summaryInput, 'Test')
    fireEvent.submit(summaryInput.closest('form')!)

    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})
