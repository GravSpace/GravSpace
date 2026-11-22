import { describe, expect, test } from 'vitest'
import { prepareDonutData } from '../components/dashboard/DonutBreakdownCard'

describe('prepareDonutData', () => {
  test('correctly calculates total and groups items into Top-N + Others', () => {
    const testData = [
      { name: 'bucket-a', value: 1000, fill: '#6366f1' },
      { name: 'bucket-b', value: 500, fill: '#10b981' },
      { name: 'bucket-c', value: 300, fill: '#f59e0b' },
      { name: 'bucket-d', value: 200, fill: '#ec4899' },
      { name: 'bucket-e', value: 100, fill: '#3b82f6' },
      { name: 'bucket-f', value: 50, fill: '#06b6d4' },
    ]

    const result = prepareDonutData(testData, 4)

    expect(result.total).toBe(2150)
    expect(result.validData).toHaveLength(6)
    // top 4 + 1 "Others"
    expect(result.displayList).toHaveLength(5)
    expect(result.displayList[0].name).toBe('bucket-a')
    expect(result.displayList[0].pct).toBe(47) // 1000 / 2150 = 46.5% -> 47%
    expect(result.displayList[4].name).toBe('Others (2)')
    expect(result.displayList[4].value).toBe(150) // 100 + 50
    expect(result.displayList[4].pct).toBe(7) // 150 / 2150 = 6.97% -> 7%
  })

  test('handles empty data gracefully', () => {
    const result = prepareDonutData([], 4)

    expect(result.total).toBe(0)
    expect(result.validData).toHaveLength(0)
    expect(result.displayList).toHaveLength(0)
    expect(result.pieData).toEqual([{ name: 'Empty', value: 1, fill: 'currentColor' }])
  })

  test('handles single or few items without Others row', () => {
    const testData = [
      { name: 'media', value: 1024, fill: '#6366f1' },
      { name: 'docs', value: 1024, fill: '#10b981' },
    ]

    const result = prepareDonutData(testData, 4)

    expect(result.total).toBe(2048)
    expect(result.displayList).toHaveLength(2)
    expect(result.displayList[0].pct).toBe(50)
    expect(result.displayList[1].pct).toBe(50)
  })
})
