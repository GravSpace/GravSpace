import { useState } from 'react'
import { KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { useAuth } from '../hooks/useAuth'
import { toast } from 'sonner'

interface Props {
  isOpen: boolean
}

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export function PasswordOnboardingModal({ isOpen }: Props) {
  const { authState, authFetch, setCompletedOnboarding } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    try {
      const res = await authFetch(
        `${API_BASE}/admin/users/${authState.username}/password`,
        {
          method: 'PUT',
          body: JSON.stringify({ password: newPassword }) as unknown as BodyInit,
          headers: { 'Content-Type': 'application/json' },
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Failed to change password')
        return
      }
      toast.success('Password changed successfully')
      setCompletedOnboarding()
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error('An error occurred while changing password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md [&>button]:hidden" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Change Default Password</DialogTitle>
          <DialogDescription className="text-center">
            You are using the default password. Please set a new secure password
            to continue.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              New Password
            </Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-10 pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowNew(!showNew)}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Confirm Password
            </Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-10 pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-10 mt-2" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </span>
            ) : (
              'Set New Password'
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
