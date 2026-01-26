<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div class="flex flex-col">
                <h1 class="text-lg font-semibold tracking-tight">IAM Policy Templates</h1>
                <p class="text-xs text-muted-foreground">Reusable permission blueprints for access control.</p>
            </div>
            <Button size="sm" @click="showPolicyModal = true"
                class="h-8 bg-primary hover:bg-primary/90 shadow-sm transition-all duration-200 active:scale-95">
                <Plus class="w-3.5 h-3.5 mr-2" /> New Policy
            </Button>
        </header>

        <main class="flex-1 overflow-auto p-6">
            <Card class="border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader class="bg-muted/30">
                        <TableRow>
                            <TableHead class="w-[30%]">Policy Name</TableHead>
                            <TableHead class="w-[50%]">Permissions Summary</TableHead>
                            <TableHead class="w-[15%]">Type</TableHead>
                            <TableHead class="text-right w-[5%] px-6">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>

                        <!-- Custom Policies -->
                        <template v-for="policy in policies" :key="policy.name">
                            <TableRow class="group hover:bg-muted/30 transition-colors cursor-pointer"
                                @click="togglePolicyDetails(policy.name)">
                                <TableCell class="py-4">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="p-1.5 rounded bg-indigo-500/10 text-indigo-500 group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                            <FileText class="w-4 h-4" />
                                        </div>
                                        <div class="flex flex-col">
                                            <span class="font-mono text-sm font-bold">{{ policy.name }}</span>
                                            <span class="text-[10px] text-muted-foreground">Custom policy
                                                template</span>
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell class="py-4">
                                    <div class="flex flex-wrap gap-1">
                                        <Badge v-for="(action, i) in getActions(policy)" :key="i" variant="outline"
                                            class="text-[9px] h-4 bg-amber-500/10 text-amber-600 border-amber-500/20 font-bold">
                                            {{ action }}
                                        </Badge>
                                        <span v-if="getActions(policy).length === 0"
                                            class="text-[10px] text-muted-foreground italic">No actions defined</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" class="text-[8px] h-3.5 py-0 uppercase tracking-wider">
                                        Custom</Badge>
                                </TableCell>
                                <TableCell class="text-right px-6">
                                    <DropdownMenu @click.stop>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon"
                                                class="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <MoreVertical class="w-4 h-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" class="w-48">
                                            <DropdownMenuItem @click="viewPolicy(policy)">
                                                <Eye class="w-4 h-4 mr-2" />
                                                View Details
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem @click="deletePolicy(policy.name)"
                                                class="text-destructive focus:bg-destructive/10">
                                                <Trash2 class="w-4 h-4 mr-2" />
                                                Delete Policy
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </TableCell>
                            </TableRow>

                            <!-- Expandable Policy Details -->
                            <TableRow v-if="expandedPolicy === policy.name" class="bg-slate-50/50 dark:bg-slate-900/30">
                                <TableCell colspan="4" class="p-0 border-l-4 border-indigo-500/40">
                                    <div class="px-8 py-6 space-y-4">
                                        <div class="flex items-center justify-between">
                                            <h4
                                                class="text-xs font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300">
                                                Policy Document</h4>
                                            <Button variant="ghost" size="xs" @click="expandedPolicy = null"
                                                class="h-6 text-[10px]">Collapse</Button>
                                        </div>
                                        <pre
                                            class="p-4 rounded-lg bg-slate-950 text-emerald-400 text-[11px] font-mono overflow-x-auto border border-slate-800">{{ formatPolicy(policy) }}</pre>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </template>

                        <TableRow v-if="!policies || policies.length === 0">
                            <TableCell colspan="4" class="h-32 text-center text-muted-foreground italic text-sm">
                                <div class="flex flex-col items-center gap-2">
                                    <Shield class="w-6 h-6 opacity-20" />
                                    <span>No custom policies defined yet</span>
                                </div>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </Card>
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

                            <TabsContent value="builder"
                                class="space-y-4 py-4 border rounded-lg p-4 bg-muted/20 border-slate-200 dark:border-slate-800 mt-2">
                                <div class="grid grid-cols-2 gap-4">
                                    <div class="space-y-2">
                                        <Label
                                            class="text-[10px] font-bold uppercase tracking-wider opacity-70">Effect</Label>
                                        <div class="flex gap-2">
                                            <Button size="xs"
                                                :variant="builderEffect === 'Allow' ? 'default' : 'outline'"
                                                @click="builderEffect = 'Allow'"
                                                class="flex-1 h-8 text-[10px]">Allow</Button>
                                            <Button size="xs"
                                                :variant="builderEffect === 'Deny' ? 'destructive' : 'outline'"
                                                @click="builderEffect = 'Deny'"
                                                class="flex-1 h-8 text-[10px]">Deny</Button>
                                        </div>
                                    </div>
                                    <div class="space-y-2">
                                        <Label
                                            class="text-[10px] font-bold uppercase tracking-wider opacity-70">Resource
                                            ARN</Label>
                                        <Input v-model="builderResource" placeholder="arn:aws:s3:::*"
                                            class="h-8 text-xs font-mono" />
                                    </div>
                                </div>

                                <div class="space-y-3">
                                    <div class="flex items-center justify-between">
                                        <Label class="text-[10px] font-bold uppercase tracking-wider opacity-70">Common
                                            S3
                                            Actions</Label>
                                        <div class="flex items-center gap-2">
                                            <span class="text-[9px] text-muted-foreground">Auto-sync JSON</span>
                                            <Switch :model-value="builderSync"
                                                @update:model-value="v => builderSync = v" class="scale-75" />
                                        </div>
                                    </div>
                                    <div class="grid grid-cols-2 gap-2">
                                        <div v-for="action in availableActions" :key="action.id"
                                            class="flex items-center space-x-2 p-2 rounded border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                                            @click="toggleAction(action.id)">
                                            <input type="checkbox" :checked="builderActions.includes(action.id)"
                                                class="h-3 w-3 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer" />
                                            <span class="text-[10px] font-medium leading-none">{{ action.label }}</span>
                                        </div>
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
import { ref, watch, onMounted } from 'vue'

