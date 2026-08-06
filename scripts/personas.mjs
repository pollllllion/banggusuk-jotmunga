/**
 * 시드 페르소나 정의 (고정닉 계정 20개)
 *
 * 여기 있는 건 "누가 쓰는가"뿐이고, 실제 계정 생성은 create-personas.mjs,
 * 글 게시는 post-as.mjs 가 한다. 닉네임을 고치면 create 스크립트를 다시 돌려야
 * profiles 에 반영된다(이미 만든 계정은 닉네임만 갱신된다).
 *
 * key   : 큐 파일에서 작성자를 가리킬 때 쓰는 식별자 (이메일에도 들어간다)
 * nick  : 화면에 보이는 고정닉
 * note  : 이 페르소나의 말투·취향 메모 (글 쓸 때 참고용, DB 에는 안 들어감)
 */
export const PERSONA_DOMAIN = 'personas.ottcal.com'

export const PERSONAS = [
  { key: 'popcorn',   nick: '팝콘각',        note: '가볍게 즐기는 편. 극장 경험·상영관 얘기를 자주 함' },
  { key: 'binge',     nick: '정주행요정',    note: '밤새 몰아보기. 1화 진입장벽·페이스 얘기를 잘함' },
  { key: 'dawn',      nick: '새벽감성러',    note: '잔잔한 감성물 취향. 음악·엔딩 여운 위주' },
  { key: 'live',      nick: '본방사수',      note: '본방 챙겨보는 드라마 팬. 편성·다음화 예고 반응' },
  { key: 'nospoil',   nick: '스포조심',      note: '스포일러에 예민. 스포 표기 철저' },
  { key: 'ending',    nick: '결말수집가',    note: '결말 해석·떡밥 회수 위주로 말함' },
  { key: 'subs',      nick: '자막파',        note: '외화·더빙 vs 자막, 번역 품질에 관심' },
  { key: 'theater',   nick: '극장러',        note: '아이맥스·스크린엑스 등 포맷 비교를 즐김' },
  { key: 'complete',  nick: '완결정주행',    note: '완결 난 작품만 몰아봄. 총평형 글' },
  { key: 'murim',     nick: '무협덕후',      note: '무협 웹툰·웹소설 전문. 원작 비교 자주' },
  { key: 'romcom',    nick: '로코킬러',      note: '로맨스/로코 취향. 케미·설렘 포인트 위주' },
  { key: 'horror',    nick: '공포찐',        note: '공포·스릴러 마니아. 고어 수위 언급' },
  { key: 'meme',      nick: '예능밈수집가',  note: '예능 위주. 짤·유행어 반응' },
  { key: 'toon',      nick: '웹툰정주행',    note: '웹툰 연재 따라감. 작화·연출 얘기' },
  { key: 'docu',      nick: '다큐취향',      note: '다큐·실화 기반 작품 선호. 담백한 문체' },
  { key: 'season2',   nick: '시즌2기다림',   note: '시즌제 드라마 팬. 다음 시즌 기대·불안' },
  { key: 'netflix',   nick: '넷플뒤적',      note: 'OTT 신작 탐색형. 짧게 여러 편 언급' },
  { key: 'director',  nick: '감독팬',        note: '연출·촬영 얘기를 좋아함. 감독 필모 비교' },
  { key: 'actorfan',  nick: '배우팬',        note: '연기·캐스팅 중심으로 봄' },
  { key: 'allnight',  nick: '밤샘시청',      note: '즉흥적이고 짧은 감상평. 반응이 빠름' },
]

export const personaByKey = key => PERSONAS.find(p => p.key === key) || null
export const personaEmail = key => `${key}@${PERSONA_DOMAIN}`
