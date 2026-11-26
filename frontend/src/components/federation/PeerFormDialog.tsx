import { Button } from '@ui-sdk/react/button'
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ui-sdk/react/dialog'
import { Field, FieldDescription, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from '@ui-sdk/react/password-input'
import { Activity, Edit2, Eye, EyeOff, Loader2, Server, X } from 'lucide-react'
import type { RemoteServer } from './federationTypes'
import { PeerTestStatusBanner } from './PeerTestStatusBanner'
import { StoredSecretRow } from './StoredSecretRow'
import { usePeerForm } from './usePeerForm'

interface PeerFormDialogProps {
  open: boolean
  peer?: RemoteServer | null
  onClose: () => void
  onSuccess: () => void
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function PeerFormDialog(props: PeerFormDialogProps) {
  const { open, peer, onClose, authFetch, apiBase } = props
  const {
    isEdit,
    name,
    setName,
    endpoint,
    handleEndpointChange,
    s3Endpoint,
    setS3Endpoint,
    accessKey,
    setAccessKey,
    secretKey,
    setSecretKey,
    saving,
    testing,
    testResult,
    handleTestConnection,
    handleSubmit,
  } = usePeerForm(props)

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150" />
      <DialogContent className="w-[min(42rem,calc(100%-2rem))] p-5 gap-3.5 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 transition-all duration-150">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              {isEdit ? <Edit2 className="w-4 h-4" /> : <Server className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold tracking-tight text-foreground">
                {isEdit ? `Edit Remote Peer #${peer!.id}` : 'Connect Remote GravSpace Server'}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                {isEdit
                  ? 'Update endpoints or rotate credentials. Existing share rules are preserved.'
                  : 'Register a peer GravSpace instance for cross-server replication & failover.'}
              </DialogDescription>
            </div>
          </div>

          <DialogClose
            aria-label="Close peer dialog"
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <Field name="name">
            <FieldLabel>Peer Server Identifier</FieldLabel>
            <Input
              value={name}
              onValueChange={setName}
              placeholder="e.g. Singapore DR Cluster"
              required
              className="h-8.5 w-full rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs"
            />
          </Field>

          <div className="space-y-1.5">
            <Field name="endpoint">
              <FieldLabel>Admin API Endpoint</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  value={endpoint}
                  onValueChange={handleEndpointChange}
                  placeholder="http://192.168.1.50:8080"
                  required
                  className="h-8.5 flex-1 rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs font-mono"
                />
                <Button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing || !endpoint.trim()}
                  pendingAnnouncement="Testing peer connection"
                  className="h-8.5 px-3 rounded-lg border border-border/80 bg-background hover:bg-muted/70 text-xs font-medium shrink-0 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-45"
                >
                  {testing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Activity className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  )}
                  <span>Test Ping</span>
                </Button>
              </div>
            </Field>
            {testResult && <PeerTestStatusBanner result={testResult} />}
          </div>

          <Field name="s3_endpoint">
            <FieldLabel>S3 Storage Endpoint (Optional)</FieldLabel>
            <Input
              value={s3Endpoint}
              onValueChange={setS3Endpoint}
              placeholder="http://192.168.1.50:9001"
              className="h-8.5 w-full rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs font-mono"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field name="access_key">
              <FieldLabel>Access Key ID</FieldLabel>
              <Input
                value={accessKey}
                onValueChange={setAccessKey}
                placeholder="admin"
                className="h-8.5 w-full rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs font-mono"
              />
            </Field>

            <Field name="secret_key">
              <FieldLabel>{isEdit ? 'New Secret Key (Optional)' : 'Secret Key / Token'}</FieldLabel>
              <PasswordInput
                value={secretKey}
                onValueChange={setSecretKey}
                autoComplete="new-password"
                required={!isEdit}
                data-agent-secret
                className="h-8.5 w-full rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs font-mono"
              >
                <PasswordInputControl
                  placeholder={isEdit ? 'Leave blank to keep stored' : 'Secret or JWT'}
                  className="w-full bg-transparent outline-none text-xs font-mono"
                />
                <PasswordInputToggle
                  aria-label="Toggle new secret visibility"
                  className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {(state) =>
                    state.visible ? (
                      <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    )
                  }
                </PasswordInputToggle>
              </PasswordInput>
              {isEdit && <FieldDescription>Leave empty to keep stored secret.</FieldDescription>}
            </Field>
          </div>

          {isEdit && peer && (peer.has_secret ?? Boolean(peer.secret_key)) && (
            <StoredSecretRow peerId={peer.id} apiBase={apiBase} authFetch={authFetch} />
          )}

          <div className="pt-2.5 border-t border-border/50 flex items-center justify-end gap-2">
            <DialogClose
              disabled={saving}
              className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer"
            >
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={saving}
              pendingAnnouncement={isEdit ? 'Saving peer changes' : 'Connecting peer server'}
              className="h-8 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : isEdit ? (
                <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Server className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{isEdit ? 'Save Changes' : 'Connect Server'}</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
