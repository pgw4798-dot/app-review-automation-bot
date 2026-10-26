// 유사 리뷰 검색 기반 답변 초안의 오프라인 평가 (홀드아웃)
// 사용: node scripts/eval-retrieval.mjs
// 아이디어: 토스 답변이 있는 Google Play 리뷰를 80/20으로 나눠, 20%의 리뷰에 대해 80%에서 비슷한 리뷰를 찾아
// 그 리뷰의 실제 토스 답변을 초안으로 삼고, 실제 답변과의 문자 3-gram 유사도(코사인)를 비교한다.
import fs from 'node:fs';
const { reviews } = JSON.parse(fs.readFileSync('data/reviews.json', 'utf8'));
const rows = reviews.filter((r) => r.reply && r.reply.source === 'store');

const grams = (t, n = 2) => { const s = (t || '').replace(/\s+/g, ' ').toLowerCase(); const m = new Map(); for (let i = 0; i < s.length - n + 1; i++) { const g = s.slice(i, i + n); m.set(g, (m.get(g) || 0) + 1); } return m; };
function buildIndex(docs) {
  const df = new Map(); const vecs = docs.map((d) => grams(d.text));
  vecs.forEach((v) => v.forEach((_, g) => df.set(g, (df.get(g) || 0) + 1)));
  const N = docs.length; const idf = (g) => Math.log(1 + N / (1 + (df.get(g) || 0)));
  const norm = (v) => { let s = 0; const w = new Map(); v.forEach((c, g) => { const x = (1 + Math.log(c)) * idf(g); w.set(g, x); s += x * x; }); return { w, n: Math.sqrt(s) || 1 }; };
  return { docs, vecs: vecs.map(norm), idf, norm, grams };
}
const cos = (a, b) => { let s = 0; const [x, y] = a.w.size < b.w.size ? [a, b] : [b, a]; x.w.forEach((v, g) => { const o = y.w.get(g); if (o) s += v * o; }); return s / (a.n * b.n); };
const bucket = (r) => (r <= 2 ? 0 : r === 3 ? 1 : 2);

// 재현성을 위해 id 해시로 분할
const h = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const test = rows.filter((r) => h(r.id) % 5 === 0), train = rows.filter((r) => h(r.id) % 5 !== 0);
const idx = buildIndex(train);
const replyIdx = buildIndex(train.map((r) => ({ text: r.reply.text })));
const rv = (t) => replyIdx.norm(replyIdx.grams(t));

function draft(r, k = 5) {
  const q = idx.norm(idx.grams(r.text));
  const sc = idx.docs.map((d, i) => ({ d, s: cos(q, idx.vecs[i]) * (bucket(d.rating) === bucket(r.rating) ? 1 : 0.8) })).sort((a, b) => b.s - a.s).slice(0, k);
  // 상위 k개 답변 중 서로 가장 비슷한(합의) 답변을 선택, 유사도 가중
  let best = null, bs = -1;
  sc.forEach((a, i) => { const va = rv(a.d.reply.text); let t = a.s; sc.forEach((b, j) => { if (i !== j) t += b.s * cos(va, rv(b.d.reply.text)); }); if (t > bs) { bs = t; best = a; } });
  return { text: best.d.reply.text, top1: sc[0].s, top1reply: sc[0].d.reply.text };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const res = { consensus: [], top1: [], random: [], template: [] };
const rnd = (() => { let s = 42; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; })();
for (const r of test) {
  const truth = rv(r.reply.text);
  const d = draft(r); res.consensus.push(cos(truth, rv(d.text))); res.top1.push(cos(truth, rv(d.top1reply)));
  res.random.push(cos(truth, rv(train[Math.floor(rnd() * train.length)].reply.text)));
  // 같은 평점 구간의 랜덤 답변(약한 기준선)
  const same = train.filter((t) => bucket(t.rating) === bucket(r.rating)); res.template.push(cos(truth, rv(same[Math.floor(rnd() * same.length)].reply.text)));
}
console.log('train', train.length, 'test', test.length);
for (const k of Object.keys(res)) console.log(k.padEnd(10), '평균 유사도', mean(res[k]).toFixed(3), '| 0.5 이상 비율', (res[k].filter((x) => x >= 0.5).length / res[k].length * 100).toFixed(0) + '%');
// 신뢰도(top1 유사도)별 품질
const buckets = [[0, .2], [.2, .3], [.3, .45], [.45, 1.01]];
const rec = test.map((r) => { const d = draft(r); return { s: d.top1, q: cos(rv(r.reply.text), rv(d.text)) }; });
for (const [a, b] of buckets) { const x = rec.filter((y) => y.s >= a && y.s < b); if (x.length) console.log(`유사도 ${a}~${b}`, 'n=' + x.length, '답변 일치도', mean(x.map((y) => y.q)).toFixed(3)); }
