/* 点卯 · 长按操作面板（放弃 / 延迟完成 / 恢复正常） */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var el = {};
  var curId = null;

  function $(id) { return document.getElementById(id); }

  function init() {
    el.mask = $('sheetMask');
    el.box = $('sheet');
    el.head = $('sheetHead');
    el.list = $('sheetList');
    el.cancel = $('sheetCancel');
    if (!el.box) return;

    el.mask.addEventListener('click', close);
    el.cancel.addEventListener('click', close);

    el.list.addEventListener('click', function (e) {
      var b = e.target.closest('.sheet-item');
      if (!b) return;
      act(b.dataset.k);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) close();
    });
  }

  function isOpen() { return !!(el.box && !el.box.hidden && el.box.classList.contains('on')); }

  function itemsOf(t) {
    var list = [];
    var past = t.date < U.todayKey();
    if (past) {
      if (!t.dropped) {
        list.push({ k: 'drop', label: '放弃', hint: '不做了，日历上标灰点' });
      }
      if (!(t.done && t.delayed)) {
        list.push({ k: 'delayed', label: '已延迟完成', hint: '后来补上了，日历上标黄点' });
      }
      if (t.dropped || t.delayed) {
        list.push({ k: 'reset', label: '恢复正常', hint: '清掉标记，回到未完成' });
      }
    }
    var s = t.seriesId ? DM.repeat.get(t.seriesId) : null;
    if (s) {
      list.push({ k: 'skip', label: '跳过这次', hint: '这一天不要了，重复照旧' });
      list.push({ k: 'endseries', label: '结束重复', hint: '从这天起不再自动出现' });
    }
    list.push({ k: 'edit', label: '编辑事项', hint: '' });
    return list;
  }

  function open(id) {
    var t = DM.store.getTask(id);
    if (!t || !el.box) return;
    if (isOpen()) { el.box.classList.remove('on'); el.mask.classList.remove('on'); }
    curId = id;

    var items = itemsOf(t);
    var stateTxt = t.dropped ? '已放弃' : (t.delayed ? '延迟完成' : (t.done ? '已完成' : '未完成'));

    el.head.innerHTML = '';
    var ti = document.createElement('div');
    ti.className = 'sheet-title';
    ti.textContent = t.title;
    var sub = document.createElement('div');
    sub.className = 'sheet-sub';
    var stxt = U.fmtDayTitle(t.date) + ' · ' + t.start + ' · ' + stateTxt;
    if (t.seriesId) {
      var se = DM.repeat.get(t.seriesId);
      if (se) stxt += ' · ⟳ ' + DM.repeat.describe(se.rule, se.startDate);
    }
    sub.textContent = stxt;
    el.head.appendChild(ti);
    el.head.appendChild(sub);

    el.list.innerHTML = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sheet-item' + (it.k === 'drop' ? ' warn' : '') + (it.k === 'delayed' ? ' late' : '');
      b.dataset.k = it.k;
      var m = document.createElement('span');
      m.className = 'si-main';
      m.textContent = it.label;
      b.appendChild(m);
      if (it.hint) {
        var h = document.createElement('span');
        h.className = 'si-hint';
        h.textContent = it.hint;
        b.appendChild(h);
      }
      el.list.appendChild(b);
    });

    el.mask.hidden = false;
    el.box.hidden = false;
    // 下一帧加类，保证过渡动画生效
    requestAnimationFrame(function () {
      el.mask.classList.add('on');
      el.box.classList.add('on');
    });
  }

  function close() {
    if (!el.box || el.box.hidden) return;
    curId = null;                       // 立刻失效，避免动画期间误用旧 id
    el.mask.classList.remove('on');
    el.box.classList.remove('on');
    setTimeout(function () {
      if (!el.box.classList.contains('on')) {
        el.mask.hidden = true;
        el.box.hidden = true;
      }
    }, 180);
  }

  function afterChange() {
    if (DM.day) DM.day.render();
    if (DM.month) DM.month.refresh();
    if (DM.remind) DM.remind.updateBadge();
    if (DM.banner) DM.banner.refresh();
  }

  function act(k) {
    var id = curId;
    var t = id ? DM.store.getTask(id) : null;
    if (!t) { close(); return; }

    if (k === 'edit') {
      close();
      setTimeout(function () { if (DM.editor) DM.editor.open(id); }, 200);
      return;
    }

    if (k === 'skip' || k === 'endseries') {
      var se = t.seriesId ? DM.repeat.get(t.seriesId) : null;
      if (!se) { close(); return; }
      if (k === 'skip') {
        DM.repeat.detach(se.id, t.date);
        DM.store.remove(t.id);
        close();
        afterChange();
        if (DM.toast) DM.toast('跳过这次', U.fmtDayTitle(t.date) + ' 不再出现');
      } else {
        if (!window.confirm('从「' + U.fmtDayTitle(t.date) + '」起结束这个重复？\n\n之前的记录会留着。')) {
          close();
          return;
        }
        DM.repeat.end(se.id, t.date);
        close();
        afterChange();
        if (DM.toast) DM.toast('已结束重复', t.title);
      }
      return;
    }

    var next;
    if (k === 'drop') next = DM.store.drop(id);
    else if (k === 'delayed') next = DM.store.setDelayed(id, true);
    else if (k === 'reset') next = DM.store.clearMarks(id);

    close();
    afterChange();
    if (DM.toast && next) {
      if (k === 'drop') DM.toast('已放弃', next.title);
      else if (k === 'delayed') DM.toast('记为延迟完成', next.title);
      else if (k === 'reset') DM.toast('已恢复正常', next.title);
    }
  }

  DM.sheet = { init: init, open: open, close: close, isOpen: isOpen };
})();
