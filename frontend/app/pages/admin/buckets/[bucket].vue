<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex items-center gap-4 overflow-hidden">
                <Button variant="ghost" size="icon" @click="router.push('/admin/buckets')"
                    class="h-8 w-8 shrink-0 border border-slate-200 dark:border-slate-800">
                    <ChevronLeft class="w-4 h-4" />
                </Button>
                <div class="flex items-center gap-2 overflow-hidden">
                    <Database class="w-4 h-4 text-primary shrink-0" />
                    <Breadcrumb class="overflow-hidden">
                        <BreadcrumbList class="flex-nowrap">
                            <BreadcrumbItem>
                                <BreadcrumbLink @click="navigateTo('')"
                                    class="cursor-pointer max-w-[120px] truncate font-semibold text-slate-900 dark:text-slate-100 italic">
                                    {{ bucketName }}
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <template v-for="(part, i) in currentPrefix.split('/').filter(p => p)" :key="part">
                                <BreadcrumbSeparator class="shrink-0" />
                                <BreadcrumbItem>
                                    <BreadcrumbLink
                                        @click="navigateTo(currentPrefix.split('/').slice(0, i + 1).join('/') + '/')"
                                        class="cursor-pointer max-w-[150px] truncate">
                                        {{ part }}
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                            </template>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" @click="showCreateFolderDialog = true"
                    class="h-8 border-slate-200 dark:border-slate-800">
                    <FolderPlus class="w-3.5 h-3.5 mr-2" /> New Folder
                </Button>
                <input type="file" multiple @change="uploadFiles" class="hidden" ref="fileInput">
                    <Button size="sm" @click="$refs.fileInput.click()" :disabled="uploadProgress.isUploading"
                        class="h-8 bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95">
                        <Upload class="w-3.5 h-3.5 mr-2" v-if="!uploadProgress.isUploading" />
                        <Loader2 class="w-3.5 h-3.5 mr-2 animate-spin" v-else />
                        {{ uploadProgress.isUploading ? `Uploading ${uploadProgress.completed}/${uploadProgress.total}`
                            : 'Upload' }}
                    </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto">
            <div class="p-6">
                <Card class="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader class="bg-muted/30">
                            <TableRow>
                                <TableHead class="w-[45%]">Name</TableHead>
                                <TableHead class="w-[15%]">Size</TableHead>
                                <TableHead class="w-[15%]">Type</TableHead>
                                <TableHead class="text-right w-[25%] px-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-if="currentPrefix" @dblclick="navigateUp"
                                class="cursor-pointer hover:bg-muted/50 transition-colors group italic text-muted-foreground/80">
                                <TableCell colspan="4" class="py-2 px-4 flex items-center gap-2">
                                    <CornerLeftUp class="w-3.5 h-3.5" />
                                    <span class="text-xs font-medium">Go back</span>
                                </TableCell>
                            </TableRow>

                            <TableRow v-for="cp in commonPrefixes" :key="cp"
                                class="cursor-pointer hover:bg-muted/50 transition-colors group"
                                @click="navigateTo(cp)">
                                <TableCell class="font-medium py-3">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-1.5 rounded bg-amber-500/10 text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                                            <Folder class="w-4 h-4 fill-current" />
                                        </div>
                                        <span class="truncate">{{cp.split('/').filter(p => p).pop()}}/</span>
                                    </div>
                                </TableCell>
                                <TableCell class="text-muted-foreground text-xs italic">-</TableCell>
                                <TableCell>
                                    <Badge v-if="isPublic(cp)" variant="success"
                                        class="text-[9px] uppercase font-bold py-0 h-4">Public</Badge>
                                    <span v-else
                                        class="text-[9px] text-muted-foreground/60 font-medium uppercase tracking-tighter">Directory</span>
                                </TableCell>
                                <TableCell class="text-right px-6">
                                    <DropdownMenu @click.stop>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"
                                                class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreHorizontal class="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem @click="togglePublic(cp)">
                                                <component :is="isPublic(cp) ? ShieldOff : ShieldCheck"
                                                    class="w-4 h-4 mr-2" />
                                                {{ isPublic(cp) ? 'Make Private' : 'Make Public' }}
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>

                            <template v-for="obj in objects" :key="obj.Key">
                                <TableRow v-if="!obj.Key.endsWith('/')"
                                    class="group hover:bg-muted/40 transition-colors">
                                    <TableCell class="font-medium py-3">
                                        <div class="flex items-center gap-3">
                                            <div
                                                class="p-1.5 rounded bg-blue-500/10 text-blue-500 group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                                <File class="w-4 h-4" />
                                            </div>
                                            <div class="flex items-center gap-1.5 min-w-0">
                                                <span class="truncate" :title="obj.Key">{{ obj.Key.split('/').pop()
                                                }}</span>
                                                <Lock v-if="isLocked(obj)" class="w-3 h-3 text-amber-500 shrink-0" />
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-muted-foreground text-xs font-mono tabular-nums">{{
                                        formatSize(obj.Size) }}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline"
                                            class="text-[9px] uppercase font-bold py-0 h-4 bg-background/50 border-slate-200 dark:border-slate-800">
                                            {{ obj.Key.split('.').pop() }}
                                        </Badge>
                                    </TableCell>
                                    <TableCell class="text-right px-6 whitespace-nowrap">
                                        <div class="flex items-center justify-end gap-1">
                                            <Button v-if="isImage(obj.Key)" variant="ghost" size="icon"
                                                class="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                                                @click="previewObject = { key: obj.Key }" title="Quick Look">
                                                <Eye class="w-4 h-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon"
                                                class="h-8 w-8 text-muted-foreground hover:text-primary transition-colors"
                                                @click="downloadObject(obj.Key)" title="Download">
                                                <Download class="w-4 h-4" />
                                            </Button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon"
                                                        class="h-8 w-8 text-muted-foreground">
                                                        <MoreVertical class="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" class="w-56">
                                                    <DropdownMenuItem @click="fetchVersions(obj.Key)">
                                                        <History class="w-4 h-4 mr-2" />
                                                        Version History
                                                        <Badge variant="secondary" class="ml-auto text-[9px] scale-90"
                                                            v-if="objectVersions[obj.Key]">Open</Badge>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem @click="copyPresignedUrl(obj.Key)">
                                                        <LinkIcon class="w-4 h-4 mr-2" />
                                                        Copy Secure Link
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem @click="openLockDialog(obj)">
                                                        <Lock class="w-4 h-4 mr-2" />
                                                        Object Lock Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem @click="deleteObject(obj.Key)"
                                                        class="text-destructive focus:bg-destructive/10">
                                                        <Trash2 class="w-4 h-4 mr-2" />
                                                        Delete Permanently
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </TableCell>
                                </TableRow>

                                <TableRow v-if="objectVersions[obj.Key]" class="bg-slate-50/50 dark:bg-slate-900/30">
                                    <TableCell colspan="4" class="p-0 border-l-4 border-primary/40">
                                        <div class="px-8 py-6 space-y-4">
                                            <div class="flex items-center justify-between">
                                                <div class="flex items-center gap-2">
                                                    <div class="p-1.5 rounded-md bg-primary/10 text-primary">
                                                        <History class="w-3.5 h-3.5" />
                                                    </div>
                                                    <h4
                                                        class="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                                                        Object Version History</h4>
                                                </div>
                                                <Button variant="ghost" size="xs"
                                                    @click="objectVersions[obj.Key] = null"
                                                    class="h-6 text-[10px] hover:bg-slate-200 dark:hover:bg-slate-800">
                                                    Collapse History
                                                </Button>
                                            </div>

                                            <div
                                                class="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
                                                <div v-for="v in objectVersions[obj.Key]" :key="v.VersionID"
                                                    class="relative group/v">
                                                    <div class="absolute -left-[21px] top-1.5 h-[11px] w-[11px] rounded-full border-2 border-white dark:border-slate-950 transition-colors duration-300"
                                                        :class="v.IsLatest ? 'bg-primary scale-125' : 'bg-slate-400 group-hover/v:bg-primary'">
                                                    </div>

                                                    <div
                                                        class="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md hover:border-primary/30">
                                                        <div class="flex items-center gap-6">
                                                            <div class="flex flex-col gap-0.5">
                                                                <div class="flex items-center gap-2">
                                                                    <code
                                                                        class="text-[11px] font-mono font-bold text-slate-900 dark:text-slate-100">{{ v.VersionID }}</code>
                                                                    <Badge v-if="v.IsLatest"
                                                                        class="text-[8px] h-3.5 bg-primary/10 text-primary border-primary/20 py-0 font-bold uppercase tracking-tighter">
                                                                        Current</Badge>
                                                                    <Badge v-if="v.VersionID === 'legacy'"
                                                                        variant="outline"
                                                                        class="text-[8px] h-3.5 py-0 italic">Legacy
                                                                    </Badge>
                                                                    <Badge v-if="isLocked(v)"
                                                                        class="text-[8px] h-3.5 bg-amber-500/10 text-amber-600 border-amber-500/20 py-0 font-bold uppercase tracking-tighter gap-1">
                                                                        <Lock class="w-2 h-2" /> locked
                                                                    </Badge>
                                                                </div>
                                                                <div
                                                                    class="flex items-center gap-2 text-[10px] text-muted-foreground font-medium">
                                                                    <Clock class="w-3 h-3" />
                                                                    {{ new Date(v.ModTime).toLocaleString(undefined, {
                                                                        dateStyle: 'medium', timeStyle: 'short'
                                                                    }) }}
                                                                </div>
                                                            </div>
                                                            <div
                                                                class="flex flex-col items-start gap-0.5 border-l pl-6 border-slate-100 dark:border-slate-800">
                                                                <span
                                                                    class="text-[9px] uppercase font-bold text-muted-foreground tracking-tighter opacity-50">Size</span>
                                                                <span
                                                                    class="text-[11px] font-mono font-bold tabular-nums text-slate-600 dark:text-slate-400">{{
                                                                        formatSize(v.Size) }}</span>
                                                            </div>
                                                        </div>

                                                        <div
                                                            class="flex items-center gap-1 opacity-0 group-hover/v:opacity-100 transition-all">
                                                            <Button variant="outline" size="xs"
                                                                class="h-7 text-[10px] font-bold"
                                                                @click="previewObject = { key: obj.Key, versionId: v.VersionID }">Preview</Button>
                                                            <Button variant="outline" size="xs"
                                                                class="h-7 text-[10px] font-bold"
                                                                @click="downloadObject(obj.Key, v.VersionID)">Download</Button>
                                                            <Button variant="outline" size="xs"
                                                                class="h-7 text-[10px] font-bold"
                                                                @mousedown="openLockDialog(v)">
                                                                <Lock class="w-3 h-3" />
                                                            </Button>
                                                            <Button v-if="!v.IsLatest && v.VersionID !== 'legacy'"
                                                                variant="ghost" size="icon"
                                                                class="h-7 w-7 text-destructive hover:bg-destructive/10"
                                                                @click="deleteObject(obj.Key, v.VersionID)">
                                                                <Trash2 class="w-3.5 h-3.5" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            </template>

                            <TableRow v-if="objects.length === 0 && commonPrefixes.length === 0 && !loading">
                                <TableCell colspan="4" class="h-32 text-center text-muted-foreground italic text-sm">
                                    <div class="flex flex-col items-center gap-2">
                                        <Inbox class="w-6 h-6 opacity-20" />
                                        <span>Folder is empty</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </main>

        <!-- DIALOGS -->
        <Dialog :open="showCreateFolderDialog" @update:open="showCreateFolderDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Virtual Directory</DialogTitle>
                    <DialogDescription>
                        Folders are simulated using zero-byte marker objects.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label for="folder-name">Directory Name</Label>
                        <Input id="folder-name" v-model="newFolderName" placeholder="logs/2026/01"
                            @keyup.enter="createFolder" autofocus class="h-10" />
                    </div>
                    <div class="flex justify-end gap-3 mt-4">
                        <Button variant="outline" @click="showCreateFolderDialog = false">Cancel</Button>
                        <Button @click="createFolder" :disabled="!newFolderName">Create Directory</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <Dialog :open="!!previewObject" @update:open="previewObject = null">
            <DialogContent class="max-w-4xl p-0 overflow-hidden bg-black/95 border-0 rounded-xl shadow-2xl">
                <div class="relative h-[85vh] flex items-center justify-center">
                    <div v-if="!previewUrl" class="text-white flex flex-col items-center gap-4 animate-pulse">
                        <Loader2 class="w-10 h-10 animate-spin text-primary" />
                        <span class="text-sm font-medium tracking-wide">SECURE STREAMING IN PROGRESS...</span>
                    </div>
                    <img v-else :src="previewUrl" class="max-w-full max-h-full object-contain p-4" />

                    <div
                        class="absolute bottom-0 left-0 right-0 p-6 bg-linear-to-t from-black via-black/80 to-transparent">
                        <div class="flex flex-col items-center justify-between text-white">
                            <div class="flex flex-col max-w-[70%]">
                                <span class="text-[10px] font-bold text-primary tracking-widest uppercase mb-1">Preview
                                    Mode</span>
                                <span class="text-sm font-mono truncate">{{ previewObject?.key }}</span>
                                <span v-if="previewObject?.versionId"
                                    class="text-[10px] text-zinc-400 font-mono mt-0.5">V: {{
                                        previewObject.versionId }}</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <Button size="sm" variant="secondary" class="font-bold border-0 h-9"
                                    @click="downloadObject(previewObject.key, previewObject.versionId)">
                                    <Download class="w-4 h-4 mr-2" /> Download
                                </Button>
                                <Button size="sm" variant="ghost" class="text-white hover:bg-white/10 h-9"
                                    @click="previewObject = null">
                                    Dismiss
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <Dialog :open="showLockDialog" @update:open="showLockDialog = false">
            <DialogContent class="sm:max-w-lg">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <Lock class="w-5 h-5 text-primary" />
                    </div>
                    <DialogTitle>Object Lock Configuration</DialogTitle>
                    <DialogDescription>
                        Manage Write-Once-Read-Many protection for<br />
                        <code class="text-xs font-mono break-all text-slate-900 dark:text-slate-100">{{ selectedLockObject?.Key
                        }}</code>
                        <div class="mt-1 text-[10px] uppercase font-bold text-muted-foreground tabular-nums">Version: {{
                            selectedLockObject?.VersionID }}</div>
                    </DialogDescription>
                </DialogHeader>

                <div class="space-y-6 py-6 border-y border-slate-100 dark:border-slate-800">
                    <!-- Legal Hold -->
                    <div
                        class="flex items-center justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                        <div class="flex flex-col gap-1">
                            <div class="flex items-center gap-2">
                                <ShieldAlert class="w-4 h-4 text-amber-500" />
                                <span class="text-sm font-bold">Legal Hold</span>
                            </div>
                            <span class="text-[10px] text-muted-foreground max-w-[240px]">Prevents an object version
                                from being
                                deleted even if retention expires.</span>
                        </div>
                        <Switch v-model:modelValue="lockSettings.legalHold" />
                    </div>

                    <!-- Retention -->
                    <div class="space-y-4">
                        <div class="flex items-center gap-2 px-1">
                            <Clock class="w-4 h-4 text-primary" />
                            <span class="text-sm font-bold">Retention Period</span>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <Label class="text-[10px] uppercase font-bold text-muted-foreground">Mode</Label>
                                <select v-model="lockSettings.mode"
                                    class="w-full h-9 rounded-md border border-slate-200 dark:border-slate-800 bg-background px-3 py-1 text-sm shadow-sm transition-colors cursor-pointer">
                                    <option value="GOVERNANCE">Governance</option>
                                    <option value="COMPLIANCE">Compliance</option>
                                </select>
                            </div>
                            <div class="space-y-2">
                                <Label class="text-[10px] uppercase font-bold text-muted-foreground">Retain
                                    Until</Label>
                                <Input type="datetime-local" v-model="lockSettings.retainUntilDate" class="h-9" />
                            </div>
                        </div>

                        <div v-if="lockSettings.mode === 'COMPLIANCE'"
                            class="p-3 rounded-lg bg-destructive/5 border border-destructive/20 text-destructive text-[10px] font-medium leading-relaxed">
                            <strong class="uppercase mr-1">Warning:</strong> In Compliance mode, the retention period
                            cannot be
                            shortened or removed by any user, including root.
                        </div>
                    </div>
                </div>

                <div class="flex justify-between items-center pt-2">
                    <div class="flex items-center gap-2">
                        <Badge v-if="isLocked(selectedLockObject)" variant="success"
                            class="text-[9px] uppercase font-bold">
                            Active Lock</Badge>
                        <Badge v-else variant="secondary" class="text-[9px] uppercase font-bold">No Active Lock</Badge>
                    </div>
                    <div class="flex gap-3">
                        <Button variant="outline" @click="showLockDialog = false">Cancel</Button>
                        <Button @click="updateLockSettings">Save Changes</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
    ChevronLeft, Database, Plus, MoreHorizontal, MoreVertical, FolderPlus, Upload,
    Eye, Download, History, LinkIcon, Trash2, Loader2, File, Folder, CornerLeftUp,
    Inbox, ShieldCheck, ShieldOff, Clock, Lock, ShieldAlert
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/composables/useAuth'

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
const { authState, authFetch } = useAuth()
const route = useRoute()
const router = useRouter()

