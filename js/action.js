/* 点卯 · 长按操作面板（放弃 / 延迟完成 / 移到以后 / 恢复正常） */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var el = {};
  var curId = null;
  var mode = 'task';            // task | ghost | move
  var moveCtx = null;           // { ids:[], from:'YYYY-MM-DD' }

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

  /* ---------------- 面板内容 ---------------- */
  function itemsOf(t) {
    var list = [];
    var past = t.date < U.todayKey();
    if (past) {
      if (!t.done && !t.dropped) {
        list.push({ k: 'move', label: '移到以后…', hint: '换一天再做，原位留个浅色印记' });
        var undone = DM.store.tasksOn(t.date).filter(function (x) { return !x.done && !x.dropped; });
        if (undone.length > 1) {
          list.push({
            k: 'moveall', label: '这天没做的 ' + undone.length + ' 件都挪走…',
            hint: '一次搬完，原位各留一个印记'
          });
        }
      }
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
    if (t.movedFrom) {
      list.push({ k: 'unmove', label: '放回 ' + U.fmtDayTitle(t.movedFrom), hint: '撤销平移，印记消失' });
    }
    var s = t.seriesId ? DM.repeat.get(t.seriesId) : null;
    if (s) {
      list.push({ k: 'skip', label: '跳过这次', hint: '这一天不要了，重复照旧' });
      list.push({ k: 'endseries', label: '结束重复', hint: '从这天起不再自动出现' });
    }
    list.push({ k: 'edit', label: '编辑事项', hint: '' });
    return list;
  }

  function head(title, sub) {
    el.head.innerHTML = '';
    var ti = document.createElement('div');
    ti.className = 'sheet-title';
    ti.textContent = title;
    el.head.appendChild(ti);
    if (sub) {
      var s = document.createElement('div');
      s.className = 'sheet-sub';
      s.textContent = sub;
      el.head.appendChild(s);
    }
  }

  function fillList(items) {
    el.list.innerHTML = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'sheet-item' + (it.k === 'drop' ? ' warn' : '') +
        (it.k === 'delayed' ? ' late' : '') + (it.k === 'move' || it.k === 'moveall' ? ' mv' : '');
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
  }

  function show() {
    el.mask.hidden = false;
    el.box.hidden = false;
    // 下一帧加类，保证过渡动画生效
    requestAnimationFrame(function () {
      el.mask.classList.add('on');
      el.box.classList.add('on');
    });
  }

  /* ---------------- 打开：普通任务 ---------------- */
  function open(id) {
    var t = DM.store.getTask(id);
    if (!t || !el.box) return;
    if (isOpen()) { el.box.classList.remove('on'); el.mask.classList.remove('on'); }
    curId = id;
    mode = 'task';
    moveCtx = null;

    var stateTxt = t.dropped ? '已放弃' :
      (t.done ? (t.delayed ? '延迟完成' : '已完成') : '未完成');
    var stxt = U.fmtDayTitle(t.date) + ' · ' + t.start + ' · ' + stateTxt;
    if (t.movedFrom) stxt += ' · 由 ' + U.fmtDayTitle(t.movedFrom) + ' 移来';
    if (t.seriesId) {
      var se = DM.repeat.get(t.seriesId);
      if (se) stxt += ' · ⟳ ' + DM.repeat.describe(se.rule, se.startDate);
    }

    head(t.title, stxt);
    fillList(itemsOf(t));
    show();
  }

  /* ---------------- 打开：原位的印记 ---------------- */
  function openMoved(id, originDate) {
    var t = DM.store.getTask(id);
    if (!t || !el.box) return;
    if (isOpen()) { el.box.classList.remove('on'); el.mask.classList.remove('on'); }
    curId = id;
    mode = 'ghost';
    moveCtx = null;

    var state = t.dropped ? '已放弃' : (t.done ? '已延迟完成' : '已移动');
    head(t.title, U.fmtDayTitle(originDate) + ' 挪到了 ' + U.fmtDayTitle(t.date) + ' · ' + state);
    fillList([
      { k: 'goto', label: '去 ' + U.fmtDayTitle(t.date) + ' 看看', hint: '跳到它现在待的那天' },
      { k: 'unmove', label: '放回 ' + U.fmtDayTitle(originDate), hint: '撤销平移，印记消失' },
      { k: 'edit', label: '编辑事项', hint: '' }
    ]);
    show();
  }

  /* ---------------- 打开：选个日子搬过去 ---------------- */
  function shortDay(key) {
    var d = U.parseKey(key);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function nextWd(key, wd) {
    var d = key;
    for (var i = 0; i < 8; i++) {
      d = U.addDays(d, 1);
      if (DM.repeat && DM.repeat.weekdayOf(d) === wd) return d;
    }
    return U.addDays(key, 7);
  }

  function openMove(ids, from) {
    if (!ids || !ids.length || !el.box) { close(); return; }
    if (isOpen()) { el.box.classList.remove('on'); el.mask.classList.remove('on'); }
    curId = ids.length === 1 ? ids[0] : null;
    mode = 'move';
    moveCtx = { ids: ids.slice(), from: from };

    var t = ids.length === 1 ? DM.store.getTask(ids[0]) : null;
    head(t ? t.title : ids.length + ' 件没做的事',
      t ? '从 ' + U.fmtDayTitle(from) + ' 挪走，原位留个印记'
        : '把 ' + U.fmtDayTitle(from) + ' 没做的 ' + ids.length + ' 件一起挪走');

    var base = from < U.todayKey() ? U.todayKey() : from;
    var quick = [];
    function push(d, label) {
      if (d <= base) return;
      for (var i = 0; i < quick.length; i++) if (quick[i].d === d) return;
      quick.push({ d: d, label: label });
    }
    push(U.addDays(base, 1), '明天');
    push(U.addDays(base, 2), '后天');
    push(nextWd(base, 1), '下周一');
    push(U.addDays(base, 7), '一周后');

    var def = quick.length ? quick[0].d : U.addDays(base, 1);

    el.list.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'move-box';

    var q = document.createElement('div');
    q.className = 'move-quick';
    quick.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'mv-q';
      b.dataset.d = it.d;
      var k = document.createElement('b');
      k.textContent = it.label;
      var v = document.createElement('span');
      v.textContent = shortDay(it.d);
      b.appendChild(k);
      b.appendChild(v);
      b.addEventListener('click', function () { doMove(it.d); });
      q.appendChild(b);
    });
    box.appendChild(q);

    var row = document.createElement('div');
    row.className = 'move-row';
    var inp = document.createElement('input');
    inp.type = 'date';
    inp.className = 'input';
    inp.id = 'moveDate';
    inp.value = def;
    inp.min = U.addDays(base, 1);
    var go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn primary move-go';
    go.id = 'moveGo';
    go.textContent = '移过去';
    go.addEventListener('click', function () {
      var d = inp.value;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) {
        if (DM.toast) DM.toast('先选一天', '');
        return;
      }
      doMove(d);
    });
    row.appendChild(inp);
    row.appendChild(go);
    box.appendChild(row);

    var tip = document.createElement('p');
    tip.className = 'move-tip';
    tip.textContent = '原位留个浅色印记：后来做完了显示「已延迟完成」，还没做就显示「已移动」。';
    box.appendChild(tip);

    el.list.appendChild(box);
    show();
  }

  function doMove(target) {
    if (!moveCtx) { close(); return; }
    var ids = moveCtx.ids.slice();
    var from = moveCtx.from;
    if (target <= from) {
      if (DM.toast) DM.toast('只能往以后挪', '目标日要在 ' + U.fmtDayTitle(from) + ' 之后');
      return;
    }
    var n = 0;
    ids.forEach(function (id) {
      if (!DM.store.getTask(id)) return;
      if (DM.store.moveTo(id, target)) n++;
    });
    moveCtx = null;
    close();
    afterChange();
    if (DM.toast) {
      DM.toast('已移到 ' + U.fmtDayTitle(target), n + ' 件 · 点这里去看看', function () {
        if (DM.app) DM.app.openDate(target);
      });
    }
  }

  /* ---------------- 关闭 ---------------- */
  function close() {
    if (!el.box || el.box.hidden) return;
    curId = null;                       // 立刻失效，避免动画期间误用旧 id
    moveCtx = null;
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

  /* ---------------- 执行 ---------------- */
  function act(k) {
    var id = curId;
    var t = id ? DM.store.getTask(id) : null;
    if (!t) { close(); return; }

    if (k === 'edit') {
      close();
      setTimeout(function () { if (DM.editor) DM.editor.open(id); }, 200);
      return;
    }

    if (k === 'goto') {
      var dest = t.date;
      close();
      setTimeout(function () { if (DM.app) DM.app.openDate(dest); }, 200);
      return;
    }

    if (k === 'unmove') {
      var back = t.movedFrom;
      var done = DM.store.moveBack(id);
      close();
      afterChange();
      if (DM.toast && done) DM.toast('已放回原位', U.fmtDayTitle(back));
      return;
    }

    if (k === 'move') {
      openMove([id], t.date);
      return;
    }

    if (k === 'moveall') {
      var undone = DM.store.tasksOn(t.date).filter(function (x) { return !x.done && !x.dropped; });
      openMove(undone.map(function (x) { return x.id; }), t.date);
      return;
    }

    if (k === 'skip' || k === 'endseries') {
      var se = t.seriesId ? DM.repeat.get(t.seriesId) : null;
      if (!se) { close(); return; }
      if (k === 'skip') {
        DM.repeat.detach(se.id, t.movedFrom || t.date);   // 平移动过的，把原日期一起排除掉
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

  DM.sheet = {
    init: init, open: open, close: close, isOpen: isOpen,
    openMoved: openMoved, openMove: openMove,
    mode: function () { return mode; }
  };
})();
