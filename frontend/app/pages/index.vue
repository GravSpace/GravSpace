<template>
    <div class="flex h-screen bg-background text-foreground overflow-hidden">
        <!-- SIDEBAR -->
        <aside class="w-64 border-r bg-card flex flex-col">
            <div class="p-6 flex items-center gap-3">
                <div
                    class="bg-primary text-primary-foreground w-8 h-8 flex items-center justify-center rounded-md font-bold">
                    ▲
                </div>
                <span class="text-xl font-bold tracking-tight">GravityStore</span>
            </div>
            <nav class="flex-1 px-4 space-y-1">
                <button v-for="item in navItems" :key="item.id"
                    class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    :class="currentTab === item.id ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50'"
                    @click="currentTab = item.id">
                    <component :is="item.icon" class="w-4 h-4" />
                    {{ item.label }}
                </button>
            </nav>
            <div class="p-4 border-t space-y-2">
                <div class="flex items-center gap-3 px-3">
                    <Avatar class="w-8 h-8">
                        <AvatarImage src="" />
                        <AvatarFallback>{{ authState.accessKeyId.substring(0, 2).toUpperCase() }}</AvatarFallback>
                    </Avatar>
                    <div class="flex flex-col flex-1">
                        <span class="text-xs font-semibold">{{ authState.accessKeyId }}</span>
                        <span class="text-[10px] text-muted-foreground">Authenticated</span>
                    </div>
                </div>
                <Button variant="outline" size="sm" class="w-full" @click="handleLogout">
                    Logout
                </Button>
            </div>
        </aside>

        <!-- MAIN CONTENT -->
        <main class="flex-1 flex flex-col overflow-hidden">
            <!-- HEADER -->
            <header class="h-16 border-b bg-card px-6 flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink @click="navigateToRoot" class="cursor-pointer">GravityStore
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <template v-if="selectedBucket">
                                <BreadcrumbSeparator />
                                <BreadcrumbItem>
                                    <BreadcrumbLink @click="navigateTo('')" class="cursor-pointer">{{ selectedBucket }}
                                    </BreadcrumbLink>
                                </BreadcrumbItem>
                                <template v-for="(part, i) in currentPrefix.split('/').filter(p => p)" :key="part">
                                    <BreadcrumbSeparator />
                                    <BreadcrumbItem>
                                        <BreadcrumbLink
                                            @click="navigateTo(currentPrefix.split('/').slice(0, i + 1).join('/') + '/')"
                                            class="cursor-pointer">
                                            {{ part }}
                                        </BreadcrumbLink>
                                    </BreadcrumbItem>
                                </template>
                            </template>
                        </BreadcrumbList>
                    </Breadcrumb>
                </div>
                <div class="flex items-center gap-2">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="outline" size="icon">
                                    <Settings class="w-4 h-4" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Settings</TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </header>

            <div class="flex-1 overflow-auto p-6">
                <!-- BUCKETS TAB -->
                <div v-if="currentTab === 'buckets'" class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h1 class="text-2xl font-bold tracking-tight">Buckets</h1>
                            <p class="text-sm text-muted-foreground">Manage your S3-compatible storage containers.</p>
                        </div>
                        <Button @click="showCreateBucketDialog = true">
                            <Plus class="w-4 h-4 mr-2" /> Create Bucket
                        </Button>
                    </div>

                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Bucket Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead class="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow v-for="bucket in buckets" :key="bucket">
                                    <TableCell class="font-medium cursor-pointer hover:underline text-primary"
                                        @click="selectBucket(bucket)">
                                        📁 {{ bucket }}
                                    </TableCell>
                                    <TableCell>
                                        <Badge v-if="isPublic(bucket)" variant="success"
                                            class="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">
                                            Public
                                        </Badge>
                                        <Badge v-else variant="secondary">Private</Badge>
                                    </TableCell>
                                    <TableCell class="text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal class="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem @click="togglePublic(bucket)">
                                                    {{ isPublic(bucket) ? 'Make Private' : 'Make Public' }}
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem @click="deleteBucket(bucket)"
                                                    class="text-destructive">
                                                    Delete Bucket
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                                <TableRow v-if="buckets.length === 0">
                                    <TableCell colspan="3"
                                        class="h-24 text-center text-muted-foreground text-sm font-medium">
                                        No buckets found. Build your first container.
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Card>

                    <!-- OBJECTS TABLE -->
                    <div v-if="selectedBucket" class="space-y-4 pt-4 border-t">
                        <div class="flex items-center justify-between">
                            <div class="flex flex-col">
                                <h2 class="text-lg font-semibold tracking-tight">Objects in {{ selectedBucket }}</h2>
                                <span class="text-xs text-muted-foreground">{{ currentPrefix || '/' }}</span>
                            </div>
                            <div class="flex gap-2">
                                <Button variant="outline" @click="showCreateFolderDialog = true">
                                    <FolderPlus class="w-4 h-4 mr-2" /> New Folder
                                </Button>
                                <input type="file" multiple @change="uploadFiles" class="hidden" ref="fileInput">
                                    <Button @click="$refs.fileInput.click()" :disabled="uploadProgress.isUploading">
                                        <Upload class="w-4 h-4 mr-2" v-if="!uploadProgress.isUploading" />
                                        <Loader2 class="w-4 h-4 mr-2 animate-spin" v-else />
                                        {{ uploadProgress.isUploading ? `Uploading
                                        ${uploadProgress.completed}/${uploadProgress.total}`
                                            : 'Upload Objects' }}
                                    </Button>
                            </div>
                        </div>

                        <Card>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Object Key</TableHead>
                                        <TableHead>Size</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead class="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <!-- FOLDERS -->
                                    <TableRow v-for="cp in commonPrefixes" :key="cp">
                                        <TableCell class="font-medium cursor-pointer hover:underline text-primary"
                                            @click="navigateTo(cp)">
                                            📁 {{cp.split('/').filter(p => p).pop()}}/
                                        </TableCell>
                                        <TableCell>-</TableCell>
                                        <TableCell>
                                            <Badge v-if="isPublic(selectedBucket, cp)" variant="success"
                                                class="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Public
                                            </Badge>
                                            <span v-else class="text-muted-foreground text-xs italic">Inherit</span>
                                        </TableCell>
                                        <TableCell class="text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon">
                                                        <MoreHorizontal class="w-4 h-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem @click="togglePublic(selectedBucket, cp)">
                                                        {{ isPublic(selectedBucket, cp) ? 'Make Private' : 'Make Public'
                                                        }}
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>

                                    <!-- OBJECTS -->
                                    <template v-for="obj in objects" :key="obj.Key">
                                        <TableRow v-if="!obj.Key.endsWith('/')">
                                            <TableCell class="font-medium">
                                                {{ obj.Key.replace(currentPrefix, '') }}
                                            </TableCell>
                                            <TableCell class="text-muted-foreground text-xs">{{ formatSize(obj.Size) }}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" class="text-[10px] uppercase font-bold">{{
                                                    obj.Key.split('.').pop() }}
                                                </Badge>
                                            </TableCell>
                                            <TableCell class="text-right whitespace-nowrap">
                                                <div class="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon"
                                                        @click="previewObject = { key: obj.Key }" title="Preview">
                                                        <Eye class="w-3.5 h-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" @click="downloadObject(obj.Key)"
                                                        title="Download">
                                                        <Download class="w-3.5 h-3.5" />
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon">
                                                                <MoreHorizontal class="w-3.5 h-3.5" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem @click="fetchVersions(obj.Key)">
                                                                <History class="w-4 h-4 mr-2" /> Version History
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem @click="copyPresignedUrl(obj.Key)">
                                                                <Copy class="w-4 h-4 mr-2" /> Copy link
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                        <!-- VERSIONS -->
                                        <TableRow v-if="objectVersions[obj.Key]" class="bg-muted/30">
                                            <TableCell colspan="4" class="p-0">
                                                <div class="px-6 py-2 space-y-2 border-l-4 border-primary">
                                                    <div
                                                        class="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-2 mb-2">
                                                        <History class="w-3 h-3" /> Version History
                                                    </div>
                                                    <div v-for="v in objectVersions[obj.Key]" :key="v.VersionId"
                                                        class="flex items-center justify-between text-xs py-1.5 hover:bg-muted/50 px-2 rounded-md transition-colors border-b last:border-0">
                                                        <div class="flex items-center gap-3">
                                                            <code
                                                                class="text-primary font-bold">{{ v.VersionId.slice(0, 8) }}...</code>
                                                            <span class="text-muted-foreground">{{ formatSize(v.Size)
                                                            }}</span>
                                                            <Badge v-if="v.IsLatest" size="xs" class="h-4 text-[9px]">
                                                                Latest</Badge>
                                                        </div>
                                                        <div class="flex items-center gap-1">
                                                            <Button variant="ghost" size="xs" class="h-7 text-[10px]"
                                                                @click="previewObject = { key: obj.Key, versionId: v.VersionId }">Preview</Button>
                                                            <Button variant="ghost" size="xs" class="h-7 text-[10px]"
                                                                @click="downloadObject(obj.Key, v.VersionId)">Download</Button>
                                                            <Button variant="ghost" size="xs" class="h-7 text-[10px]"
                                                                @click="copyPresignedUrl(obj.Key, v.VersionId)">Link</Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    </template>

                                    <TableRow v-if="objects.length === 0 && commonPrefixes.length === 0">
                                        <TableCell colspan="4"
                                            class="h-20 text-center text-muted-foreground text-xs italic">
                                            Empty folder.
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </Card>
                    </div>
                </div>

                <!-- USERS TAB -->
                <div v-if="currentTab === 'users'" class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h1 class="text-2xl font-bold tracking-tight">Users & Access Keys</h1>
                            <p class="text-sm text-muted-foreground">Manage service accounts and authentication
                                credentials.</p>
                        </div>
                        <Button @click="showCreateUserDialog = true">
                            <UserPlus class="w-4 h-4 mr-2" /> Create User
                        </Button>
                    </div>

                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>User</TableHead>
                                    <TableHead>Access Keys</TableHead>
                                    <TableHead>Policies</TableHead>
                                    <TableHead class="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow v-for="(user, username) in users" :key="username">
                                    <TableCell>
                                        <div class="flex items-center gap-2">
                                            <span class="font-bold">{{ username }}</span>
                                            <Badge v-if="username === 'anonymous'" variant="outline"
                                                class="text-[10px] py-0 border-blue-200 text-blue-500 bg-blue-50/50">
                                                Anonymous
                                            </Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div v-if="user.accessKeys && user.accessKeys.length > 0" class="space-y-2">
                                            <div v-for="key in user.accessKeys" :key="key.accessKeyId"
                                                class="text-[10px] font-mono bg-muted p-1.5 rounded border leading-tight">
                                                <span class="text-muted-foreground block mb-0.5">ID: {{ key.accessKeyId
                                                }}</span>
                                                <span class="text-primary font-bold">Secret: {{ key.secretAccessKey
                                                }}</span>
                                            </div>
                                        </div>
                                        <span v-else class="text-muted-foreground text-xs italic">No active keys</span>
                                    </TableCell>
                                    <TableCell>
                                        <div class="flex flex-wrap gap-1.5">
                                            <Badge v-for="p in user.policies" :key="p.name" variant="secondary"
                                                class="text-[10px] pl-1 h-5">
                                                <Shield class="w-2.5 h-2.5 mr-1" /> {{ p.name }}
                                                <span v-if="username !== 'admin'"
                                                    @click="removePolicy(username, p.name)"
                                                    class="ml-1.5 cursor-pointer hover:text-destructive transition-colors">✕</span>
                                            </Badge>
                                            <Button variant="outline" size="xs" class="h-5 text-[9px] px-1.5"
                                                @click="openPolicyModal(username)">
                                                + Attach
                                            </Button>
                                        </div>
                                    </TableCell>
                                    <TableCell class="text-right">
                                        <DropdownMenu v-if="username !== 'anonymous'">
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal class="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem v-if="username !== 'admin'"
                                                    @click="generateKey(username)">
                                                    Generate New Key
                                                </DropdownMenuItem>
                                                <DropdownMenuItem @click="openChangePasswordDialog(username)">
                                                    Change Password
                                                </DropdownMenuItem>
                                                <template v-if="username !== 'admin'">
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem @click="deleteUser(username)"
                                                        class="text-destructive">
                                                        Delete User
                                                    </DropdownMenuItem>
                                                </template>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                        <span v-else class="text-[10px] text-muted-foreground font-medium italic">Fixed
                                            Account</span>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Card>
                </div>

                <!-- POLICIES TAB -->
                <div v-if="currentTab === 'policies'" class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div>
                            <h1 class="text-2xl font-bold tracking-tight">IAM Policies</h1>
                            <p class="text-sm text-muted-foreground">Global reusable permission templates.</p>
                        </div>
                        <Button @click="showPolicyModal = true; selectedUserForPolicy = null">
                            <Plus class="w-4 h-4 mr-2" /> New Policy
                        </Button>
                    </div>

                    <Card>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Policy Name</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead class="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                <TableRow>
                                    <TableCell class="font-mono text-xs">AdministratorAccess</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" class="bg-blue-50 text-blue-600 border-blue-200">System
                                            Default
                                        </Badge>
                                    </TableCell>
                                    <TableCell class="text-right">-</TableCell>
                                </TableRow>
                                <TableRow v-for="policy in policies" :key="policy.name">
                                    <TableCell class="font-mono text-xs">{{ policy.name }}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">Custom</Badge>
                                    </TableCell>
                                    <TableCell class="text-right">
                                        <Button variant="ghost" size="icon" @click="deletePolicy(policy.name)"
                                            class="text-destructive">
                                            <Trash class="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Card>
                </div>
            </div>
        </main>

        <!-- PREVIEW DIALOG -->
        <Dialog :open="!!previewObject" @update:open="previewObject = null">
            <DialogContent class="sm:max-w-2xl overflow-hidden p-0">
                <DialogHeader class="p-6 border-b">
                    <DialogTitle>{{ previewObject?.key }}</DialogTitle>
                    <DialogDescription>
                        File Preview
                    </DialogDescription>
                </DialogHeader>
                <div class="flex items-center justify-center bg-muted/40 min-h-[400px]">
                    <img v-if="isImage(previewObject?.key)" :src="previewUrl"
                        class="max-w-full max-h-[70vh] object-contain shadow-sm" />
                    <div v-else class="text-center p-12 space-y-4">
                        <div
                            class="bg-card w-16 h-16 flex items-center justify-center rounded-xl mx-auto shadow-sm border">
                            <File class="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p class="text-sm text-muted-foreground">Real-time preview not available for this file type.</p>
                        <Button @click="downloadObject(previewObject.key, previewObject.versionId)">Download to
                            View</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>

        <!-- POLICY DIALOG -->
        <Dialog :open="showPolicyModal" @update:open="showPolicyModal = false">
            <DialogContent class="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{{ selectedUserForPolicy ? 'Attach Policy to ' + selectedUserForPolicy
                        : 'Dynamic Policy Builder'
                    }}
                    </DialogTitle>
                    <DialogDescription>
                        Specify permissions in standard AWS IAM JSON format.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div v-if="!selectedUserForPolicy" class="space-y-2">
                        <Label>Policy Name</Label>
                        <Input v-model="policyName" placeholder="e.g. FinanceReadOnly" />
                    </div>
                    <div class="space-y-2">
                        <Label>Policy Document (JSON)</Label>
                        <Textarea v-model="newPolicyJson" rows="12" class="font-mono text-xs tabular-nums" />
                    </div>
                    <Button class="w-full" @click="attachPolicy">
                        {{ selectedUserForPolicy ? 'Attach Permissions' : 'Create & Save Policy' }}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>

        <!-- CREATE BUCKET DIALOG -->
        <Dialog :open="showCreateBucketDialog" @update:open="showCreateBucketDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create New Bucket</DialogTitle>
                    <DialogDescription>
                        Bucket names must be unique and follow S3 naming conventions.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label>Bucket Name</Label>
                        <Input v-model="newBucketName" placeholder="e.g. static-assets-production" />
                    </div>
                    <Button class="w-full" @click="createBucket">Create Bucket</Button>
                </div>
            </DialogContent>
        </Dialog>

        <!-- CREATE USER DIALOG -->
        <Dialog :open="showCreateUserDialog" @update:open="showCreateUserDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Provision New User</DialogTitle>
                    <DialogDescription>
                        Create a new service account with dedicated access keys.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label>Username</Label>
                        <Input v-model="newUsername" placeholder="e.g. backup-agent" />
                    </div>
                    <Button class="w-full" @click="createUser">Provision User</Button>
                </div>
            </DialogContent>
        </Dialog>

        <!-- CREATE FOLDER DIALOG -->
        <Dialog :open="showCreateFolderDialog" @update:open="showCreateFolderDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>New Folder</DialogTitle>
                    <DialogDescription>
                        Virtual directory prefix for organizing objects.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label>Folder Name</Label>
                        <Input v-model="newFolderName" placeholder="e.g. images/v1" />
                    </div>
                    <Button class="w-full" @click="createFolder">Create Folder</Button>
                </div>
            </DialogContent>
        </Dialog>

        <!-- CHANGE PASSWORD DIALOG -->
        <Dialog :open="showChangePasswordDialog" @update:open="showChangePasswordDialog = false">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Change Password for {{ selectedUserForPassword }}</DialogTitle>
                    <DialogDescription>
                        Enter a new secure password for this account.
                    </DialogDescription>
                </DialogHeader>
                <div class="space-y-4 py-4">
                    <div class="space-y-2">
                        <Label>New Password</Label>
                        <Input v-model="newPassword" type="password" placeholder="••••••••" />
                    </div>
                    <Button class="w-full" @click="updatePassword">Update Password</Button>
                </div>
            </DialogContent>
        </Dialog>

        <Toaster />
    </div>
