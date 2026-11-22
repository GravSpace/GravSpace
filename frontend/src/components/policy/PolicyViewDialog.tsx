import { Copy, Eye } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import type { Policy } from './policyTypes'

interface Props {
  policy: Policy | null
  onClose: () => void
}

export function PolicyViewDialog({ policy, onClose }: Props) {
  if (!policy) return null

  const jsonStr = JSON.stringify(policy, null, 2)

  return (
    <Dialog open={!!policy} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="h-10 w-10 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3">
            <Eye className="w-5 h-5 text-indigo-600" />
          </div>
          <DialogTitle className="font-mono">{policy.name}</DialogTitle>
          <DialogDescription>Full policy document representation.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg overflow-hidden border border-slate-800">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">JSON Document</span>
              <button
                className="text-[9px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(jsonStr)
                  toast.success('Copied!')
                }}
              >
                <Copy className="w-2.5 h-2.5" /> Copy
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono text-emerald-400 bg-slate-950 overflow-x-auto max-h-96 leading-relaxed">
              {jsonStr}
            </pre>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
