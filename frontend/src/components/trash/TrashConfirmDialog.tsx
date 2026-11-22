import { useState } from 'react'
import { Lock, Loader2, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface Props {
  open: boolean
  title: string
  desc: string
  onClose: () => void
  onConfirm: (password: string) => Promise<void>
}

export function TrashConfirmDialog({ open, title, desc, onClose, onConfirm }: Props) {
  const [passwordInput, setPasswordInput] = useState('')
  const [confirming, setConfirming] = useState(false)

  async function handleSubmit() {
    if (!passwordInput) return
    setConfirming(true)
    try {
      await onConfirm(passwordInput)
      setPasswordInput('')
      onClose()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setPasswordInput(''); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-9 w-9 rounded-full bg-rose-500/10 flex items-center justify-center">
              <Lock className="w-4 h-4 text-rose-500" />
            </div>
            <DialogTitle className="text-base">{title}</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed">{desc}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Admin Password</Label>
            <Input
              type="password"
              placeholder="Enter your admin password to confirm"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && passwordInput && handleSubmit()}
              autoFocus
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" disabled={!passwordInput || confirming} onClick={handleSubmit}>
            {confirming ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Verifying...
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Confirm & Proceed
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
