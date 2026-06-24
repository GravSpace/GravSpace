<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <h1 class="text-lg font-semibold tracking-tight">Buckets</h1>
                <p class="text-xs text-muted-foreground">Manage your cloud storage infrastructure.</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="relative">
                    <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input v-model="searchQuery" type="text" placeholder="Filter buckets..."
                        class="h-8 w-44 pl-8 pr-3 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60" />
                </div>
                <Button variant="outline" size="sm" @click="fetchBuckets" :disabled="loading" class="h-8">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': loading }" />
                    Sync
                </Button>
                <Button size="sm" @click="showCreateBucketDialog = true"
                    class="h-8 bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95">
                    <Plus class="w-3.5 h-3.5 mr-2" /> New Bucket
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto p-6">
            <!-- Loading Skeleton -->
            <div v-if="loading && (!buckets || buckets.length === 0)" class="space-y-3">
                <div v-for="i in 5" :key="i"
                    class="h-[72px] rounded-xl animate-pulse bg-muted/40 border border-slate-200/50 dark:border-slate-800/50" />
            </div>

            <!-- Bucket List -->
            <div v-else-if="filteredBuckets && filteredBuckets.length > 0" class="space-y-2.5">
                <TransitionGroup name="list">
                    <div v-for="bucket in filteredBuckets" :key="bucket"
                        class="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300 cursor-pointer"
                        @click="navigateToBucket(bucket)">

                        <div class="flex items-center justify-between px-5 py-3.5">
                            <!-- Left: Icon + Name + Badges -->
                            <div class="flex items-center gap-4 min-w-0 flex-1">
                                <div
                                    class="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/10 to-indigo-500/10 border border-primary/15 flex items-center justify-center shrink-0 group-hover:from-primary/20 group-hover:to-indigo-500/20 transition-colors duration-300">
                                    <Database
                                        class="w-4.5 h-4.5 text-primary group-hover:scale-110 transition-transform duration-300" />
                                </div>
                                <div class="flex flex-col min-w-0">
                                    <div class="flex items-center gap-2.5">
                                        <span
                                            class="font-bold text-sm text-slate-900 dark:text-slate-100 truncate tracking-tight"
                                            :title="bucket">{{ bucket }}</span>
                                        <Badge :variant="isPublic(bucket) ? 'default' : 'outline'" :class="[
                                            'text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold shrink-0',
                                            isPublic(bucket)
                                                ? 'bg-emerald-500 hover:bg-emerald-500 text-white'
                                                : 'border-slate-300 dark:border-slate-700 text-muted-foreground'
                                        ]">
                                            {{ isPublic(bucket) ? 'Public' : 'Private' }}
                                        </Badge>
                                        <Badge v-if="bucketInfoCache[bucket]?.VersioningEnabled" variant="outline"
                                            class="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold border-violet-500/30 text-violet-500 shrink-0">
                                            Versioned
                                        </Badge>
                                        <Badge v-if="bucketInfoCache[bucket]?.ObjectLockEnabled" variant="outline"
                                            class="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold border-amber-500/30 text-amber-500 shrink-0">
                                            <Lock class="w-2.5 h-2.5 mr-0.5" /> Locked
                                        </Badge>
                                    </div>
                                    <div class="flex items-center gap-3 mt-0.5">
                                        <span
                                            class="text-[10px] text-muted-foreground font-medium uppercase tracking-wider opacity-50">
                                            Standard Storage
                                        </span>
                                        <span v-if="bucketInfoCache[bucket]?.CurrentSize"
                                            class="text-[10px] text-muted-foreground font-mono">
                                            {{ formatSize(bucketInfoCache[bucket].CurrentSize) }}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <!-- Right: Quota Bar + Actions -->
                            <div class="flex items-center gap-4 shrink-0">
                                <!-- Quota mini bar -->
                                <div v-if="bucketInfoCache[bucket]?.QuotaBytes > 0"
                                    class="hidden md:flex flex-col gap-1 w-32">
                                    <div
                                        class="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                                        <span class="text-muted-foreground opacity-60">Quota</span>
                                        <span :class="getQuotaPercent(bucketInfoCache[bucket]) > 90 ? 'text-rose-500' : 'text-muted-foreground opacity-60'">
                                            {{ getQuotaPercent(bucketInfoCache[bucket]) }}%
                                        </span>
                                    </div>
                                    <div
                                        class="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div class="h-full rounded-full transition-all duration-500"
                                            :class="getQuotaColor(bucketInfoCache[bucket])"
                                            :style="{ width: getQuotaPercent(bucketInfoCache[bucket]) + '%' }">
                                        </div>
                                    </div>
                                </div>

                                <!-- Actions -->
                                <div class="flex items-center gap-0.5" @click.stop>
                                    <Button variant="ghost" size="icon"
                                        class="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                        @click="openVersioningDialog(bucket)" title="Versioning">
                                        <History class="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                        class="h-7 w-7 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                                        @click="openObjectLockDialog(bucket)" title="Object Lock">
                                        <Lock class="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                        class="h-7 w-7 transition-colors"
                                        :class="isPublic(bucket) ? 'text-emerald-500 hover:text-rose-500 hover:bg-rose-500/10' : 'text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10'"
                                        @click="togglePublic(bucket)"
                                        :title="isPublic(bucket) ? 'Make Private' : 'Make Public'">
                                        <component :is="isPublic(bucket) ? ShieldOff : ShieldCheck"
                                            class="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                        class="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                                        @click="deleteBucket(bucket)" title="Delete Bucket">
                                        <Trash2 class="w-3.5 h-3.5" />
                                    </Button>
                                </div>

                                <!-- Navigate Arrow -->
                                <ChevronRight
                                    class="w-4 h-4 text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-300" />
                            </div>
                        </div>
                    </div>
                </TransitionGroup>
            </div>

            <!-- Empty State -->
            <div v-else class="h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
                <div class="h-20 w-20 rounded-2xl bg-muted/30 flex items-center justify-center">
                    <Database class="w-10 h-10 text-muted-foreground/30" />
                </div>
                <div class="space-y-1">
                    <h3 class="text-lg font-semibold">{{ searchQuery ? 'No matching buckets' : 'No buckets found' }}
                    </h3>
                    <p class="text-sm text-muted-foreground max-w-xs">
                        {{ searchQuery ? 'Try adjusting your search query.' : 'Start by creating your first container to store your objects securely.' }}
                    </p>
                </div>
                <Button v-if="!searchQuery" @click="showCreateBucketDialog = true"
                    class="shadow-sm active:scale-95 transition-transform">
                    <Plus class="w-4 h-4 mr-2" /> Create First Bucket
                </Button>
            </div>
        </main>

        <!-- Create Bucket Dialog -->
        <Dialog :open="showCreateBucketDialog" @update:open="showCreateBucketDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Database class="w-5 h-5 text-primary" />
                    </div>
                    <DialogTitle>Provision New Bucket</DialogTitle>
                    <DialogDescription>
                        Buckets are fundamental containers for your cloud data.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label for="bucket-name"
                            class="text-xs font-bold uppercase tracking-wider opacity-70">Bucket Name</Label>
                        <Input id="bucket-name" v-model="newBucketName" placeholder="my-gravity-bucket"
                            @keyup.enter="createBucket"
                            class="h-10 border-slate-300 dark:border-slate-700 focus:ring-primary shadow-xs"
                            autofocus />
                        <p class="text-[10px] text-muted-foreground italic">Names must be globally unique and
                            URL-compatible.
                        </p>
                    </div>
                    <div class="flex justify-end gap-3 mt-4">
                        <Button variant="outline" @click="showCreateBucketDialog = false">Cancel</Button>
                        <Button @click="createBucket" :disabled="!newBucketName || loading" class="bg-primary">
                            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
                            Initialize Bucket
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- Versioning Dialog -->
        <Dialog :open="showVersioningDialog" @update:open="showVersioningDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <History class="w-5 h-5 text-primary" />
                    </div>
                    <DialogTitle>Bucket Versioning</DialogTitle>
                    <DialogDescription>
                        Control version history for <strong class="text-slate-900 dark:text-slate-100">{{ selectedBucket
                        }}</strong>
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-6">
                    <div
                        class="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                        <div class="flex flex-col gap-1">
                            <span class="text-sm font-semibold">Enable Versioning</span>
                            <span class="text-[10px] text-muted-foreground">Store multiple versions of each
                                object</span>
                        </div>
                        <Switch v-model:modelValue="versioningEnabled"
                            @update:model-value="(v) => updateVersioning(v)" />
                    </div>
                    <div class="flex justify-end gap-3">
                        <Button variant="outline" @click="showVersioningDialog = false">Close</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- Object Lock Dialog -->
        <Dialog :open="showObjectLockDialog" @update:open="showObjectLockDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Lock class="w-5 h-5 text-primary" />
                    </div>
                    <DialogTitle>Object Lock Configuration</DialogTitle>
                    <DialogDescription>
                        Control write-once-read-many protection for <strong
                            class="text-slate-900 dark:text-slate-100">{{ selectedBucket
                            }}</strong>
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-6">
                    <div
                        class="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
                        <div class="flex flex-col gap-1">
                            <span class="text-sm font-semibold">Enable Object Lock</span>
                            <span class="text-[10px] text-muted-foreground">Prevent objects from being deleted or
                                overwritten</span>
                        </div>
                        <Switch v-model:modelValue="objectLockEnabled"
                            @update:model-value="(v) => updateObjectLock(v)" />
                    </div>

                    <div v-if="objectLockEnabled"
                        class="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                        <div class="space-y-1.5">
                            <Label>Default Retention Mode</Label>
                            <div class="flex gap-2 mt-1">
                                <Button v-for="mode in ['GOVERNANCE', 'COMPLIANCE']" :key="mode"
                                    :variant="defaultRetentionMode === mode ? 'primary' : 'outline'" size="sm"
                                    class="flex-1 text-[10px] font-bold tracking-wider h-8"
                                    @click="defaultRetentionMode = mode">
                                    {{ mode }}
                                </Button>
                                <Button :variant="!defaultRetentionMode ? 'primary' : 'outline'" size="sm"
                                    class="flex-1 text-[10px] font-bold tracking-wider h-8"
                                    @click="defaultRetentionMode = ''">
                                    NONE
                                </Button>
                            </div>
                        </div>

                        <div v-if="defaultRetentionMode" class="space-y-1.5">
                            <Label for="retention-days">Retention Days</Label>
                            <Input id="retention-days" v-model.number="defaultRetentionDays" type="number" min="1"
                                class="h-9" placeholder="e.g. 30" />
                            <p class="text-[10px] text-muted-foreground">Number of days objects are protected after
                                upload.</p>
                        </div>

                        <Button class="w-full h-9 mt-2" @click="updateDefaultRetention" :disabled="loading">
                            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
                            Save Default Retention
                        </Button>
                    </div>
                    <div class="flex justify-end gap-3">
                        <Button variant="outline" @click="showObjectLockDialog = false">Close</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
    Plus, Database, ShieldCheck, ShieldOff,
    Trash2, RefreshCw, ChevronRight, Loader2, History, Lock, Search
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/composables/useAuth'

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
const { authState, authFetch } = useAuth()
const router = useRouter()

