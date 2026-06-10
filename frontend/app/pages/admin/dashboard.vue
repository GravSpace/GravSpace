<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <h1 class="text-lg font-semibold tracking-tight">Dashboard</h1>
                <p class="text-xs text-muted-foreground">Historical trends and storage distribution</p>
            </div>
            <div class="flex items-center gap-3">
                <!-- WS Status indicator in header -->
                <div class="flex items-center gap-1.5 select-none">
                    <span class="relative flex h-2 w-2">
                        <span :class="[
                            'absolute inline-flex h-full w-full rounded-full opacity-75',
                            wsStatus === 'connected' ? 'animate-ping bg-emerald-400' : '',
                            wsStatus === 'connecting' ? 'animate-ping bg-amber-400' : '',
                            wsStatus === 'disconnected' ? 'bg-rose-400' : ''
                        ]"></span>
                        <span :class="[
                            'relative inline-flex rounded-full h-2 w-2',
                            wsStatus === 'connected' ? 'bg-emerald-500' : '',
                            wsStatus === 'connecting' ? 'bg-amber-500' : '',
                            wsStatus === 'disconnected' ? 'bg-rose-500' : ''
                        ]"></span>
                    </span>
                    <span :class="[
                        'text-[9px] uppercase tracking-widest font-bold',
                        wsStatus === 'connected' ? 'text-emerald-500' : '',
                        wsStatus === 'connecting' ? 'text-amber-500' : '',
                        wsStatus === 'disconnected' ? 'text-rose-500' : ''
                    ]">{{ wsStatus }}</span>
                </div>
                <Button variant="outline" size="sm" @click="fetchAllData" :disabled="loading"
                    class="h-8 border-slate-200 dark:border-slate-800">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': loading }" />
                    Sync
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto p-5 space-y-4">
            <!-- TOP STATS ROW -->
            <div class="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <div v-for="(stat, i) in topStats" :key="stat.label"
                    class="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-4 shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300">
                    <!-- Colored accent line at top -->
                    <div class="absolute top-0 left-0 right-0 h-0.5" :class="[
                        i === 0 ? 'bg-indigo-500' : '',
                        i === 1 ? 'bg-sky-500' : '',
                        i === 2 ? 'bg-violet-500' : '',
                        i === 3 ? 'bg-emerald-500' : ''
                    ]"></div>
                    <div class="flex items-center justify-between mb-2">
                        <span
                            class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{{ stat.label }}</span>
                        <div :class="[
                            'h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-200',
                            i === 0 ? 'bg-indigo-500/10 text-indigo-500' : '',
                            i === 1 ? 'bg-sky-500/10 text-sky-500' : '',
                            i === 2 ? 'bg-violet-500/10 text-violet-500' : '',
                            i === 3 ? 'bg-emerald-500/10 text-emerald-500' : ''
                        ]">
                            <component :is="stat.icon"
                                class="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
                        </div>
                    </div>
                    <div class="text-xl font-bold tracking-tight">{{ stat.value }}</div>
                    <p class="text-[10px] text-muted-foreground mt-0.5 opacity-60">{{ stat.sub }}</p>
                </div>
            </div>

            <!-- CHARTS: 2-COLUMN LAYOUT -->
            <div class="grid gap-4 lg:grid-cols-2">
                <!-- Left Column: Doughnuts side by side -->
                <div class="grid gap-3 grid-cols-2">
                    <!-- Storage Distribution -->
                    <div
                        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
                        <div class="px-4 pt-3 pb-1.5">
                            <div class="flex items-center gap-1.5">
                                <Pizza class="w-3.5 h-3.5 text-primary" />
                                <span class="text-xs font-bold tracking-tight">By Bucket</span>
                            </div>
                        </div>
                        <div class="flex-1 flex items-center justify-center px-4 pb-3 min-h-[180px]">
                            <Doughnut v-if="distributionData" :data="distributionData" :options="doughnutOptions" />
                            <div v-else class="flex flex-col items-center opacity-20 animate-pulse">
                                <PieChart class="w-10 h-10" />
                                <span class="text-[9px] italic mt-1">Loading...</span>
                            </div>
                        </div>
                    </div>

                    <!-- Content-Type Breakdown -->
                    <div
                        class="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
                        <div class="px-4 pt-3 pb-1.5">
                            <div class="flex items-center gap-1.5">
                                <PieChart class="w-3.5 h-3.5 text-primary" />
                                <span class="text-xs font-bold tracking-tight">By Type</span>
                            </div>
                        </div>
                        <div class="flex-1 flex items-center justify-center px-4 pb-3 min-h-[180px]">
                            <Doughnut v-if="contentTypeData" :data="contentTypeData" :options="contentTypeOptions" />
                            <div v-else class="flex flex-col items-center opacity-20 animate-pulse">
                                <PieChart class="w-10 h-10" />
                                <span class="text-[9px] italic mt-1">Loading...</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right Column: Request Trends -->
                <div
                    class="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
                    <div class="px-4 pt-3 pb-1.5 flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                            <TrendingUp class="w-3.5 h-3.5 text-primary" />
                            <span class="text-xs font-bold tracking-tight">Request Trends</span>
                        </div>
                        <span class="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Last 30
                            days</span>
                    </div>
                    <div class="flex-1 px-4 pb-3 min-h-[180px]">
                        <Line v-if="trendsData" :data="trendsData" :options="lineOptions" />
                        <div v-else class="flex h-full items-center justify-center opacity-20">
                            <Activity class="w-10 h-10" />
                        </div>
                    </div>
                </div>
            </div>

            <!-- GROWTH + AUDIT: 2-COLUMN LAYOUT -->
            <div class="grid gap-4 lg:grid-cols-5">
                <!-- Historical Growth (wider) -->
                <div
                    class="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col h-[320px]">
                    <div class="px-4 pt-3 pb-1.5 flex items-center justify-between">
                        <div class="flex items-center gap-1.5">
                            <LineChart class="w-3.5 h-3.5 text-primary" />
                            <span class="text-xs font-bold tracking-tight">Capacity Trajectory</span>
                        </div>
                        <span class="text-[9px] text-muted-foreground font-medium uppercase tracking-wider">Historical
                            growth</span>
                    </div>
                    <div class="flex-1 px-4 pb-3 min-h-0">
                        <Line v-if="growthData" :data="growthData" :options="growthOptions" />
                        <div v-else class="flex h-full items-center justify-center opacity-20">
                            <Database class="w-10 h-10" />
                        </div>
                    </div>
                </div>

                <!-- Live Audit Trail (narrower) -->
                <div
                    class="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col h-[320px]">
                    <div
                        class="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 shrink-0">
                        <div class="flex items-center gap-1.5">
                            <Activity class="w-3.5 h-3.5 text-primary" />
                            <span class="text-xs font-bold tracking-tight">Live Audit</span>
                        </div>
                        <Button variant="ghost" size="xs" @click="auditLogs = []"
                            class="h-6 text-[9px] uppercase font-bold tracking-wider text-muted-foreground hover:text-foreground px-2">
                            Clear
                        </Button>
                    </div>
                    <div
                        class="flex-1 bg-slate-950 p-3 font-mono text-[10px] leading-4 text-slate-300 overflow-y-auto custom-scrollbar select-text min-h-0">
                        <div v-if="auditLogs.length === 0"
                            class="flex flex-col items-center justify-center h-full text-slate-600 select-none">
                            <Activity class="w-6 h-6 opacity-20 mb-1.5 animate-pulse" />
                            <span class="text-[10px] italic">Waiting for events...</span>
                        </div>
                        <div v-else class="space-y-0.5">
                            <div v-for="(log, idx) in auditLogs" :key="idx"
                                class="flex items-start gap-2 hover:bg-white/5 py-0.5 px-1 rounded transition-colors">
                                <span class="text-slate-600 select-none shrink-0 w-[52px]">{{ new
                                    Date(log.timestamp).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit',
                                        second: '2-digit' }) }}</span>
                                <span :class="[
                                    'px-1 py-0 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 leading-4',
                                    log.result === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                ]">{{ log.action.split(':').pop() }}</span>
                                <span class="text-slate-500 truncate flex-1" :title="log.resource">{{ log.resource
                                }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- BUCKET QUOTAS -->
            <div v-if="bucketsInfo && bucketsInfo.length > 0"
                class="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden">
                <div class="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div class="flex items-center gap-1.5">
                        <ShieldAlert class="w-3.5 h-3.5 text-primary" />
                        <span class="text-xs font-bold tracking-tight">Bucket Quotas & Capacity</span>
                    </div>
                    <span class="text-[9px] text-muted-foreground font-medium">{{ bucketsInfo.length }}
                        {{ bucketsInfo.length === 1 ? 'bucket' : 'buckets' }}</span>
                </div>
                <div class="px-4 pb-4">
                    <div class="space-y-2">
                        <div v-for="b in bucketsInfo" :key="b.Name"
                            class="flex items-center gap-4 p-3 rounded-lg border border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/30 hover:border-primary/20 transition-colors">
                            <!-- Bucket name + icon -->
                            <div class="flex items-center gap-2.5 min-w-0 w-[180px] shrink-0">
                                <div
                                    class="h-7 w-7 rounded-md bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                                    <Database class="w-3.5 h-3.5" />
                                </div>
                                <span
                                    class="font-bold text-xs text-slate-800 dark:text-slate-200 font-mono truncate">{{ b.Name }}</span>
                            </div>

                            <!-- Progress bar -->
                            <div class="flex-1 flex items-center gap-3 min-w-0">
                                <div class="flex-1 space-y-1">
                                    <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div class="h-full rounded-full transition-all duration-500"
                                            :class="getQuotaProgressColor(b.CurrentSize, b.QuotaBytes)"
                                            :style="{ width: getQuotaPercent(b.CurrentSize, b.QuotaBytes) + '%' }">
                                        </div>
                                    </div>
                                    <div class="flex justify-between text-[9px] text-muted-foreground">
                                        <span>{{ formatSize(b.CurrentSize) }}</span>
                                        <span>{{ b.QuotaBytes > 0 ? formatSize(b.QuotaBytes) : 'Unlimited' }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Status badge -->
                            <div class="shrink-0">
                                <Badge v-if="b.QuotaBytes > 0 && (b.CurrentSize / b.QuotaBytes) >= 0.9"
                                    variant="destructive"
                                    class="text-[8px] uppercase font-bold h-5 px-1.5 animate-pulse">
                                    Critical
                                </Badge>
                                <Badge
                                    v-else-if="b.QuotaBytes > 0 && (b.CurrentSize / b.QuotaBytes) >= 0.75"
                                    variant="outline"
                                    class="text-[8px] uppercase font-bold h-5 px-1.5 border-amber-500/30 text-amber-500 bg-amber-500/5">
                                    Warning
                                </Badge>
                                <Badge v-else variant="outline"
                                    class="text-[8px] uppercase font-bold h-5 px-1.5 border-emerald-500/20 text-emerald-500 bg-emerald-500/5">
                                    Healthy
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

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
import { Badge } from '@/components/ui/badge'
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

const { authState, authFetch } = useAuth()
const config = useRuntimeConfig()
const API_BASE = config.public.apiBase

const loading = ref(false)
const stats = ref({})
const rawStorageHistory = ref([])
const rawRequestTrends = ref({})
const rawContentTypeBreakdown = ref([])
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
            hoverOffset: 10
        }]
    }
})

