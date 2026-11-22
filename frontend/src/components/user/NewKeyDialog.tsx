import { useState } from 'react'
import { Key, Copy, Check, Download, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  username: string
  accessKeyId: string
  secretAccessKey: string
}

export function NewKeyDialog({
  open,
  onClose,
  username,
  accessKeyId,
  secretAccessKey,
}: Props) {
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedSecret, setCopiedSecret] = useState(false)

  const copyText = (text: string, label: string, isSecret = false) => {
    navigator.clipboard.writeText(text)
    if (isSecret) setCopiedSecret(true)
    else setCopiedKey(true)
    toast.success(`${label} copied to clipboard`)
    setTimeout(() => {
      setCopiedKey(false)
      setCopiedSecret(false)
    }, 2000)
  }

  const downloadEnvFile = () => {
    const envContent = `# GravSpace S3 Credentials for ${username}\nAWS_ACCESS_KEY_ID=${accessKeyId}\nAWS_SECRET_ACCESS_KEY=${secretAccessKey}\nAWS_REGION=us-east-1\nS3_ENDPOINT=http://localhost:9001\n`
    const blob = new Blob([envContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${username}-s3-credentials.env`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Downloaded ${username}-s3-credentials.env`)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md p-6">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary mb-1">
            <Key className="w-5 h-5 text-indigo-500" />
            <DialogTitle className="text-base font-bold">New Access Key Created</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            Access keys for principal <span className="font-semibold text-foreground">@{username}</span> have been generated.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 flex gap-2.5 items-start text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="leading-tight text-[11px]">
            Please copy or download these credentials now. You will need both the Access Key and Secret Key to authenticate via S3 SDK or CLI.
          </span>
        </div>

        <div className="space-y-3 my-1">
          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Access Key ID</span>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono font-bold truncate select-all">{accessKeyId}</code>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 cursor-pointer shrink-0"
                onClick={() => copyText(accessKeyId, 'Access Key ID')}
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Secret Access Key</span>
            <div className="flex items-center justify-between gap-2">
              <code className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 truncate select-all">
                {secretAccessKey}
              </code>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 cursor-pointer shrink-0"
                onClick={() => copyText(secretAccessKey, 'Secret Access Key', true)}
              >
                {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                Copy
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer text-xs" onClick={downloadEnvFile}>
            <Download className="w-3.5 h-3.5" /> Download .env
          </Button>
          <Button size="sm" className="cursor-pointer text-xs" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