useSeoMeta({
    title: 'Buckets Explorer | GravSpace',
    description: 'Browse and manage your cloud storage containers.',
})

const buckets = ref([])
const users = ref({})
const loading = ref(false)
const showCreateBucketDialog = ref(false)
const newBucketName = ref('')
const showVersioningDialog = ref(false)
const selectedBucket = ref('')
const versioningEnabled = ref(false)
const showObjectLockDialog = ref(false)
const objectLockEnabled = ref(false)
const defaultRetentionMode = ref('')
const defaultRetentionDays = ref(0)
const searchQuery = ref('')
const bucketInfoCache = ref({})

const filteredBuckets = computed(() => {
    if (!searchQuery.value.trim()) return buckets.value
    const q = searchQuery.value.toLowerCase()
    return buckets.value.filter(b => b.toLowerCase().includes(q))
})

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getQuotaPercent(info) {
    if (!info || !info.QuotaBytes || info.QuotaBytes <= 0) return 0
    return Math.min(100, Math.round((info.CurrentSize / info.QuotaBytes) * 100))
}

function getQuotaColor(info) {
    const pct = getQuotaPercent(info)
    if (pct >= 90) return 'bg-rose-500'
    if (pct >= 75) return 'bg-amber-500'
    return 'bg-emerald-500'
}