const bucketName = ref(route.params.bucket)
const currentPrefix = ref('')
const objects = ref([])
const commonPrefixes = ref([])
const objectVersions = ref({})
const loading = ref(false)
const users = ref({})

const uploadProgress = ref({
    total: 0,
    completed: 0,
    isUploading: false
})
const previewObject = ref(null)
const previewUrl = ref(null)

const showCreateFolderDialog = ref(false)
const newFolderName = ref('')
const fileInput = ref(null)

const showLockDialog = ref(false)
const selectedLockObject = ref(null)
const lockSettings = ref({
    mode: 'GOVERNANCE',
    retainUntilDate: '',
    legalHold: false
})


async function fetchObjects() {
    if (!bucketName.value) return
    loading.value = true
    try {
        const url = `${API_BASE}/admin/buckets/${bucketName.value}/objects?delimiter=/&prefix=${encodeURIComponent(currentPrefix.value)}`
        const res = await authFetch(url)
        if (res.ok) {
            const data = await res.json()
            objects.value = (data.objects || []).filter(o => o.Key !== currentPrefix.value)
            commonPrefixes.value = (data.common_prefixes || []).filter(p => p !== currentPrefix.value)
        } else {
            throw new Error('Access denied or bucket not found')
        }
    } catch (e) {
        toast.error('Failed to load storage objects.')
    } finally {
        loading.value = false
    }
}

