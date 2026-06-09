<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Dashboard</h1>
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

            <!-- BUCKET QUOTAS & CAPACITY ALERTS -->
            <Card class="border-slate-200 dark:border-slate-800 shadow-sm">
                <CardHeader>
                    <CardTitle class="text-sm font-bold flex items-center gap-2">
                        <ShieldAlert class="w-4 h-4 text-primary" />
                        Bucket Quotas & Capacity Warnings
                    </CardTitle>
                </CardHeader>
                <CardContent class="p-6 pt-0">
                    <div v-if="!bucketsInfo || bucketsInfo.length === 0" class="text-center py-6 text-xs text-muted-foreground">
                        No buckets configured.
                    </div>
                    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <div v-for="b in bucketsInfo" :key="b.Name" 
                            class="p-4 rounded-xl border bg-card hover:border-primary/30 transition-all flex flex-col justify-between gap-3">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <div class="h-8 w-8 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                                        <Database class="w-4 h-4" />
                                    </div>
                                    <span class="font-bold text-sm text-slate-800 dark:text-slate-200 font-mono">{{ b.Name }}</span>
                                </div>
                                <Badge v-if="b.QuotaBytes > 0 && (b.CurrentSize / b.QuotaBytes) >= 0.9" variant="destructive" class="text-[9px] uppercase font-bold animate-pulse">
                                    Critical
                                </Badge>
                                <Badge v-else-if="b.QuotaBytes > 0 && (b.CurrentSize / b.QuotaBytes) >= 0.75" variant="warning" class="text-[9px] uppercase font-bold">
                                    Warning
                                </Badge>
                                <Badge v-else variant="outline" class="text-[9px] uppercase font-semibold text-emerald-500 border-emerald-500/20 bg-emerald-500/5">
                                    Healthy
                                </Badge>
                            </div>
                            
                            <div class="space-y-1">
                                <div class="flex justify-between text-[10px] text-muted-foreground">
                                    <span>Usage: {{ formatSize(b.CurrentSize) }}</span>
                                    <span>Quota: {{ b.QuotaBytes > 0 ? formatSize(b.QuotaBytes) : 'Unlimited' }}</span>
                                </div>
                                <div class="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div class="h-full rounded-full transition-all duration-300"
                                        :class="getQuotaProgressColor(b.CurrentSize, b.QuotaBytes)"
                                        :style="{ width: getQuotaPercent(b.CurrentSize, b.QuotaBytes) + '%' }">
                                    </div>
                                </div>
                                <div class="flex justify-between items-center text-[9px] mt-1">
                                    <span class="text-muted-foreground">{{ getQuotaPercent(b.CurrentSize, b.QuotaBytes) }}% utilized</span>
                                    <span v-if="b.QuotaBytes > 0 && b.CurrentSize >= b.QuotaBytes" class="text-rose-500 font-bold">Quota exceeded!</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </main>
    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'

useSeoMeta({
    title: 'Analytics Dashboard | GravSpace',
    description: 'Monitor real-time storage metrics, historical trends, and data distribution across your buckets.',
})
import {
    RefreshCw, TrendingUp, Database, Activity, User, Pizza,
    PieChart, LineChart, FileUp, Download, Trash2, ShieldAlert
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
const bucketsInfo = ref([])

function formatSavings(logical, physical) {
    if (!logical || logical <= 0) return '0 B (0%)'
    const diff = logical - physical
    if (diff <= 0) return '0 B (0%)'
    const percent = Math.min(100, Math.round((diff / logical) * 100))
    return `${formatSize(diff)} (${percent}%)`
}

function getQuotaPercent(current, quota) {
    if (!quota || quota <= 0) return 0
    return Math.min(100, Math.round((current / quota) * 100))
}

function getQuotaProgressColor(current, quota) {
    if (!quota || quota <= 0) return 'bg-emerald-500'
    const pct = current / quota
    if (pct >= 0.9) return 'bg-rose-500'
    if (pct >= 0.75) return 'bg-amber-500'
    return 'bg-emerald-500'
}

const topStats = computed(() => [
    { label: 'Total Objects', value: stats.value.total_objects || 0, icon: Database, sub: stats.value.deduplicated_count ? `${stats.value.deduplicated_count} deduplicated` : 'No duplicates' },
    { label: 'Logical Capacity', value: formatSize(stats.value.total_size || 0), icon: Activity, sub: 'Virtual S3 size' },
    { label: 'Physical Disk Space', value: formatSize(stats.value.physical_size || 0), icon: Database, sub: 'Actual space used' },
    { label: 'Storage Saved', value: formatSavings(stats.value.total_size, stats.value.physical_size), icon: FileUp, sub: 'Deduplication + Gzip' }
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
        's3:PutObject': { label: 'Uploads', color: '#10b981' },
        's3:DeleteObject': { label: 'Deletions', color: '#ef4444' },
        's3:GetObject': { label: 'Downloads', color: '#3b82f6' }
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

    // Get all unique dates from snapshots and sort them
    const allDates = Array.from(new Set(rawStorageHistory.value.map(s => {
        // Handle both ISO strings and SQLite dates
        const date = s.Timestamp.includes('T') ? s.Timestamp.split('T')[0] : s.Timestamp.split(' ')[0]
        return date
    }))).sort()

    const buckets = Array.from(new Set(rawStorageHistory.value.map(s => s.Bucket)))

    const datasets = buckets.map((bucket, i) => {
        const data = allDates.map(day => {
            const match = rawStorageHistory.value.find(s => s.Bucket === bucket && s.Timestamp.startsWith(day))
            return match ? match.Size : 0
        })

        const colors = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6']

        return {
            label: bucket,
            data: data,
            borderColor: colors[i % colors.length],
            backgroundColor: colors[i % colors.length] + '10',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            fill: true
        }
    })

    return { datasets, labels: allDates.map(d => d.split('-').slice(1).join('/')) }
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
        const [statsRes, storageRes, trendsRes, bucketsRes] = await Promise.all([
            authFetch(`${API_BASE}/admin/stats`),
            authFetch(`${API_BASE}/admin/analytics/storage?days=30`),
            authFetch(`${API_BASE}/admin/analytics/requests?days=30`),
            authFetch(`${API_BASE}/admin/buckets`)
        ])

        if (statsRes.ok) stats.value = (await statsRes.json()) || {}
        if (storageRes.ok) rawStorageHistory.value = (await storageRes.json()) || []
        if (trendsRes.ok) rawRequestTrends.value = (await trendsRes.json()) || {}
        
        if (bucketsRes.ok) {
            const bucketNames = (await bucketsRes.json()) || []
            const details = await Promise.all(bucketNames.map(async name => {
                try {
                    const infoRes = await authFetch(`${API_BASE}/admin/buckets/${name}/info`)
                    if (infoRes.ok) return await infoRes.json()
                } catch (err) {
                    console.error(`Failed to fetch bucket info for ${name}`, err)
                }
                return null
            }))
            bucketsInfo.value = details.filter(Boolean)
        }
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
