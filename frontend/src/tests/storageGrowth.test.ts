import { describe, expect, test } from 'vitest'
import {
  parseDate,
  formatDayLabel,
  processStorageHistory,
} from '../components/dashboard/StorageGrowthChart'

describe('StorageGrowthChart helpers', () => {
  test('parseDate extracts ISO date or space-separated date cleanly', () => {
    expect(parseDate('2026-11-21 08:52:10')).toBe('2026-11-21')
    expect(parseDate('2026-06-09T08:19:30Z')).toBe('2026-06-09')
    expect(parseDate('')).toBe('')
  })

  test('formatDayLabel formats YYYY-MM-DD into human-friendly Month Day', () => {
    expect(formatDayLabel('2026-06-09')).toBe('Jun 9')
    expect(formatDayLabel('2026-11-21')).toBe('Nov 21')
    expect(formatDayLabel('2026-01-05')).toBe('Jan 5')
  })

  test('processStorageHistory groups records by day and computes total & delta', () => {
    const rawHistory = [
      { Bucket: 'b1', Size: 100, Timestamp: '2026-06-09 08:00:00' },
      { Bucket: 'b2', Size: 200, Timestamp: '2026-06-09 09:00:00' },
      // Update b1 later that day: should take latest
      { Bucket: 'b1', Size: 150, Timestamp: '2026-06-09 10:00:00' },
      // Next day
      { Bucket: 'b1', Size: 300, Timestamp: '2026-06-10 10:00:00' },
      { Bucket: 'b2', Size: 250, Timestamp: '2026-06-10 10:00:00' },
    ]

    const result = processStorageHistory(rawHistory)

    expect(result.chartData).toHaveLength(2)
    // Day 1: b1 is 150 (latest), b2 is 200 -> total 350
    expect(result.chartData[0].day).toBe('Jun 9')
    expect(result.chartData[0].Total).toBe(350)
    expect(result.chartData[0].b1).toBe(150)
    expect(result.chartData[0].b2).toBe(200)

    // Day 2: b1 is 300, b2 is 250 -> total 550
    expect(result.chartData[1].day).toBe('Jun 10')
    expect(result.chartData[1].Total).toBe(550)

    expect(result.latestTotal).toBe(550)
    expect(result.delta).toBe(200) // 550 - 350
    expect(result.allBuckets).toContain('b1')
    expect(result.allBuckets).toContain('b2')
  })

  test('processStorageHistory handles empty history gracefully', () => {
    const result = processStorageHistory([])
    expect(result.chartData).toHaveLength(0)
    expect(result.allBuckets).toHaveLength(0)
    expect(result.latestTotal).toBe(0)
    expect(result.delta).toBe(0)
  })
})