async function fetchBuckets() {
    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets`)
        if (res.ok) {
            buckets.value = await res.json()
            // Fetch info for each bucket in parallel
            fetchAllBucketInfo()
        } else {
            throw new Error('Failed to fetch buckets')
        }
    } catch (e) {
        toast.error('Sync failed: Could not synchronize buckets.')
    } finally {
        loading.value = false
    }
}

async function fetchAllBucketInfo() {
    const results = await Promise.allSettled(
        buckets.value.map(async (name) => {
            try {
                const res = await authFetch(`${API_BASE}/admin/buckets/${name}/info`)
                if (res.ok) {
                    const info = await res.json()
                    bucketInfoCache.value[name] = info
                }
            } catch (e) {
                // Silently skip
            }
        })
    )
}

async function fetchUsers() {
    try {
        const res = await authFetch(`${API_BASE}/admin/users`)
        if (res.ok) {
            users.value = await res.json()
        }
    } catch (e) {
        console.error('Failed to fetch users', e)
    }
}

async function createBucket() {
    const name = newBucketName.value.trim()
    if (!name) return

    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${name}`, { method: 'PUT' })
        if (res.ok) {
            toast.success(`Bucket "${name}" provisioned successfully.`)
            showCreateBucketDialog.value = false
            newBucketName.value = ''
            await fetchBuckets()
        } else {
            const err = await res.text()
            throw new Error(err || 'Failed to create bucket')
        }
    } catch (e) {
        toast.error(`Provision failed: ${e.message}`)
    } finally {
        loading.value = false
    }
}

