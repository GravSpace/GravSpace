<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50 font-geist">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <div class="flex items-center gap-2">
                    <Trash2 class="w-5 h-5 text-rose-500" />
                    <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Global Recycle Bin
                    </h1>
                </div>
                <p class="text-xs text-muted-foreground mt-0.5">Recover or permanently delete objects across all buckets
                </p>
            </div>
            <div class="flex items-center gap-3">
                <div v-if="selectedItems.length > 0"
                    class="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20 animate-in fade-in zoom-in duration-200">
                    <span class="text-xs font-bold text-primary mr-2">{{ selectedItems.length }} selected</span>
                    <Button variant="ghost" size="sm" @click="bulkRestore"
                        class="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-[10px] font-bold uppercase transition-all">
                        <Undo2 class="w-3.5 h-3.5 mr-1" />
                        Restore
                    </Button>
                    <div class="w-px h-3 bg-primary/20"></div>
                    <Button variant="ghost" size="sm" @click="bulkDelete"
                        class="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[10px] font-bold uppercase transition-all">
                        <Trash class="w-3.5 h-3.5 mr-1" />
                        Delete
                    </Button>
                </div>

                <Select v-model="selectedBucket">
                    <SelectTrigger class="w-[180px] h-9 bg-card">
                        <SelectValue placeholder="All Buckets" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Buckets</SelectItem>
                        <SelectItem v-for="b in buckets" :key="b" :value="b">{{ b }}</SelectItem>
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" @click="fetchTrash" :disabled="loading" class="h-9">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': loading }" />
                    Refresh
                </Button>
                <div class="w-px h-4 bg-border mx-1"></div>
                <Button variant="destructive" size="sm" @click="emptyTrash" :disabled="loading || items.length === 0"
                    class="h-9">
                    <Trash2 class="w-3.5 h-3.5 mr-2" />
                    Empty Trash {{ selectedBucket !== 'all' ? `(${selectedBucket})` : '' }}
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto p-6">
            <div v-if="loading && items.length === 0" class="flex flex-col items-center justify-center h-64 opacity-50">
                <Loader2 class="w-8 h-8 animate-spin text-primary mb-4" />
                <p class="text-sm font-medium animate-pulse">Scanning trash storage...</p>
            </div>

            <template v-else>
                <div v-if="items.length > 0" class="border rounded-xl bg-card shadow-sm overflow-hidden">
                    <Table>
                        <TableHeader class="bg-muted/50">
                            <TableRow>
                                <TableHead class="w-10">
                                    <Checkbox :checked="isAllSelected" @update:checked="toggleSelectAll"
                                        aria-label="Select all" />
                                </TableHead>
                                <TableHead class="w-[30%] py-4">Key</TableHead>
                                <TableHead>Bucket</TableHead>
                                <TableHead>Deleted At</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead class="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="item in filteredItems" :key="item.ID"
                                class="group hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors"
                                :class="{ 'bg-primary/5': isSelected(item) }">
                                <TableCell>
                                    <Checkbox :checked="isSelected(item)" @update:checked="toggleSelection(item)"
                                        aria-label="Select item" />
                                </TableCell>
                                <TableCell class="font-medium">
                                    <div class="flex items-center gap-2.5">
                                        <div
                                            class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors shadow-xs">
                                            <FileText
                                                class="w-4 h-4 text-slate-500 group-hover:text-primary transition-colors" />
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="text-sm tracking-tight truncate max-w-[200px]">{{ item.Key
                                                }}</span>
                                            <span
                                                class="text-[10px] text-muted-foreground font-mono opacity-60 group-hover:opacity-100 transition-opacity">v{{
                                                    item.VersionID }}</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline"
                                        class="bg-primary/5 text-primary border-primary/20 text-[10px] font-bold tracking-wide uppercase px-2 py-0">
                                        {{ item.Bucket }}
                                    </Badge>
                                </TableCell>
                                <TableCell class="text-sm text-slate-600 dark:text-slate-400">
                                    {{ formatDate(item.DeletedAt) }}
                                </TableCell>
                                <TableCell class="text-sm font-medium text-slate-600 dark:text-slate-400 font-mono">
                                    {{ formatSize(item.Size) }}
                                </TableCell>
                                <TableCell class="text-right">
                                    <div
                                        class="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="sm"
                                            class="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                                            title="Restore Object" @click="restoreItem(item)">
                                            <Undo2 class="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm"
                                            class="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg"
                                            title="Delete Permanently" @click="deletePermanently(item)">
                                            <Trash class="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                <div v-else
                    class="flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-2xl bg-slate-50/50 dark:bg-slate-900/10">
                    <div
                        class="bg-card w-16 h-16 flex items-center justify-center rounded-2xl shadow-sm mb-6 border border-slate-100 dark:border-slate-800">
                        <Trash2 class="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 class="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Trash is empty</h3>
                    <p class="text-muted-foreground text-center max-w-sm mb-6">Objects deleted from buckets with Soft
                        Delete enabled will appear here for recovery.</p>
                    <Button variant="outline" @click="fetchTrash">
                        <RefreshCw class="w-4 h-4 mr-2" />
                        Check Again
                    </Button>
                </div>
            </template>
        </main>

        <Dialog :open="showPasswordDialog" @update:open="showPasswordDialog = false">
            <DialogContent class="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle class="flex items-center gap-2">
                        <Lock class="w-5 h-5 text-rose-500" />
                        Security Verification
                    </DialogTitle>
                    <DialogDescription>
                        This is a destructive action. Please enter your administrator password to confirm.
                    </DialogDescription>
                </DialogHeader>
                <div class="grid gap-4 py-4">
                    <div class="flex flex-col gap-2">
                        <Label htmlFor="password">Password</Label>
                        <Input id="password" type="password" v-model="passwordInput" placeholder="Enter admin password"
                            @keyup.enter="verifyAndProceed" />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" @click="showPasswordDialog = false">Cancel</Button>
                    <Button type="submit" @click="verifyAndProceed" :disabled="isVerifying || !passwordInput">
                        <Loader2 v-if="isVerifying" class="w-4 h-4 mr-2 animate-spin" />
                        Verify & Proceed
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import {
    Trash2, RefreshCw, Loader2, FileText, Undo2, Trash,
    Search, Filter, Database, Calendar, Lock
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatDistanceToNow, format } from 'date-fns'
import { useAuth } from '@/composables/useAuth'