const contentTypeData = computed(() => {
    if (!rawContentTypeBreakdown.value || rawContentTypeBreakdown.value.length === 0) return null

    const labels = rawContentTypeBreakdown.value.map(item => item.category)
    const sizes = rawContentTypeBreakdown.value.map(item => item.totalSize)
    if (labels.length === 0) return null

    return {
        labels,
        datasets: [{
            data: sizes,
            backgroundColor: [
                '#3b82f6', '#10b981', '#f59e0b', '#6366f1',
                '#8b5cf6', '#ec4899', '#64748b'
            ],
            borderWidth: 0,
            hoverOffset: 10
        }]
    }
})

const contentTypeOptions = computed(() => ({
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 8, padding: 8, font: { size: 9 } } },
        tooltip: {
            callbacks: {
                label: (context) => {
                    const value = context.raw
                    return ` ${context.label}: ${formatSize(value)}`
                }
            }
        }
    }
}))

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
            backgroundColor: actionConfig[action].color + '15',
            fill: true,
            tension: 0.4,
            pointRadius: 1.5,
            pointHoverRadius: 5,
            borderWidth: 1.5
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
            borderWidth: 1.5,
            tension: 0.3,
            pointRadius: 2,
            fill: true
        }
    })

    return { datasets, labels: allDates.map(d => d.split('-').slice(1).join('/')) }
})

