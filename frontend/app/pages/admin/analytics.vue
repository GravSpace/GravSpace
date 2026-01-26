<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Advanced Analytics</h1>
                <p class="text-xs text-muted-foreground">Historical trends and storage distribution</p>
            </div>
            <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="fetchAllData" :disabled="loading" class="h-9">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': loading }" />
                    Sync Data
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto p-6 space-y-6">
            <!-- TOP STATS -->
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card v-for="stat in topStats" :key="stat.label"
                    class="border-slate-200 dark:border-slate-800 shadow-xs group hover:border-primary/50 transition-colors">
                    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{{
                            stat.label }}</CardTitle>
                        <component :is="stat.icon"
                            class="h-4 w-4 text-primary opacity-70 group-hover:scale-110 transition-transform" />
                    </CardHeader>
                    <CardContent>
                        <div class="text-2xl font-bold">{{ stat.value }}</div>
                        <p class="text-[10px] text-muted-foreground mt-1">{{ stat.sub }}</p>
                    </CardContent>
                </Card>
            </div>

            <div class="grid gap-6 md:grid-cols-2 h-[450px]">
                <!-- STORAGE DISTRIBUTION -->
                <Card class="border-slate-200 dark:border-slate-800 flex flex-col shadow-sm">
                    <CardHeader>
                        <CardTitle class="text-sm font-bold flex items-center gap-2">
                            <Pizza class="w-4 h-4 text-primary" />
                            Storage Distribution (by Bucket)
                        </CardTitle>
                    </CardHeader>
                    <CardContent class="flex-1 flex items-center justify-center p-6 pt-0 min-h-0">
                        <Doughnut v-if="distributionData" :data="distributionData" :options="doughnutOptions" />
                        <div v-else class="flex flex-col items-center opacity-20 animate-pulse">
                            <PieChart class="w-12 h-12" />
                            <span class="text-xs italic">Gathering distribution data...</span>
                        </div>
                    </CardContent>
                </Card>

                <!-- REQUEST TRENDS -->
                <Card class="border-slate-200 dark:border-slate-800 flex flex-col shadow-sm">
                    <CardHeader>
                        <CardTitle class="text-sm font-bold flex items-center gap-2">
                            <TrendingUp class="w-4 h-4 text-primary" />
                            Request Trends (Last 30 Days)
                        </CardTitle>
                    </CardHeader>
                    <CardContent class="flex-1 p-6 pt-0 min-h-0">
                        <Line v-if="trendsData" :data="trendsData" :options="lineOptions" />
                        <div v-else class="flex h-full items-center justify-center opacity-20">
                            <Activity class="w-12 h-12" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <!-- BUCKET GROWTH -->
            <Card class="border-slate-200 dark:border-slate-800 shadow-sm h-[400px]">
                <CardHeader>
                    <CardTitle class="text-sm font-bold flex items-center gap-2">
                        <LineChart class="w-4 h-4 text-primary" />
                        Historical Growth (Capacity Trajectory)
                    </CardTitle>
                </CardHeader>
                <CardContent class="h-full pb-12 p-6 pt-0">
                    <Line v-if="growthData" :data="growthData" :options="growthOptions" />
                    <div v-else class="flex h-full items-center justify-center opacity-20">
                        <Database class="w-12 h-12" />
                    </div>
                </CardContent>
            </Card>
        </main>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import {
    RefreshCw, TrendingUp, Database, Activity, User, Pizza,
    PieChart, LineChart, FileUp, Download, Trash2
} from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'

// Chart.js registration
import {
    Chart as ChartJS,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    LineElement,
    PointElement,
    LinearScale,
    CategoryScale,
    Filler
} from 'chart.js'
import { Doughnut, Line } from 'vue-chartjs'

ChartJS.register(
    Title, Tooltip, Legend, ArcElement, LineElement,
    PointElement, LinearScale, CategoryScale, Filler
)

const { authFetch } = useAuth()
const config = useRuntimeConfig()
const API_BASE = config.public.apiBase

const loading = ref(false)
const stats = ref({})
const rawStorageHistory = ref([])
const rawRequestTrends = ref({})

