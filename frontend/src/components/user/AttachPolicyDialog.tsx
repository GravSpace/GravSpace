import { useState } from 'react'
import { Shield } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import type { Policy } from './userTypes'

interface Props {
  open: boolean
  targetUser: string
  templates: Policy[]
  onClose: () => void
  onAttachTemplate: (templateName: string) => Promise<void>
  onAttachInline: (policy: any) => Promise<void>
}

export function AttachPolicyDialog({
  open,
  targetUser,
  templates,
  onClose,
  onAttachTemplate,
  onAttachInline,
}: Props) {
  const [attachMode, setAttachMode] = useState<'template' | 'inline'>('template')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [inlinePolicyJson, setInlinePolicyJson] = useState(
    JSON.stringify(
      {
        name: 'ReadOnlyAccess',
        version: '2012-10-17',
        statement: [{ effect: 'Allow', action: ['s3:GetObject', 's3:ListBucket'], resource: ['arn:aws:s3:::*'] }],
      },
      null,
      2,
    ),
  )

  async function handleAttach() {
    if (attachMode === 'template') {
      if (!selectedTemplate) return
      await onAttachTemplate(selectedTemplate)
    } else {
      try {
        const policy = JSON.parse(inlinePolicyJson)
        await onAttachInline(policy)
      } catch (e: any) {
        toast.error(`Invalid JSON: ${e.message}`)
        return
      }
    }
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
            <Shield className="w-5 h-5 text-indigo-600" />
          </div>
          <DialogTitle>Attach Policy</DialogTitle>
          <DialogDescription>
            Attach security policy to <strong>{targetUser}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setAttachMode('template')}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                attachMode === 'template' ? 'bg-background shadow-xs' : 'hover:bg-background/50'
              }`}
            >
              Global Template
            </button>
            <button
              onClick={() => setAttachMode('inline')}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
                attachMode === 'inline' ? 'bg-background shadow-xs' : 'hover:bg-background/50'
              }`}
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
                {templates.map((t) => (
                  <option key={t.name} value={t.name}>{t.name}</option>
                ))}
              </select>
              {selectedTemplate && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Preview</div>
                  <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-auto max-h-32">
                    {JSON.stringify(templates.find((t) => t.name === selectedTemplate), null, 2)}
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
              <textarea
                value={inlinePolicyJson}
                onChange={(e) => setInlinePolicyJson(e.target.value)}
                rows={12}
                className="w-full font-mono text-[11px] bg-slate-950 text-emerald-400 border-0 ring-1 ring-slate-800 focus:ring-primary focus:outline-none rounded-lg p-4 resize-none leading-relaxed"
                spellCheck={false}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Discard</Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleAttach}
              disabled={attachMode === 'template' && !selectedTemplate}
            >
              Sync Permissions
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
