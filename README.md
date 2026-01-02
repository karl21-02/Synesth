<div align="center">

# 🎧 Synesth

### Every page has a soundtrack. Let AI find it for you.

[![Version](https://img.shields.io/badge/version-2.1.0-667eea?style=for-the-badge)](https://github.com/yourusername/Synesth/releases)
[![Chrome](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chrome.google.com)
[![Manifest](https://img.shields.io/badge/Manifest-V3-FF6B6B?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/)
[![OpenAI](https://img.shields.io/badge/Powered%20by-GPT--4o-412991?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com)

<br />

**Synesth** analyzes the mood of any webpage using AI and automatically plays the perfect matching music from YouTube.

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Architecture](#-architecture) • [Contributing](#-contributing)

<br />

</div>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🧠 AI Mood Detection
GPT-4o-mini analyzes webpage content and detects nuanced moods like *"Cyberpunk Tension"*, *"Cozy Autumn Evening"*, or *"Melancholic Rain"*

</td>
<td width="50%">

### 🎵 Smart Music Matching
Automatically searches YouTube for the perfect soundtrack based on detected mood — from indie to classical, jazz to electronic

</td>
</tr>
<tr>
<td width="50%">

### 🔄 Seamless Persistence
Music keeps playing across page navigation and tab switches. Your listening session never stops.

</td>
<td width="50%">

### 🎛️ Floating Widget
Draggable player widget with full controls — play, pause, skip, volume. Position saved automatically.

</td>
</tr>
</table>

---

## 📦 Installation

### Option 1: Developer Mode (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/Synesth.git

# 2. Open Chrome and navigate to
chrome://extensions

# 3. Enable "Developer mode" (top right)

# 4. Click "Load unpacked" and select the Synesth folder
```

### Option 2: Chrome Web Store

> 🚧 Coming Soon

---

## 🚀 Usage

<table>
<tr>
<td width="60%">

### Quick Start

1. Visit any webpage
2. Click **✨ Analyze Page** on the widget
3. AI detects the mood and music starts playing
4. Enjoy the perfect soundtrack!

### Manual Mood Selection

Click the extension icon → Enter any mood → Click **Play**

</td>
<td width="40%">

### Widget Controls

| Button | Action |
|:------:|--------|
| ⏸ / ▶ | Play / Pause |
| ⏭ | Next track |
| 🔊 | Volume slider |
| ▼ / ▲ | Show / Hide video |
| − | Minimize |
| × | Close & stop |

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
                              ┌─────────────────────────────────────┐
                              │         Chrome Extension            │
                              │                                     │
   ┌────────────┐             │  ┌─────────┐      ┌─────────────┐  │
   │  Webpage   │ ◄───────────┼──│ content │      │   popup     │  │
   │            │             │  │   .js   │      │  .html/.js  │  │
   └────────────┘             │  └────┬────┘      └──────┬──────┘  │
                              │       │                  │         │
                              │       └────────┬─────────┘         │
                              │                ▼                   │
                              │       ┌─────────────────┐          │
                              │       │  background.js  │          │
                              │       │ (Service Worker)│          │
                              │       └────────┬────────┘          │
                              └────────────────┼───────────────────┘
                                               │
                                               ▼
                              ┌─────────────────────────────────────┐
                              │        Cloudflare Worker            │
                              │     (API Proxy + Key Storage)       │
                              └────────────────┬────────────────────┘
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         ▼                                           ▼
              ┌─────────────────────┐                 ┌─────────────────────┐
              │    OpenAI API       │                 │   YouTube API       │
              │   (GPT-4o-mini)     │                 │   (Data API v3)     │
              └─────────────────────┘                 └─────────────────────┘
```

---

## 🛠️ Tech Stack

<div align="center">

| Layer | Technology |
|:-----:|:-----------|
| 🧩 **Extension** | Chrome Manifest V3 |
| 🎨 **Frontend** | Vanilla JS, CSS3, CSS Variables |
| ☁️ **Backend** | Cloudflare Workers (Edge) |
| 🤖 **AI** | OpenAI GPT-4o-mini |
| 🎬 **Media** | YouTube IFrame API |
| 💾 **Storage** | chrome.storage (local + sync) |

</div>

---

## 📁 Project Structure

```
Synesth/
├── 📄 manifest.json       # Extension configuration
├── 🔧 background.js       # Service worker — API calls, state management
├── 🎨 content.js          # Widget UI, YouTube player, text extraction
├── 🖼️ popup.html          # Extension popup UI
├── ⚡ popup.js            # Popup interactions
├── 🎭 styles.css          # Widget & toast styles
└── 📂 icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## ⚙️ Configuration

### Cloudflare Worker Setup

1. Create account at [Cloudflare Workers](https://workers.cloudflare.com/)

2. Create new Worker and add secrets:
   ```env
   OPENAI_API_KEY=sk-...
   YOUTUBE_API_KEY=AIza...
   ```

3. Update `background.js`:
   ```javascript
   const WORKER_URL = 'https://your-worker.workers.dev';
   ```

---

## 🔐 Permissions

| Permission | Why it's needed |
|------------|-----------------|
| `activeTab` | Read current page content for analysis |
| `tabs` | Detect page navigation & tab switches |
| `scripting` | Inject widget into webpages |
| `storage` | Save player state, settings, widget position |
| `<all_urls>` | Work on any website |

---

## 🤝 Contributing

Contributions are welcome! Here's how:

```bash
# Fork & clone
git clone https://github.com/YOUR_USERNAME/Synesth.git

# Create feature branch
git checkout -b feature/awesome-feature

# Make changes & commit
git commit -m "Add awesome feature"

# Push & create PR
git push origin feature/awesome-feature
```

---

## 📝 License

This project is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

---

<div align="center">

### 🙏 Acknowledgments

Built with [OpenAI](https://openai.com) • [YouTube API](https://developers.google.com/youtube) • [Cloudflare Workers](https://workers.cloudflare.com)

<br />

---

<sub>Made with ♥ by the Synesth Team</sub>

</div>
