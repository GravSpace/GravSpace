<template>
    <div
        class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div class="w-full max-w-md">
            <Card class="border-slate-700 bg-slate-800/50 backdrop-blur">
                <CardHeader class="space-y-1 text-center">
                    <div class="flex justify-center mb-4">
                        <div
                            class="bg-primary text-primary-foreground w-16 h-16 flex items-center justify-center rounded-2xl font-bold text-2xl">
                            ▲
                        </div>
                    </div>
                    <CardTitle class="text-2xl font-bold text-white">GravityStore</CardTitle>
                    <CardDescription class="text-slate-400">
                        Enter your S3 credentials to access the storage system
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form @submit.prevent="handleLogin" class="space-y-4">
                        <div class="space-y-2">
                            <Label for="accessKeyId" class="text-slate-200">Access Key ID</Label>
                            <Input id="accessKeyId" v-model="accessKeyId" placeholder="admin" required
                                autocomplete="username"
                                class="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500" />
                        </div>
                        <div class="space-y-2">
                            <Label for="secretAccessKey" class="text-slate-200">Secret Access Key</Label>
                            <Input id="secretAccessKey" v-model="secretAccessKey" type="password"
                                placeholder="Enter your secret key" required autocomplete="current-password"
                                class="bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500" />
                        </div>
                        <Button type="submit" class="w-full" :disabled="isLoading">
                            <span v-if="!isLoading">Sign In</span>
                            <span v-else class="flex items-center gap-2">
                                <span class="animate-spin">⏳</span>
                                Signing in...
                            </span>
                        </Button>
                    </form>
                </CardContent>
                <CardFooter class="text-center text-sm text-slate-400">
                    <p class="w-full">
                        Default credentials: admin / adminsecret
                    </p>
                </CardFooter>
            </Card>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'

const router = useRouter()
const { login } = useAuth()

const accessKeyId = ref('')
const secretAccessKey = ref('')
const isLoading = ref(false)

async function handleLogin() {
    if (accessKeyId.value && secretAccessKey.value) {
        isLoading.value = true
        const success = await login(accessKeyId.value, secretAccessKey.value)
        isLoading.value = false

        if (success) {
            router.push('/')
        } else {
            alert('Invalid credentials')
        }
    }
}
</script>