</template>

<script setup>
import 'vue-sonner/style.css'
import { ref, watch, onMounted } from 'vue'
import {
    Database, User as UserIcon, Shield, LayoutDashboard, Settings,
    Plus, MoreHorizontal, FolderPlus, Upload, Eye, Download,
    History, Copy, UserPlus, Trash, Loader2, File
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { S3Signer } from '@/lib/s3-signer'
import { useAuth } from '@/composables/useAuth'
import { useRouter } from 'vue-router'

const currentTab = ref('buckets')
const buckets = ref([])
const selectedBucket = ref(null)
const currentPrefix = ref('')
const objects = ref([])
const commonPrefixes = ref([])
const objectVersions = ref({})
const uploadProgress = ref({
    total: 0,
    completed: 0,
    isUploading: false
})
const previewObject = ref(null)
const previewUrl = ref(null)
const users = ref({})
const policies = ref([])
const showPolicyModal = ref(false)
const selectedUserForPolicy = ref(null)
const policyName = ref('')
const newPolicyJson = ref(JSON.stringify({
    name: "PublicAccess",
    version: "2012-10-17",
    statement: [{
        effect: "Allow",
        action: ["s3:GetObject", "s3:ListBucket"],
        resource: ["arn:aws:s3:::your-bucket-name/*"]
    }]
}, null, 2))

const showCreateBucketDialog = ref(false)
const newBucketName = ref('')
const showCreateUserDialog = ref(false)
const newUsername = ref('')
const showCreateFolderDialog = ref(false)
const newFolderName = ref('')

const showChangePasswordDialog = ref(false)
const selectedUserForPassword = ref('')
const newPassword = ref('')

const fileInput = ref(null)
const API_BASE = 'http://localhost:8080'
// Auth state from composable
const { authState, logout: authLogout } = useAuth()
const router = useRouter()

// Redirect to login if not authenticated
onMounted(() => {
    if (!authState.value.isAuthenticated) {
        router.push('/login')
    }
})

const navItems = [
    { id: 'buckets', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users', label: 'IAM Engine', icon: UserIcon },
    { id: 'policies', label: 'Security Policies', icon: Shield },
]

// CORE S3 / AUTH LOGIC
async function authFetch(url, options = {}) {
    const credentials = authState.value
    if (!credentials.isAuthenticated) {
        throw new Error('Not authenticated')
    }

    const method = options.method || 'GET'
    const body = options.body || null

    // For admin API calls with JSON body, we need to handle headers differently
    const isAdminAPI = url.includes('/admin/')
    const hasJsonBody = body && typeof body === 'string'

    if (isAdminAPI) {
        // Admin API: use JWT token
        const headers = {
            'Authorization': `Bearer ${credentials.token}`
        }
        if (hasJsonBody) {
            headers['Content-Type'] = 'application/json'
        }
        return fetch(url, {
            method,
            headers,
            body
        })
    }

    // S3 API: use S3 signing
    const signer = new S3Signer(credentials.accessKeyId, credentials.secretAccessKey)

    // Pass the actual body (File object) to signer for proper hash calculation
    const headers = await signer.sign(method, url, {}, body)

    return fetch(url, {
        method,
        headers,
        body
    })
}

watch(previewObject, async (newVal) => {
    if (previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value)
        previewUrl.value = null
    }

    if (newVal && isImage(newVal.key)) {
        try {
            const url = getPreviewUrl(newVal.key, newVal.versionId)
            const res = await authFetch(url)
            const blob = await res.blob()
            previewUrl.value = URL.createObjectURL(blob)
        } catch (e) {
            console.error('Failed to load preview', e)
        }
    }
})

async function fetchBuckets() {
    try {
        const res = await authFetch(`${API_BASE}/admin/buckets`)
        buckets.value = await res.json()
    } catch (e) {
        toast.error('Failed to synchronize buckets.')
    }
}

async function createBucket() {
    const name = newBucketName.value
    if (!name) return
    const res = await authFetch(`${API_BASE}/admin/buckets/${name}`, { method: 'PUT' })
    if (res.ok) {
        toast.success(`Bucket ${name} created successfully.`)
        showCreateBucketDialog.value = false
        newBucketName.value = ''
        await fetchBuckets()
    }
}

async function deleteBucket(name) {
    if (!confirm(`Permanently delete bucket ${name}?`)) return
    const res = await authFetch(`${API_BASE}/admin/buckets/${name}`, { method: 'DELETE' })
    if (res.ok) {
        toast.success('Bucket removed.')
        await fetchBuckets()
    }
}

async function selectBucket(name) {
    selectedBucket.value = name
    currentPrefix.value = ''
    objectVersions.value = {}
    await fetchObjects()
}

async function fetchObjects() {
    if (!selectedBucket.value) return
    const url = `${API_BASE}/admin/buckets/${selectedBucket.value}/objects?delimiter=/&prefix=${encodeURIComponent(currentPrefix.value)}`
    const res = await authFetch(url)
    const data = await res.json()

    objects.value = (data.objects || []).filter(o => o.Key !== currentPrefix.value)
    commonPrefixes.value = (data.common_prefixes || []).filter(p => p !== currentPrefix.value)
}

function navigateTo(p) {
    currentPrefix.value = p
    objectVersions.value = {}
    fetchObjects()
}

function navigateToRoot() {
    selectedBucket.value = null
    currentPrefix.value = ''
    objects.value = []
    commonPrefixes.value = []
}

async function createFolder() {
    const name = newFolderName.value
    if (!name) return
    const key = currentPrefix.value + name + (name.endsWith('/') ? '' : '/')
    const res = await authFetch(`${API_BASE}/admin/buckets/${selectedBucket.value}/objects/${key}`, { method: 'PUT' })
    if (res.ok) {
        showCreateFolderDialog.value = false
        newFolderName.value = ''
        await fetchObjects()
    }
}

async function uploadFiles(event) {
    const files = Array.from(event.target.files)
    if (files.length === 0 || !selectedBucket.value) return

    uploadProgress.value = {
        total: files.length,
        completed: 0,
        isUploading: true
    }

    const BATCH_SIZE = 5
    const MAX_BATCH_BYTES = 50 * 1024 * 1024

    let currentBatch = []
    let currentBatchSize = 0

    for (const file of files) {
        if (currentBatch.length >= BATCH_SIZE || (currentBatchSize + file.size > MAX_BATCH_BYTES && currentBatch.length > 0)) {
            await Promise.all(currentBatch.map(f => performUpload(f)))
            currentBatch = []
            currentBatchSize = 0
        }
        currentBatch.push(file)
        currentBatchSize += file.size
    }

    if (currentBatch.length > 0) {
        await Promise.all(currentBatch.map(f => performUpload(f)))
    }

    uploadProgress.value.isUploading = false
    event.target.value = ''
    toast.success(`Successfully uploaded ${files.length} objects.`)
    await fetchObjects()
}

async function performUpload(file) {
    // Sanitize filename to avoid S3 signature issues with special characters
    const sanitizedName = file.name
        .replace(/\s+/g, '_')           // Replace spaces with underscores
        .replace(/[^\w\-\.]/g, '_')     // Replace special chars with underscores
        .replace(/_+/g, '_')            // Replace multiple underscores with single

    const key = currentPrefix.value + sanitizedName
    try {
        await authFetch(`${API_BASE}/admin/buckets/${selectedBucket.value}/objects/${key}`, {
            method: 'PUT',
            body: file
        })
    } catch (err) {
        toast.error(`Upload error: ${file.name}`)
    } finally {
        uploadProgress.value.completed++
    }
}

async function fetchVersions(key) {
    if (objectVersions.value[key]) {
        const next = { ...objectVersions.value }
        delete next[key]
        objectVersions.value = next
        return
    }
    const res = await authFetch(`${API_BASE}/admin/buckets/${selectedBucket.value}/objects?versions&prefix=${encodeURIComponent(key)}`)
    const data = await res.json()
    objectVersions.value = {
        ...objectVersions.value,
        [key]: data.versions || []
    }
}

async function copyPresignedUrl(key, versionId = null) {
    const isObjPublic = isPublic(selectedBucket.value, key)
    if (isObjPublic) {
        const baseUrl = `${window.location.protocol}//${window.location.host}/${selectedBucket.value}/${key}`
        let finalUrl = baseUrl
        if (versionId) finalUrl += (finalUrl.includes('?') ? '&' : '?') + `versionId=${versionId}`
        await navigator.clipboard.writeText(finalUrl)
        toast.success("Public link copied.")
        return
    }

    let url = `${API_BASE}/admin/presign?bucket=${selectedBucket.value}&key=${key}`
    if (versionId) url += `&versionId=${versionId}`

    try {
        const res = await authFetch(url)
        const data = await res.json()
        await navigator.clipboard.writeText(data.url)
        toast.success("Presigned URL ready (expires in 1h).")
    } catch (err) {
        toast.error("Failed to generate signature.")
    }
}

// ACCESS CONTROL / USER MANAGEMENT
async function fetchUsers() {
    const res = await authFetch(`${API_BASE}/admin/users`)
    users.value = await res.json()
}

async function createUser() {
    const username = newUsername.value
    if (!username) return
    await authFetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        body: JSON.stringify({ username })
    })
    toast.success(`User ${username} provisioned.`)
    showCreateUserDialog.value = false
    newUsername.value = ''
    await fetchUsers()
}

