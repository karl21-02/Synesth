// Synesth Content Script
// Persistent widget with analyze button, plays music across page navigation

(function () {
  'use strict';

  // Prevent multiple initializations
  if (window.synesthInitialized) return;
  window.synesthInitialized = true;

  const MAX_TEXT_LENGTH = 2000;

  // Check if extension context is still valid
  function isExtensionContextValid() {
    try {
      return chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // Cleanup function when extension context is invalidated
  function cleanup() {
    if (playbackSaveInterval) {
      clearInterval(playbackSaveInterval);
      playbackSaveInterval = null;
    }
    window.removeEventListener('message', handleYouTubeMessage);
    window.removeEventListener('beforeunload', saveOnUnload);
    document.removeEventListener('visibilitychange', saveOnVisibilityChange);
  }

  let widgetContainer = null;
  let playerContainer = null;
  let currentMood = null;
  let currentEmoji = null;
  let currentSong = null;
  let currentVideoId = null;
  let isPlaying = false;
  let currentVolume = 80;
  let isAnalyzing = false;
  let currentPlaybackTime = 0;
  let playbackSaveInterval = null;

  // Generate color from string (HSL hash algorithm)
  function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    const saturation = 60 + (Math.abs(hash) % 20);
    const lightness = 45 + (Math.abs(hash) % 15);
    return {
      hue,
      primary: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      dark: `hsl(${hue}, ${saturation}%, ${Math.max(15, lightness - 30)}%)`,
      glow: `hsla(${hue}, ${saturation}%, ${lightness}%, 0.5)`
    };
  }

  // Enhanced text extraction for better AI analysis
  function extractText() {
    const parts = [];

    // 1. Page title (high priority)
    if (document.title) {
      parts.push(`[Title] ${document.title}`);
    }

    // 2. Meta description
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc?.content) {
      parts.push(`[Description] ${metaDesc.content}`);
    }

    // 3. OG tags
    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogTitle?.content) parts.push(`[OG Title] ${ogTitle.content}`);
    if (ogDesc?.content) parts.push(`[OG Description] ${ogDesc.content}`);

    // 4. Main headings (h1, h2)
    const headings = document.querySelectorAll('h1, h2');
    const headingTexts = Array.from(headings).slice(0, 5).map(h => h.innerText?.trim()).filter(Boolean);
    if (headingTexts.length) {
      parts.push(`[Headings] ${headingTexts.join(' | ')}`);
    }

    // 5. Article/main content
    const mainContent = document.querySelector('article, main, [role="main"], .content, .post, .article');
    if (mainContent) {
      const text = mainContent.innerText?.replace(/\s+/g, ' ').trim().substring(0, 1000);
      if (text) parts.push(`[Main Content] ${text}`);
    }

    // 6. Body text (fallback)
    if (parts.length < 3) {
      const bodyText = document.body.innerText?.replace(/\s+/g, ' ').trim().substring(0, 800);
      if (bodyText) parts.push(`[Body] ${bodyText}`);
    }

    // 7. Keywords from meta
    const keywords = document.querySelector('meta[name="keywords"]');
    if (keywords?.content) {
      parts.push(`[Keywords] ${keywords.content}`);
    }

    return parts.join('\n\n').substring(0, MAX_TEXT_LENGTH);
  }

  // Load settings
  async function loadSettings() {
    try {
      const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (settings?.volume !== undefined) {
        currentVolume = settings.volume;
      }
      return settings;
    } catch (e) {
      return { volume: 80 };
    }
  }

  // Load saved player state (persists across navigation)
  async function loadPlayerState() {
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_PLAYER_STATE' });
      if (state && state.videoId) {
        currentMood = state.mood;
        currentEmoji = state.emoji;
        currentSong = state.song;
        currentVideoId = state.videoId;
        return state;
      }
    } catch (e) {
      console.error('Synesth: Failed to load state', e);
    }
    return null;
  }

  // Save player state (including playback time)
  async function savePlayerState() {
    if (!currentVideoId) return;
    if (!isExtensionContextValid()) {
      cleanup();
      return;
    }
    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_PLAYER_STATE',
        state: {
          mood: currentMood,
          emoji: currentEmoji,
          song: currentSong,
          videoId: currentVideoId,
          playbackTime: currentPlaybackTime
        }
      });
    } catch (e) {
      if (e.message?.includes('Extension context invalidated')) {
        cleanup();
      }
    }
  }

  // Save state on page unload
  function saveOnUnload() {
    if (!currentVideoId || !isExtensionContextValid()) return;
    // Use sendMessage synchronously (best effort)
    try {
      chrome.runtime.sendMessage({
        type: 'SAVE_PLAYER_STATE',
        state: {
          mood: currentMood,
          emoji: currentEmoji,
          song: currentSong,
          videoId: currentVideoId,
          playbackTime: currentPlaybackTime
        }
      });
    } catch (e) {}
  }

  // Handle tab visibility change (pause when hidden, resume when visible)
  function saveOnVisibilityChange() {
    if (!widgetContainer) return;
    const iframe = widgetContainer.querySelector('iframe');

    if (document.visibilityState === 'hidden') {
      // Tab is now hidden - pause video and save state
      if (iframe?.contentWindow && isPlaying) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      }
      if (currentVideoId) {
        savePlayerState();
      }
    } else if (document.visibilityState === 'visible') {
      // Tab is now visible - resume video if it was playing
      if (iframe?.contentWindow && isPlaying) {
        iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
      }
    }
  }

  // Save widget position
  async function saveWidgetPosition(left, bottom) {
    try {
      await chrome.storage.local.set({ widgetPosition: { left, bottom } });
    } catch (e) {
      console.error('Synesth: Failed to save widget position', e);
    }
  }

  // Load widget position
  async function loadWidgetPosition() {
    try {
      const result = await chrome.storage.local.get(['widgetPosition']);
      return result.widgetPosition || null;
    } catch (e) {
      return null;
    }
  }

  // Make element draggable
  function makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, startLeft, startBottom;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.tagName === 'INPUT') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = element.getBoundingClientRect();
      startLeft = rect.left;
      startBottom = window.innerHeight - rect.bottom;

      element.style.transition = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newLeft = startLeft + deltaX;
      let newBottom = startBottom - deltaY;

      const rect = element.getBoundingClientRect();
      newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - rect.width));
      newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - rect.height));

      element.style.left = newLeft + 'px';
      element.style.right = 'auto';
      element.style.bottom = newBottom + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        element.style.transition = '';
        // Save widget position
        const rect = element.getBoundingClientRect();
        const left = rect.left;
        const bottom = window.innerHeight - rect.bottom;
        saveWidgetPosition(left, bottom);
      }
    });
  }

  // Create the always-visible widget
  function createWidget(savedPosition = null) {
    if (widgetContainer) return;

    widgetContainer = document.createElement('div');
    widgetContainer.className = 'synesth-widget';

    // Apply saved position if exists
    if (savedPosition) {
      widgetContainer.style.left = savedPosition.left + 'px';
      widgetContainer.style.right = 'auto';
      widgetContainer.style.bottom = savedPosition.bottom + 'px';
    }
    widgetContainer.innerHTML = `
      <div class="synesth-widget-header">
        <span class="synesth-widget-drag">⋮⋮</span>
        <span class="synesth-widget-logo">🎵 Synesth</span>
        <button class="synesth-widget-minimize" title="Minimize">−</button>
        <button class="synesth-widget-close" title="Close">×</button>
      </div>
      <div class="synesth-widget-body">
        <div class="synesth-widget-status" id="synesthStatus">
          <div class="synesth-status-idle">
            <span class="synesth-status-icon">🔍</span>
            <span>Ready to analyze</span>
          </div>
        </div>
        <button class="synesth-analyze-btn" id="synesthAnalyzeBtn">
          <span class="synesth-analyze-icon">✨</span>
          <span>Analyze Page</span>
        </button>
      </div>
      <div class="synesth-widget-player" id="synesthPlayer" style="display: none;"></div>
    `;

    document.body.appendChild(widgetContainer);

    // Event listeners
    const header = widgetContainer.querySelector('.synesth-widget-header');
    const minimizeBtn = widgetContainer.querySelector('.synesth-widget-minimize');
    const closeBtn = widgetContainer.querySelector('.synesth-widget-close');
    const analyzeBtn = widgetContainer.querySelector('#synesthAnalyzeBtn');

    makeDraggable(widgetContainer, header);

    minimizeBtn.addEventListener('click', () => {
      widgetContainer.classList.toggle('minimized');
      minimizeBtn.textContent = widgetContainer.classList.contains('minimized') ? '+' : '−';
    });

    closeBtn.addEventListener('click', async () => {
      // Stop playback interval and remove event listeners
      cleanup();
      // Stop YouTube video
      const iframe = widgetContainer.querySelector('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
      }
      // Clear player state
      if (isExtensionContextValid()) {
        try {
          await chrome.runtime.sendMessage({ type: 'CLEAR_PLAYER_STATE' });
        } catch (e) {}
      }
      // Reset variables
      currentMood = null;
      currentEmoji = null;
      currentSong = null;
      currentVideoId = null;
      isPlaying = false;
      currentPlaybackTime = 0;
      // Remove widget
      widgetContainer.remove();
      widgetContainer = null;
      window.synesthInitialized = false;
    });

    analyzeBtn.addEventListener('click', () => {
      if (!isAnalyzing) {
        analyzePage();
      }
    });
  }

  // Update widget status
  function updateStatus(status, message, emoji = '🔍') {
    const statusEl = document.getElementById('synesthStatus');
    if (!statusEl) return;

    if (status === 'analyzing') {
      statusEl.innerHTML = `
        <div class="synesth-status-analyzing">
          <span class="synesth-status-spinner"></span>
          <span>${message}</span>
        </div>
      `;
    } else if (status === 'playing') {
      statusEl.innerHTML = `
        <div class="synesth-status-playing">
          <span class="synesth-status-icon">${emoji}</span>
          <div class="synesth-status-info">
            <div class="synesth-status-mood">${message}</div>
            <div class="synesth-status-song">${currentSong?.artist} - ${currentSong?.title}</div>
          </div>
        </div>
      `;
    } else {
      statusEl.innerHTML = `
        <div class="synesth-status-idle">
          <span class="synesth-status-icon">${emoji}</span>
          <span>${message}</span>
        </div>
      `;
    }
  }

  // Create/update player section
  function createPlayer(videoId, startTime = 0) {
    const playerEl = document.getElementById('synesthPlayer');
    if (!playerEl) return;

    // Clear previous interval if exists
    if (playbackSaveInterval) {
      clearInterval(playbackSaveInterval);
      playbackSaveInterval = null;
    }

    const colors = stringToColor(currentMood);
    widgetContainer.style.setProperty('--mood-primary', colors.primary);
    widgetContainer.style.setProperty('--mood-dark', colors.dark);
    widgetContainer.style.setProperty('--mood-glow', colors.glow);

    // Use start parameter for playback position
    const startParam = startTime > 0 ? `&start=${Math.floor(startTime)}` : '';
    currentPlaybackTime = startTime;

    playerEl.style.display = 'block';
    playerEl.innerHTML = `
      <div class="synesth-player-controls">
        <button class="synesth-ctrl-btn synesth-play-pause" title="Play/Pause">⏸</button>
        <button class="synesth-ctrl-btn synesth-next-btn" title="Next Song">⏭</button>
        <div class="synesth-volume-wrap">
          <span>🔊</span>
          <input type="range" class="synesth-volume" min="0" max="100" value="${currentVolume}">
          <span class="synesth-vol-val">${currentVolume}</span>
        </div>
        <button class="synesth-ctrl-btn synesth-expand-btn" title="Show/Hide Video">▼</button>
      </div>
      <div class="synesth-iframe-wrap">
        <iframe
          src="https://www.youtube.com/embed/${videoId}?autoplay=1&enablejsapi=1&loop=1&playlist=${videoId}${startParam}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    `;

    isPlaying = true;

    // Track playback time locally (saved on page unload/tab switch)
    playbackSaveInterval = setInterval(() => {
      if (isPlaying) {
        currentPlaybackTime += 1;
      }
    }, 1000);

    // Event listeners
    const playPauseBtn = playerEl.querySelector('.synesth-play-pause');
    const nextBtn = playerEl.querySelector('.synesth-next-btn');
    const volumeSlider = playerEl.querySelector('.synesth-volume');
    const volVal = playerEl.querySelector('.synesth-vol-val');
    const expandBtn = playerEl.querySelector('.synesth-expand-btn');
    const iframeWrap = playerEl.querySelector('.synesth-iframe-wrap');

    playPauseBtn.addEventListener('click', () => {
      const iframe = playerEl.querySelector('iframe');
      if (!iframe?.contentWindow) return;
      if (isPlaying) {
        iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        playPauseBtn.textContent = '▶';
      } else {
        iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        playPauseBtn.textContent = '⏸';
      }
      isPlaying = !isPlaying;
    });

    nextBtn.addEventListener('click', requestNextSong);

    volumeSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value);
      volVal.textContent = vol;
      currentVolume = vol;
      const iframe = playerEl.querySelector('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(`{"event":"command","func":"setVolume","args":[${vol}]}`, '*');
      }
    });

    expandBtn.addEventListener('click', () => {
      iframeWrap.classList.toggle('collapsed');
      expandBtn.textContent = iframeWrap.classList.contains('collapsed') ? '▲' : '▼';
    });

    // Set initial volume
    setTimeout(() => {
      const iframe = playerEl.querySelector('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(`{"event":"command","func":"setVolume","args":[${currentVolume}]}`, '*');
      }
    }, 1500);

    // Listen for video end to auto-play next
    window.addEventListener('message', handleYouTubeMessage);
  }

  // Handle YouTube iframe API messages
  function handleYouTubeMessage(event) {
    if (event.origin !== 'https://www.youtube.com') return;
    try {
      const data = JSON.parse(event.data);
      // YouTube sends state changes: 0 = ended, 1 = playing, 2 = paused
      if (data.event === 'onStateChange' && data.info === 0) {
        // Video ended, play next song
        requestNextSong();
      }
    } catch (e) {
      // Not a JSON message, ignore
    }
  }

  // Request next song
  async function requestNextSong() {
    const nextBtn = document.querySelector('.synesth-next-btn');
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.textContent = '...';
    }

    try {
      // Check extension context first
      if (!isExtensionContextValid()) {
        updateStatus('idle', 'Extension reloaded. Please refresh.', '🔄');
        cleanup();
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'NEXT_SONG',
        currentMood: currentMood
      });

      if (response.error) {
        console.error('Synesth:', response.error);
        updateStatus('playing', currentMood + ' (retry needed)', currentEmoji);
        return;
      }

      if (response.videoId) {
        currentSong = response.song;
        currentVideoId = response.videoId;
        currentEmoji = response.emoji;
        currentPlaybackTime = 0; // Reset for new song

        updateStatus('playing', currentMood, currentEmoji);
        createPlayer(response.videoId);
        await savePlayerState();
      }
    } catch (error) {
      if (error.message?.includes('Extension context invalidated')) {
        updateStatus('idle', 'Extension reloaded. Please refresh.', '🔄');
        cleanup();
      }
      console.error('Synesth: Failed to get next song', error);
    } finally {
      if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = '⏭';
      }
    }
  }

  // Analyze page and get music
  async function analyzePage() {
    if (isAnalyzing) return;
    isAnalyzing = true;

    const analyzeBtn = document.getElementById('synesthAnalyzeBtn');
    if (analyzeBtn) {
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = '<span class="synesth-analyze-spinner"></span><span>Analyzing...</span>';
    }

    updateStatus('analyzing', 'Analyzing page mood...');

    try {
      // Check extension context first
      if (!isExtensionContextValid()) {
        updateStatus('idle', 'Extension reloaded. Please refresh.', '🔄');
        cleanup();
        return;
      }

      const text = extractText();
      if (text.length < 30) {
        updateStatus('idle', 'Not enough content to analyze', '❌');
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'ANALYZE_MOOD',
        text: text,
        url: window.location.href
      });

      if (response.error) {
        // Show more specific error messages
        let errorMsg = 'Analysis failed';
        if (response.error.includes('API')) {
          errorMsg = 'API error. Try again later.';
        } else if (response.error.includes('YouTube')) {
          errorMsg = 'Could not find song';
        }
        updateStatus('idle', errorMsg, '❌');
        console.error('Synesth:', response.error);
        return;
      }

      if (response.mood && response.videoId) {
        currentMood = response.mood;
        currentEmoji = response.emoji || '🎵';
        currentSong = response.song;
        currentVideoId = response.videoId;

        updateStatus('playing', currentMood, currentEmoji);
        createPlayer(response.videoId);
        await savePlayerState();

        // Show toast
        showToast();
      } else {
        updateStatus('idle', 'No results. Try another page.', '❌');
      }
    } catch (error) {
      // Handle specific errors
      if (error.message?.includes('Extension context invalidated')) {
        updateStatus('idle', 'Extension reloaded. Please refresh.', '🔄');
        cleanup();
      } else {
        updateStatus('idle', 'Connection error. Try again.', '❌');
      }
      console.error('Synesth: Failed to analyze', error);
    } finally {
      isAnalyzing = false;
      if (analyzeBtn) {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = '<span class="synesth-analyze-icon">✨</span><span>Analyze Page</span>';
      }
    }
  }

  // Show toast notification
  function showToast() {
    const existingToast = document.querySelector('.synesth-toast');
    if (existingToast) existingToast.remove();

    const colors = stringToColor(currentMood);
    const toast = document.createElement('div');
    toast.className = 'synesth-toast';
    toast.style.cssText = `background: linear-gradient(135deg, ${colors.dark}, ${colors.primary});`;
    toast.innerHTML = `
      <div class="synesth-toast-mood">${currentEmoji} ${currentMood}</div>
      <div class="synesth-toast-song">${currentSong.artist} - ${currentSong.title}</div>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'APPLY_MOOD') {
      currentMood = message.result.mood;
      currentEmoji = message.result.emoji || '🎵';
      currentSong = message.result.song;
      currentVideoId = message.result.videoId;

      updateStatus('playing', currentMood, currentEmoji);
      createPlayer(currentVideoId);
      savePlayerState();
      showToast();

      sendResponse({ success: true });
    }
    return true;
  });

  // Initialize
  async function init() {
    await loadSettings();

    // Load and apply widget position
    const savedPosition = await loadWidgetPosition();
    createWidget(savedPosition);

    // Restore player state if exists
    const savedState = await loadPlayerState();
    if (savedState && savedState.videoId) {
      currentMood = savedState.mood;
      currentEmoji = savedState.emoji;
      currentSong = savedState.song;
      currentVideoId = savedState.videoId;

      updateStatus('playing', savedState.mood, savedState.emoji);
      createPlayer(savedState.videoId, savedState.playbackTime || 0);
    }

    // Add event listeners for saving state on page unload/tab switch
    window.addEventListener('beforeunload', saveOnUnload);
    document.addEventListener('visibilitychange', saveOnVisibilityChange);
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
