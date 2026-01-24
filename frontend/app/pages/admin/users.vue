<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <h1 class="text-lg font-semibold tracking-tight">Identity & Access Management</h1>
                <p class="text-xs text-muted-foreground">Control security credentials and access permissions.</p>
            </div>
            <div class="flex items-center gap-3">
                <Button variant="outline" size="sm" @click="fetchUsers" :disabled="loading"
                    class="h-8 border-slate-200 dark:border-slate-800">
                    <RefreshCw class="w-3.5 h-3.5 mr-2" :class="{ 'animate-spin': loading }" />
                    Refresh
                </Button>
                <Button size="sm" @click="showCreateUserDialog = true"
                    class="h-8 bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95">
                    <UserPlus class="w-3.5 h-3.5 mr-2" /> Provision User
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto">
            <div class="p-6">
                <Card class="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                    <Table>
                        <TableHeader class="bg-muted/30">
                            <TableRow>
                                <TableHead class="w-[200px]">Principal</TableHead>
                                <TableHead class="w-[350px]">Access Credentials</TableHead>
                                <TableHead>Effective Policies</TableHead>
                                <TableHead class="text-right w-[120px] px-6">Management</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            <TableRow v-for="(user, username) in users" :key="username"
                                class="group transition-colors hover:bg-muted/30">
                                <TableCell class="py-4 align-top">
                                    <div class="flex items-start gap-3">
                                        <div
                                            class="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                                            <component
                                                :is="username === 'admin' ? ShieldCheck : username === 'anonymous' ? Eye : User"
                                                class="w-4 h-4 text-primary" />
                                        </div>
                                        <div class="flex flex-col min-w-0">
                                            <div class="flex items-center gap-2">
                                                <span class="font-bold text-sm tracking-tight truncate">{{ username
                                                }}</span>
                                                <Badge v-if="username === 'admin'" variant="default"
                                                    class="text-[8px] h-3.5 bg-indigo-500 hover:bg-indigo-500 py-0 uppercase tracking-widest leading-none">
                                                    Root</Badge>
                                                <Badge v-if="username === 'anonymous'" variant="outline"
                                                    class="text-[8px] h-3.5 border-blue-500/30 text-blue-500 py-0 uppercase tracking-widest leading-none">
                                                    Guest</Badge>
                                            </div>
                                            <span
                                                class="text-[10px] text-muted-foreground font-medium mt-0.5 truncate uppercase opacity-60">
                                                {{ user.Username === 'admin' ? 'System Administrator' : user.Username
                                                    === 'anonymous' ? 'Unauthenticated Access' : 'Service Account' }}
                                            </span>
                                        </div>
                                    </div>
                                </TableCell>

                                <TableCell class="py-4 align-top">
                                    <div v-if="user.accessKeys && user.accessKeys.length > 0" class="space-y-1.5 pr-4">
                                        <div v-for="key in user.accessKeys" :key="key.accessKeyId"
                                            class="p-2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col group/key relative">
                                            <div class="flex items-center justify-between gap-2 overflow-hidden">
                                                <div class="flex flex-col min-w-0">
                                                    <span
                                                        class="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter opacity-70">Identity
                                                        Key</span>
                                                    <code
                                                        class="text-[10px] font-mono font-bold truncate">{{ key.accessKeyId }}</code>
                                                </div>
                                                <div class="flex items-center gap-1">
                                                    <Button variant="ghost" size="icon"
                                                        class="h-6 w-6 shrink-0 hover:bg-muted"
                                                        @click="copyToClipboard(key.accessKeyId, 'Key ID')">
                                                        <Copy class="w-3 h-3" />
                                                    </Button>
                                                    <Button v-if="username !== 'admin'" variant="ghost" size="icon"
                                                        class="h-6 w-6 shrink-0 text-destructive hover:bg-destructive/10"
                                                        @click="deleteKey(username, key.accessKeyId)">
                                                        <Trash class="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                            <div
                                                class="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 pt-2 overflow-hidden">
                                                <div class="flex flex-col min-w-0">
                                                    <span
                                                        class="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter opacity-70">Secret
                                                        Data</span>
                                                    <code
                                                        class="text-[10px] font-mono font-bold text-amber-600 dark:text-amber-500 truncate italic">
                                                        {{ showSecrets[key.accessKeyId] ? key.secretAccessKey : '••••••••••••••••••••••••••••••••' }}
                                                    </code>
                                                </div>
                                                <div class="flex items-center gap-1">
                                                    <Button variant="ghost" size="icon"
                                                        class="h-6 w-6 shrink-0 hover:bg-muted"
                                                        @click="showSecrets[key.accessKeyId] = !showSecrets[key.accessKeyId]">
                                                        <component :is="showSecrets[key.accessKeyId] ? EyeOff : Eye"
                                                            class="w-3 h-3" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon"
                                                        class="h-6 w-6 shrink-0 hover:bg-muted"
                                                        @click="copyToClipboard(key.secretAccessKey, 'Secret')">
                                                        <Copy class="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-else
                                        class="flex flex-col items-center justify-center h-20 border border-dashed rounded-md bg-muted/20 text-muted-foreground p-4">
                                        <KeyIcon class="w-5 h-5 mb-1 opacity-20" />
                                        <span class="text-[10px] font-medium uppercase tracking-widest italic">Protected
                                            - No active keys</span>
                                    </div>
                                </TableCell>

                                <TableCell class="py-4 align-top">
                                    <div class="flex flex-wrap gap-2 pr-4">
                                        <div v-for="p in user.policies" :key="p.name"
                                            class="flex items-center gap-1.5 h-6 px-2 rounded bg-indigo-500/10 border border-indigo-500/20 group/badge">
                                            <Lock class="w-3 h-3 text-indigo-500" />
                                            <span
                                                class="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 capitalize">{{
                                                    p.name }}</span>
                                            <button v-if="username !== 'admin' && username !== 'anonymous'"
                                                @click="removePolicy(username, p.name)"
                                                class="ml-1 text-indigo-400 hover:text-destructive transition-colors opacity-0 group-hover/badge:opacity-100">
                                                <X class="w-3 h-3" />
                                            </button>
                                        </div>
                                        <Button v-if="username !== 'admin'" variant="outline" size="xs"
                                            class="h-6 px-2 text-[10px] font-bold border-dashed border-indigo-200 dark:border-indigo-900 group/attach hover:bg-indigo-500 hover:text-white hover:border-indigo-500 transition-all"
                                            @click="openPolicyModal(username)">
                                            <Plus class="w-3 h-3 mr-1" /> Attach
                                        </Button>
                                    </div>
                                </TableCell>

                                <TableCell class="py-4 text-right px-6 align-top">
                                    <DropdownMenu v-if="username !== 'anonymous'">
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" class="h-8 w-8 hover:bg-muted">
                                                <MoreHorizontal class="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" class="w-56">
                                            <DropdownMenuItem v-if="username !== 'admin'"
                                                @click="generateKey(username)">
                                                <KeyIcon class="w-4 h-4 mr-2" />
                                                Generate New Key
                                            </DropdownMenuItem>
                                            <DropdownMenuItem @click="openChangePasswordDialog(username)">
                                                <Fingerprint class="w-4 h-4 mr-2" />
                                                Change Password
                                            </DropdownMenuItem>
                                            <template v-if="username !== 'admin'">
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem @click="deleteUser(username)"
                                                    class="text-destructive focus:bg-destructive/10">
                                                    <UserMinus class="w-4 h-4 mr-2" />
                                                    Erase Account
                                                </DropdownMenuItem>
                                            </template>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    <div v-else class="flex justify-end pr-2 py-1">
                                        <Badge variant="outline"
                                            class="text-[8px] font-bold uppercase tracking-tighter opacity-40 border-slate-300 pointer-events-none">
                                            Immutable</Badge>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Card>
            </div>
        </main>

        <!-- DIALOGS -->
        <Dialog :open="showCreateUserDialog" @update:open="showCreateUserDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <UserPlus class="w-5 h-5 text-primary" />
                    </div>
                    <DialogTitle>Provision New User</DialogTitle>
                    <DialogDescription>
                        Cloud service accounts require dedicated credentials for programmatic access.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-6">
                    <div class="space-y-2">
                        <Label for="username" class="text-xs font-bold uppercase tracking-wider opacity-70">Global
                            Username
                            ID</Label>
                        <Input id="username" v-model="newUsername" placeholder="e.g. storage-indexer-svc"
                            @keyup.enter="createUser"
                            class="h-10 focus:ring-primary border-slate-300 dark:border-slate-800 shadow-xs"
                            autofocus />
                        <p class="text-[10px] text-muted-foreground italic">Principal IDs must be globally unique across
                            the
                            engine.</p>
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <Button variant="outline" @click="showCreateUserDialog = false">Dismiss</Button>
                        <Button @click="createUser" :disabled="!newUsername || loading" class="bg-primary">
                            <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
                            Initialize Account
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <Dialog :open="showPolicyModal" @update:open="showPolicyModal = false">
            <DialogContent class="sm:max-w-2xl">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
                        <Lock class="w-5 h-5 text-indigo-600" />
                    </div>
                    <DialogTitle>Forge Permission Policy</DialogTitle>
                    <DialogDescription>
                        Attached to <strong class="text-slate-900 dark:text-slate-100 italic">{{ selectedUserForPolicy
                        }}</strong>
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <!-- Mode Selector -->
                    <div class="flex gap-2 p-1 bg-muted rounded-lg">
                        <button @click="attachmentMode = 'template'"
                            :class="attachmentMode === 'template' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
                            class="flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all">
                            <div class="flex items-center justify-center gap-2">
                                <Shield class="w-3.5 h-3.5" />
                                Global Template
                            </div>
                        </button>
                        <button @click="attachmentMode = 'inline'"
                            :class="attachmentMode === 'inline' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
                            class="flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all">
                            <div class="flex items-center justify-center gap-2">
                                <FileCode class="w-3.5 h-3.5" />
                                Inline Policy
                            </div>
                        </button>
                    </div>

                    <!-- Template Mode -->
                    <div v-if="attachmentMode === 'template'" class="space-y-2">
                        <Label class="text-xs font-bold uppercase tracking-wider opacity-70">Select Policy
                            Template</Label>
                        <select v-model="selectedTemplate"
                            class="w-full h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-background px-3 py-2 text-sm shadow-sm transition-colors cursor-pointer focus:ring-2 focus:ring-primary">
                            <option value="" disabled>Choose a template...</option>
                            <option v-for="template in policyTemplates" :key="template.name" :value="template.name">
                                {{ template.name }}
                            </option>
                        </select>
                        <div v-if="selectedTemplate"
                            class="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                            <div class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                                Preview</div>
                            <pre
                                class="text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-auto max-h-32">{{
                                    JSON.stringify(policyTemplates.find(t => t.name === selectedTemplate), null, 2) }}</pre>
                        </div>
                    </div>

                    <!-- Inline Mode -->
                    <div v-if="attachmentMode === 'inline'" class="space-y-2">
                        <div class="flex items-center justify-between">
                            <Label class="text-xs font-bold uppercase tracking-wider opacity-70">JSON Document (IAM
                                Standard)</Label>
                            <Badge variant="outline" class="font-mono text-[9px] h-4 scale-90">2012-10-17</Badge>
                        </div>
                        <div class="relative group">
                            <Textarea v-model="newPolicyJson" rows="14"
                                class="font-mono text-[11px] tabular-nums bg-slate-950 text-emerald-400 border-0 ring-1 ring-slate-800 focus:ring-primary shadow-2xl rounded-lg p-4 resize-none leading-relaxed"
                                spellcheck="false" />
                            <div
                                class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="secondary" size="xs"
                                    class="h-6 text-[9px] bg-slate-800 hover:bg-slate-700 text-white"
                                    @click="formatJson">Format</Button>
                            </div>
                        </div>
                    </div>

                    <div class="flex justify-end gap-3 pt-2">
                        <Button variant="outline" @click="showPolicyModal = false">Discard</Button>
                        <Button @click="attachPolicy" :disabled="attachmentMode === 'template' && !selectedTemplate"
                            class="bg-indigo-600 hover:bg-indigo-700">
                            Sync Permissions
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <Dialog :open="showChangePasswordDialog" @update:open="showChangePasswordDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                        <Fingerprint class="w-5 h-5 text-amber-600" />
                    </div>
                    <DialogTitle>Reset Credentials</DialogTitle>
                    <DialogDescription>
                        Renew master password for principal <span
                            class="font-bold underline text-slate-900 dark:text-slate-100">{{ selectedUserForPassword
                            }}</span>.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-6">
                    <div class="space-y-2">
                        <Label class="text-xs font-bold uppercase tracking-wider opacity-70">New Private Phrase</Label>
                        <Input v-model="newPassword" type="password" placeholder="••••••••••••"
                            @keyup.enter="updatePassword" class="h-10 border-slate-300 dark:border-slate-800 shadow-xs"
                            autofocus />
                    </div>
                    <div class="flex justify-end gap-3 pt-4">
                        <Button variant="outline" @click="showChangePasswordDialog = false">Cancel</Button>
                        <Button @click="updatePassword" class="bg-amber-600 hover:bg-amber-700">
                            Apply Force Reset
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
    Plus, MoreHorizontal, ShieldCheck, UserPlus, Trash, RefreshCw, KeyIcon,
    Shield, Lock, Copy, Eye, EyeOff, User, X, Fingerprint, Loader2, FileCode
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/composables/useAuth'

