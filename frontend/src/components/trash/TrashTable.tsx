import { ChevronDown, ChevronUp, FileText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { type TrashItem, formatSize, formatDate } from './trashTypes'

interface Props {
  items: TrashItem[]
  selectedIDs: Set<number>
  allSelected: boolean
  sortKey: 'key' | 'bucket' | 'deleted_at' | 'size'
  sortAsc: boolean
  onToggleAll: () => void
  onToggleItem: (id: number) => void
  onToggleSort: (key: 'key' | 'bucket' | 'deleted_at' | 'size') => void
  onRestore: (item: TrashItem) => void
  onDelete: (item: TrashItem) => void
}

export function TrashTable({
  items,
  selectedIDs,
  allSelected,
  sortKey,
  sortAsc,
  onToggleAll,
  onToggleItem,
  onToggleSort,
  onRestore,
  onDelete,
}: Props) {
  function SortIcon({ col }: { col: 'key' | 'bucket' | 'deleted_at' | 'size' }) {
    if (sortKey !== col) return <ChevronDown className="w-3 h-3 opacity-20" />
    return sortAsc ? <ChevronUp className="w-3 h-3 text-primary" /> : <ChevronDown className="w-3 h-3 text-primary" />
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-b border-slate-200 dark:border-slate-800">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-primary"
                />
              </th>
              <th
                className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                onClick={() => onToggleSort('key')}
              >
                <span className="flex items-center gap-1">Object Key <SortIcon col="key" /></span>
              </th>
              <th
                className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                onClick={() => onToggleSort('bucket')}
              >
                <span className="flex items-center gap-1">Bucket <SortIcon col="bucket" /></span>
              </th>
              <th
                className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                onClick={() => onToggleSort('deleted_at')}
              >
                <span className="flex items-center gap-1">Deleted At <SortIcon col="deleted_at" /></span>
              </th>
              <th
                className="px-4 py-3 text-left font-bold uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none"
                onClick={() => onToggleSort('size')}
              >
                <span className="flex items-center gap-1">Size <SortIcon col="size" /></span>
              </th>
              <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {items.map((item) => {
              const checked = selectedIDs.has(item.id)
              return (
                <tr
                  key={item.id}
                  className={`group hover:bg-muted/30 transition-colors ${checked ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleItem(item.id)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-600 cursor-pointer accent-primary"
                    />
                  </td>

                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors shrink-0">
                        <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-primary transition-colors" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate max-w-[220px]" title={item.key}>{item.key}</p>
                        {item.version_id && (
                          <p className="text-[9px] font-mono text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity mt-0.5">
                            v{item.version_id}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-2.5">
                    <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wide px-2 py-0 bg-primary/5 text-primary border-primary/20">
                      {item.bucket}
                    </Badge>
                  </td>

                  <td className="px-4 py-2.5 text-[10px] text-muted-foreground">
                    {formatDate(item.deleted_at)}
                  </td>

                  <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">
                    {formatSize(item.size)}
                  </td>

                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg"
                        title="Restore"
                        onClick={() => onRestore(item)}
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg"
                        title="Delete Permanently"
                        onClick={() => onDelete(item)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
