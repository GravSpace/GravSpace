import { useState, useEffect } from 'react'
import { Tag, Plus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import type { S3Object } from '../../routes/admin/buckets/$bucket'

interface Props {
  object: S3Object
  bucketName: string
  onClose: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

interface ObjectTag {
  key: string
  value: string
}

export function TagEditorDialog({ object, bucketName, onClose, authFetch, apiBase }: Props) {
  const [tags, setTags] = useState<ObjectTag[]>([])
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const name = object.Key.split('/').pop() || object.Key

  useEffect(() => {
    const fetch = async () => {
      setLoading(true)
      try {
        const res = await authFetch(
          `${apiBase}/admin/buckets/${bucketName}/objects/${encodeURIComponent(object.Key)}/tags`,
        )
        if (res.ok) {
          const data = await res.json()
          setTags(Array.isArray(data) ? data : [])
        }
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [object.Key])

  function addTag() {
    if (!newKey.trim()) return
    if (tags.some((t) => t.key === newKey.trim())) {
      toast.error('Tag key already exists')
      return
    }
    setTags([...tags, { key: newKey.trim(), value: newValue.trim() }])
    setNewKey('')
    setNewValue('')
  }

  function removeTag(key: string) {
    setTags(tags.filter((t) => t.key !== key))
  }

  async function saveTags() {
    setSaving(true)
    try {
      const res = await authFetch(
        `${apiBase}/admin/buckets/${bucketName}/objects/${encodeURIComponent(object.Key)}/tags`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tags),
        },
      )
      if (!res.ok) throw new Error('Failed to save tags')
      toast.success('Tags saved successfully')
      onClose()
    } catch (err) {
      toast.error(`Failed to save tags: ${err}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-primary" />
            <DialogTitle>Object Tags</DialogTitle>
          </div>
          <DialogDescription className="truncate">{name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* Existing tags */}
              <div className="min-h-[80px] space-y-2">
                {tags.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground text-sm border-2 border-dashed rounded-lg opacity-50">
                    No tags yet
                  </div>
                )}
                {tags.map((tag) => (
                  <div
                    key={tag.key}
                    className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/20 group"
                  >
                    <Badge variant="outline" className="shrink-0 text-[9px] font-bold">
                      {tag.key}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex-1 truncate">{tag.value}</span>
                    <button
                      onClick={() => removeTag(tag.key)}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add new tag */}
              <div className="space-y-1.5 pt-2 border-t">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Add Tag</p>
                <div className="flex gap-2">
                  <Input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="Key"
                    className="h-9 text-xs flex-1"
                  />
                  <Input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="Value"
                    className="h-9 text-xs flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  />
                  <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={addTag}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onClose} size="sm">Cancel</Button>
                <Button size="sm" onClick={saveTags} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
                  Save Tags
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
