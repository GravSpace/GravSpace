<template>
    <Dialog :open="!authState.isAuthenticated">
        <DialogContent class="sm:max-w-md" :close-disabled="true">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <div
                        class="bg-primary text-primary-foreground w-8 h-8 flex items-center justify-center rounded-md font-bold">
                        ▲
                    </div>
                    GravityStore Login
                </DialogTitle>
                <DialogDescription>
                    Enter your S3 credentials to access the storage system.
                </DialogDescription>
            </DialogHeader>
            <form @submit.prevent="handleLogin" class="space-y-4">
                <div class="space-y-2">
                    <Label for="accessKeyId">Access Key ID</Label>
                    <Input id="accessKeyId" v-model="accessKeyId" placeholder="admin" required
                        autocomplete="username" />
                </div>
                <div class="space-y-2">
                    <Label for="secretAccessKey">Secret Access Key</Label>
                    <Input id="secretAccessKey" v-model="secretAccessKey" type="password"
                        placeholder="Enter your secret key" required autocomplete="current-password" />
                </div>
                <Button type="submit" class="w-full">
                    Login
                </Button>
            </form>
        </DialogContent>
    </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'

const { authState, login } = useAuth()

const accessKeyId = ref('')
const secretAccessKey = ref('')

function handleLogin() {
    if (accessKeyId.value && secretAccessKey.value) {
        login(accessKeyId.value, secretAccessKey.value)
    }
}
</script>
