(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);

  const els = {
    joinScreen: $('#joinScreen'),
    mapScreen: $('#mapScreen'),
    joinForm: $('#joinForm'),
    nameInput: $('#nameInput'),
    groupInput: $('#groupInput'),
    diceBtn: $('#diceBtn'),
    avatarPicker: $('#avatarPicker'),
    joinError: $('#joinError'),
    joinBtn: $('#joinBtn'),
    installBtn: $('#installBtn'),
    map: $('#map'),
    groupTitle: $('#groupTitle'),
    groupAvatar: $('#groupAvatar'),
    statusDot: $('#statusDot'),
    statusLabel: $('#statusLabel'),
    inviteBtn: $('#inviteBtn'),
    leaveBtn: $('#leaveBtn'),
    chatBtn: $('#chatBtn'),
    chatUnread: $('#chatUnread'),
    chatPanel: $('#chatPanel'),
    chatBack: $('#chatBack'),
    chatSubtitle: $('#chatSubtitle'),
    chatMessages: $('#chatMessages'),
    chatEmpty: $('#chatEmpty'),
    chatFeed: $('#chatFeed'),
    chatForm: $('#chatForm'),
    chatInput: $('#chatInput'),
    chatSend: $('#chatSend'),
    chatSettingsBtn: $('#chatSettingsBtn'),
    chatSettings: $('#chatSettings'),
    chatSettingsClose: $('#chatSettingsClose'),
    optSound: $('#optSound'),
    optVibrate: $('#optVibrate'),
    optNotify: $('#optNotify'),
    notifyHint: $('#notifyHint'),
    chatClear: $('#chatClear'),
    permissionBanner: $('#permissionBanner'),
    permissionText: $('#permissionText'),
    retryGeoBtn: $('#retryGeoBtn'),
    manualBtn: $('#manualBtn'),
    locateBtn: $('#locateBtn'),
    fitBtn: $('#fitBtn'),
    micBtn: $('#micBtn'),
    voiceBar: $('#voiceBar'),
    voiceTime: $('#voiceTime'),
    voiceCancel: $('#voiceCancel'),
    voiceSend: $('#voiceSend'),
    voiceList: $('#voiceList'),
    friendList: $('#friendList'),
    friendCount: $('#friendCount'),
    toast: $('#toast'),
  };

  const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';
  const TOPIC_SALT = 'priyateli-karta-topic:';
  const KEY_PREFIX = 'priyateli:';
  const KEY_SALT = 'priyateli-karta-v1';
  const PBKDF2_ROUNDS = 120000;
  const HEARTBEAT_MS = 25000;
  const PRUNE_MS = 15000;
  const PRESENCE_TTL = 180000;
  const POS_THROTTLE_MS = 2500;
  const MAX_VOICE_MS = 12000;
  const MAX_VOICE_B64 = 400000;
  const MAX_CHAT_TEXT = 500;
  const CHAT_LIMIT = 200;
  const VOICE_MIMES = [
    'audio/webm', 'audio/webm;codecs=opus',
    'audio/ogg', 'audio/ogg;codecs=opus',
    'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav',
  ];
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

  const EMOJIS = ['🦊', '🐼', '🐯', '🦁', '🐸', '🐨', '🐙', '🦉', '🦄', '🐳', '🐰', '🐺'];
  const COLORS = [
    '#f472b6', '#f59e0b', '#38bdf8', '#a78bfa',
    '#34d399', '#fb7185', '#facc15', '#22d3ee',
    '#c084fc', '#4ade80', '#fb923c', '#e879f9',
  ];
  const GROUP_EMOJIS = ['🏔️', '🌊', '🌲', '⭐', '🔥', '🌙', '🎈', '🛶', '🏕️', '🌋', '🪐', '🧭'];
  const CODE_WORDS = [
    'ЗВЕЗДА', 'ПЛАНИНА', 'МОРЕ', 'ГОРА', 'РЕКА', 'ПЪТ',
    'ЛУНА', 'ОГЪН', 'ВЯТЪР', 'СНЯГ', 'ИСКРА', 'ВЪЛНА',
    'КОМЕТА', 'ПЕЩЕРА', 'ЗАЛИВ',
  ];

  const BANNER_TEXT = {
    denied: 'Локацията е блокирана. Разреши достъп от настройките на браузъра, за да те виждат приятелите.',
    unavailable: 'Не успяхме да намерим позицията ти. Провери GPS или маркирай позицията си ръчно на картата.',
    unsupported: 'Браузърът не поддържа локация. Маркирай позицията си ръчно на картата.',
    manual: 'Ръчен режим: докосни картата, за да маркираш къде си. Можеш да местиш позицията си с ново докосване.',
    mapfail: 'Картата не се зареди. Провери интернет връзката и презареди страницата.',
  };

  const state = {
    user: null,
    group: '',
    key: null,
    topic: '',
    client: null,
    conn: 'connecting',
    peers: new Map(),
    markers: new Map(),
    self: null,
    selfMarker: null,
    selfCircle: null,
    watchId: null,
    map: null,
    follow: true,
    manualMode: false,
    didFit: false,
    beatTimer: null,
    pruneTimer: null,
    toastTimer: null,
    lastPosAt: 0,
    lastSentPos: null,
    ingest: Promise.resolve(),
    deviceId: makeDeviceId(),
    voiceMessages: [],
    voiceRecorder: null,
    voiceStream: null,
    voiceChunks: [],
    voiceStart: 0,
    voiceTimer: null,
    voiceCanceled: false,
    micBusy: false,
    playing: null,
    chatMessages: [],
    chatSeen: new Set(),
    chatOpen: false,
    chatUnread: 0,
    chatSound: true,
    chatVibrate: true,
    chatNotify: false,
    chatAudioCtx: null,
  };

  let selectedAvatar = EMOJIS[0];
  let deferredPrompt = null;

  function makeDeviceId() {
    let id = '';
    try {
      id = localStorage.getItem('pk-device') || '';
    } catch {
      id = '';
    }
    if (!/^[a-z0-9-]{8,40}$/i.test(id)) {
      id = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      try {
        localStorage.setItem('pk-device', id);
      } catch {
        /* хранилището не е достъпно */
      }
    }
    return id;
  }

  const prefs = {
    read() {
      try {
        return JSON.parse(localStorage.getItem('pk-prefs') || '{}') || {};
      } catch {
        return {};
      }
    },
    write(value) {
      try {
        localStorage.setItem('pk-prefs', JSON.stringify(value));
      } catch {
        /* хранилището не е достъпно */
      }
    },
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function hashString(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash;
  }

  function sanitizeName(raw) {
    if (typeof raw !== 'string') return '';
    return raw
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
  }

  function normalizeCode(raw) {
    return String(raw || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .slice(0, 40);
  }

  function colorFor(seed) {
    return COLORS[hashString(seed) % COLORS.length];
  }

  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function showToast(text) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = text;
    els.toast.classList.add('show');
    state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 3000);
  }

  function showJoinError(text) {
    els.joinError.textContent = text;
    els.joinError.hidden = false;
  }

  function hideJoinError() {
    els.joinError.hidden = true;
  }

  /* ---------- Криптиране ---------- */

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  async function deriveGroupKey(code) {
    const encoder = new TextEncoder();
    const material = await crypto.subtle.importKey(
      'raw',
      encoder.encode(KEY_PREFIX + code),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode(KEY_SALT),
        iterations: PBKDF2_ROUNDS,
        hash: 'SHA-256',
      },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function deriveTopic(code) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TOPIC_SALT + code));
    return Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function seal(payload) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(payload));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, state.key, data)
    );
    const combined = new Uint8Array(iv.length + cipher.length);
    combined.set(iv, 0);
    combined.set(cipher, iv.length);
    return bytesToBase64(combined);
  }

  async function openPayload(text) {
    const combined = base64ToBytes(text);
    if (combined.length < 17) return null;
    const iv = combined.subarray(0, 12);
    const cipher = combined.subarray(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, state.key, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /* ---------- Начален екран ---------- */

  function buildAvatarPicker() {
    els.avatarPicker.innerHTML = EMOJIS.map((emoji) => {
      const selected = emoji === selectedAvatar;
      return `<button type="button" class="avatar-option" role="radio" aria-checked="${selected}" data-emoji="${emoji}" tabindex="${selected ? 0 : -1}">${emoji}</button>`;
    }).join('');
  }

  function selectAvatar(emoji) {
    if (!EMOJIS.includes(emoji)) return;
    selectedAvatar = emoji;
    for (const button of els.avatarPicker.children) {
      const on = button.dataset.emoji === emoji;
      button.setAttribute('aria-checked', String(on));
      button.tabIndex = on ? 0 : -1;
    }
  }

  function randomCode() {
    const word = CODE_WORDS[Math.floor(Math.random() * CODE_WORDS.length)];
    return `${word}-${100 + Math.floor(Math.random() * 900)}`;
  }

  async function handleJoin(event) {
    event.preventDefault();
    hideJoinError();

    const name = sanitizeName(els.nameInput.value);
    const code = normalizeCode(els.groupInput.value);

    if (name.length < 2) {
      showJoinError('Напиши име с поне 2 букви.');
      return;
    }
    if (code.replace(/[^\p{L}\p{N}]/gu, '').length < 3) {
      showJoinError('Въведи код на групата с поне 3 букви или цифри.');
      return;
    }
    if (!window.crypto || !crypto.subtle) {
      showJoinError('Браузърът не поддържа криптиране. Отвори приложението през HTTPS или localhost.');
      return;
    }

    els.joinBtn.disabled = true;
    try {
      state.key = await deriveGroupKey(code);
      state.topic = `priyateli/v1/${await deriveTopic(code)}`;
      state.group = code;
      state.user = {
        id: state.deviceId,
        name,
        avatar: selectedAvatar,
        color: colorFor(`${name}|${state.deviceId}`),
      };
      prefs.write({ name, avatar: selectedAvatar, group: code });
      startSession();
    } catch (error) {
      console.error(error);
      showJoinError('Нещо се обърка при отварянето на групата. Опитай отново.');
    } finally {
      els.joinBtn.disabled = false;
    }
  }

  /* ---------- Сесия ---------- */

  function startSession() {
    els.joinScreen.hidden = true;
    els.mapScreen.hidden = false;
    document.body.classList.add('map-open');
    document.title = `${state.group} · Приятели на картата`;
    els.groupTitle.textContent = state.group;
    els.groupAvatar.textContent = GROUP_EMOJIS[hashString(state.group) % GROUP_EMOJIS.length];
    els.chatSubtitle.textContent = `криптиран · ${state.group}`;
    els.chatPanel.hidden = true;
    closeChatSettings();
    document.body.classList.remove('chat-open');
    state.chatOpen = false;
    state.chatMessages = [];
    state.chatSeen.clear();
    state.chatUnread = 0;
    updateChatBadge();
    renderChat();
    setStatus('connecting');

    initMap();
    renderFriends();
    connect();
    startGeo();
    startTimers();

    if (location.protocol.startsWith('http')) {
      try {
        const url = new URL(location.href);
        url.searchParams.set('group', state.group);
        history.replaceState(null, '', url);
      } catch {
        /* историята не е достъпна */
      }
    }
  }

  function startTimers() {
    if (!state.beatTimer) {
      state.beatTimer = setInterval(() => {
        if (state.self) publishPosition();
        else publishBeat();
      }, HEARTBEAT_MS);
    }
    if (!state.pruneTimer) {
      state.pruneTimer = setInterval(prunePeers, PRUNE_MS);
    }
  }

  /* ---------- MQTT ---------- */

  async function connect() {
    if (typeof mqtt === 'undefined') {
      setStatus('offline');
      showToast('Връзката не се зареди. Провери интернет и презареди.');
      return;
    }

    setStatus('connecting');

    let willPayload = null;
    try {
      willPayload = await seal({ t: 'leave', id: state.user.id, n: state.user.name });
    } catch {
      willPayload = null;
    }

    const clientId = `priyateli_${state.user.id.replace(/-/g, '').slice(0, 12)}_${Math.random().toString(16).slice(2, 6)}`;
    const client = mqtt.connect(BROKER_URL, {
      clientId,
      clean: true,
      keepalive: 30,
      reconnectPeriod: 4000,
      connectTimeout: 15000,
      will: willPayload
        ? { topic: state.topic, payload: willPayload, qos: 1, retain: false }
        : undefined,
    });
    state.client = client;

    client.on('connect', () => {
      state.conn = 'live';
      setStatus('live');
      client.subscribe(state.topic, { qos: 1 }, (error) => {
        if (error) {
          console.warn('Абонаментът не мина', error);
          return;
        }
        publishJoin();
      });
    });

    client.on('reconnect', () => setStatus('connecting'));
    client.on('close', () => {
      if (state.conn !== 'offline') setStatus('connecting');
    });
    client.on('offline', () => setStatus('offline'));
    client.on('error', (error) => console.warn('MQTT', error));

    client.on('message', (topic, payload) => {
      if (topic !== state.topic) return;
      if (payload.length > 600000) return;
      enqueue(payload.toString());
    });
  }

  function publish(message, qos = 0) {
    if (!state.client || state.conn !== 'live') return;
    seal(message)
      .then((payload) => {
        state.client.publish(state.topic, payload, { qos, retain: false });
      })
      .catch(() => {});
  }

  function publishJoin() {
    if (!state.user) return;
    const message = {
      t: 'join',
      id: state.user.id,
      n: state.user.name,
      a: state.user.avatar,
      c: state.user.color,
    };
    if (state.self) {
      message.la = state.self.lat;
      message.lo = state.self.lng;
      message.ac = state.self.acc;
    }
    publish(message, 1);
  }

  function publishPosition() {
    if (!state.self || !state.user) return;
    publish({
      t: 'pos',
      id: state.user.id,
      n: state.user.name,
      a: state.user.avatar,
      c: state.user.color,
      la: state.self.lat,
      lo: state.self.lng,
      ac: state.self.acc,
      m: state.self.manual ? 1 : 0,
    }, 0);
  }

  function publishBeat() {
    if (!state.user) return;
    publish({
      t: 'beat',
      id: state.user.id,
      n: state.user.name,
      a: state.user.avatar,
      c: state.user.color,
    }, 0);
  }

  function enqueue(payload) {
    state.ingest = state.ingest
      .then(async () => {
        const message = await openPayload(payload);
        if (message && typeof message === 'object') applyMessage(message);
      })
      .catch(() => {
        /* чужд или повреден пакет — пропускаме го */
      });
  }

  function applyMessage(message) {
    const type = message.t;
    const id = typeof message.id === 'string' ? message.id.slice(0, 40) : '';
    if (!id || !state.user || id === state.user.id) return;

    if (type === 'leave') {
      if (state.peers.delete(id)) {
        removePeerMarker(id);
        renderFriends();
        const name = sanitizeName(message.n);
        showToast(name ? `${name} излезе от групата.` : 'Приятел излезе от групата.');
      }
      return;
    }

    if (type === 'voice') {
      handleIncomingVoice(message);
      return;
    }

    if (type === 'chat') {
      handleIncomingChat(message);
      return;
    }

    if (type !== 'join' && type !== 'pos' && type !== 'beat') return;

    const name = sanitizeName(message.n);
    if (!name) return;

    const avatar = EMOJIS.includes(message.a) ? message.a : '🙂';
    const color = COLORS.includes(message.c) ? message.c : colorFor(id);
    const isNew = !state.peers.has(id);
    const peer = state.peers.get(id) || {
      id,
      name,
      avatar,
      color,
      lat: null,
      lng: null,
      acc: null,
      lastSeen: Date.now(),
    };
    const hadPosition = Number.isFinite(peer.lat);

    peer.name = name;
    peer.avatar = avatar;
    peer.color = color;
    peer.lastSeen = Date.now();

    if (
      Number.isFinite(message.la)
      && Number.isFinite(message.lo)
      && Math.abs(message.la) <= 90
      && Math.abs(message.lo) <= 180
    ) {
      peer.lat = message.la;
      peer.lng = message.lo;
      peer.acc = Number.isFinite(message.ac) ? Math.min(Math.max(message.ac, 0), 5000) : null;
    }

    state.peers.set(id, peer);
    renderPeerMarker(peer);
    renderFriends();

    if (isNew && type === 'join') {
      showToast(`${name} се присъедини.`);
    }
    if (!hadPosition && Number.isFinite(peer.lat)) maybeFitPeers();
  }

  function prunePeers() {
    const now = Date.now();
    let changed = false;
    for (const [id, peer] of state.peers) {
      if (now - peer.lastSeen > PRESENCE_TTL) {
        state.peers.delete(id);
        removePeerMarker(id);
        changed = true;
      }
    }
    if (changed) renderFriends();
  }

  function setStatus(mode) {
    state.conn = mode;
    updateStatusLabel();
  }

  function updateStatusLabel() {
    const count = state.peers.size;
    els.statusDot.className = `status-dot${state.conn === 'live' ? ' live' : state.conn === 'offline' ? ' offline' : ''}`;
    if (state.conn === 'offline') {
      els.statusLabel.textContent = 'офлайн';
    } else if (state.conn === 'connecting') {
      els.statusLabel.textContent = 'свързване…';
    } else if (count === 0) {
      els.statusLabel.textContent = 'на живо · чакаме приятели';
    } else {
      els.statusLabel.textContent = `${count} ${count === 1 ? 'приятел' : 'приятели'} на линия`;
    }
  }

  /* ---------- Чат ---------- */

  function normalizeChatText(raw) {
    if (typeof raw !== 'string') return '';
    return raw
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .slice(0, MAX_CHAT_TEXT);
  }

  function formatChatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('bg-BG', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function makeChatId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const chatPrefs = {
    read() {
      try {
        return JSON.parse(localStorage.getItem('pk-chat-prefs') || '{}') || {};
      } catch {
        return {};
      }
    },
    write(value) {
      try {
        localStorage.setItem('pk-chat-prefs', JSON.stringify(value));
      } catch {
        /* хранилището не е достъпно */
      }
    },
  };

  function loadChatPrefs() {
    const saved = chatPrefs.read();
    state.chatSound = saved.sound !== false;
    state.chatVibrate = saved.vibrate !== false;
    state.chatNotify = saved.notify === true
      && typeof Notification !== 'undefined'
      && Notification.permission === 'granted';
  }

  function saveChatPrefs() {
    chatPrefs.write({
      sound: state.chatSound,
      vibrate: state.chatVibrate,
      notify: state.chatNotify,
    });
  }

  function playChatSound() {
    if (!state.chatSound) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!state.chatAudioCtx) state.chatAudioCtx = new Ctx();
      const ctx = state.chatAudioCtx;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1320, now + 0.09);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {
      /* звукът не е достъпен */
    }
  }

  function showChatNotification(name, text) {
    if (!state.chatNotify || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    const options = {
      body: text.length > 120 ? `${text.slice(0, 120)}…` : text,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: 'priyateli-chat',
      renotify: true,
      data: { url: location.href },
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((registration) => registration.showNotification(`${name} · ${state.group}`, options))
        .catch(() => {});
    } else {
      try {
        new Notification(`${name} · ${state.group}`, options);
      } catch {
        /* известията не са достъпни */
      }
    }
  }

  function renderChatSettings() {
    const unsupported = typeof Notification === 'undefined';
    els.optSound.checked = state.chatSound;
    els.optVibrate.checked = state.chatVibrate;
    els.optNotify.checked = state.chatNotify;
    els.optNotify.disabled = unsupported;
    els.notifyHint.hidden = unsupported || Notification.permission !== 'denied';
  }

  function openChatSettings() {
    if (!state.user) return;
    renderChatSettings();
    els.chatSettings.hidden = false;
  }

  function closeChatSettings() {
    els.chatSettings.hidden = true;
  }

  async function toggleChatNotify() {
    if (!els.optNotify.checked) {
      state.chatNotify = false;
      saveChatPrefs();
      renderChatSettings();
      return;
    }

    if (typeof Notification === 'undefined') {
      state.chatNotify = false;
      saveChatPrefs();
      showToast('Браузърът не поддържа известия.');
      renderChatSettings();
      return;
    }

    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await Notification.requestPermission();
      } catch {
        permission = 'denied';
      }
    }
    state.chatNotify = permission === 'granted';
    saveChatPrefs();
    showToast(state.chatNotify ? 'Известията са включени.' : 'Известията са блокирани от браузъра.');
    renderChatSettings();
  }

  function clearChatHistory() {
    if (!state.chatMessages.length) {
      showToast('Няма съобщения за изчистване.');
      return;
    }
    const ok = window.confirm('Да изчистиш ли чата на това устройство?');
    if (!ok) return;
    state.chatMessages = [];
    state.chatSeen.clear();
    state.chatUnread = 0;
    updateChatBadge();
    renderChat();
    showToast('Чатът е изчистен.');
  }

  function handleIncomingChat(message) {
    const text = normalizeChatText(message.x);
    const name = sanitizeName(message.n);
    const mid = typeof message.mid === 'string'
      ? message.mid.replace(/[^a-z0-9-]/gi, '').slice(0, 40)
      : '';
    if (!text || !name || !mid || state.chatSeen.has(mid)) return;

    state.chatSeen.add(mid);
    state.chatMessages.push({
      mid,
      name,
      avatar: EMOJIS.includes(message.a) ? message.a : '🙂',
      color: COLORS.includes(message.c) ? message.c : colorFor(message.id),
      text,
      ts: Date.now(),
      mine: false,
    });
    trimChat();

    const visible = document.visibilityState === 'visible';
    const interacting = state.chatOpen && visible;
    if (state.chatOpen) {
      renderChat();
      scrollChatToEnd();
    }
    if (!state.chatOpen) {
      state.chatUnread += 1;
      updateChatBadge();
      if (visible) {
        const preview = text.length > 48 ? `${text.slice(0, 48)}…` : text;
        showToast(`${name}: ${preview}`);
      }
    }
    if (!interacting) {
      playChatSound();
      if (state.chatVibrate && navigator.vibrate) navigator.vibrate(18);
      showChatNotification(name, text);
    }
  }

  function addOwnChat(raw) {
    if (!state.user) return false;
    const text = normalizeChatText(raw);
    if (!text) return false;

    const mid = makeChatId();
    state.chatSeen.add(mid);
    state.chatMessages.push({
      mid,
      name: state.user.name,
      avatar: state.user.avatar,
      color: state.user.color,
      text,
      ts: Date.now(),
      mine: true,
    });
    trimChat();
    if (state.chatOpen) {
      renderChat();
      scrollChatToEnd();
    }
    publish({
      t: 'chat',
      id: state.user.id,
      n: state.user.name,
      a: state.user.avatar,
      c: state.user.color,
      mid,
      x: text,
      ts: Date.now(),
    }, 1);
    return true;
  }

  function trimChat() {
    while (state.chatMessages.length > CHAT_LIMIT) state.chatMessages.shift();
  }

  function renderChat() {
    const hasMessages = state.chatMessages.length > 0;
    els.chatEmpty.hidden = hasMessages;
    els.chatFeed.innerHTML = state.chatMessages.map((entry) => {
      const name = entry.mine ? 'Ти' : entry.name;
      const avatarBg = entry.mine
        ? 'linear-gradient(135deg, #34d399, #38bdf8)'
        : `linear-gradient(135deg, ${entry.color}, ${entry.color}99)`;
      return `
        <article class="msg${entry.mine ? ' is-mine' : ''}">
          <span class="msg-avatar" style="background:${avatarBg}">${escapeHtml(entry.avatar)}</span>
          <div class="msg-body">
            <span class="msg-name">${escapeHtml(name)}</span>
            <p class="msg-bubble">${escapeHtml(entry.text)}</p>
            <span class="msg-time">${formatChatTime(entry.ts)}</span>
          </div>
        </article>`;
    }).join('');
  }

  function scrollChatToEnd() {
    requestAnimationFrame(() => {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    });
  }

  function updateChatBadge() {
    const count = state.chatUnread;
    els.chatUnread.hidden = count === 0;
    els.chatUnread.textContent = count > 9 ? '9+' : String(count);
    els.chatBtn.setAttribute('aria-label', count > 0 ? `Отвори чата, ${count} нови` : 'Отвори чата');
    els.chatBtn.title = count > 0 ? `Чат · ${count} нови` : 'Чат';
  }

  function updateChatSendState() {
    els.chatSend.disabled = !normalizeChatText(els.chatInput.value);
  }

  function openChat() {
    if (!state.user) return;
    closeChatSettings();
    state.chatOpen = true;
    state.chatUnread = 0;
    updateChatBadge();
    els.chatPanel.hidden = false;
    document.body.classList.add('chat-open');
    document.title = `Чат · ${state.group}`;
    renderChat();
    scrollChatToEnd();
    els.chatInput.value = '';
    updateChatSendState();
    if (window.matchMedia && window.matchMedia('(hover: hover)').matches) {
      els.chatInput.focus({ preventScroll: true });
    }
  }

  function closeChat() {
    closeChatSettings();
    if (!state.chatOpen) return;
    state.chatOpen = false;
    els.chatPanel.hidden = true;
    document.body.classList.remove('chat-open');
    if (state.group) document.title = `${state.group} · Приятели на картата`;
    els.chatInput.blur();
  }

  /* ---------- Карта ---------- */

  function initMap() {
    if (state.map) return;
    if (typeof L === 'undefined') {
      showBanner('mapfail');
      showToast('Картата не се зареди. Провери връзката.');
      return;
    }

    state.map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      worldCopyJump: true,
      minZoom: 3,
      maxZoom: 19,
    });
    state.map.setView([42.7, 25.5], 7);

    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      maxNativeZoom: 19,
      crossOrigin: true,
      attribution: '&copy; OpenStreetMap',
    }).addTo(state.map);

    L.control.zoom({
      position: 'bottomleft',
      zoomInTitle: 'Приближи',
      zoomOutTitle: 'Отдалечи',
    }).addTo(state.map);

    state.map.on('dragstart', () => setFollow(false));
    state.map.on('click', onMapClick);
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 80);
  }

  function makeIcon(person, isMe) {
    const color = COLORS.includes(person.color) ? person.color : COLORS[0];
    const avatar = EMOJIS.includes(person.avatar) ? person.avatar : '🙂';
    const html = `
      <div class="pin-pill" style="--pin-color:${color}">
        <span class="pin-avatar">${avatar}</span>
        <span class="pin-name">${escapeHtml(person.name)}</span>
      </div>
      <div class="pin-tip" style="--pin-color:${color}"></div>`;
    return L.divIcon({
      className: `friend-pin${isMe ? ' is-me' : ''}`,
      html,
      iconSize: null,
      iconAnchor: null,
    });
  }

  function renderSelf() {
    if (!state.map || !state.self || !state.user) return;
    const latlng = [state.self.lat, state.self.lng];

    if (!state.selfMarker) {
      state.selfMarker = L.marker(latlng, {
        icon: makeIcon(state.user, true),
        interactive: false,
        keyboard: false,
        zIndexOffset: 500,
      }).addTo(state.map);
    } else {
      state.selfMarker.setLatLng(latlng);
    }

    if (state.self.acc && state.self.acc > 25) {
      if (!state.selfCircle) {
        state.selfCircle = L.circle(latlng, {
          radius: state.self.acc,
          color: '#34d399',
          weight: 1,
          opacity: 0.5,
          fillColor: '#34d399',
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(state.map);
      } else {
        state.selfCircle.setLatLng(latlng).setRadius(state.self.acc);
      }
    } else if (state.selfCircle) {
      state.selfCircle.remove();
      state.selfCircle = null;
    }
  }

  function renderPeerMarker(peer) {
    if (!state.map || !Number.isFinite(peer.lat)) return;
    const latlng = [peer.lat, peer.lng];
    const profileKey = `${peer.name}|${peer.avatar}|${peer.color}`;
    const existing = state.markers.get(peer.id);

    if (existing) {
      existing.marker.setLatLng(latlng);
      if (existing.key !== profileKey) {
        existing.marker.setIcon(makeIcon(peer, false));
        existing.key = profileKey;
      }
      return;
    }

    const marker = L.marker(latlng, {
      icon: makeIcon(peer, false),
      keyboard: false,
      title: peer.name,
      riseOnHover: true,
    });
    marker.on('click', () => {
      setFollow(false);
      if (state.map) {
        state.map.flyTo([peer.lat, peer.lng], Math.max(state.map.getZoom(), 14), { duration: 0.8 });
      }
    });
    marker.addTo(state.map);
    state.markers.set(peer.id, { marker, key: profileKey });
  }

  function removePeerMarker(id) {
    const entry = state.markers.get(id);
    if (entry) {
      entry.marker.remove();
      state.markers.delete(id);
    }
  }

  function setFollow(on) {
    state.follow = on;
    els.locateBtn.classList.toggle('active', on);
  }

  function maybeFitPeers() {
    if (state.didFit || state.self || !state.map) return;
    const points = [...state.peers.values()].filter((peer) => Number.isFinite(peer.lat));
    if (!points.length) return;
    state.didFit = true;
    setFollow(false);
    if (points.length === 1) {
      state.map.flyTo([points[0].lat, points[0].lng], 13, { duration: 1 });
      return;
    }
    state.map.fitBounds(L.latLngBounds(points.map((peer) => [peer.lat, peer.lng])), {
      paddingTopLeft: [40, 100],
      paddingBottomRight: [40, 220],
      maxZoom: 14,
    });
  }

  function fitAll() {
    if (!state.map) return;
    const points = [];
    if (state.self) points.push([state.self.lat, state.self.lng]);
    for (const peer of state.peers.values()) {
      if (Number.isFinite(peer.lat)) points.push([peer.lat, peer.lng]);
    }
    if (!points.length) {
      showToast('Няма позиции за показване.');
      return;
    }
    if (points.length === 1) {
      state.map.flyTo(points[0], 15, { duration: 0.8 });
      return;
    }
    state.map.fitBounds(L.latLngBounds(points), {
      paddingTopLeft: [40, 110],
      paddingBottomRight: [40, 230],
      maxZoom: 16,
    });
    setFollow(false);
  }

  /* ---------- Списък с приятели ---------- */

  function distanceLabel(peer) {
    if (!Number.isFinite(peer.lat)) return 'чака позиция';
    if (!state.self) return 'на картата';
    const meters = haversine(state.self.lat, state.self.lng, peer.lat, peer.lng);
    if (meters < 1000) {
      return `${Math.max(10, Math.round(meters / 10) * 10)} м от теб`;
    }
    return `${(meters / 1000).toFixed(1)} км от теб`;
  }

  function meCard() {
    let sub = 'чака GPS';
    if (state.self) {
      if (state.self.manual) sub = 'ръчна позиция';
      else if (state.self.acc && state.self.acc > 40) sub = `точност ±${Math.round(state.self.acc)} м`;
      else sub = 'ти си тук';
    }
    return `
      <button class="friend-card is-me" type="button" data-id="me" style="--pin-color:${state.user.color}">
        <span class="me-tag">Ти</span>
        <span class="friend-avatar" style="--pin-color:${state.user.color}">${state.user.avatar}</span>
        <span class="friend-name">${escapeHtml(state.user.name)}</span>
        <span class="friend-sub">${sub}</span>
      </button>`;
  }

  function peerCard(peer) {
    return `
      <button class="friend-card" type="button" data-id="${escapeHtml(peer.id)}" style="--pin-color:${peer.color}">
        <span class="friend-avatar" style="--pin-color:${peer.color}">${peer.avatar}</span>
        <span class="friend-name">${escapeHtml(peer.name)}</span>
        <span class="friend-sub">${distanceLabel(peer)}</span>
      </button>`;
  }

  function inviteCard() {
    return `
      <button class="friend-card invite-card" type="button" data-action="invite">
        <span class="invite-icon">🔗</span>
        <span class="invite-text">Покани приятел<small>копирай връзката</small></span>
      </button>`;
  }

  function renderFriends() {
    if (!state.user) return;
    const scroll = els.friendList.scrollLeft;
    const peers = [...state.peers.values()].sort((a, b) => {
      const aHas = Number.isFinite(a.lat) ? 0 : 1;
      const bHas = Number.isFinite(b.lat) ? 0 : 1;
      return aHas - bHas || a.name.localeCompare(b.name, 'bg');
    });

    els.friendList.innerHTML = [meCard(), ...peers.map(peerCard), inviteCard()].join('');
    els.friendCount.textContent = String(peers.length + 1);
    els.friendList.scrollLeft = scroll;
    updateStatusLabel();
  }

  /* ---------- Гласови съобщения ---------- */

  function formatVoiceTime(seconds) {
    const total = Math.max(0, Math.round(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function releaseVoiceUrl(voice) {
    try {
      URL.revokeObjectURL(voice.url);
    } catch {
      /* вече е освободен */
    }
  }

  function handleIncomingVoice(message) {
    const mid = typeof message.mid === 'string'
      ? message.mid.replace(/[^a-z0-9-]/gi, '').slice(0, 40)
      : '';
    if (!mid) return;
    if (state.voiceMessages.some((entry) => entry.mid === mid)) return;

    const name = sanitizeName(message.n);
    if (!name) return;
    const mime = VOICE_MIMES.includes(message.mime) ? message.mime : 'audio/webm';
    const dur = Math.min(Math.max(Number(message.dur) || 0, 1), 15);
    const data = typeof message.d === 'string' ? message.d : '';
    if (data.length < 32 || data.length > MAX_VOICE_B64) return;

    let bytes;
    try {
      bytes = base64ToBytes(data);
    } catch {
      return;
    }

    addVoiceMessage({
      mid,
      senderId: message.id,
      name,
      avatar: EMOJIS.includes(message.a) ? message.a : '🙂',
      color: COLORS.includes(message.c) ? message.c : colorFor(message.id || mid),
      dur,
      mime,
      blob: new Blob([bytes], { type: mime }),
      mine: false,
      ts: Number(message.ts) || Date.now(),
    });
    showToast(`${name}: гласово съобщение`);
  }

  function addVoiceMessage(entry) {
    let url = '';
    try {
      url = URL.createObjectURL(entry.blob);
    } catch {
      return;
    }

    const voice = {
      ...entry,
      name: sanitizeName(entry.name) || 'Приятел',
      url,
    };
    state.voiceMessages.unshift(voice);

    while (state.voiceMessages.length > 12) {
      const removed = state.voiceMessages.pop();
      if (state.playing && state.playing.mid === removed.mid) stopPlayback();
      releaseVoiceUrl(removed);
    }

    renderVoiceList();
    updateVoiceChrome();
  }

  function renderVoiceList() {
    if (!state.voiceMessages.length) {
      els.voiceList.innerHTML = '';
      els.voiceList.hidden = true;
      return;
    }

    els.voiceList.hidden = Boolean(state.voiceRecorder);
    const scroll = els.voiceList.scrollLeft;
    els.voiceList.innerHTML = state.voiceMessages.map((voice) => {
      const playing = Boolean(state.playing && state.playing.mid === voice.mid);
      const icon = playing
        ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z"/></svg>';
      return `
        <button class="voice-chip${voice.mine ? ' is-mine' : ''}${playing ? ' is-playing' : ''}" type="button" data-mid="${escapeHtml(voice.mid)}" title="${escapeHtml(voice.name)} · ${formatVoiceTime(voice.dur)}">
          <span class="voice-play">${icon}</span>
          <span class="voice-body">
            <span class="voice-name">${escapeHtml(voice.mine ? 'Ти' : voice.name)}</span>
            <span class="voice-dur">${formatVoiceTime(voice.dur)}</span>
          </span>
        </button>`;
    }).join('');
    els.voiceList.scrollLeft = scroll;
  }

  function updateVoiceChrome() {
    const recording = Boolean(state.voiceRecorder);
    const hasMessages = state.voiceMessages.length > 0;
    els.voiceBar.hidden = !recording;
    els.voiceList.hidden = recording || !hasMessages;
    document.body.classList.toggle('has-voice', recording || hasMessages);
    els.micBtn.classList.toggle('recording', recording);
    const label = recording ? 'Спри и изпрати гласа' : 'Запиши гласово съобщение';
    els.micBtn.setAttribute('aria-label', label);
    els.micBtn.title = label;
  }

  function stopPlayback() {
    if (!state.playing) return;
    const { audio, timer } = state.playing;
    clearTimeout(timer);
    state.playing = null;
    try {
      audio.pause();
    } catch {
      /* вече е спрян */
    }
    renderVoiceList();
  }

  function finishPlayback(audio) {
    if (!state.playing || state.playing.audio !== audio) return;
    clearTimeout(state.playing.timer);
    state.playing = null;
    renderVoiceList();
  }

  function toggleVoicePlayback(mid) {
    const voice = state.voiceMessages.find((entry) => entry.mid === mid);
    if (!voice) return;

    if (state.playing && state.playing.mid === mid) {
      stopPlayback();
      return;
    }
    stopPlayback();

    const audio = new Audio(voice.url);
    // Fallback таймер, в случай че браузърът не излъчи 'ended' (напр. без аудио изход).
    const timer = setTimeout(() => {
      finishPlayback(audio);
      try {
        audio.pause();
      } catch {
        /* вече е спрян */
      }
    }, Math.max(1500, Math.round((voice.dur || 0) * 1000) + 800));
    state.playing = { mid, audio, timer };
    audio.addEventListener('ended', () => finishPlayback(audio), { once: true });
    audio.addEventListener('error', () => {
      finishPlayback(audio);
      showToast('Този глас не може да се пусне в браузъра.');
    }, { once: true });
    audio.play().catch(() => {
      finishPlayback(audio);
      showToast('Докосни отново, за да пуснеш гласа.');
    });
    renderVoiceList();
  }

  function pickVoiceMime() {
    if (!window.MediaRecorder) return '';
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return candidates.find((type) => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    }) || '';
  }

  async function toggleRecording() {
    if (state.voiceRecorder) {
      stopRecording(false);
      return;
    }
    if (state.micBusy) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      showToast('Браузърът не поддържа запис на глас.');
      return;
    }

    state.micBusy = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
        video: false,
      });
      const mime = pickVoiceMime();
      const options = { audioBitsPerSecond: 32000 };
      if (mime) options.mimeType = mime;
      const recorder = new MediaRecorder(stream, options);

      state.voiceStream = stream;
      state.voiceChunks = [];
      state.voiceCanceled = false;
      state.voiceStart = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) state.voiceChunks.push(event.data);
      };
      recorder.onstop = () => finalizeRecording();
      recorder.start(250);

      state.voiceRecorder = recorder;
      els.voiceTime.textContent = '0:00';
      updateVoiceChrome();
      clearInterval(state.voiceTimer);
      state.voiceTimer = setInterval(() => {
        if (!state.voiceRecorder) return;
        const elapsed = Date.now() - state.voiceStart;
        els.voiceTime.textContent = formatVoiceTime(elapsed / 1000);
        if (elapsed >= MAX_VOICE_MS) stopRecording(false);
      }, 200);
    } catch (error) {
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        showToast('Разреши микрофона, за да изпращаш глас.');
      } else {
        showToast('Не успяхме да стартираме записа.');
      }
    } finally {
      state.micBusy = false;
    }
  }

  function stopRecording(canceled) {
    if (!state.voiceRecorder) return;
    state.voiceCanceled = canceled;
    try {
      state.voiceRecorder.stop();
    } catch {
      state.voiceRecorder = null;
      updateVoiceChrome();
    }
  }

  async function finalizeRecording() {
    const recorder = state.voiceRecorder;
    if (!recorder) return;
    state.voiceRecorder = null;
    clearInterval(state.voiceTimer);
    state.voiceTimer = null;

    const chunks = state.voiceChunks;
    const started = state.voiceStart;
    const canceled = state.voiceCanceled;
    const stream = state.voiceStream;
    state.voiceChunks = [];
    state.voiceStream = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    updateVoiceChrome();

    if (canceled) return;

    const seconds = Math.min((Date.now() - started) / 1000, MAX_VOICE_MS / 1000);
    const mime = recorder.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm';
    const blob = new Blob(chunks, { type: mime });

    if (!blob.size || seconds < 0.7) {
      showToast('Записът е твърде кратък.');
      return;
    }
    if (blob.size > 280000) {
      showToast('Записът е твърде дълъг.');
      return;
    }

    await sendVoice(blob, seconds, mime);
  }

  async function sendVoice(blob, seconds, mime) {
    if (!state.user) return;
    const mid = `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const duration = Math.max(1, Math.round(seconds));

    addVoiceMessage({
      mid,
      senderId: state.user.id,
      name: state.user.name,
      avatar: state.user.avatar,
      color: state.user.color,
      dur: duration,
      mime,
      blob,
      mine: true,
      ts: Date.now(),
    });

    if (state.conn !== 'live') {
      showToast('Няма връзка — записът остана само при теб.');
      return;
    }

    let data = '';
    try {
      data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
    } catch {
      showToast('Записът не можа да се подготви.');
      return;
    }
    if (data.length > MAX_VOICE_B64) {
      showToast('Записът е твърде голям за изпращане.');
      return;
    }

    publish({
      t: 'voice',
      id: state.user.id,
      n: state.user.name,
      a: state.user.avatar,
      c: state.user.color,
      mid,
      dur: duration,
      mime,
      d: data,
      ts: Date.now(),
    }, 0);
  }

  function resetVoice() {
    if (state.voiceRecorder) {
      const recorder = state.voiceRecorder;
      state.voiceRecorder = null;
      state.voiceCanceled = true;
      try {
        recorder.stop();
      } catch {
        /* вече е спрян */
      }
    }
    clearInterval(state.voiceTimer);
    state.voiceTimer = null;
    state.voiceChunks = [];

    if (state.voiceStream) {
      state.voiceStream.getTracks().forEach((track) => track.stop());
      state.voiceStream = null;
    }

    stopPlayback();
    for (const voice of state.voiceMessages) releaseVoiceUrl(voice);
    state.voiceMessages = [];
    state.voiceCanceled = false;
    els.voiceList.innerHTML = '';
    els.voiceList.hidden = true;
    els.voiceBar.hidden = true;
    els.micBtn.classList.remove('recording');
    document.body.classList.remove('has-voice');
  }

  /* ---------- Геолокация ---------- */

  function startGeo() {
    stopWatch();
    if (!('geolocation' in navigator)) {
      showBanner('unsupported');
      return;
    }
    state.manualMode = false;
    els.manualBtn.textContent = 'Маркирай ръчно';
    try {
      state.watchId = navigator.geolocation.watchPosition(onGeoFix, onGeoError, {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 25000,
      });
    } catch {
      showBanner('unavailable');
    }
  }

  function stopWatch() {
    if (state.watchId !== null) {
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
  }

  function onGeoFix(position) {
    if (state.manualMode || !state.user) return;
    const first = !state.self;
    hideBanner();

    const { latitude, longitude, accuracy } = position.coords;
    updateSelf(latitude, longitude, accuracy, { force: first });

    if (first) {
      if (!state.didFit) {
        state.didFit = true;
        if (state.map) state.map.flyTo([latitude, longitude], 15, { duration: 1.1 });
        setFollow(true);
      }
    } else if (state.follow && state.map) {
      state.map.panTo([latitude, longitude], { animate: true, duration: 0.4 });
    }
  }

  function onGeoError(error) {
    if (state.manualMode) return;
    if (error && error.code === 1) showBanner('denied');
    else showBanner('unavailable');
  }

  function updateSelf(lat, lng, accuracy, options = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

    state.self = {
      lat,
      lng,
      acc: Number.isFinite(accuracy) ? Math.min(Math.max(accuracy, 0), 5000) : null,
      manual: Boolean(options.manual),
    };

    renderSelf();
    renderFriends();

    const now = Date.now();
    const last = state.lastSentPos;
    const moved = !last || haversine(last.lat, last.lng, lat, lng) > 3;
    if (options.force || (now - state.lastPosAt > POS_THROTTLE_MS && moved)) {
      state.lastPosAt = now;
      state.lastSentPos = { lat, lng };
      publishPosition();
    }
  }

  function showBanner(kind) {
    els.permissionText.textContent = BANNER_TEXT[kind] || BANNER_TEXT.unavailable;
    els.permissionBanner.hidden = false;
    els.retryGeoBtn.hidden = kind === 'manual' || kind === 'unsupported' || kind === 'mapfail';
    els.manualBtn.hidden = kind === 'mapfail';
    els.manualBtn.textContent = kind === 'manual' ? 'Използвай GPS' : 'Маркирай ръчно';
  }

  function hideBanner() {
    els.permissionBanner.hidden = true;
  }

  function onMapClick(event) {
    if (!state.manualMode) return;
    updateSelf(event.latlng.lat, event.latlng.lng, null, { force: true, manual: true });
    setFollow(false);
    showBanner('manual');
  }

  function toggleManual() {
    if (!state.map) return;
    if (state.manualMode) {
      state.manualMode = false;
      hideBanner();
      startGeo();
      showToast('Отново търсим GPS позицията ти.');
      return;
    }
    state.manualMode = true;
    stopWatch();
    showBanner('manual');
    setFollow(false);
    showToast('Докосни картата, за да маркираш позицията си.');
  }

  function locateMe() {
    if (!state.map) return;
    if (!state.self) {
      showToast('Още няма позиция. Провери GPS или маркирай ръчно.');
      if (!state.manualMode) showBanner('unavailable');
      return;
    }
    setFollow(true);
    state.map.flyTo([state.self.lat, state.self.lng], Math.max(state.map.getZoom(), 15), { duration: 0.9 });
  }

  /* ---------- Покана и излизане ---------- */

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    showToast(ok ? 'Поканата е копирана.' : 'Копирай кода ръчно: ' + state.group);
  }

  async function copyInvite() {
    if (!state.group) return;
    const isFile = location.protocol === 'file:';
    let text = state.group;
    if (!isFile) {
      const url = new URL(location.href);
      url.search = '';
      url.hash = '';
      url.searchParams.set('group', state.group);
      text = url.toString();
    }
    if (!isFile && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        showToast('Поканата е копирана. Изпрати я на приятели.');
        return;
      } catch {
        /* падаме към резервния начин */
      }
    }
    fallbackCopy(text);
  }

  function leaveGroup() {
    const ok = window.confirm('Да излезеш ли от групата? Приятелите ще спрат да виждат позицията ти.');
    if (!ok) return;

    const client = state.client;
    if (client && state.user) {
      seal({ t: 'leave', id: state.user.id, n: state.user.name })
        .then((payload) => {
          try {
            client.publish(state.topic, payload, { qos: 1, retain: false });
          } catch {
            /* връзката вече е затворена */
          }
        })
        .catch(() => {})
        .finally(() => {
          setTimeout(() => {
            try {
              client.end(true);
            } catch {
              /* вече е затворен */
            }
          }, 350);
        });
    }

    teardownSession();
    showJoinScreen();
    showToast('Излезе от групата.');
  }

  function teardownSession() {
    stopWatch();
    resetVoice();
    closeChat();
    state.chatMessages = [];
    state.chatSeen.clear();
    state.chatUnread = 0;
    els.chatFeed.innerHTML = '';
    els.chatEmpty.hidden = false;
    updateChatBadge();
    clearInterval(state.beatTimer);
    clearInterval(state.pruneTimer);
    clearTimeout(state.toastTimer);
    state.beatTimer = null;
    state.pruneTimer = null;

    if (state.map) {
      state.map.remove();
      state.map = null;
    }

    state.client = null;
    state.markers.clear();
    state.peers.clear();
    state.self = null;
    state.selfMarker = null;
    state.selfCircle = null;
    state.user = null;
    state.key = null;
    state.topic = '';
    state.group = '';
    state.conn = 'connecting';
    state.follow = true;
    state.manualMode = false;
    state.didFit = false;
    state.lastPosAt = 0;
    state.lastSentPos = null;
    state.ingest = Promise.resolve();
    els.friendList.innerHTML = '';
    hideBanner();
    document.body.classList.remove('map-open');
  }

  function showJoinScreen() {
    els.mapScreen.hidden = true;
    els.joinScreen.hidden = false;
    document.title = 'Приятели на картата · на живо';
    const saved = prefs.read();
    els.nameInput.value = sanitizeName(saved.name) || '';
    els.groupInput.value = normalizeCode(saved.group) || '';
    selectedAvatar = EMOJIS.includes(saved.avatar) ? saved.avatar : selectedAvatar;
    buildAvatarPicker();
    if (location.protocol.startsWith('http')) {
      try {
        const url = new URL(location.href);
        url.searchParams.delete('group');
        history.replaceState(null, '', url);
      } catch {
        /* историята не е достъпна */
      }
    }
  }

  /* ---------- PWA ---------- */

  function setupPwa() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;
      els.installBtn.hidden = false;
    });

    els.installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try {
        await deferredPrompt.userChoice;
      } catch {
        /* потребителят затвори диалога */
      }
      deferredPrompt = null;
      els.installBtn.hidden = true;
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      els.installBtn.hidden = true;
      showToast('Приложението е инсталирано.');
    });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch((error) => console.warn('Service worker', error));
      });
    }
  }

  /* ---------- Събития ---------- */

  function bindEvents() {
    els.joinForm.addEventListener('submit', handleJoin);
    els.nameInput.addEventListener('input', hideJoinError);
    els.groupInput.addEventListener('input', hideJoinError);

    els.diceBtn.addEventListener('click', () => {
      els.groupInput.value = randomCode();
      els.groupInput.focus();
      hideJoinError();
    });

    els.avatarPicker.addEventListener('click', (event) => {
      const button = event.target.closest('.avatar-option');
      if (button) selectAvatar(button.dataset.emoji);
    });

    els.avatarPicker.addEventListener('keydown', (event) => {
      const keys = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
      if (!keys.includes(event.key)) return;
      event.preventDefault();
      const index = EMOJIS.indexOf(selectedAvatar);
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? EMOJIS.length - 1
          : (index + (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) + EMOJIS.length) % EMOJIS.length;
      selectAvatar(EMOJIS[next]);
      const button = els.avatarPicker.querySelector(`[data-emoji="${EMOJIS[next]}"]`);
      if (button) button.focus();
    });

    els.inviteBtn.addEventListener('click', copyInvite);
    els.leaveBtn.addEventListener('click', leaveGroup);
    els.chatBtn.addEventListener('click', openChat);
    els.chatBack.addEventListener('click', closeChat);
    els.chatInput.addEventListener('input', updateChatSendState);
    els.chatForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (addOwnChat(els.chatInput.value)) {
        els.chatInput.value = '';
        updateChatSendState();
      }
    });
    els.chatSettingsBtn.addEventListener('click', openChatSettings);
    els.chatSettingsClose.addEventListener('click', closeChatSettings);
    els.chatSettings.addEventListener('click', (event) => {
      if (event.target.closest('[data-close-settings]')) closeChatSettings();
    });
    els.optSound.addEventListener('change', () => {
      state.chatSound = els.optSound.checked;
      saveChatPrefs();
      if (state.chatSound) playChatSound();
    });
    els.optVibrate.addEventListener('change', () => {
      state.chatVibrate = els.optVibrate.checked;
      saveChatPrefs();
      if (state.chatVibrate && navigator.vibrate) navigator.vibrate(18);
    });
    els.optNotify.addEventListener('change', toggleChatNotify);
    els.chatClear.addEventListener('click', clearChatHistory);
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!els.chatSettings.hidden) {
        closeChatSettings();
        return;
      }
      if (state.chatOpen) closeChat();
    });
    els.retryGeoBtn.addEventListener('click', startGeo);
    els.manualBtn.addEventListener('click', toggleManual);
    els.locateBtn.addEventListener('click', locateMe);
    els.fitBtn.addEventListener('click', fitAll);

    els.micBtn.addEventListener('click', toggleRecording);
    els.voiceSend.addEventListener('click', () => stopRecording(false));
    els.voiceCancel.addEventListener('click', () => stopRecording(true));
    els.voiceList.addEventListener('click', (event) => {
      const chip = event.target.closest('.voice-chip');
      if (chip) toggleVoicePlayback(chip.dataset.mid);
    });

    els.friendList.addEventListener('click', (event) => {
      const card = event.target.closest('.friend-card');
      if (!card) return;
      if (card.dataset.action === 'invite') {
        copyInvite();
        return;
      }
      const id = card.dataset.id;
      if (id === 'me') {
        locateMe();
        return;
      }
      const peer = state.peers.get(id);
      if (peer && Number.isFinite(peer.lat) && state.map) {
        setFollow(false);
        state.map.flyTo([peer.lat, peer.lng], Math.max(state.map.getZoom(), 14), { duration: 0.8 });
      } else {
        showToast('Приятелят още не е споделил позиция.');
      }
    });

    window.addEventListener('online', () => {
      showToast('Отново на линия.');
      if (state.client) setStatus('connecting');
    });

    window.addEventListener('offline', () => {
      setStatus('offline');
      showToast('Няма интернет. Изчакваме връзка…');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !state.user) return;
      if (state.map) state.map.invalidateSize();
      if (state.conn === 'live') {
        publishJoin();
        if (state.self) publishPosition();
      }
    });

    window.addEventListener('pagehide', () => {
      if (state.client) {
        try {
          state.client.end(true);
        } catch {
          /* вече е затворен */
        }
      }
    });
  }

  function boot() {
    const params = new URLSearchParams(location.search);
    const fromLink = normalizeCode(params.get('group'));
    const saved = prefs.read();

    els.nameInput.value = sanitizeName(saved.name) || '';
    els.groupInput.value = fromLink || normalizeCode(saved.group) || '';
    selectedAvatar = EMOJIS.includes(saved.avatar) ? saved.avatar : EMOJIS[Math.floor(Math.random() * EMOJIS.length)];

    buildAvatarPicker();
    loadChatPrefs();
    bindEvents();
    setupPwa();

    if (!window.crypto || !crypto.subtle) {
      showJoinError('Отвори приложението през HTTPS или localhost, за да работят криптирането и картата.');
    }
  }

  boot();
})();
