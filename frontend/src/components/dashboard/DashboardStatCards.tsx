import type { LucideIcon } from 'lucide-react'

export interface StatCardItem {
  label: string
  value: string
  sub: string
  icon: LucideIcon
  accent: 'indigo' | 'emerald' | 'amber' | 'violet' | 'teal' | 'rose'
}

interface Props {
  stats: StatCardItem[]
}

const accentMap = {
  indigo: 'bg-indigo-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
  rose: 'bg-rose-500',
}

const iconBgMap = {
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
}

export function DashboardStatCards({ stats }: Props) {
  return (
    <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-card p-4 shadow-xs hover:shadow-md hover:border-primary/30 transition-all duration-300"
        >
          <div className={`absolute top-0 left-0 right-0 h-0.5 ${accentMap[stat.accent]}`} />
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </span>
            <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${iconBgMap[stat.accent]}`}>
              <stat.icon className="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div className="text-xl font-bold tracking-tight">{stat.value}</div>
          <p className="text-[10px] text-muted-foreground mt-0.5 opacity-60">{stat.sub}</p>
        </div>
      ))}
    </div>
  )
}
