/* 点卯 · 应用入口 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  DM.state = { date: U.todayKey(), view: 'day', bannerClosed: false, followToday: true };

  var el = {};
  function $(id) { return document.getElementById(id); }

  /* ---------------- toast / lightbox ---------------- */
  DM.toast = function (text, sub, onClick) {
    var wrap = $('toastWrap');
    if (!wrap) return;
    while (wrap.children.length >= 3) wrap.removeChild(wrap.firstChild);
    var d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    if (sub) {
      var s = document.createElement('span');
      s.className = 't-sub';
      s.textContent = sub;
      d.appendChild(s);
    }
    if (onClick) {
      d.style.pointerEvents = 'auto';
      d.addEventListener('click', function () { onClick(); kill(); });
    }
    wrap.appendChild(d);
    var t = setTimeout(kill, onClick ? 6000 : 2400);
    var dead = false;
    function kill() {
      if (dead) return;
      dead = true;
      clearTimeout(t);
      d.classList.add('out');
      setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 280);
    }
    return d;
  };

  DM.lightbox = function (url) {
    if (!url) return;
    var lb = $('lightbox'), img = $('lightboxImg');
    img.src = url;
    lb.hidden = false;
    lb.onclick = function () { lb.hidden = true; img.src = ''; };
  };

  /* ---------------- banner ---------------- */
  var banner = {
    refresh: function () {
      var s = DM.store.settings();
      var info = DM.remind.bannerInfo();
      var box = $('banner');
      if (!info || DM.state.bannerClosed) { box.hidden = true; return; }
      $('bannerKick').textContent = info.kick;
      $('bannerText').textContent = info.main;
      box.hidden = false;

      var act = $('bannerAction');
      var needPerm = s.notify && DM.remind.permission() === 'default';
      act.hidden = !needPerm;
    }
  };
  DM.banner = banner;

  /* ---------------- 视图切换 ---------------- */
  function setView(v) {
    DM.state.view = v;
    var isDay = v === 'day';
    $('viewDay').hidden = !isDay;
    $('viewMonth').hidden = isDay;
    $('tabDay').classList.toggle('active', isDay);
    $('tabMonth').classList.toggle('active', !isDay);
    $('fab').classList.toggle('hide', false);
    if (!isDay) DM.month.render();
    else DM.day.render();
    $('main').scrollTop = isDay ? $('main').scrollTop : 0;
  }

  function openDate(key) {
    DM.state.date = key;
    DM.state.followToday = key === U.todayKey();
    DM.state.scrolledOnce = false;
    DM.day.setDate(key);
    setView('day');
  }

  function openTask(id) {
    var t = DM.store.getTask(id);
    if (!t) return;
    DM.state.date = t.date;
    DM.day.setDate(t.date);
    setView('day');
    setTimeout(function () { DM.editor.open(id); }, 60);
  }

  DM.app = { setView: setView, openDate: openDate, openTask: openTask, banner: banner };

  /* ---------------- 设置面板 ---------------- */
  function buildSettings() {
    var startSel = $('sDayStart'), endSel = $('sDayEnd');
    startSel.innerHTML = '';
    endSel.innerHTML = '';
    for (var h = 0; h <= 12; h++) {
      var o = document.createElement('option');
      o.value = U.pad2(h) + ':00';
      o.textContent = U.pad2(h) + ':00';
      startSel.appendChild(o);
    }
    for (var h2 = 12; h2 <= 24; h2++) {
      var o2 = document.createElement('option');
      o2.value = U.pad2(h2) + ':00';
      o2.textContent = h2 === 24 ? '24:00' : U.pad2(h2) + ':00';
      endSel.appendChild(o2);
    }

    $('sNotify').addEventListener('change', function () {
      DM.store.saveSettings({ notify: this.checked });
      if (this.checked) {
        DM.remind.requestPermission().then(function (p) {
          if (p !== 'granted') DM.toast('浏览器没有放行通知', '站内提醒仍然有效');
          banner.refresh();
        });
      }
      banner.refresh();
    });
    $('sSound').addEventListener('change', function () {
      DM.store.saveSettings({ sound: this.checked });
      if (this.checked) DM.remind.beep();
    });
    $('sShowDone').addEventListener('change', function () {
      DM.store.saveSettings({ showDone: this.checked });
      DM.day.render();
    });
    startSel.addEventListener('change', function () {
      DM.store.saveSettings({ dayStart: this.value });
      DM.day.render();
    });
    endSel.addEventListener('change', function () {
      DM.store.saveSettings({ dayEnd: this.value });
      DM.day.render();
    });
    $('btnExport').addEventListener('click', doExport);
    $('btnClear').addEventListener('click', function () {
      if (!window.confirm('清空全部事项？此操作不可恢复。')) return;
      DM.store.clearAll();
      DM.editor.close();
      DM.day.render();
      DM.month.render();
      banner.refresh();
      DM.toast('已清空', '航道重新变得干净');
    });
    $('stDone').addEventListener('click', closeSettings);
    $('stClose').addEventListener('click', closeSettings);
  }

  function openSettings() {
    var s = DM.store.settings();
    $('sNotify').checked = !!s.notify;
    $('sSound').checked = !!s.sound;
    $('sShowDone').checked = !!s.showDone;
    $('sDayStart').value = s.dayStart;
    $('sDayEnd').value = s.dayEnd;
    $('settings').classList.add('open');
    $('settings').setAttribute('aria-hidden', 'false');
    $('mask').hidden = false;
  }
  function closeSettings() {
    $('settings').classList.remove('open');
    $('settings').setAttribute('aria-hidden', 'true');
    $('mask').hidden = true;
  }

  function doExport() {
    var data = JSON.parse(JSON.stringify(DM.store.all()));
    var jobs = [];
    data.tasks.forEach(function (t) {
      if (t.attachments && t.attachments.length) {
        jobs.push(Promise.all(t.attachments.map(function (k) {
          return DM.store.fileGet(k).then(function (src) { return { key: k, src: src }; });
        })).then(function (arr) { t.attachments = arr; }));
      }
    });
    Promise.all(jobs).then(function () {
      var payload = {
        type: 'dianmao-backup', v: 1,
        at: new Date().toISOString(),
        db: DM.store.leanClone(data)
      };
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'dianmao-' + U.todayKey() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 600);
      DM.toast('已导出备份', '图片已内联进 JSON');
    });
  }

  /* ---------------- 绑定 ---------------- */
  function bind() {
    $('btnPrev').addEventListener('click', function () { step(-1); });
    $('btnNext').addEventListener('click', function () { step(1); });
    $('btnSettings').addEventListener('click', openSettings);
    $('tabDay').addEventListener('click', function () { setView('day'); });
    $('tabMonth').addEventListener('click', function () { setView('month'); });
    $('tabToday').addEventListener('click', function () {
      var t = U.todayKey();
      var alreadyHere = DM.state.view === 'day' && DM.state.date === t;
      DM.state.followToday = true;
      if (alreadyHere) { DM.day.scrollToNow(); return; }   // 已经在这天，就回到此刻
      DM.state.date = t;
      DM.day.setDate(t);
      setView('day');
      DM.day.scrollToNow();
    });
    $('fab').addEventListener('click', function () {
      DM.editor.open(null, { date: DM.state.date });
    });
    $('mask').addEventListener('click', closeSettings);
    $('bannerClose').addEventListener('click', function () {
      DM.state.bannerClosed = true;
      $('banner').hidden = true;
    });
    $('bannerAction').addEventListener('click', function () {
      DM.remind.requestPermission().then(function (p) {
        if (p === 'granted') DM.toast('提醒已开启', '页面开着时到点会响');
        else DM.toast('没有拿到通知权限', '站内提醒仍然有效');
        banner.refresh();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!$('lightbox').hidden) { $('lightbox').hidden = true; return; }
        DM.editor.close();
        closeSettings();
      }
    });
  }

  function step(n) {
    var d = U.addDays(DM.state.date, n);
    DM.state.date = d;
    DM.state.followToday = d === U.todayKey();
    DM.day.setDate(d);
    if (DM.state.view === 'month') DM.month.render();
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    DM.store.init();
    DM.editor.init();
    if (DM.sheet) DM.sheet.init();
    DM.day.init();
    DM.month.init();
    buildSettings();
    bind();
    banner.refresh();
    DM.remind.start();
    DM.day.startTick();

    // 首次进入给一条示范，帮助理解“航程”与“航标”的区别
    var s = DM.store.settings();
    if (s.firstRun && DM.store.all().tasks.length === 0) {
      var tk = U.todayKey();
      DM.store.upsert({
        id: DM.store.uid(), date: tk, start: '09:30', duration: 60,
        title: '试试：把这件事点掉', domain: 'work', note: '点右侧的勾，或者点开改成你的事',
        remind: { before: -1, notified: false }
      });
      DM.store.upsert({
        id: DM.store.uid(), date: tk, start: '14:00', duration: null,
        title: '只定开始时刻的事', domain: 'life', note: '没有时长，只占一个时刻',
        remind: { before: -1, notified: false }
      });
      DM.store.saveSettings({ firstRun: false });
      DM.store.save();
      DM.day.render();
      DM.month.render();
      banner.refresh();
    }

    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('./sw.js').catch(function () { /* 静默 */ });
      });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        var t = U.todayKey();
        if (DM.state.followToday && DM.state.date !== t) {
          DM.state.date = t;
          DM.day.setDate(t);
          if (DM.state.view === 'month') DM.month.render();
        } else {
          DM.day.render();
        }
        DM.remind.scan(false);
        banner.refresh();
      } else {
        DM.store.save();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
