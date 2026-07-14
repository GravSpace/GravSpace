import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Trash2, User, RefreshCw, Key, Shield, Lock,
  ChevronDown, Copy, Eye, EyeOff, Search, Users,
  ShieldCheck, Fingerprint, UserPlus, UserMinus, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { useAuth } from '../../hooks/useAuth'

export const Route = createFileRoute('/admin/users')({
  component: UsersPage,
  head: () => ({ meta: [{ title: 'IAM Engine | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

interface AccessKey {
  accessKeyId: string
  secretAccessKey: string
}

interface Policy {
  name: string
  version: string
  statement: any[]
}

interface IamUser {
  username: string
  policies?: Policy[]
  accessKeys?: AccessKey[]
}

function UsersPage() {
  const { authFetch } = useAuth()
  const [users, setUsers] = useState<Record<string, IamUser>>({})
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  // Create User Dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [creating, setCreating] = useState(false)

  // Change Password Dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [passwordTarget, setPasswordTarget] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  // Policy Templates
  const [policyTemplates, setPolicyTemplates] = useState<Policy[]>([])

  // Attach Policy Dialog
  const [showPolicyDialog, setShowPolicyDialog] = useState(false)
  const [policyTarget, setPolicyTarget] = useState('')
  const [attachMode, setAttachMode] = useState<'template' | 'inline'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [inlinePolicyJson, setInlinePolicyJson] = useState(JSON.stringify({
    name: 'ReadOnlyAccess',
    version: '2012-10-17',
    statement: [{ effect: 'Allow', action: ['s3:GetObject', 's3:ListBucket'], resource: ['arn:aws:s3:::*'] }]
  }, null, 2))

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/users`)
      if (res.ok) setUsers(await res.json())
    } catch {
      toast.error('Failed to sync users.')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  const fetchPolicyTemplates = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/admin/policies`)
      if (res.ok) setPolicyTemplates(await res.json())
    } catch { /* silent */ }
  }, [authFetch])

  useEffect(() => {
    fetchUsers()
    fetchPolicyTemplates()
  }, [])

  const filteredUsers = Object.entries(users).filter(([username]) =>
    username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  function toggleExpanded(username: string) {
    setExpandedUsers(prev => ({ ...prev, [username]: !prev[username] }))
  }

  function toggleSecret(keyId: string) {
    setShowSecrets(prev => ({ ...prev, [keyId]: !prev[keyId] }))
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard.`)
  }

  // ─── Create User ─────────────────────────────────────────────────────────────
  async function createUser() {
    const username = newUsername.trim()
    if (!username) return
    setCreating(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (res.ok) {
        toast.success(`User "${username}" created.`)
        setShowCreateDialog(false)
        setNewUsername('')
        fetchUsers()
      } else {
        const err = await res.text()
        toast.error(`Failed: ${err}`)
      }
    } finally {
      setCreating(false)
    }
  }

  // ─── Delete User ─────────────────────────────────────────────────────────────
  async function deleteUser(username: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/users/${username}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to delete user')
        fetchUsers()
      },
      {
        loading: `Deleting "${username}"...`,
        success: `User "${username}" removed.`,
        error: (e: Error) => `Delete failed: ${e.message}`,
      },
    )
  }

  // ─── Change Password ──────────────────────────────────────────────────────────
  async function changePassword() {
    setSavingPwd(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${passwordTarget}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPwd }),
      })
      if (res.ok) {
        toast.success(`Password updated for "${passwordTarget}".`)
        setShowPasswordDialog(false)
        setNewPwd('')
      } else {
        const err = await res.text()
        toast.error(`Failed: ${err}`)
      }
    } finally {
      setSavingPwd(false)
    }
  }

  // ─── Generate Access Key ──────────────────────────────────────────────────────
  async function generateKey(username: string) {
    try {
      const res = await authFetch(`${API_BASE}/admin/users/${username}/keys`, { method: 'POST' })
      if (res.ok) {
        toast.success('Access key generated.')
        setExpandedUsers(prev => ({ ...prev, [username]: true }))
        fetchUsers()
      } else {
        toast.error('Failed to generate access key.')
      }
    } catch {
      toast.error('Failed to generate access key.')
    }
  }

  // ─── Delete Access Key ────────────────────────────────────────────────────────
  async function deleteKey(username: string, keyId: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/keys/${keyId}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed to revoke key')
        fetchUsers()
      },
      {
        loading: `Revoking key "${keyId.slice(0, 12)}..."`,
        success: 'Access key revoked.',
        error: 'Failed to revoke key.',
      },
    )
  }

  // ─── Policies ─────────────────────────────────────────────────────────────────
  async function attachPolicy() {
    try {
      if (attachMode === 'template') {
        const res = await authFetch(`${API_BASE}/admin/users/${policyTarget}/policies/attach`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateName: selectedTemplate }),
        })
        if (res.ok) {
          toast.success('Policy attached.')
          setShowPolicyDialog(false)
          fetchUsers()
        } else {
          const err = await res.text()
          toast.error(`Failed: ${err}`)
        }
      } else {
        const policy = JSON.parse(inlinePolicyJson)
        const res = await authFetch(`${API_BASE}/admin/users/${policyTarget}/policies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(policy),
        })
        if (res.ok) {
          toast.success('Inline policy attached.')
          setShowPolicyDialog(false)
          fetchUsers()
        } else {
          const err = await res.text()
          toast.error(`Failed: ${err}`)
        }
      }
    } catch (e: any) {
      toast.error(`Error: ${e.message}`)
    }
  }

  async function removePolicy(username: string, policyName: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/users/${username}/policies/${policyName}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed')
        fetchUsers()
      },
      {
        loading: `Removing policy "${policyName}"...`,
        success: 'Policy removed.',
        error: 'Failed to remove policy.',
      },
    )
  }

  function getAvatarStyle(username: string) {
    if (username === 'admin') return 'bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 text-indigo-500'
    if (username === 'anonymous') return 'bg-gradient-to-br from-sky-500/15 to-cyan-500/15 border border-sky-500/25 text-sky-500'
    return 'bg-gradient-to-br from-slate-500/10 to-slate-400/10 border border-slate-300 dark:border-slate-700 text-slate-500'
  }

  function getAvatarIcon(username: string) {
    if (username === 'admin') return <ShieldCheck className="w-4 h-4" />
    return <User className="w-4 h-4" />
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* Header */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Identity & Access Management</h1>
          <p className="text-xs text-muted-foreground">Control security credentials and access permissions.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter principals..."
              className="h-8 w-48 pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={fetchUsers} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" className="h-8" onClick={() => setShowCreateDialog(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-2" />
            Provision User
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-auto p-6 space-y-3">
        {filteredUsers.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 opacity-20" />
            </div>
            <span className="text-sm font-medium">
              {searchQuery ? 'No matching principals' : 'No principals configured'}
            </span>
            <span className="text-xs opacity-60 mt-1">
              {searchQuery ? 'Try adjusting your search' : 'Create your first user to get started'}
            </span>
          </div>
        )}

        {filteredUsers.map(([username, user]) => (
          <div
            key={username}
            className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300"
          >
            {/* Card Header Row */}
            <div className="flex items-center justify-between px-5 py-3.5">
              {/* Left: Avatar + Identity */}
              <div className="flex items-center gap-3 min-w-0">
                <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${getAvatarStyle(username)}`}>
                  {getAvatarIcon(username)}
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm tracking-tight truncate">{username}</span>
                    {username === 'admin' && (
                      <Badge className="text-[8px] h-4 bg-indigo-500 hover:bg-indigo-500 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold">
                        Root
                      </Badge>
                    )}
                    {username === 'anonymous' && (
                      <Badge variant="outline" className="text-[8px] h-4 border-sky-500/30 text-sky-500 py-0 px-1.5 uppercase tracking-widest leading-none font-extrabold">
                        Guest
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-medium mt-0.5 uppercase tracking-wider opacity-50">
                    {username === 'admin' ? 'System Administrator' : username === 'anonymous' ? 'Unauthenticated Access' : 'Service Account'}
                  </span>
                </div>
              </div>

              {/* Center: Policies */}
              <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-[40%]">
                {user.policies?.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-1 h-6 px-2 rounded-md bg-indigo-500/8 border border-indigo-500/15 group/badge hover:border-indigo-500/40 transition-colors"
                  >
                    <Lock className="w-2.5 h-2.5 text-indigo-500 opacity-70" />
                    <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 capitalize leading-none">{p.name}</span>
                    {username !== 'admin' && (
                      <button
                        onClick={() => removePolicy(username, p.name)}
                        className="ml-1 text-slate-400 hover:text-rose-500 transition-colors flex items-center justify-center p-0.5"
                        title="Detach Policy"
                      >
                        <X className="w-2.5 h-2.5 font-bold" />
                      </button>
                    )}
                  </div>
                ))}
                {username !== 'admin' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-bold text-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-600 transition-all"
                    onClick={() => {
                      setPolicyTarget(username)
                      setAttachMode('template')
                      setSelectedTemplate('')
                      setShowPolicyDialog(true)
                    }}
                  >
                    <Plus className="w-3 h-3 mr-0.5" /> Attach
                  </Button>
                )}
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {username !== 'anonymous' ? (
                  <>
                    {username !== 'admin' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => generateKey(username)}
                        title="Generate Access Key"
                      >
                        <Key className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-amber-600 hover:bg-amber-500/10 transition-colors"
                      onClick={() => { setPasswordTarget(username); setNewPwd(''); setShowPasswordDialog(true) }}
                      title="Change Password"
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                    </Button>
                    {username !== 'admin' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        onClick={() => deleteUser(username)}
                        title="Delete User"
                      >
                        <UserMinus className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </>
                ) : (
                  <Badge variant="outline" className="text-[8px] font-bold uppercase tracking-tighter opacity-40 border-slate-300 pointer-events-none ml-1">
                    Immutable
                  </Badge>
                )}
              </div>
            </div>

            {/* Access Keys Section */}
            {user.accessKeys && user.accessKeys.length > 0 ? (
              <div className="border-t border-slate-100 dark:border-slate-800/80">
                <button
                  onClick={() => toggleExpanded(username)}
                  className="w-full flex items-center justify-between px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Key className="w-3 h-3 opacity-50" />
                    <span>{user.accessKeys.length} Access {user.accessKeys.length === 1 ? 'Key' : 'Keys'}</span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedUsers[username] ? 'rotate-180' : ''}`} />
                </button>

                {expandedUsers[username] && (
                  <div className={`px-5 pb-4 pt-1 grid gap-2 ${user.accessKeys.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {user.accessKeys.map((key) => (
                      <div
                        key={key.accessKeyId}
                        className="rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 p-3 space-y-2"
                      >
                        {/* Key ID Row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Access Key ID</span>
                            <code className="text-[11px] font-mono font-bold truncate">{key.accessKeyId}</code>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-muted"
                              onClick={() => copyToClipboard(key.accessKeyId, 'Key ID')}
                              title="Copy Key ID"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:bg-destructive/10"
                              onClick={() => deleteKey(username, key.accessKeyId)}
                              title="Revoke Key"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Secret Key Row */}
                        <div className="flex items-center justify-between gap-2 border-t border-slate-200/60 dark:border-slate-700/60 pt-2">
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[8px] text-muted-foreground uppercase font-bold tracking-widest opacity-60">Secret Access Key</span>
                            <code className="text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400 truncate">
                              {showSecrets[key.accessKeyId] ? key.secretAccessKey : '••••••••••••••••••••••••'}
                            </code>
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-muted"
                              onClick={() => toggleSecret(key.accessKeyId)}
                              title={showSecrets[key.accessKeyId] ? 'Hide' : 'Reveal'}
                            >
                              {showSecrets[key.accessKeyId] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 hover:bg-muted"
                              onClick={() => copyToClipboard(key.secretAccessKey, 'Secret Key')}
                              title="Copy Secret"
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              username !== 'admin' && username !== 'anonymous' && (
                <div className="border-t border-dashed border-slate-200/80 dark:border-slate-800/60 px-5 py-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Key className="w-3 h-3 opacity-25" />
                    <span className="text-[10px] font-medium uppercase tracking-widest opacity-40 italic">No active credentials</span>
                  </div>
                </div>
              )
            )}
          </div>
        ))}
      </main>

      {/* ─── Create User Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <UserPlus className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle>Provision New User</DialogTitle>
            <DialogDescription>
              Cloud service accounts require dedicated credentials for programmatic access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Username</Label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createUser()}
                placeholder="e.g. storage-indexer-svc"
                className="h-10"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground italic">Principal IDs must be globally unique.</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Dismiss</Button>
              <Button onClick={createUser} disabled={!newUsername.trim() || creating}>
                {creating ? 'Creating...' : 'Initialize Account'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Change Password Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
              <Fingerprint className="w-5 h-5 text-amber-600" />
            </div>
            <DialogTitle>Reset Credentials</DialogTitle>
            <DialogDescription>
              Renew master password for principal <strong>{passwordTarget}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-70">New Password</Label>
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && changePassword()}
                placeholder="••••••••••••"
                className="h-10"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700"
                onClick={changePassword}
                disabled={!newPwd || savingPwd}
              >
                {savingPwd ? 'Saving...' : 'Apply Reset'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Attach Policy Dialog ──────────────────────────────────────────────── */}
      <Dialog open={showPolicyDialog} onOpenChange={setShowPolicyDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
              <Shield className="w-5 h-5 text-indigo-600" />
            </div>
            <DialogTitle>Attach Policy</DialogTitle>
            <DialogDescription>
              Attach to <strong>{policyTarget}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Mode Selector */}
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setAttachMode('template')}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${attachMode === 'template' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
              >
                Global Template
              </button>
              <button
                onClick={() => setAttachMode('inline')}
                className={`flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${attachMode === 'inline' ? 'bg-background shadow-sm' : 'hover:bg-background/50'}`}
              >
                Inline Policy
              </button>
            </div>

            {attachMode === 'template' ? (
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Select Template</Label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full h-10 rounded-md border border-slate-200 dark:border-slate-800 bg-background px-3 text-sm focus:ring-2 focus:ring-primary"
                >
                  <option value="" disabled>Choose a template...</option>
                  {policyTemplates.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}</option>
                  ))}
                </select>
                {selectedTemplate && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Preview</div>
                    <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-auto max-h-32">
                      {JSON.stringify(policyTemplates.find(t => t.name === selectedTemplate), null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider opacity-70">JSON Document</Label>
                  <Badge variant="outline" className="font-mono text-[9px] h-4">2012-10-17</Badge>
                </div>
                <div className="relative group">
                  <textarea
                    value={inlinePolicyJson}
                    onChange={(e) => setInlinePolicyJson(e.target.value)}
                    rows={12}
                    className="w-full font-mono text-[11px] bg-slate-950 text-emerald-400 border-0 ring-1 ring-slate-800 focus:ring-primary focus:outline-none rounded-lg p-4 resize-none leading-relaxed"
                    spellCheck={false}
                  />
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="h-6 px-2 text-[9px] bg-slate-800 hover:bg-slate-700 text-white rounded"
                      onClick={() => {
                        try {
                          setInlinePolicyJson(JSON.stringify(JSON.parse(inlinePolicyJson), null, 2))
                        } catch {
                          toast.error('Invalid JSON')
                        }
                      }}
                    >
                      Format
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowPolicyDialog(false)}>Discard</Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700"
                onClick={attachPolicy}
                disabled={attachMode === 'template' && !selectedTemplate}
              >
                Sync Permissions
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
