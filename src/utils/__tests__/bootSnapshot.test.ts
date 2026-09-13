import { describe, it, expect } from 'vitest'
import { isSnapshotUsable, BOOT_SNAPSHOT_VERSION, BOOT_SNAPSHOT_MAX_AGE } from '../bootSnapshot'

const NOW = Date.UTC(2026, 8, 13)
const want = { now: NOW, from: '2026-08-01', to: '2026-11-30', contentId: null as string | null }
const snap = (over: Record<string, unknown> = {}) => ({
  v: BOOT_SNAPSHOT_VERSION, at: NOW - 60_000, from: '2026-08-01', to: '2026-11-30',
  tables: { contents: [{ id: 'tv-1' }], discussions: [] },
  ...over,
})

describe('부팅 스냅샷 사용 여부', () => {
  it('범위·버전·나이가 맞으면 쓴다', () => {
    expect(isSnapshotUsable(snap(), want)).toBe(true)
  })

  it('없거나 깨졌으면 안 쓴다', () => {
    expect(isSnapshotUsable(null, want)).toBe(false)
    expect(isSnapshotUsable('x', want)).toBe(false)
    expect(isSnapshotUsable(snap({ tables: {} }), want)).toBe(false)
  })

  it('저장 형태 버전이 다르면 안 쓴다', () => {
    expect(isSnapshotUsable(snap({ v: BOOT_SNAPSHOT_VERSION + 1 }), want)).toBe(false)
  })

  it('오래됐거나 시계가 거꾸로면 안 쓴다', () => {
    expect(isSnapshotUsable(snap({ at: NOW - BOOT_SNAPSHOT_MAX_AGE - 1 }), want)).toBe(false)
    expect(isSnapshotUsable(snap({ at: NOW + 60_000 }), want)).toBe(false)
  })

  it('달이 바뀌어 범위가 다르면 안 쓴다 (빈 달력 방지)', () => {
    expect(isSnapshotUsable(snap(), { ...want, from: '2026-09-01', to: '2026-12-31' })).toBe(false)
  })

  it('작품 딥링크는 그 작품이 사본에 있을 때만 쓴다', () => {
    expect(isSnapshotUsable(snap(), { ...want, contentId: 'tv-1' })).toBe(true)
    expect(isSnapshotUsable(snap(), { ...want, contentId: 'tv-2' })).toBe(false)
  })
})
