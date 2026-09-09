# 활동 알림 폰 푸시 붙이기 (댓글·답글·추천)

댓글·추천이 달리면 **폰으로 울리게** 하는 장치. 한 번만 해두면 끝이다.

## 지금 구조

```
누가 댓글을 단다
  → 그 사람 브라우저가 notifications 에 행을 넣는다      (이미 동작 중 · 종 아이콘)
  → DB Webhook 이 INSERT 를 감지해 Edge Function 을 부른다  ← ★ 이 문서가 붙이는 것
  → Edge Function 이 받는 사람 설정을 보고 웹푸시를 쏜다
  → 서비스워커가 폰 화면에 띄운다                          (이미 동작 중)
```

**종 아이콘은 설정과 무관하게 항상 뜬다.** 설정(`profiles.notifyComment/Reply/Like`)은
폰 푸시만 끄고, 그 판정은 Edge Function 이 한다.

---

## 1) Edge Function 배포

리포의 `supabase/functions/push-on-activity/index.ts` 를 올린다.

**CLI 가 있으면**

```bash
npx supabase login
npx supabase link --project-ref ggswwptjbwvesjkowwsc
npx supabase functions deploy push-on-activity
```

**대시보드로 하려면**
Supabase → **Edge Functions** → *Deploy a new function* → 이름 `push-on-activity`
→ 편집기에 `index.ts` 내용을 통째로 붙여넣고 Deploy.

## 2) 시크릿 4개 등록

Supabase → **Edge Functions → Secrets** (또는 `npx supabase secrets set KEY=값`)

| 이름 | 값 |
|---|---|
| `SERVICE_ROLE_KEY` | Project Settings → API → `service_role` 키 |
| `VAPID_PRIVATE_KEY` | 로컬 `.env` 의 `VAPID_PRIVATE_KEY` (GitHub Actions 시크릿과 같은 값) |
| `VAPID_PUBLIC_KEY` | 로컬 `.env` 의 `VITE_VAPID_PUBLIC_KEY` (생략 가능 · 코드에 기본값 있음) |
| `PUSH_HOOK_SECRET` | 아무 긴 임의 문자열. 3)에서 헤더로 똑같이 넣는다 |

> `PUSH_HOOK_SECRET` 을 비워 두면 검사를 건너뛴다. **채워 두는 걸 권한다** —
> 이 함수는 남의 기기로 알림을 쏠 수 있어서 주소만 알면 누구나 부를 수 있으면 곤란하다.

임의 문자열 만들기:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

## 3) 웹훅 연결 — SQL Editor 에서 한 번

`supabase/migration_push_webhook.sql` 을 열어 `<ANON_KEY>`, `<PUSH_HOOK_SECRET>` 두 곳을
자기 값으로 바꾸고 **SQL Editor** 에 붙여 실행한다.

대시보드의 Database → Webhooks 폼으로 해도 같다(칸이 8개라 SQL 이 빠르다):
Name `push-on-activity` · Table `public.notifications` · Events **Insert만** ·
Type **Supabase Edge Functions** · Function `push-on-activity` ·
HTTP Headers 에 `X-Hook-Secret` 추가.

## 4) 확인

폰에서 ottcal.com → 계정 설정 → 알림 설정 → **‘이 기기에서 알림 받기’** 를 먼저 켠다.
아이폰은 반드시 **홈 화면에 추가한 아이콘으로 연 상태**여야 한다(사파리 탭에서는 구독 자체가 안 된다).

그다음 다른 계정(또는 시크릿 창의 유동닉)으로 내 글에 댓글을 달아 본다.

**함수 로그**: Supabase → Edge Functions → `push-on-activity` → Logs
- `{"sent":1,...}` 이면 성공
- `{"skipped":"no subscription"}` → 그 계정이 기기 등록을 안 했다
- `{"skipped":"notifyComment off"}` → 설정에서 꺼 뒀다
- `401 bad hook secret` → 3)의 헤더와 2)의 시크릿이 다르다

**직접 찔러보기** (구독 없이 함수만 확인):
```bash
curl -i -X POST \
  "https://ggswwptjbwvesjkowwsc.supabase.co/functions/v1/push-on-activity" \
  -H "Authorization: Bearer <anon 키>" \
  -H "X-Hook-Secret: <PUSH_HOOK_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"type":"INSERT","table":"notifications","record":{"id":"t1","userId":"<내 계정 id>","type":"comment","reviewId":"","message":"테스트","createdAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}}'
```

---

## 알아둘 것

- **`npm:web-push` 를 Deno 에서 쓴다.** Supabase Edge Runtime 의 Node 호환에 기대는
  부분이라, 배포 후 로그에 import 오류가 나면 Deno 네이티브 웹푸시 라이브러리로
  바꿔야 한다. 그 경우 VAPID 키를 JWK 로 변환해야 해서 손이 조금 더 간다.
- **10분 넘은 알림은 버린다.** 웹훅 재시도로 몇 시간 전 댓글이 갑자기 울리면 놀라기만 한다.
- **만료된 구독(410/404)은 자동으로 지운다.** 앱을 지운 기기에 계속 쏘지 않도록.
- **같은 글의 알림은 하나로 접힌다**(`tag: activity-<글id>`). 댓글이 우르르 달려도
  폰이 도배되지 않는다.
- 유동닉에게는 애초에 알림 행이 만들어지지 않는다(RLS 상 자기 알림을 못 읽는다).
  함수도 `no profile` 로 건너뛴다.
- 공개일 알림은 그대로 GitHub Actions 크론(`send-release-push.mjs`)이 보낸다.
  이 함수와 무관하다.