const topStats = computed(() => [
    { label: 'Total Objects', value: stats.value.total_objects || 0, icon: Database, sub: 'Currently stored' },
    { label: 'Total Capacity', value: formatSize(stats.value.total_size || 0), icon: Activity, sub: 'Across all buckets' },
    { label: 'Total Users', value: stats.value.total_users || 0, icon: User, sub: 'IAM identities' },
    { label: 'Uptime', value: stats.value.uptime ? stats.value.uptime.split('.')[0] + 's' : '0s', icon: RefreshCw, sub: 'Server stability' }
])

const distributionData = computed(() => {
    if (!rawStorageHistory.value || rawStorageHistory.value.length === 0) return null

    // Use the latest snapshot per bucket
    const buckets = {}
    rawStorageHistory.value.forEach(s => {
        buckets[s.Bucket] = s.Size
    })

    const labels = Object.keys(buckets)
    if (labels.length === 0) return null

    return {
        labels,
        datasets: [{
            data: Object.values(buckets),
            backgroundColor: [
                '#6366f1', '#a855f7', '#ec4899', '#f43f5e',
                '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'
            ],
            borderWidth: 0,
            hoverOffset: 15
        }]
    }
})

const trendsData = computed(() => {
    if (!rawRequestTrends.value || Object.keys(rawRequestTrends.value).length === 0) return null

    // Get union of all days
    const days = new Set()
    Object.values(rawRequestTrends.value).forEach(actionDays => {
        actionDays.forEach(d => days.add(d.day))
    })
    const sortedDays = Array.from(days).sort()

    const datasets = []
    const actionConfig = {
        'ObjectCreated:Put': { label: 'Uploads', color: '#10b981' },
        'ObjectRemoved:Delete': { label: 'Deletions', color: '#ef4444' }
    }

    Object.entries(rawRequestTrends.value).forEach(([action, data]) => {
        if (!actionConfig[action]) return

        const counts = sortedDays.map(day => {
            const match = data.find(d => d.day === day)
            return match ? match.count : 0
        })

        datasets.push({
            label: actionConfig[action].label,
            data: counts,
            borderColor: actionConfig[action].color,
            backgroundColor: actionConfig[action].color + '20',
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 6
        })
    })

    return { datasets, labels: sortedDays.map(d => d.split('-').slice(1).join('/')) }
})

const growthData = computed(() => {
    if (!rawStorageHistory.value || rawStorageHistory.value.length === 0) return null

    const days = Array.from(new Set(rawStorageHistory.value.map(s => s.Timestamp.split('T')[0]))).sort()
    const buckets = Array.from(new Set(rawStorageHistory.value.map(s => s.Bucket)))

    const datasets = buckets.map((bucket, i) => {
        const data = days.map(day => {
            const match = rawStorageHistory.value.find(s => s.Bucket === bucket && s.Timestamp.startsWith(day))
            return match ? match.Size : 0
        })

        const colors = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981']

        return {
            label: bucket,
            data: data,
            borderColor: colors[i % colors.length],
            borderWidth: 2,
            tension: 0.1,
            pointRadius: 0
        }
    })

    return { datasets, labels: days }
})

const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 15, font: { size: 10 } } }
    }
}

const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false }
    },
    scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: { stepSize: 1, font: { size: 9 } }
        }
    }
}

const growthOptions = {
    ...lineOptions,
    plugins: {
        legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } }
    },
    scales: {
        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
        y: {
            grid: { color: 'rgba(0,0,0,0.05)' },
            ticks: {
                callback: (val) => formatSize(val),
                font: { size: 9 }
            }
        }
    }
}

async function fetchAllData() {
    loading.value = true
    try {
        const [statsRes, storageRes, trendsRes] = await Promise.all([
            authFetch(`${API_BASE}/admin/stats`),
            authFetch(`${API_BASE}/admin/analytics/storage?days=30`),
            authFetch(`${API_BASE}/admin/analytics/requests?days=30`)
        ])

        if (statsRes.ok) stats.value = (await statsRes.json()) || {}
        if (storageRes.ok) rawStorageHistory.value = (await storageRes.json()) || []
        if (trendsRes.ok) rawRequestTrends.value = (await trendsRes.json()) || {}
    } catch (e) {
        console.error('Failed to sync analytics', e)
    } finally {
        loading.value = false
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(() => {
    fetchAllData()
})
</script>
