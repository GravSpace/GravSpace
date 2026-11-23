import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { Terminal, ShieldCheck, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { toast } from 'sonner'
import { useAuth } from '../../hooks/useAuth'
import {
  createS3Client,
  executeS3Command,
  generateCodeSnippet,
  type S3Credentials,
  type S3ExecutionResult,
} from '../../lib/s3Client'
import { S3CredentialSelector, type IAMUser } from '../../components/explorer/S3CredentialSelector'
import { S3ActionForm } from '../../components/explorer/S3ActionForm'
import { S3ResponseViewer } from '../../components/explorer/S3ResponseViewer'

export const Route = createFileRoute('/admin/explorer')({
  component: S3ExplorerPage,
  head: () => ({ meta: [{ title: 'S3 API Explorer | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

export function S3ExplorerPage() {
  const { authFetch } = useAuth()
  const [users, setUsers] = useState<Record<string, IAMUser>>({})
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [availableBuckets, setAvailableBuckets] = useState<string[]>([])
  const [networkInfo, setNetworkInfo] = useState<any>(null)

  const [endpoint, setEndpoint] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.hostname}:9001`
    }
    return 'http://localhost:9001'
  })

  const [credentials, setCredentials] = useState<S3Credentials>({
    accessKeyId: '',
    secretAccessKey: '',
  })

  const [action, setAction] = useState<string>('ListBuckets')
  const [params, setParams] = useState<Record<string, any>>({
    Bucket: '',
    Key: 'test.txt',
    Body: 'Hello from S3 SDK!',
  })

  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<S3ExecutionResult | null>(null)
  const [suiteRunning, setSuiteRunning] = useState(false)
  const [suiteResults, setSuiteResults] = useState<Array<{ name: string; success: boolean; status?: number; latencyMs: number }>>([])

  const fetchUsersAndBuckets = useCallback(async () => {
    setLoadingUsers(true)
    try {
      const [uRes, bRes] = await Promise.all([
        authFetch(`${API_BASE}/admin/users`),
        authFetch(`${API_BASE}/admin/buckets`),
      ])
      if (uRes.ok) {
        const uData = await uRes.json()
        setUsers(uData || {})
      }
      if (bRes.ok) {
        const bData = await bRes.json()
        const bNames = (bData || []).map((b: any) => b.name || b.Name).filter(Boolean)
        setAvailableBuckets(bNames)
        if (bNames.length > 0 && !params.Bucket) {
          setParams((prev) => ({ ...prev, Bucket: bNames[0] }))
        }
      }
    } catch (err) {
      console.error('Failed to load IAM users and buckets', err)
    } finally {
      setLoadingUsers(false)
    }
  }, [authFetch, params.Bucket])

  useEffect(() => {
    fetchUsersAndBuckets()
    authFetch(`${API_BASE}/admin/system/network`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setNetworkInfo(data)
      })
      .catch(() => {})
  }, [fetchUsersAndBuckets, authFetch])

  const handleExecute = async () => {
    if (!credentials.accessKeyId || !credentials.secretAccessKey) {
      toast.error('Please select or enter an Access Key and Secret Key')
      return
    }

    setExecuting(true)
    try {
      const client = createS3Client(endpoint, credentials)
      const res = await executeS3Command(client, action, params)
      setResult(res)
      if (res.success) {
        toast.success(`${action} succeeded (${res.latencyMs}ms)`)
      } else {
        toast.error(`${action} failed: ${res.error}`)
      }
    } finally {
      setExecuting(false)
    }
  }

  // Quick Ping / Test Connection
  const handleTestConnection = async () => {
    if (!credentials.accessKeyId) {
      toast.error('Select an IAM user first')
      return
    }
    setExecuting(true)
    try {
      const client = createS3Client(endpoint, credentials)
      const res = await executeS3Command(client, 'ListBuckets', {})
      if (res.success) {
        toast.success(`Connected to S3 (${res.latencyMs}ms)`)
      } else {
        toast.error(`Connection failed: ${res.error}`)
      }
      setResult(res)
    } finally {
      setExecuting(false)
    }
  }

  // Run full test suite matrix
  const handleRunSuite = async () => {
    if (!credentials.accessKeyId) {
      toast.error('Select credentials first')
      return
    }
    setSuiteRunning(true)
    setSuiteResults([])
    const suiteBucket = `sdk-test-${Date.now().toString().slice(-4)}`
    const client = createS3Client(endpoint, credentials)

    const tests = [
      { name: '1. ListBuckets', act: 'ListBuckets', p: {} },
      { name: '2. CreateBucket', act: 'CreateBucket', p: { Bucket: suiteBucket } },
      { name: '3. PutObject', act: 'PutObject', p: { Bucket: suiteBucket, Key: 'suite.txt', Body: 'SDK Test Payload' } },
      { name: '4. HeadObject', act: 'HeadObject', p: { Bucket: suiteBucket, Key: 'suite.txt' } },
      { name: '5. GetObject', act: 'GetObject', p: { Bucket: suiteBucket, Key: 'suite.txt' } },
      { name: '6. DeleteObject', act: 'DeleteObject', p: { Bucket: suiteBucket, Key: 'suite.txt' } },
      { name: '7. DeleteBucket', act: 'DeleteBucket', p: { Bucket: suiteBucket } },
    ]

    const runs: Array<{ name: string; success: boolean; status?: number; latencyMs: number }> = []
    for (const t of tests) {
      const res = await executeS3Command(client, t.act, t.p)
      runs.push({ name: t.name, success: res.success, status: res.status, latencyMs: res.latencyMs })
      setSuiteResults([...runs])
    }
    setSuiteRunning(false)
    toast.success('SDK Test Suite completed')
  }

  const codeSnippets = generateCodeSnippet(action, params, credentials, endpoint)

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="h-16 border-b bg-card/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Terminal className="w-5 h-5 text-primary" />
            S3 API Explorer & SDK Tester
          </h1>
          <p className="text-xs text-muted-foreground">
            Execute official AWS S3 SDK commands directly using IAM Engine credentials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRunSuite}
            disabled={suiteRunning || executing}
            className="h-8 text-xs gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${suiteRunning ? 'animate-spin' : ''}`} />
            {suiteRunning ? 'Running Suite...' : 'Run S3 Test Suite'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchUsersAndBuckets}
            disabled={loadingUsers}
            className="h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingUsers ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </header>

      <main suppressHydrationWarning className="flex-1 overflow-auto p-5 space-y-4">
        {/* Credentials Selector */}
        <S3CredentialSelector
          users={users}
          loadingUsers={loadingUsers}
          onRefreshUsers={fetchUsersAndBuckets}
          credentials={credentials}
          onChangeCredentials={setCredentials}
          endpoint={endpoint}
          onChangeEndpoint={setEndpoint}
          onTestConnection={handleTestConnection}
          testing={executing}
          networkInfo={networkInfo}
        />

        {/* Test Suite Progress Bar (if ran) */}
        {suiteResults.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3 shadow-xs">
            <div className="text-xs font-semibold mb-2 flex items-center justify-between">
              <span>S3 SDK Test Suite Results ({suiteResults.filter((r) => r.success).length}/{suiteResults.length} passed)</span>
              {suiteRunning && <span className="text-[10px] text-muted-foreground animate-pulse">Running step...</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {suiteResults.map((r) => (
                <div
                  key={r.name}
                  className={`p-2 rounded-lg border text-[11px] font-mono flex flex-col justify-between ${
                    r.success
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
                  }`}
                >
                  <span className="font-semibold truncate">{r.name}</span>
                  <div className="flex items-center justify-between text-[9px] mt-1 opacity-80">
                    <span>{r.status || (r.success ? 200 : 403)}</span>
                    <span>{r.latencyMs}ms</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Form & Response Grid */}
        <div className="grid gap-4 lg:grid-cols-12 items-start">
          <div className="lg:col-span-6">
            <S3ActionForm
              action={action}
              onChangeAction={setAction}
              params={params}
              onChangeParams={setParams}
              onExecute={handleExecute}
              executing={executing}
              availableBuckets={availableBuckets}
            />
          </div>

          <div className="lg:col-span-6">
            <S3ResponseViewer result={result} codeSnippets={codeSnippets} />
          </div>
        </div>
      </main>
    </div>
  )
}
