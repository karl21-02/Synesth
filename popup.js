// Synesth Popup Script
// Handles popup UI interactions and settings

(function () {
  'use strict';

  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const nowPlayingContent = document.getElementById('nowPlayingContent');
  const manualMoodForm = document.getElementById('manualMoodForm');
  const moodInput = document.getElementById('moodInput');
  const moodSubmitBtn = document.getElementById('moodSubmitBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const moodChips = document.querySelectorAll('.mood-chip');

  // Load settings
  async function loadSettings() {
    try {
      const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
      if (settings) {
        volumeSlider.value = settings.volume || 80;
        volumeValue.textContent = `${settings.volume || 80}%`;
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }

  // Save settings
  async function saveSettings() {
    const settings = {
      volume: parseInt(volumeSlider.value)
    };
    try {
      await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  // Load now playing
  async function loadNowPlaying() {
    try {
      const nowPlaying = await chrome.runtime.sendMessage({ type: 'GET_NOW_PLAYING' });

      if (nowPlaying && nowPlaying.mood) {
        const isRecent = Date.now() - nowPlaying.timestamp < 60 * 60 * 1000; // 1 hour

        if (isRecent) {
          statusDot.classList.remove('inactive');
          statusText.textContent = 'Playing';
          statusText.style.color = '#4caf50';

          nowPlayingContent.innerHTML = `
            <div class="now-playing-emoji">${nowPlaying.emoji || '🎵'}</div>
            <div class="now-playing-mood">${nowPlaying.mood}</div>
            <div class="now-playing-song">${nowPlaying.song.artist} - ${nowPlaying.song.title}</div>
          `;
          return;
        }
      }

      setInactive();
    } catch (e) {
      setInactive();
    }
  }

  function setInactive() {
    statusDot.classList.add('inactive');
    statusText.textContent = 'Not playing';
    statusText.style.color = '#666';
    nowPlayingContent.innerHTML = `
      <div class="now-playing-empty">
        Click "Analyze Page" on any webpage
      </div>
    `;
  }

  // Submit manual mood
  async function submitManualMood(mood) {
    if (!mood.trim()) return;

    moodSubmitBtn.disabled = true;
    moodSubmitBtn.textContent = '...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab');

      const result = await chrome.runtime.sendMessage({
        type: 'MANUAL_MOOD',
        mood: mood.trim()
      });

      if (result.error) throw new Error(result.error);

      await chrome.tabs.sendMessage(tab.id, {
        type: 'APPLY_MOOD',
        result: result
      });

      // Update UI
      statusDot.classList.remove('inactive');
      statusText.textContent = 'Playing';
      statusText.style.color = '#4caf50';

      nowPlayingContent.innerHTML = `
        <div class="now-playing-emoji">${result.emoji || '🎵'}</div>
        <div class="now-playing-mood">${result.mood}</div>
        <div class="now-playing-song">${result.song.artist} - ${result.song.title}</div>
      `;

      moodInput.value = '';

    } catch (e) {
      console.error('Failed to submit mood:', e);
      alert('Failed to apply mood. Make sure you are on a webpage.');
    } finally {
      moodSubmitBtn.disabled = false;
      moodSubmitBtn.textContent = 'Play';
    }
  }

  // Event Listeners
  manualMoodForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitManualMood(moodInput.value);
  });

  moodChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const mood = chip.dataset.mood;
      moodInput.value = mood;
      submitManualMood(mood);
    });
  });

  volumeSlider.addEventListener('input', () => {
    volumeValue.textContent = `${volumeSlider.value}%`;
  });

  volumeSlider.addEventListener('change', saveSettings);

  // Initialize
  loadSettings();
  loadNowPlaying();
  setInterval(loadNowPlaying, 5000);
})();
