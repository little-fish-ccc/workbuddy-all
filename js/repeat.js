/* 点卯 · 重复规则
 *
 * 数据：db.series[sid] = {
 *   id, startDate,
 *   rule: { freq:'daily'|'weekly'|'monthly', interval, weekdays:[0-6], monthDay:1-31|-1, until:'YYYY-MM-DD'|null },
 *   template: { title, start, duration, domain, note, subs:[{text}], attachments:[], remindBefore },
 *   exdates: ['YYYY-MM-DD']      // 这一天不要（跳过 / 单独改过）
 * }
 * 任务上带 seriesId 表示它是某个系列的实例。
 *
 * 实例不预先铺满，而是打开某天时按需生成（ensure）。
 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var DAY = 86400000;
  var WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];
  var MAX_SPAN = 500;          // 单次生成最多跨这么多天，防手滑

  function dayNum(key) {
    var d = U.parseKey(key);
    return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  }
  function weekdayOf(key) { return ((dayNum(key) + 4) % 7 + 7) % 7; }   // 0=周日
  function weekOf(key) { return Math.floor((dayNum(key) + 3) / 7); }    // 周一为一周之始
  function monthOf(key) { var d = U.parseKey(key); return d.getFullYear() * 12 + d.getMonth(); }
  function lastDom(key) {
    var d = U.parseKey(key);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }
  function subId() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function db() { return DM.store.all(); }
  function seriesMap() {
    var d = db();
    if (!d.series) d.series = {};
    return d.series;
  }

  /* ---------------- 规则判定 ---------------- */
  function match(s, key) {
    var r = s && s.rule;
    if (!r || !s.startDate) return false;
    if (key < s.startDate) return false;
    if (r.until && key > r.until) return false;
    var iv = Math.max(1, +r.interval || 1);

    if (r.freq === 'daily') {
      return (dayNum(key) - dayNum(s.startDate)) % iv === 0;
    }
    if (r.freq === 'weekly') {
      var days = (r.weekdays && r.weekdays.length) ? r.weekdays : [weekdayOf(s.startDate)];
      if (days.indexOf(weekdayOf(key)) < 0) return false;
      return (weekOf(key) - weekOf(s.startDate)) % iv === 0;
    }
    if (r.freq === 'monthly') {
      var md = +(r.monthDay || 1);
      var last = lastDom(key);
      var want = md === -1 ? last : Math.min(md, last);
      if (U.parseKey(key).getDate() !== want) return false;
      var gap = monthOf(key) - monthOf(s.startDate);
      return gap % iv === 0;
    }
    return false;
  }

  /* ---------------- 生成实例 ---------------- */
  function instanceOf(s, key) {
    var tp = s.template || {};
    return {
      id: DM.store.uid(),
      seriesId: s.id,
      date: key,
      start: tp.start || '09:00',
      duration: tp.duration > 0 ? tp.duration : null,
      title: tp.title || '事项',
      subs: (tp.subs && tp.subs.length) ? tp.subs.map(function (x) {
        return { id: subId(), text: x.text, done: false, doneAt: null };
      }) : null,
      domain: tp.domain || 'work',
      note: tp.note || '',
      attachments: (tp.attachments || []).slice(),
      remind: { before: tp.remindBefore != null ? tp.remindBefore : -1, notified: false },
      done: false, doneAt: null, dropped: false, delayed: false,
      createdAt: Date.now(), updatedAt: Date.now()
    };
  }

  /* 把 from..to 之间该有的实例补齐，返回新生成条数 */
  function ensure(from, to) {
    if (!from && !to) return 0;
    if (!from) from = to;
    if (!to) to = from;
    if (from > to) { var t = from; from = to; to = t; }

    var sm = seriesMap();
    var sids = Object.keys(sm);
    if (!sids.length) return 0;

    var span = dayNum(to) - dayNum(from);
    if (span > MAX_SPAN) to = U.addDays(from, MAX_SPAN);

    var have = {};
    db().tasks.forEach(function (t) { if (t.seriesId) have[t.seriesId + '@' + t.date] = 1; });

    var made = 0;
    sids.forEach(function (sid) {
      var s = sm[sid];
      if (!s || !s.rule) return;
      var end = to;
      if (s.rule.until && s.rule.until < end) end = s.rule.until;
      var ex = s.exdates || [];
      var d = from < s.startDate ? s.startDate : from;
      var guard = 0;
      while (d <= end && guard < MAX_SPAN + 2) {
        guard++;
        if (ex.indexOf(d) < 0 && !have[sid + '@' + d] && match(s, d)) {
          db().tasks.push(instanceOf(s, d));
          have[sid + '@' + d] = 1;
          made++;
        }
        d = U.addDays(d, 1);
      }
    });
    if (made) DM.store.saveSoon();
    return made;
  }

  /* ---------------- 系列读写 ---------------- */
  function newId() { return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function create(opts) {
    var sm = seriesMap();
    var sid = newId();
    sm[sid] = {
      id: sid,
      startDate: opts.startDate,
      rule: cleanRule(opts.rule),
      template: cleanTemplate(opts.template),
      exdates: [],
      createdAt: Date.now()
    };
    DM.store.saveSoon();
    return sid;
  }

  function get(sid) { return sid ? seriesMap()[sid] || null : null; }

  function list() {
    var sm = seriesMap();
    return Object.keys(sm).map(function (k) { return sm[k]; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }

  function cleanRule(r) {
    r = r || {};
    var freq = r.freq === 'weekly' || r.freq === 'monthly' ? r.freq : 'daily';
    var out = {
      freq: freq,
      interval: Math.max(1, Math.min(30, +r.interval || 1)),
      until: /^\d{4}-\d{2}-\d{2}$/.test(r.until || '') ? r.until : null
    };
    if (freq === 'weekly') {
      var w = (r.weekdays || []).filter(function (n) { return n >= 0 && n <= 6; });
      out.weekdays = w.length ? w.slice().sort() : [];
    }
    if (freq === 'monthly') {
      out.monthDay = (+r.monthDay === -1) ? -1 : Math.max(1, Math.min(31, +r.monthDay || 1));
    }
    return out;
  }

  function cleanTemplate(tp) {
    tp = tp || {};
    return {
      title: String(tp.title || '').trim() || '事项',
      start: tp.start || '09:00',
      duration: tp.duration > 0 ? tp.duration : null,
      domain: tp.domain || 'work',
      note: tp.note || '',
      subs: (tp.subs || []).map(function (x) { return { text: x.text }; }),
      attachments: (tp.attachments || []).slice(),
      remindBefore: tp.remindBefore != null ? tp.remindBefore : -1
    };
  }

  /* 更新规则 + 模板：清掉今天及以后还没处理的实例，让它们按新规则重生成 */
  function update(sid, rule, template) {
    var s = get(sid);
    if (!s) return null;
    if (rule) s.rule = cleanRule(rule);
    if (template) s.template = cleanTemplate(template);
    purgeFuture(sid);
    DM.store.saveSoon();
    return s;
  }

  function purgeFuture(sid) {
    var tk = U.todayKey();
    db().tasks = db().tasks.filter(function (t) {
      if (t.seriesId !== sid) return true;
      if (t.date < tk) return true;                 // 过去的留着
      if (t.movedFrom) return true;                 // 手动挪过来的，别跟着规则一起清掉
      if (t.done || t.dropped || t.delayed) return true;   // 已经处理过的留着
      return false;
    });
  }

  /* 这一天单独处理：不进系列 */
  function detach(sid, date) {
    var s = get(sid);
    if (!s) return;
    s.exdates = s.exdates || [];
    if (s.exdates.indexOf(date) < 0) s.exdates.push(date);
    DM.store.saveSoon();
  }

  /* 撤销上面的排除（把挪走的任务放回原位时用） */
  function undetach(sid, date) {
    var s = get(sid);
    if (!s || !s.exdates) return;
    var i = s.exdates.indexOf(date);
    if (i >= 0) s.exdates.splice(i, 1);
    DM.store.saveSoon();
  }

  /* 结束整个系列：date 及以后不再生成 */
  function end(sid, date) {
    var s = get(sid);
    if (!s) return;
    var stop = U.addDays(date, -1);
    if (!s.rule.until || s.rule.until > stop) s.rule.until = stop;
    db().tasks = db().tasks.filter(function (t) {
      if (t.seriesId !== sid) return true;
      if (t.date <= stop) return true;
      if (t.movedFrom) return true;                 // 手动挪过来的那条不归规则管
      return t.done || t.dropped || t.delayed;
    });
    DM.store.saveSoon();
  }

  function removeSeries(sid) {
    var s = get(sid);
    if (!s) return 0;
    var n = 0;
    var keep = [];
    db().tasks.forEach(function (t) {
      if (t.seriesId !== sid) keep.push(t);
      else {
        n++;
        (t.attachments || []).forEach(function (k) { if (!DM.store.fileInUse(k)) DM.store.fileDelete(k); });
      }
    });
    db().tasks = keep;
    delete seriesMap()[sid];
    DM.store.saveSoon();
    return n;
  }

  /* ---------------- 文案 ---------------- */
  function weekdayList(days) {
    if (!days.length) return '';
    if (days.length === 7) return '每天';
    var wk = days.slice().sort(function (a, b) { return ((a + 6) % 7) - ((b + 6) % 7); });
    return '周' + wk.map(function (d) { return WEEK_CN[d]; }).join('、');
  }

  function describe(rule, startDate) {
    if (!rule) return '不重复';
    var iv = Math.max(1, +rule.interval || 1);
    var s;
    if (rule.freq === 'daily') {
      s = iv === 1 ? '每天' : '每 ' + iv + ' 天';
    } else if (rule.freq === 'weekly') {
      var days = (rule.weekdays && rule.weekdays.length) ? rule.weekdays
        : (startDate ? [weekdayOf(startDate)] : []);
      var isWork = days.length === 5 && days.indexOf(0) < 0 && days.indexOf(6) < 0 && iv === 1;
      if (isWork) s = '每个工作日';
      else if (iv === 1) s = '每' + weekdayList(days);
      else s = '每 ' + iv + ' 周 · ' + weekdayList(days);
    } else {
      var md = +rule.monthDay || 1;
      var dom = md === -1 ? '月末' : md + '号';
      s = (iv === 1 ? '每月' : '每 ' + iv + ' 个月') + dom;
    }
    if (rule.until) s += ' · 到 ' + U.fmtDayTitle(rule.until);
    return s;
  }

  DM.repeat = {
    match: match,
    ensure: ensure,
    create: create,
    get: get,
    list: list,
    update: update,
    detach: detach,
    undetach: undetach,
    end: end,
    removeSeries: removeSeries,
    describe: describe,
    weekdayOf: weekdayOf,
    WEEK_CN: WEEK_CN
  };
})();
