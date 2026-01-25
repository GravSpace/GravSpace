import { ref, readonly, watch, onMounted } from 'vue'
import { useRouter } from '#app'

interface AuthState {
    accessKeyId: string
    secretAccessKey: string
    token: string
    username: string
    isAuthenticated: boolean
}

const authState = ref<AuthState>({
    accessKeyId: '',
    secretAccessKey: '',
    token: '',
    username: '',
    isAuthenticated: false
})

// Load from sessionStorage on mount
if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem('gravspace_auth')
    if (stored) {
        try {
            const parsed = JSON.parse(stored)
            authState.value = parsed
        } catch (e) {
            console.error('Failed to parse stored auth', e)
        }
    }
}

// Save to sessionStorage when changed
if (typeof window !== 'undefined') {
    watch(authState, (newState) => {
        if (newState.isAuthenticated) {
            sessionStorage.setItem('gravspace_auth', JSON.stringify(newState))
        } else {
            sessionStorage.removeItem('gravspace_auth')
        }
    }, { deep: true })
}

async function login(accessKeyId: string, secretAccessKey: string) {
    try {
        const response = await fetch('http://localhost:8080/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: accessKeyId, password: secretAccessKey })
        })

        if (!response.ok) {
            throw new Error('Login failed')
        }

        const data = await response.json()
        authState.value = {
            accessKeyId,
            secretAccessKey,
            token: data.token,
            username: data.username,
            isAuthenticated: true
        }
        return true
    } catch (err) {
        console.error('Login error:', err)
        return false
    }
}

function logout() {
    authState.value = {
        accessKeyId: '',
        secretAccessKey: '',
        token: '',
        username: '',
        isAuthenticated: false
    }
    if (typeof window !== 'undefined') {
        sessionStorage.removeItem('gravspace_auth')
    }
}

function getCredentials() {
    if (!authState.value.isAuthenticated) {
        return null
    }
    return {
        accessKeyId: authState.value.accessKeyId,
        secretAccessKey: authState.value.secretAccessKey
    }
}

export function useAuth() {
    const router = useRouter()

    async function authFetch(url: string, options: any = {}) {
        if (!authState.value.isAuthenticated) {
            router.push('/login')
            throw new Error('Not authenticated')
        }

        const headers: any = {
            'Authorization': `Bearer ${authState.value.token}`
        }

        if (options.body && !(options.body instanceof File) && !(options.body instanceof FormData) && typeof options.body === 'object') {
            headers['Content-Type'] = 'application/json'
            options.body = JSON.stringify(options.body)
        }

        const res = await fetch(url, {
            ...options,
            headers: { ...headers, ...options.headers }
        })

        if (res.status === 401) {
            logout()
            router.push('/login')
            throw new Error('Session expired')
        }

        // Enhanced access denied handling
        if (res.status === 403) {
            try {
                const errorData = await res.clone().json()
                const { toast } = await import('vue-sonner')
                toast.error('Access Denied', {
                    description: errorData.error || errorData.message || 'You do not have sufficient permissions to perform this action. Contact your administrator for access.'
                })
            } catch (e) {
                // If JSON parsing fails, show generic message
                const { toast } = await import('vue-sonner')
                toast.error('Access Denied', {
                    description: 'Insufficient permissions. Contact your administrator.'
                })
            }
        }

        return res
    }

    return {
        authState: readonly(authState),
        login,
        logout,
        getCredentials,
        authFetch
    }
}
