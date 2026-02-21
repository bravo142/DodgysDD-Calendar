import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js';

const TYPE_PALETTE = [
  '#6366f1',
  '#ec4899',
  '#10b981',
  '#f97316',
  '#14b8a6',
  '#facc15',
  '#a855f7',
  '#0ea5e9',
  '#f472b6',
  '#22d3ee'
];
const WATCHED_COOKIE = 'dodgy_watched';
const COMMENTBOX_PROJECT_ID = '5710174446682112-proj';
const COMMENTBOX_PROJECT_URL = 'https://bravo142.github.io/DodgysDD-Calendar/';

const formatIsoLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractVideoId = (url = '') => {
  const patterns = [
    /youtu\.be\/([^\?&]+)/,
    /youtube\.com\/watch\?v=([^\?&]+)/,
    /youtube\.com\/live\/([^\?&]+)/,
    /youtube\.com\/embed\/([^\?&]+)/,
    /youtube\.com\/shorts\/([^\?&]+)/,
    /youtube\.com\/v\/([^\?&]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return '';
};

const buildEmbedUrl = (url) => {
  const id = extractVideoId(url);
  return id ? `https://www.youtube.com/embed/${id}` : url;
};

const loadWatchedFromCookie = () => {
  const cookies = document.cookie.split('; ').find((entry) => entry.startsWith(`${WATCHED_COOKIE}=`));
  if (!cookies) {
    return {};
  }
  const [, raw] = cookies.split('=');
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch (error) {
    console.error('Unable to parse watched cookie', error);
    return {};
  }
};

const saveWatchedCookie = (value) => {
  try {
    const encoded = encodeURIComponent(JSON.stringify(value));
    document.cookie = `${WATCHED_COOKIE}=${encoded}; path=/; samesite=lax`;
  } catch (error) {
    console.error('Unable to persist watched cookie', error);
  }
};

createApp({
  data() {
    return {
      streams: [],
      typeMap: [],
      typeFilters: {},
      currentMonth: new Date(),
      showModal: false,
      selectedStream: null,
      watched: loadWatchedFromCookie(),
      isLoading: true,
      error: '',
      keyHandler: null,
      commentBoxLoadPromise: null
    };
  },
  computed: {
    monthLabel() {
      return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(this.currentMonth);
    },
    typeCounts() {
      return this.streams.reduce((acc, stream) => {
        const key = stream['type-key'];
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    },
    activeTypeCount() {
      return Object.values(this.typeFilters).filter(Boolean).length;
    },
    filteredStreams() {
      return this.streams.filter((stream) => this.typeFilters[stream['type-key']] ?? true);
    },
    streamsByDate() {
      return this.filteredStreams.reduce((acc, stream) => {
        const key = stream.date;
        if (!acc[key]) {
          acc[key] = [];
        }
        acc[key].push(stream);
        return acc;
      }, {});
    },
    calendarDays() {
      const firstOfMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
      const startDay = firstOfMonth.getDay();
      const gridStart = new Date(firstOfMonth);
      gridStart.setDate(firstOfMonth.getDate() - startDay);
      const todayKey = formatIsoLocal(new Date());
      const days = [];
      for (let i = 0; i < 42; i += 1) {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + i);
        const iso = formatIsoLocal(day);
        days.push({
          date: day,
          iso,
          isCurrentMonth: day.getMonth() === this.currentMonth.getMonth(),
          isToday: iso === todayKey,
          streams: this.streamsByDate[iso] || []
        });
      }
      return days;
    },
    modalVideoSrc() {
      return this.selectedStream ? buildEmbedUrl(this.selectedStream['youtube url']) : '';
    }
  },
  methods: {
    async fetchStreams() {
      try {
        const response = await fetch('./dodgy_streams.json');
        if (!response.ok) {
          throw new Error('Failed to load stream JSON');
        }
        const json = await response.json();
        json.sort((a, b) => new Date(a.date) - new Date(b.date));
        this.streams = json;
        this.setupTypes();
      } catch (error) {
        console.error(error);
        this.error = 'Unable to load the calendar data right now.';
      } finally {
        this.isLoading = false;
      }
    },
    setupTypes() {
      const seen = new Map();
      this.streams.forEach((stream) => {
        const key = stream['type-key'];
        if (!seen.has(key)) {
          const color = TYPE_PALETTE[seen.size % TYPE_PALETTE.length];
          seen.set(key, { key, label: stream.type, color });
        }
      });
      this.typeMap = Array.from(seen.values());
      const filters = {};
      this.typeMap.forEach((type) => {
        filters[type.key] = true;
      });
      this.typeFilters = filters;
    },
    changeMonth(offset) {
      const nextMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + offset, 1);
      this.currentMonth = nextMonth;
    },
    toggleType(key) {
      this.typeFilters = { ...this.typeFilters, [key]: !this.typeFilters[key] };
    },
    openStream(stream) {
      this.selectedStream = stream;
      this.showModal = true;
      this.$nextTick(() => {
        const videoId = extractVideoId(stream['youtube url']);
        this.renderCommentBox(videoId);
      });
      document.body.classList.add('modal-open');
    },
    closeModal() {
      this.showModal = false;
      this.selectedStream = null;
      const root = document.getElementById('modalCommentBoxRoot');
      if (root) {
        root.innerHTML = '';
      }
      document.body.classList.remove('modal-open');
    },
    toggleWatched(stream) {
      if (!stream) {
        return;
      }
      const videoId = extractVideoId(stream['youtube url']);
      if (!videoId) {
        return;
      }
      const updated = { ...this.watched };
      if (updated[videoId]) {
        delete updated[videoId];
      } else {
        updated[videoId] = new Date().toISOString();
      }
      this.watched = updated;
      saveWatchedCookie(updated);
    },
    isWatched(stream) {
      if (!stream) {
        return false;
      }
      const videoId = extractVideoId(stream['youtube url']);
      return Boolean(videoId && this.watched[videoId]);
    },
    dotStyle(stream) {
      const color = this.getTypeColor(stream['type-key']);
      return {
        backgroundColor: color,
        borderColor: color
      };
    },
    getTypeColor(key) {
      const match = this.typeMap.find((type) => type.key === key);
      return match ? match.color : TYPE_PALETTE[0];
    },
    ensureCommentBoxReady() {
      if (this.commentBoxLoadPromise) {
        return this.commentBoxLoadPromise;
      }
      this.commentBoxLoadPromise = new Promise((resolve) => {
        const check = () => {
          if (window.commentBox) {
            resolve();
            return;
          }
          setTimeout(check, 50);
        };
        check();
      });
      return this.commentBoxLoadPromise;
    },
    renderCommentBox(videoId) {
      if (!videoId) {
        return;
      }
      const root = document.getElementById('modalCommentBoxRoot');
      if (!root) {
        return;
      }
      const boxId = `stream-${videoId}`;
      root.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'commentbox';
      box.id = boxId;
      root.appendChild(box);
      this.ensureCommentBoxReady().then(() => {
        window.commentBox(COMMENTBOX_PROJECT_ID, {
          createBoxUrl(currentBoxId) {
            const url = new URL(COMMENTBOX_PROJECT_URL);
            url.hash = currentBoxId;
            return url.toString();
          }
        });
      });
    }
  },
  mounted() {
    this.fetchStreams();
    this.keyHandler = (event) => {
      if (event.key === 'Escape' && this.showModal) {
        this.closeModal();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  },
  beforeUnmount() {
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
    }
    document.body.classList.remove('modal-open');
  }
}).mount('#app');
