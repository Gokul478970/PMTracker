import { useState, useEffect } from 'react'
import { authRegister, authVerifyOtp, authLogin, authDemoLogin } from '@/lib/api'
import { setSession } from '@/lib/auth'
import { FolderKanban, Mail, KeyRound, ShieldCheck, ArrowRight, Info, User, Briefcase, Eye } from 'lucide-react'

interface Props {
  onLogin: () => void
}

type Tab = 'login' | 'register' | 'demo'
type RegisterStage = 'email' | 'otp' | 'done'

export function Login({ onLogin }: Props) {
  const [tab, setTab] = useState<Tab>('login')

  // Login state
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // Register state
  const [regEmail, setRegEmail] = useState('')
  const [regStage, setRegStage] = useState<RegisterStage>('email')
  const [otp, setOtp] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')
  const [regRole, setRegRole] = useState('Dev')
  const [regError, setRegError] = useState('')
  const [regLoading, setRegLoading] = useState(false)

  // Demo state
  const [demoOtp, setDemoOtp] = useState('')
  const [demoError, setDemoError] = useState('')
  const [demoLoading, setDemoLoading] = useState(false)

  // Auto-fill saved credentials on mount
  useEffect(() => {
    if ((window as any).PasswordCredential) {
      navigator.credentials.get({ password: true } as any)
        .then((cred: any) => {
          if (cred && cred.type === 'password') {
            setLoginEmail(cred.id)
            setLoginPassword(cred.password)
          }
        })
        .catch(() => {})
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    try {
      const data = await authLogin(loginEmail, loginPassword)
      // Save credentials to browser's password manager
      if ((window as any).PasswordCredential) {
        try {
          const cred = new (window as any).PasswordCredential({
            id: loginEmail,
            password: loginPassword,
          })
          await navigator.credentials.store(cred)
        } catch (_) {}
      }
      setSession(data.token, data.email, data.role)
      onLogin()
    } catch (err: any) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleRegisterEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')
    if (!regEmail.toLowerCase().endsWith('@cognizant.com')) {
      setRegError('Only @cognizant.com email addresses are allowed.')
      return
    }
    setRegLoading(true)
    try {
      await authRegister(regEmail)
      setRegStage('otp')
    } catch (err: any) {
      setRegError(err.message)
    } finally {
      setRegLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setRegError('')
    if (regPassword !== regConfirm) {
      setRegError('Passwords do not match.')
      return
    }
    if (regPassword.length < 4) {
      setRegError('Password must be at least 4 characters.')
      return
    }
    setRegLoading(true)
    try {
      await authVerifyOtp(regEmail, otp, regPassword, regDisplayName, regRole)
      setRegStage('done')
    } catch (err: any) {
      setRegError(err.message)
    } finally {
      setRegLoading(false)
    }
  }

  const handleDemoLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setDemoError('')
    setDemoLoading(true)
    try {
      const data = await authDemoLogin(demoOtp)
      setSession(data.token, data.email, data.role)
      onLogin()
    } catch (err: any) {
      setDemoError(err.message)
    } finally {
      setDemoLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-4">
            <FolderKanban className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Velocity</h1>
          <p className="text-sm text-muted-foreground mt-1">Get it done with AI.</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b dark:border-slate-700">
            <button
              onClick={() => { setTab('login'); setRegError(''); setLoginError(''); setDemoError('') }}
              className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${
                tab === 'login'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('register'); setRegError(''); setLoginError(''); setDemoError('') }}
              className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${
                tab === 'register'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Register
            </button>
            <button
              onClick={() => { setTab('demo'); setRegError(''); setLoginError(''); setDemoError('') }}
              className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${
                tab === 'demo'
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Try Demo
            </button>
          </div>

          <div className="p-6 min-h-[340px]">
            {/* ---- LOGIN ---- */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4" autoComplete="on">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      name="email"
                      autoComplete="username"
                      required
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="you@cognizant.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      name="password"
                      autoComplete="current-password"
                      required
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="Enter password"
                    />
                  </div>
                </div>
                {loginError && (
                  <p className="text-sm text-destructive bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{loginError}</p>
                )}
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {loginLoading ? 'Signing in...' : 'Sign In'}
                  {!loginLoading && <ArrowRight className="w-4 h-4" />}
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  Don't have an account?{' '}
                  <button type="button" onClick={() => setTab('register')} className="text-primary hover:underline">
                    Register
                  </button>
                </p>
              </form>
            )}

            {/* ---- REGISTER ---- */}
            {tab === 'register' && regStage === 'email' && (
              <form onSubmit={handleRegisterEmail} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Corporate Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="you@cognizant.com"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">Only @cognizant.com emails are accepted</p>
                </div>
                {regError && (
                  <p className="text-sm text-destructive bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{regError}</p>
                )}
                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {regLoading ? 'Submitting...' : 'Request OTP'}
                  {!regLoading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            )}

            {tab === 'register' && regStage === 'otp' && (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                {/* Info box */}
                <div className="flex gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                  <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">OTP Required</p>
                    <p className="text-xs text-blue-700 mt-0.5">
                      Please reach out to{' '}
                      <span className="font-semibold">604671@cognizant.com</span>{' '}
                      for your OTP.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Display Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      value={regDisplayName}
                      onChange={(e) => setRegDisplayName(e.target.value)}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="Your full name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Role</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <select
                      value={regRole}
                      onChange={(e) => setRegRole(e.target.value)}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none bg-white dark:bg-slate-700 dark:text-slate-300"
                    >
                      <option value="Dev">Developer</option>
                      <option value="QA">QA</option>
                      <option value="PM">Project Manager</option>
                      <option value="PO">Product Owner</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">6-Digit OTP</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="\d{6}"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="000000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Create Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      required
                      minLength={4}
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="Min 4 characters"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      required
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>

                {regError && (
                  <p className="text-sm text-destructive bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{regError}</p>
                )}
                <button
                  type="submit"
                  disabled={regLoading || otp.length !== 6}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {regLoading ? 'Verifying...' : 'Verify & Create Account'}
                </button>
              </form>
            )}

            {tab === 'register' && regStage === 'done' && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="font-semibold text-lg">Registration Complete!</h3>
                <p className="text-sm text-muted-foreground mt-1 mb-4">You can now sign in with your credentials.</p>
                <button
                  onClick={() => {
                    setTab('login')
                    setLoginEmail(regEmail)
                    setRegStage('email')
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  Go to Sign In
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* ---- DEMO ---- */}
            {tab === 'demo' && (
              <form onSubmit={handleDemoLogin} className="space-y-4">
                <div className="flex gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <Eye className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Demo Mode</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                      Explore Velocity in read-only mode. Contact{' '}
                      <span className="font-semibold">604671@cognizant.com</span>{' '}
                      for a demo OTP.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1.5">6-Digit OTP</label>
                  <div className="relative">
                    <ShieldCheck className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      required
                      maxLength={6}
                      pattern="\d{6}"
                      value={demoOtp}
                      onChange={(e) => setDemoOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full border dark:border-slate-600 rounded-lg pl-10 pr-3 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/50 dark:bg-slate-700 dark:text-slate-300"
                      placeholder="000000"
                    />
                  </div>
                </div>

                {demoError && (
                  <p className="text-sm text-destructive bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{demoError}</p>
                )}
                <button
                  type="submit"
                  disabled={demoLoading || demoOtp.length !== 6}
                  className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {demoLoading ? 'Entering demo...' : 'Enter Demo'}
                  {!demoLoading && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Velocity v0.1.0 &middot; Internal use only
        </p>
      </div>
    </div>
  )
}
