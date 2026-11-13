/* 点卯 · 提醒
 * 纯前端限制：只在页面（含 PWA）运行时检查；关掉页面收不到。
 * 每 30 秒扫一次今天的任务，命中“开始前 N 分钟”窗口即提醒一次。
 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var timer = null;
  var CHECK_MS = 30000;
  var GRACE = 29;       // 错过后 29 分钟内仍补一次
  var audioCtx = null;

  function perm() {
    if (typeof window.Notification === 'undefined') return 'unsupported';
    return window.Notification.permission;
  }

  function requestPermission() {
    if (typeof window.Notification === 'undefined') return Promise.resolve('unsupported');
    if (window.Notification.permission === 'granted') return Promise.resolve('granted');
    if (window.Notification.permission === 'denied') return Promise.resolve('denied');
    try {
      return window.Notification.requestPermission().then(function (r) { return r; },
        function () { return 'denied'; });
    } catch (e) { return Promise.resolve('denied'); }
  }

  function beep() {
    var s = DM.store.settings();
    if (!s.sound) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var t0 = audioCtx.currentTime;
      [0, 0.16].forEach(function (off, i) {
        var o = audioCtx.createOscillator();
        var g = audioCtx.createGain();
        o.type = 'sine';
        o.frequency.value = i ? 880 : 660;
        g.gain.setValueAtTime(0.0001, t0 + off);
        g.gain.exponentialRampToValueAtTime(0.14, t0 + off + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + off + 0.13);
        o.connect(g); g.connect(audioCtx.destination);
        o.start(t0 + off); o.stop(t0 + off + 0.15);
      });
    } catch (e) { /* 静默失败 */ }
  }

  function pushNotification(task, mins) {
    if (!DM.store.settings().notify) return;
    if (perm() !== 'granted') return;
    try {
      var body = U.toMin(task.start) === U.nowMin()
        ? '现在开始'
        : (mins > 0 ? '还有 ' + U.humanDur(mins) + ' · ' + task.start + ' 开始' : task.start + ' 开始');
      var n = new window.Notification('点卯 · ' + task.title, {
        body: body,
        tag: 'dm-' + task.id,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        silent: true
      });
      n.onclick = function () { try { window.focus(); } catch (e) { } n.close(); };
      setTimeout(function () { try { n.close(); } catch (e) { } }, 12000);
    } catch (e) { /* 某些环境不支持构造 */ }
  }

  function fire(task) {
    var nm = U.nowMin();
    var st = U.toMin(task.start);
    var mins = st - nm;
    task.remind = task.remind || {};
    task.remind.notified = true;
    task.remind.notifiedAt = Date.now();
    DM.store.saveSoon();

    var line = mins > 0 ? '还有 ' + U.humanDur(mins) : (mins === 0 ? '就是现在' : '已到点');
    if (DM.toast) {
      DM.toast(task.title, line + ' · ' + task.start, function () {
        if (DM.editor) DM.editor.open(task.id);
      });
    }
    beep();
    pushNotification(task, mins);
  }

  function scan(silent) {
    var s = DM.store.settings();
    var now = new Date();
    var tk = U.dateKey(now);
    var nm = now.getHours() * 60 + now.getMinutes();
    var hits = [];

    DM.store.tasksOn(tk).forEach(function (t) {
      if (t.done) return;
      var before = (t.remind && t.remind.before != null) ? +t.remind.before : s.defaultRemind;
      if (before < 0) return;
      if (t.remind && t.remind.notified) return;
      var st = U.toMin(t.start);
      var at = st - before;
      if (nm >= at && nm <= st + GRACE) hits.push(t);
    });

    if (!silent) hits.forEach(fire);
    updateBadge();
    return hits;
  }

  function updateBadge() {
    try {
      if (!navigator.setAppBadge) return;
      var n = DM.store.stats(U.todayKey()).undone;
      if (n > 0) navigator.setAppBadge(n);
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch (e) { /* noop */ }
  }

  /* 今天最近的一条：用于页面顶部预告 */
  function next() {
    var tk = U.todayKey();
    var nm = U.nowMin();
    var best = null;
    DM.store.tasksOn(tk).forEach(function (t) {
      if (t.done) return;
      var st = U.toMin(t.start);
      if (st < nm - 5) return;
      if (!best || st < U.toMin(best.start)) best = t;
    });
    return best;
  }

  function bannerInfo() {
    var st = DM.store.stats(U.todayKey());
    if (!st.count) return null;
    if (!st.undone) return { kick: '今天 ' + st.done + ' 件', main: '全部点完了，收工。' };
    var nx = next();
    if (!nx) return { kick: '今天还有 ' + st.undone + ' 件', main: '都过点了，去补个勾。' };
    var mins = U.toMin(nx.start) - U.nowMin();
    return {
      kick: '今天还有 ' + st.undone + ' 件',
      main: nx.start + ' ' + nx.title + ' · ' + (mins < 0 ? '已到点' : U.humanDur(mins) + '后')
    };
  }
  function bannerText() {
    var i = bannerInfo();
    return i ? i.kick + ' · ' + i.main : '';
  }

  function start() {
    stop();
    scan(true);
    timer = setInterval(function () { scan(false); }, CHECK_MS);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  DM.remind = {
    start: start,
    stop: stop,
    scan: scan,
    next: next,
    bannerText: bannerText,
    bannerInfo: bannerInfo,
    updateBadge: updateBadge,
    requestPermission: requestPermission,
    permission: perm,
    beep: beep
  };
})();
