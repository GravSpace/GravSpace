<template>
  <Dialog :open="isOpen">
    <DialogContent
      class="sm:max-w-[450px] border-white/10 bg-slate-900/90 backdrop-blur-2xl shadow-2xl overflow-hidden ring-1 ring-white/5 p-6"
      :showCloseButton="false"
      @pointer-down-outside.prevent
      @escape-key-down.prevent
    >
      <DialogHeader class="space-y-3">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 ring-4 ring-amber-500/5 animate-bounce">
          <ShieldAlert class="h-6 w-6" />
        </div>
        <DialogTitle class="text-xl font-bold text-white text-center">Change Default Password</DialogTitle>
        <DialogDescription class="text-slate-400 text-sm text-center">
          For security reasons, you must change the default administrator password before accessing the GravSpace management console.
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="handleSubmit" class="space-y-4 mt-2">
        <div class="space-y-2">
          <Label for="new-password" class="text-slate-300 text-xs font-semibold">New Password</Label>
          <div class="relative">
            <Input
              id="new-password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Enter new secure password"
              required
              class="h-10 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-700 pr-10 focus-visible:ring-indigo-500/50 transition-all text-sm"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Eye v-if="!showPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="space-y-2">
          <Label for="confirm-password" class="text-slate-300 text-xs font-semibold">Confirm Password</Label>
          <div class="relative">
            <Input
              id="confirm-password"
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="Confirm your new password"
              required
              class="h-10 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-700 pr-10 focus-visible:ring-indigo-500/50 transition-all text-sm"
            />
            <button
              type="button"
              @click="showConfirmPassword = !showConfirmPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <Eye v-if="!showConfirmPassword" class="h-4 w-4" />
              <EyeOff v-else class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Validation Indicators -->
        <div class="bg-slate-950/40 rounded-lg p-3 border border-white/5 space-y-2 text-xs">
          <div class="text-slate-400 font-semibold mb-1">Password Requirements:</div>
          <div class="flex items-center gap-2">
            <div class="flex items-center justify-center w-4 h-4 rounded-full transition-colors duration-200" :class="isMinLength ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-500'">
              <Check class="w-3 h-3" />
            </div>
            <span :class="isMinLength ? 'text-emerald-400 font-medium' : 'text-slate-500'">At least 8 characters long</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex items-center justify-center w-4 h-4 rounded-full transition-colors duration-200" :class="hasSpecialOrNumber ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-500'">
              <Check class="w-3 h-3" />
            </div>
            <span :class="hasSpecialOrNumber ? 'text-emerald-400 font-medium' : 'text-slate-500'">Contains at least one number or special character</span>
          </div>
          <div class="flex items-center gap-2">
            <div class="flex items-center justify-center w-4 h-4 rounded-full transition-colors duration-200" :class="passwordsMatch ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-800 text-slate-500'">
              <Check class="w-3 h-3" />
            </div>
            <span :class="passwordsMatch ? 'text-emerald-400 font-medium' : 'text-slate-500'">Passwords match</span>
          </div>
        </div>

        <Button
          type="submit"
          class="w-full h-10 mt-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
          :disabled="isSubmitting || !isValid"
        >
          <span v-if="!isSubmitting" class="flex items-center justify-center gap-2">
            Save and Continue
            <ArrowRight class="w-4 h-4" />
          </span>
          <span v-else class="flex items-center justify-center gap-2">
            <Loader2 class="w-4 h-4 animate-spin" />
            Updating password...
          </span>
        </Button>
      </form>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/composables/useAuth'
import { toast } from 'vue-sonner'
import { ShieldAlert, Eye, EyeOff, Check, ArrowRight, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  isOpen: boolean
}>()

const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const isSubmitting = ref(false)

const isMinLength = computed(() => password.value.length >= 8)
const hasSpecialOrNumber = computed(() => /[0-9!@#$%^&*(),.?":{}|<>]/.test(password.value))
const passwordsMatch = computed(() => password.value !== '' && password.value === confirmPassword.value)
const isValid = computed(() => isMinLength.value && hasSpecialOrNumber.value && passwordsMatch.value)

const { authFetch, setCompletedOnboarding } = useAuth()
const config = useRuntimeConfig()
const API_BASE = config.public.apiBase

async function handleSubmit() {
  if (!isValid.value) return

  isSubmitting.value = true
  try {
    const res = await authFetch(`${API_BASE}/admin/users/admin/password`, {
      method: 'POST',
      body: { password: password.value }
    })

    if (res.ok) {
      toast.success('Admin password updated successfully.')
      setCompletedOnboarding()
    } else {
      const errorText = await res.text()
      throw new Error(errorText || 'Server error updating password')
    }
  } catch (err: any) {
    toast.error(`Failed to update password: ${err.message}`)
  } finally {
    isSubmitting.value = false
  }
}
</script>
