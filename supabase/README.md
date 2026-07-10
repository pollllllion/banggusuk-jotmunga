# Supabase 연결 가이드 (현재: 스캐폴딩 완료)

현재 앱은 **localStorage 기반**으로 동작합니다. 아래는 실제 Supabase 백엔드로 전환할 때의 절차이며, 지금은 "연결 준비"까지만 되어 있습니다.

## 준비된 것
- `@supabase/supabase-js` 설치됨
- `src/lib/supabaseClient.ts` — 환경변수가 있으면 클라이언트 생성, 없으면 localStorage 모드 유지
- `.env.example` — 필요한 환경변수 목록
- `supabase/schema.sql` — 전체 테이블 스키마 (현재 데이터 모델과 1:1)

## 연결 순서
1. [supabase.com](https://supabase.com) 에서 프로젝트 생성
2. **Project Settings → API** 에서 `Project URL`과 `anon public` 키 복사
3. 프로젝트 루트 `.env` 파일에 붙여넣기
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
4. **SQL Editor** 에 `supabase/schema.sql` 내용을 붙여넣고 실행 → 테이블 생성
5. 개발 서버 재시작 (`npm run dev`)

## 다음 단계 (실제 전환 시)
- `src/api/dataService.ts` 의 각 함수를 supabase 쿼리로 교체
- 인증(회원가입/로그인)을 Supabase Auth로 연결 → 이때 로그인 화면이 다시 필요해집니다
- `profiles` 자동 생성 트리거 추가 (auth.users insert → profiles insert)
- RLS 정책 활성화 (`schema.sql` 하단 예시 참고)
