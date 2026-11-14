/* 点卯 · 一日航道视图 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var PX = 1.2;
  var el = {};
  var state = { date: U.todayKey(), scrolledOnce: false };
  var tickTimer = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    el.main = $('main');
    el.view = $('viewDay');
    el.river = $('river');
    el.axis = $('axis');
    el.track = $('track');
    el.grid = $('grid');
    el.blocks = $('blocks');
    el.nowline = $('nowline');
    el.nowLabel = $('nowLabel');
    el.empty = $('emptyHint');
    el.title = $('dayTitle');
    el.sub = $('daySub');

    bind();
    render();
  }

  function bind() {
    el.track.addEventListener('click', function (e) {
      var chk = e.target.closest('.b-check');
      if (chk) {
        e.stopPropagation();
        var id1 = chk.closest('.blk').dataset.id;
        doToggle(id1);
        return;
      }
      var blk = e.target.closest('.blk');
      if (blk) { e.stopPropagation(); DM.editor.open(blk.dataset.id); return; }
      var mk = e.target.closest('.mark');
      if (mk) { e.stopPropagation(); DM.editor.open(mk.dataset.id); return; }

      // 空白处 → 以 15 分钟档新建
      var r = el.track.getBoundingClientRect();
      var y = e.clientY - r.top;
      var s = DM.store.settings();
      var origin = U.toMin(s.dayStart);
      var m = Math.round((origin + y / PX) / 15) * 15;
      DM.editor.open(null, { date: state.date, start: U.toHHMM(m) });
    });

    el.main.addEventListener('scroll', function () {
      var top = $('topbar');
      if (top) top.classList.toggle('scrolled', el.main.scrollTop > 4);
    }, { passive: true });
  }

  function opts() {
    var s = DM.store.settings();
    var origin = U.toMin(s.dayStart);
    var end = Math.max(origin + 120, U.toMin(s.dayEnd));
    return { originMin: origin, endMin: end, px: PX };
  }

  function render() {
    var o = opts();
    var date = state.date;
    var s = DM.store.settings();
    var H = (o.endMin - o.originMin) * PX;

    el.title.textContent = U.fmtDayTitle(date);
    el.sub.textContent = U.fmtDaySub(date) + attn(date);

    /* 时间刻度 */
    el.axis.innerHTML = '';
    el.grid.innerHTML = '';
    for (var m = o.originMin; m <= o.endMin; m += 30) {
      var y = (m - o.originMin) * PX;
      var isHour = m % 60 === 0;
      if (isHour) {
        var lab = document.createElement('span');
        lab.className = 'hour' + (m % 360 === 0 ? ' major' : '');
        lab.style.top = y + 'px';
        lab.textContent = m === 1440 ? '24' : U.toHHMM(m).slice(0, 2) + ':00';
        el.axis.appendChild(lab);
      }
      if (m === o.endMin) continue;
      var line = document.createElement('i');
      line.className = 'gl' + (isHour ? '' : ' half');
      line.style.top = y + 'px';
      el.grid.appendChild(line);
    }
    el.track.style.height = H + 'px';

    /* 任务 */
    var list = DM.store.tasksOn(date);
    var shown = list.filter(function (t) { return s.showDone || !t.done; });
    var lay = DM.lane.compute(shown, o);

    el.blocks.innerHTML = '';
    lay.blocks.forEach(function (b) { el.blocks.appendChild(blockEl(b)); });
    lay.marks.forEach(function (mk) { el.blocks.appendChild(markEl(mk)); });

    el.empty.hidden = shown.length > 0;

    /* 此刻水线 */
    var isToday = date === U.todayKey();
    if (isToday) {
      var off = DM.lane.nowOffset(o);
      if (off == null) {
        el.nowline.hidden = true;
      } else {
        el.nowline.hidden = false;
        el.nowline.style.top = off + 'px';
        el.nowLabel.textContent = U.toHHMM(U.nowMin());
      }
    } else {
      el.nowline.hidden = true;
    }

    if (!state.scrolledOnce) {
      state.scrolledOnce = true;
      scrollToFocus(o);
    }
  }

  function attn(date) {
    var st = DM.store.stats(date);
    if (!st.count) return '';
    if (!st.undone) return ' · 全部点完';
    return ' · 还有 ' + st.undone + ' 件';
  }

  function scrollToFocus(o) {
    var top;
    var isToday = state.date === U.todayKey();
    if (isToday) {
      var off = DM.lane.nowOffset(o);
      top = off == null ? 0 : off;
    } else {
      // 跳到第一个任务处
      var first = DM.store.tasksOn(state.date)[0];
      top = first ? (U.toMin(first.start) - o.originMin) * PX : 0;
    }
    requestAnimationFrame(function () {
      el.main.scrollTop = Math.max(0, top - 96);
    });
  }

  function blockEl(b) {
    var t = b.task;
    var d = DM.store.domain(t.domain);
    var div = document.createElement('div');
    div.className = 'blk' + (b.height < 34 ? ' tiny' : '') + (t.done ? ' done' : '') + (b.off ? ' off' : '');
    div.dataset.id = t.id;
    div.style.cssText = 'top:' + b.top + 'px;height:' + b.height + 'px;left:' +
      b.left + '%;width:calc(' + b.width + '% - ' + (b.lanes > 1 ? 3 : 0) + 'px);--c:' + d.color;
    if (t.attachments && t.attachments.length) div.classList.add('has-att');

    var ti = document.createElement('div');
    ti.className = 'b-title';
    ti.textContent = t.title;
    div.appendChild(ti);

    var meta = document.createElement('div');
    meta.className = 'b-meta';
    var endStr = U.toHHMM(Math.min(1440, U.toMin(t.start) + (t.duration || 0)));
    meta.textContent = t.start + '–' + endStr + (b.off ? ' · 航道外' : '');
    div.appendChild(meta);

    var ck = document.createElement('button');
    ck.type = 'button';
    ck.className = 'b-check';
    ck.setAttribute('aria-label', t.done ? '取消完成' : '完成');
    ck.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5L20 6.5"/></svg>';
    div.appendChild(ck);

    return div;
  }

  function markEl(mk) {
    var t = mk.task;
    var d = DM.store.domain(t.domain);
    var div = document.createElement('div');
    div.className = 'mark' + (t.done ? ' done' : '');
    div.dataset.id = t.id;
    div.style.cssText = 'top:' + mk.top + 'px;--c:' + d.color;

    var line = document.createElement('i');
    line.className = 'm-line';
    div.appendChild(line);

    var pill = document.createElement('div');
    pill.className = 'm-pill';
    var flag = document.createElement('i');
    flag.className = 'm-flag';
    pill.appendChild(flag);
    var b = document.createElement('b');
    b.textContent = t.title;
    pill.appendChild(b);
    pill.appendChild(document.createTextNode(' ' + t.start));
    div.appendChild(pill);

    var dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'm-dot';
    dot.setAttribute('aria-label', t.done ? '取消完成' : '完成');
    dot.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5L20 6.5"/></svg>';
    dot.addEventListener('click', function (e) {
      e.stopPropagation();
      doToggle(t.id);
    });
    div.appendChild(dot);

    return div;
  }

  function doToggle(id) {
    var t = DM.store.toggle(id);
    if (!t) return;
    render();
    if (DM.month) DM.month.refresh();
    if (DM.remind) DM.remind.updateBadge();
    if (DM.banner) DM.banner.refresh();
    if (DM.toast) {
      if (t.done) DM.toast('点上了', t.title);
    }
  }

  /* 回到此刻（或在非今天时回到当天第一件事） */
  function scrollToNow() {
    var o = opts();
    var top;
    if (state.date === U.todayKey()) {
      var off = DM.lane.nowOffset(o);
      top = off == null ? 0 : off;
    } else {
      var first = DM.store.tasksOn(state.date)[0];
      top = first ? (U.toMin(first.start) - o.originMin) * PX : 0;
    }
    el.main.scrollTop = Math.max(0, top - 96);
  }

  function go(date) {
    state.date = date;
    state.scrolledOnce = false;
    render();
  }

  function setDate(date, keepScroll) {
    if (keepScroll) state.scrolledOnce = true;
    state.date = date;
    render();
  }

  function redraw() { render(); }

  function startTick() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      if (state.date !== U.todayKey()) return;
      var o = opts();
      var off = DM.lane.nowOffset(o);
      if (off == null) { el.nowline.hidden = true; return; }
      el.nowline.hidden = false;
      el.nowline.style.top = off + 'px';
      el.nowLabel.textContent = U.toHHMM(U.nowMin());
    }, 30000);
  }

  DM.day = {
    init: init, render: render, redraw: redraw, go: go, setDate: setDate, scrollToNow: scrollToNow,
    startTick: startTick,
    state: state,
    opts: opts,
    PX: PX
  };
})();