const API_BASE = 'http://localhost:8080'
const { authState, authFetch } = useAuth()
const router = useRouter()

const users = ref({})
const loading = ref(false)
const showSecrets = ref({})
const showCreateUserDialog = ref(false)
const newUsername = ref('')
const showChangePasswordDialog = ref(false)
const selectedUserForPassword = ref('')
const newPassword = ref('')
const showPolicyModal = ref(false)
const selectedUserForPolicy = ref(null)
const attachmentMode = ref('template')
const policyTemplates = ref([])
const selectedTemplate = ref('')
const newPolicyJson = ref(JSON.stringify({
    name: "ReadOnlyAccess",
    version: "2012-10-17",
    statement: [{
        effect: "Allow",
        action: ["s3:GetObject", "s3:ListBucket"],
        resource: ["arn:aws:s3:::*"]
    }]
}, null, 2))


async function fetchUsers() {
    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/users`)
        if (res.ok) {
            users.value = await res.json()
        }
    } catch (e) {
        toast.error('Identity sync failed.')
    } finally {
        loading.value = false
    }
}

async function fetchPolicyTemplates() {
    try {
        const res = await authFetch(`${API_BASE}/admin/policies`)
        if (res.ok) {
            policyTemplates.value = await res.json()
        }
    } catch (e) {
        console.error('Failed to fetch policy templates')
    }
}

async function createUser() {
    const username = newUsername.value.trim()
    if (!username) return
    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/users`, {
            method: 'POST',
            body: JSON.stringify({ username })
        })
        if (res.ok) {
            toast.success(`Principal "${username}" formed.`)
            showCreateUserDialog.value = false
            newUsername.value = ''
            await fetchUsers()
        } else {
            const err = await res.text()
            throw new Error(err)
        }
    } catch (e) {
        toast.error(`Provision failed: ${e.message}`)
    } finally {
        loading.value = false
    }
}

