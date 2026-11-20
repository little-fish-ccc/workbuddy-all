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
      // 长按刚弹过面板，这一下点击不算数
      if (Date.now() < press.until) { e.stopPropagation(); return; }

      var sb = e.target.closest('.s-box');
      if (sb) {
        e.stopPropagation();
        var blk = sb.closest('.blk');
        var tk = blk ? DM.store.toggleSub(blk.dataset.id, sb.dataset.sub) : null;
        if (tk) afterChange(tk);
        return;
      }
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

    /* ---- 长按：过去日期里没做的事，可标记「放弃 / 延迟完成」 ---- */
    el.track.addEventListener('pointerdown', pressStart);
    el.track.addEventListener('pointermove', pressMove);
    el.track.addEventListener('pointerup', pressCancel);
    el.track.addEventListener('pointercancel', pressCancel);
    el.track.addEventListener('pointerleave', pressCancel);
  }

  var press = { timer: null, x: 0, y: 0, id: null, fired: false, until: 0 };

  function pressCancel() {
    if (press.timer) { clearTimeout(press.timer); press.timer = null; }
  }

  function pressStart(e) {
    if (DM.sheet && DM.sheet.isOpen()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    var node = e.target && e.target.closest ? e.target.closest('.blk,.mark') : null;
    if (!node || !node.dataset.id) return;
    // 任何日期都能长按；「放弃 / 延迟完成」由面板按是否为过去日自行取舍

    press.id = node.dataset.id;
    press.x = e.clientX;
    press.y = e.clientY;
    press.fired = false;
    pressCancel();
    press.timer = setTimeout(function () {
      press.timer = null;
      press.fired = true;
      press.until = Date.now() + 700;
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (err) { } }
      if (DM.sheet) DM.sheet.open(press.id);
    }, 460);
  }

  function pressMove(e) {
    if (!press.timer) return;
    if (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10) pressCancel();
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
    if (DM.repeat) DM.repeat.ensure(date, date);   // 重复系列按需生成这一天的实例
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
    var bits = [];
    if (st.undone) bits.push('还有 ' + st.undone + ' 件');
    if (st.dropped) bits.push(st.dropped + ' 件已放弃');
    if (!bits.length) return ' · 全部点完';
    return ' · ' + bits.join(' · ');
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

  /* ---- 块内高度预算：先保证放得下的行数，再决定标题折几行 ---- */
  var PAD = 13;          // 上下 padding + 边框
  var META_H = 15;       // 时间行
  var TITLE_LH = 17;     // 标题行高
  var SUB_LH = 19;       // 子任务行高

  function layoutOf(height, subs) {
    var contentH = Math.max(0, height - PAD);
    if (contentH < 34) return { tiny: true, lines: 1, rows: 0, meta: false };
    if (subs && subs.length) {
      var room = contentH - META_H;
      var rows = Math.min(subs.length, Math.max(1, Math.floor(room / SUB_LH)));
      return { tiny: false, lines: 0, rows: rows, meta: true };
    }
    // 先看「标题 + 时间行」能放几行；放不下两行就让时间行让位给标题
    var withMeta = Math.floor((contentH - META_H) / TITLE_LH);
    if (withMeta >= 2) return { tiny: false, lines: Math.min(6, withMeta), rows: 0, meta: true };
    var noMeta = Math.floor(contentH / TITLE_LH);
    if (noMeta >= 2 && contentH >= 2 * TITLE_LH + 6) {   // 留点余量，别挤到贴边
      return { tiny: false, lines: Math.min(6, noMeta), rows: 0, meta: false };
    }
    return { tiny: false, lines: 1, rows: 0, meta: withMeta >= 1 };
  }

  function checkSvg() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5L20 6.5"/></svg>';
  }

  function blockEl(b) {
    var t = b.task;
    var d = DM.store.domain(t.domain);
    var subs = t.subs || [];
    var st = DM.store.subStats(t);
    var lay = layoutOf(b.height, subs);
    var partial = st.total > 0 && st.done > 0 && st.done < st.total;

    var div = document.createElement('div');
    div.className = 'blk' + (lay.tiny ? ' tiny' : '') + (t.done ? ' done' : '') +
      (t.dropped ? ' dropped' : '') + (t.done && t.delayed ? ' late' : '') +
      (b.off ? ' off' : '') + (partial ? ' part' : '') + (t.seriesId ? ' rep' : '');
    div.dataset.id = t.id;
    div.style.cssText = 'top:' + b.top + 'px;height:' + b.height + 'px;left:' +
      b.left + '%;width:calc(' + b.width + '% - ' + (b.lanes > 1 ? 3 : 0) + 'px);--c:' + d.color;
    if (t.attachments && t.attachments.length) div.classList.add('has-att');

    var body = document.createElement('div');
    body.className = 'b-body';

    var endStr = U.toHHMM(Math.min(1440, U.toMin(t.start) + (t.duration || 0)));
    var timeTxt = (t.seriesId ? '⟳ ' : '') + t.start + '–' + endStr + (b.off ? ' · 航道外' : '');

    /* 有子任务且放得下 → 让位给清单；否则显示标题（可折行） */
    if (lay.rows > 0) {
      var meta = document.createElement('div');
      meta.className = 'b-meta';
      meta.textContent = timeTxt + ' · ' + st.done + '/' + st.total;
      body.appendChild(meta);

      var wrap = document.createElement('div');
      wrap.className = 'b-subs';
      subs.slice(0, lay.rows).forEach(function (s) {
        var row = document.createElement('div');
        row.className = 'sub-row' + (s.done ? ' on' : '');
        var box = document.createElement('button');
        box.type = 'button';
        box.className = 's-box';
        box.dataset.sub = s.id;
        box.setAttribute('aria-label', s.done ? '取消完成' : '完成');
        box.innerHTML = checkSvg();
        var txt = document.createElement('span');
        txt.className = 's-text';
        txt.textContent = s.text;
        txt.title = s.text;
        row.appendChild(box);
        row.appendChild(txt);
        wrap.appendChild(row);
      });
      body.appendChild(wrap);
    } else {
      var ti = document.createElement('div');
      ti.className = 'b-title';
      ti.textContent = t.title;
      if (!lay.tiny) {
        ti.style.webkitLineClamp = String(lay.lines);
        try { ti.style.setProperty('-webkit-line-clamp', String(lay.lines)); } catch (e) { }
        ti.style.maxHeight = (lay.lines * TITLE_LH) + 'px';
        ti.setAttribute('data-lines', String(lay.lines));
      }
      body.appendChild(ti);

      if (lay.meta !== false) {
        var meta2 = document.createElement('div');
        meta2.className = 'b-meta';
        meta2.textContent = timeTxt + (st.total ? ' · ' + st.done + '/' + st.total : '');
        body.appendChild(meta2);
      }
    }

    div.appendChild(body);

    var ck = document.createElement('button');
    ck.type = 'button';
    ck.className = 'b-check';
    ck.setAttribute('aria-label', t.done ? '取消完成' : (st.total ? '全部完成' : '完成'));
    ck.innerHTML = checkSvg();
    div.appendChild(ck);

    return div;
  }

  function markEl(mk) {
    var t = mk.task;
    var d = DM.store.domain(t.domain);
    var div = document.createElement('div');
    div.className = 'mark' + (t.done ? ' done' : '') + (t.dropped ? ' dropped' : '') +
      (t.done && t.delayed ? ' late' : '') + (t.seriesId ? ' rep' : '');
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
    if (t.seriesId) {
      var rp = document.createElement('i');
      rp.className = 'm-rep';
      rp.textContent = '⟳';
      pill.appendChild(rp);
    }
    var b = document.createElement('b');
    var st = DM.store.subStats(t);
    // 有子任务时用「首条 等 N 项」，避免整句拼在一起看不清
    b.textContent = st.total
      ? (t.subs[0] ? t.subs[0].text : t.title) + ' 等 ' + st.total + ' 项'
      : t.title;
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

  function afterChange(t) {
    render();
    if (DM.month) DM.month.refresh();
    if (DM.remind) DM.remind.updateBadge();
    if (DM.banner) DM.banner.refresh();
    return t;
  }

  function doToggle(id) {
    var t = DM.store.toggle(id);
    if (!t) return;
    afterChange(t);
    if (DM.toast && t.done) DM.toast('点上了', t.title);
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