async function fetchUsers() {
    try {
        const res = await authFetch(`${API_BASE}/admin/users`)
        if (res.ok) users.value = await res.json()
    } catch (e) {
        console.error('Failed to load permissions context')
    }
}

function navigateTo(p) {
    currentPrefix.value = p
    objectVersions.value = {}
    fetchObjects()
}

function navigateUp() {
    if (!currentPrefix.value) return
    const parts = currentPrefix.value.split('/').filter(p => p)
    parts.pop()
    navigateTo(parts.length > 0 ? parts.join('/') + '/' : '')
}

async function createFolder() {
    const name = newFolderName.value.trim()
    if (!name) return
    const key = currentPrefix.value + name + (name.endsWith('/') ? '' : '/')
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${key}`, { method: 'PUT' })
        if (res.ok) {
            showCreateFolderDialog.value = false
            newFolderName.value = ''
            toast.success(`Virtual directory "${name}" formed.`)
            await fetchObjects()
        }
    } catch (e) {
        toast.error('Failed to create folder.')
    }
}

async function uploadFiles(event) {
    const files = Array.from(event.target.files)
    if (files.length === 0) return

    uploadProgress.value = {
        total: files.length,
        completed: 0,
        isUploading: true
    }

    for (const file of files) {
        try {
            const sanitizedName = file.name.replace(/\s+/g, '_').replace(/[^\w\-\.]/g, '_')
            const key = currentPrefix.value + sanitizedName
            await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects/${key}`, {
                method: 'PUT',
                body: file
            })
            uploadProgress.value.completed++
        } catch (err) {
            toast.error(`Error uploading ${file.name}`)
        }
    }

    uploadProgress.value.isUploading = false
    event.target.value = ''
    toast.success(`Uploaded ${uploadProgress.value.completed} items.`)
    await fetchObjects()
}

