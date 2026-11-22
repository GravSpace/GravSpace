import { describe, expect, test } from 'vitest'
import { formatSize, formatSavings } from '../components/dashboard/dashboardTypes'
import { buildPolicyJson, defaultStatement } from '../components/policy/policyTypes'
import { formatDate } from '../components/trash/trashTypes'

describe('Dashboard helpers', () => {
  test('formatSize formats bytes into readable units', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(1024)).toBe('1 KB')
    expect(formatSize(1048576)).toBe('1 MB')
    expect(formatSize(1073741824)).toBe('1 GB')
  })

  test('formatSavings computes differential savings percentage', () => {
    expect(formatSavings(0, 0)).toBe('0 B (0%)')
    expect(formatSavings(1000, 500)).toBe('500 B (50%)')
    expect(formatSavings(1000, 1000)).toBe('0 B (0%)')
  })
})

describe('Policy helpers', () => {
  test('buildPolicyJson builds valid IAM policy document', () => {
    const jsonStr = buildPolicyJson('test-policy', [defaultStatement()])
    const parsed = JSON.parse(jsonStr)
    expect(parsed.name).toBe('test-policy')
    expect(parsed.version).toBe('2012-10-17')
    expect(parsed.statement).toHaveLength(1)
    expect(parsed.statement[0].effect).toBe('Allow')
    expect(parsed.statement[0].resource).toEqual(['arn:aws:s3:::*'])
  })
})

describe('Trash helpers', () => {
  test('formatDate handles null and valid ISO dates', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('invalid')).toBe('—')
    const nowIso = new Date().toISOString()
    expect(formatDate(nowIso)).toContain('just now')
  })
})
