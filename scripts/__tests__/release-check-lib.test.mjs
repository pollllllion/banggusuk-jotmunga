import { describe, it, expect } from 'vitest'
import {
  parseDiff, checkBuildOutput, checkFeatureLoss, checkDataLayer, checkStartupLoad,
  checkRls, checkPrerenderFields, checkMigrations, parseMigrateStatus, formatReport,
} from '../release-check-lib.mjs'

/** 테스트용 파일 항목 */
const file = (name, added = [], removed = [], extra = {}) => ({
  file: name, isNew: false, isDeleted: false, removed,
  added: added.map((text, i) => ({ line: i + 1, text })), ...extra,
})

describe('parseDiff', () => {
  it('파일·추가 줄 번호·삭제 줄을 뽑는다', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1..2 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -3,2 +10,2 @@ function x',
      '-old line',
      '+new line',
      '+second',
    ].join('\n')
    const [f] = parseDiff(diff)
    expect(f.file).toBe('src/a.ts')
    expect(f.removed).toEqual(['old line'])
    expect(f.added).toEqual([{ line: 10, text: 'new line' }, { line: 11, text: 'second' }])
  })

  it('헝크 안의 SQL 주석 삭제("--- ...")를 헤더로 착각하지 않는다', () => {
    const diff = [
      'diff --git a/supabase/x.sql b/supabase/x.sql',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/supabase/x.sql',
      '@@ -1,1 +1,1 @@',
      '--- 옛 주석',
      '+++ 새 주석 아님, 추가된 "++ " 로 시작하는 줄',
    ].join('\n')
    const [f] = parseDiff(diff)
    expect(f.isNew).toBe(true)
    expect(f.removed).toEqual(['-- 옛 주석'])
    expect(f.added[0].text).toBe('++ 새 주석 아님, 추가된 "++ " 로 시작하는 줄')
  })

  it('CRLF 와 git 경고 줄을 견딘다', () => {
    const diff = 'warning: LF will be replaced\r\ndiff --git a/b.ts b/b.ts\r\n@@ -0,0 +1 @@\r\n+x\r\n'
    expect(parseDiff(diff)[0].added).toEqual([{ line: 1, text: 'x' }])
  })
})

describe('checkBuildOutput', () => {
  const ok = '[sitemap] 2060개 URL → public/sitemap.xml\n[sitemap]   작품 2015 · 토론글 33\n[prerender] 2419개 정적 페이지 생성\n[prerender]   작품 2375 · 토론글 32'
  it('건수가 있으면 통과', () => {
    const r = checkBuildOutput(ok)
    expect(r.status).toBe('pass')
    expect(r.detail[0]).toContain('사이트맵 2060개(작품 2015)')
  })
  it('0건이거나 로그가 없으면 실패', () => {
    expect(checkBuildOutput(ok.replace('작품 2015', '작품 0')).status).toBe('fail')
    expect(checkBuildOutput('vite build done').status).toBe('fail')
  })
})

describe('checkFeatureLoss', () => {
  it('다시 export 되지 않은 삭제만 잡는다', () => {
    const r = checkFeatureLoss([
      file('src/a.ts', ['export function kept(x: number) {}'], ['export function kept() {}', 'export const gone = 1']),
    ])
    expect(r.status).toBe('review')
    expect(r.detail.join('\n')).toContain('export gone')
    expect(r.detail.join('\n')).not.toContain('export kept')
  })
  it('App.tsx 에서 빠진 라우트를 잡는다', () => {
    const r = checkFeatureLoss([file('src/App.tsx', [], ['  <Route path="/browse" element={<Browse />} />'])])
    expect(r.detail.join('\n')).toContain('라우트 /browse')
  })
})

describe('checkDataLayer', () => {
  it('페이지의 supabase.from 은 실패', () => {
    expect(checkDataLayer([file('src/pages/X.tsx', ["const { data } = await supabase.from('reviews').select()"])]).status).toBe('fail')
  })
  it('src/api 안과 주석은 괜찮다', () => {
    expect(checkDataLayer([
      file('src/api/reviews.ts', ["await supabase.rpc('x')"]),
      file('src/utils/tmdb.ts', [' * (supabaseClient.ts 의 publishable 키와 같은 성격)']),
    ]).status).toBe('pass')
  })
  it('페이지에 supabase import·auth 추가는 확인 대상', () => {
    expect(checkDataLayer([file('src/pages/Auth.tsx', ["import { supabase } from '@/lib/supabaseClient'"])]).status).toBe('review')
  })
})

describe('checkStartupLoad', () => {
  it('임계 초과면 실패, 컬럼 목록이 바뀌면 확인 대상', () => {
    expect(checkStartupLoad([], { status: 'over', summary: '1단계 gzip 300KB' }).status).toBe('fail')
    expect(checkStartupLoad([file('src/api/contentColumns.ts', ["  'castMembers',"])], { status: 'ok', summary: '' }).status).toBe('review')
    expect(checkStartupLoad([], { status: 'ok', summary: '1단계 gzip 59KB' }).status).toBe('pass')
  })
})