async function downloadObject(key, versionId = '') {
    try {
        let url = `${API_BASE}/admin/buckets/${bucketName.value}/download/${key}`
        if (versionId) url += `?versionId=${versionId}`

        const res = await authFetch(url)
        if (!res.ok) throw new Error('Object stream failed.')

        const blob = await res.blob()
        const downloadUrl = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = key.split('/').pop()
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100)
        toast.info(`Retrieving ${key.split('/').pop()}...`)
    } catch (e) {
        toast.error(`Download failed: ${e.message}`)
    }
}

async function deleteObject(key, versionId = null) {
    if (!confirm(`Permanently delete ${key}${versionId ? ' (version ' + versionId.slice(0, 8) + ')' : ''}?`)) return

    try {
        let url = `${API_BASE}/admin/buckets/${bucketName.value}/objects/${key}`
        if (versionId) url += `?versionId=${versionId}`
        const res = await authFetch(url, { method: 'DELETE' })
        if (res.ok) {
            toast.success('Object purged from infrastructure.')
            if (versionId && objectVersions.value[key]) {
                fetchVersions(key)
            } else {
                await fetchObjects()
            }
        }
    } catch (e) {
        toast.error('Purge failed.')
    }
}

async function fetchVersions(key) {
    if (objectVersions.value[key]) {
        objectVersions.value[key] = null
        return
    }
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${bucketName.value}/objects?versions&prefix=${encodeURIComponent(key)}`)
        if (res.ok) {
            const data = await res.json()
            objectVersions.value[key] = data.versions || []
            if (objectVersions.value[key].length === 0) {
                toast.info('No alternative versions found.')
                objectVersions.value[key] = null
            }
        }
    } catch (e) {
        toast.error('Failed to fetch version tree.')
    }
}

async function copyPresignedUrl(key, versionId = null) {
    try {
        let url = `${API_BASE}/admin/presign?bucket=${bucketName.value}&key=${key}`
        if (versionId) url += `&versionId=${versionId}`

        const res = await authFetch(url)
        if (res.ok) {
            const data = await res.json()
            await navigator.clipboard.writeText(data.url)
            toast.success("Identity-signed URL copied to clipboard.")
        }
    } catch (err) {
        toast.error("Cloud signature failed.")
    }
}

function isPublic(prefix = "") {
    const anon = users.value['anonymous']
    if (!anon || !anon.policies) return false
    const resource = "arn:aws:s3:::" + bucketName.value + (prefix ? "/" + prefix : "/*")
    if (!prefix.endsWith('/') && prefix !== "") {
        // Handle specific file check if needed
    }
    return anon.policies.some(p =>
        p.statement.some(s => {
            if (s.effect !== "Allow" || !s.action.includes("s3:GetObject")) return false
            return s.resource.some(r => r === "*" || r === resource || (r.endsWith("*") && resource.startsWith(r.slice(0, -1))))
        })
    )
}

async function togglePublic(prefix = "") {
    const currentlyPublic = isPublic(prefix)
    const resource = "arn:aws:s3:::" + bucketName.value + (prefix.length > 0 ? "/" + prefix + "*" : "/*")
    const pName = `PublicAccess-${bucketName.value}-${prefix.replace(/\s+$/, "").replace(/\//g, "") || 'Root'}`

    try {
        if (currentlyPublic) {
            await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
            toast.success('Access level restricted.')
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
            toast.success('Broadcast access enabled.')
        }
        await fetchUsers()
    } catch (e) {
        toast.error('Permission sync failed.')
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function isImage(key) {
    if (!key) return false
    const ext = key.split('.').pop().toLowerCase()
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)
}

watch(previewObject, async (newVal) => {
    if (previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value)
        previewUrl.value = null
    }

    if (newVal && isImage(newVal.key)) {
        try {
            let url = `${API_BASE}/admin/buckets/${bucketName.value}/objects/${newVal.key}`
            if (newVal.versionId) url += `?versionId=${newVal.versionId}`

            const res = await authFetch(url)
            if (res.ok) {
                const blob = await res.blob()
                previewUrl.value = URL.createObjectURL(blob)
            }
        } catch (e) {
            console.error('Snapshot render failed', e)
        }
    }
})

onMounted(() => {
    fetchObjects()
    fetchUsers()
})
function formatDateTime(date) {
    if (!date) return '-'
    return new Date(date).toLocaleString()
}

const isLocked = (obj) => {
    if (!obj) return false
    if (obj.LegalHold) return true
    if (obj.RetainUntilDate) {
        return new Date(obj.RetainUntilDate) > new Date()
    }
    return false
}

function openLockDialog(obj) {
    selectedLockObject.value = obj
    lockSettings.value = {
        mode: obj.LockMode || 'GOVERNANCE',
        retainUntilDate: obj.RetainUntilDate ? new Date(obj.RetainUntilDate).toISOString().slice(0, 16) : '',
        legalHold: obj.LegalHold || false
    }
    showLockDialog.value = true
}

async function updateLockSettings() {
    const bucket = bucketName.value
    const key = selectedLockObject.value.Key
    const versionId = selectedLockObject.value.VersionID

    try {
        // Update Legal Hold
        await authFetch(`${API_BASE}/admin/buckets/${bucket}/legal-hold?key=${encodeURIComponent(key)}&versionId=${versionId}`, {
            method: 'PUT',
            body: { hold: lockSettings.value.legalHold }
        })

        // Update Retention if set
        if (lockSettings.value.retainUntilDate) {
            await authFetch(`${API_BASE}/admin/buckets/${bucket}/retention?key=${encodeURIComponent(key)}&versionId=${versionId}`, {
                method: 'PUT',
                body: {
                    retainUntilDate: new Date(lockSettings.value.retainUntilDate).toISOString(),
                    mode: lockSettings.value.mode
                }
            })
        }

        toast.success('Object lock settings updated successfully')
        showLockDialog.value = false
        fetchObjects()
        if (objectVersions.value[key]) {
            fetchVersions(key)
        }
    } catch (e) {
        toast.error('Failed to update object lock settings')
    }
}
</script>