async function deleteUser(username) {
    if (!confirm(`Erase all data and credentials for principal "${username}"? This is irreversible.`)) return
    try {
        const res = await authFetch(`${API_BASE}/admin/users/${username}`, { method: 'DELETE' })
        if (res.ok) {
            toast.success('Account decommissioned.')
            await fetchUsers()
        }
    } catch (e) {
        toast.error('Purge failed.')
    }
}

async function generateKey(username) {
    try {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/keys`, { method: 'POST' })
        if (res.ok) {
            toast.success('Signed new access pair.')
            await fetchUsers()
        }
    } catch (e) {
        toast.error('Identity forge failed.')
    }
}

async function deleteKey(username, keyId) {
    if (!confirm(`Revoke and destroy access key "${keyId}"? Current sessions using this key will be terminated.`)) return
    try {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/keys/${keyId}`, { method: 'DELETE' })
        if (res.ok) {
            toast.success('Access key revoked.')
            await fetchUsers()
        }
    } catch (e) {
        toast.error('Key destruction failed.')
    }
}

function openChangePasswordDialog(username) {
    selectedUserForPassword.value = username
    newPassword.value = ''
    showChangePasswordDialog.value = true
}

async function updatePassword() {
    if (!newPassword.value) {
        toast.error('Private phrase required.')
        return
    }
    try {
        const res = await authFetch(`${API_BASE}/admin/users/${selectedUserForPassword.value}/password`, {
            method: 'POST',
            body: { password: newPassword.value }
        })
        if (res.ok) {
            toast.success('Credentials updated successfully.')
            showChangePasswordDialog.value = false
        } else {
            const err = await res.text()
            throw new Error(err)
        }
    } catch (e) {
        toast.error(`Reset failed: ${e.message}`)
    }
}

