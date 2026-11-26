/* ────────────────────────────────────────────────────────────────
   net.js — Firebase Realtime Database без SDK
   • REST через fetch
   • анонимный вход (identitytoolkit) + обновление токена
   • живой поток изменений через Server-Sent Events
   ──────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  var App = (window.App = window.App || {});
  var U = App.util;
  var Store = App.Store;

  var IDP = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=';
  var TOKEN_URL = 'https://securetoken.googleapis.com/v1/token?key=';

  /* пространство имён приложения внутри базы: /vmeste/rooms/...
     так «Вместе» никогда не пересечётся с другими приложениями на той же базе */
  var ROOT = '/vmeste';

  function nowSec() {
    return Math.floor(Date.now() / 1000);
  }

  function jsonFetch(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.text().then(function (txt) {
        var body = null;
        if (txt) {
          try {
            body = JSON.parse(txt);
          } catch (e) {
            body = { raw: txt };
          }
        }
        if (!res.ok) {
          var msg = 'HTTP ' + res.status;
          if (body && body.error) {
            if (typeof body.error === 'string') msg = body.error;
            else if (body.error.message) msg = body.error.message;
          }
          var err = new Error(msg);
          err.status = res.status;
          err.body = body;
          throw err;
        }
        return body;
      });
    });
  }

  /* ══════════════════════════ Net ══════════════════════════ */

  var Net = (App.Net = {
    status: 'local',
    error: '',

    fb: function () {
      return Store.state.firebase;
    },

    dbUrl: function () {
      var u = String(this.fb().dbUrl || '').trim().replace(/\/+$/, '');
      if (!u) return '';
      if (u.indexOf('http') !== 0) u = 'https://' + u;
      return u;
    },

    configured: function () {
      return !!this.dbUrl();
    },

    room: function () {
      return String((Store.state.room && Store.state.room.code) || '').trim().toUpperCase();
    },

    ready: function () {
      return this.configured() && !!this.room();
    },

    /* ── авторизация ── */

    ensureToken: function () {
      var self = this;
      var f = this.fb();
      var key = String(f.apiKey || '').trim();

      if (!key) {
        /* режим «правил без авторизации» — токен не нужен */
        return Promise.resolve('');
      }

      if (f.idToken && f.tokenExp && Number(f.tokenExp) - 90 > nowSec()) {
        return Promise.resolve(f.idToken);
      }

      var pr;
      if (f.refreshToken) {
        pr = jsonFetch(TOKEN_URL + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'refresh_token',
            refresh_token: f.refreshToken
          })
        }).then(function (r) {
          return {
            idToken: r.id_token,
            refreshToken: r.refresh_token || f.refreshToken,
            expiresIn: Number(r.expires_in) || 3600,
            localId: r.user_id || f.uid
          };
        });
      } else {
        pr = jsonFetch(IDP + encodeURIComponent(key), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnSecureToken: true })
        }).then(function (r) {
          return {
            idToken: r.idToken,
            refreshToken: r.refreshToken,
            expiresIn: Number(r.expiresIn) || 3600,
            localId: r.localId
          };
        });
      }

      return pr.then(
        function (r) {
          self.fb().idToken = r.idToken;
          self.fb().refreshToken = r.refreshToken;
          self.fb().tokenExp = nowSec() + r.expiresIn;
          if (r.localId) self.fb().uid = r.localId;
          Store.save(true);
          return r.idToken;
        },
        function (err) {
          /* анонимный вход может быть выключен в консоли */
          var e = new Error(
            'Анонимный вход не разрешён. Включите Authentication → Sign-in method → Anonymous, ' +
            'либо оставьте поле apiKey пустым (тогда правила должны быть открытыми).'
          );
          e.cause = err;
          throw e;
        }
      );
    },

    myUid: function () {
      return this.fb().uid || Store.state.me.id;
    },

    /* ── REST ── */

    url: function (path, token, opts) {
      var base = this.dbUrl() + path + '.json';
      var qs = [];
      if (token) qs.push('auth=' + encodeURIComponent(token));
      if (opts && opts.silent) qs.push('print=silent');
      if (opts && opts.extra) qs.push(opts.extra);
      return base + (qs.length ? '?' + qs.join('&') : '');
    },

    get: function (path) {
      var self = this;
      return this.ensureToken().then(function (token) {
        return jsonFetch(self.url(path, token), { method: 'GET' });
      });
    },

    put: function (path, data) {
      var self = this;
      return this.ensureToken().then(function (token) {
        return jsonFetch(self.url(path, token, { silent: true }), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data == null ? null : data)
        });
      });
    },

    patch: function (path, data) {
      var self = this;
      return this.ensureToken().then(function (token) {
        return jsonFetch(self.url(path, token, { silent: true }), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data == null ? null : data)
        });
      });
    },

    /* ── живой поток (SSE) ── */

    stream: function (path, handlers) {
      var self = this;
      var handle = {
        closed: false,
        abort: null,
        close: function () {
          handle.closed = true;
          try {
            if (handle.abort) handle.abort.abort();
          } catch (e) { /* ignore */ }
        }
      };

      if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
        if (handlers.onError) handlers.onError(new Error('Поток не поддерживается'));
        return handle;
      }

      handle.abort = new AbortController();

      this.ensureToken()
        .then(function (token) {
          var url = self.url(path, token);
          return fetch(url, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            signal: handle.abort.signal,
            cache: 'no-store'
          });
        })
        .then(function (res) {
          if (!res.ok) throw new Error('Поток: HTTP ' + res.status);
          if (!res.body || !res.body.getReader) throw new Error('Поток не поддерживается');
          if (handlers.onOpen) handlers.onOpen();

          var reader = res.body.getReader();
          var decoder = new TextDecoder('utf-8');
          var buf = '';

          function pump() {
            return reader.read().then(function (r) {
              if (r.done) {
                if (!handle.closed && handlers.onError) handlers.onError(new Error('Поток закрыт'));
                return;
              }
              buf += decoder.decode(r.value, { stream: true });
              var idx;
              while ((idx = buf.indexOf('\n\n')) >= 0) {
                var chunk = buf.slice(0, idx);
                buf = buf.slice(idx + 2);
                parseChunk(chunk, handlers);
              }
              return pump();
            });
          }

          return pump();
        })
        .catch(function (err) {
          if (handle.closed) return;
          if (err && err.name === 'AbortError') return;
          if (handlers.onError) handlers.onError(err);
        });

      return handle;
    }
  });

  function parseChunk(chunk, handlers) {
    var ev = 'message';
    var dataLines = [];
    chunk.split('\n').forEach(function (line) {
      if (line.indexOf('event:') === 0) ev = line.slice(6).trim();
      else if (line.indexOf('data:') === 0) dataLines.push(line.slice(5).trim());
    });
    if (!dataLines.length) return;
    var payload;
    try {
      payload = JSON.parse(dataLines.join('\n'));
    } catch (e) {
      return;
    }
    if (ev === 'keep-alive' || ev === 'cancel' || ev === 'auth_revoked') return;
    if (handlers.onEvent) handlers.onEvent(ev, payload);
  }

  /* точечная запись в зеркало по пути вида "/uid/water" */
  function deepSet(root, path, value) {
    if (!path || path === '/') {
      if (value && typeof value === 'object') {
        Object.keys(root).forEach(function (k) { delete root[k]; });
        Object.keys(value).forEach(function (k) { root[k] = value[k]; });
      }
      return root;
    }
    var parts = path.split('/').filter(Boolean);
    var node = root;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
      node = node[p];
    }
    var last = parts[parts.length - 1];
    if (value === null) delete node[last];
    else node[last] = value;
    return root;
  }

  App.deepSet = deepSet;

  /* ══════════════════════════ Sync ══════════════════════════ */

  var Sync = (App.Sync = {
    status: 'local',
    error: '',
    streams: {},
    mirror: {},
    pushTimer: null,
    presenceTimer: null,
    watchdogTimer: null,
    retry: 0,
    wired: false,

    setStatus: function (status, error) {
      this.status = status;
      this.error = error || '';
      if (App.UI && App.UI.renderSync) App.UI.renderSync();
      Store.emit('sync', { status: status, error: this.error });
    },

    label: function () {
      if (this.status === 'live') return 'в сети';
      if (this.status === 'connecting') return 'соединяю…';
      if (this.status === 'error') return 'нет связи';
      return Store.state.room.code ? 'локально' : 'локально';
    },

    start: function () {
      var self = this;
      this.stop(true);

      if (!Net.ready()) {
        this.setStatus('local');
        return Promise.resolve();
      }

      this.setStatus('connecting');

      return Net.ensureToken()
        .then(function () {
          return self.pushMember();
        })
        .then(function () {
          return self.pullMembers();
        })
        .then(function () {
          return self.flush();
        })
        .then(function () {
          return self.openStreams();
        })
        .then(function () {
          self.retry = 0;
          self.setStatus('live');
          self.startTimers();
        })
        .catch(function (err) {
          self.retry++;
          self.setStatus('error', (err && err.message) || 'ошибка сети');
          if (self.retry < 3) {
            setTimeout(function () {
              if (Net.ready()) self.start();
            }, 4000 * self.retry);
          }
        });
    },

    stop: function (silent) {
      Object.keys(this.streams).forEach(function (k) {
        try { self_stream_close(App.Sync.streams[k]); } catch (e) {}
      });
      this.streams = {};
      this.mirror = {};
      if (this.presenceTimer) clearInterval(this.presenceTimer);
      if (this.watchdogTimer) clearInterval(this.watchdogTimer);
      this.presenceTimer = null;
      this.watchdogTimer = null;
      if (this.pushTimer) clearTimeout(this.pushTimer);
      this.pushTimer = null;
      if (!silent) this.setStatus('local');
    },

    /* ── мои данные ── */

    pushMember: function () {
      if (!Net.ready()) return Promise.resolve();
      var me = Store.me();
      var payload = {
        name: me.name || 'Я',
        emoji: me.emoji || '💛',
        color: me.color || '#ffb35c',
        ts: Date.now(),
        app: 'vmeste/1'
      };
      return Net.put(ROOT + '/rooms/' + Net.room() + '/members/' + Net.myUid(), payload).catch(function () {});
    },

    pushLive: function (extra) {
      var self = this;
      if (!Net.ready()) return Promise.resolve();
      var me = Store.me();
      var live = {
        name: me.name || 'Я',
        emoji: me.emoji || '💛',
        color: me.color || '#ffb35c',
        ts: Date.now()
      };
      if (extra) Object.keys(extra).forEach(function (k) { live[k] = extra[k]; });
      return Net.patch(ROOT + '/rooms/' + Net.room() + '/live/' + Net.myUid(), live).then(function (r) {
        self.setStatus('live');
        return r;
      }).catch(function (err) {
        self.setStatus('error', (err && err.message) || 'не отправилось');
      });
    },

    pullMembers: function () {
      var self = this;
      if (!Net.ready()) return Promise.resolve();
      return Net.get(ROOT + '/rooms/' + Net.room() + '/members').then(function (data) {
        if (!data || typeof data !== 'object') return;
        var mine = Net.myUid();
        var uids = Object.keys(data).filter(function (u) { return u !== mine; });
        if (!uids.length) {
          /* нас в комнате ещё нет — запишемся и попробуем позже */
          return self.pushMember();
        }
        var other = uids[0];
        var info = data[other] || {};
        var p = Store.partner();
        var changed = p.id !== other || p.name !== (info.name || '') || p.emoji !== (info.emoji || '');
        if (changed) {
          Store.setPartner({
            id: other,
            name: info.name || 'Партнёр',
            emoji: info.emoji || '💜',
            color: info.color || '#9d7bff'
          });
          Store.emit('pair-found');
        }
        return null;
      }).catch(function () {});
    },

    /* ── дни ── */

    pushDay: function (date) {
      var self = this;
      if (!Net.ready()) return Promise.resolve(false);
      var doc = Store.mine(date);
      var path = ROOT + '/rooms/' + Net.room() + '/days/' + date + '/' + Net.myUid();
      return Net.put(path, doc).then(function () {
        Store.clearPending(date);
        if (self.status !== 'live') self.setStatus('live');
        return true;
      }).catch(function (err) {
        self.setStatus('error', (err && err.message) || 'не отправилось');
        return false;
      });
    },

    flush: function () {
      var self = this;
      if (!Net.ready()) return Promise.resolve();
      var dates = Object.keys(Store.state.pending || {});
      if (!dates.length) return Promise.resolve();
      dates.sort();
      var chain = Promise.resolve();
      dates.slice(-12).forEach(function (d) {
        chain = chain.then(function () {
          return self.pushDay(d);
        });
      });
      return chain;
    },

    schedulePush: function (date) {
      var self = this;
      if (!Net.ready()) return;
      if (this.pushTimer) clearTimeout(this.pushTimer);
      this.pushTimer = setTimeout(function () {
        self.pushTimer = null;
        self.pushDay(date || U.todayKey());
      }, 700);
    },

    /* ── потоки ── */

    openStreams: function () {
      var self = this;
      var date = U.todayKey();
      var room = Net.room();

      this.closeStream('day');
      this.closeStream('live');

      this.mirror.day = {};
      this.mirror.live = {};

      this.streams.day = Net.stream(ROOT + '/rooms/' + room + '/days/' + date, {
        onEvent: function (ev, payload) {
          if (!payload) return;
          var root = self.mirror.day;
          if (ev === 'put') deepSet(root, payload.path, payload.data);
          else if (ev === 'patch') {
            Object.keys(payload.data || {}).forEach(function (p) {
              deepSet(root, payload.path === '/' ? '/' + p : payload.path + '/' + p, payload.data[p]);
            });
          }
          self.handleDay(date, root);
        },
        onOpen: function () {
          self.setStatus('live');
        },
        onError: function (err) {
          self.setStatus('error', (err && err.message) || 'поток упал');
        }
      });

      this.streams.live = Net.stream(ROOT + '/rooms/' + room + '/live', {
        onEvent: function (ev, payload) {
          if (!payload) return;
          var root = self.mirror.live;
          if (ev === 'put') deepSet(root, payload.path, payload.data);
          else if (ev === 'patch') {
            Object.keys(payload.data || {}).forEach(function (p) {
              deepSet(root, payload.path === '/' ? '/' + p : payload.path + '/' + p, payload.data[p]);
            });
          }
          self.handleLive(root);
        },
        onError: function () { /* тихо: поток перезапустит сторож */ }
      });

      return Promise.resolve();
    },

    closeStream: function (key) {
      var s = this.streams[key];
      if (s && s.close) s.close();
      delete this.streams[key];
    },

    handleDay: function (date, tree) {
      var mine = Net.myUid();
      var myDoc = tree[mine];
      var local = Store.mine(date);
      var localPending = !!Store.state.pending[date];

      if (myDoc && !localPending && (myDoc.updatedAt || 0) > (local.updatedAt || 0)) {
        var box = Store.dayBox(date, true);
        box.mine = Object.assign({}, App.emptyDoc(), myDoc);
        box.syncedAt = Date.now();
        Store.save();
        Store.emit('remote-day', date);
      } else if (Store.isTouched(local) && !localPending && !myDoc) {
        /* на сервере пусто — зальём локальное */
        Store.state.pending[date] = Date.now();
        this.schedulePush(date);
      }

      var partnerUid = null;
      Object.keys(tree).forEach(function (k) {
        if (k !== mine && k.indexOf('_') !== 0) partnerUid = k;
      });

      if (partnerUid) {
        var pdoc = tree[partnerUid];
        if (pdoc && pdoc.updatedAt) {
          var prev = Store.dayBox(date, true).partner;
          if (!prev || prev.updatedAt !== pdoc.updatedAt) {
            Store.setSyncMeta(date, pdoc);
            if (!Store.partner().id) {
              Store.setPartner({ id: partnerUid });
            }
          }
        }
      }
    },

    handleLive: function (tree) {
      var mine = Net.myUid();
      var partnerId = Store.partner().id;
      var others = Object.keys(tree || {}).filter(function (k) { return k !== mine; });
      if (!others.length) return;
      var uid = partnerId && tree[partnerId] ? partnerId : others[0];
      var live = tree[uid];
      if (!live) return;

      if (!partnerId) {
        Store.setPartner({ id: uid, name: live.name || 'Партнёр', emoji: live.emoji || '💜', color: live.color || '#9d7bff' });
      }

      var p = Store.partner();
      if (live.name && live.name !== p.name) Store.setPartner({ name: live.name });
      if (live.emoji && live.emoji !== p.emoji) Store.setPartner({ emoji: live.emoji });
      if (live.color && live.color !== p.color) Store.setPartner({ color: live.color });

      Store.state.partnerLive = {
        ts: live.ts || 0,
        heart: live.heart || 0,
        nudge: live.nudge || null,
        note: live.note || null,
        name: live.name || ''
      };
      Store.save();
      Store.emit('live', Store.state.partnerLive);
    },

    /* ── отправка «сердечек» и записочек ── */

    sendHeart: function () {
      return this.pushLive({ heart: Date.now() });
    },

    sendNudge: function (text) {
      return this.pushLive({ nudge: { text: String(text || '').slice(0, 120), ts: Date.now() } });
    },

    sendNote: function (text) {
      if (!String(text || '').trim()) return Promise.resolve();
      return this.pushLive({ note: { text: String(text).slice(0, 120), ts: Date.now() } });
    },

    /* ── сторож и присутствие ── */

    startTimers: function () {
      var self = this;
      if (this.presenceTimer) clearInterval(this.presenceTimer);
      if (this.watchdogTimer) clearInterval(this.watchdogTimer);

      this.presenceTimer = setInterval(function () {
        if (!Net.ready()) return;
        if (document.hidden) return;
        self.pushLive();
      }, 60000);

      this.watchdogTimer = setInterval(function () {
        if (!Net.ready()) return;
        if (document.hidden) {
          self.calmStream();
          return;
        }
        /* смена суток — пересоздаём поток дня */
        if (self.streemDate !== U.todayKey()) {
          self.streemDate = U.todayKey();
          self.openStreams();
        }
        /* поток умер — поднимаем */
        if (!self.streams.day || self.streams.day.closed) {
          self.openStreams();
        }
        self.flush();
      }, 45000);

      this.flush();
    },

    calmStream: function () {
      /* вкладка в фоне: поток держать дорого — закроем, откроем при возврате */
      if (this.streams.day && !this.streams.day.closed) {
        this.closeStream('day');
        this.closeStream('live');
      }
    },

    wake: function () {
      if (!Net.ready()) return;
      if (document.hidden) return;
      if (!this.streams.day || this.streams.day.closed) {
        this.openStreams();
      }
      this.flush();
      this.pushLive();
    }
  });

  function self_stream_close(s) {
    if (s && s.close) s.close();
  }

  /* переименование «моего» документа: правим всё, что связано с uid */
  App.Net.resetToken = function () {
    var f = Store.state.firebase;
    f.idToken = '';
    f.tokenExp = 0;
    Store.save(true);
  };
})();
