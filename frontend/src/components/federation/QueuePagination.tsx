import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from '@ui-sdk/react/pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@ui-sdk/react/select'
import { Check, ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'

const PAGE_SIZES = ['10', '25', '50', '100']

interface QueuePaginationProps {
  page: number
  limit: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onLimitChange: (limit: number) => void
}

export function QueuePagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  onLimitChange,
}: QueuePaginationProps) {
  const safeTotalPages = Math.max(1, totalPages)
  const startIdx = total === 0 ? 0 : (page - 1) * limit + 1
  const endIdx = Math.min(page * limit, total)

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 px-3.5 py-2 border-t border-border/60 bg-muted/15 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-2.5">
        <span className="tabular-nums">
          Showing{' '}
          <span className="font-semibold text-foreground">
            {startIdx}–{endIdx}
          </span>{' '}
          of <span className="font-semibold text-foreground">{total}</span> tasks
        </span>

        <span className="h-3.5 w-px bg-border/70" aria-hidden="true" />

        <div className="flex items-center gap-1.5">
          <Select
            items={PAGE_SIZES}
            value={String(limit)}
            onValueChange={(next) => {
              if (next) onLimitChange(Number(next))
            }}
          >
            <SelectLabel className="text-[11px] font-medium text-muted-foreground select-none">
              Rows
            </SelectLabel>
            <SelectTrigger className="min-w-0 w-[4.25rem] h-7 rounded-md border border-border/80 bg-background/90 px-2 text-[11px] font-mono font-medium tabular-nums text-foreground hover:bg-muted/70 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-open:border-ring transition-colors">
              <SelectValue />
              <ChevronDown
                className="size-3 text-muted-foreground shrink-0 transition-transform duration-150 [[data-open]_&]:rotate-180"
                aria-hidden="true"
              />
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              sideOffset={6}
              className="min-w-0 w-[5.5rem] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
            >
              {PAGE_SIZES.map((size) => (
                <SelectItem
                  key={size}
                  value={size}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] font-mono tabular-nums cursor-pointer outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-selected:font-semibold"
                >
                  {size}
                  <SelectItemIndicator>
                    <Check className="size-3 text-primary" aria-hidden="true" />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Pagination
        aria-label="Outbox pagination"
        pageCount={safeTotalPages}
        page={page}
        siblings={1}
        boundaries={1}
        onPageChange={(next) => {
          if (next !== page) onPageChange(next)
        }}
      >
        <PaginationList className="flex items-center gap-1 list-none m-0 p-0">
          {({ items }) => (
            <>
              <PaginationItem>
                <PaginationPrevious
                  aria-label="Previous page"
                  className="min-w-0 h-7 w-7 p-0 rounded-md border border-border/70 bg-background/90 text-muted-foreground hover:text-foreground hover:bg-muted/70 data-disabled:opacity-35 data-disabled:hover:bg-background/90 transition-colors"
                >
                  <ChevronLeft className="size-3.5" aria-hidden="true" />
                </PaginationPrevious>
              </PaginationItem>

              {items.map((item) => (
                <PaginationItem key={item}>
                  {typeof item === 'number' ? (
                    <PaginationLink
                      page={item}
                      className="min-w-7 h-7 px-2 rounded-md border border-transparent bg-transparent text-[11px] font-mono tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted/70 hover:border-border/50 data-current:border-border/80 data-current:bg-foreground data-current:text-background data-current:font-semibold data-current:shadow-2xs transition-colors"
                    />
                  ) : (
                    <PaginationEllipsis className="h-7 w-6 inline-flex items-center justify-center text-muted-foreground/60">
                      <MoreHorizontal className="size-3.5" aria-hidden="true" />
                    </PaginationEllipsis>
                  )}
                </PaginationItem>
              ))}

              <PaginationItem>
                <PaginationNext
                  aria-label="Next page"
                  className="min-w-0 h-7 w-7 p-0 rounded-md border border-border/70 bg-background/90 text-muted-foreground hover:text-foreground hover:bg-muted/70 data-disabled:opacity-35 data-disabled:hover:bg-background/90 transition-colors"
                >
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </PaginationNext>
              </PaginationItem>
            </>
          )}
        </PaginationList>
      </Pagination>
    </div>
  )
}
