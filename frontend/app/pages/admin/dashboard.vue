<template>
    <div class="flex-1 flex flex-col overflow-hidden">
        <header class="h-16 border-b bg-card px-6 flex items-center justify-between">
            <div>
                <h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
                <p class="text-sm text-muted-foreground">System overview and statistics</p>
            </div>
        </header>

        <div class="flex-1 overflow-auto p-6">
            <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle class="text-sm font-medium">Total Users</CardTitle>
                        <User class="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ stats.total_users || 0 }}</div>
                        <p class="text-xs text-muted-foreground">Active user accounts</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle class="text-sm font-medium">System Status</CardTitle>
                        <Activity class="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ stats.uptime || 'Running' }}</div>
                        <p class="text-xs text-muted-foreground">System uptime</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle class="text-sm font-medium">Total Buckets</CardTitle>
                        <Database class="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ buckets.length }}</div>
                        <p class="text-xs text-muted-foreground">Storage containers</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle class="text-sm font-medium">Quick Actions</CardTitle>
                        <Zap class="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div class="flex flex-col gap-2">
                            <Button size="sm" variant="outline" @click="$router.push('/admin/buckets')">
                                Manage Buckets
                            </Button>
                            <Button size="sm" variant="outline" @click="$router.push('/admin/users')">
                                Manage Users
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { User, Activity, Database, Zap } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'

const { authState } = useAuth()
const API_BASE = 'http://localhost:8080'

const stats = ref({})
const buckets = ref([])

async function authFetch(url, options = {}) {
    const credentials = authState.value
    if (!credentials.isAuthenticated) {
        throw new Error('Not authenticated')
    }

    const headers = {
        'Authorization': `Bearer ${credentials.token}`
    }
    if (options.body && typeof options.body === 'string') {
        headers['Content-Type'] = 'application/json'
    }

    return fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
    })
}

async function fetchStats() {
    try {
        const res = await authFetch(`${API_BASE}/admin/stats`)
        stats.value = await res.json()
    } catch (e) {
        console.error('Failed to fetch stats', e)
    }
}

async function fetchBuckets() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets`)
        buckets.value = await res.json()
    } catch (e) {
        console.error('Failed to fetch buckets', e)
    }
}

onMounted(() => {
    fetchStats()
    fetchBuckets()
})
</script>
