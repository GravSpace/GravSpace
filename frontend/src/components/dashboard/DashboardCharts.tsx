import { PieChart, BarChart3, Activity } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { DonutBreakdownCard } from './DonutBreakdownCard'
import { StorageGrowthChart } from './StorageGrowthChart'

interface Props {
  storageByBucket: any[]
  contentTypePie: any[]
  trendsChartData: any[]
  storageHistory: any[]
}

export function DashboardCharts({
  storageByBucket,
  contentTypePie,
  trendsChartData,
  storageHistory,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <DonutBreakdownCard
            title="By Bucket"
            icon={PieChart}
            data={storageByBucket}
            unitLabel="buckets"
          />
          <DonutBreakdownCard
            title="By Type"
            icon={BarChart3}
            data={contentTypePie}
            unitLabel="types"
          />
        </div>

        {/* Request Trends */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col">
          <div className="px-4 pt-3 pb-1.5">
            <div className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-bold tracking-tight">Request Trends (30d)</span>
            </div>
          </div>
          <div className="flex-1 min-h-[200px] px-3 pb-4">
            {trendsChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trendsChartData} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="uploads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="downloads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="deletions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
                  <XAxis dataKey="day" tick={{ fontSize: 8 }} tickCount={10} />
                  <YAxis tick={{ fontSize: 8 }} />
                  <Tooltip />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 9 }} />
                  <Area type="monotone" dataKey="Uploads" stroke="#10b981" fill="url(#uploads)" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="Downloads" stroke="#3b82f6" fill="url(#downloads)" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="Deletions" stroke="#ef4444" fill="url(#deletions)" strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground/50">
                <Activity className="w-8 h-8 opacity-40 mb-1.5" />
                <span className="text-[11px] font-medium">No request telemetry recorded</span>
                <span className="text-[9px] opacity-60">S3 operations will populate trend metrics</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modern Storage Growth Chart */}
      <StorageGrowthChart storageHistory={storageHistory} />
    </div>
  )
}
