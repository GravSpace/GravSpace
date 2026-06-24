<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <h1 class="text-lg font-semibold tracking-tight">IAM Policy Templates</h1>
                <p class="text-xs text-muted-foreground">Reusable permission blueprints for access control.</p>
            </div>
            <div class="flex items-center gap-3">
                <div class="relative">
                    <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input v-model="searchQuery" type="text" placeholder="Filter policies..."
                        class="h-8 w-44 pl-8 pr-3 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-background focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-muted-foreground/60" />
                </div>
                <Button size="sm" @click="showPolicyModal = true"
                    class="h-8 bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95">
                    <Plus class="w-3.5 h-3.5 mr-2" /> New Policy
                </Button>
            </div>
        </header>

        <main class="flex-1 overflow-auto">
            <div class="p-6 space-y-2.5">
                <!-- Policy Cards -->
                <div v-for="policy in filteredPolicies" :key="policy.name"
                    class="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300">

                    <!-- Card Header Row -->
                    <div class="flex items-center justify-between px-5 py-3.5 cursor-pointer"
                        @click="togglePolicyDetails(policy.name)">
                        <!-- Left: Icon + Name -->
                        <div class="flex items-center gap-3 min-w-0">
                            <div
                                class="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0 group-hover:from-indigo-500/25 group-hover:to-violet-500/25 transition-colors duration-300">
                                <FileText class="w-4 h-4 text-indigo-500" />
                            </div>
                            <div class="flex flex-col min-w-0">
                                <div class="flex items-center gap-2">
                                    <span class="font-mono text-sm font-bold truncate tracking-tight">{{ policy.name
                                        }}</span>
                                    <Badge variant="outline"
                                        class="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold border-slate-300 dark:border-slate-700 text-muted-foreground shrink-0">
                                        Custom
                                    </Badge>
                                </div>
                                <span
                                    class="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase tracking-wider opacity-50">
                                    {{ getStatementCount(policy) }}
                                    {{ getStatementCount(policy) === 1 ? 'statement' : 'statements' }} ·
                                    {{ getEffect(policy) }}
                                </span>
                            </div>
                        </div>

                        <!-- Center: Action badges -->
                        <div class="flex items-center gap-1.5 flex-wrap justify-center max-w-[45%] px-4">
                            <div v-for="(action, i) in getActions(policy)" :key="i"
                                class="flex items-center gap-1 h-5 px-1.5 rounded bg-amber-500/8 border border-amber-500/15">
                                <span
                                    class="text-[9px] font-semibold text-amber-700 dark:text-amber-400 leading-none font-mono">{{
                                    action }}</span>
                            </div>
                            <span v-if="getActions(policy).length === 0"
                                class="text-[10px] text-muted-foreground italic opacity-50">No actions</span>
                        </div>

                        <!-- Right: Actions + Chevron -->
                        <div class="flex items-center gap-1 shrink-0">
                            <div @click.stop>
                                <Button variant="ghost" size="icon"
                                    class="h-7 w-7 text-muted-foreground hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors"
                                    @click="viewPolicy(policy)" title="View Details">
                                    <Eye class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                            <div @click.stop>
                                <Button variant="ghost" size="icon"
                                    class="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                                    @click="deletePolicy(policy.name)" title="Delete Policy">
                                    <Trash2 class="w-3.5 h-3.5" />
                                </Button>
                            </div>
                            <ChevronDown
                                class="w-3.5 h-3.5 text-muted-foreground/40 ml-1 transition-transform duration-200"
                                :class="{ 'rotate-180': expandedPolicy === policy.name }" />
                        </div>
                    </div>

                    <!-- Expandable Policy Document -->
                    <div v-show="expandedPolicy === policy.name"
                        class="border-t border-slate-100 dark:border-slate-800/80">
                        <div class="px-5 py-4">
                            <div class="flex items-center justify-between mb-2">
                                <span
                                    class="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Policy
                                    Document</span>
                                <Button variant="ghost" size="xs"
                                    class="h-5 text-[9px] px-2 text-muted-foreground hover:text-foreground"
                                    @click="copyPolicyJson(policy)">
                                    <Copy class="w-2.5 h-2.5 mr-1" /> Copy
                                </Button>
                            </div>
                            <pre
                                class="p-3.5 rounded-lg bg-slate-950 text-emerald-400 text-[10px] font-mono overflow-x-auto border border-slate-800 max-h-48 leading-relaxed">{{ formatPolicy(policy) }}</pre>
                        </div>
                    </div>
                </div>

                <!-- Empty State -->
                <div v-if="filteredPolicies.length === 0 && !loading"
                    class="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <div class="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                        <Shield class="w-8 h-8 opacity-20" />
                    </div>
                    <span class="text-sm font-medium">{{
                        searchQuery ?
                            'No matching policies' :
                            'No custom policiesdefined yet'
                        }}</span>
                    <span class="text-xs opacity-60 mt-1">{{
                        searchQuery ? 'Try adjusting your search query'
                            : 'Create your first policy template to get started'
                        }}</span>
                    <Button v-if="!searchQuery" size="sm" class="mt-4" @click="showPolicyModal = true">
                        <Plus class="w-3.5 h-3.5 mr-2" /> Create First Policy
                    </Button>
                </div>
            </div>
        </main>

        <!-- POLICY DIALOG -->
        <Dialog :open="showPolicyModal" @update:open="showPolicyModal = false">
            <DialogContent class="sm:max-w-2xl">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
                        <Shield class="w-5 h-5 text-indigo-600" />
                    </div>
                    <DialogTitle>Define IAM Policy</DialogTitle>
                    <DialogDescription>
                        Create reusable permission templates following AWS IAM JSON standard.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label class="text-xs font-bold uppercase tracking-wider opacity-70">Policy Name</Label>
                        <Input v-model="policyName" placeholder="e.g. ReadOnlyAccess, AuditAccess"
                            class="h-10 focus:ring-primary border-slate-300 dark:border-slate-800 shadow-xs" />
                        <p class="text-[10px] text-muted-foreground italic">Use descriptive names that reflect policy
                            intent</p>
                    </div>
                    <div class="space-y-2">
                        <Tabs default-value="builder" class="w-full">
                            <TabsList class="grid w-full grid-cols-2 h-9">
                                <TabsTrigger value="builder" class="text-xs">Visual Builder</TabsTrigger>
                                <TabsTrigger value="json" class="text-xs">JSON Editor</TabsTrigger>
                            </TabsList>

                            <TabsContent value="builder" class="space-y-4 py-4 mt-2">
                                <!-- List of Statements -->
                                <div class="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
                                    <div v-for="(stmt, index) in builderStatements" :key="index"
                                        class="relative border rounded-lg p-4 bg-muted/20 border-slate-200 dark:border-slate-800 space-y-4">

                                        <!-- Header for Statement -->
                                        <div class="flex items-center justify-between">
                                            <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Statement
                                                #{{ index + 1 }}</span>
                                            <Button v-if="builderStatements.length > 1" size="xs" variant="ghost"
                                                class="h-6 text-destructive hover:bg-destructive/10"
                                                @click="removeStatement(index)">
                                                <Trash2 class="w-3 h-3 mr-1" /> Remove
                                            </Button>
                                        </div>

                                        <!-- Effect & Resource -->
                                        <div class="grid grid-cols-2 gap-4">
                                            <div class="space-y-2">
                                                <Label
                                                    class="text-[10px] font-bold uppercase tracking-wider opacity-70">Effect</Label>
                                                <div class="flex gap-2">
                                                    <Button size="xs"
                                                        :variant="stmt.effect === 'Allow' ? 'default' : 'outline'"
                                                        @click="stmt.effect = 'Allow'"
                                                        class="flex-1 h-8 text-[10px]">Allow</Button>
                                                    <Button size="xs"
                                                        :variant="stmt.effect === 'Deny' ? 'destructive' : 'outline'"
                                                        @click="stmt.effect = 'Deny'"
                                                        class="flex-1 h-8 text-[10px]">Deny</Button>
                                                </div>
                                            </div>
                                            <div class="space-y-2">
                                                <Label
                                                    class="text-[10px] font-bold uppercase tracking-wider opacity-70">Resource
                                                    ARN</Label>
                                                <Input v-model="stmt.resource" placeholder="arn:aws:s3:::*"
                                                    class="h-8 text-xs font-mono" />
                                            </div>
                                        </div>

                                        <!-- Actions Selector -->
                                        <div class="space-y-2">
                                            <Label class="text-[10px] font-bold uppercase tracking-wider opacity-70">S3
                                                Actions</Label>
                                            <div class="grid grid-cols-2 gap-2">
                                                <div v-for="action in availableActions" :key="action.id"
                                                    class="flex items-center space-x-2 p-1.5 rounded border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                                                    @click="toggleStatementAction(index, action.id)">
                                                    <input type="checkbox" :checked="stmt.actions.includes(action.id)"
                                                        class="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer" />
                                                    <span class="text-[10px] font-medium leading-none">{{ action.label
                                                        }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Add Statement Button -->
                                <div class="flex justify-between items-center pt-2">
                                    <Button size="sm" variant="outline" @click="addStatement" class="h-8 text-xs">
                                        <Plus class="w-3.5 h-3.5 mr-1.5" /> Add Statement
                                    </Button>
                                    <div class="flex items-center gap-2">
                                        <span class="text-[9px] text-muted-foreground">Auto-sync JSON</span>
                                        <Switch :model-value="builderSync" @update:model-value="v => builderSync = v"
                                            class="scale-75" />
                                    </div>
                                </div>
                            </TabsContent>

                            <TabsContent value="json" class="space-y-2 mt-2">
                                <div class="flex items-center justify-between">
                                    <Label class="text-[10px] font-bold uppercase tracking-wider opacity-70">Policy
                                        Document
                                        (JSON)</Label>
                                    <Badge variant="outline" class="font-mono text-[9px] h-4 scale-90">IAM 2012-10-17
                                    </Badge>
                                </div>
                                <div class="relative group">
                                    <Textarea v-model="newPolicyJson" rows="12"
                                        class="font-mono text-[11px] tabular-nums bg-slate-950 text-emerald-400 border-0 ring-1 ring-slate-800 focus:ring-primary shadow-2xl rounded-lg p-4 resize-none leading-relaxed"
                                        spellcheck="false" />
                                    <div
                                        class="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="secondary" size="xs"
                                            class="h-6 text-[9px] bg-slate-800 hover:bg-slate-700 text-white"
                                            @click="formatJson">Format</Button>
                                    </div>
                                </div>
                            </TabsContent>
                        </Tabs>
                    </div>
                    <div class="flex justify-end gap-3 pt-2">
                        <Button variant="outline" @click="showPolicyModal = false">Cancel</Button>
                        <Button @click="createPolicy" :disabled="!policyName" class="bg-indigo-600 hover:bg-indigo-700">
                            <Shield class="w-4 h-4 mr-2" />
                            Create Policy
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- VIEW POLICY DIALOG -->
        <Dialog :open="!!selectedPolicy" @update:open="selectedPolicy = null">
            <DialogContent class="sm:max-w-2xl">
                <DialogHeader>
                    <div class="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
                        <Eye class="w-5 h-5 text-indigo-600" />
                    </div>
                    <DialogTitle>{{ selectedPolicy?.name }}</DialogTitle>
                    <DialogDescription>
                        Policy document details
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <pre
                        class="p-4 rounded-lg bg-slate-950 text-emerald-400 text-[11px] font-mono overflow-x-auto border border-slate-800 max-h-96">
                {{ formatPolicy(selectedPolicy) }}</pre>
                    <div class="flex justify-end gap-3">
                        <Button variant="outline" @click="selectedPolicy = null">Close</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'

useSeoMeta({
    title: 'IAM Policies | GravSpace',
    description: 'Manage reusable permission templates and secure your cloud storage resources with fine-grained access control.',
})
import { Plus, Trash2, Shield, ShieldCheck, FileText, Eye, Search, ChevronDown, Copy } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { useAuth } from '@/composables/useAuth'

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
const { authFetch } = useAuth()

const policies = ref([])
const loading = ref(false)
const showPolicyModal = ref(false)
const policyName = ref('')
const expandedPolicy = ref(null)
const selectedPolicy = ref(null)
const searchQuery = ref('')

const builderStatements = ref([
    {
        effect: 'Allow',
        resource: 'arn:aws:s3:::*',
        actions: ['s3:GetObject', 's3:ListBucket']
    }
])
const builderSync = ref(true)

const availableActions = [
    { id: 's3:ListAllMyBuckets', label: 'List All Buckets' },
    { id: 's3:ListBucket', label: 'List Bucket Content' },
    { id: 's3:GetBucketLocation', label: 'Get Bucket Location' },
    { id: 's3:GetObject', label: 'Get/Download Object' },
    { id: 's3:PutObject', label: 'Put/Upload Object' },
    { id: 's3:DeleteObject', label: 'Delete Object' },
    { id: 's3:GetObjectTagging', label: 'Get Tags' },
    { id: 's3:PutObjectTagging', label: 'Put Tags' }
]

const newPolicyJson = ref('')

const filteredPolicies = computed(() => {
    if (!searchQuery.value.trim()) return policies.value || []
    const q = searchQuery.value.toLowerCase()
    return (policies.value || []).filter(p => p.name.toLowerCase().includes(q))
})

function getStatementCount(policy) {
    try {
        const parsed = typeof policy === 'string' ? JSON.parse(policy) : policy
        if (parsed.statement && Array.isArray(parsed.statement)) {
            return parsed.statement.length
        }
    } catch (e) { }
    return 0
}

function getEffect(policy) {
    try {
        const parsed = typeof policy === 'string' ? JSON.parse(policy) : policy
        if (parsed.statement && Array.isArray(parsed.statement)) {
            const effects = new Set(parsed.statement.map(s => s.effect))
            return Array.from(effects).join(' + ')
        }
    } catch (e) { }
    return 'Unknown'
}

function copyPolicyJson(policy) {
    navigator.clipboard.writeText(formatPolicy(policy))
    toast.success('Policy JSON copied to clipboard.')
}

function addStatement() {
    builderStatements.value.push({
        effect: 'Allow',
        resource: 'arn:aws:s3:::*',
        actions: []
    })
}

function removeStatement(index) {
    if (builderStatements.value.length > 1) {
        builderStatements.value.splice(index, 1)
    }
}

function toggleStatementAction(stmtIndex, actionId) {
    const actions = builderStatements.value[stmtIndex].actions
    const idx = actions.indexOf(actionId)
    if (idx > -1) {
        actions.splice(idx, 1)
    } else {
        actions.push(actionId)
    }
}

watch(builderStatements, () => {
    if (!builderSync.value) return
    const policy = {
        version: "2012-10-17",
        statement: builderStatements.value.map(stmt => ({
            effect: stmt.effect,
            action: stmt.actions,
            resource: [stmt.resource]
        }))
    }
    newPolicyJson.value = JSON.stringify(policy, null, 2)
}, { immediate: true, deep: true })

watch(builderSync, (newVal) => {
    if (newVal) {
        const policy = {
            version: "2012-10-17",
            statement: builderStatements.value.map(stmt => ({
                effect: stmt.effect,
                action: stmt.actions,
                resource: [stmt.resource]
            }))
        }
        newPolicyJson.value = JSON.stringify(policy, null, 2)
    }
})

async function fetchPolicies() {
    loading.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/policies`)
        if (res.ok) {
            policies.value = await res.json()
        }
    } catch (e) {
        console.error('Failed to fetch policies', e)
        toast.error('Failed to synchronize policy templates.')
    } finally {
        loading.value = false
    }
}

async function createPolicy() {
    try {
        const policy = JSON.parse(newPolicyJson.value)
        const payload = { ...policy, name: policyName.value }

        const res = await authFetch(`${API_BASE}/admin/policies`, {
            method: 'POST',
            body: payload
        })

        if (res.ok) {
            showPolicyModal.value = false
            const createdName = policyName.value
            policyName.value = ''
            toast.success(`Policy "${createdName}" created successfully.`)
            await fetchPolicies()
        } else {
            const err = await res.text()
            toast.error(`Failed to create policy template: ${err}`)
        }
    } catch (e) {
        toast.error(`Sync error: ${e.message}`)
    }
}

async function deletePolicy(name) {
    toast.promise(
        async () => {
            const res = await authFetch(`${API_BASE}/admin/policies/${name}`, { method: 'DELETE' })
            if (!res.ok) {
                const err = await res.text()
                throw new Error(err || 'Failed to delete policy')
            }
            await fetchPolicies()
        },
        {
            loading: `Deleting policy "${name}"...`,
            success: `Policy "${name}" removed successfully`,
            error: (err) => err.message || 'Failed to delete policy'
        }
    )
}

function togglePolicyDetails(name) {
    expandedPolicy.value = expandedPolicy.value === name ? null : name
}

function viewPolicy(policy) {
    selectedPolicy.value = policy
}

function getActions(policy) {
    try {
        const parsed = typeof policy === 'string' ? JSON.parse(policy) : policy
        if (parsed.statement && Array.isArray(parsed.statement)) {
            const actions = new Set()
            parsed.statement.forEach(stmt => {
                if (stmt.action) {
                    const actionList = Array.isArray(stmt.action) ? stmt.action : [stmt.action]
                    actionList.slice(0, 5).forEach(a => actions.add(a))
                }
            })
            return Array.from(actions).slice(0, 5)
        }
    } catch (e) {
        console.error('Failed to parse policy', e)
    }
    return []
}

function formatPolicy(policy) {
    try {
        const obj = typeof policy === 'string' ? JSON.parse(policy) : policy
        return JSON.stringify(obj, null, 2)
    } catch (e) {
        return policy
    }
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
    fetchPolicies()
})
</script>
