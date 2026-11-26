import { useState } from 'react'
import {
  Code,
  Copy,
  Check,
  Terminal,
  Key,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onClose: () => void
  bucketName: string
}

export function ConnectCodeDrawer({ open, onClose, bucketName }: Props) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const s3Endpoint = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:9001`
    : 'http://localhost:9001'

  function copyCode(key: string, code: string) {
    navigator.clipboard.writeText(code)
    setCopiedKey(key)
    toast.success('Code copied to clipboard')
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const nodeJsSnippet = `import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: '${s3Endpoint}',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || 'your-access-key',
    secretAccessKey: process.env.S3_SECRET_KEY || 'your-secret-key',
  },
  forcePathStyle: true, // Required for path-style S3 buckets
});

// Upload a file to bucket '${bucketName}'
await s3.send(new PutObjectCommand({
  Bucket: '${bucketName}',
  Key: 'example.txt',
  Body: 'Hello from GravSpace S3!',
  ContentType: 'text/plain',
}));`;

  const pythonSnippet = `import boto3
import os

s3 = boto3.client(
    's3',
    endpoint_url='${s3Endpoint}',
    aws_access_key_id=os.getenv('S3_ACCESS_KEY', 'your-access-key'),
    aws_secret_access_key=os.getenv('S3_SECRET_KEY', 'your-secret-key'),
    region_name='us-east-1'
)

# Upload object to bucket '${bucketName}'
s3.put_object(
    Bucket='${bucketName}',
    Key='example.txt',
    Body=b'Hello from GravSpace S3!'
)`;

  const goSnippet = `package main

import (
	"context"
	"strings"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

func main() {
	cfg, _ := config.LoadDefaultConfig(context.TODO(),
		config.WithRegion("us-east-1"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider("your-access-key", "your-secret-key", "")),
	)

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String("${s3Endpoint}")
		o.UsePathStyle = true
	})

	client.PutObject(context.TODO(), &s3.PutObjectInput{
		Bucket: aws.String("${bucketName}"),
		Key:    aws.String("example.txt"),
		Body:   strings.NewReader("Hello from GravSpace!"),
	})
}`;

  const cliSnippet = `# 1. Configure AWS CLI profile for GravSpace S3
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"

# 2. List objects in bucket
aws s3 ls s3://${bucketName} --endpoint-url ${s3Endpoint}

# 3. Upload a file
aws s3 cp ./file.txt s3://${bucketName}/file.txt --endpoint-url ${s3Endpoint}

# 4. Direct curl test
curl -i ${s3Endpoint}/${bucketName}`;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-full max-w-[calc(100vw-2rem)] sm:max-w-2xl rounded-2xl border border-border/80 bg-card p-0 overflow-hidden shadow-2xl flex flex-col text-xs max-h-[90vh]">
        <DialogHeader className="px-5 py-3.5 border-b border-border/50 bg-muted/20 flex flex-row items-start gap-3 shrink-0 pr-14">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
            <Code className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold tracking-tight text-foreground truncate">
              Connect SDK to <span className="text-primary font-mono">{bucketName}</span>
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground mt-0.5">
              Copy and paste ready-to-run S3 SDK connection snippets for your backend services.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Quick Endpoint Info Banner */}
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border/60 text-xs">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-primary" />
              <span className="text-muted-foreground">S3 Endpoint:</span>
              <span className="font-mono font-semibold text-foreground">{s3Endpoint}</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-background border border-border/70 text-muted-foreground">
              PathStyle: true
            </span>
          </div>

          {/* Language Tabs */}
          <Tabs defaultValue="nodejs" className="w-full">
            <TabsList className="grid grid-cols-2 sm:grid-cols-4 h-auto gap-1 p-1 bg-muted/50 rounded-xl mb-3">
              <TabsTrigger value="nodejs" className="text-xs">Node.js</TabsTrigger>
              <TabsTrigger value="python" className="text-xs">Python</TabsTrigger>
              <TabsTrigger value="golang" className="text-xs">Golang</TabsTrigger>
              <TabsTrigger value="cli" className="text-xs">AWS CLI</TabsTrigger>
            </TabsList>

            {/* Node.js Tab */}
            <TabsContent value="nodejs" className="space-y-2 mt-0">
              <div className="relative rounded-xl border border-border/70 bg-zinc-950 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-200 overflow-x-auto shadow-inner">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyCode('nodejs', nodeJsSnippet)}
                  className="absolute top-2.5 right-2.5 h-7 px-2 text-xs gap-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  {copiedKey === 'nodejs' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'nodejs' ? 'Copied' : 'Copy'}
                </Button>
                <pre>{nodeJsSnippet}</pre>
              </div>
            </TabsContent>

            {/* Python Tab */}
            <TabsContent value="python" className="space-y-2 mt-0">
              <div className="relative rounded-xl border border-border/70 bg-zinc-950 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-200 overflow-x-auto shadow-inner">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyCode('python', pythonSnippet)}
                  className="absolute top-2.5 right-2.5 h-7 px-2 text-xs gap-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  {copiedKey === 'python' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'python' ? 'Copied' : 'Copy'}
                </Button>
                <pre>{pythonSnippet}</pre>
              </div>
            </TabsContent>

            {/* Golang Tab */}
            <TabsContent value="golang" className="space-y-2 mt-0">
              <div className="relative rounded-xl border border-border/70 bg-zinc-950 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-200 overflow-x-auto shadow-inner">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyCode('golang', goSnippet)}
                  className="absolute top-2.5 right-2.5 h-7 px-2 text-xs gap-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  {copiedKey === 'golang' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'golang' ? 'Copied' : 'Copy'}
                </Button>
                <pre>{goSnippet}</pre>
              </div>
            </TabsContent>

            {/* AWS CLI Tab */}
            <TabsContent value="cli" className="space-y-2 mt-0">
              <div className="relative rounded-xl border border-border/70 bg-zinc-950 p-3.5 font-mono text-[11px] leading-relaxed text-zinc-200 overflow-x-auto shadow-inner">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyCode('cli', cliSnippet)}
                  className="absolute top-2.5 right-2.5 h-7 px-2 text-xs gap-1 text-zinc-400 hover:text-white hover:bg-zinc-800"
                >
                  {copiedKey === 'cli' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedKey === 'cli' ? 'Copied' : 'Copy'}
                </Button>
                <pre>{cliSnippet}</pre>
              </div>
            </TabsContent>
          </Tabs>

          {/* Security Note */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
            <Key className="w-4 h-4 shrink-0" />
            <span>Generate and manage secure S3 Access Keys in the <strong>Access Control (Users)</strong> menu.</span>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border/50 bg-muted/20 flex items-center justify-end shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
