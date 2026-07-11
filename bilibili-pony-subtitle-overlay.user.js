// ==UserScript==
// @name         小马英语字幕｜B站番剧外挂 SRT
// @namespace    https://github.com/Tuu0617/pony-subtitle-overlay
// @version      3.0.0
// @description  给 B 站番剧加载本地英文 SRT；保留弹幕，支持整季导入、自动匹配、字号/位置/时间偏移调节
// @match        https://www.bilibili.com/bangumi/play/ep*
// @match        https://www.bilibili.com/bangumi/play/ss*
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  const SETTINGS_KEY = 'bilibili-custom-srt-settings-v3';
  const DB_NAME = 'bilibili-custom-srt-library';
  const DB_VERSION = 1;
  const STORE_NAME = 'subtitles';

  const defaultSettings = {
    fontSize: 18,
    bottomMargin: 18,
    timeOffset: 0,
    visible: true
  };

  let settings = loadSettings();

  let video = null;
  let player = null;
  let subtitleBox = null;

  let subtitles = [];
  let currentFileName = '';
  let currentSubtitleKey = '';
  let lastSubtitleIndex = -2;
  let lastDetectedEpisodeKey = '';

  let singleFileInput = null;
  let seasonFileInput = null;

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { ...defaultSettings, ...saved };
    } catch {
      return { ...defaultSettings };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function showToast(message, duration = 1800) {
    document.querySelector('#custom-srt-toast')?.remove();

    const toast = document.createElement('div');
    toast.id = 'custom-srt-toast';
    toast.textContent = message;

    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      top: '80px',
      transform: 'translateX(-50%)',
      zIndex: '99999999',
      maxWidth: '80vw',
      padding: '9px 16px',
      borderRadius: '8px',
      color: '#fff',
      background: 'rgba(0, 0, 0, 0.78)',
      fontSize: '14px',
      lineHeight: '1.4',
      textAlign: 'center',
      pointerEvents: 'none'
    });

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }

  // ---------- IndexedDB 字幕库 ----------

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function putSubtitleRecord(record) {
    const db = await openDatabase();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    db.close();
  }

  async function getSubtitleRecord(key) {
    const db = await openDatabase();

    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return result;
  }

  async function getAllSubtitleRecords() {
    const db = await openDatabase();

    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    db.close();
    return result;
  }

  async function clearSubtitleLibrary() {
    const db = await openDatabase();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    db.close();

    subtitles = [];
    currentFileName = '';
    currentSubtitleKey = '';
    lastSubtitleIndex = -2;

    if (subtitleBox) {
      subtitleBox.textContent = '';
    }

    showToast('整季字幕库已清空');
  }

  // ---------- 文件选择 ----------

  function createFileInputs() {
    if (!singleFileInput) {
      singleFileInput = document.createElement('input');
      singleFileInput.type = 'file';
      singleFileInput.accept = '.srt';
      singleFileInput.style.display = 'none';

      singleFileInput.addEventListener('change', async event => {
        const file = event.target.files?.[0];

        if (file) {
          try {
            const content = await file.text();
            loadSubtitleContent(content, file.name, '');
            showToast(`已临时加载 ${file.name}，共 ${subtitles.length} 条字幕`);
          } catch (error) {
            console.error(error);
            showToast('字幕读取失败');
          }
        }

        singleFileInput.value = '';
      });

      document.body.appendChild(singleFileInput);
    }

    if (!seasonFileInput) {
      seasonFileInput = document.createElement('input');
      seasonFileInput.type = 'file';
      seasonFileInput.accept = '.srt';
      seasonFileInput.multiple = true;
      seasonFileInput.style.display = 'none';

      seasonFileInput.addEventListener('change', async event => {
        const files = [...(event.target.files || [])];

        if (files.length > 0) {
          await importSeasonFiles(files);
        }

        seasonFileInput.value = '';
      });

      document.body.appendChild(seasonFileInput);
    }
  }

  /*
   * Chrome 不允许 GM 菜单回调直接打开文件选择器。
   * 因此油猴菜单只唤出一个临时小面板，再由用户亲手点击按钮。
   */
  function showTemporaryFilePanel(mode) {
    createFileInputs();
    document.querySelector('#custom-srt-file-panel')?.remove();

    const panel = document.createElement('div');
    panel.id = 'custom-srt-file-panel';

    Object.assign(panel.style, {
      position: 'fixed',
      top: '90px',
      right: '24px',
      zIndex: '99999999',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px',
      borderRadius: '10px',
      background: 'rgba(20, 20, 20, 0.92)',
      boxShadow: '0 4px 18px rgba(0, 0, 0, 0.35)'
    });

    const chooseButton = document.createElement('button');
    chooseButton.textContent =
      mode === 'season' ? '选择整季 SRT（可多选）' : '选择单集 SRT';

    Object.assign(chooseButton.style, {
      padding: '8px 14px',
      border: 'none',
      borderRadius: '7px',
      background: '#fb7299',
      color: '#fff',
      fontSize: '14px',
      cursor: 'pointer'
    });

    const closeButton = document.createElement('button');
    closeButton.textContent = '×';

    Object.assign(closeButton.style, {
      width: '30px',
      height: '30px',
      border: 'none',
      borderRadius: '50%',
      background: 'rgba(255, 255, 255, 0.15)',
      color: '#fff',
      fontSize: '20px',
      lineHeight: '28px',
      cursor: 'pointer'
    });

    chooseButton.addEventListener('click', () => {
      if (mode === 'season') {
        seasonFileInput.click();
      } else {
        singleFileInput.click();
      }

      panel.remove();
    });

    closeButton.addEventListener('click', () => panel.remove());

    panel.appendChild(chooseButton);
    panel.appendChild(closeButton);
    document.body.appendChild(panel);

    setTimeout(() => panel.remove(), 15000);
  }

  // ---------- 文件名解析与整季导入 ----------

  function parseSeasonEpisodeFromFilename(fileName) {
    const name = fileName.replace(/\.[^.]+$/, '');

    const patterns = [
      /(?:^|[^\d])s(?:eason)?[\s._-]*0*(\d{1,2})[\s._-]*e(?:p(?:isode)?)?[\s._-]*0*(\d{1,3})(?:[^\d]|$)/i,
      /(?:^|[^\d])0*(\d{1,2})\s*[xX]\s*0*(\d{1,3})(?:[^\d]|$)/,
      /第\s*(\d{1,2})\s*季.*?第\s*(\d{1,3})\s*(?:集|话)/,
      /season[\s._-]*0*(\d{1,2}).*?episode[\s._-]*0*(\d{1,3})/i
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern);

      if (match) {
        return {
          season: Number(match[1]),
          episode: Number(match[2])
        };
      }
    }

    return null;
  }

  function makeEpisodeKey(season, episode) {
    return `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
  }

  async function importSeasonFiles(files) {
    let imported = 0;
    const skipped = [];

    for (const file of files) {
      const info = parseSeasonEpisodeFromFilename(file.name);

      if (!info) {
        skipped.push(file.name);
        continue;
      }

      try {
        const content = await file.text();
        const parsed = parseSRT(content);

        if (parsed.length === 0) {
          skipped.push(file.name);
          continue;
        }

        const key = makeEpisodeKey(info.season, info.episode);

        await putSubtitleRecord({
          key,
          season: info.season,
          episode: info.episode,
          fileName: file.name,
          content,
          updatedAt: Date.now()
        });

        imported += 1;
      } catch (error) {
        console.error(`导入失败：${file.name}`, error);
        skipped.push(file.name);
      }
    }

    let message = `已导入 ${imported} 集字幕`;

    if (skipped.length > 0) {
      message += `；${skipped.length} 个文件未识别`;
      console.warn('未导入的字幕文件：', skipped);
    }

    showToast(message, 2600);
    lastDetectedEpisodeKey = '';
    await autoLoadCurrentEpisode(true);
  }

  // ---------- 当前季/集识别 ----------

  const chineseNumberMap = {
    '零': 0, '〇': 0,
    '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
  };

  function parseChineseNumber(text) {
    if (/^\d+$/.test(text)) {
      return Number(text);
    }

    if (text === '十') {
      return 10;
    }

    const parts = text.split('十');

    if (parts.length === 2) {
      const tens = parts[0] ? chineseNumberMap[parts[0]] : 1;
      const ones = parts[1] ? chineseNumberMap[parts[1]] : 0;

      if (Number.isFinite(tens) && Number.isFinite(ones)) {
        return tens * 10 + ones;
      }
    }

    if (text.length === 1 && text in chineseNumberMap) {
      return chineseNumberMap[text];
    }

    return NaN;
  }

  function parseSeasonEpisodeFromText(text) {
    if (!text) {
      return null;
    }

    const normalized = text.replace(/\s+/g, ' ');

    const seasonMatch = normalized.match(
      /第\s*([零〇一二两三四五六七八九十\d]+)\s*季/
    );

    const episodeMatch = normalized.match(
      /第\s*([零〇一二两三四五六七八九十百\d]+)\s*(?:话|集)/
    );

    if (!seasonMatch || !episodeMatch) {
      return null;
    }

    const season = parseChineseNumber(seasonMatch[1]);
    const episode = parseChineseNumber(episodeMatch[1]);

    if (!Number.isFinite(season) || !Number.isFinite(episode)) {
      return null;
    }

    return { season, episode };
  }

  function detectCurrentEpisodeInfo() {
    // 1. B站页面全局数据（存在时最可靠）
    try {
      const state = window.__INITIAL_STATE__;

      if (state) {
        const seasonTitle =
          state.mediaInfo?.season_title ||
          state.mediaInfo?.title ||
          state.seasonInfo?.title ||
          '';

        const epTitle =
          state.epInfo?.title ||
          state.epInfo?.index ||
          '';

        const fromState = parseSeasonEpisodeFromText(
          `${seasonTitle} 第${epTitle}话`
        );

        if (fromState) {
          return fromState;
        }
      }
    } catch (error) {
      console.debug('读取 B 站页面状态失败：', error);
    }

    // 2. 浏览器标题及页面可见标题
    const candidates = [
      document.title,
      document.querySelector('h1')?.textContent,
      document.querySelector('.media-title')?.textContent,
      document.querySelector('.ep-title')?.textContent,
      document.body?.innerText?.slice(0, 10000)
    ].filter(Boolean);

    for (const text of candidates) {
      const result = parseSeasonEpisodeFromText(text);

      if (result) {
        return result;
      }
    }

    return null;
  }

  async function autoLoadCurrentEpisode(force = false) {
    const info = detectCurrentEpisodeInfo();

    if (!info) {
      return;
    }

    const key = makeEpisodeKey(info.season, info.episode);

    if (!force && key === lastDetectedEpisodeKey) {
      return;
    }

    lastDetectedEpisodeKey = key;

    if (key === currentSubtitleKey && subtitles.length > 0) {
      return;
    }

    const record = await getSubtitleRecord(key);

    if (!record) {
      return;
    }

    loadSubtitleContent(record.content, record.fileName, key);
    showToast(`已自动加载 ${record.fileName}`);
  }

  function loadSubtitleContent(content, fileName, key) {
    subtitles = parseSRT(content);
    currentFileName = fileName;
    currentSubtitleKey = key;
    lastSubtitleIndex = -2;
  }

  // ---------- 字幕解析与渲染 ----------

  function parseSRT(content) {
    const normalized = content
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();

    if (!normalized) {
      return [];
    }

    const blocks = normalized.split(/\n{2,}/);
    const result = [];

    for (const block of blocks) {
      const lines = block.split('\n');
      const timeLineIndex = lines.findIndex(line => line.includes('-->'));

      if (timeLineIndex === -1) {
        continue;
      }

      const [startText, endText] = lines[timeLineIndex].split('-->');

      if (!startText || !endText) {
        continue;
      }

      const start = parseTime(startText);
      const end = parseTime(endText);

      // 合并 SRT 自带的强制换行，只有宽度不够时浏览器才自动换行。
      const text = lines
        .slice(timeLineIndex + 1)
        .join(' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      if (
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        text
      ) {
        result.push({ start, end, text });
      }
    }

    return result.sort((a, b) => a.start - b.start);
  }

  function parseTime(value) {
    const cleaned = value
      .trim()
      .replace(',', '.')
      .split(/\s+/)[0];

    const parts = cleaned.split(':');

    if (parts.length !== 3) {
      return NaN;
    }

    return (
      Number(parts[0]) * 3600 +
      Number(parts[1]) * 60 +
      Number(parts[2])
    );
  }

  function findSubtitleIndex(time) {
    let left = 0;
    let right = subtitles.length - 1;

    while (left <= right) {
      const middle = Math.floor((left + right) / 2);
      const item = subtitles[middle];

      if (time < item.start) {
        right = middle - 1;
      } else if (time > item.end) {
        left = middle + 1;
      } else {
        return middle;
      }
    }

    return -1;
  }

  function createSubtitleBox() {
    if (!player) {
      return;
    }

    document.querySelector('#custom-srt-subtitle')?.remove();

    subtitleBox = document.createElement('div');
    subtitleBox.id = 'custom-srt-subtitle';

    Object.assign(subtitleBox.style, {
      position: 'absolute',
      textAlign: 'center',
      lineHeight: '1.2',
      fontWeight: '500',
      color: '#fff',
      textShadow: [
        '-1px -1px 2px #000',
        '1px -1px 2px #000',
        '-1px 1px 2px #000',
        '1px 1px 2px #000',
        '0 2px 5px #000'
      ].join(','),
      zIndex: '40',
      pointerEvents: 'none',
      whiteSpace: 'normal',
      overflowWrap: 'normal',
      wordBreak: 'normal',
      boxSizing: 'border-box',
      padding: '0 12px',
      transition: 'opacity 0.15s'
    });

    player.appendChild(subtitleBox);
    applySubtitleStyle();
    updateSubtitlePosition();
  }

  function applySubtitleStyle() {
    if (!subtitleBox) {
      return;
    }

    const videoWidth = video?.getBoundingClientRect().width || 1000;

    const scale = Math.min(
      1.25,
      Math.max(0.75, videoWidth / 1100)
    );

    subtitleBox.style.fontSize = `${settings.fontSize * scale}px`;
    subtitleBox.style.opacity = settings.visible ? '1' : '0';
  }

  function getDisplayedVideoRect() {
    if (!video || !video.videoWidth || !video.videoHeight) {
      return video?.getBoundingClientRect() || null;
    }

    const rect = video.getBoundingClientRect();
    const sourceRatio = video.videoWidth / video.videoHeight;
    const elementRatio = rect.width / rect.height;

    let width;
    let height;
    let left;
    let top;

    if (elementRatio > sourceRatio) {
      height = rect.height;
      width = height * sourceRatio;
      left = rect.left + (rect.width - width) / 2;
      top = rect.top;
    } else {
      width = rect.width;
      height = width / sourceRatio;
      left = rect.left;
      top = rect.top + (rect.height - height) / 2;
    }

    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height
    };
  }

  function updateSubtitlePosition() {
    if (!subtitleBox || !video || !player) {
      return;
    }

    const displayedRect = getDisplayedVideoRect();
    const playerRect = player.getBoundingClientRect();

    if (!displayedRect) {
      return;
    }

    const left = displayedRect.left - playerRect.left;

    const bottom =
      playerRect.bottom -
      displayedRect.bottom +
      settings.bottomMargin;

    subtitleBox.style.left = `${left}px`;
    subtitleBox.style.width = `${displayedRect.width}px`;
    subtitleBox.style.bottom = `${bottom}px`;

    applySubtitleStyle();
  }

  function startSubtitleLoop() {
    function update() {
      if (video && subtitleBox) {
        const adjustedTime = video.currentTime + settings.timeOffset;
        const index = findSubtitleIndex(adjustedTime);

        if (index !== lastSubtitleIndex) {
          lastSubtitleIndex = index;
          subtitleBox.textContent =
            index >= 0 ? subtitles[index].text : '';
        }
      }

      requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  }

  // ---------- 设置 ----------

  function modifyFontSize(amount) {
    settings.fontSize = Math.min(
      50,
      Math.max(12, settings.fontSize + amount)
    );

    saveSettings();
    applySubtitleStyle();
    showToast(`英文字号：${settings.fontSize}px`);
  }

  function modifyPosition(amount) {
    settings.bottomMargin = Math.min(
      250,
      Math.max(0, settings.bottomMargin + amount)
    );

    saveSettings();
    updateSubtitlePosition();
    showToast(`字幕距底部：${settings.bottomMargin}px`);
  }

  function modifyTimeOffset(amount) {
    settings.timeOffset = Number(
      (settings.timeOffset + amount).toFixed(1)
    );

    saveSettings();
    lastSubtitleIndex = -2;

    const prefix = settings.timeOffset >= 0 ? '+' : '';
    showToast(
      `时间偏移：${prefix}${settings.timeOffset.toFixed(1)} 秒`
    );
  }

  function toggleSubtitle() {
    settings.visible = !settings.visible;
    saveSettings();
    applySubtitleStyle();
    showToast(settings.visible ? '字幕已显示' : '字幕已隐藏');
  }

  function resetSettings() {
    settings = { ...defaultSettings };
    saveSettings();
    applySubtitleStyle();
    updateSubtitlePosition();
    showToast('字幕设置已恢复默认');
  }

  async function showLibraryStatus() {
    const records = await getAllSubtitleRecords();
    const info = detectCurrentEpisodeInfo();

    const currentText = info
      ? `当前：第${info.season}季第${info.episode}集`
      : '当前集数未识别';

    const loadedText = currentFileName
      ? `已加载：${currentFileName}`
      : '当前未加载字幕';

    showToast(
      `${currentText}｜字幕库 ${records.length} 集｜${loadedText}`,
      3000
    );
  }

  // ---------- 油猴菜单 ----------

  function registerMenus() {
    GM_registerMenuCommand(
      '📚 导入整季 SRT（多选）',
      () => showTemporaryFilePanel('season')
    );

    GM_registerMenuCommand(
      '📂 临时加载单集 SRT',
      () => showTemporaryFilePanel('single')
    );

    GM_registerMenuCommand(
      '🔄 自动匹配当前集',
      () => autoLoadCurrentEpisode(true)
    );

    GM_registerMenuCommand(
      '🔍 字号增大',
      () => modifyFontSize(2)
    );

    GM_registerMenuCommand(
      '🔎 字号减小',
      () => modifyFontSize(-2)
    );

    GM_registerMenuCommand(
      '⬆️ 字幕上移',
      () => modifyPosition(5)
    );

    GM_registerMenuCommand(
      '⬇️ 字幕下移',
      () => modifyPosition(-5)
    );

    GM_registerMenuCommand(
      '⏪ 字幕提前 0.2 秒',
      () => modifyTimeOffset(0.2)
    );

    GM_registerMenuCommand(
      '⏩ 字幕延后 0.2 秒',
      () => modifyTimeOffset(-0.2)
    );

    GM_registerMenuCommand(
      '👁 显示／隐藏字幕',
      toggleSubtitle
    );

    GM_registerMenuCommand(
      'ℹ️ 字幕库与当前状态',
      showLibraryStatus
    );

    GM_registerMenuCommand(
      '🗑 清空整季字幕库',
      () => {
        if (window.confirm('确定要清空浏览器中已导入的所有 SRT 字幕吗？')) {
          clearSubtitleLibrary();
        }
      }
    );

    GM_registerMenuCommand(
      '♻️ 恢复默认显示设置',
      resetSettings
    );
  }

  // ---------- B站播放器初始化 ----------

  function initializePlayer() {
    const newVideo =
      document.querySelector('.bpx-player-video-wrap video') ||
      document.querySelector('video');

    const newPlayer =
      document.querySelector('.bpx-player-container');

    if (!newVideo || !newPlayer) {
      return;
    }

    const playerChanged =
      video !== newVideo ||
      player !== newPlayer;

    if (!playerChanged && subtitleBox?.isConnected) {
      return;
    }

    video = newVideo;
    player = newPlayer;

    createSubtitleBox();

    video.addEventListener('loadedmetadata', updateSubtitlePosition);
    video.addEventListener('resize', updateSubtitlePosition);
    window.addEventListener('resize', updateSubtitlePosition);

    document.addEventListener('fullscreenchange', () => {
      setTimeout(updateSubtitlePosition, 100);
    });

    const resizeObserver = new ResizeObserver(updateSubtitlePosition);
    resizeObserver.observe(video);
    resizeObserver.observe(player);
  }

  registerMenus();
  createFileInputs();
  startSubtitleLoop();

  // B站是单页应用：切集时 URL 和页面内容可能变化，但网页不会完整刷新。
  setInterval(() => {
    initializePlayer();
    autoLoadCurrentEpisode();
  }, 1000);

  initializePlayer();
  autoLoadCurrentEpisode(true);
})();
