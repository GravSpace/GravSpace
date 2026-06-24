<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <h1 class="text-lg font-semibold tracking-tight">Identity & Access Management</h1>
                <p class="text-xs text-muted-foreground">Control security credentials and access permissions.</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="relative">
                    <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input v-model="searchQuery" type="text" placeholder="Filter principals..."
                        class="h-8 w-48 pl-8 pr-3 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60" />
                </div>
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
            <div class="p-6 space-y-3">
                <!-- User Cards -->
                <div v-for="(user, username) in filteredUsers" :key="username"
                    class="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300">

                    <!-- Card Header Row -->
                    <div class="flex items-center justify-between px-5 py-3.5">
                        <!-- Left: Avatar + Identity -->
                        <div class="flex items-center gap-3 min-w-0">
                            <div :class="[
                                'h-9 w-9 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-200',
                                username === 'admin'
                                    ? 'bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30'
                                    : username === 'anonymous'
                                        ? 'bg-gradient-to-br from-sky-500/15 to-cyan-500/15 border border-sky-500/25'
                                        : 'bg-gradient-to-br from-slate-500/10 to-slate-400/10 border border-slate-300 dark:border-slate-700'
                            ]">
                                <component
                                    :is="username === 'admin' ? ShieldCheck : username === 'anonymous' ? Eye : User"
                                    :class="[
                                        'w-4 h-4',
                                        username === 'admin' ? 'text-indigo-500' : username === 'anonymous' ? 'text-sky-500' : 'text-slate-500'
                                    ]" />
                            </div>
                            <div class="flex flex-col min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="font-bold text-sm tracking-tight truncate">{{ username }}</span>
                                    <Badge v-if="username === 'admin'" variant="default"
                                        class="text-[8px] h-4 bg-indigo-500 hover:bg-indigo-500 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold">
                                        Root</Badge>
                                    <Badge v-if="username === 'anonymous'" variant="outline"
                                        class="text-[8px] h-4 border-sky-500/30 text-sky-500 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold">
                                        Guest</Badge>
                                </div>
                                <span
                                    class="text-[10px] text-muted-foreground font-medium mt-0.5 truncate uppercase tracking-wider opacity-50">
                                    {{ username === 'admin' ? 'System Administrator' : username === 'anonymous' ?
                                        'Unauthenticated Access' : 'Service Account' }}
                                </span>
                            </div>
                        </div>

                        <!-- Center: Policies -->
                        <div class="flex items-center gap-1.5 flex-wrap justify-center max-w-[40%]">
                            <div v-for="p in user.policies" :key="p.name"
                                class="flex items-center gap-1 h-6 px-2 rounded-md bg-indigo-500/8 border border-indigo-500/15 group/badge hover:border-indigo-500/40 transition-colors">
                                <Lock class="w-2.5 h-2.5 text-indigo-500 opacity-70" />
                                <span
                                    class="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 capitalize leading-none">{{
                                        p.name }}</span>
                                <button v-if="username !== 'admin' && username !== 'anonymous'"
                                    @click.stop="removePolicy(username, p.name)"
                                    class="ml-0.5 text-indigo-400 hover:text-destructive transition-colors opacity-0 group-hover/badge:opacity-100">
                                    <X class="w-2.5 h-2.5" />
                                </button>
                            </div>
                            <Button v-if="username !== 'admin'" variant="ghost" size="xs"
                                class="h-6 px-2 text-[10px] font-bold text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600 transition-all"
                                @click="openPolicyModal(username)">
                                <Plus class="w-3 h-3 mr-0.5" /> Attach
                            </Button>
                        </div>

                        <!-- Right: Actions -->
                        <div class="flex items-center gap-1 shrink-0">
                            <template v-if="username !== 'anonymous'">
                                <Button v-if="username !== 'admin'" variant="ghost" size="icon"
                                    class="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                                    @click="generateKey(username)"
                                    title="Generate Access Key">
                                    <KeyIcon class="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon"
                                    class="h-7 w-7 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                                    @click="openChangePasswordDialog(username)"
                                    title="Change Password">
                                    <Fingerprint class="w-3.5 h-3.5" />
                                </Button>
                                <Button v-if="username !== 'admin'" variant="ghost" size="icon"
                                    class="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                                    @click="deleteUser(username)"
                                    title="Delete User">
                                    <UserMinus class="w-3.5 h-3.5" />
                                </Button>
                            </template>
                            <Badge v-else variant="outline"
                                class="text-[8px] font-bold uppercase tracking-tighter opacity-40 border-slate-300 pointer-events-none ml-1">
                                Immutable</Badge>
                        </div>
                    </div>

                    <!-- Access Keys Section (collapsible) -->
                    <div v-if="user.accessKeys && user.accessKeys.length > 0"
                        class="border-t border-slate-100 dark:border-slate-800/80">
                        <button @click="toggleExpanded(username)"
                            class="w-full flex items-center justify-between px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/30 transition-colors">
                            <div class="flex items-center gap-2">
                                <KeyIcon class="w-3 h-3 opacity-50" />
                                <span>{{ user.accessKeys.length }} Access
                                    {{ user.accessKeys.length === 1 ? 'Key' : 'Keys' }}</span>
                            </div>
                            <ChevronDown class="w-3.5 h-3.5 transition-transform duration-200"
                                :class="{ 'rotate-180': expandedUsers[username] }" />
                        </button>

                        <div v-show="expandedUsers[username]"
                            class="px-5 pb-4 pt-1 grid gap-2"
                            :class="user.accessKeys.length > 1 ? 'sm:grid-cols-2' : ''">
                            <div v-for="key in user.accessKeys" :key="key.accessKeyId"
                                class="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-3 space-y-2">
                                <!-- Key ID -->
                                <div class="flex items-center justify-between gap-2">
                                    <div class="flex flex-col min-w-0">
                                        <span
                                            class="text-[8px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Access
                                            Key ID</span>
                                        <code class="text-[11px] font-mono font-bold truncate">{{ key.accessKeyId
                                        }}</code>
                                    </div>
                                    <div class="flex items-center gap-0.5">
                                        <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0 hover:bg-muted"
                                            @click="copyToClipboard(key.accessKeyId, 'Key ID')">
                                            <Copy class="w-3 h-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon"
                                            class="h-6 w-6 shrink-0 text-destructive hover:bg-destructive/10"
                                            @click="deleteKey(username, key.accessKeyId)">
                                            <Trash class="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                                <!-- Secret -->
                                <div
                                    class="flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
                                    <div class="flex flex-col min-w-0">
                                        <span
                                            class="text-[8px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Secret</span>
                                        <code
                                            class="text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400 truncate">
                                            {{ showSecrets[key.accessKeyId] ? key.secretAccessKey :
                                                '••••••••••••••••••••••••' }}
                                        </code>
                                    </div>
                                    <div class="flex items-center gap-0.5">
                                        <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0 hover:bg-muted"
                                            @click="showSecrets[key.accessKeyId] = !showSecrets[key.accessKeyId]">
                                            <component :is="showSecrets[key.accessKeyId] ? EyeOff : Eye"
                                                class="w-3 h-3" />
                                        </Button>
                                        <Button variant="ghost" size="icon" class="h-6 w-6 shrink-0 hover:bg-muted"
                                            @click="copyToClipboard(key.secretAccessKey, 'Secret')">
                                            <Copy class="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Empty keys indicator -->
                    <div v-else-if="username !== 'admin' && username !== 'anonymous'"
                        class="border-t border-dashed border-slate-200/80 dark:border-slate-800/60 px-5 py-2">
                        <div class="flex items-center gap-2 text-muted-foreground">
                            <KeyIcon class="w-3 h-3 opacity-25" />
                            <span class="text-[10px] font-medium uppercase tracking-widest opacity-40 italic">No active
                                credentials</span>
                        </div>
                    </div>
                </div>

                <!-- Empty State -->
                <div v-if="Object.keys(filteredUsers).length === 0 && !loading"
                    class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <div class="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                        <Users class="w-8 h-8 opacity-20" />
                    </div>
                    <span class="text-sm font-medium">{{ searchQuery ? 'No matching principals' : 'No principals configured' }}</span>
                    <span class="text-xs opacity-60 mt-1">{{ searchQuery ? 'Try adjusting your search query' : 'Create your first user to get started' }}</span>
                </div>
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
                                    JSON.stringify(policyTemplates.find(t => t.name === selectedTemplate), null, 2)}}</pre>
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
import { ref, computed, onMounted } from 'vue'

