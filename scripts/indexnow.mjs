/**
 * 새 페이지를 검색엔진에 바로 알리기 (IndexNow — 네이버·빙 등)
 *
 *   node scripts/indexnow.mjs --wait-deploy   # 정기 재배포 워크플로: 배포 전후 sitemap 을 비교해 새로 생긴 주소만 알린다
 *   node scripts/indexnow.mjs --shortform     # 숏폼 작품 페이지 전부 (2026-09-19 한 번 — 한꺼번에 늘린 페이지)
 *   node scripts/indexnow.mjs --url=https://ottcal.com/content/…   # 주소 하나 (여러 번 줘도 된다)
 *   … --dry                                   # 보낼 주소만 찍기
 *
 * 왜 필요한가 (2026-09-19):
 *   유입의 대부분이 네이버인데(구글의 10배), 새 작품 페이지는 네이버가 스스로 찾아올 때까지 색인이 안 된다.
 *   IndexNow 는 "이 주소가 새로 생겼다"를 검색엔진에 바로 알리는 공개 규약이고, 네이버는 2023-07 부터 받는다.
 *   구글은 IndexNow 를 받지 않는다 — 구글은 sitemap 으로 간다.
 *
 * 왜 sitemap 을 비교하나:
 *   contents.createdAt 은 수집기가 upsert 할 때마다 지금 시각으로 다시 찍혀서 '새 작품' 표시로 못 쓴다
 *   (최근 30시간이 585개로 나왔다). 배포 전 sitemap 에 없고 배포 후에 생긴 주소 = 이번에 새로 색인 대상이 된
 *   페이지다. sitemap 은 얇은 페이지를 이미 거른 목록이라(isIndexableContent) 기준도 저절로 같다.
 *
 * 키: public/47b975b55a7609f279d9b0291b164b5e.txt (공개가 정상이다 — 검색엔진이 이 파일로 '우리 사이트가 보낸 것'을 확인한다).
 */
import { fetchAll, VISIBLE_CONTENTS } from './db.mjs'
import { SITE_URL } from '../src/shared/siteSeo.mjs'
import { todayKey } from '../src/shared/contentSeo.mjs'
import { isIndexableContent } from '../src/shared/contentIndexable.mjs'
import { isShortForm } from '../src/shared/shortForm.mjs'

const KEY = '47b975b55a7609f279d9b0291b164b5e'
const HOST = new URL(SITE_URL).host
// 네이버는 받은 주소를 다른 IndexNow 검색엔진과도 나눈다지만, 빙 쪽에도 직접 보낸다(공용 주소)
const ENDPOINTS = ['https://searchadvisor.naver.com/indexnow', 'https://api.indexnow.org/indexnow']

const DRY = process.argv.includes('--dry')
const SHORTFORM = process.argv.includes('--shortform')
const WAIT = process.argv.includes('--wait-deploy')
const ONE = process.argv.filter(a => a.startsWith('--url=')).map(a => a.slice(6))

const bust = () => `?_=${Date.now()}`
const noCache = { headers: { 'cache-control': 'no-cache' } }

/** 라이브 index.html 이 부르는 번들 이름 — 빌드가 바뀌면 이게 바뀐다 */
async function liveBundle() {
  try {
    const html = await (await fetch(`${SITE_URL}/${bust()}`, noCache)).text()
    return (html.match(/\/assets\/index-[\w-]+\.js/) || [null])[0]
  } catch { return null }
}

/** 라이브 sitemap 의 주소들. 못 읽으면 null */
async function liveSitemap() {
  try {
    const res = await fetch(`${SITE_URL}/sitemap.xml${bust()}`, noCache)
    if (!res.ok) return null
    return new Set([...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&')))
  } catch { return null }
}

/** 방금 push 한 빌드가 라이브에 올라올 때까지 (최대 15분) */
async function waitForDeploy(before) {
  console.log(`배포 대기 — 지금 번들 ${before}`)
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 30_000))
    const now = await liveBundle()
    if (now && now !== before) { console.log(`새 빌드 확인 ${now}`); return true }
  }
  return false
}

async function shortformUrls() {
  const today = todayKey()
  const contents = await fetchAll('contents', '*', VISIBLE_CONTENTS)
  return contents
    .filter(c => isShortForm(c) && isIndexableContent(c, { today }))
    .map(c => `${SITE_URL}/content/${encodeURIComponent(c.id)}`)
}

async function collectUrls() {
  if (ONE.length) return ONE
  if (SHORTFORM) return shortformUrls()
  if (!WAIT) { console.log('--wait-deploy · --shortform · --url= 중 하나를 주세요.'); process.exit(1) }
  const bundle = await liveBundle()
  const before = await liveSitemap()
  if (!before) { console.log('배포 전 sitemap 을 못 읽어 건너뜁니다(비교 기준이 없으면 전부 새것으로 보인다).'); return [] }
  if (!(await waitForDeploy(bundle))) { console.log('15분 안에 새 빌드가 안 보여 건너뜁니다 — 다음 재배포 때 비교된다.'); return [] }
  const after = await liveSitemap()
  if (!after) return []
  return [...after].filter(u => !before.has(u) && u.startsWith(SITE_URL))
}

async function submit(urls) {
  // 한 번에 1만 개까지 받는다
  for (let i = 0; i < urls.length; i += 10000) {
    const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `${SITE_URL}/${KEY}.txt`, urlList: urls.slice(i, i + 10000) })
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body })
        // 200·202 = 받음. 403 = 키 파일을 못 찾음(아직 배포 전), 422 = 우리 호스트가 아닌 주소가 섞임
        console.log(`  ${ep} → ${res.status}${res.ok ? '' : ` ${(await res.text()).slice(0, 200)}`}`)
      } catch (e) { console.log(`  ${ep} → 실패 ${e.message}`) }
    }
  }
}

const urls = await collectUrls()
console.log(`알릴 주소 ${urls.length}개 (${ONE.length ? '지정' : SHORTFORM ? '숏폼 전체' : '이번 배포로 새로 생긴 페이지'})`)
for (const u of urls.slice(0, 10)) console.log(`  ${u}`)
if (urls.length > 10) console.log(`  ... 외 ${urls.length - 10}개`)
if (!urls.length || DRY) process.exit(0)
await submit(urls)
