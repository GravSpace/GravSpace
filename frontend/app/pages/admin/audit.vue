<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h1 class="text-xl font-bold tracking-tight">Audit Logs</h1>
                <p class="text-xs text-muted-foreground">Compliance and security event history</p>
            </div>
            <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="fetchLogs" :disabled="loading" class="h-9">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': loading }" />
                    Refresh
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto p-6">
            <Card class="border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                <Table>
                    <TableHeader class="bg-muted/30 sticky top-0 z-10">
                        <TableRow>
                            <TableHead class="w-[200px] bg-muted/30">Timestamp</TableHead>
                            <TableHead class="w-[140px] bg-muted/30">User</TableHead>
                            <TableHead class="w-[180px] bg-muted/30">Action</TableHead>
                            <TableHead class="bg-muted/30">Resource</TableHead>
                            <TableHead class="w-[100px] bg-muted/30 text-center">Result</TableHead>
                            <TableHead class="w-[140px] bg-muted/30">Origin</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        <TableRow v-for="log in logs" :key="log.ID" class="group hover:bg-muted/40 transition-colors">
                            <TableCell class="text-[10px] font-mono text-muted-foreground">
                                {{ new Date(log.Timestamp).toLocaleString() }}
                            </TableCell>
                            <TableCell>
                                <div class="flex items-center gap-2">
                                    <div
                                        class="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                        {{ log.Username ? log.Username.substring(0, 2).toUpperCase() : '??' }}
                                    </div>
                                    <span class="text-xs font-semibold truncate">{{ log.Username || 'anonymous'
                                    }}</span>
                                </div>
                            </TableCell>
                            <TableCell>
                                <Badge variant="secondary"
                                    class="text-[9px] py-0 h-4 font-mono uppercase tracking-tighter bg-slate-100 dark:bg-slate-800">
                                    {{ log.Action }}
                                </Badge>
                            </TableCell>
                            <TableCell class="text-[11px] font-medium truncate max-w-[250px]" :title="log.Resource">
                                {{ log.Resource || '-' }}
                            </TableCell>
                            <TableCell class="text-center">
                                <Badge :variant="log.Result === 'success' ? 'success' : 'destructive'"
                                    class="text-[9px] uppercase px-1.5 h-4 font-bold">
                                    {{ log.Result }}
                                </Badge>
                            </TableCell>
                            <TableCell class="text-[10px] font-mono text-muted-foreground italic">
                                {{ log.IP }}
                            </TableCell>
                        </TableRow>

                        <TableRow v-if="!logs || logs.length === 0 && !loading">
                            <TableCell colspan="6" class="h-64 text-center">
                                <div class="flex flex-col items-center justify-center gap-3 opacity-20">
                                    <ShieldOff class="w-12 h-12" />
                                    <div class="space-y-1">
                                        <p class="text-sm font-bold">Safe and Sound</p>
                                        <p class="text-xs">No audit events recorded yet.</p>
                                    </div>
                                </div>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </Card>

            <div class="flex items-center justify-between mt-6 px-2">
                <div class="flex flex-col gap-1">
                    <p class="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Compliance Status
                    </p>
                    <div class="flex items-center gap-2">
                        <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span class="text-[11px] font-semibold italic">Real-time logging active</span>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="text-[11px] text-muted-foreground">Showing {{ offset + 1 }}-{{ offset + (logs?.length
                        || 0)
                        }}</span>
                    <div class="flex gap-1">
                        <Button variant="outline" size="sm" :disabled="offset === 0" @click="prevPage"
                            class="h-8 w-8 p-0 border-slate-200">
                            <ChevronLeft class="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm" :disabled="!logs || logs.length < limit" @click="nextPage"
                            class="h-8 w-8 p-0 border-slate-200">
                            <ChevronRight class="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>
        </main>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RefreshCw, ShieldOff, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'

const { authFetch } = useAuth()
const config = useRuntimeConfig()
const API_BASE = config.public.apiBase

const logs = ref([])
const loading = ref(false)
const limit = ref(50)
const offset = ref(0)

async function fetchLogs() {
    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/audit-logs?limit=${limit.value}&offset=${offset.value}`)
        if (res.ok) {
            logs.value = (await res.json()) || []
        }
    } catch (e) {
        console.error('Failed to fetch audit logs', e)
    } finally {
        loading.value = false
    }
}

function nextPage() {
    offset.value += limit.value
    fetchLogs()
}

function prevPage() {
    offset.value = Math.max(0, offset.value - limit.value)
    fetchLogs()
}

onMounted(() => {
    fetchLogs()
})
</script>
