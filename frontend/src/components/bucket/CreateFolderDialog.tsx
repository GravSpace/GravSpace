import { useState } from 'react'
import { Loader2, FolderPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  currentPrefix: string
  bucketName: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function CreateFolderDialog({ open, onClose, onCreated, currentPrefix, bucketName, authFetch, apiBase }: Props) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCreate() {
    if (!name.trim()) return
    setLoading(true)
    try {
      const formattedName = name.trim()
      const key = currentPrefix + formattedName + (formattedName.endsWith('/') ? '' : '/')
      const res = await authFetch(
        `${apiBase}/admin/buckets/${bucketName}/objects/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          body: new Blob([''], { type: 'application/octet-stream' }),
        },
      )
      if (!res.ok) throw new Error('Failed to create folder')
      toast.success(`Folder "${name}" created.`)
      setName('')
      onClose()
      onCreated()
    } catch (err) {
      toast.error(`Failed to create folder: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-primary" />
            <DialogTitle>New Folder</DialogTitle>
          </div>
          <DialogDescription>
            Create a virtual directory prefix in <span className="font-mono text-primary">{bucketName}</span>
            {currentPrefix && <span className="font-mono text-muted-foreground">/{currentPrefix}</span>}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Folder Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. images, reports/2024"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
              className="h-10"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
            <Button size="sm" onClick={handleCreate} disabled={!name.trim() || loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