function openPolicyModal(username) {
    selectedUserForPolicy.value = username
    attachmentMode.value = 'template'
    selectedTemplate.value = ''
    showPolicyModal.value = true
}

async function attachPolicy() {
    try {
        if (attachmentMode.value === 'template') {
            // Attach global template
            const res = await authFetch(`${API_BASE}/admin/users/${selectedUserForPolicy.value}/policies/attach`, {
                method: 'POST',
                body: { templateName: selectedTemplate.value }
            })
            if (res.ok) {
                showPolicyModal.value = false
                toast.success('Policy template attached successfully.')
                await fetchUsers()
            } else {
                const errorData = await res.json()
                throw new Error(errorData.error || 'Failed to attach template')
            }
        } else {
            // Attach inline policy
            const policy = JSON.parse(newPolicyJson.value)
            const res = await authFetch(`${API_BASE}/admin/users/${selectedUserForPolicy.value}/policies`, {
                method: 'POST',
                body: policy
            })
            if (res.ok) {
                showPolicyModal.value = false
                toast.success('Inline policy synchronized.')
                await fetchUsers()
            } else {
                const err = await res.text()
                throw new Error(err)
            }
        }
    } catch (e) {
        toast.error(`Sync error: ${e.message}`)
    }
}

async function removePolicy(username, policyName) {
    if (!confirm(`Revoke policy "${policyName}" from "${username}"?`)) return
    try {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/policies/${policyName}`, { method: 'DELETE' })
        if (res.ok) {
            toast.success('Rights restricted.')
            await fetchUsers()
        }
    } catch (e) {
        toast.error('Revocation failed.')
    }
}

function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to secure buffer.`)
}

function formatJson() {
    try {
        const obj = JSON.parse(newPolicyJson.value)
        newPolicyJson.value = JSON.stringify(obj, null, 2)
    } catch (e) {
        toast.error('Invalid JSON structure.')
    }
}

onMounted(() => {
    fetchUsers()
    fetchPolicyTemplates()
})
</script>

<style scoped>
.font-mono {
    font-family: 'Fira Code', 'JetBrains Mono', 'Source Code Pro', monospace;
}
</style>
