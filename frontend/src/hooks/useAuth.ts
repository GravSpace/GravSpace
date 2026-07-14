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
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    // ignore
  }
  return defaultState
}

function saveAuth(state: AuthState) {
  if (typeof window === 'undefined') return
  if (state.isAuthenticated) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } else {
    sessionStorage.removeItem(STORAGE_KEY)
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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: accessKeyId, password: secretAccessKey }),
        })

        if (!response.ok) throw new Error('Login failed')

        const data = await response.json()
        setGlobalAuth({
          accessKeyId,
          secretAccessKey,
          token: data.token,
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
    setGlobalAuth(defaultState)
  }, [])

  const getCredentials = useCallback(() => {
    if (!_authState.isAuthenticated) return null
    return {
      accessKeyId: _authState.accessKeyId,
      secretAccessKey: _authState.secretAccessKey,
    }
  }, [])

  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      if (!_authState.isAuthenticated) {
        navigate({ to: '/login' })
        throw new Error('Not authenticated')
      }

      const headers: HeadersInit = {
        Authorization: `Bearer ${_authState.token}`,
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
        ;(headers as Record<string, string>)['Content-Type'] = 'application/json'
        body = JSON.stringify(body)
      }

      const res = await fetch(url, {
        ...options,
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
