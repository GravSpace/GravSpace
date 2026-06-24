<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-900/50">
        <!-- HEADER -->
        <header class="px-8 py-5 border-b bg-card flex items-center justify-between shrink-0">
            <div>
                <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <LinkIcon class="w-5 h-5 text-indigo-500" /> Presigned Links Management
                </h1>
                <p class="text-xs text-muted-foreground mt-0.5">Generate, track, and revoke secure access URLs for your objects.</p>
            </div>
            <Button @click="openCreateDialog" class="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm text-xs font-bold gap-2 h-9">
                <Plus class="w-4 h-4" /> Generate Presigned Link
            </Button>
        </header>

        <!-- STATS GRID -->
        <div class="px-8 pt-6 grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
            <Card class="p-4 border-slate-200/60 dark:border-slate-800/60 shadow-xs flex items-center gap-4">
                <div class="p-3 bg-indigo-500/10 text-indigo-500 rounded-lg">
                    <LinkIcon class="w-5 h-5" />
                </div>
                <div>
                    <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Total Generated</p>
                    <p class="text-xl font-bold text-slate-800 dark:text-slate-200 mt-0.5">{{ stats.total }}</p>
                </div>
            </Card>
            <Card class="p-4 border-slate-200/60 dark:border-slate-800/60 shadow-xs flex items-center gap-4">
                <div class="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg">
                    <CheckCircle class="w-5 h-5" />
                </div>
                <div>
                    <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Active Links</p>
                    <p class="text-xl font-bold text-slate-800 dark:text-slate-200 mt-0.5">{{ stats.active }}</p>
                </div>
            </Card>
            <Card class="p-4 border-slate-200/60 dark:border-slate-800/60 shadow-xs flex items-center gap-4">
                <div class="p-3 bg-amber-500/10 text-amber-500 rounded-lg">
                    <Clock class="w-5 h-5" />
                </div>
                <div>
                    <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Expired Links</p>
                    <p class="text-xl font-bold text-slate-800 dark:text-slate-200 mt-0.5">{{ stats.expired }}</p>
                </div>
            </Card>
            <Card class="p-4 border-slate-200/60 dark:border-slate-800/60 shadow-xs flex items-center gap-4">
                <div class="p-3 bg-rose-500/10 text-rose-500 rounded-lg">
                    <XCircle class="w-5 h-5" />
                </div>
                <div>
                    <p class="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Revoked Links</p>
                    <p class="text-xl font-bold text-slate-800 dark:text-slate-200 mt-0.5">{{ stats.revoked }}</p>
                </div>
            </Card>
        </div>

        <!-- MAIN SECTION -->
        <main class="flex-1 p-8 overflow-hidden flex flex-col">
            <!-- SEARCH AND FILTER -->
            <div class="mb-4 flex items-center gap-3 shrink-0">
                <div class="relative flex-1 max-w-sm">
                    <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input v-model="searchQuery" placeholder="Search by key or bucket..." class="pl-9 h-9 text-xs" />
                </div>
            </div>

            <!-- TABLE CONTAINER -->
            <Card class="flex-1 overflow-hidden border-slate-200 dark:border-slate-800 shadow-xs flex flex-col">
                <div class="flex-1 overflow-auto">
                    <Table>
                        <TableHeader class="bg-muted/30 sticky top-0 z-10">
                            <TableRow>
                                <TableHead class="w-[20%]">Bucket</TableHead>
                                <TableHead class="w-[30%]">Object Key</TableHead>
                                <TableHead class="w-[15%]">Created At</TableHead>
                                <TableHead class="w-[15%]">Expires At</TableHead>
                                <TableHead class="w-[10%]">Status</TableHead>
                                <TableHead class="w-[10%] text-right pr-6">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-if="filteredLinks.length === 0">
                                <TableCell colspan="6" class="text-center py-12 text-muted-foreground">
                                    <div class="flex flex-col items-center gap-2">
                                        <LinkIcon class="w-8 h-8 text-slate-300" />
                                        <span class="text-xs font-semibold">No presigned links found.</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow v-for="link in filteredLinks" :key="link.id" class="group hover:bg-muted/30 transition-colors">
                                <TableCell class="font-medium text-xs">{{ link.bucket }}</TableCell>
                                <TableCell class="text-xs font-mono truncate max-w-xs" :title="link.key">{{ link.key }}</TableCell>
                                <TableCell class="text-xs text-muted-foreground">{{ formatDate(link.created_at) }}</TableCell>
                                <TableCell class="text-xs text-muted-foreground">{{ formatDate(link.expires_at) }}</TableCell>
                                <TableCell>
                                    <Badge :variant="getStatusVariant(link)" class="text-[9px] uppercase font-bold py-0 h-4">
                                        {{ getStatus(link) }}
                                    </Badge>
                                </TableCell>
                                <TableCell class="text-right pr-6">
                                    <div class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-primary"
                                            @click="copyLink(link.url)">
                                            <Copy class="w-3.5 h-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground hover:text-primary"
                                            @click="showDetails(link)">
                                            <Eye class="w-3.5 h-3.5" />
                                        </Button>
                                        <Button v-if="!link.is_revoked && !isExpired(link)" variant="ghost" size="icon" 
                                            class="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-950/20"
                                            @click="revokeLink(link)">
                                            <XCircle class="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </main>

        <!-- DIALOG: GENERATE LINK -->
        <Dialog :open="showCreateDialog" @update:open="showCreateDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Generate Presigned URL</DialogTitle>
                    <DialogDescription>Create a temporary secure URL for direct access to an object.</DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label for="bucket-select" class="text-xs font-semibold">Select Bucket</Label>
                        <Select v-model="newLink.bucket" id="bucket-select">
                            <SelectTrigger class="w-full text-xs">
                                <SelectValue placeholder="Choose a bucket..." />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem v-for="b in bucketsList" :key="b" :value="b" class="text-xs">{{ b }}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div class="space-y-2">
                        <Label for="object-key" class="text-xs font-semibold">Object Key</Label>
                        <Input v-model="newLink.key" id="object-key" placeholder="path/to/my-file.jpg" class="text-xs" />
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <Label for="expiry" class="text-xs font-semibold">Expiration</Label>
                            <Select v-model="newLink.expirySeconds" id="expiry">
                                <SelectTrigger class="w-full text-xs">
                                    <SelectValue placeholder="Select duration" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="3600" class="text-xs">1 Hour</SelectItem>
                                    <SelectItem value="86400" class="text-xs">24 Hours</SelectItem>
                                    <SelectItem value="604800" class="text-xs">7 Days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div class="space-y-2">
                            <Label for="allowed-ip" class="text-xs font-semibold">IP Restriction (CIDR/IP)</Label>
                            <Input v-model="newLink.allowedIp" id="allowed-ip" placeholder="e.g. 192.168.1.1 (Optional)" class="text-xs" />
                        </div>
                    </div>

                    <div class="flex items-center justify-between border p-3 rounded-lg bg-slate-50/50 dark:bg-slate-900/50">
                        <div class="space-y-0.5">
                            <Label class="text-xs font-semibold">One-time Use Only</Label>
                            <p class="text-[10px] text-muted-foreground">Self-destruct link immediately upon first access.</p>
                        </div>
                        <Switch v-model="newLink.oneTimeUse" />
                    </div>
                </div>
                <DialogFooter class="sm:justify-end gap-2">
                    <Button variant="outline" size="sm" @click="showCreateDialog = false" class="text-xs">Cancel</Button>
                    <Button size="sm" @click="generateLink" :disabled="!newLink.bucket || !newLink.key" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs">Generate URL</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <!-- DIALOG: DETAILS & QR CODE -->
        <Dialog :open="showDetailsDialog" @update:open="showDetailsDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle class="text-sm font-mono truncate">{{ selectedLink?.key.split('/').pop() }}</DialogTitle>
                    <DialogDescription class="text-[10px] font-mono break-all">{{ selectedLink?.key }}</DialogDescription>
                </DialogHeader>
                <div class="flex flex-col items-center py-4 space-y-4">
                    <div v-if="qrCodeUrl" class="p-2 border rounded-xl bg-white shadow-xs">
                        <img :src="qrCodeUrl" alt="QR Code" class="w-40 h-40" />
                    </div>
                    
                    <div class="w-full space-y-2 border-t pt-4">
                        <div class="flex justify-between text-xs">
                            <span class="text-muted-foreground">Bucket</span>
                            <span class="font-semibold">{{ selectedLink?.bucket }}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-muted-foreground">Expires At</span>
                            <span class="font-semibold">{{ formatDate(selectedLink?.expires_at) }}</span>
                        </div>
                        <div class="flex justify-between text-xs" v-if="selectedLink?.allowed_ip">
                            <span class="text-muted-foreground">IP Restriction</span>
                            <span class="font-semibold font-mono">{{ selectedLink?.allowed_ip }}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-muted-foreground">One-time Use</span>
                            <span class="font-semibold">{{ selectedLink?.one_time_use ? 'Yes' : 'No' }}</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-muted-foreground">Revoked</span>
                            <span class="font-semibold text-rose-500">{{ selectedLink?.is_revoked ? 'Yes' : 'No' }}</span>
                        </div>
                    </div>

                    <div class="w-full flex items-center gap-2 border p-2 rounded-lg bg-slate-50 dark:bg-slate-900">
                        <input readonly :value="selectedLink?.url" class="flex-1 bg-transparent text-[10px] font-mono border-0 focus:ring-0 outline-none text-muted-foreground select-all truncate" />
                        <Button size="xs" variant="secondary" class="h-7 text-[10px]" @click="copyLink(selectedLink?.url)">
                            <Copy class="w-3 h-3" />
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Link2 as LinkIcon, Plus, Copy, Eye, XCircle, Search, CheckCircle, Clock, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'vue-sonner'
import QRCode from 'qrcode'
import { useAuth } from '@/composables/useAuth'

