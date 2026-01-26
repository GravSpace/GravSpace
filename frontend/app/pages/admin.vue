<template>
    <div class="flex h-screen bg-background text-foreground overflow-hidden">
        <!-- SIDEBAR -->
        <aside class="w-64 border-r bg-card flex flex-col">
            <div class="p-6 flex items-center gap-3">
                <div
                    class="bg-linear-to-br from-indigo-500 to-purple-600 w-10 h-10 flex items-center justify-center rounded-lg p-1.5">
                    <img src="/logo.png" alt="GravSpace" class="w-full h-full object-contain" />
                </div>
                <span class="text-xl font-bold tracking-tight">GravSpace</span>
            </div>
            <nav class="flex-1 px-4 space-y-1">
                <NuxtLink v-for="item in navItems" :key="item.path" :to="item.path"
                    class="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors"
                    :class="$route.path === item.path ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:bg-secondary/50'">
                    <component :is="item.icon" class="w-4 h-4" />
                    {{ item.label }}
                </NuxtLink>
            </nav>
            <div class="p-4 border-t space-y-2">
                <div class="flex items-center gap-3 px-3">
                    <Avatar class="w-8 h-8">
                        <AvatarImage src="" />
                        <AvatarFallback>{{ authState.username?.substring(0, 2).toUpperCase() || 'AD' }}</AvatarFallback>
                    </Avatar>
                    <div class="flex flex-col flex-1">
                        <span class="text-xs font-semibold">{{ authState.username || 'Admin' }}</span>
                        <span class="text-[10px] text-muted-foreground">Authenticated</span>
                    </div>
                </div>
                <Button variant="outline" size="sm" class="w-full" @click="handleLogout">
                    Logout
                </Button>
            </div>
        </aside>

        <!-- MAIN CONTENT -->
        <main class="flex-1 flex flex-col overflow-hidden relative">
            <!-- GLOBAL HEADER -->
            <header
                class="h-14 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-end gap-4 shrink-0 z-20">
                <Button variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground rounded-lg">
                    <Settings class="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground rounded-lg">
                    <HelpCircle class="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground rounded-lg">
                    <Sun class="w-4 h-4" />
                </Button>
                <div class="relative">
                    <Button variant="ghost" size="icon" class="h-9 w-9 text-muted-foreground rounded-lg transition-all"
                        :class="{ 'bg-primary/10 text-primary hover:bg-primary/20': activeTransfersCount > 0 }"
                        @click="showTransferManager = !showTransferManager">
                        <UploadCloud class="w-4 h-4" />
                        <span v-if="activeTransfersCount > 0"
                            class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 border-2 border-background rounded-full animate-pulse" />
                    </Button>
                </div>
            </header>

            <NuxtPage />

            <!-- TRANSFER MANAGER -->
            <TransferManager v-show="showTransferManager" />
        </main>

        <Toaster />
    </div>
</template>

<script setup>
import { LayoutDashboard, Database, User as UserIcon, Shield, Settings, HelpCircle, Sun, UploadCloud, ScrollText, TrendingUp, Trash2 } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useAuth } from '@/composables/useAuth'
import { useTransfers } from '@/composables/useTransfers'
import { useRouter } from 'vue-router'
import TransferManager from '@/components/TransferManager.vue'

const { authState, logout: authLogout } = useAuth()
const { activeTransfersCount } = useTransfers()
const router = useRouter()
const showTransferManager = ref(false)

const navItems = [
    { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/buckets', label: 'Buckets', icon: Database },
    { path: '/admin/users', label: 'IAM Engine', icon: UserIcon },
    { path: '/admin/policies', label: 'Security Policies', icon: Shield },
    { path: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
    { path: '/admin/trash', label: 'Recycle Bin', icon: Trash2 },
]

function handleLogout() {
    authLogout()
    router.push('/login')
}

// Redirect to login if not authenticated
onMounted(() => {
    if (!authState.value.isAuthenticated) {
        router.push('/login')
    }
})
</script>
