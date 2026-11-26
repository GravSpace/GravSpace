import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect, useCallback } from 'react'
import { Shield, RefreshCw, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { useAuth } from '../../hooks/useAuth'
import type { Policy } from '../../components/policy/policyTypes'
import { PolicyEditorDialog } from '../../components/policy/PolicyEditorDialog'
import { PolicyViewDialog } from '../../components/policy/PolicyViewDialog'
import { PolicyCard } from '../../components/policy/PolicyCard'

export const Route = createFileRoute('/admin/policies')({
  component: PoliciesPage,
  head: () => ({ meta: [{ title: 'Security Policies | GravSpace' }] }),
})

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

function PoliciesPage() {
  const { authFetch } = useAuth()
  const [policies, setPolicies] = useState<Policy[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [buckets, setBuckets] = useState<string[]>([])
  const [viewPolicy, setViewPolicy] = useState<Policy | null>(null)
  const [showCreate, setShowCreate] = useState(false)

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

  const fetchBuckets = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/admin/buckets`)
      if (res.ok) setBuckets((await res.json()) || [])
    } catch {}
  }, [authFetch])

  useEffect(() => {
    fetchPolicies()
    fetchBuckets()
  }, [fetchPolicies, fetchBuckets])

  const filtered = policies.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()))

  async function handleCreatePolicy(payload: Policy) {
    try {
      const res = await authFetch(`${API_BASE}/admin/policies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          policy: {
            Version: payload.version || '2012-10-17',
            Statement: payload.statement || [],
          },
        }),
      })
      if (res.ok) {
        toast.success(`Policy "${payload.name}" created.`)
        fetchPolicies()
      } else {
        const err = await res.text()
        toast.error(`Failed: ${err}`)
      }
    } catch {
      toast.error('Failed to create policy.')
    }
  }

  async function handleDeletePolicy(name: string) {
    toast.promise(
      async () => {
        const res = await authFetch(`${API_BASE}/admin/policies/${name}`, { method: 'DELETE' })
        if (!res.ok) throw new Error('Failed')
        fetchPolicies()
      },
      { loading: `Removing "${name}"...`, success: `Policy "${name}" deleted.`, error: 'Failed to delete policy.' },
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50 dark:bg-slate-950/50">
      <header className="min-h-14 sm:min-h-16 h-auto py-2.5 sm:py-0 border-b bg-card/50 backdrop-blur-md px-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-10">
        <div>
          <h1 className="text-base sm:text-lg font-semibold tracking-tight">Security Policies</h1>
          <p className="hidden sm:block text-xs text-muted-foreground">Reusable IAM permission templates for access control.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto" suppressHydrationWarning>
          <div className="relative flex-1 min-w-[140px] sm:flex-none" suppressHydrationWarning>
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter policies..."
              autoComplete="off"
              data-protonpass-ignore="true"
              data-1p-ignore="true"
              className="h-8 w-full sm:w-44 pl-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8" onClick={fetchPolicies} disabled={loading} aria-label="Sync policies">
            <RefreshCw className={`w-3.5 h-3.5 sm:mr-2 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </Button>
          <Button size="sm" className="h-8" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> New Policy
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-3.5 sm:p-6 space-y-2.5">
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

        {filtered.map((policy) => (
          <PolicyCard
            key={policy.name}
            policy={policy}
            onView={(p) => setViewPolicy(p)}
            onDelete={handleDeletePolicy}
          />
        ))}
      </main>

      <PolicyEditorDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        buckets={buckets}
        onCreated={handleCreatePolicy}
      />

      <PolicyViewDialog policy={viewPolicy} onClose={() => setViewPolicy(null)} />
    </div>
  )
}