async function deleteUser(username) {
    if (!confirm(`Erase user account ${username}?`)) return
    await authFetch(`${API_BASE}/admin/users/${username}`, { method: 'DELETE' })
    toast.success('User eradicated.')
    await fetchUsers()
}

async function generateKey(username) {
    await authFetch(`${API_BASE}/admin/users/${username}/keys`, { method: 'POST' })
    toast.success('Provisioned fresh access key.')
    await fetchUsers()
}

function openChangePasswordDialog(username) {
    selectedUserForPassword.value = username
    newPassword.value = ''
    showChangePasswordDialog.value = true
}

async function updatePassword() {
    if (!newPassword.value) {
        toast.error('Password cannot be empty.')
        return
    }
    try {
        const res = await authFetch(`${API_BASE}/admin/users/${selectedUserForPassword.value}/password`, {
            method: 'POST',
            body: JSON.stringify({ password: newPassword.value })
        })
        if (res.ok) {
            toast.success('Password updated successfully.')
            showChangePasswordDialog.value = false
        } else {
            const err = await res.text()
            toast.error(`Update failed: ${err}`)
        }
    } catch (e) {
        toast.error(`Update failed: ${e.message}`)
    }
}

function openPolicyModal(username) {
    selectedUserForPolicy.value = username
    showPolicyModal.value = true
}

