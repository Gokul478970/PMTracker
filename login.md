# PMTracker Login & Registration System

## Overview
- Registration restricted to `@cognizant.com` email domain
- OTP-based verification (offline delivery by admin: 604671@cognizant.com)
- OTP validation rule: sum of 6 digits must equal 40, 50, 60, or 70
- Password-based login after registration
- Session managed via localStorage token

---

## OTP Validation Logic

A valid 6-digit OTP is one where the sum of its individual digits equals one of: **40, 50, 60, or 70**.

Examples:
- `888880` → 8+8+8+8+8+0 = 40 → valid
- `999950` → 9+9+9+9+5+0 = 41 → invalid
- `999887` → 9+9+9+8+8+7 = 50 → valid

The backend validates this — no OTP table, no expiry, no storage needed.

---

## Implementation Steps

### Step 1 — Backend: Auth Routes (`api/routes/auth.py`)

Create new router with 3 endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/register` | Accept email, validate @cognizant.com, store pending user |
| POST | `/api/auth/verify-otp` | Accept email + OTP, validate digit sum, allow password creation |
| POST | `/api/auth/login` | Accept email + password, return session token |

**Data storage**: Add `auth_users.json` in `pmtracker/store/data/` with structure:
```json
[
  {
    "email": "john@cognizant.com",
    "password_hash": "<sha256 hash>",
    "verified": true,
    "created": "2026-03-06T..."
  }
]
```

**Register flow**:
1. Validate email ends with `@cognizant.com`
2. Check email not already registered
3. Save user with `verified: false`, no password yet
4. Return message: "Please reach out to 604671@cognizant.com for your OTP"

**Verify OTP flow**:
1. Find user by email (must exist, must be unverified)
2. Validate OTP is exactly 6 digits
3. Compute sum of digits → must be in {40, 50, 60, 70}
4. Accept password from the same request
5. Hash password (SHA-256), set `verified: true`
6. Return success

**Login flow**:
1. Find user by email (must exist, must be verified)
2. Compare password hash
3. Return a simple token (SHA-256 of email + timestamp)
4. Store active token in `auth_sessions.json`

### Step 2 — Backend: Auth Middleware

- Add a dependency that checks `Authorization: Bearer <token>` header
- Validate token exists in `auth_sessions.json`
- Apply to all `/api/*` routes except `/api/auth/*` and `/api/health`

### Step 3 — Frontend: Login Page (`ui/src/pages/Login.tsx`)

Two tabs or toggle: **Login** | **Register**

**Login form**:
- Email input
- Password input
- Submit button
- Link to "Register" tab

**Register form** (3 stages):

**Stage 1 — Email**:
- Email input (validated for @cognizant.com on blur)
- Submit → calls `/api/auth/register`
- Shows message: "Please reach out to 604671@cognizant.com for your OTP"

**Stage 2 — OTP + Password**:
- 6-digit OTP input (numeric only)
- New password input
- Confirm password input
- Submit → calls `/api/auth/verify-otp`

**Stage 3 — Success**:
- "Registration complete! You can now log in."
- Auto-switch to Login tab

### Step 4 — Frontend: Auth Context (`ui/src/lib/auth.ts`)

- Store token in `localStorage` under key `pmtracker_token`
- Provide `login()`, `logout()`, `isAuthenticated()` helpers
- Update `api.ts` fetch wrapper to attach `Authorization` header
- On 401 response → clear token, redirect to login

### Step 5 — Frontend: Route Protection

- Wrap `<Routes>` in an auth check
- If not authenticated → show Login page
- If authenticated → show Layout + app routes
- Add logout button in sidebar footer

### Step 6 — Styling

- Login page: centered card on a gradient background
- Clean, executive look matching the rest of the app
- OTP message styled as an info callout box
- Form validation errors shown inline in red

---

### Step 7 — Integrate Registered Users into People & Assignee Lists

**Problem**: Two separate user stores exist:
- `users.json` — 3 seed users (Alice, Bob, Carol) with `accountId`, `displayName`, `emailAddress`, etc.
- `auth_users.json` — registered users with `email`, `password_hash`, `verified`, etc.

The People page and all assignee dropdowns only read from `users.json`, so registered users are invisible.

**Solution**: Merge both sources in the backend `/api/users` endpoint.

#### 7.1 — Add `display_name` to Registration

During the OTP verification step (Stage 2), add a **Display Name** field so users can set their name. Store it in `auth_users.json`.

**Changes:**
- `api/routes/auth.py`: Add `display_name` to `VerifyOtpRequest` model, save to `auth_users.json`
- `ui/src/pages/Login.tsx`: Add display name input in the OTP form
- `ui/src/lib/api.ts`: Pass `display_name` in `authVerifyOtp`

#### 7.2 — Merge Users in Backend

Modify `api/routes/users.py` `list_users()` to:
1. Load seed users from `users.json`
2. Load verified auth users from `auth_users.json`
3. Convert auth users to the same shape: `{ accountId, displayName, emailAddress, active, timeZone }`
   - `accountId` = `"auth-" + email_prefix` (e.g., `"auth-604671"`)
   - `displayName` = stored `display_name` or fallback to email prefix
   - `emailAddress` = email
   - `active` = true, `timeZone` = "UTC"
4. Return combined list (seed users + auth users), deduplicating by email

Also update `get_user(identifier)` to search both sources.

#### 7.3 — No Frontend Changes Needed for People/Assignee

The People page and assignee dropdowns already call `getUsers()` → `GET /api/users` and render based on `accountId` and `displayName`. Once the backend returns merged users, everything works automatically.

#### 7.4 — MCP Users Tool Sync

Update `pmtracker/tools/users.py` `get_user_profile` to also search `auth_users.json` so MCP tool calls reflect registered users too.