const { authFetch } = useAuth()
const config = useRuntimeConfig()
const API_BASE = config.public.apiBase || 'http://localhost:8080'

// States
const presignedLinks = ref([])
const bucketsList = ref([])
const searchQuery = ref('')
const showCreateDialog = ref(false)
const showDetailsDialog = ref(false)
const selectedLink = ref(null)
const qrCodeUrl = ref('')

const newLink = ref({
    bucket: '',
    key: '',
    expirySeconds: '3600',
    allowedIp: '',
    oneTimeUse: false
})

// Stats computation
const stats = computed(() => {
    const total = presignedLinks.value.length
    const now = new Date()
    let active = 0
    let expired = 0
    let revoked = 0

    presignedLinks.value.forEach(link => {
        if (link.is_revoked) {
            revoked++
        } else if (new Date(link.expires_at) < now) {
            expired++
        } else {
            active++
        }
    })

    return { total, active, expired, revoked }
})

// Filter links
const filteredLinks = computed(() => {
    return presignedLinks.value.filter(link => {
        const term = searchQuery.value.toLowerCase()
        return link.key.toLowerCase().includes(term) || link.bucket.toLowerCase().includes(term)
    })
})

// Methods
async function fetchLinks() {
    try {
        const res = await authFetch(`${API_BASE}/admin/presigns`)
        if (res.ok) {
            presignedLinks.value = await res.json()
        }
    } catch (e) {
        toast.error('Failed to load presigned links')
    }
}