useSeoMeta({
    title: 'IAM Policies | GravSpace',
    description: 'Manage reusable permission templates and secure your cloud storage resources with fine-grained access control.',
})
import { Plus, Trash2, Shield, ShieldCheck, FileText, MoreVertical, Eye } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/composables/useAuth'

const config = useRuntimeConfig()
const API_BASE = config.public.apiBase
const { authFetch } = useAuth()

const policies = ref([])
const showPolicyModal = ref(false)
const policyName = ref('')
const expandedPolicy = ref(null)
const selectedPolicy = ref(null)

const builderActions = ref(['s3:GetObject', 's3:ListBucket'])
const builderResource = ref('arn:aws:s3:::*')
const builderEffect = ref('Allow')
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

watch([builderActions, builderResource, builderEffect], () => {
    if (!builderSync.value) return
    const policy = {
        version: "2012-10-17",
        statement: [{
            effect: builderEffect.value,
            action: builderActions.value,
            resource: [builderResource.value]
        }]
    }
    newPolicyJson.value = JSON.stringify(policy, null, 2)
}, { immediate: true, deep: true })

function toggleAction(id) {
    const idx = builderActions.value.indexOf(id)
    if (idx > -1) {
        builderActions.value.splice(idx, 1)
    } else {
        builderActions.value.push(id)
    }
}

async function fetchPolicies() {
    try {
        const res = await authFetch(`${API_BASE}/admin/policies`)
        if (res.ok) {
            policies.value = await res.json()
        }
    } catch (e) {
        console.error('Failed to fetch policies', e)
        toast.error('Failed to synchronize policy templates.')
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
