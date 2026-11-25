import { useState, useEffect } from 'react'
import { RotateCw, History, ShieldAlert, Check, Copy, Eye, EyeOff, Lock, Trash2, ArrowLeftRight, Download, Key } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Switch } from '../ui/switch'
import { Badge } from '../ui/badge'
import { toast } from 'sonner'
import {
  TYPE_CONFIG,
  type VaultSecret,
  type SecretVersion,
  getEnvTheme,
  downloadKeyStoreCredentials,
} from './vaultTypes'

interface Props {
  open: boolean
  onClose: () => void
  secret: VaultSecret | null
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  onSecretUpdated: () => void
  onDeleteRequested: (id: string) => void
  onDownload?: (s: VaultSecret, mode?: 'file' | 'bundle') => void
}

export function SecretDetailDialog({
  open,
  onClose,
  secret,
  apiBase,
  authFetch,
  onSecretUpdated,
  onDeleteRequested,
  onDownload,
}: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'rotate' | 'versions'>('overview')
  const [versions, setVersions] = useState<SecretVersion[]>([])
  const [loadingVersions, setLoadingVersions] = useState(false)

  // Rotate state
  const [newValue, setNewValue] = useState('')
  const [rotateComment, setRotateComment] = useState('')
  const [rotating, setRotating] = useState(false)

  // Edit meta state
  const [description, setDescription] = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [updatingMeta, setUpdatingMeta] = useState(false)

  // Revealed value
  const [revealedValue, setRevealedValue] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    if (secret && open) {
      setDescription(secret.description || '')
      setRequiresApproval(secret.requires_approval)
      setRevealedValue(secret.value || null)
      setNewValue('')
      setRotateComment('')
      fetchVersions()
    }
  }, [secret, open])

  async function fetchVersions() {
    if (!secret) return
    setLoadingVersions(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/secrets/${secret.id}/versions`)
      if (res.ok) {
        setVersions(await res.json())
      }
    } catch {
      // silent
    } finally {
      setLoadingVersions(false)
    }
  }

  async function handleReveal() {
    if (!secret) return
    if (revealedValue) {
      setRevealedValue(null)
      return
    }

    setRevealing(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/secrets/${secret.id}/reveal`)
      const data = await res.json()
      if (res.ok && data.value) {
        setRevealedValue(data.value)
        toast.success('Secret decrypted successfully.')
      } else if (res.status === 403 && data.status === 'requires_pam_approval') {
        toast.error('PAM Protected: You need to request access elevation first.')
      } else {
        toast.error(data.message || 'Failed to reveal secret.')
      }
    } catch {
      toast.error('Error revealing secret.')
    } finally {
      setRevealing(false)
    }
  }

  async function handleRotate(e: React.FormEvent) {
    e.preventDefault()
    if (!secret || !newValue.trim()) return

    setRotating(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/secrets/${secret.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: newValue.trim(),
          comment: rotateComment.trim() || 'Manual rotation',
        }),
      })

      if (!res.ok) throw new Error('Failed to rotate secret')
      toast.success(`Secret rotated to v${secret.current_version + 1}.`)
      setNewValue('')
      setRotateComment('')
      onSecretUpdated()
      fetchVersions()
      setActiveTab('overview')
    } catch (err: any) {
      toast.error(err.message || 'Error rotating secret.')
    } finally {
      setRotating(false)
    }
  }

  async function handleRollback(targetVersion: number) {
    if (!secret) return
    if (!window.confirm(`Rollback secret "${secret.name}" to version ${targetVersion}?`)) return

    try {
      const res = await authFetch(`${apiBase}/admin/vault/secrets/${secret.id}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_version: targetVersion }),
      })

      if (!res.ok) throw new Error('Failed to rollback')
      toast.success(`Rolled back to version ${targetVersion}.`)
      onSecretUpdated()
      fetchVersions()
    } catch (err: any) {
      toast.error(err.message || 'Error rolling back.')
    }
  }

  async function handleUpdateMeta() {
    if (!secret) return
    setUpdatingMeta(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/secrets/${secret.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim() || null,
          requires_approval: requiresApproval,
        }),
      })
      if (!res.ok) throw new Error('Failed to update settings')
      toast.success('Secret settings updated.')
      onSecretUpdated()
    } catch (err: any) {
      toast.error(err.message || 'Error saving settings.')
    } finally {
      setUpdatingMeta(false)
    }
  }

  if (!secret) return null

  const envTheme = getEnvTheme(secret.environment)
  const typeConf = TYPE_CONFIG[secret.secret_type]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-0 overflow-hidden shadow-xl max-h-[92vh] flex flex-col text-xs">
        <DialogHeader className="px-6 py-4 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <typeConf.icon className={`w-5 h-5 ${typeConf.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold tracking-tight font-mono">{secret.name}</DialogTitle>
                <Badge variant="outline" className={`text-[10px] ${envTheme.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${envTheme.dot} mr-1 inline-block`} />
                  {secret.environment}
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono">
                  v{secret.current_version}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {typeConf.label} • Last updated {secret.updated_at.slice(0, 16)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-2 border-b border-border/40 bg-muted/10 shrink-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
            <TabsList className="h-8 bg-transparent p-0 gap-2">
              <TabsTrigger value="overview" className="h-7 text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                Overview & Value
              </TabsTrigger>
              <TabsTrigger value="rotate" className="h-7 text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                Rotate / Update
              </TabsTrigger>
              <TabsTrigger value="versions" className="h-7 text-xs px-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                Version History ({versions.length})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {/* Secret Value View Box */}
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Secret Value (AES-256-GCM)
                  </span>
                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost" size="sm" onClick={handleReveal} disabled={revealing} className="h-7 text-[11px] gap-1">
                        {revealedValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {revealedValue ? 'Hide' : 'Reveal'}
                      </Button>
                      {revealedValue && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(revealedValue)
                            toast.success('Copied value to clipboard')
                          }}
                          className="h-7 text-[11px] gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy
                        </Button>
                      )}
                      {onDownload && (
                        <div className="flex items-center gap-1">
                          {secret.secret_type === 'keystore' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onDownload(secret, 'bundle')}
                              className="h-7 text-[11px] gap-1 text-primary hover:text-primary font-semibold"
                              title="Download binary .jks and companion credentials file in a single .zip bundle"
                            >
                              <Download className="w-3.5 h-3.5" /> Download Bundle (.zip)
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onDownload(secret, 'file')}
                              className="h-7 text-[11px] gap-1 text-primary hover:text-primary"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                </div>

                <div className="font-mono text-xs p-2.5 rounded-lg bg-background border border-border/40 select-all break-all">
                  {revealedValue ? (
                    <span className="text-foreground">{revealedValue}</span>
                  ) : (
                    <span className="text-muted-foreground tracking-widest">••••••••••••••••••••••••••••••••</span>
                  )}
                </div>
              </div>

              {/* PAM Toggle */}
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                    Require PAM Approval (Four-Eyes Principle)
                  </span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Plaintext reveal requires Just-In-Time approval elevation.
                  </p>
                </div>
                <Switch checked={requiresApproval} onCheckedChange={setRequiresApproval} />
              </div>

              {/* KeyStore Metadata Details */}
              {secret.secret_type === 'keystore' && secret.metadata && (
                <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-amber-500" />
                      KeyStore Parameters
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        downloadKeyStoreCredentials(secret)
                        toast.success('Downloaded credentials text file')
                      }}
                      className="h-6 text-[10px] gap-1 px-2 border-border/60 hover:bg-card"
                    >
                      <Download className="w-3 h-3" /> Download Credentials (.txt)
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-0.5 font-mono text-[11px]">
                    {secret.metadata.key_alias && (
                      <div className="p-2.5 rounded-lg bg-background border border-border/40 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-muted-foreground block font-sans">Key Alias</span>
                          <span className="text-foreground font-semibold select-all">{secret.metadata.key_alias}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(secret.metadata?.key_alias || '')
                            toast.success('Key alias copied')
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          title="Copy Alias"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                    {secret.metadata.store_password && (
                      <div className="p-2.5 rounded-lg bg-background border border-border/40 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-muted-foreground block font-sans">Store Password</span>
                          <span className="text-foreground font-semibold select-all">{secret.metadata.store_password}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigator.clipboard.writeText(secret.metadata?.store_password || '')
                            toast.success('Store password copied')
                          }}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          title="Copy Password"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-xs" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onDeleteRequested(secret.id)}
                  className="h-8 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border-rose-500/20 gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete Secret
                </Button>

                <Button size="sm" onClick={handleUpdateMeta} disabled={updatingMeta} className="h-8">
                  {updatingMeta ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'rotate' && (
            <form onSubmit={handleRotate} className="space-y-3.5">
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 flex items-start gap-2">
                <RotateCw className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-[11px] text-muted-foreground">
                  Rotating will create <strong>version {secret.current_version + 1}</strong>. The old version will be archived in history and can be rolled back anytime.
                </p>
              </div>

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
          )}

          {activeTab === 'versions' && (
            <div className="space-y-2">
              {loadingVersions ? (
                <div className="py-8 text-center text-muted-foreground">Loading versions...</div>
              ) : versions.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">No historical versions found</div>
              ) : (
                versions.map((v) => {
                  const isCurrent = v.version === secret.current_version
                  return (
                    <div
                      key={v.version}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
                        isCurrent ? 'bg-primary/5 border-primary/40' : 'bg-muted/20 border-border/40 hover:bg-muted/40'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs">v{v.version}</span>
                          {isCurrent && (
                            <Badge className="text-[9px] bg-primary/20 text-primary border-primary/30 py-0 h-4">
                              Current
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono">{v.created_at.slice(0, 16)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground italic">
                          {v.comment || 'No comment provided'}
                        </p>
                      </div>

                      {!isCurrent && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRollback(v.version)}
                          className="h-7 text-[10px] gap-1 hover:bg-primary hover:text-primary-foreground"
                        >
                          <ArrowLeftRight className="w-3 h-3" /> Rollback
                        </Button>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
