import type { ComponentType } from 'react'
import { PieChart as RPieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { Badge } from '../ui/badge'
import { formatSize } from './dashboardTypes'

export interface DonutItem {
  name: string
  value: number
  fill: string
  pct?: number
}

export function prepareDonutData(
  data: Array<{ name: string; value: number; fill: string }>,
  maxItems = 4,
) {
  const validData = (data || []).filter((d) => d && typeof d.value === 'number')
  const total = validData.reduce((acc, cur) => acc + (cur.value || 0), 0)

  const sorted = [...validData].sort((a, b) => b.value - a.value)
  const top = sorted.slice(0, maxItems)
  const remainder = sorted.slice(maxItems)
  const remainderSum = remainder.reduce((acc, cur) => acc + cur.value, 0)

  const displayList: DonutItem[] = top.map((d) => ({
    ...d,
    pct: total > 0 ? Math.round((d.value / total) * 100) : 0,
  }))

  if (remainder.length > 0) {
    displayList.push({
      name: `Others (${remainder.length})`,
      value: remainderSum,
      fill: '#94a3b8',
      pct: total > 0 ? Math.round((remainderSum / total) * 100) : 0,
    })
  }

  const pieData =
    total > 0
      ? displayList
      : [{ name: 'Empty', value: 1, fill: 'currentColor' }]

  return { total, validData, displayList, pieData }
}

function DonutTooltip({ active, payload, total }: any) {
  if (!active || !payload || !payload.length) return null
  const item = payload[0]
  const val = Number(item.value || 0)
  const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0'
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-popover/95 px-2.5 py-1.5 shadow-md backdrop-blur-xs text-popover-foreground text-xs min-w-[120px]">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: item.payload?.fill || item.color }}
        />
        <span className="font-semibold truncate max-w-[130px]">{item.name}</span>
      </div>
      <div className="flex items-center justify-between text-muted-foreground gap-3 font-mono text-[11px]">
        <span>{formatSize(val)}</span>
        <span className="font-semibold text-foreground">{pct}%</span>
      </div>
    </div>
  )
}

export interface DonutBreakdownCardProps {
  title: string
  icon: ComponentType<{ className?: string }>
  data: Array<{ name: string; value: number; fill: string }>
  unitLabel?: string
  maxItems?: number
}

export function DonutBreakdownCard({
  title,
  icon: Icon,
  data,
  unitLabel = 'items',
  maxItems = 4,
}: DonutBreakdownCardProps) {
  const { total, validData, displayList, pieData } = prepareDonutData(data, maxItems)

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-card shadow-xs overflow-hidden flex flex-col justify-between p-3.5">
      <div>
        <div className="flex items-center justify-between gap-2 pb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-xs font-bold tracking-tight truncate">{title}</span>
          </div>
          {validData.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 font-mono text-muted-foreground shrink-0">
              {validData.length} {unitLabel}
            </Badge>
          )}
        </div>

        {validData.length > 0 ? (
          <div className="relative w-full h-[120px] flex items-center justify-center my-0.5">
            <ResponsiveContainer width="100%" height={120}>
              <RPieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={36}
                  outerRadius={50}
                  paddingAngle={total > 0 ? 3 : 0}
                  cornerRadius={total > 0 ? 3 : 0}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {pieData.map((entry, i) => (
                    <Cell
                      key={`cell-${entry.name || i}`}
                      fill={entry.fill}
                      stroke="transparent"
                      className={total === 0 ? 'opacity-10 text-muted-foreground' : undefined}
                    />
                  ))}
                </Pie>
                {total > 0 && <Tooltip content={<DonutTooltip total={total} />} />}
              </RPieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[8px] uppercase tracking-wider text-muted-foreground font-semibold">Total</span>
              <span className="text-[11px] font-bold font-mono text-foreground leading-tight">{formatSize(total)}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[120px] opacity-20 animate-pulse">
            <Icon className="w-8 h-8" />
            <span className="text-[9px] italic mt-1">Loading...</span>
          </div>
        )}
      </div>

      {validData.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-slate-100 dark:border-slate-800/80 pt-2.5">
          {displayList.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                <span className="truncate max-w-[85px] sm:max-w-[105px] text-foreground font-medium text-[11px]" title={item.name}>
                  {item.name}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
                <span className="text-muted-foreground text-[10px]">{formatSize(item.value)}</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-muted-foreground font-medium min-w-[28px] text-right">
                  {item.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
