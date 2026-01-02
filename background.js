// Background Service Worker for Synesth
// Handles OpenAI mood analysis + song recommendation and YouTube search

// Cloudflare Worker Proxy URL (API keys stored securely in Cloudflare)
const WORKER_URL = 'https://lingering-flower-f6a6.manuna530.workers.dev';

// Enhanced system prompt for better mood detection and diverse songs
const SYSTEM_PROMPT = `You are an expert mood analyzer and music curator. Analyze the given webpage content and:

1. **Mood Detection**: Determine the overall mood/atmosphere. Be creative and specific!
   - Consider: emotional tone, subject matter, writing style, imagery described
   - Go beyond basic emotions - use nuanced descriptors like:
     "Bittersweet Nostalgia", "Cozy Autumn Evening", "Cyberpunk Tension", "Whimsical Adventure",
     "Melancholic Rain", "Epic Triumph", "Dreamy Sunset", "Dark Mystery", "Euphoric Energy",
     "Peaceful Meditation", "Romantic Longing", "Playful Mischief", "Intense Focus", "Serene Nature",
     "Urban Night", "Vintage Warmth", "Ethereal Wonder", "Gritty Determination", "Tropical Paradise"

2. **Emoji Selection**: Choose a single emoji that perfectly captures this mood

3. **Song Recommendation**: Recommend a song that PERFECTLY matches this mood
   - Be DIVERSE - don't always pick the same artists or genres
   - Consider: indie, electronic, classical, jazz, world music, ambient, rock, pop, R&B, lo-fi
   - Match the energy level, tempo, and emotional depth
   - Pick songs from different decades and cultures
   - Avoid mainstream overplayed songs - find hidden gems when appropriate

Return ONLY valid JSON: {"mood": "specific_mood_name", "emoji": "🎵", "song": {"title": "song title", "artist": "artist name"}}`;

// Prompt variations for more diverse recommendations
const RECOMMENDATION_PROMPTS = [
  'Recommend an unexpected but perfect song for the mood "{mood}". Surprise me with something unique.',
  'Find a hidden gem song that captures the essence of "{mood}". Avoid obvious choices.',
  'What song from any genre or era perfectly embodies "{mood}"? Be creative.',
  'Recommend a song for "{mood}" that most people might not know but would love.',
  'Find a song that creates the perfect atmosphere for "{mood}". Consider world music, indie, or classical.',
];

// Default settings
const DEFAULT_SETTINGS = {
  autoplay: true,
  volume: 80,
  extensionActive: true
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(['settings']);
  if (!existing.settings) {
    await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
  }
  // Clear any old player state
  await chrome.storage.local.set({
    playerState: null,
    playedSongs: [],
    nowPlaying: null
  });
});

// Inject content script on tab navigation (so widget appears without refresh)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only inject when page load is complete and it's a valid URL
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    }).catch(() => {}); // Ignore errors for restricted pages

    chrome.scripting.insertCSS({
      target: { tabId },
      files: ['styles.css']
    }).catch(() => {});
  }
});

