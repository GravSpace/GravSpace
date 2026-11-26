import { useEffect, useState } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { SecretFileField } from './SecretFileField'
import type { VaultSecret } from './vaultTypes'

interface SecretRotateTabProps {
  secret: VaultSecret
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  revealedValue: string | null
  onRotated: () => void
}

export function SecretRotateTab({
  secret,
  apiBase,
  authFetch,
  revealedValue,
  onRotated,
}: SecretRotateTabProps) {
  const isFile = secret.secret_type === 'file'
  const initialEncoding = secret.metadata?.encoding === 'base64' ? 'base64' : 'utf8'

  const [newValue, setNewValue] = useState('')
  const [fileEncoding, setFileEncoding] = useState<'utf8' | 'base64'>(initialEncoding)
  const [rotateComment, setRotateComment] = useState('')
  const [rotating, setRotating] = useState(false)
  const [loadingCurrent, setLoadingCurrent] = useState(false)

  useEffect(() => {
    setNewValue('')
    setRotateComment('')
    setFileEncoding(secret.metadata?.encoding === 'base64' ? 'base64' : 'utf8')
  }, [secret.id, secret.metadata?.encoding])

  async function handleLoadCurrent() {
    if (revealedValue) {
      setNewValue(revealedValue)
      setFileEncoding(secret.metadata?.encoding === 'base64' ? 'base64' : 'utf8')
      toast.success('Loaded current file content into editor')
      return
    }
    setLoadingCurrent(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/secrets/${secret.id}/reveal`)
      const data = await res.json()
      if (res.ok && data.value) {
        setNewValue(data.value)
        setFileEncoding(secret.metadata?.encoding === 'base64' ? 'base64' : 'utf8')
        toast.success('Loaded decrypted file content')
      } else if (res.status === 403 && data.status === 'requires_pam_approval') {
        toast.error('PAM Protected: Request elevation approval before reading current content.')
      } else {
        toast.error(data.message || 'Failed to read current secret content.')
      }
    } catch {
      toast.error('Error loading current file content.')
    } finally {
      setLoadingCurrent(false)
    }
  }

  async function handleRotate(e: React.FormEvent) {
    e.preventDefault()
    if (!newValue.trim()) {
      toast.error(isFile ? 'File content is required.' : 'New secret value is required.')
      return
    }

    setRotating(true)
    try {
      const payload: Record<string, any> = {
        value: isFile ? newValue : newValue.trim(),
        comment: rotateComment.trim() || (isFile ? 'Manual file update' : 'Manual rotation'),
      }
      if (isFile) {
        payload.metadata = {
          ...(secret.metadata || {}),
          file_name: secret.metadata?.file_name || secret.name,
          encoding: fileEncoding,
        }
      }

      const res = await authFetch(`${apiBase}/admin/vault/secrets/${secret.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to rotate secret')
      }
      toast.success(`Secret rotated to v${secret.current_version + 1}.`)
      setNewValue('')
      setRotateComment('')
      onRotated()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error rotating secret.')
    } finally {
      setRotating(false)
    }
  }

  return (
    <form onSubmit={handleRotate} className="space-y-3.5">
      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2">
        <RotateCw className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground">
          Rotating will create <strong>version {secret.current_version + 1}</strong>. The old version will be archived in history and can be rolled back anytime.
        </p>
      </div>

      {isFile ? (
        <SecretFileField
          fileName={secret.metadata?.file_name || secret.name}
          value={newValue}
          encoding={fileEncoding}
          showTemplates={false}
          disabled={rotating}
          onLoadCurrent={() => void handleLoadCurrent()}
          loadingCurrent={loadingCurrent}
          onChange={({ value: nextVal, encoding: nextEnc }) => {
            setNewValue(nextVal)
            setFileEncoding(nextEnc)
          }}
        />
      ) : (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">New Secret Value</Label>
          <Textarea
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Paste new token, connection string, or secret payload..."
            className="min-h-[100px] font-mono text-xs resize-none"
            required
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Change Reason / Audit Comment</Label>
        <Input
          value={rotateComment}
          onChange={(e) => setRotateComment(e.target.value)}
          placeholder="e.g. Scheduled quarterly credential rotation"
          className="h-9 text-xs"
        />
      </div>

      <Button type="submit" size="sm" disabled={rotating} className="w-full h-8 gap-1.5">
        <RotateCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} />
        {rotating ? 'Encrypting & Rotating...' : `Rotate to Version ${secret.current_version + 1}`}
      </Button>
    </form>
  )
}
