<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <h1 class="text-lg font-semibold tracking-tight">Buckets</h1>
                <p class="text-xs text-muted-foreground">Manage your cloud storage infrastructure.</p>
            </div>
            <div class="flex items-center gap-3">
                <Button variant="outline" size="sm" @click="fetchBuckets" :disabled="loading" class="h-8">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': loading }" />
                    Sync
                </Button>
                <Button size="sm" @click="showCreateBucketDialog = true" class="h-8 bg-primary hover:bg-primary/90">
                    <Plus class="w-3.5 h-3.5 mr-2" /> New Bucket
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto p-6">
            <div v-if="loading && (!buckets || buckets.length === 0)"
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <Card v-for="i in 8" :key="i" class="h-32 animate-pulse bg-muted/50" />
            </div>

            <div v-else-if="buckets && buckets.length > 0"
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                <TransitionGroup name="list">
                    <Card v-for="bucket in buckets" :key="bucket"
                        class="group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-primary/50 cursor-pointer border-slate-200 dark:border-slate-800">
                        <div class="p-4 flex flex-col h-full">
                            <div class="flex items-start justify-between mb-3">
                                <div
                                    class="p-2 rounded-lg bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                                    <Database class="w-5 h-5" />
                                </div>
                                <DropdownMenu @click.stop>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"
                                            class="h-8 w-8 -mr-2 -mt-1 hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreVertical class="w-4 h-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" class="w-48">
                                        <DropdownMenuItem @click="openVersioningDialog(bucket)">
                                            <History class="w-4 h-4 mr-2" />
                                            Versioning Settings
                                        </DropdownMenuItem>
                                        <DropdownMenuItem @click="openObjectLockDialog(bucket)">
                                            <Lock class="w-4 h-4 mr-2" />
                                            Object Lock Settings
                                        </DropdownMenuItem>
                                        <DropdownMenuItem @click="togglePublic(bucket)">
                                            <component :is="isPublic(bucket) ? ShieldOff : ShieldCheck"
                                                class="w-4 h-4 mr-2" />
                                            {{ isPublic(bucket) ? 'Make Private' : 'Make Public' }}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem @click="deleteBucket(bucket)"
                                            class="text-destructive focus:bg-destructive/10">
                                            <Trash2 class="w-4 h-4 mr-2" />
                                            Delete Bucket
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            <div class="space-y-1">
                                <h3 class="font-medium text-slate-900 dark:text-slate-100 truncate pr-4"
                                    :title="bucket">
                                    {{ bucket }}
                                </h3>
                                <div class="flex items-center gap-2">
                                    <Badge :variant="isPublic(bucket) ? 'success' : 'secondary'"
                                        class="text-[10px] uppercase font-bold px-1.5 h-4 tracking-wider">
                                        {{ isPublic(bucket) ? 'Public' : 'Private' }}
                                    </Badge>
                                    <span
                                        class="text-[10px] text-muted-foreground uppercase font-medium">Standard</span>
                                </div>
                            </div>

                            <div class="mt-auto pt-4 flex items-center justify-between text-muted-foreground"
                                @click="navigateToBucket(bucket)">
                                <span class="text-[10px] flex items-center gap-1">
                                    <Clock class="w-3 h-3" />
                                    Active
                                </span>
                                <ChevronRight
                                    class="w-4 h-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                            </div>
                        </div>
                    </Card>
                </TransitionGroup>
            </div>

            <div v-else class="h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
                <div class="p-6 rounded-full bg-muted/30">
                    <Database class="w-12 h-12 text-muted-foreground/50" />
                </div>
                <div class="space-y-1">
                    <h3 class="text-lg font-medium">No buckets found</h3>
                    <p class="text-sm text-muted-foreground max-w-xs">
                        Start by creating your first container to store your objects securely.
                    </p>
                </div>
                <Button @click="showCreateBucketDialog = true">
                    <Plus class="w-4 h-4 mr-2" /> Create First Bucket
                </Button>
            </div>
        </main>

        <Dialog :open="showCreateBucketDialog" @update:open="showCreateBucketDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Provision New Bucket</DialogTitle>
                    <DialogDescription>
                        Buckets are fundamental containers for your cloud data.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label for="bucket-name">Bucket Name</Label>
                        <Input id="bucket-name" v-model="newBucketName" placeholder="my-gravity-bucket"
                            @keyup.enter="createBucket"
                            class="h-10 border-slate-300 dark:border-slate-700 focus:ring-primary" autofocus />
                        <p class="text-[10px] text-muted-foreground">Names must be globally unique and URL-compatible.
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
    Plus, Database, MoreVertical, ShieldCheck, ShieldOff,
    Trash2, RefreshCw, Clock, ChevronRight, Loader2, History, Lock
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
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


async function fetchBuckets() {
    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets`)
        if (res.ok) {
            buckets.value = await res.json()
        } else {
            throw new Error('Failed to fetch buckets')
        }
    } catch (e) {
        toast.error('Sync failed: Could not synchronize buckets.')
    } finally {
        loading.value = false
    }
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
    transition: all 0.4s ease;
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: translateY(20px);
}
</style>
