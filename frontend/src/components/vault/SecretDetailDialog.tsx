import { useState, useEffect } from 'react'
import { ShieldAlert, Copy, Trash2, Download, Key } from 'lucide-react'
import { Tabs, TabsList, TabsTab } from '@ui-sdk/react/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
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
import { SecretFileOverview } from './SecretFileOverview'
import { SecretRotateTab } from './SecretRotateTab'
import { SecretVersionsTab } from './SecretVersionsTab'

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

  const [description, setDescription] = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [updatingMeta, setUpdatingMeta] = useState(false)

  const [revealedValue, setRevealedValue] = useState<string | null>(null)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    if (secret && open) {
      setDescription(secret.description || '')
      setRequiresApproval(secret.requires_approval)
      setRevealedValue(secret.value || null)
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
      setRevealedValue(null)
      onSecretUpdated()
      fetchVersions()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error rolling back.')
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error saving settings.')
    } finally {
      setUpdatingMeta(false)
    }
  }

  if (!secret) return null

  const envTheme = getEnvTheme(secret.environment)
  const typeConf = TYPE_CONFIG[secret.secret_type]

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-card p-0 overflow-hidden shadow-xl max-h-[92vh] flex flex-col text-xs">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between shrink-0 pr-12">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <typeConf.icon className={`w-5 h-5 ${typeConf.color}`} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <DialogTitle className="text-base font-semibold tracking-tight font-mono truncate">{secret.name}</DialogTitle>
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

        <div className="px-4 sm:px-6 py-2 border-b border-border/40 bg-muted/10 shrink-0 overflow-x-auto scrollbar-none">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'rotate' | 'versions')}>
            <TabsList aria-label="Secret details sections" className="h-8 bg-transparent p-0 gap-2 inline-flex items-center whitespace-nowrap">
              <TabsTab
                value="overview"
                className="h-7 text-xs px-3 rounded-md text-muted-foreground hover:text-foreground data-selected:bg-primary/10 data-selected:text-primary data-selected:font-semibold cursor-pointer"
              >
                Overview &amp; Value
              </TabsTab>
              <TabsTab
                value="rotate"
                className="h-7 text-xs px-3 rounded-md text-muted-foreground hover:text-foreground data-selected:bg-primary/10 data-selected:text-primary data-selected:font-semibold cursor-pointer"
              >
                Rotate / Update
              </TabsTab>
              <TabsTab
                value="versions"
                className="h-7 text-xs px-3 rounded-md text-muted-foreground hover:text-foreground data-selected:bg-primary/10 data-selected:text-primary data-selected:font-semibold cursor-pointer"
              >
                Version History ({versions.length})
              </TabsTab>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <SecretFileOverview
                secret={secret}
                revealedValue={revealedValue}
                revealing={revealing}
                onReveal={handleReveal}
                onDownload={onDownload}
              />

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
            <SecretRotateTab
              secret={secret}
              apiBase={apiBase}
              authFetch={authFetch}
              revealedValue={revealedValue}
              onRotated={() => {
                setRevealedValue(null)
                onSecretUpdated()
                fetchVersions()
                setActiveTab('overview')
              }}
            />
          )}

          {activeTab === 'versions' && (
            <SecretVersionsTab
              currentVersion={secret.current_version}
              versions={versions}
              loading={loadingVersions}
              onRollback={handleRollback}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
