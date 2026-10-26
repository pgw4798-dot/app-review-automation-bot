# 앱 리뷰 자동화 봇 (토스 2026.07~09 실데이터)

CS 담당자가 매일 앱 리뷰를 확인·답변하고, 주/월 단위 VoC를 제품팀에 전달하기 위한 오케스트레이션형 서브에이전트 + 웹 콘솔.

## 구조
```
.claude/agents/
  review-orchestrator.md  # 총괄 (claude --agent review-orchestrator 로 메인 세션 실행)
  review-collector.md     # 통합 수신함: 수집·정규화·1차 VoC 분류
  reply-drafter.md        # AI 답변 초안 (승인·게시 불가)
  reply-publisher.md      # 승인된 답변만 게시 (스토어 연동 보류 중)
  voc-analyzer.md         # 주/월 VoC 분석·제품팀 리포트
docs/index.html           # CS 콘솔 단일 파일 (GitHub Pages 배포 대상)
docs/data/toss-reviews.js # 콘솔이 읽는 데이터 (window.REVIEW_DATA)
data/reviews.json         # 같은 데이터의 원본 JSON
scripts/build-dataset.mjs # 원본 수집 결과 -> 통합 스키마 + 1차 VoC 분류
scripts/eval-retrieval.mjs # 유사 사례 기반 답변 초안의 오프라인 평가(홀드아웃)
```

## 데이터 (토스, 2026-07-01 ~ 2026-09-30 KST)
| 스토어 | 건수 | 범위 | 비고 |
|---|---|---|---|
| Google Play (`viva.republica.toss`) | 1,347 | 7/1~9/30 전체(텍스트 있는 리뷰) | 토스 운영팀의 실제 답변 1,210건 포함 |
| App Store (`id839333328`) | 330 | 8/8~9/30 | 공개 RSS가 최근 500건만 제공해 7월~8월 7일은 수집 불가, 답변 이력 없음 |

- 작성자 이름은 첫 글자만 남기고 마스킹했고, 스토어 답변 속 "OOO 님" 호칭은 "고객님"으로 치환했습니다.
- VoC 13종 분류(`scripts/build-dataset.mjs`)는 키워드 규칙 1차 분류입니다. 실제 운영에서는 `voc-analyzer`가 재분류를 제안합니다.
- 수집 방법: Google Play는 Play 웹의 리뷰 목록 호출(2초 간격, 페이지당 200건), App Store는 `itunes.apple.com/kr/rss/customerreviews` 공개 RSS.
- 원본(작성자 닉네임 포함)은 저장소에 두지 않습니다. 재생성: `node scripts/build-dataset.mjs raw_play.json raw_appstore.json`

## 사용
- 에이전트: 프로젝트 루트에서 `claude --agent review-orchestrator` 실행 후 "오늘 리뷰 확인해줘" / "지난달 VoC 정리해줘".
- 웹 콘솔: `docs/`를 정적 호스팅(GitHub Pages: Settings > Pages > main /docs)으로 열면 됩니다. 로컬은 `cd docs && python3 -m http.server`.
- 게시: 스토어 API 연동은 보류 중입니다. 콘솔에서 승인 → 답변 복사 → 스토어 콘솔에 직접 게시 → "게시 완료로 표시".
- 초안·승인 기록은 브라우저 localStorage에만 저장됩니다(팀 공유 없음).

## 답변 초안: 실제 토스 답변 기반
- 모델 학습이 아니라 **사례 검색**입니다. 토스 운영팀이 Google Play에 남긴 실제 답변 1,210건을 색인하고, 새 리뷰와 가장 비슷한 사례 8건 중 서로 가장 일치하는 답변을 초안으로 고릅니다. 화면에는 근거 사례 3건(리뷰와 토스 답변)과 유사도가 함께 표시되고, 다른 사례의 답변으로 바꿀 수 있습니다.
- 오프라인 검증(`node scripts/eval-retrieval.mjs`, 학습 958건 / 검증 252건, k=8): 실제 답변과의 평균 유사도 0.54, 무작위 답변 0.31. 토스 답변이 정형 문구 위주라 유사도가 높게 나오는 면이 있고, 상황에 맞는지는 담당자가 승인 전에 확인해야 합니다.

## 디자인
- Anthropic 공식 `frontend-design` 스킬의 지침(방향 정하기, 기본값 피하기, 절제)을 따라 작성했습니다. Pretendard, 흰 바탕과 파란 액션 색, 큰 시트와 가는 구분선 구조입니다.
