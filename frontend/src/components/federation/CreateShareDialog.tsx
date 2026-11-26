import { ShareFormDialog } from './ShareFormDialog'
import type { RemoteServer } from './federationTypes'

interface CreateShareDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  localBuckets: string[]
  peers: RemoteServer[]
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function CreateShareDialog(props: CreateShareDialogProps) {
  return <ShareFormDialog {...props} />
}
