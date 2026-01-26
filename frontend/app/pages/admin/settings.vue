<template>
    <div class="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
        <header
            class="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h1 class="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Settings</h1>
                <p class="text-xs text-muted-foreground">System configuration and integrations</p>
            </div>
        </header>

        <main class="flex-1 overflow-auto p-6 max-w-4xl space-y-8">
            <!-- INTEGRATIONS -->
            <section class="space-y-4">
                <div class="flex items-center gap-2 pb-2 border-b">
                    <Webhook class="w-5 h-5 text-primary" />
                    <h2 class="text-lg font-bold">Integrations</h2>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle class="text-base flex items-center gap-2">
                            <SlackIcon class="w-4 h-4" /> Slack Notifications
                        </CardTitle>
                        <CardDescription>
                            Receive alerts for critical system events like Lifecycle Failures and Mass Deletions.
                        </CardDescription>
                    </CardHeader>
                    <CardContent class="space-y-4">
                        <div class="space-y-2">
                            <Label for="webhook-url">Webhook URL</Label>
                            <Input id="webhook-url" :modelValue="webhookUrl" type="url"
                                placeholder="https://hooks.slack.com/services/..." class="font-mono text-sm" />
                            <p class="text-xs text-muted-foreground">
                                Get your webhook URL from Slack's Incoming Webhooks integration
                            </p>
                        </div>

                        <Button @click="saveSettings" :disabled="saving" class="w-full sm:w-auto">
                            <Loader2 v-if="saving" class="w-4 h-4 mr-2 animate-spin" />
                            <Save v-else class="w-4 h-4 mr-2" />
                            {{ saving ? 'Saving...' : 'Save Settings' }}
                        </Button>

                        <div class="text-sm text-muted-foreground pt-4 border-t">
                            <p class="mb-2 font-medium">Active Triggers:</p>
                            <ul class="list-disc list-inside space-y-1 ml-2">
                                <li>Lifecycle Rule Failures</li>
                                <li>Mass Trash Deletion Events</li>
                            </ul>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </main>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Webhook, Slack as SlackIcon, Save, Loader2 } from 'lucide-vue-next'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'
import { toast } from 'vue-sonner'

const { authFetch } = useAuth()
const config = useRuntimeConfig()
const API_BASE = config.public.apiBase

const webhookUrl = ref('')
const saving = ref(false)

async function loadSettings() {
    try {
        const res = await authFetch(`${API_BASE}/admin/settings`)
        if (res.ok) {
            const data = await res.json()
            webhookUrl.value = data.slack_webhook_url || ''
        }
    } catch (e) {
        console.error('Failed to load settings', e)
    }
}

async function saveSettings() {
    saving.value = true
    try {
        const res = await authFetch(`${API_BASE}/admin/settings`, {
            method: 'POST',
            body: {
                slack_webhook_url: webhookUrl.value
            }
        })

        if (res.ok) {
            toast.success('Settings saved successfully')
        } else {
            toast.error('Failed to save settings')
        }
    } catch (e) {
        toast.error('Failed to save settings')
    } finally {
        saving.value = false
    }
}

onMounted(() => {
    loadSettings()
})

useSeoMeta({
    title: 'Settings | GravSpace',
})
</script>
