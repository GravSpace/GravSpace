import { Button } from '@ui-sdk/react/button'
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@ui-sdk/react/dialog'
import { Field, FieldLabel } from '@ui-sdk/react/field'
import { Input } from '@ui-sdk/react/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select'
import { Switch, SwitchThumb } from '@ui-sdk/react/switch'
import { ArrowRight, Check, ChevronDown, Database, Edit2, FolderSync, Loader2, Server, X, Zap } from 'lucide-react'
import { Badge } from '../ui/badge'
import type { CrossServerShare, RemoteServer } from './federationTypes'
import { useShareForm } from './useShareForm'

interface ShareFormDialogProps {
  open: boolean
  share?: CrossServerShare | null
  onClose: () => void
  onSuccess: () => void
  localBuckets: string[]
  peers: RemoteServer[]
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function ShareFormDialog(props: ShareFormDialogProps) {
  const { open, share, onClose, localBuckets, peers } = props
  const {
    isEdit, name, setName, sourceBucket, setSourceBucket, sourcePrefix, setSourcePrefix,
    remoteServerId, setRemoteServerId, targetBucket, setTargetBucket, targetPrefix, setTargetPrefix,
    syncMode, setSyncMode, enabled, setEnabled, selectedPeer, saving, handleSubmit,
  } = useShareForm(props)

  const peerItems = peers.map((p) => ({ value: String(p.id), label: `${p.name} (${p.endpoint})` }))

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogBackdrop className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-starting-style:opacity-0 data-ending-style:opacity-0 transition-opacity duration-150" />
      <DialogContent className="w-[min(34rem,calc(100%-2rem))] p-5 gap-3.5 rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl outline-none data-starting-style:opacity-0 data-starting-style:scale-95 data-ending-style:opacity-0 data-ending-style:scale-95 transition-all duration-150">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              {isEdit ? <Edit2 className="w-4 h-4" /> : <FolderSync className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm font-bold tracking-tight text-foreground">
                {isEdit ? `Edit Share Rule #${share!.id}` : 'Configure Cross-Server Folder Share'}
              </DialogTitle>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                Select a source bucket/prefix and remote cluster destination for automated replication.
              </DialogDescription>
            </div>
          </div>
          <DialogClose aria-label="Close share dialog" className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer shrink-0">
            <X className="w-4 h-4" aria-hidden="true" />
          </DialogClose>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <Field name="share_name">
            <FieldLabel>Rule Identifier Name</FieldLabel>
            <Input value={name} onValueChange={setName} placeholder="e.g. Production Media Mirror" required className="h-8.5 w-full rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs" />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="p-3 rounded-lg bg-muted/35 border border-border/60 space-y-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Database className="w-3 h-3" /> Source Origin
              </div>
              <Field name="source_bucket">
                <FieldLabel>Source Bucket</FieldLabel>
                <Select items={localBuckets} value={sourceBucket || null} onValueChange={(v) => setSourceBucket(v ?? '')} placeholder="Select bucket..." required>
                  <SelectTrigger className="min-w-0 w-full h-8 rounded-md border border-border/80 bg-background px-2.5 text-xs">
                    <SelectValue />
                    <ChevronDown className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
                  </SelectTrigger>
                  <SelectContent className="min-w-(--anchor-width) rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg max-h-48">
                    {localBuckets.map((b) => (
                      <SelectItem key={b} value={b} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs font-mono cursor-pointer outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                        {b}
                        <SelectItemIndicator><Check className="size-3 text-primary" aria-hidden="true" /></SelectItemIndicator>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field name="source_prefix">
                <FieldLabel>Source Prefix</FieldLabel>
                <Input value={sourcePrefix} onValueChange={setSourcePrefix} placeholder="empty = full bucket" className="h-8 w-full rounded-md border border-border/80 bg-background px-2.5 text-xs font-mono" />
              </Field>
            </div>

            <div className="p-3 rounded-lg bg-muted/35 border border-border/60 space-y-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-sky-500 flex items-center gap-1.5">
                <Server className="w-3 h-3" /> Remote Target
              </div>
              <Field name="remote_server">
                <FieldLabel>Remote Server</FieldLabel>
                <Select items={peerItems} value={remoteServerId || null} onValueChange={(v) => setRemoteServerId(v ?? '')} placeholder="Select peer..." required>
                  <SelectTrigger className="min-w-0 w-full h-8 rounded-md border border-border/80 bg-background px-2.5 text-xs">
                    <SelectValue />
                    <ChevronDown className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
                  </SelectTrigger>
                  <SelectContent className="min-w-(--anchor-width) rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg max-h-48">
                    {peerItems.map((p) => (
                      <SelectItem key={p.value} value={p.value} label={p.label} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs cursor-pointer outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">
                        <span className="truncate">{p.label}</span>
                        <SelectItemIndicator><Check className="size-3 text-primary shrink-0" aria-hidden="true" /></SelectItemIndicator>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field name="target_bucket">
                  <FieldLabel>Target Bucket</FieldLabel>
                  <Input value={targetBucket} onValueChange={setTargetBucket} placeholder="statics" required className="h-8 w-full rounded-md border border-border/80 bg-background px-2 text-xs font-mono" />
                </Field>
                <Field name="target_prefix">
                  <FieldLabel>Target Prefix</FieldLabel>
                  <Input value={targetPrefix} onValueChange={setTargetPrefix} placeholder="empty" className="h-8 w-full rounded-md border border-border/80 bg-background px-2 text-xs font-mono" />
                </Field>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/25 border border-border/50">
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">Replication Mode</span>
            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg">
              {(['one_way', 'two_way'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSyncMode(mode)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    syncMode === mode ? 'bg-primary text-primary-foreground font-semibold shadow-2xs' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {mode === 'one_way' ? 'One-Way Push' : 'Two-Way Sync'}
                </button>
              ))}
            </div>
          </div>

          {isEdit && (
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/25 border border-border/50">
              <Field>
                <FieldLabel className="text-xs font-medium text-foreground">Enable replication rule</FieldLabel>
                <Switch checked={enabled} onCheckedChange={setEnabled} className="cursor-pointer">
                  <SwitchThumb />
                </Switch>
              </Field>
            </div>
          )}

          <div className="p-2.5 rounded-lg bg-muted/20 border border-border/50 flex items-center justify-between font-mono text-[11px] gap-2 overflow-hidden">
            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
              <Database className="w-3 h-3 text-primary shrink-0" />
              <span className="font-bold text-foreground truncate">{sourceBucket || 'local_bucket'}/{sourcePrefix || '*'}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <ArrowRight className="w-3.5 h-3.5 text-primary" />
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{syncMode === 'one_way' ? 'Push' : 'Two-Way'}</Badge>
            </div>
            <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end truncate" title={selectedPeer?.name || 'Remote'}>
              <Server className="w-3 h-3 text-sky-500 shrink-0" />
              <span className="font-bold text-foreground truncate">{targetBucket || 'remote_bucket'}/{targetPrefix || '*'}</span>
            </div>
          </div>

          <div className="pt-2.5 border-t border-border/50 flex items-center justify-end gap-2">
            <DialogClose disabled={saving} className="h-8 px-3 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors cursor-pointer">
              Cancel
            </DialogClose>
            <Button
              type="submit"
              disabled={saving || peers.length === 0 || !sourceBucket}
              pendingAnnouncement={isEdit ? 'Saving share rule' : 'Creating share rule'}
              className="h-8 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : isEdit ? <Edit2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Zap className="w-3.5 h-3.5" aria-hidden="true" />}
              <span>{isEdit ? 'Save Share' : 'Activate Share'}</span>
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
