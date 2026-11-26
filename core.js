/* ────────────────────────────────────────────────────────────────
   core.js — состояние, хранилище, расчёты
   Никаких зависимостей. Работает и на file://, и на https.
   ──────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var App = (window.App = window.App || {});

  /* ══════════════════════════ утилиты ══════════════════════════ */

  var U = (App.util = {});

  U.$ = function (sel, root) {
    return (root || document).querySelector(sel);
  };

  U.$$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  U.clamp = function (v, min, max) {
    v = Number(v) || 0;
    return v < min ? min : v > max ? max : v;
  };

  U.uid = function (len) {
    var abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    var n = len || 10;
    var out = '';
    for (var i = 0; i < n; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
    return out;
  };

  /* код комнаты: без похожих символов, легко продиктовать по телефону */
  U.roomCode = function (len) {
    var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var n = len || 8;
    var out = '';
    for (var i = 0; i < n; i++) out += abc.charAt(Math.floor(Math.random() * abc.length));
    return out;
  };

  U.debounce = function (fn, ms) {
    var t = null;
    return function () {
      var args = arguments;
      var self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        t = null;
        fn.apply(self, args);
      }, ms);
    };
  };

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  U.pad2 = function (n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    return (n < 10 ? '0' : '') + n;
  };

  U.dateKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };

  U.parseKey = function (key) {
    var p = String(key || '').split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0, 0);
  };

  U.todayKey = function () {
    return U.dateKey(new Date());
  };

  U.addDays = function (key, n) {
    var d = U.parseKey(key);
    d.setDate(d.getDate() + n);
    return U.dateKey(d);
  };

  U.dayDiff = function (a, b) {
    var A = U.parseKey(a).getTime();
    var B = U.parseKey(b).getTime();
    return Math.round((A - B) / 86400000);
  };

  U.timeAgo = function (ts) {
    if (!ts) return '—';
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'только что';
    if (s < 90) return 'минуту назад';
    if (s < 3600) return Math.round(s / 60) + ' мин назад';
    if (s < 7200) return 'час назад';
    if (s < 86400) return Math.round(s / 3600) + ' ч назад';
    var d = Math.round(s / 86400);
    if (d === 1) return 'вчера';
    if (d < 7) return d + ' дн назад';
    return U.pad2(new Date(ts).getDate()) + '.' + U.pad2(new Date(ts).getMonth() + 1);
  };

  U.hm = function (mins) {
    mins = Math.round(Number(mins) || 0);
    if (mins < 60) return mins + ' мин';
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return m ? h + ' ч ' + m + ' мин' : h + ' ч';
  };

  U.hours = function (h) {
    h = Math.round((Number(h) || 0) * 10) / 10;
    return String(h).replace('.', ',') + ' ч';
  };

  U.ml = function (v) {
    v = Math.round(Number(v) || 0);
    if (v >= 1000) {
      var l = v / 1000;
      return (Math.round(l * 10) / 10).toString().replace('.', ',') + ' л';
    }
    return v + ' мл';
  };

  U.TIME = function (ts) {
    var d = new Date(ts || Date.now());
    return U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };

  U.DATE_HUMAN = function (key) {
    var d = U.parseKey(key);
    var months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    var today = U.todayKey();
    var head = U.pad2(d.getDate()) + ' ' + months[d.getMonth()];
    if (key === today) return 'сегодня, ' + head;
    if (key === U.addDays(today, -1)) return 'вчера, ' + head;
    return head;
  };

  U.MONTH = function (key) {
    var d = U.parseKey(key);
    var months = [
      'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'
    ];
    return months[d.getMonth()] + ' ' + d.getFullYear();
  };

  U.DOW = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

  U.copy = function (text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* ниже фолбэк */ }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  };

  U.download = function (filename, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 600);
      return true;
    } catch (e) {
      return false;
    }
  };

  /* ══════════════════════════ модель дня ══════════════════════════ */

  var MEALS = [
    { key: 'b', label: 'Завтрак', ico: '🌅' },
    { key: 'l', label: 'Обед', ico: '🍲' },
    { key: 'd', label: 'Ужин', ico: '🌙' },
    { key: 's', label: 'Перекус', ico: '🍎' }
  ];
  App.MEALS = MEALS;

  function emptyDoc() {
    return {
      water: [],
      meals: { b: false, l: false, d: false, s: false },
      mealNote: '',
      sleep: { from: '', to: '' },
      activity: [],
      meds: {},
      feeling: { mood: 0, nose: 0, dizzy: false, weak: false, note: '' },
      weight: null,
      updatedAt: 0
    };
  }
  App.emptyDoc = emptyDoc;

  var DEFAULT_STATE = {
    version: 1,
    createdAt: 0,
    me: { id: '', name: '', emoji: '💛', color: '#ffb35c' },
    partner: { id: '', name: '', emoji: '💜', color: '#9d7bff' },
    room: { code: '', joinedAt: 0, host: false },
    firebase: { dbUrl: '', apiKey: '', uid: '', idToken: '', refreshToken: '', tokenExp: 0 },
    settings: {
      goalWater: 2000,
      goalSleep: 8,
      goalMeals: 3,
      goalActivity: 120,
      glass: 250,
      weight: 0,
      soft: false,
      reminders: true,
      reminderEvery: 45,
      lastWaterNudge: 0
    },
    meds: [
      { id: 'm1', name: 'Витамин D', ico: '☀️' },
      { id: 'm2', name: 'Железо', ico: '🩸' }
    ],
    days: {},
    pending: {},
    seen: { nudge: 0, note: 0, heart: 0 },
    lastSeenAt: 0
  };

  function deepDefaults(target, defaults) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      return JSON.parse(JSON.stringify(defaults));
    }
    Object.keys(defaults).forEach(function (k) {
      var dv = defaults[k];
      if (dv && typeof dv === 'object' && !Array.isArray(dv)) {
        target[k] = deepDefaults(target[k], dv);
      } else if (target[k] === undefined) {
        target[k] = Array.isArray(dv) ? [] : dv;
      }
    });
    return target;
  }

  /* ══════════════════════════ хранилище ══════════════════════════ */

  var KEY = 'vmeste.v1';
  var listeners = [];

  var Store = (App.Store = {
    state: null,

    load: function () {
      var raw = null;
      try {
        raw = localStorage.getItem(KEY);
      } catch (e) {
        raw = null;
      }
      if (raw) {
        try {
          var parsed = JSON.parse(raw);
          this.state = deepDefaults(parsed, DEFAULT_STATE);
        } catch (e) {
          this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
        }
      } else {
        this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      }

      var s = this.state;
      if (!s.createdAt) s.createdAt = Date.now();
      if (!s.me.id) s.me.id = U.uid(12);
      if (!s.me.name) s.me.name = 'Я';
      if (!Array.isArray(s.meds) || !s.meds.length) s.meds = JSON.parse(JSON.stringify(DEFAULT_STATE.meds));
      if (!s.days) s.days = {};
      if (!s.pending) s.pending = {};
      if (!s.seen) s.seen = { nudge: 0, note: 0, heart: 0 };

      this.prune();
      return s;
    },

    prune: function () {
      var s = this.state;
      var limitKey = U.addDays(U.todayKey(), -400);
      var keys = Object.keys(s.days);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] < limitKey) delete s.days[keys[i]];
      }
      if (Object.keys(s.days).length > 400) {
        Object.keys(s.days)
          .sort()
          .slice(0, Object.keys(s.days).length - 400)
          .forEach(function (k) { delete s.days[k]; });
      }
    },

    save: function (immediate) {
      var self = this;
      var write = function () {
        try {
          localStorage.setItem(KEY, JSON.stringify(self.state));
        } catch (e) {
          /* место кончилось — сообщим интерфейсу */
          self.emit('storage-error', e);
        }
      };
      if (immediate) {
        write();
        return;
      }
      if (!this._saveTimer) {
        this._saveTimer = setTimeout(function () {
          self._saveTimer = null;
          write();
        }, 220);
      }
    },

    on: function (fn) {
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },

    emit: function (what, payload) {
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i](what || 'change', payload);
        } catch (e) {
          if (window.console) console.error('[vmeste] listener', e);
        }
      }
    },

    /* ── персона ── */

    me: function () {
      return this.state.me;
    },

    partner: function () {
      return this.state.partner;
    },

    hasPartner: function () {
      return !!(this.state.partner && this.state.partner.id);
    },

    setMe: function (patch) {
      var me = this.state.me;
      Object.keys(patch).forEach(function (k) {
        me[k] = patch[k];
      });
      this.save();
      this.emit('me', me);
    },

    setPartner: function (patch) {
      var p = this.state.partner;
      Object.keys(patch).forEach(function (k) {
        p[k] = patch[k];
      });
      this.save();
      this.emit('partner', p);
    },

    /* ── дни ── */

    dayBox: function (date, create) {
      var s = this.state;
      date = date || U.todayKey();
      if (!s.days[date]) {
        if (!create) return null;
        s.days[date] = { mine: emptyDoc(), partner: null, syncedAt: 0 };
      }
      if (create && !s.days[date].mine) s.days[date].mine = emptyDoc();
      return s.days[date];
    },

    doc: function (date, who) {
      var box = this.dayBox(date, who !== 'partner');
      if (!box) return emptyDoc();
      if (who === 'partner') return box.partner || emptyDoc();
      return box.mine || emptyDoc();
    },

    mine: function (date) {
      return this.doc(date, 'mine');
    },

    today: function () {
      return this.mine(U.todayKey());
    },

    /* правка сегодняшнего/указанного дня + автосохранение + отметка «надо синхронизировать» */
    edit: function (date, fn) {
      var box = this.dayBox(date, true);
      var doc = box.mine;
      fn(doc);
      doc.updatedAt = Date.now();
      this.state.pending[date] = Date.now();
      this.save();
      this.emit('day', date);
      return doc;
    },

    /* ── вода ── */

    waterTotal: function (doc) {
      var sum = 0;
      (doc.water || []).forEach(function (w) {
        sum += Number(w.ml) || 0;
      });
      return sum;
    },

    waterPct: function (doc) {
      var goal = this.state.settings.goalWater || 2000;
      return U.clamp(Math.round((this.waterTotal(doc) / goal) * 100), 0, 999);
    },

    addWater: function (ml, date) {
      var self = this;
      return this.edit(date, function (doc) {
        doc.water = doc.water || [];
        doc.water.push({ t: Date.now(), ml: Math.round(Number(ml) || 0) });
        if (doc.water.length > 60) doc.water = doc.water.slice(doc.water.length - 60);
      });
    },

    undoWater: function (date) {
      var doc = this.mine(date);
      if (!doc.water || !doc.water.length) return false;
      this.edit(date, function (d) {
        d.water.pop();
      });
      return true;
    },

    /* ── еда ── */

    mealsCount: function (doc) {
      var m = doc.meals || {};
      var n = 0;
      MEALS.forEach(function (x) {
        if (m[x.key]) n++;
      });
      return n;
    },

    toggleMeal: function (key, date) {
      return this.edit(date, function (doc) {
        doc.meals = doc.meals || {};
        doc.meals[key] = !doc.meals[key];
      });
    },

    setMealNote: function (text, date) {
      return this.edit(date, function (doc) {
        doc.mealNote = String(text || '').slice(0, 180);
      });
    },

    /* ── сон ── */

    sleepHours: function (doc) {
      var sl = doc.sleep || {};
      if (!sl.from || !sl.to) return 0;
      var f = sl.from.split(':');
      var t = sl.to.split(':');
      var from = Number(f[0]) * 60 + Number(f[1]);
      var to = Number(t[0]) * 60 + Number(t[1]);
      if (to <= from) to += 24 * 60;
      return Math.round(((to - from) / 60) * 10) / 10;
    },

    setSleep: function (from, to, date) {
      return this.edit(date, function (doc) {
        doc.sleep = doc.sleep || {};
        if (from !== undefined) doc.sleep.from = from;
        if (to !== undefined) doc.sleep.to = to;
      });
    },

    /* ── активность ── */

    activityTotal: function (doc) {
      var sum = 0;
      (doc.activity || []).forEach(function (a) {
        sum += Number(a.min) || 0;
      });
      return sum;
    },

    addActivity: function (min, kind, date) {
      return this.edit(date, function (doc) {
        doc.activity = doc.activity || [];
        doc.activity.push({ t: Date.now(), min: Math.round(Number(min) || 0), kind: String(kind || 'ходьба') });
        if (doc.activity.length > 40) doc.activity = doc.activity.slice(doc.activity.length - 40);
      });
    },

    undoActivity: function (date) {
      var doc = this.mine(date);
      if (!doc.activity || !doc.activity.length) return false;
      this.edit(date, function (d) {
        d.activity.pop();
      });
      return true;
    },

    /* ── лекарства ── */

    medsDone: function (doc) {
      var m = doc.meds || {};
      var n = 0;
      this.state.meds.forEach(function (x) {
        if (m[x.id]) n++;
      });
      return n;
    },

    toggleMed: function (id, date) {
      return this.edit(date, function (doc) {
        doc.meds = doc.meds || {};
        doc.meds[id] = !doc.meds[id];
      });
    },

    addMed: function (name, ico) {
      name = String(name || '').trim();
      if (!name) return null;
      var med = { id: 'm' + U.uid(6), name: name.slice(0, 40), ico: ico || '💊' };
      this.state.meds.push(med);
      this.save();
      this.emit('meds');
      return med;
    },

    removeMed: function (id) {
      var s = this.state;
      s.meds = s.meds.filter(function (m) {
        return m.id !== id;
      });
      Object.keys(s.days).forEach(function (k) {
        var doc = s.days[k] && s.days[k].mine;
        if (doc && doc.meds && doc.meds[id]) delete doc.meds[id];
      });
      this.save();
      this.emit('meds');
    },

    /* ── самочувствие ── */

    setMood: function (mood, date) {
      return this.edit(date, function (doc) {
        doc.feeling = doc.feeling || {};
        doc.feeling.mood = doc.feeling.mood === mood ? 0 : mood;
      });
    },

    bumpNose: function (date) {
      return this.edit(date, function (doc) {
        doc.feeling = doc.feeling || {};
        doc.feeling.nose = U.clamp((doc.feeling.nose || 0) + 1, 0, 30);
      });
    },

    toggleFlag: function (flag, date) {
      return this.edit(date, function (doc) {
        doc.feeling = doc.feeling || {};
        doc.feeling[flag] = !doc.feeling[flag];
      });
    },

    setFeelingNote: function (text, date) {
      return this.edit(date, function (doc) {
        doc.feeling = doc.feeling || {};
        doc.feeling.note = String(text || '').slice(0, 140);
      });
    },

    setWeight: function (kg, date) {
      return this.edit(date, function (doc) {
        doc.weight = Number(kg) || null;
      });
    },

    /* ── счёт дня ── */

    score: function (doc) {
      var st = this.state.settings;
      var water = U.clamp(this.waterTotal(doc) / (st.goalWater || 2000), 0, 1) * 30;
      var meals = U.clamp(this.mealsCount(doc) / (st.goalMeals || 3), 0, 1) * 20;
      var sleep = U.clamp(this.sleepHours(doc) / (st.goalSleep || 8), 0, 1) * 20;
      var act = U.clamp(this.activityTotal(doc) / (st.goalActivity || 120), 0, 1) * 15;
      var medsTotal = this.state.meds.length;
      var meds = medsTotal ? (this.medsDone(doc) / medsTotal) * 15 : 15;
      return Math.round(water + meals + sleep + act + meds);
    },

    isTouched: function (doc) {
      if (!doc) return false;
      return !!(
        (doc.water && doc.water.length) ||
        this.mealsCount(doc) ||
        (doc.sleep && doc.sleep.from) ||
        (doc.activity && doc.activity.length) ||
        this.medsDone(doc) ||
        (doc.feeling && (doc.feeling.mood || doc.feeling.nose || doc.feeling.dizzy || doc.feeling.weak || doc.feeling.note)) ||
        doc.weight
      );
    },

    streak: function () {
      var n = 0;
      var key = U.todayKey();
      var todayDoc = this.mine(key);
      if (this.isTouched(todayDoc)) n++;
      else if (!this.isTouched(this.mine(U.addDays(key, -1)))) return 0;

      var d = U.addDays(key, -1);
      for (var i = 0; i < 400; i++) {
        var doc = this.mine(d);
        if (this.isTouched(doc)) {
          n++;
          d = U.addDays(d, -1);
        } else {
          break;
        }
      }
      return n;
    },

    history: function (days) {
      days = days || 30;
      var out = [];
      var today = U.todayKey();
      for (var i = days - 1; i >= 0; i--) {
        var key = U.addDays(today, -i);
        var doc = this.mine(key);
        out.push({
          key: key,
          score: this.isTouched(doc) ? this.score(doc) : 0,
          water: this.waterTotal(doc),
          nose: (doc.feeling && doc.feeling.nose) || 0,
          mood: (doc.feeling && doc.feeling.mood) || 0,
          touched: this.isTouched(doc)
        });
      }
      return out;
    },

    /* ── резервная копия ── */

    exportJson: function () {
      var copy = JSON.parse(JSON.stringify(this.state));
      copy.pending = {};
      copy.firebase = {
        dbUrl: copy.firebase.dbUrl,
        apiKey: copy.firebase.apiKey,
        uid: copy.firebase.uid,
        idToken: '',
        refreshToken: '',
        tokenExp: 0
      };
      return JSON.stringify({
        app: 'vmeste',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: copy
      }, null, 2);
    },

    importJson: function (text) {
      var parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        return { ok: false, error: 'Файл повреждён — это не JSON.' };
      }
      var data = parsed && parsed.data ? parsed.data : parsed;
      if (!data || !data.days || typeof data.days !== 'object') {
        return { ok: false, error: 'В файле нет данных «Вместе».' };
      }
      var merged = 0;
      var days = data.days;
      Object.keys(days).forEach(function (k) {
        var incoming = days[k] && days[k].mine;
        if (!incoming) return;
        var local = Store.state.days[k] && Store.state.days[k].mine;
        if (!local || (incoming.updatedAt || 0) > (local.updatedAt || 0)) {
          if (!Store.state.days[k]) Store.state.days[k] = { mine: emptyDoc(), partner: null, syncedAt: 0 };
          Store.state.days[k].mine = deepDefaults(incoming, emptyDoc());
          Store.state.pending[k] = Date.now();
          merged++;
        }
      });
      if (data.me && data.me.name && !Store.state.me.name) Store.state.me.name = data.me.name;
      if (data.me && data.me.emoji) Store.state.me.emoji = data.me.emoji;
      if (data.meds && data.meds.length) {
        data.meds.forEach(function (m) {
          var has = Store.state.meds.some(function (x) { return x.name === m.name; });
          if (!has) Store.state.meds.push(m);
        });
      }
      Store.save(true);
      Store.emit('import');
      return { ok: true, merged: merged };
    },

    /* ── служебное ── */

    pendingCount: function () {
      return Object.keys(this.state.pending || {}).length;
    },

    clearPending: function (date) {
      delete this.state.pending[date];
      this.save();
    },

    setSyncMeta: function (date, partnerDoc) {
      var box = this.dayBox(date, true);
      box.partner = partnerDoc;
      box.syncedAt = Date.now();
      this.save();
      this.emit('remote', date);
    },

    wipe: function () {
      try {
        localStorage.removeItem(KEY);
      } catch (e) { /* ignore */ }
      this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
      this.state.me.id = U.uid(12);
      this.save(true);
      this.emit('wipe');
    }
  });

  App.MEAL_KEYS = MEALS.map(function (m) { return m.key; });
})();
