import { useState, useMemo } from 'react'
import { Plus, Trash2, Copy, CheckCircle2, XCircle, Sparkles, Code2, Lock, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import {
  type Statement,
  type Policy,
  ACTION_GROUPS,
  PRESETS,
  COLOR_MAP,
  buildPolicyJson,
  defaultStatement,
} from './policyTypes'

interface Props {
  open: boolean
  onClose: () => void
  buckets: string[]
  onCreated: (policy: Policy) => void
}

export function PolicyEditorDialog({ open, onClose, buckets, onCreated }: Props) {
  const [policyName, setPolicyName] = useState('')
  const [statements, setStatements] = useState<Statement[]>([defaultStatement()])
  const [jsonMode, setJsonMode] = useState(false)
  const [rawJson, setRawJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const liveJson = useMemo(() => buildPolicyJson(policyName || 'PolicyName', statements), [policyName, statements])

  function handleTabChange(val: string) {
    if (val === 'json') {
      setRawJson(liveJson)
      setJsonError(null)
    }
    setJsonMode(val === 'json')
  }

  function toggleAction(stmtIdx: number, actionId: string) {
    setStatements((prev) =>
      prev.map((s, i) => {
        if (i !== stmtIdx) return s
        const has = s.action.includes(actionId)
        return { ...s, action: has ? s.action.filter((a) => a !== actionId) : [...s.action, actionId] }
      }),
    )
  }

  function setEffect(stmtIdx: number, effect: 'Allow' | 'Deny') {
    setStatements((prev) => prev.map((s, i) => (i === stmtIdx ? { ...s, effect } : s)))
  }

  function setResource(stmtIdx: number, resource: string) {
    setStatements((prev) => prev.map((s, i) => (i === stmtIdx ? { ...s, resource } : s)))
  }

  function applyPreset(preset: (typeof PRESETS)[0]) {
    setStatements([{ effect: 'Allow', action: preset.actions, resource: 'arn:aws:s3:::*' }])
  }

  function resetDialog() {
    setPolicyName('')
    setStatements([defaultStatement()])
    setRawJson('')
    setJsonError(null)
    setJsonMode(false)
    onClose()
  }

  function handleSubmit() {
    let payload: Policy
    try {
      payload = jsonMode ? JSON.parse(rawJson) : JSON.parse(liveJson)
    } catch (e: any) {
      toast.error(`Invalid JSON: ${e.message}`)
      return
    }
    if (!payload.name?.trim()) {
      toast.error('Policy name is required.')
      return
    }

    setSubmitting(true)
    try {
      onCreated(payload)
      resetDialog()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetDialog() }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl bg-card">
        <DialogHeader className="px-6 py-4 border-b border-border/50 shrink-0 bg-muted/20 flex flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold tracking-tight">Create Security Policy</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Define access rules using the visual builder or raw JSON document.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Policy Name</Label>
            <Input
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              placeholder="e.g. read-only-public-bucket"
              className="h-9 font-mono text-xs"
            />
          </div>

          <Tabs defaultValue="builder" onValueChange={handleTabChange}>
            <TabsList className="w-full grid grid-cols-2 h-9">
              <TabsTrigger value="builder" className="text-xs gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Visual Builder
              </TabsTrigger>
              <TabsTrigger value="json" className="text-xs gap-1.5">
                <Code2 className="w-3.5 h-3.5" /> JSON Editor
              </TabsTrigger>
            </TabsList>

            <TabsContent value="builder" className="space-y-4 mt-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Quick Presets</p>
                <div className="grid grid-cols-4 gap-2">
                  {PRESETS.map((preset) => {
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

              <div className="space-y-3 max-h-[36vh] overflow-y-auto pr-1">
                {statements.map((stmt, stmtIdx) => (
                  <div key={stmtIdx} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Statement #{stmtIdx + 1}</span>
                      {statements.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-destructive hover:bg-destructive/10 px-2"
                          onClick={() => setStatements((prev) => prev.filter((_, i) => i !== stmtIdx))}
                        >
                          <Trash2 className="w-3 h-3 mr-1" /> Remove
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Effect</Label>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setEffect(stmtIdx, 'Allow')}
                            className={`flex-1 h-8 rounded-lg border text-[11px] font-bold transition-all ${
                              stmt.effect === 'Allow'
                                ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-500/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-muted-foreground'
                            }`}
                          >
                            <CheckCircle2 className="w-3 h-3 inline mr-1" />Allow
                          </button>
                          <button
                            onClick={() => setEffect(stmtIdx, 'Deny')}
                            className={`flex-1 h-8 rounded-lg border text-[11px] font-bold transition-all ${
                              stmt.effect === 'Deny'
                                ? 'bg-red-500 border-red-500 text-white shadow-sm shadow-red-500/20'
                                : 'border-slate-200 dark:border-slate-700 hover:border-red-400 text-muted-foreground'
                            }`}
                          >
                            <XCircle className="w-3 h-3 inline mr-1" />Deny
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Resource Target</Label>
                        <div className="flex gap-1.5">
                          <select
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === '*') setResource(stmtIdx, 'arn:aws:s3:::*')
                              else if (val) setResource(stmtIdx, `arn:aws:s3:::${val}/*`)
                            }}
                            className="h-8 rounded-md border border-slate-200 dark:border-slate-800 bg-background px-2 text-[10px] w-28 shrink-0 focus:outline-none"
                          >
                            <option value="*">All Buckets</option>
                            {buckets.map((b) => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                          </select>
                          <Input
                            value={stmt.resource}
                            onChange={(e) => setResource(stmtIdx, e.target.value)}
                            placeholder="arn:aws:s3:::*"
                            className="h-8 text-xs font-mono flex-1"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Actions</Label>
                      <div className="space-y-2">
                        {ACTION_GROUPS.map((group) => {
                          const c = COLOR_MAP[group.color]
                          const GroupIcon = group.icon
                          const allSelected = group.actions.every((a) => stmt.action.includes(a.id))
                          const someSelected = group.actions.some((a) => stmt.action.includes(a.id))

                          return (
                            <div key={group.group} className={`rounded-lg border p-3 transition-colors ${someSelected ? `${c.bg} ${c.border}` : 'border-slate-200 dark:border-slate-800 hover:bg-muted/30'}`}>
                              <button
                                className="w-full flex items-center justify-between mb-2"
                                onClick={() => {
                                  if (allSelected) {
                                    setStatements((prev) =>
                                      prev.map((s, i) =>
                                        i === stmtIdx ? { ...s, action: s.action.filter((a) => !group.actions.map((ga) => ga.id).includes(a)) } : s,
                                      ),
                                    )
                                  } else {
                                    const toAdd = group.actions.map((a) => a.id).filter((id) => !stmt.action.includes(id))
                                    setStatements((prev) =>
                                      prev.map((s, i) => (i === stmtIdx ? { ...s, action: [...s.action, ...toAdd] } : s)),
                                    )
                                  }
                                }}
                              >
                                <div className="flex items-center gap-2">
                                  <GroupIcon className={`w-3.5 h-3.5 ${someSelected ? c.text : 'text-muted-foreground'}`} />
                                  <span className={`text-[10px] font-bold ${someSelected ? c.text : 'text-muted-foreground'}`}>{group.group}</span>
                                </div>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${allSelected ? `bg-current border-transparent ${c.check}` : someSelected ? 'border-current bg-current/20' : 'border-slate-300 dark:border-slate-600'}`}>
                                  {allSelected && <span className="text-white text-[8px] leading-none">✓</span>}
                                  {someSelected && !allSelected && <span className={`text-[8px] leading-none ${c.text}`}>–</span>}
                                </div>
                              </button>

                              <div className="grid grid-cols-2 gap-1">
                                {group.actions.map((action) => {
                                  const checked = stmt.action.includes(action.id)
                                  return (
                                    <button
                                      key={action.id}
                                      onClick={() => toggleAction(stmtIdx, action.id)}
                                      className={`flex items-center gap-2 p-1.5 rounded-md text-left transition-all ${
                                        checked ? `${c.bg} ${c.border} border` : 'hover:bg-muted/60 border border-transparent'
                                      }`}
                                    >
                                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all ${checked ? `bg-current border-transparent ${c.check}` : 'border-slate-300 dark:border-slate-600'}`}>
                                        {checked && <span className="text-white text-[7px] leading-none">✓</span>}
                                      </div>
                                      <div className="min-w-0">
                                        <p className={`text-[10px] font-semibold leading-none truncate ${checked ? c.text : 'text-foreground/70'}`}>{action.label}</p>
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

              <Button variant="outline" size="sm" className="h-8 w-full border-dashed text-xs" onClick={() => setStatements((prev) => [...prev, defaultStatement()])}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Statement
              </Button>

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
                <pre className="p-3 text-[10px] font-mono text-emerald-400 bg-slate-950 overflow-x-auto max-h-32 leading-relaxed">{liveJson}</pre>
              </div>
            </TabsContent>

            <TabsContent value="json" className="space-y-2 mt-3">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] font-bold uppercase tracking-wider opacity-70">Policy Document (JSON)</Label>
                <Badge variant="outline" className="font-mono text-[9px] h-4">IAM 2012-10-17</Badge>
              </div>
              <textarea
                value={rawJson}
                onChange={(e) => {
                  setRawJson(e.target.value)
                  try { JSON.parse(e.target.value); setJsonError(null) } catch (err: any) { setJsonError(err.message) }
                }}
                rows={14}
                spellCheck={false}
                className="w-full font-mono text-[11px] bg-slate-950 text-emerald-400 border-0 ring-1 ring-slate-800 focus:ring-indigo-500 focus:outline-none rounded-lg p-4 resize-none leading-relaxed transition-shadow"
              />
              {jsonError && <p className="text-[10px] text-rose-400 flex items-center gap-1"><XCircle className="w-3 h-3 shrink-0" /> {jsonError}</p>}
            </TabsContent>
          </Tabs>
        </div>

        <div className="px-6 py-3 border-t border-border/50 bg-muted/10 shrink-0 flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground font-sans">
            {!jsonMode && (
              <span>
                <span className="font-bold text-foreground">{statements.reduce((acc, s) => acc + s.action.length, 0)}</span> actions across{' '}
                <span className="font-bold text-foreground">{statements.length}</span> {statements.length === 1 ? 'statement' : 'statements'}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={resetDialog}>Cancel</Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
              onClick={handleSubmit}
              disabled={!policyName.trim() || submitting || (jsonMode && !!jsonError)}
            >
              <Lock className="w-3.5 h-3.5" />
              {submitting ? 'Creating...' : 'Create Policy'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
