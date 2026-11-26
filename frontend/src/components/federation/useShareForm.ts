import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import type { CrossServerShare, RemoteServer } from './federationTypes'

interface UseShareFormOptions {
  open: boolean
  share?: CrossServerShare | null
  peers: RemoteServer[]
  onClose: () => void
  onSuccess: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function useShareForm({
  open,
  share,
  peers,
  onClose,
  onSuccess,
  authFetch,
  apiBase,
}: UseShareFormOptions) {
  const isEdit = Boolean(share && typeof share.id === 'number')
  const [name, setName] = useState('')
  const [sourceBucket, setSourceBucket] = useState('')
  const [sourcePrefix, setSourcePrefix] = useState('')
  const [remoteServerId, setRemoteServerId] = useState('')
  const [targetBucket, setTargetBucket] = useState('')
  const [targetPrefix, setTargetPrefix] = useState('')
  const [syncMode, setSyncMode] = useState<'one_way' | 'two_way'>('one_way')
  const [enabled, setEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(share?.name ?? '')
    setSourceBucket(share?.source_bucket ?? '')
    setSourcePrefix(share?.source_prefix ?? '')
    setRemoteServerId(share ? String(share.remote_server_id) : '')
    setTargetBucket(share?.target_bucket ?? '')
    setTargetPrefix(share?.target_prefix ?? '')
    setSyncMode(share?.sync_mode === 'two_way' ? 'two_way' : 'one_way')
    setEnabled(share?.enabled ?? true)
  }, [open, share])

  const selectedPeer = peers.find((p) => String(p.id) === remoteServerId)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !sourceBucket || !remoteServerId || !targetBucket.trim()) {
      toast.error('Please fill in required fields (Name, Source Bucket, Remote Server, Target Bucket)')
      return
    }

    setSaving(true)
    try {
      const url = isEdit
        ? `${apiBase}/admin/federation/shares/${share!.id}`
        : `${apiBase}/admin/federation/shares`
      const method = isEdit ? 'PUT' : 'POST'
      const bodyPayload: Record<string, unknown> = {
        name: name.trim(),
        source_bucket: sourceBucket,
        source_prefix: sourcePrefix.trim(),
        remote_server_id: Number(remoteServerId),
        target_bucket: targetBucket.trim(),
        target_prefix: targetPrefix.trim(),
        sync_mode: syncMode,
      }
      if (isEdit) {
        bodyPayload.enabled = enabled
      }

      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })
      if (res.ok) {
        toast.success(
          isEdit
            ? `Share rule "${name.trim()}" updated.`
            : `Share rule "${name.trim()}" activated.`,
        )
        onSuccess()
        onClose()
      } else {
        const msg = await res.text()
        toast.error(`${isEdit ? 'Update' : 'Creation'} failed: ${msg}`)
      }
    } catch (err: any) {
      toast.error(`Network error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return {
    isEdit,
    name,
    setName,
    sourceBucket,
    setSourceBucket,
    sourcePrefix,
    setSourcePrefix,
    remoteServerId,
    setRemoteServerId,
    targetBucket,
    setTargetBucket,
    targetPrefix,
    setTargetPrefix,
    syncMode,
    setSyncMode,
    enabled,
    setEnabled,
    selectedPeer,
    saving,
    handleSubmit,
  }
}
