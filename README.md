# Synesth

> AI-powered webpage mood detection with YouTube music streaming

![Version](https://img.shields.io/badge/version-2.1.0-blue)
![Platform](https://img.shields.io/badge/platform-Chrome%20Extension-green)
![Manifest](https://img.shields.io/badge/manifest-v3-orange)

Synesth는 웹페이지의 분위기를 AI로 분석하여 어울리는 음악을 자동으로 추천하고 재생하는 Chrome 확장 프로그램입니다.

---

## Features

- **AI 분위기 분석** - GPT-4o-mini가 웹페이지 콘텐츠를 분석하여 분위기 판단
- **YouTube 스트리밍** - 분위기에 맞는 음악을 YouTube에서 자동 검색 및 재생
- **다양한 분위기** - "Cyberpunk Tension", "Cozy Autumn Evening" 등 창의적인 분위기 감지
- **상태 유지** - 페이지 이동, 탭 전환 시에도 음악 재생 유지
- **드래그 가능 위젯** - 원하는 위치로 이동 가능, 위치 자동 저장
- **탭 관리** - 탭 전환 시 자동 일시정지/재개 (동시 재생 방지)

---

## Screenshots

```
┌─────────────────────────────┐
│ ⋮⋮ 🎵 Synesth         − ×  │
├─────────────────────────────┤
│ 🌧️ Melancholic Rain         │
│    Radiohead - Creep        │
├─────────────────────────────┤
│ [⏸] [⏭] 🔊 ━━━━━━━━ 80     │
│ ┌─────────────────────────┐ │
│ │                         │ │
│ │    YouTube Player       │ │
│ │                         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

## Installation

### 개발자 모드 (로컬 설치)

1. 이 저장소를 클론합니다:
   ```bash
   git clone https://github.com/yourusername/Synesth.git
   ```

2. Chrome에서 `chrome://extensions` 접속

3. 우측 상단 **개발자 모드** 활성화

4. **압축 해제된 확장 프로그램 로드** 클릭

5. `Synesth` 폴더 선택

### Chrome Web Store (예정)

> 추후 Chrome Web Store에 등록 예정

---

## Usage

1. **확장 프로그램 설치** 후 아무 웹페이지 방문

2. 우측 하단에 **Synesth 위젯** 자동 표시

3. **✨ Analyze Page** 버튼 클릭

4. AI가 페이지 분위기 분석 후 음악 자동 재생

### 위젯 컨트롤

| 버튼 | 기능 |
|------|------|
| ⏸ / ▶ | 재생 / 일시정지 |
| ⏭ | 다음 곡 (같은 분위기) |
| 🔊 | 볼륨 조절 |
| ▼ / ▲ | 비디오 표시 / 숨김 |
| − | 위젯 최소화 |
| × | 위젯 닫기 (음악 정지) |

### 수동 분위기 선택

1. 확장 프로그램 아이콘 클릭 (팝업 열기)
2. 원하는 분위기 직접 입력 또는 프리셋 선택
3. **Play** 버튼 클릭

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Chrome Extension                         │
│  ┌───────────┐  ┌───────────┐  ┌─────────────────────────┐  │
│  │ popup.html│  │ popup.js  │  │      content.js         │  │
│  └─────┬─────┘  └─────┬─────┘  └───────────┬─────────────┘  │
│        └──────────────┼────────────────────┘                 │
│                       ▼                                      │
│              ┌─────────────────┐                             │
│              │  background.js  │                             │
│              │ (Service Worker)│                             │
│              └────────┬────────┘                             │
└───────────────────────┼─────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────┐
              │  Cloudflare Worker  │ ← API Keys (Secrets)
              └──────────┬──────────┘
                         │
           ┌─────────────┼─────────────┐
           ▼                           ▼
   ┌───────────────┐         ┌─────────────────┐
   │  OpenAI API   │         │  YouTube API    │
   │ (GPT-4o-mini) │         │  (Data API v3)  │
   └───────────────┘         └─────────────────┘
```

---

## Tech Stack

| Category | Technology |
|----------|------------|
| Extension | Chrome Manifest V3 |
| Frontend | Vanilla JavaScript, CSS3 |
| Backend | Cloudflare Workers |
| AI | OpenAI GPT-4o-mini |
| Media | YouTube IFrame API |
| Storage | chrome.storage API |

---

## File Structure

```
Synesth/
├── manifest.json      # Extension configuration
├── background.js      # Service Worker (API calls)
├── content.js         # Widget & Player logic
├── popup.html         # Popup UI
├── popup.js           # Popup logic
├── styles.css         # Widget styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Configuration

### Cloudflare Worker 설정

1. [Cloudflare Workers](https://workers.cloudflare.com/) 계정 생성

2. 새 Worker 생성 후 아래 환경변수 설정:
   ```
   OPENAI_API_KEY=sk-...
   YOUTUBE_API_KEY=AIza...
   ```

3. `background.js`의 `WORKER_URL` 수정:
   ```javascript
   const WORKER_URL = 'https://your-worker.workers.dev';
   ```

---

## Permissions

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access current tab content |
| `tabs` | Listen for tab events |
| `scripting` | Inject scripts dynamically |
| `storage` | Save player state & settings |
| `<all_urls>` | Run on all webpages |

---

## Development

### 로컬 개발

```bash
# 저장소 클론
git clone https://github.com/yourusername/Synesth.git
cd Synesth

# Chrome에서 로드 후 수정사항 반영
# chrome://extensions > 새로고침 버튼 클릭
```

### 빌드 (배포용)

```bash
# ZIP 파일 생성
zip -r synesth.zip manifest.json background.js content.js \
  popup.html popup.js styles.css icons/
```

---

## Known Issues

- 일부 웹사이트에서 CSP(Content Security Policy)로 인해 위젯이 표시되지 않을 수 있음
- YouTube 임베드가 차단된 영상은 재생 불가

---

## Contributing

1. Fork this repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License - see [LICENSE](LICENSE) for details

---

## Acknowledgments

- [OpenAI](https://openai.com/) - GPT-4o-mini API
- [YouTube Data API](https://developers.google.com/youtube/v3)
- [Cloudflare Workers](https://workers.cloudflare.com/)

---

Made with ♥ by Synesth Team