async function fetchBuckets() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets`)
        if (res.ok) {
            bucketsList.value = await res.json()
        }
    } catch (e) {
        console.error('Failed to load buckets')
    }
}

function openCreateDialog() {
    newLink.value = {
        bucket: bucketsList.value[0] || '',
        key: '',
        expirySeconds: '3600',
        allowedIp: '',
        oneTimeUse: false
    }
    showCreateDialog.value = true
}

async function generateLink() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets/${newLink.value.bucket}/objects/share`, {
            method: 'POST',
            body: {
                key: newLink.value.key,
                expirySeconds: parseInt(newLink.value.expirySeconds),
                allowedIp: newLink.value.allowedIp,
                oneTimeUse: newLink.value.oneTimeUse
            }
        })
        if (res.ok) {
            toast.success('Presigned link generated successfully')
            showCreateDialog.value = false
            await fetchLinks()
        } else {
            throw new Error('Failed to generate')
        }
    } catch (e) {
        toast.error('Failed to generate link')
    }
}

async function revokeLink(link) {
    try {
        const res = await authFetch(`${API_BASE}/admin/presigns?signature=${encodeURIComponent(link.signature)}`, {
            method: 'DELETE'
        })
        if (res.ok) {
            toast.success('Link revoked successfully')
            await fetchLinks()
        } else {
            throw new Error()
        }
    } catch (e) {
        toast.error('Failed to revoke link')
    }
}

async function showDetails(link) {
    selectedLink.value = link
    qrCodeUrl.value = ''
    showDetailsDialog.value = true
    try {
        qrCodeUrl.value = await QRCode.toDataURL(link.url, {
            width: 200,
            margin: 1,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            }
        })
    } catch (e) {
        console.error('Failed to generate QR Code', e)
    }
}

function copyLink(url) {
    navigator.clipboard.writeText(url)
    toast.success('Link copied to clipboard')
}

function isExpired(link) {
    return new Date(link.expires_at) < new Date()
}

function getStatus(link) {
    if (link.is_revoked) return 'Revoked'
    if (isExpired(link)) return 'Expired'
    return 'Active'
}

function getStatusVariant(link) {
    if (link.is_revoked) return 'destructive'
    if (isExpired(link)) return 'secondary'
    return 'success'
}

function formatDate(dateStr) {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return d.toLocaleString()
}

onMounted(() => {
    fetchLinks()
    fetchBuckets()
})
</script>
