/**
 * Unit tests for src/lib/utils.ts
 */
import { describe, it, expect } from 'vitest'
import {
  cn,
  STATUS_COLORS,
  PRIORITY_CONFIG,
  ISSUE_TYPE_ICONS,
  getInitials,
  timeAgo,
} from '@/lib/utils'

// ---------------------------------------------------------------------------
// cn() — class name merger
// ---------------------------------------------------------------------------
describe('cn()', () => {
  it('merges multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('removes falsy values', () => {
    expect(cn('foo', false && 'bar', undefined, null as any, 'baz')).toBe('foo baz')
  })

  it('handles tailwind conflict resolution', () => {
    // twMerge should keep the last conflicting utility
    expect(cn('p-4', 'p-8')).toBe('p-8')
  })

  it('handles conditional objects', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500')
  })

  it('returns empty string with no args', () => {
    expect(cn()).toBe('')
  })
})

// ---------------------------------------------------------------------------
// STATUS_COLORS
// ---------------------------------------------------------------------------
describe('STATUS_COLORS', () => {
  it('has an entry for all four statuses', () => {
    expect(STATUS_COLORS['To Do']).toBeDefined()
    expect(STATUS_COLORS['In Progress']).toBeDefined()
    expect(STATUS_COLORS['In Review']).toBeDefined()
    expect(STATUS_COLORS['Done']).toBeDefined()
  })

  it('each value is a non-empty string (Tailwind classes)', () => {
    for (const val of Object.values(STATUS_COLORS)) {
      expect(typeof val).toBe('string')
      expect(val.length).toBeGreaterThan(0)
    }
  })

  it('Done status uses emerald colour family', () => {
    expect(STATUS_COLORS['Done']).toContain('emerald')
  })

  it('In Progress status uses blue colour family', () => {
    expect(STATUS_COLORS['In Progress']).toContain('blue')
  })
})

// ---------------------------------------------------------------------------
// PRIORITY_CONFIG
// ---------------------------------------------------------------------------
describe('PRIORITY_CONFIG', () => {
  const priorities = ['Highest', 'High', 'Medium', 'Low', 'Lowest']

  it('contains all five priorities', () => {
    priorities.forEach((p) => expect(PRIORITY_CONFIG[p]).toBeDefined())
  })

  it('each entry has color and label', () => {
    priorities.forEach((p) => {
      expect(PRIORITY_CONFIG[p].color).toBeTruthy()
      expect(PRIORITY_CONFIG[p].label).toBe(p)
    })
  })

  it('Highest uses red, Lowest uses slate', () => {
    expect(PRIORITY_CONFIG['Highest'].color).toContain('red')
    expect(PRIORITY_CONFIG['Lowest'].color).toContain('slate')
  })
})

// ---------------------------------------------------------------------------
// ISSUE_TYPE_ICONS
// ---------------------------------------------------------------------------
describe('ISSUE_TYPE_ICONS', () => {
  it('has icons for standard types', () => {
    ;['Epic', 'Feature', 'Story', 'Task', 'Bug', 'Sub-task'].forEach((t) =>
      expect(ISSUE_TYPE_ICONS[t]).toBeTruthy(),
    )
  })

  it('Bug is the bug emoji', () => {
    expect(ISSUE_TYPE_ICONS['Bug']).toBe('🐛')
  })

  it('Epic is the lightning emoji', () => {
    expect(ISSUE_TYPE_ICONS['Epic']).toBe('⚡')
  })
})

// ---------------------------------------------------------------------------
// getInitials()
// ---------------------------------------------------------------------------
describe('getInitials()', () => {
  it('returns first letters of first and last name', () => {
    expect(getInitials('Alice Johnson')).toBe('AJ')
  })

  it('handles single-word name', () => {
    expect(getInitials('Alice')).toBe('A')
  })

  it('is uppercase', () => {
    expect(getInitials('alice johnson')).toBe('AJ')
  })

  it('returns max 2 chars for long names', () => {
    expect(getInitials('Jean-Paul Van Der Berg').length).toBeLessThanOrEqual(2)
  })

  it('handles three-word name, takes first two initials', () => {
    // "A B C" → splits to ['A','B','C'] → first letters 'A','B','C' → join 'ABC' → slice(0,2) = 'AB'
    expect(getInitials('Alice Bob Carol')).toBe('AB')
  })
})

// ---------------------------------------------------------------------------
// timeAgo()
// ---------------------------------------------------------------------------
describe('timeAgo()', () => {
  it('returns minutes for recent dates', () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString()
    expect(timeAgo(recent)).toBe('5m ago')
  })

  it('returns hours for dates within a day', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000).toISOString()
    expect(timeAgo(twoHoursAgo)).toBe('2h ago')
  })

  it('returns days for older dates', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
    expect(timeAgo(threeDaysAgo)).toBe('3d ago')
  })

  it('handles 0 minutes', () => {
    const justNow = new Date().toISOString()
    expect(timeAgo(justNow)).toMatch(/^0m ago$/)
  })
})