useSeoMeta({
    title: 'Recycle Bin | GravSpace',
    description: 'Manage soft-deleted objects and recover data easily.',
})

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
const { authState, authFetch } = useAuth()

const items = ref([])
const buckets = ref([])
const loading = ref(false)
const selectedBucket = ref('all')
const selectedItems = ref([])

const showPasswordDialog = ref(false)
const passwordInput = ref('')
const isVerifying = ref(false)
const pendingAction = ref(null)

function requestPasswordVerification(action) {
    pendingAction.value = action
    passwordInput.value = ''
    showPasswordDialog.value = true
}

async function verifyAndProceed() {
    if (!passwordInput.value) return
    
    isVerifying.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/auth/verify`, {
            method: 'POST',
            body: { password: passwordInput.value }
        })
        
        if (!res.ok) throw new Error('Invalid password')
        
        showPasswordDialog.value = false
        if (pendingAction.value) {
            await pendingAction.value()
        }
    } catch (e) {
        toast.error('Verification failed: ' + e.message)
    } finally {
        isVerifying.value = false
    }
}

const filteredItems = computed(() => {
    if (selectedBucket.value === 'all') return items.value
    return items.value.filter(item => item.Bucket === selectedBucket.value)
})

const isAllSelected = computed(() => {
    return filteredItems.value.length > 0 && selectedItems.value.length === filteredItems.value.length
})

function isSelected(item) {
    return selectedItems.value.some(i => i.ID === item.ID)
}

function toggleSelection(item) {
    const index = selectedItems.value.findIndex(i => i.ID === item.ID)
    if (index === -1) {
        selectedItems.value.push(item)
    } else {
        selectedItems.value.splice(index, 1)
    }
}

function toggleSelectAll() {
    if (isAllSelected.value) {
        selectedItems.value = []
    } else {
        selectedItems.value = [...filteredItems.value]
    }
}

// Reset selection when bucket changes
watch(selectedBucket, () => {
    selectedItems.value = []
})

async function fetchTrash() {
    loading.value = true
    selectedItems.value = []
    try {
        const res = await authFetch(`${API_BASE}/admin/trash`)
        if (!res.ok) throw new Error('Failed to fetch trash')
        const data = await res.json()
        items.value = Array.isArray(data) ? data : []

        // Extract unique buckets
        const uniqueBuckets = [...new Set(items.value.map(i => i.Bucket))]
        buckets.value = uniqueBuckets.sort()
    } catch (err) {
        console.error(err)
        toast.error('Failed to fetch trash: ' + err.message)
    } finally {
        loading.value = false
    }
}

async function restoreItem(item) {
    const promise = (async () => {
        const res = await authFetch(`${API_BASE}/admin/trash/restore`, {
            method: 'POST',
            body: {
                bucket: item.Bucket,
                key: item.Key,
                versionId: item.VersionID
            }
        })
        if (!res.ok) throw new Error('Restore failed')
        return res
    })()

    toast.promise(promise, {
        loading: `Restoring ${item.Key}...`,
        success: () => {
            items.value = items.value.filter(i => i.ID !== item.ID)
            selectedItems.value = selectedItems.value.filter(i => i.ID !== item.ID)
            return `${item.Key} restored successfully`
        },
        error: (err) => `Failed to restore: ${err.message}`
    })
}

async function bulkRestore() {
    if (selectedItems.value.length === 0) return

    const count = selectedItems.value.length
    const promise = (async () => {
        const res = await authFetch(`${API_BASE}/admin/trash/restore-bulk`, {
            method: 'POST',
            body: {
                items: selectedItems.value.map(i => ({
                    bucket: i.Bucket,
                    key: i.Key,
                    versionId: i.VersionID
                }))
            }
        })
        if (!res.ok) throw new Error('Bulk restore failed')
        return res
    })()

    toast.promise(promise, {
        loading: `Restoring ${count} objects...`,
        success: () => {
            const idsToRemove = new Set(selectedItems.value.map(i => i.ID))
            items.value = items.value.filter(i => !idsToRemove.has(i.ID))
            selectedItems.value = []
            return `Successfully restored ${count} objects`
        },
        error: (err) => `Failed to restore objects: ${err.message}`
    })
}

async function deletePermanently(item) {
    if (!confirm(`Are you sure you want to permanently delete ${item.Key}? This action cannot be undone.`)) return

    requestPasswordVerification(() => {
        const promise = (async () => {
            const res = await authFetch(`${API_BASE}/admin/trash?bucket=${item.Bucket}&key=${encodeURIComponent(item.Key)}&versionId=${item.VersionID}`, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('Delete failed')
            return res
        })()

        toast.promise(promise, {
            loading: 'Deleting permanently...',
            success: () => {
                items.value = items.value.filter(i => i.ID !== item.ID)
                selectedItems.value = selectedItems.value.filter(i => i.ID !== item.ID)
                return `${item.Key} permanently deleted`
            },
            error: (err) => `Failed to delete: ${err.message}`
        })
    })
}

async function bulkDelete() {
    if (selectedItems.value.length === 0) return
    if (!confirm(`Are you sure you want to permanently delete ${selectedItems.value.length} selected objects? This action cannot be undone.`)) return

    requestPasswordVerification(() => {
        const count = selectedItems.value.length
        const promise = (async () => {
            const res = await authFetch(`${API_BASE}/admin/trash-bulk`, {
                method: 'DELETE',
                body: {
                    items: selectedItems.value.map(i => ({
                        bucket: i.Bucket,
                        key: i.Key,
                        versionId: i.VersionID
                    }))
                }
            })
            if (!res.ok) throw new Error('Bulk delete failed')
            return res
        })()

        toast.promise(promise, {
            loading: `Deleting ${count} objects permanently...`,
            success: () => {
                const idsToRemove = new Set(selectedItems.value.map(i => i.ID))
                items.value = items.value.filter(i => !idsToRemove.has(i.ID))
                selectedItems.value = []
                return `Successfully deleted ${count} objects`
            },
            error: (err) => `Failed to delete objects: ${err.message}`
        })
    })
}

async function emptyTrash() {
    const scope = selectedBucket.value === 'all' ? 'globally' : `in bucket ${selectedBucket.value}`
    if (!confirm(`Are you sure you want to empty the trash ${scope}? This will permanently delete ALL objects in the trash. This action cannot be undone.`)) return

    requestPasswordVerification(() => {
        const promise = (async () => {
            let url = `${API_BASE}/admin/trash/empty`
            if (selectedBucket.value !== 'all') {
                url += `?bucket=${selectedBucket.value}`
            }

            const res = await authFetch(url, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('Empty trash failed')
            return res
        })()

        toast.promise(promise, {
            loading: 'Emptying trash...',
            success: () => {
                if (selectedBucket.value === 'all') {
                    items.value = []
                    buckets.value = []
                } else {
                    items.value = items.value.filter(i => i.Bucket !== selectedBucket.value)
                    if (items.value.length === 0) buckets.value = []
                }
                selectedItems.value = []
                return 'Trash emptied successfully'
            },
            error: (err) => `Failed to empty trash: ${err.message}`
        })
    })
}

function formatDate(date) {
    if (!date) return '-'
    const d = new Date(date)
    return `${format(d, 'MMM d, yyyy HH:mm')} (${formatDistanceToNow(d)} ago)`
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

onMounted(() => {
    fetchTrash()
})
</script>
