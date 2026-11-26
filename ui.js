/* ────────────────────────────────────────────────────────────────
   ui.js — отрисовка экранов и обработка действий
   Всё общение с моделью идёт через App.Store / App.Sync
   ──────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var Store = App.Store;
  var Sync = App.Sync;

  var MOODS = ['😞', '😕', '🙂', '😊', '🥰'];
  var CIRC = 326.73;
  var currentTab = 'today';
  var toastTimer = null;
  var settingsFilled = false;

  var UI = (App.UI = {
    tab: 'today',
    sheetOpen: false,

    /* ══════════════════════════ запуск ══════════════════════════ */

    init: function () {
      this.cache();
      this.bind();
      this.renderAll();
      this.renderSync();
    },

    cache: function () {
      this.n = {
        greet: U.$('#greet'),
        todayLabel: U.$('#todayLabel'),
        dayScore: U.$('#dayScore'),
        dayScoreCap: U.$('#dayScoreCap'),
        softBanner: U.$('#softBanner'),
        inboxBanner: U.$('#inboxBanner'),
        waterRing: U.$('#waterRing'),
        waterMl: U.$('#waterMl'),
        waterGoal: U.$('#waterGoal'),
        waterPct: U.$('#waterPct'),
        waterLog: U.$('#waterLog'),
        mealsBox: U.$('#mealsBox'),
        mealsMeta: U.$('#mealsMeta'),
        mealNote: U.$('#mealNote'),
        sleepFrom: U.$('#sleepFrom'),
        sleepTo: U.$('#sleepTo'),
        sleepMeta: U.$('#sleepMeta'),
        sleepBar: U.$('#sleepBar'),
        activityMeta: U.$('#activityMeta'),
        activityBar: U.$('#activityBar'),
        activityHint: U.$('#activityHint'),
        medsBox: U.$('#medsBox'),
        moodBox: U.$('#moodBox'),
        flagsBox: U.$('#flagsBox'),
        feelingNote: U.$('#feelingNote'),
        feelingMeta: U.$('#feelingMeta'),
        streakNum: U.$('#streakNum'),
        streakCap: U.$('#streakCap'),
        brandSub: U.$('#brandSub'),
        syncDot: U.$('#syncDot'),
        syncLabel: U.$('#syncLabel'),
        pairEmpty: U.$('#pairEmpty'),
        pairBody: U.$('#pairBody'),
        pairSub: U.$('#pairSub'),
        partnerAvatar: U.$('#partnerAvatar'),
        partnerName: U.$('#partnerName'),
        partnerSeen: U.$('#partnerSeen'),
        partnerGrid: U.$('#partnerGrid'),
        incomingBox: U.$('#incomingBox'),
        incoming: U.$('#incomingBox'),
        sendQuick: U.$('#sendQuick'),
        pairStats: U.$('#pairStats'),
        pairFoot: U.$('#pairFoot'),
        histSummary: U.$('#histSummary'),
        histGrid: U.$('#histGrid'),
        histMonth: U.$('#histMonth'),
        waterChart: U.$('#waterChart'),
        noseChart: U.$('#noseChart'),
        noseHint: U.$('#noseHint'),
        sheetBack: U.$('#sheetBack'),
        sheetTitle: U.$('#sheetTitle'),
        sheetBody: U.$('#sheetBody'),
        toast: U.$('#toast'),
        medsList: U.$('#medsList'),
        roomState: U.$('#roomState'),
        dbStatus: U.$('#dbStatus'),
        storageInfo: U.$('#storageInfo')
      };
    },

    /* ══════════════════════════ события ══════════════════════════ */

    bind: function () {
      var self = this;

      document.addEventListener('click', function (ev) {
        var btn = ev.target.closest ? ev.target.closest('[data-action]') : null;
        if (!btn) return;
        var action = btn.getAttribute('data-action');
        self.action(action, btn, ev);
      });

      document.addEventListener('change', function (ev) {
        self.onChange(ev.target);
      });

      var note = U.$('#mealNote');
      if (note) {
        note.addEventListener('input', U.debounce(function () {
          Store.setMealNote(note.value, dateOfScreen());
        }, 400));
      }

      var fnote = U.$('#feelingNote');
      if (fnote) {
        fnote.addEventListener('input', U.debounce(function () {
          Store.setFeelingNote(fnote.value, dateOfScreen());
        }, 400));
      }

      var imp = U.$('#importFile');
      if (imp) {
        imp.addEventListener('change', function () {
          var f = imp.files && imp.files[0];
          if (!f) return;
          var reader = new FileReader();
          reader.onload = function () {
            var res = Store.importJson(String(reader.result || ''));
            if (res.ok) self.toast('Импортировано дней: ' + res.merged);
            else self.toast(res.error);
            imp.value = '';
            self.renderAll();
            Sync.start();
          };
          reader.readAsText(f);
        });
      }

      if (this.n.sheetBack) {
        this.n.sheetBack.addEventListener('click', function (ev) {
          if (ev.target === self.n.sheetBack) self.closeSheet();
        });
      }

      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
          Sync.wake();
          self.renderAll();
        }
      });

      Store.on(function (what, payload) {
        self.onStore(what, payload);
      });
    },

    onStore: function (what, payload) {
      if (what === 'day') {
        this.renderToday();
        this.renderPair();
        if (payload) Sync.schedulePush(payload);
        return;
      }
      if (what === 'remote-day' || what === 'remote') {
        this.renderToday();
        this.renderPair();
        this.renderHistory();
        return;
      }
      if (what === 'live' || what === 'pair-found') {
        this.renderPair();
        this.renderInbox();
        return;
      }
      if (what === 'sync') {
        this.renderSync();
        return;
      }
      if (what === 'meds') {
        this.renderToday();
        this.renderSettings();
        return;
      }
      if (what === 'me') {
        this.renderToday();
        this.renderPair();
        return;
      }
      if (what === 'storage-error') {
        this.toast('Память телефона заполнена — данные могут не сохраниться');
        return;
      }
      this.renderAll();
    },

    /* ══════════════════════════ навигация ══════════════════════════ */

    go: function (tab) {
      currentTab = tab;
      this.tab = tab;
      U.$$('.screen').forEach(function (s) {
        s.classList.toggle('active', s.getAttribute('data-screen') === tab);
      });
      U.$$('#tabs .tab').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-tab') === tab);
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (tab === 'history') this.renderHistory();
      if (tab === 'pair') this.renderPair();
      if (tab === 'settings') this.renderSettings();
      if (tab === 'today') this.renderToday();
    },

    renderAll: function () {
      this.renderToday();
      this.renderPair();
      this.renderHistory();
      this.renderSettings();
      this.renderSync();
    },

    renderSync: function () {
      var n = this.n;
      if (!n || !n.syncDot) return;
      var st = Sync.status;
      n.syncDot.className = 'sync-dot ' + st;
      n.syncLabel.textContent = Sync.label();
      if (n.brandSub) {
        var p = Store.partner();
        n.brandSub.textContent = p && p.name ? Store.me().name + ' + ' + p.name : 'забота вдвоём';
      }
    },

    /* ══════════════════════════ СЕГОДНЯ ══════════════════════════ */

    renderToday: function () {
      var n = this.n;
      if (!n.greet) return;

      var date = U.todayKey();
      var doc = Store.mine(date);
      var st = Store.state.settings;
      var me = Store.me();
      var name = me.name && me.name !== 'Я' ? me.name : '';
      var hour = new Date().getHours();
      var hi = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';

      n.greet.textContent = name ? hi + ', ' + name : hi;
      n.todayLabel.textContent = U.DATE_HUMAN(date);

      /* мягкий режим */
      n.softBanner.classList.toggle('hidden', !st.soft);

      var score = Store.score(doc);
      if (st.soft) {
        n.dayScore.innerHTML = '🌿';
        n.dayScoreCap.textContent = 'по ощущениям';
      } else {
        n.dayScore.innerHTML = score + '<span>%</span>';
        n.dayScoreCap.textContent = score >= 85 ? 'отлично' : score >= 55 ? 'хорошо' : score > 0 ? 'начало' : 'день';
      }

      /* вода */
      var total = Store.waterTotal(doc);
      var pct = Store.waterPct(doc);
      var shown = Math.min(pct, 100);
      n.waterRing.style.strokeDashoffset = String(CIRC * (1 - shown / 100));
      n.waterRing.classList.toggle('full', pct >= 100);
      n.waterMl.innerHTML = total + ' <small>мл</small>';
      n.waterGoal.textContent = 'из ' + U.ml(st.goalWater) + ' · стакан ' + st.glass + ' мл';
      n.waterPct.textContent = st.soft ? (pct >= 100 ? 'достаточно 🌿' : 'пей понемногу') : pct + '%';

      var log = (doc.water || []).slice(-8);
      n.waterLog.innerHTML = log.length
        ? log
            .map(function (w) {
              return '<span class="water-chip">' + U.ml(w.ml) + ' · ' + U.TIME(w.t) + '</span>';
            })
            .join('')
        : '<span class="water-chip">ещё ни капли — начни с половины стакана</span>';

      /* еда */
      var meals = doc.meals || {};
      var cnt = Store.mealsCount(doc);
      n.mealsMeta.textContent = cnt + ' из ' + st.goalMeals;
      n.mealsBox.innerHTML = App.MEALS.map(function (m) {
        return (
          '<button class="chip' + (meals[m.key] ? ' on' : '') + '" data-action="meal-toggle" data-meal="' +
          m.key + '" type="button"><span class="chip-ico">' + m.ico + '</span>' + m.label + '</button>'
        );
      }).join('');
      if (document.activeElement !== n.mealNote) n.mealNote.value = doc.mealNote || '';

      /* сон */
      var sl = doc.sleep || {};
      if (document.activeElement !== n.sleepFrom) n.sleepFrom.value = sl.from || '';
      if (document.activeElement !== n.sleepTo) n.sleepTo.value = sl.to || '';
      var hours = Store.sleepHours(doc);
      n.sleepMeta.textContent = hours ? U.hours(hours) : '—';
      n.sleepBar.style.width = U.clamp((hours / (st.goalSleep || 8)) * 100, 0, 100) + '%';
      n.sleepBar.classList.toggle('ok', hours >= (st.goalSleep || 8));

      /* активность */
      var act = Store.activityTotal(doc);
      n.activityMeta.textContent = U.hm(act);
      n.activityBar.style.width = U.clamp((act / (st.goalActivity || 120)) * 100, 0, 100) + '%';
      n.activityBar.classList.toggle('ok', act >= (st.goalActivity || 120));
      n.activityHint.textContent = act === 0
        ? 'Врачи советуют минимум 2 часа движения в день, но начинать можно с пяти минут.'
        : act < (st.goalActivity || 120)
          ? 'Ещё ' + U.hm((st.goalActivity || 120) - act) + '. Без спешки — 5 минут тоже считаются.'
          : 'Норма дня. Тело скажет спасибо.';

      /* лекарства */
      var meds = Store.state.meds;
      var md = doc.meds || {};
      n.medsBox.innerHTML = meds.length
        ? meds
            .map(function (m) {
              return (
                '<button class="chip' + (md[m.id] ? ' on' : '') + '" data-action="med-toggle" data-med="' +
                U.esc(m.id) + '" type="button"><span class="chip-ico">' + (m.ico || '💊') + '</span>' +
                U.esc(m.name) + '</button>'
              );
            })
            .join('')
        : '<p class="hint">Список пуст — добавьте витамины в настройках.</p>';

      /* настроение */
      var feel = doc.feeling || {};
      n.moodBox.innerHTML = MOODS.map(function (emo, i) {
        var v = i + 1;
        return (
          '<button class="mood' + (feel.mood === v ? ' on' : '') + '" data-action="mood" data-mood="' + v +
          '" type="button" aria-label="настроение ' + v + '">' + emo + '</button>'
        );
      }).join('');

      var flags = [];
      flags.push(
        '<button class="flag' + (feel.nose ? ' on' : '') + '" data-action="nose-add" type="button">🩸 кровь из носа' +
        (feel.nose ? ' <span class="cnt">' + feel.nose + '</span>' : '') + '</button>'
      );
      if (feel.nose) flags.push('<button class="flag" data-action="nose-reset" type="button">↺ сброс</button>');
      flags.push(
        '<button class="flag' + (feel.dizzy ? ' on' : '') + '" data-action="flag" data-flag="dizzy" type="button">😵‍💫 кружится голова</button>'
      );
      flags.push(
        '<button class="flag' + (feel.weak ? ' on' : '') + '" data-action="flag" data-flag="weak" type="button">🪫 слабость</button>'
      );
      n.flagsBox.innerHTML = flags.join('');

      if (document.activeElement !== n.feelingNote) n.feelingNote.value = feel.note || '';
      n.feelingMeta.textContent = feel.mood ? ['', 'плохо', 'так себе', 'нормально', 'хорошо', 'отлично'][feel.mood] : '';

      /* серия */
      var streak = Store.streak();
      n.streakNum.textContent = streak;
      n.streakCap.textContent = streak === 0 ? 'начнём сегодня?' : streak === 1 ? 'день подряд' : 'дней подряд';

      this.renderInbox();
    },

    renderInbox: function () {
      var n = this.n;
      if (!n.inboxBanner) return;
      var live = Store.state.partnerLive;
      var seen = Store.state.seen || {};
      if (!live || !Store.hasPartner()) {
        n.inboxBanner.classList.add('hidden');
        return;
      }

      var p = Store.partner();
      var items = [];
      if (live.note && live.note.ts > (seen.note || 0)) {
        items.push({ kind: 'note', ts: live.note.ts, text: live.note.text });
      }
      if (live.nudge && live.nudge.ts > (seen.nudge || 0)) {
        items.push({ kind: 'nudge', ts: live.nudge.ts, text: live.nudge.text });
      }
      if (live.heart && live.heart > (seen.heart || 0)) {
        items.push({ kind: 'heart', ts: live.heart, text: '💛 сердечко' });
      }
      if (!items.length) {
        n.inboxBanner.classList.add('hidden');
        return;
      }
      items.sort(function (a, b) { return b.ts - a.ts; });
      var it = items[0];
      n.inboxBanner.innerHTML =
        '<span class="banner-ico">💌</span>' +
        '<div class="msg"><b>' + U.esc(p.name || 'Она') + ' · ' + U.timeAgo(it.ts) + '</b>' +
        '<i>«' + U.esc(it.text) + '»</i></div>' +
        '<button class="banner-x" data-action="dismiss-inbox" type="button" aria-label="Скрыть">×</button>';
      n.inboxBanner.classList.remove('hidden');
    },

    dismissInbox: function () {
      var live = Store.state.partnerLive || {};
      var seen = Store.state.seen || {};
      if (live.note) seen.note = live.note.ts;
      if (live.nudge) seen.nudge = live.nudge.ts;
      if (live.heart) seen.heart = live.heart;
      Store.state.seen = seen;
      Store.save();
      this.renderInbox();
    },

    /* ══════════════════════════ ВМЕСТЕ ══════════════════════════ */

    renderPair: function () {
      var n = this.n;
      if (!n.pairBody) return;

      var has = Store.hasPartner();

      n.pairEmpty.classList.toggle('hidden', !!has);
      n.pairBody.classList.toggle('hidden', !has);

      var p = Store.partner();
      var live = Store.state.partnerLive || {};
      var online = live.ts && Date.now() - live.ts < 150000;

      n.pairSub.textContent = has ? 'вы вдвоём' : 'ваша пара';
      n.partnerAvatar.textContent = p.emoji || '💜';
      n.partnerName.textContent = p.name || 'Партнёр';
      n.partnerSeen.textContent = has
        ? online
          ? 'в сети'
          : live.ts
            ? 'был(а) ' + U.timeAgo(live.ts)
            : 'давно не заходил(а)'
        : '—';

      if (!has) return;

      var date = U.todayKey();
      var doc = Store.doc(date, 'partner');
      var st = Store.state.settings;

      var rows = [
        { cls: 'w', ico: '💧', label: 'Вода', val: U.ml(Store.waterTotal(doc)), pct: U.clamp(Store.waterTotal(doc) / (st.goalWater || 2000) * 100, 0, 100) },
        { cls: 'f', ico: '🍽', label: 'Еда', val: Store.mealsCount(doc) + ' из ' + st.goalMeals, pct: U.clamp(Store.mealsCount(doc) / (st.goalMeals || 3) * 100, 0, 100) },
        { cls: 'a', ico: '🚶', label: 'Активность', val: U.hm(Store.activityTotal(doc)), pct: U.clamp(Store.activityTotal(doc) / (st.goalActivity || 120) * 100, 0, 100) },
        { cls: 's', ico: '😴', label: 'Сон', val: Store.sleepHours(doc) ? U.hours(Store.sleepHours(doc)) : '—', pct: U.clamp(Store.sleepHours(doc) / (st.goalSleep || 8) * 100, 0, 100) }
      ];

      var feel = doc.feeling || {};
      if (feel.mood || feel.nose || feel.dizzy || feel.weak || feel.note) {
        var bits = [];
        if (feel.mood) bits.push(MOODS[feel.mood - 1] || '');
        if (feel.nose) bits.push('🩸 ' + feel.nose);
        if (feel.dizzy) bits.push('😵‍💫');
        if (feel.weak) bits.push('🪫');
        rows.push({
          cls: 'f',
          ico: '🫶',
          label: 'Самочувствие',
          val: bits.join(' ') || '—',
          pct: feel.mood ? feel.mood * 20 : 0
        });
        if (feel.note) rows.push({ cls: 's', ico: '💬', label: 'Заметка', val: U.esc(feel.note), pct: 0 });
      }

      n.partnerGrid.innerHTML = rows
        .map(function (r) {
          return (
            '<div class="prow">' +
            '<div class="prow-top"><span class="lbl">' + r.ico + ' ' + r.label + '</span>' +
            '<span class="val">' + r.val + '</span></div>' +
            '<div class="pbar ' + r.cls + '"><i style="width:' + r.pct + '%"></i></div>' +
            '</div>'
          );
        })
        .join('');

      /* входящие */
      var items = [];
      if (live.note) items.push({ ico: '✉️', text: live.note.text, ts: live.note.ts });
      if (live.nudge) items.push({ ico: '🔔', text: live.nudge.text, ts: live.nudge.ts });
      if (live.heart) items.push({ ico: '💛', text: 'сердечко', ts: live.heart });
      items.sort(function (a, b) { return b.ts - a.ts; });
      n.incoming.innerHTML = items.length
        ? items
            .slice(0, 6)
            .map(function (it) {
              return (
                '<div class="inc-item"><span>' + it.ico + '</span><span>' + U.esc(it.text) +
                '</span><span class="when">' + U.timeAgo(it.ts) + '</span></div>'
              );
            })
            .join('')
        : '<div class="inc-item empty">пока ничего — отправьте первым</div>';

      /* быстрые фразы */
      var phrases = [
        { t: 'Попей водички 💧', i: '💧' },
        { t: 'Поешь, пожалуйста 🍲', i: '🍲' },
        { t: 'Как ты? 🫶', i: '🫶' },
        { t: 'Отдохни немного 🌙', i: '🌙' },
        { t: 'Ты умница 💛', i: '💛' }
      ];
      n.sendQuick.innerHTML = phrases
        .map(function (ph) {
          return (
            '<button class="qbtn" data-action="send-nudge" data-text="' + U.esc(ph.t) + '" type="button">' +
            ph.i + ' ' + U.esc(ph.t.replace(/ \S+$/, '')) + '</button>'
          );
        })
        .join('');

      /* неделя */
      var mine = Store.history(7);
      var myWater = avg(mine.map(function (d) { return d.water; }));
      var myDays = mine.filter(function (d) { return d.touched; }).length;
      var who = U.esc(p.name || 'Она');

      n.pairStats.innerHTML =
        '<div class="pstat me"><div class="pstat-cap">моя вода, 7 дней</div>' +
        '<div class="pstat-val">' + U.ml(myWater) + '</div></div>' +
        '<div class="pstat her"><div class="pstat-cap">' + who + ' · вода сегодня</div>' +
        '<div class="pstat-val">' + U.ml(Store.waterTotal(doc)) + '</div></div>' +
        '<div class="pstat me"><div class="pstat-cap">мои дни с записями</div>' +
        '<div class="pstat-val">' + myDays + ' из 7</div></div>' +
        '<div class="pstat her"><div class="pstat-cap">' + who + ' · балл дня</div>' +
        '<div class="pstat-val">' + (Store.isTouched(doc) ? Store.score(doc) + '%' : '—') + '</div></div>';

      n.pairFoot.textContent = 'Обновлено ' + U.timeAgo(Store.dayBox(date, false) ? Store.dayBox(date, false).syncedAt : 0);
    },

    /* ══════════════════════════ ИСТОРИЯ ══════════════════════════ */

    renderHistory: function () {
      var n = this.n;
      if (!n.histGrid) return;

      var hist = Store.history(30);
      var touched = hist.filter(function (d) { return d.touched; });
      var avgWater = avg(touched.map(function (d) { return d.water; }));
      var avgScore = avg(touched.map(function (d) { return d.score; }));
      var noseTotal = hist.reduce(function (s, d) { return s + d.nose; }, 0);

      n.histSummary.innerHTML =
        cell('дней с записями', touched.length + '<small> / 30</small>') +
        cell('вода в среднем', U.ml(avgWater)) +
        cell('средний балл', Math.round(avgScore) + '<small>%</small>');

      /* календарь */
      n.histMonth.textContent = U.MONTH(U.todayKey());

      var calMap = {};
      Store.history(35).forEach(function (x) { calMap[x.key] = x; });

      var start = U.addDays(U.todayKey(), -34);
      var startDow = (U.parseKey(start).getDay() + 6) % 7; /* пн = 0 */
      var html = U.DOW.slice(1).concat(U.DOW.slice(0, 1)).map(function (d) {
        return '<div class="cal-dow">' + d + '</div>';
      }).join('');

      for (var b = 0; b < startDow; b++) html += '<div class="cal-day blank"></div>';

      for (var i = 0; i < 35; i++) {
        var key = U.addDays(start, i);
        var d = calMap[key];
        var lvl = !d || !d.touched ? 'l0' : d.score >= 80 ? 'l3' : d.score >= 45 ? 'l2' : 'l1';
        if (!d) {
          html += '<div class="cal-day l0 future"><span>' + U.pad2(U.parseKey(key).getDate()) + '</span></div>';
          continue;
        }
        html +=
          '<button class="cal-day ' + lvl + (key === U.todayKey() ? ' today' : '') +
          '" data-action="day-open" data-date="' + key + '" type="button">' +
          '<span>' + U.pad2(U.parseKey(key).getDate()) + '</span>' +
          (d.nose ? '<span class="nose">🩸</span>' : '') +
          '</button>';
      }
      n.histGrid.innerHTML = html;

      /* график воды */
      var maxWater = Math.max(2000, Math.max.apply(null, hist.map(function (d) { return d.water; })));
      n.waterChart.innerHTML = hist.map(function (d) {
        var hgt = Math.round((d.water / maxWater) * 100);
        return '<div class="bar' + (d.water ? '' : ' zero') + '" style="height:' + (d.water ? Math.max(3, hgt) : 0) + '%" title="' + d.key + ': ' + U.ml(d.water) + '"></div>';
      }).join('');

      var maxNose = Math.max(1, Math.max.apply(null, hist.map(function (d) { return d.nose; })));
      n.noseChart.innerHTML = hist.map(function (d) {
        return '<div class="bar nose' + (d.nose ? '' : ' zero') + '" style="height:' + (d.nose ? Math.max(6, (d.nose / maxNose) * 100) : 0) + '%" title="' + d.key + ': ' + d.nose + '"></div>';
      }).join('');

      n.noseHint.textContent = noseTotal
        ? 'За 30 дней: ' + noseTotal + ' раз(а). Больше воды и мягче режим — и станет легче. Это не приговор, это повод беречься.'
        : 'За 30 дней ни одного случая. Отличный знак 💛';

      this.renderStorageInfo();
    },

    renderStorageInfo: function () {
      var n = this.n;
      if (!n.storageInfo) return;
      var size = 0;
      try {
        size = (localStorage.getItem('vmeste.v1') || '').length;
      } catch (e) { size = 0; }
      n.storageInfo.textContent =
        'Дней сохранено: ' + Object.keys(Store.state.days).length +
        ' · в очереди на отправку: ' + Store.pendingCount() +
        ' · размер: ' + (size / 1024).toFixed(1) + ' КБ';
    },

    /* ══════════════════════════ НАСТРОЙКИ ══════════════════════════ */

    renderSettings: function () {
      var n = this.n;
      var me = Store.me();
      var st = Store.state.settings;

      setVal('#setName', me.name === 'Я' ? '' : me.name);
      setVal('#setEmoji', me.emoji || '💛');
      setVal('#setColor', me.color || '#ffb35c');
      setVal('#setWeight', st.weight || '');

      setVal('#goalsWater', st.goalWater);
      setVal('#goalsGlass', st.glass);
      setVal('#goalsSleep', st.goalSleep);
      setVal('#goalsMeals', st.goalMeals);
      setVal('#goalsActivity', st.goalActivity);

      var rem = U.$('#setRemOn');
      if (rem) rem.checked = !!st.reminders;
      setVal('#setRemEvery', st.reminderEvery);

      var soft = U.$('#setSoft');
      if (soft) soft.checked = !!st.soft;

      setVal('#setDb', Store.state.firebase.dbUrl || '');
      setVal('#setKey', Store.state.firebase.apiKey || '');
      setVal('#setRoom', Store.state.room.code || '');

      if (n.roomState) {
        var code = Store.state.room.code;
        var p = Store.partner();
        n.roomState.textContent = code
          ? p.id
            ? 'код ' + code + ' · вдвоём'
            : 'код ' + code + ' · ждём партнёра'
          : 'не создана';
      }

      if (n.dbStatus) {
        if (!App.Net.configured()) n.dbStatus.textContent = 'не подключено';
        else if (Sync.status === 'live') n.dbStatus.textContent = 'подключено, обмен идёт';
        else if (Sync.status === 'error') n.dbStatus.textContent = 'ошибка: ' + (Sync.error || 'сеть');
        else n.dbStatus.textContent = 'настроено, соединение…';
      }

      if (n.medsList) {
        n.medsList.innerHTML = Store.state.meds.length
          ? Store.state.meds
              .map(function (m) {
                return (
                  '<div class="med-row"><span class="med-ico">' + (m.ico || '💊') + '</span>' +
                  '<span class="med-name">' + U.esc(m.name) + '</span>' +
                  '<button class="med-del" data-action="del-med" data-med="' + U.esc(m.id) + '" type="button">×</button></div>'
                );
              })
              .join('')
          : '<p class="hint">Пока пусто.</p>';
      }

      settingsFilled = true;
      this.renderStorageInfo();
    },

    /* ══════════════════════════ действия ══════════════════════════ */

    action: function (action, btn, ev) {
      var date = dateOfScreen();
      var g = function (attr) {
        return btn.getAttribute(attr);
      };

      switch (action) {
        case 'tab':
          this.go(g('data-tab'));
          break;

        case 'sync-info':
          this.showSyncSheet();
          break;

        case 'soft-off':
          Store.state.settings.soft = false;
          Store.save();
          this.renderAll();
          break;

        case 'water-add':
          Store.addWater(Number(g('data-ml')) || Store.state.settings.glass, date);
          vibrate(12);
          break;

        case 'water-undo':
          this.toast(Store.undoWater(date) ? 'Убрала последний стакан' : 'Отменять нечего');
          break;

        case 'meal-toggle':
          Store.toggleMeal(g('data-meal'), date);
          vibrate(8);
          break;

        case 'med-toggle':
          Store.toggleMed(g('data-med'), date);
          vibrate(8);
          break;

        case 'act-add':
          Store.addActivity(Number(g('data-min')) || 5, g('data-kind') || 'ходьба', date);
          vibrate(8);
          break;

        case 'act-sheet':
          this.activitySheet(date);
          break;

        case 'mood':
          Store.setMood(Number(g('data-mood')), date);
          break;

        case 'flag':
          Store.toggleFlag(g('data-flag'), date);
          break;

        case 'nose-add':
          Store.bumpNose(date);
          vibrate(14);
          break;

        case 'nose-reset':
          Store.edit(date, function (d) {
            d.feeling = d.feeling || {};
            d.feeling.nose = 0;
          });
          break;

        case 'day-open':
          this.daySheet(g('data-date'));
          break;

        case 'sheet-close':
          this.closeSheet();
          break;

        case 'export':
          this.doExport();
          break;

        case 'import':
          U.$('#importFile').click();
          break;

        case 'wipe':
          this.confirmWipe();
          break;

        case 'calc-water':
          this.calcWater();
          break;

        case 'room-create':
          this.createRoom();
          break;

        case 'room-join':
          this.joinRoom();
          break;

        case 'room-leave':
          this.leaveRoom();
          break;

        case 'copy-room':
          this.copyRoom();
          break;

        case 'db-connect':
          this.connectDb();
          break;

        case 'db-test':
          this.testDb();
          break;

        case 'add-med':
          this.addMed();
          break;

        case 'del-med':
          Store.removeMed(g('data-med'));
          this.toast('Удалено');
          break;

        case 'pair-refresh':
          Sync.start().then(function () {});
          this.toast('Обновляю…');
          break;

        case 'send-heart':
          if (!Store.hasPartner()) return this.toast('Сначала создайте комнату');
          Sync.sendHeart();
          this.toast('💛 улетело');
          vibrate(16);
          break;

        case 'send-nudge':
          if (!Store.hasPartner()) return this.toast('Сначала создайте комнату');
          Sync.sendNudge(g('data-text'));
          this.toast('Отправлено');
          break;

        case 'send-note':
          this.sendNote();
          break;

        case 'dismiss-inbox':
          this.dismissInbox();
          break;

        case 'welcome-save':
          this.saveWelcome();
          break;

        case 'welcome-room':
          this.saveWelcome();
          this.go('settings');
          break;

        default:
          break;
      }
    },

    /* ── поля формы ── */

    onChange: function (el) {
      if (!el || !el.id) return;
      var st = Store.state.settings;
      var id = el.id;

      switch (id) {
        case 'sleepFrom':
          Store.setSleep(el.value, undefined, U.todayKey());
          break;
        case 'sleepTo':
          Store.setSleep(undefined, el.value, U.todayKey());
          break;

        case 'setName':
          Store.setMe({ name: el.value.trim().slice(0, 24) || 'Я' });
          Sync.pushMember();
          Sync.pushLive();
          break;
        case 'setEmoji':
          Store.setMe({ emoji: el.value.trim().slice(0, 4) || '💛' });
          Sync.pushMember();
          Sync.pushLive();
          break;
        case 'setColor':
          Store.setMe({ color: el.value });
          Sync.pushMember();
          Sync.pushLive();
          break;

        case 'setWeight':
          st.weight = U.clamp(Number(el.value) || 0, 0, 250);
          Store.save();
          break;

        case 'goalsWater':
          st.goalWater = U.clamp(Number(el.value) || 2000, 500, 5000);
          Store.save();
          Store.emit('today');
          break;
        case 'goalsGlass':
          st.glass = U.clamp(Number(el.value) || 250, 100, 600);
          Store.save();
          Store.emit('today');
          break;
        case 'goalsSleep':
          st.goalSleep = U.clamp(Number(el.value) || 8, 5, 12);
          Store.save();
          Store.emit('today');
          break;
        case 'goalsMeals':
          st.goalMeals = U.clamp(Number(el.value) || 3, 1, 6);
          Store.save();
          Store.emit('today');
          break;
        case 'goalsActivity':
          st.goalActivity = U.clamp(Number(el.value) || 120, 10, 300);
          Store.save();
          Store.emit('today');
          break;

        case 'setRemOn':
          st.reminders = el.checked;
          Store.save();
          if (App.Notify) App.Notify.restart();
          break;
        case 'setRemEvery':
          st.reminderEvery = U.clamp(Number(el.value) || 45, 15, 180);
          Store.save();
          if (App.Notify) App.Notify.restart();
          break;
        case 'setSoft':
          st.soft = el.checked;
          Store.save();
          this.renderToday();
          this.toast(el.checked ? 'Мягкий режим включён 🌿' : 'Мягкий режим выключен');
          break;

        case 'setDb':
          Store.state.firebase.dbUrl = el.value.trim();
          Store.save();
          break;
        case 'setKey':
          Store.state.firebase.apiKey = el.value.trim();
          Store.save();
          break;
        case 'setRoom':
          Store.state.room.code = el.value.trim().toUpperCase();
          Store.save();
          break;

        default:
          break;
      }
    },

    /* ── действия с данными ── */

    doExport: function () {
      var text = Store.exportJson();
      var name = 'vmeste-' + U.todayKey() + '.json';
      if (U.download(name, text)) this.toast('Файл сохранён: ' + name);
      else {
        U.copy(text);
        this.toast('Скопировано в буфер обмена');
      }
    },

    confirmWipe: function () {
      var self = this;
      this.sheet(
        'Стереть всё?',
        '<p>Пропадут записи, цели и комната на этом телефоне. Восстановить можно только из резервной копии.</p>' +
        '<div class="row-inline top-gap">' +
        '<button class="btn danger" data-action="wipe-yes" type="button">Да, стереть</button>' +
        '<button class="btn" data-action="sheet-close" type="button">Отмена</button></div>'
      );
      setTimeout(function () {
        var yes = U.$('[data-action="wipe-yes"]');
        if (yes) {
          yes.addEventListener('click', function () {
            Store.wipe();
            self.closeSheet();
            self.renderAll();
            self.toast('Всё стёрто');
          });
        }
      }, 30);
    },

    calcWater: function () {
      var w = U.clamp(Number(U.$('#setWeight').value) || 0, 0, 250);
      if (!w) return this.toast('Сначала укажите вес');
      var ml = U.clamp(Math.round((w * 30) / 100) * 100, 1200, 3500);
      Store.state.settings.goalWater = ml;
      Store.state.settings.weight = w;
      Store.save();
      this.renderSettings();
      this.renderToday();
      this.toast('Цель по воде: ' + U.ml(ml));
    },

    /* ── комната ── */

    createRoom: function () {
      var code = U.roomCode(8);
      Store.state.room.code = code;
      Store.state.room.joinedAt = Date.now();
      Store.state.room.host = true;
      Store.save();
      this.renderSettings();
      this.toast('Комната ' + code + ' создана');
      Sync.start();
      if (U.copy(code)) this.toast('Код ' + code + ' скопирован');
    },

    joinRoom: function () {
      var code = String(U.$('#setRoom').value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) return this.toast('Код слишком короткий');
      Store.state.room.code = code;
      Store.state.room.joinedAt = Date.now();
      Store.state.room.host = false;
      Store.save();
      this.renderSettings();
      this.renderPair();
      this.toast('Вхожу в комнату ' + code);
      if (!App.Net.configured()) {
        this.toast('Код сохранён. Без Firebase обмен не пойдёт — см. ЧИТАЙ.md');
      }
      Sync.start().then(function () {
        if (Store.hasPartner()) App.UI.toast('Партнёр найден 💞');
      });
    },

    leaveRoom: function () {
      Store.state.room.code = '';
      Store.state.partnerLive = null;
      Store.setPartner({ id: '', name: '', emoji: '💜', color: '#9d7bff' });
      Store.save();
      Sync.stop();
      this.renderAll();
      this.toast('Вышли из комнаты');
    },

    copyRoom: function () {
      var code = Store.state.room.code;
      if (!code) return this.toast('Сначала создайте комнату');
      this.toast(U.copy(code) ? 'Код ' + code + ' скопирован' : 'Не удалось скопировать');
    },

    connectDb: function () {
      var db = String(U.$('#setDb').value || '').trim();
      var key = String(U.$('#setKey').value || '').trim();
      Store.state.firebase.dbUrl = db;
      Store.state.firebase.apiKey = key;
      Store.state.firebase.idToken = '';
      Store.state.firebase.refreshToken = '';
      Store.state.firebase.tokenExp = 0;
      Store.save(true);
      this.toast('Сохраняю…');
      Sync.start();
      this.renderSettings();
    },

    testDb: function () {
      var self = this;
      if (!App.Net.configured()) return this.toast('Сначала введите databaseURL');
      this.toast('Проверяю…');
      App.Net.ensureToken()
        .then(function () {
          var room = App.Net.room() || 'TEST';
          return App.Net.get('/rooms/' + room + '/meta');
        })
        .then(function () {
          self.toast('Связь есть ✓');
          self.renderSettings();
        })
        .catch(function (err) {
          self.toast('Ошибка: ' + (err.message || 'сеть'));
          self.renderSettings();
        });
    },

    addMed: function () {
      var input = U.$('#newMedName');
      var name = String(input.value || '').trim();
      if (!name) return this.toast('Введите название');
      Store.addMed(name);
      input.value = '';
      this.renderSettings();
    },

    sendNote: function () {
      var input = U.$('#noteText');
      var text = String(input.value || '').trim();
      if (!text) return this.toast('Напишите пару слов');
      if (!Store.hasPartner()) return this.toast('Сначала создайте комнату');
      Sync.sendNote(text);
      input.value = '';
      this.toast('Отправлено 💌');
    },

    saveWelcome: function () {
      var name = String(U.$('#welcomeName').value || '').trim();
      var emoji = String(U.$('#welcomeEmoji').value || '').trim() || '💛';
      Store.setMe({ name: name || 'Я', emoji: emoji.slice(0, 4) });
      try {
        localStorage.setItem('vmeste.onboarded', '1');
      } catch (e) { /* ignore */ }
      this.closeSheet();
      this.renderAll();
      Sync.pushMember();
    },

    /* ── шторки ── */

    sheet: function (title, html) {
      this.n.sheetTitle.textContent = title;
      this.n.sheetBody.innerHTML = html;
      this.n.sheetBack.classList.remove('hidden');
      this.sheetOpen = true;
      document.body.style.overflow = 'hidden';
    },

    closeSheet: function () {
      this.n.sheetBack.classList.add('hidden');
      this.sheetOpen = false;
      document.body.style.overflow = '';
    },

    activitySheet: function (date) {
      this.sheet(
        'Добавить активность',
        '<p>Сколько минут двигались? Подойдёт и прогулка, и разминка, и домашние дела.</p>' +
        '<div class="quick wrap">' +
        [5, 10, 15, 20, 30, 45, 60]
          .map(function (m) {
            return '<button class="qbtn" data-action="act-add" data-min="' + m + '" data-kind="разное" type="button">+' + m + ' мин</button>';
          })
          .join('') +
        '</div>' +
        '<div class="row-inline top-gap">' +
        '<button class="btn" data-action="act-undo" type="button">Отменить последнюю</button>' +
        '<button class="btn" data-action="sheet-close" type="button">Готово</button></div>'
      );
      var self = this;
      setTimeout(function () {
        var undo = U.$('[data-action="act-undo"]');
        if (undo) {
          undo.addEventListener('click', function () {
            Store.undoActivity(date);
            self.closeSheet();
          });
        }
      }, 20);
    },

    daySheet: function (key) {
      var doc = Store.mine(key);
      var st = Store.state.settings;
      var feel = doc.feeling || {};
      var rows = [
        ['💧 Вода', U.ml(Store.waterTotal(doc)) + ' (' + Store.waterPct(doc) + '% от цели)'],
        ['🍽 Еда', Store.mealsCount(doc) + ' из ' + st.goalMeals + (doc.mealNote ? ' · ' + U.esc(doc.mealNote) : '')],
        ['😴 Сон', Store.sleepHours(doc) ? U.hours(Store.sleepHours(doc)) : '—'],
        ['🚶 Активность', U.hm(Store.activityTotal(doc))],
        ['💊 Лекарства', Store.medsDone(doc) + ' из ' + Store.state.meds.length],
        ['🫶 Настроение', feel.mood ? MOODS[feel.mood - 1] : '—'],
        ['🩸 Кровь из носа', feel.nose || 'нет'],
        ['📊 Балл дня', Store.isTouched(doc) ? Store.score(doc) + '%' : 'нет данных']
      ];
      this.sheet(
        U.DATE_HUMAN(key),
        rows
          .map(function (r) {
            return '<div class="kv"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
          })
          .join('') +
          (feel.note ? '<p class="top-gap">«' + U.esc(feel.note) + '»</p>' : '') +
          '<button class="btn top-gap" data-action="sheet-close" type="button">Закрыть</button>'
      );
    },

    showSyncSheet: function () {
      var lines = [];
      lines.push(['Комната', Store.state.room.code || '—']);
      lines.push(['Firebase', App.Net.configured() ? 'настроен' : 'нет']);
      lines.push(['Партнёр', Store.hasPartner() ? Store.partner().name + ' ' + (Store.partner().emoji || '') : 'не найден']);
      lines.push(['Состояние', Sync.label()]);
      lines.push(['В очереди', String(Store.pendingCount())]);
      if (Sync.error) lines.push(['Ошибка', Sync.error]);

      this.sheet(
        'Синхронизация',
        lines
          .map(function (l) {
            return '<div class="kv"><span>' + l[0] + '</span><b>' + U.esc(l[1]) + '</b></div>';
          })
          .join('') +
          '<p class="top-gap">Если здесь «нет», данные живут только на этом телефоне. Настройка комнаты и Firebase — во вкладке «Настройки».</p>' +
          '<button class="btn primary top-gap" data-action="pair-refresh" type="button">Переподключиться</button>'
      );
    },

    welcome: function () {
      this.sheet(
        'Привет 💞',
        '<p>«Вместе» — тихий трекер заботы. Вода, еда, сон, движение и самочувствие. Для двоих, по-настоящему вместе.</p>' +
        '<label class="field"><span>как тебя звать</span>' +
        '<input type="text" id="welcomeName" maxlength="24" placeholder="имя или прозвище"></label>' +
        '<label class="field top-gap"><span>эмодзи-аватар</span>' +
        '<input type="text" id="welcomeEmoji" maxlength="4" placeholder="💛" value="💛"></label>' +
        '<div class="row-inline top-gap">' +
        '<button class="btn primary" data-action="welcome-save" type="button">Начать</button>' +
        '<button class="btn" data-action="welcome-room" type="button">Сразу к комнате</button>' +
        '</div>' +
        '<p class="hint">Всё хранится на телефоне. Синхронизация появится, когда вы с партнёром введёте один код комнаты.</p>'
      );
    },

    /* ── тост ── */

    toast: function (msg) {
      var t = this.n && this.n.toast;
      if (!t) return;
      t.textContent = msg;
      t.classList.remove('hidden');
      requestAnimationFrame(function () {
        t.classList.add('show');
      });
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        t.classList.remove('show');
        setTimeout(function () {
          t.classList.add('hidden');
        }, 260);
      }, 2100);
    }
  });

  /* ══════════════════════════ мелкие помощники ══════════════════════════ */

  function dateOfScreen() {
    return U.todayKey();
  }

  function setVal(sel, value) {
    var el = U.$(sel);
    if (!el) return;
    if (document.activeElement === el) return;
    if (el.value === String(value)) return;
    el.value = String(value == null ? '' : value);
  }

  function cell(cap, val) {
    return '<div class="sum-cell"><div class="sum-cap">' + cap + '</div><div class="sum-val">' + val + '</div></div>';
  }

  function avg(arr) {
    if (!arr.length) return 0;
    var s = 0;
    arr.forEach(function (v) {
      s += Number(v) || 0;
    });
    return s / arr.length;
  }

  function vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }
})();