async function deleteBucket(name) {
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/buckets/${name}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to delete bucket')
            await fetchBuckets()
        },
        {
            loading: `Deleting bucket "${name}"...`,
            success: `Bucket "${name}" has been decommissioned`,
            error: (err) => `Failed to delete bucket: ${err.message}`
        }
    )
}

function isPublic(bucket) {
    const anon = users.value['anonymous']
    if (!anon || !anon.policies) return false
    const resource = "arn:aws:s3:::" + bucket + "/*"
    return anon.policies.some(p =>
        p.statement.some(s => {
            if (s.effect !== "Allow" || !s.action.includes("s3:GetObject")) return false
            return s.resource.some(r => r === "*" || r === resource || (r.endsWith("*") && resource.startsWith(r.slice(0, -1))))
        })
    )
}

async function togglePublic(bucket) {
    const currentlyPublic = isPublic(bucket)
    const resource = "arn:aws:s3:::" + bucket + "/*"
    const pName = `PublicAccess-${bucket}-Root`

    try {
        if (currentlyPublic) {
            await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
            toast.success(`Public access removed from "${bucket}".`)
        } else {
            const policy = {
                name: pName,
                version: "2012-10-17",
                statement: [{
                    effect: "Allow",
                    action: ["s3:GetObject", "s3:ListBucket"],
                    resource: [resource]
                }]
            }
            await authFetch(`${API_BASE}/admin/users/anonymous/policies`, {
                method: 'POST',
                body: policy
            })
            toast.success(`"${bucket}" is now accessible to the public.`)
        }
        await fetchUsers()
    } catch (e) {
        toast.error('Policy update failed.')
    }
}

function navigateToBucket(bucket) {
    router.push(`/admin/buckets/${bucket}`)
}

async function openVersioningDialog(bucket) {
    selectedBucket.value = bucket
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucket}/info`)
        if (res.ok) {
            const info = await res.json()
            versioningEnabled.value = info.VersioningEnabled || false
        }
    } catch (e) {
        console.error('Failed to fetch bucket info', e)
        versioningEnabled.value = false
    }
    showVersioningDialog.value = true
}

async function updateVersioning(versioning) {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${selectedBucket.value}/versioning`, {
            method: 'PUT',
            body: { enabled: versioning }
        })
        if (res.ok) {
            toast.success(`Versioning ${versioningEnabled.value ? 'enabled' : 'disabled'} for "${selectedBucket.value}".`)
            // Update cache
            if (bucketInfoCache.value[selectedBucket.value]) {
                bucketInfoCache.value[selectedBucket.value].VersioningEnabled = versioning
            }
        } else {
            throw new Error('Failed to update versioning')
        }
    } catch (e) {
        toast.error('Failed to update versioning setting.')
        // Revert the toggle
        versioningEnabled.value = !versioningEnabled.value
    }
}

async function openObjectLockDialog(bucket) {
    selectedBucket.value = bucket
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucket}/info`)
        if (res.ok) {
            const info = await res.json()
            objectLockEnabled.value = info.ObjectLockEnabled || false
            defaultRetentionMode.value = info.DefaultRetentionMode || ''
            defaultRetentionDays.value = info.DefaultRetentionDays || 0
        }
    } catch (e) {
        console.error('Failed to fetch bucket info', e)
        objectLockEnabled.value = false
        defaultRetentionMode.value = ''
        defaultRetentionDays.value = 0
    }
    showObjectLockDialog.value = true
}

async function updateObjectLock(lockEnabled) {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${selectedBucket.value}/object-lock`, {
            method: 'PUT',
            body: { enabled: lockEnabled }
        })
        if (res.ok) {
            toast.success(`Object Lock ${objectLockEnabled.value ? 'enabled' : 'disabled'} for "${selectedBucket.value}".`)
            // Update cache
            if (bucketInfoCache.value[selectedBucket.value]) {
                bucketInfoCache.value[selectedBucket.value].ObjectLockEnabled = lockEnabled
            }
        } else {
            throw new Error('Failed to update object lock')
        }
    } catch (e) {
        toast.error('Failed to update object lock setting.')
        // Revert the toggle
        objectLockEnabled.value = !objectLockEnabled.value
    }
}

async function updateDefaultRetention() {
    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${selectedBucket.value}/retention/default`, {
            method: 'PUT',
            body: {
                mode: defaultRetentionMode.value,
                days: defaultRetentionDays.value
            }
        })
        if (res.ok) {
            toast.success('Default retention policy synchronized.')
            showObjectLockDialog.value = false
        } else {
            throw new Error('Sync failed')
        }
    } catch (e) {
        toast.error('Failed to save default retention settings.')
    } finally {
        loading.value = false
    }
}

onMounted(() => {
    fetchBuckets()
    fetchUsers()
})
</script>

<style scoped>
.list-enter-active,
.list-leave-active {
    transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateY(12px);
}
</style>