useSeoMeta({
    title: 'IAM Users | GravSpace',
    description: 'Manage administrative principals and cloud service accounts for secure programmatic and console access.',
})
import {
    Plus, ShieldCheck, UserPlus, Trash, RefreshCw, KeyIcon,
    Shield, Lock, Copy, Eye, EyeOff, User, X, Fingerprint, Loader2, FileCode, UserMinus,
    ChevronDown, Search, Users
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/composables/useAuth'

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
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
const searchQuery = ref('')
const expandedUsers = ref({})
const newPolicyJson = ref(JSON.stringify({
    name: "ReadOnlyAccess",
    version: "2012-10-17",
    statement: [{
        effect: "Allow",
        action: ["s3:GetObject", "s3:ListBucket"],
        resource: ["arn:aws:s3:::*"]
    }]
}, null, 2))

const filteredUsers = computed(() => {
    if (!searchQuery.value.trim()) return users.value
    const q = searchQuery.value.toLowerCase()
    const result = {}
    for (const [username, user] of Object.entries(users.value)) {
        if (username.toLowerCase().includes(q)) {
            result[username] = user
        }
    }
    return result
})

function toggleExpanded(username) {
    expandedUsers.value[username] = !expandedUsers.value[username]
}

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
            body: { username }
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
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/users/${username}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to delete user')
            await fetchUsers()
        },
        {
            loading: `Deleting user "${username}"...`,
            success: 'Account decommissioned successfully',
            error: 'Failed to delete user'
        }
    )
}

async function generateKey(username) {
    try {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/keys`, { method: 'POST' })
        if (res.ok) {
            toast.success('Signed new access pair.')
            expandedUsers.value[username] = true
            await fetchUsers()
        }
    } catch (e) {
        toast.error('Identity forge failed.')
    }
}

async function deleteKey(username, keyId) {
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/users/${username}/keys/${keyId}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to revoke key')
            await fetchUsers()
        },
        {
            loading: `Revoking access key "${keyId}"...`,
            success: 'Access key revoked successfully',
            error: 'Failed to revoke access key'
        }
    )
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
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/users/${username}/policies/${policyName}`, { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to revoke policy')
            await fetchUsers()
        },
        {
            loading: `Revoking policy "${policyName}"...`,
            success: 'Policy revoked successfully',
            error: 'Failed to revoke policy'
        }
    )
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
