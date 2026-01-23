import { ref, readonly, watch, onMounted } from 'vue'

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
    const stored = sessionStorage.getItem('gravitystore_auth')
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
            sessionStorage.setItem('gravitystore_auth', JSON.stringify(newState))
        } else {
            sessionStorage.removeItem('gravitystore_auth')
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
        sessionStorage.removeItem('gravitystore_auth')
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
    return {
        authState: readonly(authState),
        login,
        logout,
        getCredentials
    }
}
