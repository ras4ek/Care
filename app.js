/* ────────────────────────────────────────────────────────────────
   app.js — запуск приложения, напоминания, служебные мелочи
   ──────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var Store = App.Store;
  var Sync = App.Sync;

  /* ══════════════════════════ напоминания ══════════════════════════ */

  var Notify = (App.Notify = {
    timer: null,
    lastAt: 0,

    restart: function () {
      var self = this;
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      var st = Store.state.settings;
      if (!st.reminders) return;
      var every = U.clamp(st.reminderEvery || 45, 15, 180) * 60000;
      this.timer = setInterval(function () {
        self.tick(every);
      }, 60000);
    },

    tick: function (every) {
      var st = Store.state.settings;
      if (!st.reminders) return;
      if (document.hidden) return;
      var now = Date.now();
      if (now - (this.lastAt || st.lastWaterNudge || 0) < every) return;

      var doc = Store.mine(U.todayKey());
      var pct = Store.waterPct(doc);
      if (pct >= 100) return;

      var last = 0;
      (doc.water || []).forEach(function (w) {
        if (w.t > last) last = w.t;
      });
      if (last && now - last < every) return;

      this.fire(
        'Пора попить воды',
        pct === 0 ? 'Ещё ни капли за сегодня. Начни с половины стакана.' : 'Выпито ' + pct + '% от цели. Один стакан — и станет легче.'
      );
      this.lastAt = now;
      st.lastWaterNudge = now;
      Store.save();
    },

    fire: function (title, body) {
      try {
        if (window.Notification && Notification.permission === 'granted') {
          new Notification(title, { body: body, tag: 'vmeste-water', icon: 'icon.svg' });
        }
      } catch (e) { /* уведомления могут быть запрещены */ }
      if (App.UI) App.UI.toast(title);
    },

    ask: function () {
      try {
        if (window.Notification && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      } catch (e) { /* ignore */ }
    }
  });

  /* ══════════════════════════ ошибки ══════════════════════════ */

  function fatal(message) {
    var boot = document.getElementById('boot');
    if (boot) {
      boot.classList.remove('gone');
      boot.style.display = 'flex';
      boot.innerHTML =
        '<div class="boot-mark"><svg class="ic"><use href="#i-alert"/></svg></div>' +
        '<div class="boot-text" style="max-width:82%;text-align:center;line-height:1.5">' +
        'Не удалось запустить «Вместе».<br><small style="opacity:.7">' +
        U.esc(String(message || 'неизвестная ошибка').slice(0, 200)) +
        '</small></div>' +
        '<button class="btn" onclick="location.reload()" style="margin-top:10px">Обновить</button>';
    }
    if (window.console) console.error('[vmeste]', message);
  }

  window.addEventListener('error', function (ev) {
    if (ev && ev.message) fatal(ev.message);
  });

  /* ══════════════════════════ запуск ══════════════════════════ */

  function inviteFromHash() {
    var m = /(?:^|[#&?])r=([A-Za-z0-9]{4,12})/.exec(location.hash || '');
    return m ? m[1].toUpperCase() : '';
  }

  function boot() {
    try {
      Store.load();
    } catch (e) {
      return fatal('хранилище недоступно: ' + (e && e.message));
    }

    /* внешний конфиг (js/config.js) — чтобы не вбивать Firebase руками */
    var cfg = window.VMESTE_CONFIG || {};
    if (cfg.firebase) {
      var fb = Store.state.firebase;
      if (!fb.dbUrl && cfg.firebase.databaseURL) fb.dbUrl = cfg.firebase.databaseURL;
      if (!fb.apiKey && cfg.firebase.apiKey) fb.apiKey = cfg.firebase.apiKey;
      if (!Store.state.room.code && cfg.room) {
        Store.state.room.code = String(cfg.room).toUpperCase();
      }
    }

    var onboarded = false;
    try {
      onboarded = localStorage.getItem('vmeste.onboarded') === '1';
    } catch (e) { /* ignore */ }

    if (App.UI) App.UI.init();

    /* ссылка-приглашение: #r=CODE — пара подключается сама */
    var invited = inviteFromHash();
    if (invited && App.UI) {
      App.UI.joinByCode(invited, true);
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      onboarded = true;
      if (!Store.me().name || Store.me().name === 'Я') {
        setTimeout(function () { App.UI.namePrompt(); }, 320);
      } else {
        App.UI.toast('Пара подключена');
      }
    }

    /* первый запуск */
    if (!onboarded && App.UI) {
      setTimeout(function () {
        App.UI.welcome();
      }, 420);
    }

    /* соединение */
    if (App.Net && App.Net.ready()) {
      Sync.start();
    } else {
      Sync.setStatus('local');
    }

    Notify.restart();
    setTimeout(function () {
      Notify.ask();
    }, 4000);

    /* прячем заставку */
    setTimeout(function () {
      var b = document.getElementById('boot');
      if (b) {
        b.classList.add('gone');
        setTimeout(function () {
          b.style.display = 'none';
        }, 400);
      }
    }, 260);

    /* вкладка вернулась — догоняем */
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) Sync.wake();
    });

    /* смена суток */
    var lastDay = U.todayKey();
    setInterval(function () {
      var now = U.todayKey();
      if (now !== lastDay) {
        lastDay = now;
        App.UI.renderAll();
        Sync.start();
      }
    }, 30000);

    /* сохраняем при выходе */
    window.addEventListener('pagehide', function () {
      Store.save(true);
    });
    window.addEventListener('beforeunload', function () {
      Store.save(true);
    });

    /* service worker только на https (GitHub Pages) */
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }

    /* экран не должен гаснуть во время «сеанса заботы» — мягко, без фанатизма */
    if ('wakeLock' in navigator && navigator.wakeLock) {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          navigator.wakeLock.request('screen').catch(function () {});
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