const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 8, padding: 8, font: { size: 9 } } }
    }
}

const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 8, padding: 12, font: { size: 9 } } }
    },
    scales: {
        x: { grid: { display: false }, ticks: { font: { size: 8 }, maxTicksLimit: 10 } },
        y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: { stepSize: 1, font: { size: 8 } }
        }
    }
}

const growthOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { position: 'top', align: 'end', labels: { boxWidth: 8, padding: 12, font: { size: 9 } } }
    },
    scales: {
        x: { grid: { display: false }, ticks: { font: { size: 8 }, maxTicksLimit: 10 } },
        y: {
            grid: { color: 'rgba(0,0,0,0.04)' },
            ticks: {
                callback: (val) => formatSize(val),
                font: { size: 8 }
            }
        }
    }
}

async function fetchAllData() {
    loading.value = true
    try {
        const [statsRes, storageRes, trendsRes, bucketsRes, contentTypeRes] = await Promise.all([
            authFetch(`${API_BASE}/admin/stats`),
            authFetch(`${API_BASE}/admin/analytics/storage?days=30`),
            authFetch(`${API_BASE}/admin/analytics/requests?days=30`),
            authFetch(`${API_BASE}/admin/buckets`),
            authFetch(`${API_BASE}/admin/analytics/content-types`)
        ])

        if (contentTypeRes && contentTypeRes.ok) {
            rawContentTypeBreakdown.value = (await contentTypeRes.json()) || []
        }

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

const wsStatus = ref('disconnected')
const auditLogs = ref([])
let wsConn = null

function connectWS() {
    if (wsConn) {
        try {
            wsConn.close()
        } catch(e){}
    }

    wsStatus.value = 'connecting'
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const token = authState.value?.token || ''

    let wsUrl = ''
    if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
        const host = API_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '')
        wsUrl = `${protocol}//${host}/admin/audit/stream`
    } else {
        // API_BASE is relative (e.g. /api or /)
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            // Local dev environment: connect directly to Go backend on port 8080
            wsUrl = `${protocol}//localhost:8080/admin/audit/stream`
        } else {
            // Production: connect relative to current host
            const cleanApiBase = API_BASE.startsWith('/') ? API_BASE : '/' + API_BASE
            const host = window.location.host + cleanApiBase.replace(/\/$/, '')
            wsUrl = `${protocol}//${host}/admin/audit/stream`
        }
    }

    wsConn = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`)

    wsConn.onopen = () => {
        wsStatus.value = 'connected'
    }

    wsConn.onmessage = (event) => {
        try {
            const logEntry = JSON.parse(event.data)
            auditLogs.value.push(logEntry)
            if (auditLogs.value.length > 50) {
                auditLogs.value.shift()
            }
        } catch (e) {
            console.error('Failed to parse audit event:', e)
        }
    }

    wsConn.onclose = () => {
        wsStatus.value = 'disconnected'
        setTimeout(() => {
            if (wsConn && wsConn.readyState === WebSocket.CLOSED) {
                connectWS()
            }
        }, 3000)
    }

    wsConn.onerror = () => {
        wsStatus.value = 'disconnected'
    }
}

onMounted(() => {
    fetchAllData()
    connectWS()
})

onUnmounted(() => {
    if (wsConn) {
        wsConn.close()
    }
})
</script>
