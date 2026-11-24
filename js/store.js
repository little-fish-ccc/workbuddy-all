/* 点卯 · 数据层
 * localStorage: 结构化数据 dianmao_db_v1
 * IndexedDB : 图片等大文件（leanClone / hydrateFiles 模式）
 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});

  var KEY = 'dianmao_db_v1';
  var IDB_NAME = 'dianmao_fs';
  var IDB_STORE = 'files';

  /* ---------------- 时间工具 ---------------- */
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function toMin(hhmm) {
    if (!hhmm) return 0;
    var p = String(hhmm).split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function toHHMM(min) {
    min = Math.max(0, Math.min(1440, Math.round(min)));
    return pad2(Math.floor(min / 60)) + ':' + pad2(min % 60);
  }
  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function parseKey(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(key, n) {
    var d = parseKey(key);
    d.setDate(d.getDate() + n);
    return dateKey(d);
  }
  function todayKey() { return dateKey(new Date()); }
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function fmtDayTitle(key) {
    var d = parseKey(key);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtDaySub(key) {
    var d = parseKey(key);
    var t = todayKey();
    var diff = Math.round((parseKey(key) - parseKey(t)) / 86400000);
    var tail = diff === 0 ? '今天' : diff === 1 ? '明天' : diff === -1 ? '昨天'
      : diff === 2 ? '后天' : diff > 0 ? diff + ' 天后' : Math.abs(diff) + ' 天前';
    return WEEK[d.getDay()] + ' · ' + tail;
  }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

  function humanLeft(mins) {
    if (mins === 0) return '就是现在';
    if (mins < 0) return '已过 ' + humanDur(-mins);
    return '还有 ' + humanDur(mins);
  }
  function humanDur(m) {
    m = Math.round(m);
    if (m < 60) return m + ' 分钟';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + ' 小时 ' + r + ' 分' : h + ' 小时';
  }

  DM.util = {
    pad2: pad2, toMin: toMin, toHHMM: toHHMM, dateKey: dateKey, parseKey: parseKey,
    addDays: addDays, todayKey: todayKey, fmtDayTitle: fmtDayTitle, fmtDaySub: fmtDaySub,
    nowMin: nowMin, humanLeft: humanLeft, humanDur: humanDur, WEEK: WEEK
  };

  /* ---------------- 默认数据 ---------------- */
  var DEFAULT_DOMAINS = [
    { id: 'work', name: '工作', color: '#2F6FED' },
    { id: 'life', name: '生活', color: '#E08A2E' },
    { id: 'health', name: '健康', color: '#2E9E6B' },
    { id: 'study', name: '学习', color: '#7A5AF8' },
    { id: 'misc', name: '杂事', color: '#8A8377' }
  ];
  var DEFAULT_SETTINGS = {
    dayStart: '06:00', dayEnd: '24:00', notify: true, sound: true,
    showDone: true, defaultRemind: 10, firstRun: true
  };

  function uid() {
    return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function freshDB() {
    return {
      v: 1, tasks: [], series: {},
      domains: DEFAULT_DOMAINS.slice(), settings: Object.assign({}, DEFAULT_SETTINGS)
    };
  }

  /* ---------------- 状态 ---------------- */
  var db = null;
  var memStore = null;        // localStorage 不可用时的兜底
  var writeTimer = null;

  function readRaw() {
    try {
      var s = window.localStorage.getItem(KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return memStore; }
  }
  function writeRaw(obj) {
    var s = JSON.stringify(obj);
    try {
      window.localStorage.setItem(KEY, s);
    } catch (e) {
      memStore = obj;         // 配额满/隐私模式：退化为内存（本次会话有效）
    }
    return true;
  }

  function normalize(raw) {
    var d = raw && typeof raw === 'object' ? raw : {};
    var out = freshDB();
    out.v = 1;
    if (Array.isArray(d.tasks)) out.tasks = d.tasks.filter(function (t) { return t && t.id && t.date && t.start; });
    if (d.series && typeof d.series === 'object') out.series = d.series;
    if (Array.isArray(d.domains) && d.domains.length) out.domains = d.domains;
    if (d.settings && typeof d.settings === 'object') out.settings = Object.assign({}, DEFAULT_SETTINGS, d.settings);
    return out;
  }

  function load() {
    db = normalize(readRaw());
    return db;
  }
  function save() {
    if (!db) return;
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    writeRaw(db);
  }
  function saveSoon() {
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(function () { writeTimer = null; save(); }, 120);
  }

  /* ---------------- 任务 ---------------- */
  function tasksOn(date) {
    return db.tasks
      .filter(function (t) { return t.date === date; })
      .sort(function (a, b) {
        var d = toMin(a.start) - toMin(b.start);
        if (d) return d;
        return (a.createdAt || 0) - (b.createdAt || 0);
      });
  }
  function getTask(id) {
    for (var i = 0; i < db.tasks.length; i++) if (db.tasks[i].id === id) return db.tasks[i];
    return null;
  }
  function upsert(task) {
    var now = Date.now();
    var i, found = null;
    for (i = 0; i < db.tasks.length; i++) if (db.tasks[i].id === task.id) { found = db.tasks[i]; break; }
    if (found) {
      Object.assign(found, task, { updatedAt: now });
    } else {
      var t = Object.assign({}, task, { createdAt: now, updatedAt: now });
      if (!t.id) t.id = uid();
      if (!t.done) { t.done = false; t.doneAt = null; }
      t.remind = t.remind || { before: db.settings.defaultRemind, notified: false };
      db.tasks.push(t);
      found = t;
    }
    normSubs(found);
    saveSoon();
    return found;
  }

  /* ---------------- 子任务 ---------------- */
  /* 一句话里塞好几件事时的分隔符：换行、分号、顿号、竖线、逗号 */
  var SPLIT_RE = /[\n\r;；、|｜,，]+/;

  function splitTitle(raw) {
    return String(raw == null ? '' : raw)
      .split(SPLIT_RE)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function subId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* 收敛子任务：去空、补 id、完成度回写父任务 */
  function normSubs(t) {
    if (!t) return t;
    if (!Array.isArray(t.subs)) { t.subs = null; return t; }
    t.subs = t.subs
      .filter(function (s) { return s && String(s.text == null ? '' : s.text).trim(); })
      .map(function (s) {
        return {
          id: s.id || subId(),
          text: String(s.text).trim(),
          done: !!s.done,
          doneAt: s.done ? (s.doneAt || Date.now()) : null
        };
      });
    if (!t.subs.length) { t.subs = null; return t; }
    t.done = t.subs.every(function (s) { return s.done; });
    t.doneAt = t.done ? (t.doneAt || Date.now()) : null;
    return t;
  }

  function toggleSub(taskId, sid) {
    var t = getTask(taskId);
    if (!t || !t.subs || !t.subs.length) return null;
    var hit = null;
    t.subs.forEach(function (s) { if (s.id === sid) hit = s; });
    if (!hit) return null;
    hit.done = !hit.done;
    hit.doneAt = hit.done ? Date.now() : null;
    t.done = t.subs.every(function (s) { return s.done; });
    t.doneAt = t.done ? Date.now() : null;
    t.updatedAt = Date.now();
    saveSoon();
    return t;
  }

  function subStats(t) {
    var list = (t && t.subs) || [];
    var d = 0;
    list.forEach(function (s) { if (s.done) d++; });
    return { total: list.length, done: d };
  }
  /* 图片是否还被别处引用（重复系列的实例会共用同一张图的 key） */
  function fileInUse(key) {
    for (var i = 0; i < db.tasks.length; i++) {
      if ((db.tasks[i].attachments || []).indexOf(key) >= 0) return true;
    }
    var sids = Object.keys(db.series || {});
    for (var j = 0; j < sids.length; j++) {
      var tp = db.series[sids[j]].template || {};
      if ((tp.attachments || []).indexOf(key) >= 0) return true;
    }
    return false;
  }

  function remove(id) {
    var t = getTask(id);
    db.tasks = db.tasks.filter(function (x) { return x.id !== id; });
    if (t && t.attachments && t.attachments.length) {
      t.attachments.forEach(function (k) {
        if (!fileInUse(k)) fileDelete(k);   // 顺手收拾掉图，别在 IDB 里留垃圾
      });
    }
    saveSoon();
  }
  function toggle(id) {
    var t = getTask(id);
    if (!t) return null;
    var now = Date.now();
    if (t.subs && t.subs.length) {
      // 父任务打勾 = 整组一起点／一起取消
      var turnOn = !t.subs.every(function (s) { return s.done; });
      t.subs.forEach(function (s) {
        s.done = turnOn;
        s.doneAt = turnOn ? now : null;
      });
    }
    t.done = t.subs && t.subs.length ? t.subs.every(function (s) { return s.done; }) : !t.done;
    t.doneAt = t.done ? now : null;
    if (t.done) t.dropped = false;     // 打勾即视为要做，撤掉「放弃」
    else t.delayed = false;            // 取消勾选，「延迟完成」也跟着失效
    t.updatedAt = now;
    saveSoon();
    return t;
  }

  /* ---------------- 过期未做的处理：放弃 / 延迟完成 ---------------- */
  /* 放弃：这件事不做了，日历上标灰点 */
  function drop(id) {
    var t = getTask(id);
    if (!t) return null;
    t.dropped = true;
    t.delayed = false;
    t.done = false;
    t.doneAt = null;
    t.updatedAt = Date.now();
    saveSoon();
    return t;
  }

  /* 延迟完成：事后补上了，但不在原定那天，日历上标黄点 */
  function setDelayed(id, on) {
    var t = getTask(id);
    if (!t) return null;
    if (on) {
      t.delayed = true;
      t.dropped = false;
      t.done = true;
      t.doneAt = Date.now();
      if (t.subs && t.subs.length) {
        t.subs.forEach(function (s) { s.done = true; s.doneAt = s.doneAt || Date.now(); });
      }
    } else {
      t.delayed = false;
    }
    t.updatedAt = Date.now();
    saveSoon();
    return t;
  }

  /* ---------------- 平移：过去没做的事挪到以后，原位留个印记 ----------------
   * 本体只有一个：任务的 date 直接改成目标日，movedFrom 记住最早那天。
   * 于是原位的「痕迹」不是另一条数据，而是从 movedFrom 反查出来的，状态永远跟着本体走：
   *   本体做完 → 原位显示「已延迟完成」；还没做 → 原位显示「已移动」；放弃 → 原位显示「已放弃」
   */
  function ghostsOn(date) {
    return db.tasks
      .filter(function (t) { return t.movedFrom === date && t.date !== date; })
      .sort(function (a, b) { return toMin(a.start) - toMin(b.start); });
  }

  function moveTo(id, targetDate) {
    var t = getTask(id);
    if (!t) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate || '')) return null;
    if (targetDate <= t.date) return null;              // 只往以后挪
    var origin = t.movedFrom || t.date;                 // 挪过几次，印记都留在最早那天
    if (t.seriesId && DM.repeat) DM.repeat.detach(t.seriesId, t.date);  // 别让规则把这天补回来
    t.movedFrom = origin;
    t.movedAt = Date.now();
    t.date = targetDate;
    t.remind = t.remind || {};
    t.remind.notified = false;                          // 到了新日子要重新提醒
    delete t.remind.notifiedAt;
    t.updatedAt = Date.now();
    saveSoon();
    return t;
  }

  function moveBack(id) {
    var t = getTask(id);
    if (!t || !t.movedFrom) return null;
    var back = t.movedFrom;
    if (t.seriesId && DM.repeat) DM.repeat.undetach(t.seriesId, back);
    t.date = back;
    delete t.movedFrom;
    delete t.movedAt;
    t.remind = t.remind || {};
    t.remind.notified = false;
    t.updatedAt = Date.now();
    saveSoon();
    return t;
  }

  /* 清掉所有标记，回到普通未完成 */
  function clearMarks(id) {
    var t = getTask(id);
    if (!t) return null;
    t.dropped = false;
    t.delayed = false;
    t.done = false;
    t.doneAt = null;
    if (t.subs && t.subs.length) {
      t.subs.forEach(function (s) { s.done = false; s.doneAt = null; });
    }
    t.updatedAt = Date.now();
    saveSoon();
    return t;
  }
  function clearAll() {
    db.tasks.forEach(function (t) {
      (t.attachments || []).forEach(function (k) { fileDelete(k); });
    });
    Object.keys(db.series || {}).forEach(function (sid) {
      var tp = db.series[sid].template || {};
      (tp.attachments || []).forEach(function (k) { fileDelete(k); });
    });
    db = freshDB();
    db.settings.firstRun = false;
    save();
  }

  /* ---------------- 统计 ---------------- */
  function stats(date) {
    var list = tasksOn(date);
    var undone = 0, totalMin = 0, done = 0, dropped = 0, delayed = 0;
    list.forEach(function (t) {
      if (t.dropped) dropped++;
      else if (t.done) done++;
      else undone++;
      if (t.done && t.delayed) delayed++;
      totalMin += (t.duration > 0 ? t.duration : 0);
    });
    /* 挪走的那几件：原位只留印记。做完了算延迟完成，还没做就是「已移动」 */
    var moved = 0, ghosts = 0;
    ghostsOn(date).forEach(function (t) {
      ghosts++;
      if (t.dropped) dropped++;
      else if (t.done) delayed++;
      else moved++;
    });
    return {
      count: list.length, done: done, undone: undone,
      dropped: dropped, delayed: delayed, moved: moved, ghosts: ghosts,
      totalMin: totalMin
    };
  }

  /* ---------------- 设置 / 领域 ---------------- */
  function settings() { return db.settings; }
  function saveSettings(patch) {
    Object.assign(db.settings, patch || {});
    save();
    return db.settings;
  }
  function domains() { return db.domains; }
  function domain(id) {
    for (var i = 0; i < db.domains.length; i++) if (db.domains[i].id === id) return db.domains[i];
    return { id: 'misc', name: '杂事', color: '#8A8377' };
  }

  /* ---------------- IndexedDB 文件 ---------------- */
  var idbPromise = null;
  var memFiles = {};
  var pendingWrites = [];

  function idb() {
    if (!idbPromise) {
      idbPromise = new Promise(function (resolve) {
        if (!window.indexedDB) return resolve(null);
        var req;
        try { req = window.indexedDB.open(IDB_NAME, 1); } catch (e) { return resolve(null); }
        req.onupgradeneeded = function () {
          var d = req.result;
          if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
        req.onblocked = function () { resolve(null); };
      });
    }
    return idbPromise;
  }

  function filePut(key, dataUrl) {
    memFiles[key] = dataUrl;
    var p = idb().then(function (d) {
      if (!d) return;
      return new Promise(function (resolve) {
        try {
          var tx = d.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(dataUrl, key);
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { resolve(); };
          tx.onabort = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    });
    pendingWrites.push(p);
    return p;
  }

  function fileGet(key) {
    if (memFiles[key]) return Promise.resolve(memFiles[key]);
    return idb().then(function (d) {
      if (!d) return '';
      return new Promise(function (resolve) {
        try {
          var tx = d.transaction(IDB_STORE, 'readonly');
          var rq = tx.objectStore(IDB_STORE).get(key);
          rq.onsuccess = function () { resolve(rq.result || ''); };
          rq.onerror = function () { resolve(''); };
        } catch (e) { resolve(''); }
      });
    });
  }

  function fileDelete(key) {
    delete memFiles[key];
    return idb().then(function (d) {
      if (!d) return;
      try {
        var tx = d.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete(key);
      } catch (e) { /* noop */ }
    });
  }

  function fileKey() {
    return 'f_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function flushFiles() { return Promise.all(pendingWrites.slice()); }

  /* leanClone: 把对象里的 dataURL 抽到 IndexedDB，留下 {__ref}
   * hydrateFiles: 反向还原
   * 用于备份导出/导入，以及任何可能夹带图片的数据结构
   */
  function leanClone(obj) {
    var pending = [];
    function walk(v) {
      if (typeof v === 'string' && v.indexOf('data:image/') === 0 && v.length > 512) {
        var key = fileKey();
        pending.push([key, v]);
        return { __ref: key };
      }
      if (Array.isArray(v)) return v.map(walk);
      if (v && typeof v === 'object') {
        var o = {};
        Object.keys(v).forEach(function (k) { o[k] = walk(v[k]); });
        return o;
      }
      return v;
    }
    var out = walk(obj);
    pending.forEach(function (p) { filePut(p[0], p[1]); });
    return out;
  }

  function hydrateFiles(obj) {
    if (obj && typeof obj === 'object' && obj.__ref) {
      return fileGet(obj.__ref).then(function (d) { return d || ''; });
    }
    if (Array.isArray(obj)) {
      return Promise.all(obj.map(hydrateFiles));
    }
    if (obj && typeof obj === 'object') {
      var keys = Object.keys(obj);
      return Promise.all(keys.map(function (k) { return hydrateFiles(obj[k]); }))
        .then(function (vals) {
          var o = {};
          keys.forEach(function (k, i) { o[k] = vals[i]; });
          return o;
        });
    }
    return Promise.resolve(obj);
  }

  /* ---------------- 附件（任务图片） ---------------- */
  function addAttachment(taskId, dataUrl) {
    var t = getTask(taskId);
    if (!t) return Promise.resolve(null);
    var key = fileKey();
    t.attachments = t.attachments || [];
    t.attachments.push(key);
    t.updatedAt = Date.now();
    saveSoon();
    return filePut(key, dataUrl).then(function () { return key; });
  }
  function removeAttachment(taskId, key) {
    var t = getTask(taskId);
    if (!t) return;
    t.attachments = (t.attachments || []).filter(function (k) { return k !== key; });
    t.updatedAt = Date.now();
    saveSoon();
    return fileDelete(key);
  }
  function attachmentUrl(key) {
    if (memFiles[key]) return Promise.resolve(memFiles[key]);
    return fileGet(key);
  }

  /* ---------------- 备份 ---------------- */
  function exportJSON() {
    var payload = leanClone({ type: 'dianmao-backup', at: new Date().toISOString(), db: db });
    return Promise.all(pendingWrites.slice()).then(function () {
      return JSON.stringify(payload, null, 2);
    });
  }

  DM.store = {
    init: function () { load(); return db; },
    all: function () { return db; },
    tasksOn: tasksOn,
    getTask: getTask,
    upsert: upsert,
    remove: remove,
    toggle: toggle,
    drop: drop,
    setDelayed: setDelayed,
    clearMarks: clearMarks,
    ghostsOn: ghostsOn,
    moveTo: moveTo,
    moveBack: moveBack,
    toggleSub: toggleSub,
    normSubs: normSubs,
    splitTitle: splitTitle,
    subStats: subStats,
    clearAll: clearAll,
    stats: stats,
    settings: settings,
    saveSettings: saveSettings,
    domains: domains,
    domain: domain,
    save: save,
    saveSoon: saveSoon,
    uid: uid,
    filePut: filePut,
    fileGet: fileGet,
    fileDelete: fileDelete,
    fileKey: fileKey,
    fileInUse: fileInUse,
    flushFiles: flushFiles,
    leanClone: leanClone,
    hydrateFiles: hydrateFiles,
    addAttachment: addAttachment,
    removeAttachment: removeAttachment,
    attachmentUrl: attachmentUrl,
    exportJSON: exportJSON,
    KEY: KEY
  };
})();
