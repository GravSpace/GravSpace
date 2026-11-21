import { useState } from 'react'
import { Fingerprint } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface Props {
  open: boolean
  targetUser: string
  onClose: () => void
  onSave: (password: string) => Promise<void>
}

export function ChangePasswordDialog({ open, targetUser, onClose, onSave }: Props) {
  const [newPwd, setNewPwd] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!newPwd) return
    setSaving(true)
    try {
      await onSave(newPwd)
      setNewPwd('')
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setNewPwd(''); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
            <Fingerprint className="w-5 h-5 text-amber-600" />
          </div>
          <DialogTitle>Reset Credentials</DialogTitle>
          <DialogDescription>
            Renew master password for principal <strong>{targetUser}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">New Password</Label>
            <Input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="••••••••••••"
              className="h-10"
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={handleSubmit} disabled={!newPwd || saving}>
              {saving ? 'Saving...' : 'Apply Reset'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
