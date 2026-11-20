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
    custom: false, prevStart: '', prevDate: '', prevRemind: 10, dirty: false,
    subs: [], seriesId: null, seriesEdit: false, freq: 'none', weekdays: []
  };
  var seq = 0;

  var FREQ_CHIPS = [
    { k: 'none', label: '不重复' },
    { k: 'daily', label: '每天' },
    { k: 'work', label: '工作日' },
    { k: 'weekly', label: '每周' },
    { k: 'monthly', label: '每月' }
  ];
  var WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];   // 展示顺序：一 二 三 四 五 六 日

  function $(id) { return document.getElementById(id); }
  function rid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function init() {
    el.drawer = $('drawer');
    el.mask = $('mask');
    el.title = $('drTitle');
    el.fTitle = $('fTitle');
    el.subPanel = $('subPanel');
    el.subHint = $('subHint');
    el.subList = $('subList');
    el.subMerge = $('subMerge');
    el.subAdd = $('subAdd');
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

    el.fRepeat = $('fRepeat');
    el.repPanel = $('repPanel');
    el.repN = $('repN');
    el.repUnit = $('repUnit');
    el.repWeek = $('repWeek');
    el.repLineDom = $('repLineDom');
    el.repDom = $('repDom');
    el.repLast = $('repLast');
    el.repEnd = $('repEnd');
    el.repUntil = $('repUntil');
    el.repBanner = $('repBanner');
    el.repBannerText = $('repBannerText');
    el.repScope = $('repScope');

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

    el.fRepeat.innerHTML = '';
    FREQ_CHIPS.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.freq = f.k;
      b.textContent = f.label;
      el.fRepeat.appendChild(b);
    });

    el.repWeek.innerHTML = '';
    WEEK_ORDER.forEach(function (d) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wk';
      b.dataset.wd = d;
      b.textContent = DM.repeat.WEEK_CN[d];
      el.repWeek.appendChild(b);
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
      if (cur.freq === 'weekly' && cur.weekdays.length === 1) {
        cur.weekdays = [DM.repeat.weekdayOf(el.fDate.value || U.todayKey())];
        paintWeek();
      }
      if (cur.freq === 'monthly' && !cur.domTouched) {
        el.repDom.value = U.parseKey(el.fDate.value || U.todayKey()).getDate();
      }
    });

    /* ---- 重复 ---- */
    el.fRepeat.addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      cur.freq = b.dataset.freq;
      if (cur.freq === 'weekly' && !cur.weekdays.length) {
        cur.weekdays = [DM.repeat.weekdayOf(el.fDate.value || U.todayKey())];
      }
      if (cur.freq === 'monthly' && !cur.domTouched) {
        el.repDom.value = U.parseKey(el.fDate.value || U.todayKey()).getDate();
      }
      paintRepeat();
    });

    el.repWeek.addEventListener('click', function (e) {
      var b = e.target.closest('.wk');
      if (!b) return;
      var wd = +b.dataset.wd;
      var i = cur.weekdays.indexOf(wd);
      if (i >= 0) {
        if (cur.weekdays.length === 1) { DM.toast && DM.toast('至少留一天', '不然就重复不起来了'); return; }
        cur.weekdays.splice(i, 1);
      } else {
        cur.weekdays.push(wd);
      }
      paintWeek();
      if (cur.seriesId) paintBanner();
    });

    el.repDom.addEventListener('input', function () { cur.domTouched = true; });
    el.repLast.addEventListener('change', function () {
      el.repDom.disabled = el.repLast.checked;
    });
    el.repEnd.addEventListener('change', function () {
      var on = el.repEnd.value === 'until';
      el.repUntil.hidden = !on;
      if (on && !el.repUntil.value) el.repUntil.value = U.addDays(el.fDate.value || U.todayKey(), 30);
    });
    el.repUntil.addEventListener('change', function () {
      if (el.repUntil.value && el.repUntil.value < el.fDate.value) {
        el.repUntil.value = el.fDate.value;
        DM.toast && DM.toast('结束日不能早于开始日', '已改回开始那天');
      }
    });
    el.repScope.addEventListener('click', function () {
      cur.seriesEdit = !cur.seriesEdit;
      paintBanner();
      paintRepeat();
    });

    /* ---- 标题 → 自动拆条 ---- */
    var composing = false;
    function onTitleInput() {
      autoGrow();
      var parts = DM.store.splitTitle(el.fTitle.value);
      if (parts.length < 2) { cur.subs = []; paintSubs(); return; }
      rebuildSubs(parts);
    }
    el.fTitle.addEventListener('compositionstart', function () { composing = true; });
    el.fTitle.addEventListener('compositionend', function () {
      composing = false;
      onTitleInput();
    });
    el.fTitle.addEventListener('input', function () {
      if (composing) { autoGrow(); return; }   // 拼音组词途中不拆，免得面板乱跳
      onTitleInput();
    });
    el.fTitle.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); el.fStart && el.fStart.focus(); }
    });

    /* ---- 子任务面板 ---- */
    el.subList.addEventListener('click', function (e) {
      var ck = e.target.closest('.s-check');
      if (ck) {
        var i = +ck.dataset.i;
        if (cur.subs[i]) { cur.subs[i].done = !cur.subs[i].done; paintSubs(); }
        return;
      }
      var del = e.target.closest('.s-del');
      if (del) { dropSub(+del.dataset.i); }
    });
    el.subList.addEventListener('keydown', function (e) {
      var inp = e.target.closest('.s-input');
      if (!inp || e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      var i = +inp.dataset.i;
      cur.subs.splice(i + 1, 0, { id: rid(), text: '', done: false });
      paintSubs();
      var ins = el.subList.querySelectorAll('.s-input');
      if (ins[i + 1]) ins[i + 1].focus();
    });
    el.subList.addEventListener('input', function (e) {
      var inp = e.target.closest('.s-input');
      if (!inp) return;
      var i = +inp.dataset.i;
      if (!cur.subs[i]) return;
      cur.subs[i].text = inp.value;
      syncTitleFromSubs();
    });
    el.subAdd.addEventListener('click', function () {
      cur.subs.push({ id: rid(), text: '', done: false });
      paintSubs();
      syncTitleFromSubs();
      var ins = el.subList.querySelectorAll('.s-input');
      if (ins.length) ins[ins.length - 1].focus();
    });
    el.subMerge.addEventListener('click', mergeBack);
  }

  function autoGrow() {
    var t = el.fTitle;
    t.style.height = 'auto';
    var h = t.scrollHeight;
    if (h) t.style.height = Math.min(h, 4 * 26) + 'px';
  }

  /* 标题里识别出的条目 → 子任务行（同文本的保留原完成态） */
  function rebuildSubs(parts) {
    var old = cur.subs.slice();
    var used = {};
    cur.subs = parts.map(function (text) {
      var hit = -1;
      old.forEach(function (o, i) {
        if (hit < 0 && !used[i] && o.text.trim() === text) { hit = i; }
      });
      if (hit >= 0) { used[hit] = 1; return { id: old[hit].id, text: text, done: !!old[hit].done }; }
      return { id: rid(), text: text, done: false };
    });
    paintSubs();
  }

  function syncTitleFromSubs() {
    var t = cur.subs.map(function (s) { return String(s.text).trim(); })
      .filter(function (x) { return x; }).join('，');
    el.fTitle.value = t;          // 赋值不触发 input，不会二次拆分
    autoGrow();
  }

  function dropSub(i) {
    if (!(i >= 0 && i < cur.subs.length)) return;
    cur.subs.splice(i, 1);
    if (cur.subs.length < 2) {
      // 只剩一条：回到普通单条任务
      var one = cur.subs[0];
      el.fTitle.value = one ? one.text : '';
      cur.subs = [];
      paintSubs();
      autoGrow();
      return;
    }
    syncTitleFromSubs();
    paintSubs();
  }

  function mergeBack() {
    var t = cur.subs.map(function (s) { return String(s.text).trim(); })
      .filter(function (x) { return x; }).join('，');
    cur.subs = [];
    el.fTitle.value = t;
    paintSubs();
    autoGrow();
    try { el.fTitle.focus(); } catch (e) { }
  }

  function paintSubs() {
    var n = cur.subs.length;
    el.subList.innerHTML = '';
    if (n >= 2) {
      cur.subs.forEach(function (s, i) {
        var row = document.createElement('div');
        row.className = 'subitem' + (s.done ? ' on' : '');

        var ck = document.createElement('button');
        ck.type = 'button';
        ck.className = 's-check';
        ck.dataset.i = i;
        ck.setAttribute('aria-label', s.done ? '取消完成' : '完成');
        ck.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5L20 6.5"/></svg>';

        var inp = document.createElement('input');
        inp.className = 's-input';
        inp.type = 'text';
        inp.dataset.i = i;
        inp.value = s.text;
        inp.maxLength = 100;
        inp.autocomplete = 'off';

        var del = document.createElement('button');
        del.type = 'button';
        del.className = 's-del';
        del.dataset.i = i;
        del.setAttribute('aria-label', '删掉这条');
        del.textContent = '✕';

        row.appendChild(ck);
        row.appendChild(inp);
        row.appendChild(del);
        el.subList.appendChild(row);
      });
      el.subHint.textContent = n + ' 条子任务 · 可分别勾';
    }
    el.subPanel.hidden = n < 2;
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

  /* ---------------- 重复 ---------------- */
  function freqOf(rule) {
    if (!rule) return 'none';
    if (rule.freq === 'daily') return 'daily';
    if (rule.freq === 'weekly') {
      var w = rule.weekdays || [];
      if ((+rule.interval || 1) === 1 && w.length === 5 && w.indexOf(0) < 0 && w.indexOf(6) < 0) return 'work';
      return 'weekly';
    }
    return 'monthly';
  }

  function sameRule(a, b) {
    if (!a || !b) return !a && !b;
    if (a.freq !== b.freq) return false;
    if ((+a.interval || 1) !== (+b.interval || 1)) return false;
    if ((a.until || '') !== (b.until || '')) return false;
    if (a.freq === 'weekly') {
      var x = (a.weekdays || []).slice().sort().join(','),
        y = (b.weekdays || []).slice().sort().join(',');
      if (x !== y) return false;
    }
    if (a.freq === 'monthly' && (+a.monthDay || 1) !== (+b.monthDay || 1)) return false;
    return true;
  }

  function paintRepeat() {
    Array.prototype.forEach.call(el.fRepeat.children, function (b) {
      b.classList.toggle('on', b.dataset.freq === cur.freq);
    });
    var withPanel = cur.freq === 'daily' || cur.freq === 'weekly' || cur.freq === 'monthly';
    el.repPanel.hidden = !withPanel;
    if (!withPanel) return;
    el.repUnit.textContent = cur.freq === 'weekly' ? '周' : cur.freq === 'monthly' ? '个月' : '天';
    el.repWeek.hidden = cur.freq !== 'weekly';
    el.repLineDom.hidden = cur.freq !== 'monthly';
    if (!(+el.repN.value > 0)) el.repN.value = 1;
    el.repDom.disabled = el.repLast.checked;
    el.repUntil.hidden = el.repEnd.value !== 'until';
    paintWeek();
  }

  function paintWeek() {
    Array.prototype.forEach.call(el.repWeek.children, function (b) {
      b.classList.toggle('on', cur.weekdays.indexOf(+b.dataset.wd) >= 0);
    });
  }

  function paintBanner() {
    var s = cur.seriesId ? DM.repeat.get(cur.seriesId) : null;
    if (!s) { el.repBanner.hidden = true; return; }
    el.repBanner.hidden = false;
    el.repBanner.classList.toggle('all', cur.seriesEdit);
    el.repBannerText.textContent = DM.repeat.describe(s.rule, s.startDate) +
      (cur.seriesEdit ? ' · 将改整个系列' : ' · 只改这一天');
    el.repScope.textContent = cur.seriesEdit ? '只改这一天' : '改整个系列';
  }

  function readRule() {
    if (cur.freq === 'none') return null;
    var rule = { freq: cur.freq, interval: 1, until: null };
    if (cur.freq === 'work') {
      rule.freq = 'weekly';
      rule.weekdays = [1, 2, 3, 4, 5];
    } else {
      rule.interval = Math.max(1, Math.min(30, parseInt(el.repN.value, 10) || 1));
      if (cur.freq === 'weekly') rule.weekdays = cur.weekdays.slice();
      if (cur.freq === 'monthly') {
        rule.monthDay = el.repLast.checked ? -1
          : Math.max(1, Math.min(31, parseInt(el.repDom.value, 10) || 1));
      }
    }
    if (el.repEnd.value === 'until') {
      var d = el.fDate.value || U.todayKey();
      var u = el.repUntil.value || d;
      rule.until = u < d ? d : u;
    }
    return rule;
  }

  function loadRepeat(task, date) {
    var s = task && task.seriesId ? DM.repeat.get(task.seriesId) : null;
    cur.seriesId = s ? s.id : null;
    cur.seriesEdit = false;
    cur.domTouched = false;

    if (s && s.rule) {
      cur.freq = freqOf(s.rule);
      cur.weekdays = (s.rule.weekdays && s.rule.weekdays.length)
        ? s.rule.weekdays.slice()
        : [DM.repeat.weekdayOf(s.startDate || date)];
      el.repN.value = s.rule.interval || 1;
      el.repDom.value = (+s.rule.monthDay > 0) ? s.rule.monthDay : U.parseKey(date).getDate();
      el.repLast.checked = s.rule.monthDay === -1;
      el.repEnd.value = s.rule.until ? 'until' : 'never';
      el.repUntil.value = s.rule.until || '';
    } else {
      cur.freq = 'none';
      cur.weekdays = [DM.repeat.weekdayOf(date)];
      el.repN.value = 1;
      el.repDom.value = U.parseKey(date).getDate();
      el.repLast.checked = false;
      el.repEnd.value = 'never';
      el.repUntil.value = '';
    }
    paintRepeat();
    paintBanner();
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
      cur.subs = (task.subs || []).map(function (s) {
        return { id: s.id, text: s.text, done: !!s.done, doneAt: s.doneAt };
      });
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
      cur.subs = [];
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
    paintSubs();
    loadRepeat(task, el.fDate.value || U.todayKey());
    autoGrow();
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
    var parts = cur.subs
      .map(function (s) { return String(s.text == null ? '' : s.text).trim(); })
      .filter(function (s) { return s; });

    var title, subs = null;
    if (parts.length >= 2) {
      title = parts.join('，');
      subs = [];
      cur.subs.forEach(function (s) {
        var txt = String(s.text == null ? '' : s.text).trim();
        if (!txt) return;
        subs.push({ id: s.id, text: txt, done: !!s.done, doneAt: s.done ? (s.doneAt || Date.now()) : null });
      });
    } else {
      title = (parts.length === 1 ? parts[0] : el.fTitle.value).trim();
    }

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
    var note = el.fNote.value.trim();
    var rule = readRule();

    var old = cur.id ? DM.store.getTask(cur.id) : null;
    var changed = !old || old.start !== start || old.date !== date ||
      ((old.remind && old.remind.before) != null ? +old.remind.before : DM.store.settings().defaultRemind) !== before;

    var payload = {
      id: cur.id || DM.store.uid(),
      date: date,
      start: start,
      duration: duration,
      title: title,
      subs: subs,
      domain: cur.domain,
      note: note,
      attachments: cur.atts.slice(),
      seriesId: null,
      remind: {
        before: before,
        notified: changed ? false : !!(old && old.remind && old.remind.notified)
      }
    };

    /* ---- 重复系列 ---- */
    var s = cur.seriesId ? DM.repeat.get(cur.seriesId) : null;
    var scopeAll = !!(s && (cur.seriesEdit || !sameRule(rule, s.rule)));
    var template = {
      title: title, start: start, duration: duration, domain: cur.domain,
      note: note,
      subs: subs ? subs.map(function (x) { return { text: x.text }; }) : [],
      attachments: cur.atts.slice(),
      remindBefore: before
    };

    if (s && scopeAll) {
      if (!rule) {
        DM.repeat.end(s.id, old ? old.date : date);      // 从这条起不再重复
        DM.repeat.detach(s.id, old ? old.date : date);
        payload.seriesId = null;
      } else {
        DM.repeat.update(s.id, rule, template);
        payload.seriesId = s.id;
      }
    } else if (s) {
      DM.repeat.detach(s.id, old ? old.date : date);      // 只改这一天
      if (date !== (old ? old.date : date)) DM.repeat.detach(s.id, date);
      payload.seriesId = null;
    } else if (rule) {
      payload.seriesId = DM.repeat.create({ startDate: date, rule: rule, template: template });
    }

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
      if (DM.toast) {
        var brief = title.length > 16 ? title.slice(0, 16) + '…' : title;
        var repTxt = '';
        if (payload.seriesId) {
          var ss = DM.repeat.get(payload.seriesId);
          if (ss) repTxt = ' · ' + DM.repeat.describe(ss.rule, ss.startDate);
        }
        DM.toast(old ? '已更新' : '已放下',
          brief + ' · ' + start + (subs ? ' · ' + subs.length + ' 条' : '') + repTxt);
      }
    });
  }

  function remove() {
    if (!cur.id) return;
    var t = DM.store.getTask(cur.id);
    if (!t) return;
    var s = t.seriesId ? DM.repeat.get(t.seriesId) : null;
    var ask = s
      ? '删除「' + t.title + '」这一天？\n\n重复还会继续，只是跳过这一天。'
      : '删除「' + t.title + '」？';
    if (!window.confirm(ask)) return;
    if (s) DM.repeat.detach(s.id, t.date);
    DM.store.remove(cur.id);
    close();
    if (DM.day) DM.day.render();
    if (DM.month) DM.month.render();
    if (DM.banner) DM.banner.refresh();
    if (DM.toast) DM.toast('已删除', t.title);
  }

  DM.editor = { init: init, open: open, close: close, isOpen: function () { return el.drawer.classList.contains('open'); } };
})();
