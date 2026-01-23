<template>
    <div class="flex items-center justify-center h-screen">
        <div class="text-center space-y-4">
            <Loader2 class="w-8 h-8 animate-spin mx-auto text-primary" />
            <p class="text-muted-foreground">Redirecting to dashboard...</p>
        </div>
    </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2 } from 'lucide-vue-next'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { authState } = useAuth()

onMounted(() => {
    if (authState.value.isAuthenticated) {
        router.push('/admin/dashboard')
    } else {
        router.push('/login')
    }
})
</script>
