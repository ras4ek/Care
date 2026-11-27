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

  var MOODS = [
    { ico: 'i-face-sad', label: 'плохо' },
    { ico: 'i-face-meh', label: 'так себе' },
    { ico: 'i-face-neutral', label: 'нормально' },
    { ico: 'i-face-smile', label: 'хорошо' },
    { ico: 'i-face-love', label: 'отлично' }
  ];
  var CIRC = 326.73;
  var ACCENT = '#D9C3A0';
  var currentTab = 'today';
  var toastTimer = null;

  var UI = (App.UI = {
    tab: 'today',
    sheetOpen: false,
    lastInvite: '',

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
        waterLeft: U.$('#waterLeft'),
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
        sendQuick: U.$('#sendQuick'),
        pairStats: U.$('#pairStats'),
        pairFoot: U.$('#pairFoot'),
        histSummary: U.$('#histSummary'),
        histGrid: U.$('#histGrid'),
        histMonth: U.$('#histMonth'),
        waterChart: U.$('#waterChart'),
        noseChart: U.$('#noseChart'),
        statsGrid: U.$('#statsGrid'),
        noseHint: U.$('#noseHint'),
        sheetBack: U.$('#sheetBack'),
        sheetTitle: U.$('#sheetTitle'),
        sheetBody: U.$('#sheetBody'),
        toast: U.$('#toast'),
        medsList: U.$('#medsList'),
        roomState: U.$('#roomState'),
        roomOn: U.$('#roomOn'),
        roomOff: U.$('#roomOff'),
        roomLeave: U.$('#roomLeave'),
        roomHint: U.$('#roomHint'),
        roomAvatar: U.$('#roomAvatar'),
        roomName: U.$('#roomName'),
        inviteLink: U.$('#inviteLink'),
        myAvatar: U.$('#myAvatar'),
        storageInfo: U.$('#storageInfo'),
        welcome: U.$('#welcome'),
        todayPair: U.$('#todayPair'),
        todayPairAvatar: U.$('#todayPairAvatar'),
        todayPairName: U.$('#todayPairName'),
        todayPairMeta: U.$('#todayPairMeta')
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

      var addMed = U.$('#newMedName');
      if (addMed) {
        addMed.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            self.addMed();
          }
        });
        addMed.addEventListener('blur', function () {
          if (addMed.value.trim()) self.addMed();
        });
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
          self.renderCurrent();
        }
      });

      Store.on(function (what, payload) {
        self.onStore(what, payload);
      });
    },

    onStore: function (what, payload) {
      if (what === 'day') {
        if (currentTab === 'today') this.renderToday();
        if (payload) Sync.schedulePush(payload);
        return;
      }
      if (what === 'remote-day' || what === 'remote') {
        if (currentTab === 'today') this.renderToday();
        if (currentTab === 'pair') this.renderPair();
        if (currentTab === 'history') this.renderHistory();
        return;
      }
      if (what === 'live' || what === 'pair-found') {
        this.pairDirty = true;
        if (currentTab === 'pair') this.renderPair();
        this.renderInbox();
        if (currentTab === 'today') this.renderToday();
        return;
      }
      if (what === 'sync') {
        this.renderSync();
        return;
      }
      if (what === 'meds') {
        if (currentTab === 'today') this.renderToday();
        if (currentTab === 'settings') this.renderSettings();
        return;
      }
      if (what === 'me') {
        if (currentTab === 'today') this.renderToday();
        if (currentTab === 'pair') this.renderPair();
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
      window.scrollTo(0, 0);
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

    renderCurrent: function () {
      if (currentTab === 'today') this.renderToday();
      else if (currentTab === 'pair') this.renderPair();
      else if (currentTab === 'history') this.renderHistory();
      else if (currentTab === 'settings') this.renderSettings();
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
        n.dayScore.innerHTML = '<span class="score-ico">' + icon('i-leaf') + '</span>';
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
      n.waterMl.innerHTML = total + '<small>мл</small>';
      n.waterGoal.textContent = 'из ' + U.ml(st.goalWater);
      n.waterPct.textContent = st.soft ? (pct >= 100 ? 'достаточно' : 'пей понемногу') : pct + '%';
      if (n.waterLeft) {
        var left = Math.max(0, (st.goalWater || 2000) - total);
        n.waterLeft.textContent = left > 0 ? 'осталось ' + U.ml(left) : 'норма дня закрыта';
      }

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
          m.key + '" type="button"><span class="chip-ico">' + icon(m.ico) + '</span>' + m.label + '</button>'
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
                U.esc(m.id) + '" type="button"><span class="chip-ico">' + icon('i-pill') + '</span>' +
                U.esc(m.name) + '</button>'
              );
            })
            .join('')
        : '<p class="hint">Список пуст — добавьте витамины в настройках.</p>';

      /* настроение */
      var feel = doc.feeling || {};
      n.moodBox.innerHTML = MOODS.map(function (m, i) {
        var v = i + 1;
        return (
          '<button class="mood' + (feel.mood === v ? ' on' : '') + '" data-action="mood" data-mood="' + v +
          '" type="button" aria-label="' + m.label + '">' + icon(m.ico) + '</button>'
        );
      }).join('');

      var flags = [];
      flags.push(
        '<button class="flag' + (feel.nose ? ' on' : '') + '" data-action="nose-add" type="button">' +
        icon('i-water') + ' кровь из носа' +
        (feel.nose ? ' <span class="cnt">' + feel.nose + '</span>' : '') + '</button>'
      );
      if (feel.nose) flags.push('<button class="flag" data-action="nose-reset" type="button">' + icon('i-refresh') + ' сброс</button>');
      flags.push(
        '<button class="flag' + (feel.dizzy ? ' on' : '') + '" data-action="flag" data-flag="dizzy" type="button">' +
        icon('i-refresh') + ' кружится голова</button>'
      );
      flags.push(
        '<button class="flag' + (feel.weak ? ' on' : '') + '" data-action="flag" data-flag="weak" type="button">' +
        icon('i-battery') + ' слабость</button>'
      );
      n.flagsBox.innerHTML = flags.join('');

      if (document.activeElement !== n.feelingNote) n.feelingNote.value = feel.note || '';
      n.feelingMeta.textContent = feel.mood ? MOODS[feel.mood - 1].label : '';

      /* серия */
      var streak = Store.streak();
      n.streakNum.textContent = streak;
      n.streakCap.textContent = streak === 0 ? 'начнём сегодня?' : streak === 1 ? 'день подряд' : 'дней подряд';

      /* маленькая строка про партнёра */
      if (n.todayPair) {
        var hasPair = Store.hasPartner();
        n.todayPair.classList.toggle('hidden', !hasPair);
        if (hasPair) {
          var pp = Store.partner();
          var plive = Store.state.partnerLive || {};
          paintAvatar(n.todayPairAvatar, pp.name, pp.color);
          n.todayPairName.textContent = pp.name || 'Партнёр';
          var pdoc = Store.doc(date, 'partner');
          var meta = U.ml(Store.waterTotal(pdoc)) + ' воды';
          if (plive.ts) meta += ' · ' + (Date.now() - plive.ts < 150000 ? 'сейчас рядом' : U.timeAgo(plive.ts));
          n.todayPairMeta.textContent = meta;
        }
      }

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
        items.push({ kind: 'heart', ts: live.heart, text: 'сердечко' });
      }
      if (!items.length) {
        n.inboxBanner.classList.add('hidden');
        return;
      }
      items.sort(function (a, b) { return b.ts - a.ts; });
      var it = items[0];
      n.inboxBanner.innerHTML =
        '<span class="banner-ico">' + icon('i-inbox') + '</span>' +
        '<div class="msg"><b>' + U.esc(p.name || 'Она') + ' · ' + U.timeAgo(it.ts) + '</b>' +
        '<i>«' + U.esc(it.text) + '»</i></div>' +
        '<button class="banner-x" data-action="dismiss-inbox" type="button" aria-label="Скрыть">' +
        icon('i-x') + '</button>';
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
      paintAvatar(n.partnerAvatar, p.name, p.color);
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
        { cls: 'w', ico: 'i-water', label: 'Вода', val: U.ml(Store.waterTotal(doc)), pct: U.clamp(Store.waterTotal(doc) / (st.goalWater || 2000) * 100, 0, 100) },
        { cls: 'f', ico: 'i-meal', label: 'Еда', val: Store.mealsCount(doc) + ' из ' + st.goalMeals, pct: U.clamp(Store.mealsCount(doc) / (st.goalMeals || 3) * 100, 0, 100) },
        { cls: 'a', ico: 'i-move', label: 'Активность', val: U.hm(Store.activityTotal(doc)), pct: U.clamp(Store.activityTotal(doc) / (st.goalActivity || 120) * 100, 0, 100) },
        { cls: 's', ico: 'i-moon', label: 'Сон', val: Store.sleepHours(doc) ? U.hours(Store.sleepHours(doc)) : '—', pct: U.clamp(Store.sleepHours(doc) / (st.goalSleep || 8) * 100, 0, 100) }
      ];

      var feel = doc.feeling || {};
      if (feel.mood || feel.nose || feel.dizzy || feel.weak || feel.note) {
        var bits = [];
        if (feel.mood) bits.push(MOODS[feel.mood - 1].label);
        if (feel.nose) bits.push('кровь из носа: ' + feel.nose);
        if (feel.dizzy) bits.push('голова кружится');
        if (feel.weak) bits.push('слабость');
        rows.push({
          cls: 'f',
          ico: 'i-heart',
          label: 'Самочувствие',
          val: bits.join(' · ') || '—',
          pct: feel.mood ? feel.mood * 20 : 0
        });
        if (feel.note) rows.push({ cls: 's', ico: 'i-edit', label: 'Заметка', val: U.esc(feel.note), pct: 0 });
      }

      n.partnerGrid.innerHTML = rows
        .map(function (r) {
          return (
            '<div class="prow">' +
            '<div class="prow-top"><span class="lbl ic-' + r.cls + '">' + icon(r.ico) + ' ' + r.label + '</span>' +
            '<span class="val">' + r.val + '</span></div>' +
            '<div class="pbar ' + r.cls + '"><i style="width:' + r.pct + '%"></i></div>' +
            '</div>'
          );
        })
        .join('');

      /* входящие */
      var items = [];
      if (live.note) items.push({ ico: 'i-edit', text: live.note.text, ts: live.note.ts });
      if (live.nudge) items.push({ ico: 'i-bell', text: live.nudge.text, ts: live.nudge.ts });
      if (live.heart) items.push({ ico: 'i-heart', text: 'сердечко', ts: live.heart });
      items.sort(function (a, b) { return b.ts - a.ts; });
      n.incomingBox.innerHTML = items.length
        ? items
            .slice(0, 6)
            .map(function (it) {
              return (
                '<div class="inc-item">' + icon(it.ico) + '<span>' + U.esc(it.text) +
                '</span><span class="when">' + U.timeAgo(it.ts) + '</span></div>'
              );
            })
            .join('')
        : '<div class="inc-item empty">пока ничего — отправьте первым</div>';

      /* быстрые фразы */
      var phrases = [
        { t: 'Попей водички', i: 'i-water' },
        { t: 'Поешь, пожалуйста', i: 'i-meal' },
        { t: 'Как ты?', i: 'i-heart' },
        { t: 'Отдохни немного', i: 'i-moon' },
        { t: 'Ты умница', i: 'i-spark' }
      ];
      n.sendQuick.innerHTML = phrases
        .map(function (ph) {
          return (
            '<button class="qbtn" data-action="send-nudge" data-text="' + U.esc(ph.t) + '" type="button">' +
            icon(ph.i) + ' ' + U.esc(ph.t) + '</button>'
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

      /* календарь — текущий месяц */
      var todayKey = U.todayKey();
      var todayDate = U.parseKey(todayKey);
      n.histMonth.textContent = U.MONTH(todayKey);

      var year = todayDate.getFullYear();
      var month = todayDate.getMonth();
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var lead = (new Date(year, month, 1).getDay() + 6) % 7; /* пн = 0 */

      var html = U.DOW.slice(1).concat(U.DOW.slice(0, 1)).map(function (d) {
        return '<div class="cal-dow">' + d + '</div>';
      }).join('');

      for (var b = 0; b < lead; b++) html += '<div class="cal-day blank"></div>';

      for (var day = 1; day <= daysInMonth; day++) {
        var key = U.dateKey(new Date(year, month, day));
        if (key > todayKey) {
          html += '<div class="cal-day future"><span>' + U.pad2(day) + '</span></div>';
          continue;
        }
        var box = Store.dayBox(key, false);
        var d = box && box.mine ? box.mine : null;
        var touched = d ? Store.isTouched(d) : false;
        var sc = touched ? Store.score(d) : 0;
        var lvl = !touched ? 'l0' : sc >= 80 ? 'l3' : sc >= 45 ? 'l2' : 'l1';
        var nose = d && d.feeling ? d.feeling.nose || 0 : 0;
        html +=
          '<button class="cal-day ' + lvl + (key === todayKey ? ' today' : '') +
          '" data-action="day-open" data-date="' + key + '" type="button">' +
          '<span>' + U.pad2(day) + '</span>' +
          (nose ? '<span class="nose"></span>' : '') +
          '</button>';
      }

      var rest = (7 - ((lead + daysInMonth) % 7)) % 7;
      for (var z = 0; z < rest; z++) html += '<div class="cal-day blank"></div>';
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
        : 'За 30 дней ни одного случая. Отличный знак.';

      this.renderStats(hist);
      this.renderStorageInfo();
    },

    renderStats: function (hist) {
      var n = this.n;
      if (!n.statsGrid) return;
      var s = computeStats(hist);
      var cells = [
        ['Вода за 30 дней', U.ml(s.totalWater)],
        ['В среднем воды', U.ml(s.avgWater)],
        ['Сон в среднем', s.avgSleep ? U.hours(s.avgSleep) : '—'],
        ['Ночей со сном', s.sleepDays + '<small> из ' + (s.touched || 0) + '</small>'],
        ['Еда в день', s.touched ? (Math.round(s.totalMeals / s.touched * 10) / 10) + '<small> пр.п.</small>' : '—'],
        ['Движение в день', s.touched ? U.hm(Math.round(s.totalAct / s.touched)) : '—'],
        ['Серия рекорд', s.bestStreak + '<small> дн.</small>'],
        ['Настроение', s.avgMood ? MOODS[Math.round(s.avgMood) - 1].label : '—'],
        ['Кровь из носа', s.totalNose + '<small> раз</small>'],
        ['Дней с записями', s.touched + '<small> из 30</small>']
      ];
      n.statsGrid.innerHTML = cells
        .map(function (c) {
          return '<div class="stat"><div class="stat-cap">' + c[0] + '</div><div class="stat-val">' + c[1] + '</div></div>';
        })
        .join('');
    },

    renderStorageInfo: function () {
      var n = this.n;
      if (!n.storageInfo) return;
      var days = Object.keys(Store.state.days || {}).length;
      var pending = Store.pendingCount();
      var txt = days ? 'Записей: ' + days + ' ' + plural(days, 'день', 'дня', 'дней') : 'Записей пока нет';
      if (pending) txt += ' · ждут отправки: ' + pending;
      n.storageInfo.textContent = txt;
    },

    /* ══════════════════════════ НАСТРОЙКИ ══════════════════════════ */

    renderSettings: function () {
      var n = this.n;
      var me = Store.me();
      var st = Store.state.settings;

      setVal('#setName', me.name === 'Я' ? '' : me.name);
      setVal('#setColor', me.color || ACCENT);
      setVal('#setWeight', st.weight || '');
      paintAvatar(n.myAvatar, me.name, me.color);
      this.paintSwatches(me.color || ACCENT);

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

      this.renderRoom();

      if (n.medsList) {
        n.medsList.innerHTML = Store.state.meds.length
          ? Store.state.meds
              .map(function (m) {
                return (
                  '<div class="med-row"><span class="med-ico">' + icon('i-pill') + '</span>' +
                  '<span class="med-name">' + U.esc(m.name) + '</span>' +
                  '<button class="med-del" data-action="del-med" data-med="' + U.esc(m.id) + '" type="button" aria-label="Удалить">' +
                  icon('i-x') + '</button></div>'
                );
              })
              .join('')
          : '<p class="hint" style="padding:2px 0 6px">Пока пусто. Добавьте витамин или лекарство ниже.</p>';
      }

      this.renderStorageInfo();
    },

    paintSwatches: function (color) {
      var c = String(color || '').toLowerCase();
      U.$$('.swatch').forEach(function (b) {
        b.classList.toggle('on', String(b.getAttribute('data-color') || '').toLowerCase() === c);
      });
    },

    /* ── пара / комната ── */

    inviteUrl: function () {
      var code = Store.state.room.code;
      if (!code) return '';
      return location.origin + location.pathname + '#r=' + code;
    },

    renderRoom: function () {
      var n = this.n;
      if (!n.roomOn) return;
      var code = Store.state.room.code;
      var p = Store.partner();
      var joined = !!code;

      n.roomOn.classList.toggle('hidden', !joined);
      n.roomOff.classList.toggle('hidden', joined);
      if (n.roomLeave) n.roomLeave.classList.toggle('hidden', !joined);

      if (joined) {
        paintAvatar(n.roomAvatar, p.name, p.color);
        if (n.roomName) n.roomName.textContent = p.name || 'Ждём партнёра';
        if (n.roomHint) {
          n.roomHint.textContent = p.id ? 'данные обновляются сами' : 'отправьте ссылку — пара появится сама';
        }
        if (n.roomState) {
          n.roomState.textContent = p.id ? 'вдвоём' : 'ждём';
          n.roomState.classList.toggle('wait', !p.id);
        }
        if (n.inviteLink) n.inviteLink.textContent = this.inviteUrl();
      }
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

        case 'set-color': {
          var colorEl = U.$('#setColor');
          if (colorEl) {
            colorEl.value = g('data-color') || ACCENT;
            this.onChange(colorEl);
          }
          break;
        }

        case 'goal-step': {
          var goalEl = U.$('#' + g('data-goal'));
          if (goalEl) {
            var step = Number(g('data-delta')) || 0;
            var next = (Number(goalEl.value) || 0) + step;
            var min = parseFloat(goalEl.min);
            var max = parseFloat(goalEl.max);
            if (!isNaN(min)) next = Math.max(min, next);
            if (!isNaN(max)) next = Math.min(max, next);
            goalEl.value = String(next);
            this.onChange(goalEl);
            vibrate(6);
          }
          break;
        }

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

        case 'room-leave':
          this.leaveRoom();
          break;

        case 'copy-room':
          this.copyRoom();
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

        case 'invite':
          this.invite();
          break;

        case 'invite-share':
          this.shareInvite();
          break;

        case 'copy-invite':
          this.copyInvite();
          break;

        case 'send-heart':
          if (!Store.hasPartner()) return this.toast('Сначала пригласите партнёра');
          Sync.sendHeart();
          this.toast('Сердечко улетело');
          vibrate(16);
          break;

        case 'send-nudge':
          if (!Store.hasPartner()) return this.toast('Сначала пригласите партнёра');
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
          paintAvatar(this.n.myAvatar, el.value.trim(), Store.me().color);
          Sync.pushMember();
          Sync.pushLive();
          break;
        case 'setColor':
          Store.setMe({ color: el.value });
          paintAvatar(this.n.myAvatar, Store.me().name, el.value);
          this.paintSwatches(el.value);
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
          this.toast(el.checked ? 'Мягкий режим включён' : 'Мягкий режим выключен');
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

    /* ── пара ── */

    ensureRoom: function () {
      var code = Store.state.room.code;
      if (!code) {
        code = U.roomCode(8);
        Store.state.room.code = code;
        Store.state.room.joinedAt = Date.now();
        Store.state.room.host = true;
        Store.save();
      }
      this.renderRoom();
      Sync.start();
      return code;
    },

    invite: function () {
      this.ensureRoom();
      var url = this.inviteUrl();
      this.lastInvite = url;

      this.sheet(
        'Пригласить партнёра',
        '<p>Отправьте одну ссылку. Партнёру достаточно открыть её — пара появится сама, вводить ничего не нужно.</p>' +
        '<div class="invite-box top-gap"><div class="invite-label">Ссылка-приглашение</div>' +
        '<div class="invite-link">' + U.esc(url) + '</div></div>' +
        '<div class="row-inline top-gap">' +
        '<button class="btn primary grow" data-action="invite-share" type="button">' + icon('i-share') + 'Поделиться</button>' +
        '<button class="btn icon-only" data-action="copy-invite" type="button" aria-label="Скопировать">' + icon('i-copy') + '</button>' +
        '</div>' +
        '<p class="hint">Ссылка постоянная: отправьте её в любой мессенджер.</p>'
      );
    },

    shareInvite: function () {
      var url = this.inviteUrl() || this.lastInvite;
      if (!url) return this.toast('Сначала создайте пару');
      if (navigator.share) {
        navigator.share({ title: 'Вместе', text: 'Давай вести дни вместе.', url: url }).catch(function () {});
        return;
      }
      this.toast(U.copy(url) ? 'Ссылка скопирована' : 'Не удалось скопировать');
    },

    copyInvite: function () {
      var url = this.inviteUrl() || this.lastInvite;
      if (!url) return this.toast('Сначала создайте пару');
      this.toast(U.copy(url) ? 'Ссылка скопирована' : 'Не удалось скопировать');
    },

    createRoom: function () {
      var code = this.ensureRoom();
      this.toast('Пара создана · код ' + code);
      this.shareInvite();
    },

    joinByCode: function (raw, silent) {
      var code = String(raw || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (code.length < 4) {
        if (!silent) this.toast('Код слишком короткий');
        return false;
      }
      if (Store.state.room.code === code) {
        Sync.start();
        return true;
      }
      Store.state.room.code = code;
      Store.state.room.joinedAt = Date.now();
      Store.state.room.host = false;
      Store.state.partnerLive = null;
      Store.setPartner({ id: '', name: '', emoji: '', color: '#D9C3A0' });
      Store.save();
      this.renderAll();
      Sync.start();
      if (!silent) this.toast('Пара подключена');
      return true;
    },


    leaveRoom: function () {
      Store.state.room.code = '';
      Store.state.partnerLive = null;
      Store.setPartner({ id: '', name: '', emoji: '', color: '#D9C3A0' });
      Store.save();
      Sync.stop();
      this.renderAll();
      this.toast('Пара отключена');
    },

    copyRoom: function () {
      this.copyInvite();
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
      this.toast('Отправлено');
    },

    saveWelcome: function () {
      var input = U.$('#welcomeName');
      var name = String(input && input.value || '').trim().slice(0, 24);
      Store.setMe({ name: name || 'Я', emoji: '' });
      try {
        localStorage.setItem('vmeste.onboarded', '1');
      } catch (e) { /* ignore */ }
      this.closeWelcome();
      this.closeSheet();
      this.renderAll();
      Sync.pushMember();
      if (!name) this.toast('Имя можно добавить в настройках');
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
        ['Вода', U.ml(Store.waterTotal(doc)) + ' · ' + Store.waterPct(doc) + '% от цели'],
        ['Еда', Store.mealsCount(doc) + ' из ' + st.goalMeals + (doc.mealNote ? ' · ' + U.esc(doc.mealNote) : '')],
        ['Сон', Store.sleepHours(doc) ? U.hours(Store.sleepHours(doc)) : '—'],
        ['Активность', U.hm(Store.activityTotal(doc))],
        ['Лекарства', Store.medsDone(doc) + ' из ' + Store.state.meds.length],
        ['Настроение', feel.mood ? MOODS[feel.mood - 1].label : '—'],
        ['Кровь из носа', feel.nose || 'нет'],
        ['Балл дня', Store.isTouched(doc) ? Store.score(doc) + '%' : 'нет данных']
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
      var has = !!Store.state.room.code;
      var state = has ? (Store.hasPartner() ? 'вдвоём' : 'ждём партнёра') : 'пока одна';
      this.sheet(
        'Сохранение',
        '<div class="kv"><span>Пара</span><b>' + state + '</b></div>' +
        '<div class="kv"><span>Связь</span><b>' + U.esc(Sync.label()) + '</b></div>' +
        '<p class="top-gap">' +
        (has
          ? 'Записи сохраняются на телефоне и передаются партнёру, когда есть интернет. Ничего настраивать не нужно.'
          : 'Пока записи живут только на этом телефоне. Пригласите партнёра — и вы увидите друг друга.') +
        '</p>' +
        '<button class="btn top-gap" data-action="' + (has ? 'pair-refresh' : 'invite') + '" type="button">' +
        (has ? 'Обновить сейчас' : 'Пригласить партнёра') + '</button>'
      );
    },

    welcome: function () {
      var w = this.n.welcome;
      if (!w) return;
      w.classList.remove('hidden');
      document.body.style.overflow = 'hidden';

      /* подставляем имя, если оно уже есть */
      var input = U.$('#welcomeName');
      if (input && Store.me().name && Store.me().name !== 'Я') input.value = Store.me().name;
    },

    closeWelcome: function () {
      var w = this.n.welcome;
      if (w) w.classList.add('hidden');
      document.body.style.overflow = '';
    },

    namePrompt: function () {
      this.sheet(
        'Как тебя звать?',
        '<p>Пара уже подключена. Осталось имя — его увидит партнёр.</p>' +
        '<label class="field top-gap"><span>имя</span>' +
        '<input type="text" id="welcomeName" maxlength="24" placeholder="Имя или прозвище"></label>' +
        '<button class="btn primary wide top-gap" data-action="welcome-save" type="button">Готово</button>'
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

  function icon(name) {
    return '<svg class="ic" aria-hidden="true"><use href="#' + name + '"></use></svg>';
  }

  function initials(name) {
    var s = String(name || '').trim();
    if (!s || s === 'Я') return 'Я';
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return s.slice(0, 1).toUpperCase();
  }

  function mix(hex, amt) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function inkOn(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return '#07110D';
    var n = parseInt(m[1], 16);
    var l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return l > 134 ? '#07110D' : '#F7FBFF';
  }

  function paintAvatar(el, name, color) {
    if (!el) return;
    var txt = initials(name);
    if (el.textContent !== txt) el.textContent = txt;
    var c = /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#D9C3A0';
    el.style.background = 'linear-gradient(160deg, ' + mix(c, 0.38) + ', ' + c + ')';
    el.style.color = inkOn(c);
  }

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

  function plural(n, one, few, many) {
    var a = Math.abs(n) % 100;
    var b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function avg(arr) {
    if (!arr.length) return 0;
    var s = 0;
    arr.forEach(function (v) {
      s += Number(v) || 0;
    });
    return s / arr.length;
  }

  /* подробная статистика за N дней */
  function computeStats(hist) {
    var s = {
      totalWater: 0, avgWater: 0, totalNose: 0, totalMeals: 0, totalAct: 0,
      sleepSum: 0, sleepDays: 0, avgSleep: 0, moodSum: 0, moodDays: 0, avgMood: 0,
      touched: 0, bestStreak: 0
    };

    var run = 0;
    hist.forEach(function (d) {
      if (!d.touched) { run = 0; return; }
      s.touched++;
      run++;
      if (run > s.bestStreak) s.bestStreak = run;

      var doc = Store.mine(d.key);
      s.totalWater += d.water || 0;
      s.totalNose += d.nose || 0;
      s.totalMeals += Store.mealsCount(doc);
      s.totalAct += Store.activityTotal(doc);

      var h = Store.sleepHours(doc);
      if (h > 0) { s.sleepSum += h; s.sleepDays++; }

      var m = (doc.feeling && doc.feeling.mood) || 0;
      if (m > 0) { s.moodSum += m; s.moodDays++; }
    });

    s.avgWater = s.touched ? Math.round(s.totalWater / s.touched) : 0;
    s.avgSleep = s.sleepDays ? s.sleepSum / s.sleepDays : 0;
    s.avgMood = s.moodDays ? s.moodSum / s.moodDays : 0;

    /* текущая серия дней подряд */
    return s;
  }

  function vibrate(ms) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  }
})();
