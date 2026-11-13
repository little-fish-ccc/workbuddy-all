/* 点卯 · 事项编辑抽屉 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var DUR_PRESETS = [0, 15, 30, 45, 60, 90, 120];
  var REMIND_OPTS = [0, 5, 10, 15, 30, 60, -1];

  var el = {};
  var cur = {
    id: null, atts: [], pending: [], duration: 0, domain: 'work',
    custom: false, prevStart: '', prevDate: '', prevRemind: 10, dirty: false
  };
  var seq = 0;

  function $(id) { return document.getElementById(id); }

  function init() {
    el.drawer = $('drawer');
    el.mask = $('mask');
    el.title = $('drTitle');
    el.fTitle = $('fTitle');
    el.fDate = $('fDate');
    el.fStart = $('fStart');
    el.fDur = $('fDur');
    el.customDur = $('customDur');
    el.fDurNum = $('fDurNum');
    el.fDomain = $('fDomain');
    el.fNote = $('fNote');
    el.fRemind = $('fRemind');
    el.fAtts = $('fAtts');
    el.fFile = $('fFile');
    el.drDelete = $('drDelete');

    buildChips();
    bind();
  }

  function buildChips() {
    el.fDur.innerHTML = '';
    DUR_PRESETS.forEach(function (m) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.min = m;
      b.textContent = m === 0 ? '仅定时刻' : (m < 60 ? m + ' 分钟' : (m / 60) + ' 小时');
      el.fDur.appendChild(b);
    });
    var c = document.createElement('button');
    c.type = 'button';
    c.className = 'chip';
    c.dataset.min = 'custom';
    c.textContent = '自定义';
    el.fDur.appendChild(c);

    el.fDomain.innerHTML = '';
    DM.store.domains().forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.domain = d.id;
      b.style.color = d.color;
      var dot = document.createElement('i');
      dot.style.background = d.color;
      b.appendChild(dot);
      b.appendChild(document.createTextNode(d.name));
      el.fDomain.appendChild(b);
    });

    el.fRemind.innerHTML = '';
    REMIND_OPTS.forEach(function (m) {
      var o = document.createElement('option');
      o.value = m;
      o.textContent = m === -1 ? '不提醒' : m === 0 ? '准时' : (m < 60 ? m + ' 分钟前' : (m / 60) + ' 小时前');
      el.fRemind.appendChild(o);
    });
  }

  function bind() {
    $('drClose').addEventListener('click', close);
    el.mask.addEventListener('click', close);
    $('drSave').addEventListener('click', save);
    el.drDelete.addEventListener('click', remove);

    el.fDur.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      if (b.dataset.min === 'custom') {
        cur.custom = true;
        cur.duration = parseInt(el.fDurNum.value, 10) || 30;
        el.customDur.hidden = false;
        el.fDurNum.focus();
      } else {
        cur.custom = false;
        cur.duration = +b.dataset.min;
        el.customDur.hidden = true;
      }
      paintDur();
    });

    el.fDurNum.addEventListener('input', function () {
      var v = parseInt(el.fDurNum.value, 10);
      if (!isNaN(v) && v > 0) { cur.duration = Math.min(720, v); }
    });

    el.fDomain.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      cur.domain = b.dataset.domain;
      paintDomain();
    });

    el.fAtts.addEventListener('click', function (e) {
      var del = e.target.closest('.del');
      if (del) {
        if (del.dataset.key) { e.stopPropagation(); dropAtt(del.dataset.key); }
        return;
      }
      var box = e.target.closest('.att');
      if (box) {
        if (box.dataset.key) showLightbox(box.dataset.key);
        else if (box.dataset.pending != null) DM.lightbox && DM.lightbox(cur.pending[+box.dataset.pending]);
        return;
      }
      var add = e.target.closest('.att-add');
      if (add) el.fFile.click();
    });

    el.fFile.addEventListener('change', onPick);
    el.fDate.addEventListener('change', function () {
      el.title.textContent = (cur.id ? '编辑事项' : '新建事项') + ' · ' + U.fmtDayTitle(el.fDate.value || U.todayKey());
    });
  }

  function paintDur() {
    Array.prototype.forEach.call(el.fDur.children, function (b) {
      var on = b.dataset.min === 'custom'
        ? cur.custom
        : (!cur.custom && +b.dataset.min === cur.duration);
      b.classList.toggle('on', on);
    });
    if (cur.custom) {
      el.fDurNum.value = cur.duration;
      el.customDur.hidden = false;
    }
  }
  function paintDomain() {
    Array.prototype.forEach.call(el.fDomain.children, function (b) {
      b.classList.toggle('on', b.dataset.domain === cur.domain);
    });
  }

  function open(id, defaults) {
    defaults = defaults || {};
    cur.id = id || null;
    cur.atts = [];
    cur.pending = [];
    cur.dirty = false;

    var task = id ? DM.store.getTask(id) : null;
    if (task) {
      el.title.textContent = '编辑事项 · ' + U.fmtDayTitle(task.date);
      el.fTitle.value = task.title;
      el.fDate.value = task.date;
      el.fStart.value = task.start;
      cur.duration = task.duration > 0 ? +task.duration : 0;
      cur.custom = cur.duration > 0 && DUR_PRESETS.indexOf(cur.duration) === -1;
      cur.domain = task.domain || 'work';
      el.fNote.value = task.note || '';
      el.fRemind.value = String(task.remind && task.remind.before != null ? task.remind.before : DM.store.settings().defaultRemind);
      cur.atts = (task.attachments || []).slice();
      el.drDelete.hidden = false;
      cur.prevStart = task.start;
      cur.prevDate = task.date;
      cur.prevRemind = +el.fRemind.value;
    } else {
      var date = defaults.date || U.todayKey();
      var start = defaults.start || defaultStart();
      el.title.textContent = '新建事项 · ' + U.fmtDayTitle(date);
      el.fTitle.value = '';
      el.fDate.value = date;
      el.fStart.value = start;
      cur.duration = defaults.duration != null ? defaults.duration : 0;
      cur.custom = false;
      cur.domain = defaults.domain || 'work';
      el.fNote.value = '';
      el.fRemind.value = String(DM.store.settings().defaultRemind);
      el.drDelete.hidden = true;
      cur.prevStart = '';
      cur.prevDate = '';
      cur.prevRemind = DM.store.settings().defaultRemind;
    }
    paintDur();
    paintDomain();
    paintAtts();
    el.drawer.classList.add('open');
    el.drawer.setAttribute('aria-hidden', 'false');
    el.mask.hidden = false;
    if (!task) setTimeout(function () { try { el.fTitle.focus(); } catch (e) { } }, 260);
  }

  function defaultStart() {
    var s = DM.store.settings();
    var nm = U.nowMin();
    var startMin = U.toMin(s.dayStart), endMin = U.toMin(s.dayEnd);
    if (nm >= startMin && nm < endMin - 15) {
      var m = Math.ceil((nm + 5) / 15) * 15;
      return U.toHHMM(m);
    }
    return '09:00';
  }

  function close() {
    el.drawer.classList.remove('open');
    el.drawer.setAttribute('aria-hidden', 'true');
    el.mask.hidden = true;
  }

  /* ---------- 图片 ---------- */
  function onPick(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    files.slice(0, 4).forEach(function (f) {
      if (!/^image\//.test(f.type)) return;
      var r = new FileReader();
      r.onload = function () {
        compress(r.result).then(function (dataUrl) {
          if (cur.id) {
            DM.store.addAttachment(cur.id, dataUrl).then(function (key) {
              cur.atts.push(key);
              paintAtts();
            });
          } else {
            cur.pending.push(dataUrl);
            paintAtts();
          }
        });
      };
      r.readAsDataURL(f);
    });
  }

  function compress(dataUrl) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var max = 1200;
        var w = img.naturalWidth, h = img.naturalHeight;
        var scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.round(w * scale), ch = Math.round(h * scale);
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        try { resolve(cv.toDataURL('image/jpeg', 0.82)); }
        catch (e) { resolve(dataUrl); }
      };
      img.onerror = function () { resolve(dataUrl); };
      img.src = dataUrl;
    });
  }

  function paintAtts() {
    var my = ++seq;
    el.fAtts.innerHTML = '';
    cur.atts.forEach(function (key) {
      var d = document.createElement('div');
      d.className = 'att';
      d.dataset.key = key;
      var img = document.createElement('img');
      img.alt = '';
      d.appendChild(img);
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'del';
      x.dataset.key = key;
      x.textContent = '✕';
      d.appendChild(x);
      el.fAtts.appendChild(d);
      DM.store.attachmentUrl(key).then(function (url) {
        if (my === seq && url) img.src = url;
      });
    });
    cur.pending.forEach(function (url, i) {
      var d = document.createElement('div');
      d.className = 'att';
      d.dataset.pending = i;
      var img = document.createElement('img');
      img.src = url; img.alt = '';
      d.appendChild(img);
      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'del';
      x.dataset.pendingDel = i;
      x.textContent = '✕';
      d.appendChild(x);
      el.fAtts.appendChild(d);
    });
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'att-add';
    add.textContent = '+';
    el.fAtts.appendChild(add);
  }

  // pending 删除单独处理（因为上面委托里只处理 .del 的 key）
  document.addEventListener('click', function (e) {
    var del = e.target.closest && e.target.closest('.del');
    if (!del || del.dataset.pendingDel == null) return;
    var i = +del.dataset.pendingDel;
    cur.pending.splice(i, 1);
    paintAtts();
  });

  function dropAtt(key) {
    if (!key) return;
    cur.atts = cur.atts.filter(function (k) { return k !== key; });
    if (cur.id) DM.store.removeAttachment(cur.id, key);
    paintAtts();
  }

  function showLightbox(key) {
    DM.store.attachmentUrl(key).then(function (url) {
      if (url && DM.lightbox) DM.lightbox(url);
    });
  }

  /* ---------- 保存 / 删除 ---------- */
  function save() {
    var title = el.fTitle.value.trim();
    if (!title) {
      el.fTitle.focus();
      el.fTitle.style.borderBottomColor = '#C0392B';
      setTimeout(function () { el.fTitle.style.borderBottomColor = ''; }, 900);
      if (DM.toast) DM.toast('还差一个名字', '写清楚要做什么，之后才好认');
      return;
    }
    var date = el.fDate.value || U.todayKey();
    var start = el.fStart.value || '09:00';
    var before = +el.fRemind.value;
    var duration = cur.duration > 0 ? Math.min(720, cur.duration) : null;

    var old = cur.id ? DM.store.getTask(cur.id) : null;
    var changed = !old || old.start !== start || old.date !== date ||
      ((old.remind && old.remind.before) != null ? +old.remind.before : DM.store.settings().defaultRemind) !== before;

    var payload = {
      id: cur.id || DM.store.uid(),
      date: date,
      start: start,
      duration: duration,
      title: title,
      domain: cur.domain,
      note: el.fNote.value.trim(),
      attachments: cur.atts.slice(),
      remind: {
        before: before,
        notified: changed ? false : !!(old && old.remind && old.remind.notified)
      }
    };
    var saved = DM.store.upsert(payload);

    var chain = Promise.resolve();
    cur.pending.forEach(function (url) {
      chain = chain.then(function () { return DM.store.addAttachment(saved.id, url); });
    });
    chain.then(function () {
      DM.store.save();
      close();
      if (DM.day) DM.day.render();
      if (DM.month) DM.month.render();
      if (DM.remind) { DM.remind.scan(true); DM.remind.updateBadge(); }
      if (DM.banner) DM.banner.refresh();
      if (DM.toast) DM.toast(old ? '已更新' : '已放下', title + ' · ' + start);
    });
  }

  function remove() {
    if (!cur.id) return;
    var t = DM.store.getTask(cur.id);
    if (!t) return;
    if (!window.confirm('删除「' + t.title + '」？')) return;
    DM.store.remove(cur.id);
    close();
    if (DM.day) DM.day.render();
    if (DM.month) DM.month.render();
    if (DM.banner) DM.banner.refresh();
    if (DM.toast) DM.toast('已删除', t.title);
  }

  DM.editor = { init: init, open: open, close: close, isOpen: function () { return el.drawer.classList.contains('open'); } };
})();
