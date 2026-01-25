<template>
    <div class="min-h-screen flex items-center justify-center bg-[#020617] relative overflow-hidden font-sans">
        <!-- Animated Background Elements -->
        <div class="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div
                class="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse">
            </div>
            <div class="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse"
                style="animation-delay: 2s;"></div>
            <div
                class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] bg-indigo-600/5 blur-[100px] rounded-full">
            </div>
        </div>

        <div class="w-full max-w-sm px-6 z-10 scale-95 md:scale-100">
            <div class="text-center mb-8">
                <div
                    class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/20 mb-4 transition-transform hover:scale-105 duration-300 p-2">
                    <img src="/logo.png" alt="GravSpace Logo" class="w-full h-full object-contain" />
                </div>
                <h1 class="text-2xl font-bold text-white tracking-tight">GravSpace</h1>
                <p class="text-slate-500 text-xs mt-1">Enterprise S3 Management Suite</p>
            </div>

            <Card
                class="border-white/10 bg-slate-900/40 backdrop-blur-2xl shadow-2xl overflow-hidden ring-1 ring-white/5">
                <CardHeader class="pb-2 space-y-0 text-left">
                    <CardTitle class="text-lg font-semibold text-white">Sign In</CardTitle>
                    <CardDescription class="text-slate-500 text-xs">Enter your administrative credentials
                    </CardDescription>
                </CardHeader>

                <CardContent class="pt-4 pb-6">
                    <form @submit.prevent="handleLogin" class="space-y-4">
                        <div class="space-y-1.5">
                            <Label for="accessKeyId"
                                class="text-slate-400 text-[10px] font-bold uppercase tracking-wider ml-1">Access Key
                                ID</Label>
                            <Input id="accessKeyId" v-model="accessKeyId" placeholder="e.g. root" required
                                autocomplete="username"
                                class="h-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-700 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50 transition-all text-sm" />
                        </div>

                        <div class="space-y-1.5">
                            <Label for="secretAccessKey"
                                class="text-slate-400 text-[10px] font-bold uppercase tracking-wider ml-1">Secret Access
                                Key</Label>
                            <Input id="secretAccessKey" v-model="secretAccessKey" type="password"
                                placeholder="••••••••••••••••" required autocomplete="current-password"
                                class="h-10 bg-slate-950/50 border-slate-800 text-white placeholder:text-slate-700 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50 transition-all text-sm" />
                        </div>

                        <Button type="submit"
                            class="w-full h-10 mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-600/10 active:scale-[0.98]"
                            :disabled="isLoading">
                            <span v-if="!isLoading" class="flex items-center gap-2">
                                Login to Console
                                <ChevronRight class="w-4 h-4" />
                            </span>
                            <span v-else class="flex items-center gap-2">
                                <Loader2 class="w-4 h-4 animate-spin" />
                                Verifying...
                            </span>
                        </Button>
                    </form>
                </CardContent>

                <CardFooter class="flex flex-col gap-3 border-t border-white/5 bg-black/20 py-4">
                    <div class="flex items-center gap-2 w-full">
                        <div class="h-px flex-1 bg-slate-800"></div>
                        <span class="text-[9px] text-slate-600 uppercase font-black tracking-widest">Setup Hint</span>
                        <div class="h-px flex-1 bg-slate-800"></div>
                    </div>
                    <div class="flex items-center justify-between w-full px-1">
                        <span class="text-[10px] text-slate-500 font-mono">admin / adminsecret</span>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Info class="w-3.5 h-3.5 text-slate-700 cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p class="text-[10px]">Change these in your setup once deployed</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </div>
                </CardFooter>
            </Card>

            <div class="mt-10 flex flex-col items-center gap-2">
                <div class="flex items-center gap-4 text-[10px] text-slate-600 font-medium uppercase tracking-widest">
                    <span>Hardware Acceleration</span>
                    <span class="w-1 h-1 rounded-full bg-slate-800"></span>
                    <span>Encrypted Session</span>
                </div>
                <p class="text-[10px] text-slate-700">
                    Built with Gravity Engine &copy; {{ new Date().getFullYear() }}
                </p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/composables/useAuth'
import { ChevronRight, Loader2, Info } from 'lucide-vue-next'

const router = useRouter()
const { login, authState } = useAuth()

const accessKeyId = ref('')
const secretAccessKey = ref('')
const isLoading = ref(false)

onMounted(() => {
    if (authState.value.isAuthenticated) {
        router.push('/')
    }
})

async function handleLogin() {
    if (accessKeyId.value && secretAccessKey.value) {
        isLoading.value = true
        try {
            const success = await login(accessKeyId.value, secretAccessKey.value)
            if (success) {
                router.push('/')
            } else {
                alert('Authentication failed. Please check your keys.')
            }
        } catch (e) {
            alert('An unexpected error occurred during login.')
        } finally {
            isLoading.value = false
        }
    }
}
</script>

<style scoped>
@keyframes pulse {

    0%,
    100% {
        opacity: 0.1;
    }

    50% {
        opacity: 0.3;
    }
}

.animate-pulse {
    animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
