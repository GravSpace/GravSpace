import { useState, useMemo } from 'react'
import { TrendingUp, BarChart3 } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Badge } from '../ui/badge'
import { formatSize, CHART_COLORS } from './dashboardTypes'

export interface StorageRecord {
  Bucket?: string
  bucket?: string
  Size?: number
  size?: number
  Timestamp?: string
  timestamp?: string
}

export function parseDate(ts: string): string {
  if (!ts) return ''
  const part = ts.includes('T') ? ts.split('T')[0] : ts.split(' ')[0]
  return part.trim()
}

export function formatDayLabel(dayStr: string): string {
  const parts = dayStr.split('-')
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const mIdx = parseInt(parts[1], 10) - 1
    const day = parseInt(parts[2], 10)
    if (mIdx >= 0 && mIdx < 12) {
      return `${months[mIdx]} ${day}`
    }
    return `${parts[1]}/${parts[2]}`
  }
  return dayStr
}

export function processStorageHistory(history: StorageRecord[]) {
  if (!history || history.length === 0) {
    return { chartData: [], allBuckets: [], latestTotal: 0, delta: 0 }
  }

  const sorted = [...history].sort((a, b) => {
    const tA = a.Timestamp || a.timestamp || ''
    const tB = b.Timestamp || b.timestamp || ''
    return tA.localeCompare(tB)
  })

  // Group by day, keeping latest size for each bucket on that day
  const dayMap = new Map<string, Map<string, number>>()
  const bucketSet = new Set<string>()

  for (const rec of sorted) {
    const day = parseDate(rec.Timestamp || rec.timestamp || '')
    const b = rec.Bucket || rec.bucket || ''
    const s = Number(rec.Size ?? rec.size ?? 0)
    if (!day || !b) continue
    bucketSet.add(b)
    if (!dayMap.has(day)) {
      dayMap.set(day, new Map())
    }
    dayMap.get(day)!.set(b, s)
  }

  const days = Array.from(dayMap.keys()).sort()
  const allBuckets = Array.from(bucketSet)

  const chartData = days.map((day) => {
    const bMap = dayMap.get(day)!
    let total = 0
    const row: Record<string, any> = {
      rawDate: day,
      day: formatDayLabel(day),
    }
    for (const [b, size] of bMap.entries()) {
      row[b] = size
      total += size
    }
    row.Total = total
    return row
  })

  const firstTotal = chartData[0]?.Total || 0
  const latestTotal = chartData[chartData.length - 1]?.Total || 0
  const delta = latestTotal - firstTotal

  return { chartData, allBuckets, latestTotal, delta }
}

function StorageTooltip({ active, payload, label, selectedBucket }: any) {
  if (!active || !payload || !payload.length) return null
  const data = payload[0]?.payload
  if (!data) return null

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-popover/95 px-3 py-2 shadow-md backdrop-blur-xs text-popover-foreground text-xs min-w-[150px]">
      <div className="text-[10px] text-muted-foreground font-medium mb-1 border-b border-border/40 pb-1">
        {data.rawDate} ({label})
      </div>
      <div className="flex items-center justify-between gap-3 font-mono text-xs">
        <span className="font-semibold text-foreground">
          {selectedBucket === 'all' ? 'Total Storage' : selectedBucket}:
        </span>
        <span className="font-bold text-primary">
          {formatSize(selectedBucket === 'all' ? data.Total : data[selectedBucket] || 0)}
        </span>
      </div>
    </div>
  )
}

export function StorageGrowthChart({ storageHistory }: { storageHistory: StorageRecord[] }) {
  const [selectedBucket, setSelectedBucket] = useState<string>('all')

  const { chartData, allBuckets, latestTotal, delta } = useMemo(
    () => processStorageHistory(storageHistory),
    [storageHistory],
  )

  const activeColor = selectedBucket === 'all' ? '#6366f1' : CHART_COLORS[allBuckets.indexOf(selectedBucket) % CHART_COLORS.length] || '#10b981'

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-bold tracking-tight">Storage Growth</span>
          <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 font-mono text-muted-foreground">
            30d
          </Badge>
          {latestTotal > 0 && (
            <span className="text-xs font-bold font-mono text-foreground ml-1">
              {formatSize(latestTotal)}
            </span>
          )}
          {delta !== 0 && (
            <Badge
              variant="outline"
              className={`text-[10px] h-4.5 px-1.5 font-mono ${
                delta > 0
                  ? 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                  : 'border-rose-500/30 text-rose-600 dark:text-rose-400 bg-rose-500/5'
              }`}
            >
              {delta > 0 ? `+${formatSize(delta)}` : `-${formatSize(Math.abs(delta))}`}
            </Badge>
          )}
        </div>

        {allBuckets.length > 0 && (
          <select
            value={selectedBucket}
            onChange={(e) => setSelectedBucket(e.target.value)}
            className="h-7 text-[11px] bg-background border border-slate-200 dark:border-slate-800 rounded-md px-2 py-0 text-foreground font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="all">All Buckets (Total)</option>
            {allBuckets.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="min-h-[200px] px-3 pt-3 pb-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="storageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={activeColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="opacity-5" />
              <XAxis dataKey="day" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis
                tick={{ fontSize: 9 }}
                tickFormatter={(v) => formatSize(v)}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip content={<StorageTooltip selectedBucket={selectedBucket} />} />
              <Area
                type="monotone"
                dataKey={selectedBucket === 'all' ? 'Total' : selectedBucket}
                stroke={activeColor}
                strokeWidth={2}
                fill="url(#storageGradient)"
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 opacity-20 animate-pulse">
            <BarChart3 className="w-10 h-10" />
            <span className="text-[9px] italic mt-1">Loading storage history...</span>
          </div>
        )}
      </div>
    </div>
  )
}
