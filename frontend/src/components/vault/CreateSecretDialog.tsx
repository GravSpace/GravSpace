import { useState, useEffect } from 'react'
import {
  KeyRound,
  Bot,
  Key,
  ShieldCheck,
  Plus,
  Sparkles,
  Lock,
  ShieldAlert,
  ChevronDown,
  ClipboardPaste,
  FileCode,
} from 'lucide-react'
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
  type VaultEnvironment,
  type VaultProject,
  type SecretType,
  getEnvTheme,
} from './vaultTypes'
import { Folder } from '#/lib/iconsax-adapter'

interface Props {
  open: boolean
  onClose: () => void
  projects?: VaultProject[]
  currentProject?: string
  environments: VaultEnvironment[]
  currentEnv: string
  apiBase: string
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  onSecretCreated: () => void
}

export function CreateSecretDialog({
  open,
  onClose,
  projects,
  currentProject,
  environments,
  currentEnv,
  apiBase,
  authFetch,
  onSecretCreated,
}: Props) {
  const [targetEnv, setTargetEnv] = useState<string>(
    currentEnv === 'all' ? environments[0]?.slug || 'development' : currentEnv
  )
  const [targetProject, setTargetProject] = useState<string>(
    currentProject === 'all' ? (projects?.[0]?.slug || 'default') : (currentProject || 'default')
  )

  useEffect(() => {
    if (open) {
      setTargetEnv(currentEnv === 'all' ? environments[0]?.slug || 'development' : currentEnv)
      setTargetProject(currentProject === 'all' ? (projects?.[0]?.slug || 'default') : (currentProject || 'default'))
    }
  }, [open, currentEnv, currentProject, environments, projects])
  const [activeType, setActiveType] = useState<SecretType>('kv')
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [description, setDescription] = useState('')
  const [tagsStr, setTagsStr] = useState('')
  const [requiresApproval, setRequiresApproval] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Keystore specific fields
  const [keyAlias, setKeyAlias] = useState('')
  const [storePassword, setStorePassword] = useState('')
  const [keyPassword, setKeyPassword] = useState('')

  // Certificate specific fields
  const [certPem, setCertPem] = useState('')
  const [privateKeyPem, setPrivateKeyPem] = useState('')

  function handleGenerateAgentToken() {
    const raw = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const token = `agy_sec_${raw.slice(0, 48)}`
    setValue(token)
    toast.success('Generated high-entropy agent token')
  }

  function handleFileRead(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = reader.result?.toString().split(',')[1] || ''
      setValue(b64)
      setName(file.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_'))
      toast.success(`Loaded file "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`)
    }
    reader.readAsDataURL(file)
  }

  function resetForm() {
    setName('')
    setValue('')
    setDescription('')
    setTagsStr('')
    setRequiresApproval(false)
    setKeyAlias('')
    setStorePassword('')
    setKeyPassword('')
    setCertPem('')
    setPrivateKeyPem('')
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error('Secret name is required.')
      return
    }

    let finalValue = value
    let metadata: Record<string, any> = {}

    if (activeType === 'keystore') {
      if (!finalValue) {
        toast.error('KeyStore binary file or payload is required.')
        return
      }
      metadata = {
        key_alias: keyAlias.trim(),
        store_password: storePassword,
        key_password: keyPassword || storePassword,
      }
    } else if (activeType === 'certificate') {
      if (!certPem.trim()) {
        toast.error('Certificate PEM is required.')
        return
      }
      finalValue = JSON.stringify({
        certificate: certPem.trim(),
        private_key: privateKeyPem.trim(),
      })
    } else {
      if (!finalValue.trim()) {
        toast.error('Secret value is required.')
        return
      }
    }

    const tags = tagsStr
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    setSubmitting(true)
    try {
      const res = await authFetch(`${apiBase}/admin/vault/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          project_id: targetProject,
          environment: targetEnv,
          secret_type: activeType,
          value: finalValue,
          description: description.trim() || null,
          tags: tags.length ? tags : null,
          metadata: Object.keys(metadata).length ? metadata : null,
          requires_approval: requiresApproval,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Failed to create secret')
      }

      toast.success(`Secret "${name}" secured in ${targetEnv}.`)
      onSecretCreated()
      resetForm()
    } catch (err: any) {
      toast.error(err.message || 'Error creating secret.')
    } finally {
      setSubmitting(false)
    }
  }

  const currentEnvObj = environments.find((e) => e.slug === targetEnv)
  const envTheme = getEnvTheme(currentEnvObj?.color)

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetForm() }}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-xl rounded-2xl border border-border/80 bg-card p-0 overflow-hidden shadow-2xl max-h-[92vh] flex flex-col text-xs">
        <DialogHeader className="px-5 py-3.5 border-b border-border/50 bg-muted/20 flex flex-row items-center justify-between shrink-0 pr-12">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-2xs">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
                  Add New Secret
                </DialogTitle>
                {projects && projects.length > 0 && (
                  <div className="relative inline-flex items-center">
                    <Folder size={11} variant="Linear" className="w-3 h-3 absolute left-2 pointer-events-none text-muted-foreground shrink-0" />
                    <select
                      value={targetProject}
                      onChange={(e) => setTargetProject(e.target.value)}
                      className="h-5 pl-6 pr-5 rounded-full text-[10px] font-semibold border border-border/80 bg-muted/60 text-foreground appearance-none cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                      title="Target Project"
                    >
                      {projects.map((p) => (
                        <option key={p.slug} value={p.slug} className="bg-popover text-popover-foreground">
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-2.5 h-2.5 absolute right-1.5 pointer-events-none opacity-60" />
                  </div>
                )}
                <div className="relative inline-flex items-center">
                  <select
                    value={targetEnv}
                    onChange={(e) => setTargetEnv(e.target.value)}
                    className={`h-5 pl-2 pr-5 rounded-full text-[10px] font-semibold font-mono border appearance-none cursor-pointer transition-colors ${envTheme.badge} focus:outline-none focus:ring-1 focus:ring-primary`}
                    title="Target Environment"
                  >
                    {environments.map((e) => (
                      <option key={e.slug} value={e.slug} className="bg-popover text-popover-foreground font-sans">
                        ● {e.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-2.5 h-2.5 absolute right-1.5 pointer-events-none opacity-60" />
                </div>
              </div>
              <DialogDescription className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Encrypted at rest with AES-256-GCM authenticated encryption.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-3.5 space-y-3.5 text-xs">
          {/* Secret Type Selector */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Secret Category
            </Label>
            <div className="grid grid-cols-4 gap-1.5 p-1 rounded-xl bg-muted/40 border border-border/60">
              {(['kv', 'agent_token', 'keystore', 'certificate'] as const).map((type) => {
                const conf = TYPE_CONFIG[type]
                const Icon = conf.icon
                const isSelected = activeType === type
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setActiveType(type)}
                    className={`py-2 px-1.5 rounded-lg text-center transition-all flex flex-col items-center gap-1 cursor-pointer select-none ${isSelected
                        ? 'bg-card text-foreground border border-border shadow-2xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                      }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-primary' : conf.color}`} />
                    <span className="text-[11px] leading-tight truncate w-full">{conf.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Name & Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold flex items-center gap-1 text-foreground">
                Secret Name / Key <span className="text-rose-500">*</span>
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={
                  activeType === 'kv'
                    ? 'e.g. DATABASE_URL'
                    : activeType === 'agent_token'
                      ? 'e.g. AGENT_PAYMENT_BOT'
                      : activeType === 'keystore'
                        ? 'e.g. release-keystore.jks'
                        : 'e.g. wildcard.domain.crt'
                }
                className="h-8 font-mono text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-foreground">Tags (comma-separated)</Label>
              <Input
                value={tagsStr}
                onChange={(e) => setTagsStr(e.target.value)}
                placeholder="database, payment, ai"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Type Specific Fields */}
          {activeType === 'kv' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">
                  Secret Value <span className="text-rose-500">*</span>
                </Label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      if (text) {
                        setValue(text)
                        toast.success('Pasted from clipboard')
                      }
                    } catch { }
                  }}
                  className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ClipboardPaste className="w-3 h-3" />
                  <span>Paste</span>
                </button>
              </div>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Enter connection string, raw token, or key value..."
                className="min-h-[85px] font-mono text-xs bg-zinc-950/30 border-border/60 resize-none leading-relaxed"
                required
              />
            </div>
          )}

          {activeType === 'agent_token' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Agent Bearer Secret</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateAgentToken}
                  className="h-6 text-[10px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                >
                  <Sparkles className="w-3 h-3" /> Auto-Generate Token
                </Button>
              </div>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Click auto-generate or paste token..."
                className="h-8 font-mono text-xs"
                required
              />
            </div>
          )}

          {activeType === 'keystore' && (
            <div className="space-y-2.5 p-3 rounded-xl bg-muted/20 border border-border/50">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Upload KeyStore (.jks, .p12, .keystore)</Label>
                <Input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFileRead(f)
                  }}
                  className="h-8 text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:bg-primary file:text-primary-foreground cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Key Alias</Label>
                  <Input
                    value={keyAlias}
                    onChange={(e) => setKeyAlias(e.target.value)}
                    placeholder="my-key-alias"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Store Password</Label>
                  <Input
                    type="password"
                    value={storePassword}
                    onChange={(e) => setStorePassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Key Password</Label>
                  <Input
                    type="password"
                    value={keyPassword}
                    onChange={(e) => setKeyPassword(e.target.value)}
                    placeholder="(Same as store)"
                    className="h-8 font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {activeType === 'certificate' && (
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Certificate Body (PEM / CRT)</Label>
                <Textarea
                  value={certPem}
                  onChange={(e) => setCertPem(e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                  className="min-h-[75px] font-mono text-xs resize-none"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-foreground">Private Key (Optional)</Label>
                <Textarea
                  value={privateKeyPem}
                  onChange={(e) => setPrivateKeyPem(e.target.value)}
                  placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                  className="min-h-[65px] font-mono text-xs resize-none"
                />
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-foreground">Description / Notes</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Master database connection for billing services"
              className="h-8 text-xs"
            />
          </div>

          {/* Privileged Access Management (PAM) Toggle */}
          <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between gap-3 hover:bg-amber-500/10 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <Label className="text-xs font-semibold text-foreground block cursor-pointer">
                  Require Privileged Access Approval (PAM)
                </Label>
                <p className="text-[10px] text-muted-foreground truncate">
                  Plaintext reveal requires Just-In-Time administrator approval (Dual-Control).
                </p>
              </div>
            </div>
            <Switch
              checked={requiresApproval}
              onCheckedChange={setRequiresApproval}
              className="shrink-0 data-[state=checked]:bg-amber-500"
            />
          </div>

          <DialogFooter className="pt-3 border-t border-border/50 flex items-center justify-end gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={resetForm} disabled={submitting} className="h-8 text-xs">
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="h-8 text-xs gap-1.5 shadow-2xs font-semibold">
              <Plus className="w-3.5 h-3.5" />
              {submitting ? 'Encrypting & Storing...' : 'Save Secret'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
