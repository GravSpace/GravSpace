import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface Props {
  open: boolean
  onClose: () => void
  onCreate: (username: string) => Promise<void>
}

export function CreateUserDialog({ open, onClose, onCreate }: Props) {
  const [username, setUsername] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleSubmit() {
    const val = username.trim()
    if (!val) return
    setCreating(true)
    try {
      await onCreate(val)
      setUsername('')
      onClose()
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setUsername(''); onClose() } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <DialogTitle>Provision New User</DialogTitle>
          <DialogDescription>
            Cloud service accounts require dedicated credentials for programmatic access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. storage-indexer-svc"
              className="h-10"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground italic">Principal IDs must be globally unique.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Dismiss</Button>
            <Button onClick={handleSubmit} disabled={!username.trim() || creating}>
              {creating ? 'Creating...' : 'Initialize Account'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
