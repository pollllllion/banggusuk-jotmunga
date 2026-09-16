/**
 * 한국 공휴일 표 만들기 → src/shared/holidays.mjs
 *
 *   npm run holidays            # 미리보기(파일 안 씀)
 *   npm run holidays -- --write # 실제로 씀
 *
 * 왜 정적 파일인가: 캘린더는 첫 화면이고 프리렌더도 탄다. 런타임에 외부 API 를 부르면
 * 그만큼 늦어지고, 그 API 가 죽는 날 공휴일이 통째로 사라진다. 어차피 공휴일은
 * 몇 년 치가 미리 정해져 있으므로 **받아서 구워 넣고** 앱은 그 표만 본다.
 *
 * 왜 음력을 직접 계산하지 않나: 설날·추석·부처님오신날이 음력이고 대체공휴일 규칙까지
 * 얽혀 있다. 직접 구현하면 몇 년 뒤 조용히 틀린다 — 달력이 틀리면 안 본 것만 못하다.
 *
 * 출처: 구글 '대한민국의 휴일' 공개 캘린더(ICS). 키가 필요 없고 2021~2031 을 덮는다.
 * 이 캘린더에는 공휴일이 아닌 기념일(제헌절·식목일·어버이날·크리스마스 이브 …)도
 * 섞여 있어서 **빨간날만 골라낸다** — 아래 HOLIDAY_NAMES 가 그 목록이다.
 *
 * 범위가 끝나갈 때(2031년쯤) 다시 돌리면 된다.
 */
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WRITE = process.argv.includes('--write')
const ICS = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics'
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/shared/holidays.mjs')

/** 관공서가 쉬는 날 = 달력에 빨갛게 적는 날. 그 밖(제헌절·국군의날·식목일 …)은 뺀다. */
const HOLIDAY_NAMES = new Map([
  ['새해첫날', '새해'],
  ['설날', '설날'], ['설날 연휴', '설날'],
  ['삼일절', '삼일절'],
  ['어린이날', '어린이날'],
  ['부처님오신날', '부처님오신날'],
  ['현충일', '현충일'],
  ['광복절', '광복절'],
  ['추석', '추석'], ['추석 연휴', '추석'],
  ['개천절', '개천절'],
  ['한글날', '한글날'],
  ['크리스마스', '크리스마스'],
])

/**
 * 위 목록에 없어도 공휴일인 것 — **이름 표기가 해마다 다르다.**
 * 처음엔 '쉬는 날 …' 과 '…선거일' 로만 잡았는데, 옛 연도가 '석가탄신일 대체공휴일',
 * '추석 (대체공휴일)', '대통령 선거' 로 적혀 있어 그대로 빠졌다 → 포함으로 잡는다.
 */
function byRule(title) {
  if (title.startsWith('쉬는 날') || title.includes('대체공휴일')) return '대체공휴일'
  if (title.includes('선거')) return '선거일'            // 지방선거일 · 대통령 선거 · 국회의원선거일
  if (title.includes('임시공휴일')) return '임시공휴일'
  return null
}

const res = await fetch(ICS)
if (!res.ok) { console.error(`ICS 내려받기 실패 ${res.status}`); process.exit(1) }
// ICS 는 75자마다 '\r\n ' 로 접어 쓴다 — 먼저 펴야 제목이 잘리지 않는다
const text = (await res.text()).replace(/\r\n /g, '')

const all = [...text.matchAll(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g)].map(m => {
  const d = (m[1].match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/) || [])
  const t = (m[1].match(/SUMMARY:(.*)/) || [])[1]
  return d[1] && t ? { date: `${d[1]}-${d[2]}-${d[3]}`, title: t.trim() } : null
}).filter(Boolean)

const map = {}
const dropped = new Set()
for (const { date, title } of all) {
  const name = HOLIDAY_NAMES.get(title) ?? byRule(title)
  if (!name) { dropped.add(title); continue }
  map[date] = name   // 같은 날 두 개면(어린이날 + 부처님오신날) 뒤엣것이 남는다 — 칸이 하나뿐이다
}

const dates = Object.keys(map).sort()
console.log(`공휴일 ${dates.length}일 · ${dates[0]} ~ ${dates[dates.length - 1]}`)
console.log(`공휴일 아님으로 뺀 것: ${[...dropped].sort().join(', ')}`)
const thisYear = new Date().getFullYear()
console.log(`\n${thisYear}년:`)
for (const d of dates.filter(d => d.startsWith(String(thisYear)))) console.log(`  ${d}  ${map[d]}`)

const body = `/**
 * 한국 공휴일 — scripts/fetch-holidays.mjs 가 만든 표다. **손으로 고치지 말 것.**
 * 범위가 끝나갈 때 \`npm run holidays -- --write\` 를 다시 돌린다.
 *
 * 출처: 구글 '대한민국의 휴일' 공개 캘린더. 공휴일이 아닌 기념일은 걸러 냈다.
 * 앱(캘린더)과 프리렌더가 같이 쓰므로 .mjs 로 둔다.
 */
export const HOLIDAYS = ${JSON.stringify(map, null, 2).replace(/"(\d{4}-\d{2}-\d{2})":/g, "'$1':").replace(/: "([^"]*)"/g, ": '$1'")}

/** 이 날이 공휴일이면 이름, 아니면 null */
export function holidayOf(dateKey) {
  return HOLIDAYS[dateKey] ?? null
}
`

if (WRITE) { writeFileSync(OUT, body, 'utf8'); console.log(`\n→ ${OUT} 에 썼습니다.`) }
else console.log('\n미리보기였습니다. 실제로 쓰려면 --write 를 붙이세요.')
