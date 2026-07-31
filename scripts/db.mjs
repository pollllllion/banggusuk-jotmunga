/**
 * 빌드 스크립트 공용 — .env 로드 + Supabase REST 페이징 조회
 *
 * generate-sitemap.mjs / prerender.mjs 가 함께 쓴다.
 * 키는 전부 공개 publishable 값 기본값이 있어 .env 없이도 동작한다.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * .env 를 직접 읽는다.
 * node --env-file-if-exists 플래그는 Node 20.12+ 에서만 동작하는데, 빌드 플랫폼마다
 * Node 버전이 달라 플래그를 모르면 스크립트가 아니라 프로세스가 통째로 죽는다.
 */
function loadEnvFile() {
  const envPath = resolve(__dirname, '../.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) continue
    const m = /^\s*([\w.-]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (!m) continue
    const [, key, raw] = m
    const val = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvFile()

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ggswwptjbwvesjkowwsc.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || 'sb_publishable_XRQiUZAforlq1XXAZytb0A_6CAkxx6t'

const PAGE = 1000 // Supabase REST 기본 상한

/**
 * 테이블 전체를 range 페이징으로 가져온다.
 * order=id 필수 — ORDER BY 없는 LIMIT/OFFSET 은 순서 보장이 없어서 페이지를 넘기는
 * 사이에 행이 바뀌면 같은 행이 두 번 들어오거나 어떤 행이 통째로 빠진다.
 */
export async function fetchAll(table, select, extraQuery = '') {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&order=id${extraQuery}`
    const res = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    })
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`)
    const batch = await res.json()
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

/** 숨김 처리되지 않은 작품만 (컬럼이 null 인 옛 행 포함) */
export const VISIBLE_CONTENTS = '&or=(hidden.is.null,hidden.is.false)'