async function attachPolicy() {
    try {
        const policy = JSON.parse(newPolicyJson.value)
        const payload = selectedUserForPolicy.value ? policy : { ...policy, name: policyName.value }
        const endpoint = selectedUserForPolicy.value
            ? `${API_BASE}/admin/users/${selectedUserForPolicy.value}/policies`
            : `${API_BASE}/admin/policies` // Assume hypothetical endpoint for global policies

        await authFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload)
        })

        showPolicyModal.value = false
        toast.success('Permissions updated.')
        await fetchUsers()
    } catch (e) {
        toast.error("Schema error: Ensure valid IAM JSON.")
    }
}

// HELPERS
function isImage(key) {
    if (!key) return false
    const ext = key.split('.').pop().toLowerCase()
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)
}

function getPreviewUrl(key, versionId = '') {
    let url = `${API_BASE}/admin/buckets/${selectedBucket.value}/objects/${key}`
    if (versionId) url += `?versionId=${versionId}`
    return url
}

async function downloadObject(key, versionId = '') {
    try {
        let url = getPreviewUrl(key, versionId)
        // Add query param to trigger attachment disposition in backend
        url += (url.includes('?') ? '&' : '?') + 'download=true'

        const res = await authFetch(url)
        if (!res.ok) throw new Error(`Download failed: ${res.statusText}`)

        const blob = await res.blob()
        const downloadUrl = URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = downloadUrl
        a.download = key.split('/').pop()
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)

        setTimeout(() => URL.revokeObjectURL(downloadUrl), 100)
    } catch (e) {
        toast.error(`Download failed: ${e.message}`)
    }
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function isPublic(bucket, prefix = "") {
    const anon = users.value['anonymous']
    if (!anon || !anon.policies) return false
    const resource = "arn:aws:s3:::" + bucket + (prefix ? "/" + prefix : "/*")
    return anon.policies.some(p =>
        p.statement.some(s => {
            if (s.effect !== "Allow" || !s.action.includes("s3:GetObject")) return false
            return s.resource.some(r => {
                if (r === "*") return true
                if (r.endsWith("*")) {
                    return resource.startsWith(r.slice(0, -1))
                }
                return r === resource
            })
        })
    )
}

async function togglePublic(bucket, prefix = "") {
    const currentlyPublic = isPublic(bucket, prefix)
    const resource = "arn:aws:s3:::" + bucket + (prefix.length > 0 ? "/" + prefix + "*" : "/*")
    const pName = `PublicAccess-${bucket}-${prefix.replace(/\s+$/, "").replace(/\//g, "") || 'Root'}`

    if (currentlyPublic) {
        if (!confirm("Remove public access?")) return
        await authFetch(`${API_BASE}/admin/users/anonymous/policies/${pName}`, { method: 'DELETE' })
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
            body: JSON.stringify(policy)
        })
    }
    await fetchUsers()
    toast.success('ACL updated.')
}

function handleLogout() {
    authLogout()
    router.push('/login')
}

watch(currentTab, (newTab) => {
    if (newTab === 'buckets') fetchBuckets()
    if (newTab === 'users') fetchUsers()
})

onMounted(() => {
    fetchBuckets()
    fetchUsers()
})
</script>

<style>
/* Remove custom scrollbars for cleaner Look */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

::-webkit-scrollbar-thumb {
    background: var(--muted);
    border-radius: 10px;
}

::-webkit-scrollbar-track {
    background: transparent;
}
</style>