describe('checkRls', () => {
  it('security definer 인데 search_path 가 없으면 실패', () => {
    const sql = ['create or replace function public.f() returns void', 'language plpgsql', 'security definer', 'as $$ begin end $$;']
    expect(checkRls([file('supabase/m.sql', sql)]).status).toBe('fail')
  })
  it('search_path 고정이 있으면 확인 대상(입력 검증은 사람이 본다)', () => {
    const sql = ['create or replace function public.f() returns void', 'security definer', 'set search_path = public', 'as $$ begin end $$;']
    const r = checkRls([file('supabase/m.sql', sql)])
    expect(r.status).toBe('review')
    expect(r.detail[0]).toContain('public.f')
  })
  it('using (true) 정책과 RLS 해제를 잡는다', () => {
    expect(checkRls([file('supabase/m.sql', ['create policy p on t for all using (true);'])]).status).toBe('review')
    expect(checkRls([file('supabase/m.sql', ['alter table t disable row level security;'])]).status).toBe('fail')
  })
  it('관련 변경이 없으면 통과', () => {
    expect(checkRls([file('src/a.ts', ['const x = 1'])]).status).toBe('pass')
  })
})

describe('checkPrerenderFields', () => {
  it('컬럼 삭제·이름 변경은 실패', () => {
    expect(checkPrerenderFields([file('supabase/m.sql', ['alter table contents drop column body;'])]).status).toBe('fail')
  })
  it('SEO 가 앱에서만 바뀌면 확인 대상', () => {
    const r = checkPrerenderFields([file('src/utils/seo.ts', ['x'])])
    expect(r.status).toBe('review')
    expect(r.detail.join()).toContain('한쪽만')
  })
  it('관련 없으면 통과', () => {
    expect(checkPrerenderFields([file('src/pages/A.tsx', ['x'])]).status).toBe('pass')
  })
})

describe('parseMigrateStatus / checkMigrations', () => {
  const status = [
    '  ✓ 적용됨     migration_a.sql',
    '  ✗ 미적용     migration_b.sql',
    '  ~ 내용 바뀜  migration_c.sql',
    '  ✓ 적용됨     migration_d.sql (해시 미기록)',
    '총 4개 · 미적용 1 · 내용 바뀜 1',
  ].join('\n')

  it('상태 줄을 파일명별로 읽는다', () => {
    const m = parseMigrateStatus(status)
    expect([...m]).toEqual([['migration_a.sql', 'applied'], ['migration_b.sql', 'pending'], ['migration_c.sql', 'changed'], ['migration_d.sql', 'applied']])
  })

  it('이번에 바뀐 SQL 만 본다 — 적용 기록 있으면 통과', () => {
    const ledger = parseMigrateStatus(status)
    expect(checkMigrations([file('supabase/migration_a.sql', ['select 1;'])], ledger).status).toBe('pass')
    expect(checkMigrations([file('src/a.ts', ['x'])], ledger).status).toBe('pass')
  })

  it('기록 없음·내용 바뀜은 실패, mark 방법을 알려준다', () => {
    const ledger = parseMigrateStatus(status)
    const r = checkMigrations([file('supabase/migration_b.sql', ['select 1;'])], ledger)
    expect(r.status).toBe('fail')
    expect(r.detail[0]).toContain('npm run migrate:mark migration_b.sql')
    expect(checkMigrations([file('supabase/migration_c.sql', ['x'])], ledger).status).toBe('fail')
  })

  it('원장 조회 실패면 직접 확인 대상, 새 컬럼은 따로 알린다', () => {
    expect(checkMigrations([file('supabase/migration_a.sql', ['x'])], null).status).toBe('review')
    const r = checkMigrations([file('supabase/migration_a.sql', ['alter table t add column if not exists x int;'])], parseMigrateStatus(status))
    expect(r.status).toBe('review')
    expect(r.detail.join('\n')).toContain('옵셔널')
  })
})

describe('formatReport', () => {
  it('표와 합계를 찍는다', () => {
    const text = formatReport([
      { step: '1 품질', item: '타입체크', how: 'tsc', status: 'pass', detail: [] },
      { step: '4 아키텍처', item: '③ RLS', how: 'sql', status: 'fail', detail: ['x'] },
    ], { base: 'abcdef1234', fileCount: 3 })
    expect(text).toContain('| 1 품질 | 타입체크 | tsc | ✅ |')
    expect(text).toContain('합계: ❌ 1 · ⚠️ 0 · ✅ 1')
    expect(text).toContain('푸시 금지')
  })
})
