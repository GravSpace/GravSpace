import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'

export interface AuthState {
  accessKeyId: string
  secretAccessKey: string
  token: string
  username: string
  isAuthenticated: boolean
  isDefaultPassword?: boolean
}

const STORAGE_KEY = 'gravspace_auth'

const defaultState: AuthState = {
  accessKeyId: '',
  secretAccessKey: '',
  token: '',
  username: '',
  isAuthenticated: false,
  isDefaultPassword: false,
}

function loadStoredAuth(): AuthState {
  if (typeof window === 'undefined') return defaultState
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY)
    // Remove legacy duplicated sessionStorage entry so auth metadata lives in one place
    sessionStorage.removeItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object') return defaultState
      const sanitized: AuthState = {
        accessKeyId: '',
        secretAccessKey: '',
        token: '',
        username: typeof parsed.username === 'string' ? parsed.username : '',
        isAuthenticated: Boolean(parsed.isAuthenticated && parsed.username),
        isDefaultPassword: Boolean(parsed.isDefaultPassword),
      }
      // Scrub legacy plaintext secretAccessKey / token if present from older sessions
      if ('secretAccessKey' in parsed || 'accessKeyId' in parsed || 'token' in parsed) {
        saveAuth(sanitized)
      }
      return sanitized
    }
  } catch {
    // ignore
  }
  return defaultState
}

function saveAuth(state: AuthState) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    if (state.isAuthenticated) {
      // Never persist secretAccessKey, accessKeyId, or JWT in Web Storage;
      // the backend authenticates browser requests via the HttpOnly gravspace_session cookie.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          username: state.username,
          isAuthenticated: true,
          isDefaultPassword: Boolean(state.isDefaultPassword),
        }),
      )
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // ignore
  }
}

// Global singleton state (shared across hook instances)
let _authState: AuthState = loadStoredAuth()
const _listeners = new Set<() => void>()

function setGlobalAuth(state: AuthState) {
  _authState = state
  saveAuth(state)
  _listeners.forEach((fn) => fn())
}

export function getAuthState(): AuthState {
  return _authState
}

export function useAuth() {
  const [authState, setLocalState] = useState<AuthState>(() => _authState)
  const navigate = useNavigate()

  useEffect(() => {
    const update = () => setLocalState({ ..._authState })
    _listeners.add(update)
    return () => { _listeners.delete(update) }
  }, [])

  const login = useCallback(
    async (accessKeyId: string, secretAccessKey: string): Promise<boolean> => {
      try {
        const apiBase = import.meta.env.VITE_API_BASE ?? '/api'
        const response = await fetch(`${apiBase}/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: accessKeyId, password: secretAccessKey }),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          const errMsg = errData.error || errData.message || `Login failed (${response.status})`
          throw new Error(errMsg)
        }

        const data = await response.json()
        setGlobalAuth({
          accessKeyId: '',
          secretAccessKey: '',
          token: '',
          username: data.username,
          isAuthenticated: true,
          isDefaultPassword: !!data.is_default_password,
        })
        return true
      } catch (err) {
        console.error('Login error:', err)
        return false
      }
    },
    [],
  )

  const logout = useCallback(() => {
    const apiBase = import.meta.env.VITE_API_BASE ?? '/api'
    void fetch(`${apiBase}/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {})
    setGlobalAuth(defaultState)
  }, [])

  const getCredentials = useCallback(() => {
    return null
  }, [])

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      if (!_authState.isAuthenticated) {
        navigate({ to: '/login' })
        throw new Error('Not authenticated')
      }

      const headers: Record<string, string> = {}
      if (_authState.token) {
        headers.Authorization = `Bearer ${_authState.token}`
      }

      let body = options.body
      if (
        body &&
        !(body instanceof FormData) &&
        typeof body === 'object' &&
        !(body instanceof ArrayBuffer) &&
        !(body instanceof Blob) &&
        !(body instanceof URLSearchParams)
      ) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(body)
      }

      const res = await fetch(url, {
        ...options,
        credentials: options.credentials ?? 'include',
        body,
        headers: { ...headers, ...(options.headers as Record<string, string>) },
      })

      if (res.status === 401) {
        logout()
        navigate({ to: '/login' })
        throw new Error('Session expired')
      }

      if (res.status === 403) {
        try {
          const errorData = await res.clone().json()
          toast.error('Access Denied', {
            description:
              errorData.error ||
              errorData.message ||
              'You do not have sufficient permissions. Contact your administrator.',
          })
        } catch {
          toast.error('Access Denied', {
            description: 'Insufficient permissions. Contact your administrator.',
          })
        }
      }

      return res
    },
    [navigate, logout],
  )

  const setCompletedOnboarding = useCallback(() => {
    if (_authState.isAuthenticated) {
      setGlobalAuth({ ..._authState, isDefaultPassword: false })
    }
  }, [])

  return {
    authState,
    login,
    logout,
    getCredentials,
    authFetch,
    setCompletedOnboarding,
  }
}
