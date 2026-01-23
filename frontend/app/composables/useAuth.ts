import { ref, readonly, watch, onMounted } from 'vue'

interface AuthState {
    accessKeyId: string
    secretAccessKey: string
    isAuthenticated: boolean
}

const authState = ref<AuthState>({
    accessKeyId: '',
    secretAccessKey: '',
    isAuthenticated: false
})

// Load from sessionStorage on mount (will be called when composable is first used)
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

function login(accessKeyId: string, secretAccessKey: string) {
    authState.value = {
        accessKeyId,
        secretAccessKey,
        isAuthenticated: true
    }
}

function logout() {
    authState.value = {
        accessKeyId: '',
        secretAccessKey: '',
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
