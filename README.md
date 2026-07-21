# Lamsturn Website

Lamsturn(프리미엄 한국 그릴·스모커 브랜드) 다국어 마케팅 사이트. 정적 파일이며 빌드 과정이 없습니다.

## 로컬에서 보기

`file://` 로 직접 열면 지도·이미지 로딩이 막히므로 **로컬 서버로** 실행하세요.

```bash
npx serve .                 # 출력된 http://localhost:… 주소 열기
# 또는
python3 -m http.server 8000 # http://localhost:8000/
```

`index.html` 하나가 전체 사이트입니다.

## 폴더 구조

```
index.html          사이트 본체 (마크업 + 로직 + 5개 언어 번역이 모두 이 안에 있음)
support.js          렌더링 런타임 — 수정 금지
image-slot.js       아직 사진이 안 들어간 자리(드롭존) 표시용
assets/
  photos/           실제 사진 (현재 12장 채워짐)
  lamsturn-ci*.svg  로고
CLAUDE.md           Claude Code용 프로젝트 안내서 (구조·수정 방법 상세)
```

## 협업 방법 (다른 작업자 · Claude Code 사용)

1. 저장소를 `git clone` 합니다.
2. 작업 브랜치를 만듭니다: `git checkout -b my-change`
3. 프로젝트 폴더에서 **Claude Code** 를 실행하면 `CLAUDE.md` 를 자동으로 읽고 구조를 파악합니다.
   - 문구/번역 수정: `index.html` 안의 `T`(사이트 카피)·`DT`(제품 상세) 객체에서 5개 언어(`EN/ES/ZH/FR/JA`) 키를 함께 수정
   - 사진 추가: 파일을 `assets/photos/` 에 넣고 해당 자리의 드롭존을 `<img>` 로 교체 (자세한 방법은 `CLAUDE.md`)
   - 구조/레이아웃 변경: `<x-dc>` 템플릿(인라인 스타일만 사용) 수정
4. `git commit` → `git push` → Pull Request 로 공유·리뷰합니다.

## 배포

빌드 없이 정적 호스팅하면 됩니다 (루트가 사이트 루트, 진입점 `index.html`).

- **GitHub Pages:** Settings → Pages → Deploy from branch → `main` / `/root`
- **Cloudflare Pages / Netlify / Vercel:** framework preset = None, build command 없음, output = `/`

## 남은 작업

- 문의 폼이 아직 프런트엔드 전용 — 백엔드(Formspree/이메일) 연결 필요
- 선택: PDF 카탈로그 다운로드, 파비콘/OG 메타 태그
- About 연혁 연도(2016/2020/2024)는 추정치 — 브랜드 확인 필요
