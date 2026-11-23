import { useState } from 'react'
import { Check, Copy, Code, FileJson, Clock, CheckCircle2, AlertTriangle, Layers } from 'lucide-react'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { toast } from 'sonner'
import type { S3ExecutionResult } from '../../lib/s3Client'

interface Props {
  result: S3ExecutionResult | null
  codeSnippets: { ts: string; cli: string; python: string } | null
}

export function S3ResponseViewer({ result, codeSnippets }: Props) {
  const [activeTab, setActiveTab] = useState<'response' | 'code' | 'raw'>('response')
  const [codeLang, setCodeLang] = useState<'ts' | 'python' | 'cli'>('ts')
  const [copied, setCopied] = useState(false)

  if (!result) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-12 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[260px]">
        <Layers className="w-8 h-8 opacity-25 mb-2" />
        <p className="text-xs font-medium">No command executed yet</p>
        <p className="text-[11px] opacity-60 mt-0.5">Select an IAM user and action, then click Run</p>
      </div>
    )
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const currentCode = codeSnippets ? codeSnippets[codeLang] : ''

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card overflow-hidden shadow-xs flex flex-col">
      {/* Result Header */}
      <div className="px-4 py-2.5 border-b border-border/50 flex flex-wrap items-center justify-between gap-2 bg-muted/20">
        <div className="flex items-center gap-2">
          {result.success ? (
            <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-xs font-bold gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {result.status || 200} OK
            </Badge>
          ) : (
            <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 text-xs font-bold gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {result.status || 400} Failed
            </Badge>
          )}

          <span className="text-xs font-mono font-semibold text-foreground">{result.command}</span>

          <Badge variant="outline" className="text-[10px] font-mono gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            {result.latencyMs} ms
          </Badge>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 bg-background border border-border rounded-lg p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('response')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'response' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileJson className="w-3 h-3 inline mr-1" />
            Response
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('code')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              activeTab === 'code' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Code className="w-3 h-3 inline mr-1" />
            SDK Code
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 flex-1 overflow-auto max-h-[420px] font-mono text-xs">
        {activeTab === 'response' && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-0 right-0 h-7 text-[10px] gap-1 z-10"
              onClick={() => handleCopy(JSON.stringify(result.data || result.error, null, 2))}
            >
              {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              Copy JSON
            </Button>
            {result.error && (
              <div className="p-3 mb-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                <strong>Error: </strong> {result.error}
              </div>
            )}
            <pre className="text-[11px] leading-relaxed text-foreground bg-muted/40 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(result.data ?? result.rawError ?? result.error, null, 2)}
            </pre>
          </div>
        )}

        {activeTab === 'code' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-[10px]">
                {(['ts', 'python', 'cli'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setCodeLang(lang)}
                    className={`px-2 py-0.5 rounded font-semibold uppercase ${
                      codeLang === lang ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                    }`}
                  >
                    {lang === 'ts' ? 'TypeScript (AWS v3)' : lang === 'python' ? 'Python (Boto3)' : 'AWS CLI'}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={() => handleCopy(currentCode)}
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                Copy Code
              </Button>
            </div>
            <pre className="text-[11px] leading-relaxed text-foreground bg-muted/50 p-3 rounded-lg overflow-x-auto">
              {currentCode}
            </pre>
            <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-[10px] text-muted-foreground font-sans leading-relaxed">
              <strong className="text-foreground font-semibold">Tip Koneksi Jaringan:</strong> Gunakan endpoint IP lokal (misal <code className="font-mono text-primary">http://10.10.10.14:9001</code>) untuk script/worker yang berjalan di server 1 rak/LAN. Untuk client browser di luar VLAN rak, pilih preset <code className="font-mono text-primary">Web Proxy (/s3)</code>.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
