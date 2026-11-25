import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Database,
  Folder,
  FolderSync,
  HelpCircle,
  Loader2,
  Search,
  Server,
  X,
  Zap,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { toast } from 'sonner'
import type { RemoteServer } from './federationTypes'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  localBuckets: string[]
  peers: RemoteServer[]
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  apiBase: string
}

export function CreateShareDialog({
  open,
  onClose,
  onSuccess,
  localBuckets,
  peers,
  authFetch,
  apiBase,
}: Props) {
  const [name, setName] = useState('')
  const [sourceBucket, setSourceBucket] = useState('')
  const [sourcePrefix, setSourcePrefix] = useState('')
  const [remoteServerId, setRemoteServerId] = useState<number>(0)
  const [targetBucket, setTargetBucket] = useState('')
  const [targetPrefix, setTargetPrefix] = useState('')
  const [syncMode, setSyncMode] = useState('one_way')
  const [saving, setSaving] = useState(false)

  // Combobox Popover states
  const [bucketOpen, setBucketOpen] = useState(false)
  const [bucketSearch, setBucketSearch] = useState('')
  const [peerOpen, setPeerOpen] = useState(false)
  const [peerSearch, setPeerSearch] = useState('')

  const selectedPeer = peers.find((p) => p.id === remoteServerId)

  const filteredBuckets = useMemo(() => {
    const q = bucketSearch.trim().toLowerCase()
    if (!q) return localBuckets
    return localBuckets.filter((b) => b.toLowerCase().includes(q))
  }, [localBuckets, bucketSearch])

  const filteredPeers = useMemo(() => {
    const q = peerSearch.trim().toLowerCase()
    if (!q) return peers
    return peers.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.endpoint.toLowerCase().includes(q),
    )
  }, [peers, peerSearch])

  function resetForm() {
    setName('')
    setSourceBucket('')
    setSourcePrefix('')
    setRemoteServerId(0)
    setTargetBucket('')
    setTargetPrefix('')
    setSyncMode('one_way')
    setBucketOpen(false)
    setBucketSearch('')
    setPeerOpen(false)
    setPeerSearch('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !sourceBucket || !remoteServerId || !targetBucket.trim()) {
      toast.error('Please fill in required fields (Name, Source Bucket, Remote Server, Target Bucket)')
      return
    }

    setSaving(true)
    try {
      const res = await authFetch(`${apiBase}/admin/federation/shares`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          source_bucket: sourceBucket,
          source_prefix: sourcePrefix.trim(),
          remote_server_id: Number(remoteServerId),
          target_bucket: targetBucket.trim(),
          target_prefix: targetPrefix.trim(),
          sync_mode: syncMode,
        }),
      })

      if (res.ok) {
        toast.success(`Cross-server share "${name}" activated.`)
        resetForm()
        onSuccess()
        onClose()
      } else {
        const msg = await res.text()
        toast.error(`Failed to create share: ${msg}`)
      }
    } catch (err: any) {
      toast.error(`Network error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { resetForm(); onClose() } }}>
      <DialogContent className="sm:max-w-xl w-full max-w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 mt-0.5">
              <FolderSync className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm font-bold tracking-tight text-foreground">
                New Cross-Server Share Rule
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Replicate an entire bucket or a specific folder prefix to another GravSpace cluster.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleCreate} className="space-y-4 py-1 text-xs w-full min-w-0 overflow-hidden">
          {/* Rule Identifier */}
          <div className="space-y-1.5 min-w-0">
            <Label className="text-xs font-semibold text-foreground">Share Rule Identifier</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Production DB Dumps Replication"
              className="h-9 text-xs"
              required
            />
          </div>

          {/* Route Config Section */}
          <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-3 w-full min-w-0 overflow-hidden">
            {/* Source vs Target 2-Column Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full min-w-0">
              {/* Left Column: Source (Local) */}
              <div className="p-3 rounded-lg bg-card border border-border/50 space-y-2.5 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1.5 pb-1 border-b border-border/40">
                  <Database className="w-3.5 h-3.5 text-primary" />
                  <span className="font-semibold text-[11px] text-foreground uppercase tracking-wider">
                    Source (Local Cluster)
                  </span>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-semibold uppercase">
                    Source Bucket *
                  </Label>
                  <Popover open={bucketOpen} onOpenChange={setBucketOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={bucketOpen}
                        className="w-full text-xs h-8 bg-background border border-input rounded-md px-2.5 flex items-center justify-between text-left focus:outline-none focus:ring-1 focus:ring-ring hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Database className="w-3 h-3 text-primary shrink-0" />
                          <span className={sourceBucket ? "font-semibold text-foreground truncate" : "text-muted-foreground truncate"}>
                            {sourceBucket || "Select source bucket..."}
                          </span>
                        </div>
                        <ChevronsUpDown className="w-3 h-3 text-muted-foreground shrink-0 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[260px] p-1.5 shadow-lg bg-card border border-border" align="start">
                      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40 mb-1">
                        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input
                          value={bucketSearch}
                          onChange={(e) => setBucketSearch(e.target.value)}
                          placeholder="Search bucket..."
                          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 text-foreground"
                          autoFocus
                        />
                        {bucketSearch && (
                          <button type="button" onClick={() => setBucketSearch('')}>
                            <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-44 overflow-y-auto space-y-0.5">
                        {filteredBuckets.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground p-3 text-center">No buckets found</p>
                        ) : (
                          filteredBuckets.map((b) => (
                            <button
                              key={b}
                              type="button"
                              onClick={() => {
                                setSourceBucket(b)
                                if (!targetBucket) setTargetBucket(b)
                                setBucketOpen(false)
                                setBucketSearch('')
                              }}
                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                                sourceBucket === b ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Database className="w-3 h-3 text-primary shrink-0" />
                                <span className="truncate">{b}</span>
                              </div>
                              {sourceBucket === b && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-semibold uppercase flex items-center gap-1">
                    <Folder className="w-3 h-3" /> Subfolder Prefix (Optional)
                  </Label>
                  <Input
                    value={sourcePrefix}
                    onChange={(e) => setSourcePrefix(e.target.value)}
                    placeholder="e.g. dumps/2026/ (empty = all)"
                    className="h-8 text-xs font-mono w-full min-w-0"
                  />
                </div>
              </div>

              {/* Right Column: Target (Remote) */}
              <div className="p-3 rounded-lg bg-card border border-border/50 space-y-2.5 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1.5 pb-1 border-b border-border/40">
                  <Server className="w-3.5 h-3.5 text-sky-500" />
                  <span className="font-semibold text-[11px] text-foreground uppercase tracking-wider">
                    Target (Remote Server)
                  </span>
                </div>

                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground font-semibold uppercase">
                    Remote Node *
                  </Label>
                  <Popover open={peerOpen} onOpenChange={setPeerOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        role="combobox"
                        aria-expanded={peerOpen}
                        className="w-full text-xs h-8 bg-background border border-input rounded-md px-2.5 flex items-center justify-between text-left focus:outline-none focus:ring-1 focus:ring-ring hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Server className="w-3 h-3 text-sky-500 shrink-0" />
                          <span className={selectedPeer ? "font-semibold text-foreground truncate" : "text-muted-foreground truncate"}>
                            {selectedPeer ? selectedPeer.name : "Select remote node..."}
                          </span>
                        </div>
                        <ChevronsUpDown className="w-3 h-3 text-muted-foreground shrink-0 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-1.5 shadow-lg bg-card border border-border" align="start">
                      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border/40 mb-1">
                        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <input
                          value={peerSearch}
                          onChange={(e) => setPeerSearch(e.target.value)}
                          placeholder="Search remote node..."
                          className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/60 text-foreground"
                          autoFocus
                        />
                        {peerSearch && (
                          <button type="button" onClick={() => setPeerSearch('')}>
                            <X className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                      </div>
                      <div className="max-h-44 overflow-y-auto space-y-0.5">
                        {filteredPeers.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground p-3 text-center">No peers connected</p>
                        ) : (
                          filteredPeers.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setRemoteServerId(p.id)
                                setPeerOpen(false)
                                setPeerSearch('')
                              }}
                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors ${
                                remoteServerId === p.id ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted text-foreground'
                              }`}
                            >
                              <div className="flex flex-col text-left truncate">
                                <span className="font-semibold truncate">{p.name}</span>
                                <span className="text-[10px] text-muted-foreground font-mono truncate">{p.endpoint}</span>
                              </div>
                              {remoteServerId === p.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                            </button>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="grid grid-cols-2 gap-2 min-w-0">
                  <div className="space-y-1 min-w-0">
                    <Label className="text-[10px] text-muted-foreground font-semibold uppercase truncate block">
                      Target Bucket *
                    </Label>
                    <Input
                      value={targetBucket}
                      onChange={(e) => setTargetBucket(e.target.value)}
                      placeholder="e.g. statics"
                      className="h-8 text-xs font-mono w-full min-w-0"
                      required
                    />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <Label className="text-[10px] text-muted-foreground font-semibold uppercase truncate block">
                      Target Prefix
                    </Label>
                    <Input
                      value={targetPrefix}
                      onChange={(e) => setTargetPrefix(e.target.value)}
                      placeholder="empty = root"
                      className="h-8 text-xs font-mono w-full min-w-0"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Replication Mode Selector */}
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/50 min-w-0">
              <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider shrink-0">
                Replication Mode
              </span>
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setSyncMode('one_way')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    syncMode === 'one_way'
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  One-Way Push (Mirror)
                </button>
                <button
                  type="button"
                  onClick={() => setSyncMode('two_way')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    syncMode === 'two_way'
                      ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Two-Way Continuous
                </button>
              </div>
            </div>

            {/* Live Route Visualizer Box */}
            <div className="p-2.5 rounded-lg bg-card border border-border/60 flex items-center justify-between font-mono text-[11px] gap-2 shadow-2xs w-full min-w-0 overflow-hidden">
              <div
                className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden"
                title={`${sourceBucket || 'local_bucket'}/${sourcePrefix || '*'}`}
              >
                <Database className="w-3 h-3 text-primary shrink-0" />
                <span className="font-bold text-foreground shrink-0">{sourceBucket || 'local_bucket'}</span>
                <span className="text-muted-foreground truncate">/{sourcePrefix || '*'}</span>
              </div>

              <div className="flex items-center gap-1 shrink-0 text-muted-foreground px-1.5">
                <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-primary/30 text-primary shrink-0">
                  {syncMode === 'one_way' ? 'Push' : 'Bidirectional'}
                </Badge>
              </div>

              <div
                className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden justify-end"
                title={`${selectedPeer ? selectedPeer.name : 'Remote Node'}: ${targetBucket || 'remote_bucket'}/${targetPrefix || '*'}`}
              >
                <Server className="w-3 h-3 text-sky-500 shrink-0" />
                <span className="font-bold text-foreground shrink-0">{targetBucket || 'remote_bucket'}</span>
                <span className="text-muted-foreground truncate">/{targetPrefix || '*'}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border/40 gap-2 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { resetForm(); onClose() }}
              disabled={saving}
              className="h-9 text-xs font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || peers.length === 0 || !sourceBucket}
              className="h-9 text-xs px-4 font-semibold shadow-xs"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 mr-1.5 text-amber-300" />
              )}
              Activate Share
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
