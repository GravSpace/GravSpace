import { PeerFormDialog } from './PeerFormDialog'

interface ConnectPeerDialogProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function ConnectPeerDialog(props: ConnectPeerDialogProps) {
  return <PeerFormDialog {...props} />
}
