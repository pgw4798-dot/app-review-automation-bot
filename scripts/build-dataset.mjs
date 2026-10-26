// 사용: node scripts/build-dataset.mjs <raw_play.json> <raw_appstore.json>
// 원본(수집 결과)을 통합 스키마로 정규화하고 1차 VoC 분류(키워드 규칙)를 붙여
// data/reviews.json 과 docs/data/toss-reviews.js 를 만든다.
// 원본 파일에는 작성자 공개 닉네임이 있어 저장소에 올리지 않고, 여기서 마스킹한다.
import fs from 'node:fs';

const [playPath, asPath] = process.argv.slice(2);
const play = JSON.parse(fs.readFileSync(playPath, 'utf8'));
const apps = JSON.parse(fs.readFileSync(asPath, 'utf8'));

const START = Date.parse('2026-06-30T15:00:00Z') / 1000; // 2026-07-01 00:00 KST
const END = Date.parse('2026-09-30T15:00:00Z') / 1000;   // 2026-10-01 00:00 KST (미포함)

export const VOC = ['버그·오류', '성능·속도', '로그인·인증', '송금·결제', 'UX·사용성', '기능 요청', '고객지원·응대', '수수료·금리', '증권·투자', '광고·리워드', '보안·사기', '칭찬·만족', '기타'];

// [정규식, 가중치]
const RULES = {
  '버그·오류': [[/오류|에러|버그|튕|강제 ?종료|먹통|멈춰|멈춤|멈추|안 ?열|열리지|하얀 ?화면|흰 ?화면|검은 ?화면|시꺼먼|작동 ?(안|불)|실행 ?(이 )?(안|불)|꺼져|꺼짐|꺼지|오작동|비정상|일시적인|무한 ?반복|안 ?됩니다|안 ?돼요|안 ?되네|안돼|안되|안 ?나와|안 ?뜨|사라|없어졌|증발|반영 ?(이 )?안/g, 2], [/업데이트 ?(가|이|도|를)? ?(안|못|되지)|강제 ?업데이트|업데이트 ?강제|설치 ?(가|중|가 )? ?(안|멈)/g, 2.5]],
  '성능·속도': [[/느려|느림|느리|렉|버벅|로딩|무거|발열|배터리|지연|오래 ?걸|답답|반응 ?속도|속도/g, 2]],
  '로그인·인증': [[/로그인|로그아웃|인증|본인 ?확인|비밀번호|비번|간편 ?비|생체|지문|얼굴|가입|탈퇴|계정|패스키|재설치|기기 ?변경|폰 ?교체|휴대폰 ?번호|문자|pin|핀번호/gi, 2], [/페이 ?스 ?페이|페이스 ?페이|얼굴 ?(인증|인식|정보|등록)/g, 3]],
  '송금·결제': [[/송금|이체|결제|환불|충전|출금|입금|잔액|정산|환전|납부|자동 ?이체|티머니|교통비|간편 ?결제|입출금|이중|중복/g, 2], [/카드|계좌|연동|머니|한도|취소|청구/g, 0.8]],
  'UX·사용성': [[/불편|복잡|메뉴|화면|디자인|UI|UX|개편|글씨|글자|찾기|버튼|홈 ?화면|탭|위치|가독|직관|개악|예전|구려|캘린더|그래프|알아보기|헷갈|눈에|너무 ?많|강압|강제로|유도|권유|꼼수/g, 1.2], [/소비|가계부|지출|내역|자산/g, 1.5]],
  '기능 요청': [[/추가 ?(해|좀|바)|있었으면|있으면 ?좋|지원 ?(해|좀)|만들어 ?(주|줘)|개선 ?(해|좀|바)|부탁|바랍니다|바랄|넣어 ?(주|줘)|해 ?주세요|해주세요|해줬으면|되면 ?좋|도입/g, 1.2]],
  '고객지원·응대': [[/고객 ?센터|상담|문의|응대|챗봇|민원|답변|담당자|전화|콜센터|1599|연락/g, 2]],
  '수수료·금리': [[/수수료|금리|이자|연체|대출|비싸|요금|유료|구독료|연회비|이율|한도 ?(가|를|조회|축소|줄)|신용 ?점수|신용점수|개인 ?신용/g, 2]],
  '광고·리워드': [[/광고|팝업|알림|푸시|스팸|마케팅|이벤트|배너|수신 ?거부|리워드|만보기|걸음|미션|출석|뽑기|복권|포인트|룰렛|쇼핑 ?(탭|홈)|쇼핑탭|당첨|럭키/g, 2]],
  '증권·투자': [[/증권|주식|호가|차트|코인|해외 ?주식|미국 ?주식|투자|매수|매도|배당|수익률|실시간 ?(시세|차트)|ETF|etf|장 ?(시작|마감)|넥스트|NXT/g, 2.5]],
  '보안·사기': [[/사기|피싱|해킹|도용|개인 ?정보|유출|보안|명의|탈취|스미싱|무단|보이스|금감원|사칭|악용/g, 3]],
};
const PRAISE = /좋아요|좋습니다|좋네|좋아|최고|편리|편해|편하|감사|만족|추천|훌륭|깔끔|굿|짱|사랑|대박|쉬워|쉽고|잘 ?(쓰|사용|이용)|유용|괜찮|good|great|best|👍/i;
const RISK = /사기|피싱|해킹|도용|개인 ?정보 ?(가)? ?유출|유출|고소|소송|신고|금감원|소비자원|언론|무단|명의|보이스|사칭|돈이 ?(빠|사라|없)|잔액 ?(이)? ?(사라|없|틀)|이중|두 ?번 ?(빠|결제|출금)|미성년/;