// Inject content script when switching tabs (so widget appears on already-loaded tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
      chrome.scripting.executeScript({
        target: { tabId: activeInfo.tabId },
        files: ['content.js']
      }).catch(() => {});

      chrome.scripting.insertCSS({
        target: { tabId: activeInfo.tabId },
        files: ['styles.css']
      }).catch(() => {});
    }
  } catch (e) {
    // Tab might not exist anymore
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(message, sender) {
  switch (message.type) {
    case 'ANALYZE_MOOD':
      return handleAnalyzeMood(message.text, message.url, sender.tab?.id);

    case 'MANUAL_MOOD':
      return handleManualMood(message.mood, sender.tab?.id);

    case 'NEXT_SONG':
      return handleNextSong(message.currentMood, sender.tab?.id);

    case 'GET_SETTINGS':
      const { settings } = await chrome.storage.sync.get(['settings']);
      return settings || DEFAULT_SETTINGS;

    case 'SAVE_SETTINGS':
      await chrome.storage.sync.set({ settings: message.settings });
      return { success: true };

    case 'GET_PLAYER_STATE':
      const { playerState } = await chrome.storage.local.get(['playerState']);
      return playerState || null;

    case 'SAVE_PLAYER_STATE':
      await chrome.storage.local.set({ playerState: message.state });
      // Also update nowPlaying
      if (message.state) {
        await chrome.storage.local.set({
          nowPlaying: {
            mood: message.state.mood,
            emoji: message.state.emoji,
            song: message.state.song,
            videoId: message.state.videoId,
            timestamp: Date.now()
          }
        });
      }
      return { success: true };

    case 'CLEAR_PLAYER_STATE':
      await chrome.storage.local.set({ playerState: null, nowPlaying: null });
      return { success: true };

    case 'GET_NOW_PLAYING':
      const { nowPlaying } = await chrome.storage.local.get(['nowPlaying']);
      return nowPlaying || null;

    default:
      throw new Error('Unknown message type');
  }
}

async function handleAnalyzeMood(text, url, tabId) {
  // Analyze mood and get song recommendation from OpenAI
  const moodResult = await analyzeMoodWithOpenAI(text, url);

  // Search YouTube for the recommended song
  const videoId = await searchYouTube(moodResult.song.title, moodResult.song.artist);

  // Track played song
  await addToPlayedSongs(moodResult.song);

  const result = {
    mood: moodResult.mood,
    emoji: moodResult.emoji,
    song: moodResult.song,
    videoId: videoId
  };

  // Save player state
  await chrome.storage.local.set({
    playerState: result,
    nowPlaying: { ...result, tabId, timestamp: Date.now() }
  });

  return result;
}

async function handleManualMood(moodInput, tabId) {
  const moodResult = await getRecommendationForMood(moodInput);
  const videoId = await searchYouTube(moodResult.song.title, moodResult.song.artist);

  await addToPlayedSongs(moodResult.song);

  const result = {
    mood: moodResult.mood,
    emoji: moodResult.emoji,
    song: moodResult.song,
    videoId: videoId
  };

  await chrome.storage.local.set({
    playerState: result,
    nowPlaying: { ...result, tabId, timestamp: Date.now() }
  });

  return result;
}

async function handleNextSong(currentMood, tabId) {
  // Get played songs to avoid repeats
  const { playedSongs } = await chrome.storage.local.get(['playedSongs']);
  const recentSongs = (playedSongs || []).slice(-10).map(s => `${s.artist} - ${s.title}`);

  const moodResult = await getRecommendationForMood(currentMood, true, recentSongs);
  const videoId = await searchYouTube(moodResult.song.title, moodResult.song.artist);

  await addToPlayedSongs(moodResult.song);

  const result = {
    mood: moodResult.mood,
    emoji: moodResult.emoji,
    song: moodResult.song,
    videoId: videoId
  };

  await chrome.storage.local.set({
    playerState: result,
    nowPlaying: { ...result, tabId, timestamp: Date.now() }
  });

  return result;
}

async function addToPlayedSongs(song) {
  const { playedSongs } = await chrome.storage.local.get(['playedSongs']);
  const songs = playedSongs || [];
  songs.push({ artist: song.artist, title: song.title, timestamp: Date.now() });
  // Keep only last 50 songs
  await chrome.storage.local.set({ playedSongs: songs.slice(-50) });
}

// Helper to clean markdown code blocks from AI response
function cleanJsonResponse(content) {
  let jsonContent = content.trim();
  // Remove markdown code blocks if present
  if (jsonContent.startsWith('```')) {
    jsonContent = jsonContent.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }
  return jsonContent;
}

async function getRecommendationForMood(mood, different = false, avoidSongs = []) {
  // Pick a random prompt variation
  const promptTemplate = RECOMMENDATION_PROMPTS[Math.floor(Math.random() * RECOMMENDATION_PROMPTS.length)];
  let prompt = promptTemplate.replace('{mood}', mood);

  if (avoidSongs.length > 0) {
    prompt += `\n\nIMPORTANT: Do NOT recommend these songs (already played): ${avoidSongs.join(', ')}`;
  }

  const response = await fetch(`${WORKER_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a creative music curator. Given a mood, recommend a perfect song.
Be DIVERSE and CREATIVE. Consider all genres, eras, and cultures.
Return ONLY valid JSON: {"mood": "the_mood", "emoji": "fitting_emoji", "song": {"title": "song title", "artist": "artist name"}}`
        },
        { role: 'user', content: prompt }
      ],
      max_tokens: 150,
      temperature: 1.0 // High temperature for diversity
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from OpenAI');

  return JSON.parse(cleanJsonResponse(content));
}

async function analyzeMoodWithOpenAI(text, url) {
  // Add URL context for better analysis
  let contextPrefix = '';
  if (url) {
    try {
      const urlObj = new URL(url);
      contextPrefix = `Website: ${urlObj.hostname}\nURL Path: ${urlObj.pathname}\n\n`;
    } catch (e) {}
  }

  const response = await fetch(`${WORKER_URL}/api/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: contextPrefix + text }
      ],
      max_tokens: 200,
      temperature: 0.8 // Slightly higher for creative mood detection
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response from OpenAI');

  const parsed = JSON.parse(cleanJsonResponse(content));

  if (!parsed.mood || !parsed.song?.title || !parsed.song?.artist) {
    throw new Error('Invalid AI response format');
  }

  parsed.emoji = parsed.emoji || '🎵';
  return parsed;
}

async function searchYouTube(title, artist) {
  // Try multiple search strategies for better results
  const queries = [
    `${artist} ${title} official audio`,
    `${artist} ${title} official`,
    `${artist} ${title}`
  ];

  for (const query of queries) {
    try {
      const url = `${WORKER_URL}/api/search?q=${encodeURIComponent(query)}&maxResults=1`;
      const response = await fetch(url);

      if (!response.ok) continue;

      const data = await response.json();
      if (data.items?.length > 0) {
        return data.items[0].id.videoId;
      }
    } catch (e) {
      continue;
    }
  }

  throw new Error('No YouTube video found');
}
