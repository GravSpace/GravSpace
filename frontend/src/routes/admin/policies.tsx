import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Shield, RefreshCw, Plus, Trash2, Search, ChevronDown, Copy,
  Eye, FileText, CheckCircle2, XCircle, Zap, Database, Download,
  Upload, Tag, Globe, Lock, Sparkles, Code2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { useAuth } from '../../hooks/useAuth'

export const Route = createFileRoute('/admin/policies')({
  component: PoliciesPage,
  head: () => ({ meta: [{ title: 'Security Policies | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

// ─── S3 Actions catalogue ──────────────────────────────────────────────────
const ACTION_GROUPS = [
  {
    group: 'Bucket Operations',
    icon: Database,
    color: 'indigo',
    actions: [
      { id: 's3:ListAllMyBuckets', label: 'List All Buckets', desc: 'List every bucket in the account' },
      { id: 's3:ListBucket', label: 'List Bucket Contents', desc: 'Browse objects in a bucket' },
      { id: 's3:GetBucketLocation', label: 'Get Bucket Location', desc: 'Read bucket region info' },
      { id: 's3:CreateBucket', label: 'Create Bucket', desc: 'Provision a new bucket' },
      { id: 's3:DeleteBucket', label: 'Delete Bucket', desc: 'Permanently remove a bucket' },
    ],
  },
  {
    group: 'Object Operations',
    icon: FileText,
    color: 'violet',
    actions: [
      { id: 's3:GetObject', label: 'Get / Download Object', desc: 'Read object content' },
      { id: 's3:PutObject', label: 'Put / Upload Object', desc: 'Write or overwrite objects' },
      { id: 's3:DeleteObject', label: 'Delete Object', desc: 'Remove a specific object' },
      { id: 's3:CopyObject', label: 'Copy Object', desc: 'Copy object within storage' },
      { id: 's3:HeadObject', label: 'Head Object', desc: 'Read object metadata only' },
    ],
  },
  {
    group: 'Tagging & Metadata',
    icon: Tag,
    color: 'amber',
    actions: [
      { id: 's3:GetObjectTagging', label: 'Get Object Tags', desc: 'Read object tag set' },
      { id: 's3:PutObjectTagging', label: 'Put Object Tags', desc: 'Set or overwrite tags' },
      { id: 's3:DeleteObjectTagging', label: 'Delete Object Tags', desc: 'Remove all tags' },
    ],
  },
  {
    group: 'Versioning & Lifecycle',
    icon: Globe,
    color: 'teal',
    actions: [
      { id: 's3:GetBucketVersioning', label: 'Get Versioning', desc: 'Read versioning status' },
      { id: 's3:PutBucketVersioning', label: 'Set Versioning', desc: 'Enable or suspend versioning' },
      { id: 's3:ListBucketVersions', label: 'List Object Versions', desc: 'Browse all object versions' },
      { id: 's3:GetLifecycleConfiguration', label: 'Get Lifecycle', desc: 'Read lifecycle rules' },
      { id: 's3:PutLifecycleConfiguration', label: 'Set Lifecycle', desc: 'Write lifecycle rules' },
    ],
  },
]

const ALL_ACTIONS = ACTION_GROUPS.flatMap(g => g.actions)

// Quick-select presets
const PRESETS = [
  {
    name: 'Read Only',
    icon: Eye,
    description: 'Download and browse — no writes',
    color: 'sky',
    actions: ['s3:GetObject', 's3:ListBucket', 's3:ListAllMyBuckets', 's3:HeadObject'],
  },
  {
    name: 'Read Write',
    icon: Upload,
    description: 'Full object read/write access',
    color: 'emerald',
    actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject', 's3:ListBucket', 's3:ListAllMyBuckets', 's3:HeadObject', 's3:CopyObject'],
  },
  {
    name: 'Admin',
    icon: Zap,
    description: 'Unrestricted access to everything',
    color: 'violet',
    actions: ALL_ACTIONS.map(a => a.id),
  },
  {
    name: 'Download Only',
    icon: Download,
    description: 'Only fetch/download objects',
    color: 'amber',
    actions: ['s3:GetObject', 's3:HeadObject'],
  },
]

const COLOR_MAP: Record<string, { badge: string; bg: string; border: string; text: string; check: string }> = {
  indigo: { badge: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-500/5 hover:bg-indigo-500/10', border: 'border-indigo-500/20 hover:border-indigo-500/40', text: 'text-indigo-600 dark:text-indigo-400', check: 'text-indigo-500' },
  violet: { badge: 'bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/5 hover:bg-violet-500/10', border: 'border-violet-500/20 hover:border-violet-500/40', text: 'text-violet-600 dark:text-violet-400', check: 'text-violet-500' },
  amber: { badge: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/5 hover:bg-amber-500/10', border: 'border-amber-500/20 hover:border-amber-500/40', text: 'text-amber-600 dark:text-amber-400', check: 'text-amber-500' },
  teal: { badge: 'bg-teal-500/10 border-teal-500/20 text-teal-600 dark:text-teal-400', bg: 'bg-teal-500/5 hover:bg-teal-500/10', border: 'border-teal-500/20 hover:border-teal-500/40', text: 'text-teal-600 dark:text-teal-400', check: 'text-teal-500' },
  sky: { badge: 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400', bg: 'bg-sky-500/5 hover:bg-sky-500/10', border: 'border-sky-500/20 hover:border-sky-500/40', text: 'text-sky-600 dark:text-sky-400', check: 'text-sky-500' },
  emerald: { badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/5 hover:bg-emerald-500/10', border: 'border-emerald-500/20 hover:border-emerald-500/40', text: 'text-emerald-600 dark:text-emerald-400', check: 'text-emerald-500' },
}

interface Statement {
  effect: 'Allow' | 'Deny'
  action: string[]
  resource: string
}

interface Policy {
  name: string
  version: string
  statement: Statement[]
}

// Build JSON from visual builder state
function buildPolicyJson(name: string, statements: Statement[]): string {
  return JSON.stringify({
    name,
    version: '2012-10-17',
    statement: statements.map(s => ({
      effect: s.effect,
      action: s.action,
      resource: [s.resource || 'arn:aws:s3:::*'],
    })),
  }, null, 2)
}

function defaultStatement(): Statement {
  return { effect: 'Allow', action: [], resource: 'arn:aws:s3:::*' }
}

export function PoliciesPage() {
  const { authFetch } = useAuth()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null)
  const [viewPolicy, setViewPolicy] = useState<Policy | null>(null)

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false)
  const [policyName, setPolicyName] = useState('')
  const [statements, setStatements] = useState<Statement[]>([defaultStatement()])
  const [jsonMode, setJsonMode] = useState(false)
  const [rawJson, setRawJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Live JSON preview derived from builder
  const liveJson = useMemo(() => buildPolicyJson(policyName || 'PolicyName', statements), [policyName, statements])

  // Sync raw JSON when switching to JSON tab
  function handleTabChange(val: string) {
    if (val === 'json') {
      setRawJson(liveJson)
      setJsonError(null)
    }
    setJsonMode(val === 'json')
  }

  const fetchPolicies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/policies`)
      if (res.ok) setPolicies((await res.json()) || [])
    } catch {
      toast.error('Failed to fetch policies.')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { fetchPolicies() }, [])

  const filtered = policies.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))

  // ─── Statement helpers ─────────────────────────────────────────────────────
  function toggleAction(stmtIdx: number, actionId: string) {
    setStatements(prev => prev.map((s, i) => {
      if (i !== stmtIdx) return s
      const has = s.action.includes(actionId)
      return { ...s, action: has ? s.action.filter(a => a !== actionId) : [...s.action, actionId] }
    }))
  }

  function setEffect(stmtIdx: number, effect: 'Allow' | 'Deny') {
    setStatements(prev => prev.map((s, i) => i === stmtIdx ? { ...s, effect } : s))
  }

  function setResource(stmtIdx: number, resource: string) {
    setStatements(prev => prev.map((s, i) => i === stmtIdx ? { ...s, resource } : s))
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    setStatements([{ effect: 'Allow', action: preset.actions, resource: 'arn:aws:s3:::*' }])
  }

  function addStatement() {
    setStatements(prev => [...prev, defaultStatement()])
  }

  function removeStatement(idx: number) {
    setStatements(prev => prev.filter((_, i) => i !== idx))
  }

  function resetDialog() {
    setPolicyName('')
    setStatements([defaultStatement()])
    setRawJson('')
    setJsonError(null)
    setJsonMode(false)
    setShowCreate(false)
  }

  // ─── Create Policy ─────────────────────────────────────────────────────────
  async function createPolicy() {
    let payload: Policy
    try {
      if (jsonMode) {
        payload = JSON.parse(rawJson)
      } else {
        payload = JSON.parse(liveJson)
      }
    } catch (e: any) {
      toast.error(`Invalid JSON: ${e.message}`)
      return
    }
    if (!payload.name?.trim()) { toast.error('Policy name is required.'); return }

    setCreating(true)
    try {
      const res = await authFetch(`${API_BASE}/admin/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(`Policy "${payload.name}" created.`)
        resetDialog()
        fetchPolicies()
      } else {
        const err = await res.text()
        toast.error(`Failed: ${err}`)
      }
    } finally {
      setCreating(false)
    }
  }

  async function deletePolicy(name: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/policies/${name}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed')
        fetchPolicies()
      },
      { loading: `Removing "${name}"...`, success: `Policy "${name}" deleted.`, error: 'Failed to delete policy.' },
    )
  }

  function getActions(policy: Policy): string[] {
    return [...new Set(policy.statement?.flatMap(s => s.action || []))].slice(0, 5)
  }

  function getEffects(policy: Policy): string[] {
    return [...new Set(policy.statement?.map(s => s.effect) || [])]
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Security Policies</h1>
          <p className="text-xs text-muted-foreground">Reusable IAM permission templates for access control.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter policies..."
              className="h-8 w-44 pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={fetchPolicies} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button size="sm" className="h-8" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-2" /> New Policy
          </Button>
        </div>
      </header>

      {/* ─── Policy List ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto p-6 space-y-2.5">
        {filtered.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 opacity-20" />
            </div>
            <span className="text-sm font-medium">
              {searchQuery ? 'No matching policies' : 'No policies defined yet'}
            </span>
            <span className="text-xs opacity-60 mt-1">
              {searchQuery ? 'Try adjusting your search' : 'Create your first policy to get started'}
            </span>
            {!searchQuery && (
              <Button size="sm" className="mt-5" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5 mr-2" /> Create First Policy
              </Button>
            )}
          </div>
        )}

        {filtered.map((policy) => {
          const isExpanded = expandedPolicy === policy.name
          const actions = getActions(policy)
          const effects = getEffects(policy)
          const stmtCount = policy.statement?.length ?? 0

          return (
            <div
              key={policy.name}
              className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-300"
            >
              {/* Card Header */}
              <div
                className="flex items-center justify-between px-5 py-3.5 cursor-pointer"
                onClick={() => setExpandedPolicy(isExpanded ? null : policy.name)}
              >
                {/* Left: icon + name */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-indigo-500/20 flex items-center justify-center shrink-0 group-hover:from-indigo-500/25 group-hover:to-violet-500/25 transition-colors duration-300">
                    <FileText className="w-4 h-4 text-indigo-500" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold truncate tracking-tight">{policy.name}</span>
                      <Badge variant="outline" className="text-[8px] h-4 py-0 px-1.5 uppercase tracking-widest font-extrabold border-slate-300 dark:border-slate-700 text-muted-foreground shrink-0">
                        Global
                      </Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider opacity-50">
                      {stmtCount} {stmtCount === 1 ? 'statement' : 'statements'} · {effects.join(' + ')}
                    </span>
                  </div>
                </div>

                {/* Center: action badges */}
                <div className="flex items-center gap-1.5 flex-wrap justify-center max-w-[40%] px-4">
                  {actions.length === 0 && (
                    <span className="text-[10px] text-muted-foreground italic opacity-40">No actions</span>
                  )}
                  {actions.map(a => (
                    <div key={a} className="flex items-center h-5 px-1.5 rounded bg-amber-500/8 border border-amber-500/15">
                      <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-400 font-mono">{a}</span>
                    </div>
                  ))}
                  {(policy.statement?.flatMap(s => s.action || []).length ?? 0) > 5 && (
                    <span className="text-[9px] text-muted-foreground opacity-50">+{(policy.statement?.flatMap(s => s.action || []).length ?? 0) - 5} more</span>
                  )}
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-indigo-500 hover:bg-indigo-500/10"
                    onClick={() => setViewPolicy(policy)}
                    title="View JSON"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => deletePolicy(policy.name)}
                    title="Delete Policy"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/40 ml-1 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expandable: Statement cards */}
              {isExpanded && (
                <div className="border-t border-slate-100 dark:border-slate-800/80 px-5 py-4 space-y-2.5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Policy Statements</span>
                    <Button
                      variant="ghost" size="sm"
                      className="h-5 text-[9px] px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(policy, null, 2))
                        toast.success('Policy JSON copied.')
                      }}
                    >
                      <Copy className="w-2.5 h-2.5 mr-1" /> Copy JSON
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {policy.statement?.map((stmt, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 space-y-2 ${stmt.effect === 'Allow'
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-red-500/5 border-red-500/20'
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          {stmt.effect === 'Allow'
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          }
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${stmt.effect === 'Allow' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {stmt.effect}
                          </span>
                          <span className="text-[9px] text-muted-foreground font-mono truncate ml-auto opacity-60">
                            {Array.isArray(stmt.resource) ? stmt.resource[0] : stmt.resource}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(stmt.action || []).map(a => (
                            <span key={a} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </main>

      {/* ─── Create Policy Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={(o) => { if (!o) resetDialog() }}>
        <DialogContent className="sm:max-w-3xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
          {/* Dialog top bar */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
            <div className="flex items-center gap-3 mb-1">
              <div className="h-9 w-9 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <Shield className="w-4.5 h-4.5 text-indigo-600" />
              </div>
              <div>
                <DialogTitle className="text-base">Define IAM Policy</DialogTitle>
                <DialogDescription className="text-xs">
                  Build reusable permission templates using the visual builder or JSON editor.
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Policy Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider opacity-70">Policy Name</Label>
              <Input
                value={policyName}
                onChange={e => setPolicyName(e.target.value)}
                placeholder="e.g. ReadOnlyAccess, ServiceAccountPolicy"
                className="h-10"
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground italic">Use a descriptive name that reflects the policy's intent.</p>
            </div>

            {/* Builder / JSON Tabs */}
            <Tabs defaultValue="builder" onValueChange={handleTabChange}>
              <TabsList className="w-full grid grid-cols-2 h-9">
                <TabsTrigger value="builder" className="text-xs gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Visual Builder
                </TabsTrigger>
                <TabsTrigger value="json" className="text-xs gap-1.5">
                  <Code2 className="w-3.5 h-3.5" /> JSON Editor
                </TabsTrigger>
              </TabsList>

              {/* ── Visual Builder ─────────────────────────────────────── */}
              <TabsContent value="builder" className="space-y-4 mt-3">
                {/* Presets row */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Quick Presets</p>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESETS.map(preset => {
                      const c = COLOR_MAP[preset.color]
                      const Icon = preset.icon
                      return (
                        <button
                          key={preset.name}
                          onClick={() => applyPreset(preset)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${c.bg} ${c.border}`}
                        >
                          <Icon className={`w-4 h-4 ${c.text}`} />
                          <span className={`text-[10px] font-bold leading-none ${c.text}`}>{preset.name}</span>
                          <span className="text-[9px] text-muted-foreground leading-tight opacity-70">{preset.description}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Statement list */}
                <div className="space-y-3 max-h-[36vh] overflow-y-auto pr-1">
                  {statements.map((stmt, stmtIdx) => (
                    <div
                      key={stmtIdx}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-4 space-y-3"
                    >
                      {/* Statement header */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Statement #{stmtIdx + 1}
                        </span>
                        {statements.length > 1 && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 text-[10px] text-destructive hover:bg-destructive/10 px-2"
                            onClick={() => removeStatement(stmtIdx)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Remove
                          </Button>
                        )}
                      </div>

                      {/* Effect + Resource */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Effect</Label>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setEffect(stmtIdx, 'Allow')}
                              className={`flex-1 h-8 rounded-lg border text-[11px] font-bold transition-all ${stmt.effect === 'Allow'
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-muted-foreground'
                                }`}
                            >
                              <CheckCircle2 className="w-3 h-3 inline mr-1" />Allow
                            </button>
                            <button
                              onClick={() => setEffect(stmtIdx, 'Deny')}
                              className={`flex-1 h-8 rounded-lg border text-[11px] font-bold transition-all ${stmt.effect === 'Deny'
                                ? 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-500/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-red-400 text-muted-foreground'
                                }`}
                            >
                              <XCircle className="w-3 h-3 inline mr-1" />Deny
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Resource ARN</Label>
                          <Input
                            value={stmt.resource}
                            onChange={e => setResource(stmtIdx, e.target.value)}
                            placeholder="arn:aws:s3:::*"
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>

                      {/* Action groups */}
                      <div className="space-y-2">
                        <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Actions</Label>
                        <div className="space-y-2">
                          {ACTION_GROUPS.map(group => {
                            const c = COLOR_MAP[group.color]
                            const GroupIcon = group.icon
                            const allSelected = group.actions.every(a => stmt.action.includes(a.id))
                            const someSelected = group.actions.some(a => stmt.action.includes(a.id))

                            return (
                              <div key={group.group} className={`rounded-lg border p-3 transition-colors ${someSelected ? `${c.bg} ${c.border}` : 'border-slate-200 dark:border-slate-800 hover:bg-muted/30'}`}>
                                {/* Group header: toggle all */}
                                <button
                                  className="w-full flex items-center justify-between mb-2"
                                  onClick={() => {
                                    if (allSelected) {
                                      setStatements(prev => prev.map((s, i) => i === stmtIdx
                                        ? { ...s, action: s.action.filter(a => !group.actions.map(ga => ga.id).includes(a)) }
                                        : s))
                                    } else {
                                      const toAdd = group.actions.map(a => a.id).filter(id => !stmt.action.includes(id))
                                      setStatements(prev => prev.map((s, i) => i === stmtIdx
                                        ? { ...s, action: [...s.action, ...toAdd] }
                                        : s))
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <GroupIcon className={`w-3.5 h-3.5 ${someSelected ? c.text : 'text-muted-foreground'}`} />
                                    <span className={`text-[10px] font-bold ${someSelected ? c.text : 'text-muted-foreground'}`}>
                                      {group.group}
                                    </span>
                                  </div>
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${allSelected ? `bg-current border-transparent ${c.check}` : someSelected ? 'border-current bg-current/20' : 'border-slate-300 dark:border-slate-600'}`}>
                                    {allSelected && <span className="text-white text-[8px] leading-none">✓</span>}
                                    {someSelected && !allSelected && <span className={`text-[8px] leading-none ${c.text}`}>–</span>}
                                  </div>
                                </button>

                                {/* Individual actions */}
                                <div className="grid grid-cols-2 gap-1">
                                  {group.actions.map(action => {
                                    const checked = stmt.action.includes(action.id)
                                    return (
                                      <button
                                        key={action.id}
                                        onClick={() => toggleAction(stmtIdx, action.id)}
                                        className={`flex items-center gap-2 p-1.5 rounded-md text-left transition-all ${checked
                                          ? `${c.bg} ${c.border} border`
                                          : 'hover:bg-muted/60 border border-transparent'
                                          }`}
                                      >
                                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${checked
                                          ? `bg-current border-transparent ${c.check}`
                                          : 'border-slate-300 dark:border-slate-600'
                                          }`}>
                                          {checked && <span className="text-white text-[7px] leading-none">✓</span>}
                                        </div>
                                        <div className="min-w-0">
                                          <p className={`text-[10px] font-semibold leading-none truncate ${checked ? c.text : 'text-foreground/70'}`}>
                                            {action.label}
                                          </p>
                                          <p className="text-[8px] text-muted-foreground truncate mt-0.5 opacity-70">{action.id}</p>
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Statement */}
                <Button variant="outline" size="sm" className="h-8 w-full border-dashed text-xs" onClick={addStatement}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Statement
                </Button>

                {/* Live JSON preview */}
                <div className="rounded-lg border border-slate-800 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">JSON Preview</span>
                    <button
                      className="text-[9px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                      onClick={() => { navigator.clipboard.writeText(liveJson); toast.success('JSON copied.') }}
                    >
                      <Copy className="w-2.5 h-2.5" /> Copy
                    </button>
                  </div>
                  <pre className="p-3 text-[10px] font-mono text-emerald-400 bg-slate-950 overflow-x-auto max-h-32 leading-relaxed">
                    {liveJson}
                  </pre>
                </div>
              </TabsContent>

              {/* ── JSON Editor ────────────────────────────────────────── */}
              <TabsContent value="json" className="space-y-2 mt-3">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Policy Document (JSON)</Label>
                  <Badge variant="outline" className="font-mono text-[9px] h-4">IAM 2012-10-17</Badge>
                </div>
                <div className="relative group">
                  <textarea
                    value={rawJson}
                    onChange={e => {
                      setRawJson(e.target.value)
                      try { JSON.parse(e.target.value); setJsonError(null) }
                      catch (err: any) { setJsonError(err.message) }
                    }}
                    rows={16}
                    spellCheck={false}
                    className="w-full font-mono text-[11px] bg-slate-950 text-emerald-400 border-0 ring-1 ring-slate-800 focus:ring-indigo-500 focus:outline-none rounded-lg p-4 resize-none leading-relaxed transition-shadow"
                  />
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="h-6 px-2 text-[9px] bg-slate-800 hover:bg-slate-700 text-white rounded"
                      onClick={() => {
                        try {
                          setRawJson(JSON.stringify(JSON.parse(rawJson), null, 2))
                          setJsonError(null)
                        } catch { toast.error('Invalid JSON') }
                      }}
                    >
                      Format
                    </button>
                  </div>
                </div>
                {jsonError && (
                  <p className="text-[10px] text-rose-400 flex items-center gap-1">
                    <XCircle className="w-3 h-3 shrink-0" /> {jsonError}
                  </p>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 shrink-0 flex items-center justify-between">
            <div className="text-[10px] text-muted-foreground">
              {!jsonMode && (
                <span>
                  <span className="font-bold text-foreground">{statements.reduce((acc, s) => acc + s.action.length, 0)}</span> actions across{' '}
                  <span className="font-bold text-foreground">{statements.length}</span>{' '}
                  {statements.length === 1 ? 'statement' : 'statements'}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetDialog}>Cancel</Button>
              <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={createPolicy}
                disabled={!policyName.trim() || creating || (jsonMode && !!jsonError)}
              >
                <Lock className="w-3.5 h-3.5 mr-2" />
                {creating ? 'Creating...' : 'Create Policy'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── View Policy JSON Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!viewPolicy} onOpenChange={o => { if (!o) setViewPolicy(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3">
              <Eye className="w-5 h-5 text-indigo-600" />
            </div>
            <DialogTitle className="font-mono">{viewPolicy?.name}</DialogTitle>
            <DialogDescription>Full policy document</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg overflow-hidden border border-slate-800">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">JSON Document</span>
                <button
                  className="text-[9px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                  onClick={() => { navigator.clipboard.writeText(JSON.stringify(viewPolicy, null, 2)); toast.success('Copied!') }}
                >
                  <Copy className="w-2.5 h-2.5" /> Copy
                </button>
              </div>
              <pre className="p-4 text-[11px] font-mono text-emerald-400 bg-slate-950 overflow-x-auto max-h-96 leading-relaxed">
                {JSON.stringify(viewPolicy, null, 2)}
              </pre>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewPolicy(null)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