// 스토어 답변 문구는 작성자 닉네임을 부르며 시작한다. 공개 저장소용으로 모두 "고객님"으로 치환한다.
const scrubReply = (t, name) => { let x = (t || "").replace(/^안녕하세요[.,]? ?([^\n,.]{1,40}?) ?님[,.]?/, "안녕하세요. 고객님,"); if (name && name.trim().length >= 2) x = x.split(name.trim()).join("고객"); return x; };
const mask = (n) => { n = (n || '익명').trim(); return n.length <= 1 ? n + '*' : n[0] + '*'.repeat(Math.min(2, n.length - 1)); };
const kst = (ts) => new Date(ts * 1000).toISOString();

function classify(text, rating) {
  const t = text || '';
  const scores = {}; const kws = {};
  for (const [voc, rules] of Object.entries(RULES)) {
    for (const [re, w] of rules) {
      const m = t.match(re);
      if (m) { scores[voc] = (scores[voc] || 0) + w * Math.min(m.length, 3); kws[voc] = [...new Set([...(kws[voc] || []), ...m.map((x) => x.replace(/\s+/g, ''))])]; }
    }
  }
  const praise = PRAISE.test(t);
  let voc;
  if (rating >= 4) {
    if (scores['기능 요청'] >= 2.4 && t.length > 25) voc = '기능 요청';
    else if (scores['보안·사기'] >= 3 && /해킹|도용|피싱/.test(t)) voc = '보안·사기';
    else if (praise || !Object.keys(scores).length) voc = '칭찬·만족';
    else { const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]; voc = top[1] >= 4 ? top[0] : '칭찬·만족'; }
  } else {
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    if (entries.length) voc = entries[0][0];
    else if (rating === 3 && praise) voc = '칭찬·만족';
    else voc = '기타';
    if (voc === '기능 요청' && rating <= 2 && entries.length > 1 && entries[1][1] >= entries[0][1] - 1) voc = entries[1][0];
  }
  const kw = (kws[voc] || []).slice(0, 4);
  return { voc, keywords: kw };
}

const out = [];
for (const r of play) {
  if (r.ts < START || r.ts >= END) continue;
  const text = (r.text || '').trim();
  const c = classify(text, r.rating);
  out.push({
    id: 'P' + r.id.slice(0, 8), store: 'googleplay', rating: r.rating, author: mask(r.name), date: kst(r.ts),
    version: r.version || '', device: 'Android', text, thumbs: r.thumbs || 0,
    voc: c.voc, sentiment: r.rating >= 4 ? 'pos' : r.rating === 3 ? 'neu' : 'neg',
    severity: RISK.test(text) && r.rating <= 3 ? 'high' : r.rating <= 2 ? 'mid' : 'low', keywords: c.keywords,
    replyKnown: true,
    status: r.reply ? 'published' : 'new',
    reply: r.reply ? { text: scrubReply(r.reply.text, r.name), draftedAt: kst(r.reply.ts), approvedBy: '토스 운영팀(스토어 기존 답변)', approvedAt: kst(r.reply.ts), publishedAt: kst(r.reply.ts), source: 'store' } : null,
  });
}
for (const r of apps) {
  if (r.ts < START || r.ts >= END) continue;
  const text = [r.title, r.text].filter(Boolean).join(r.title && r.text && !r.text.startsWith(r.title) ? ' — ' : ' ').trim();
  const c = classify(text, r.rating);
  out.push({
    id: 'A' + String(r.id), store: 'appstore', rating: r.rating, author: mask(r.name), date: kst(r.ts),
    version: r.version || '', device: 'iOS', text, thumbs: r.votes || 0,
    voc: c.voc, sentiment: r.rating >= 4 ? 'pos' : r.rating === 3 ? 'neu' : 'neg',
    severity: RISK.test(text) && r.rating <= 3 ? 'high' : r.rating <= 2 ? 'mid' : 'low', keywords: c.keywords,
    replyKnown: false, status: 'new', reply: null,
  });
}
out.sort((a, b) => new Date(a.date) - new Date(b.date));

const meta = {
  app: '토스 (Toss)', period: '2026-07-01 ~ 2026-09-30 (KST)', collectedAt: new Date().toISOString(),
  sources: {
    googleplay: { id: 'viva.republica.toss', country: 'kr', lang: 'ko', coverage: '2026-07-01 ~ 2026-09-30 전체(텍스트 있는 리뷰)', count: out.filter((x) => x.store === 'googleplay').length },
    appstore: { id: '839333328', country: 'kr', coverage: '2026-08-08 ~ 2026-09-30 (공개 RSS가 최근 500건만 제공해 7월~8월 7일은 수집 불가)', count: out.filter((x) => x.store === 'appstore').length },
  },
  classifier: '키워드 규칙 1차 분류 (voc-analyzer가 재분류 제안 가능)',
};
fs.mkdirSync('data', { recursive: true });
fs.mkdirSync('docs/data', { recursive: true });
fs.writeFileSync('data/reviews.json', JSON.stringify({ meta, reviews: out }));
fs.writeFileSync('docs/data/toss-reviews.js', 'window.REVIEW_DATA=' + JSON.stringify({ meta, reviews: out }) + ';');

const by = {}; out.forEach((x) => (by[x.voc] = (by[x.voc] || 0) + 1));
console.log('total', out.length, meta.sources.googleplay.count, meta.sources.appstore.count);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' | '));
