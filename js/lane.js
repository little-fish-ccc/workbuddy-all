/* 点卯 · 航道布局
 * 输入当天的任务，输出绝对定位用的 top / height / left / width
 * 规则：时间重叠的任务自动分列（贪心分配 lane），同簇共用宽度
 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var MIN_H = 16; // 视觉最小块高

  function compute(tasks, opts) {
    var origin = opts.originMin, end = opts.endMin, px = opts.px;
    var blocks = [], marks = [], outside = [];

    var timed = [], simple = [];

    tasks.forEach(function (t) {
      var dur = t.duration == null ? 0 : +t.duration;
      if (dur > 0) timed.push(t); else simple.push(t);
    });

    /* ---- 有持续时间的任务 ---- */
    var items = timed.map(function (t) {
      var rawS = U.toMin(t.start);
      var rawE = rawS + (+t.duration);
      var off = rawE <= origin || rawS >= end;
      var s = Math.min(Math.max(rawS, origin), end);
      var e = Math.min(Math.max(rawE, origin), end);
      if (e - s < 1) e = Math.min(s + 1, end);
      return { t: t, rawS: rawS, s: s, e: e, off: off };
    });

    items.sort(function (a, b) { return a.s - b.s || b.e - a.e; });

    // 1) 分簇：后续任务与簇内最大结束时间不重叠则开新簇
    var clusters = [], cur = null;
    items.forEach(function (it) {
      if (!cur || it.s >= cur.end) {
        cur = { items: [], end: 0 };
        clusters.push(cur);
      }
      cur.items.push(it);
      cur.end = Math.max(cur.end, it.e);
    });

    // 2) 簇内贪心分配列
    clusters.forEach(function (c) {
      var laneEnds = [];
      c.items.forEach(function (it) {
        var pick = -1;
        for (var i = 0; i < laneEnds.length; i++) {
          if (laneEnds[i] <= it.s) { pick = i; break; }
        }
        if (pick === -1) { pick = laneEnds.length; laneEnds.push(it.e); }
        else laneEnds[pick] = it.e;
        it.lane = pick;
      });
      c.lanes = Math.max(1, laneEnds.length);
    });

    items.forEach(function (it) {
      it.cluster = null;
    });
    clusters.forEach(function (c) {
      c.items.forEach(function (it) {
        var n = c.lanes;
        var gap = n > 1 ? 1.6 : 0; // 列间距（%）
        var w = 100 / n;
        var h = (it.e - it.s) * px;
        var top = (it.s - origin) * px;
        if (h < MIN_H) { h = MIN_H; }         // 极短任务也要点得中
        blocks.push({
          task: it.t,
          top: top,
          height: h,
          left: it.lane * w,
          width: w,
          gap: gap,
          lane: it.lane,
          lanes: n,
          off: it.off,
          realStart: it.rawS
        });
        if (it.off) outside.push(it.t);
      });
    });

    /* ---- 只有开始时刻的任务（航标） ---- */
    var groups = {};
    simple.forEach(function (t) {
      var s = U.toMin(t.start);
      var key = Math.max(s, origin);
      (groups[key] = groups[key] || []).push(t);
    });
    Object.keys(groups).forEach(function (k) {
      var s = +k;
      groups[k].forEach(function (t, i) {
        marks.push({
          task: t,
          top: (s - origin) * px - 11 + i * 26,
          offset: i
        });
      });
    });

    return { blocks: blocks, marks: marks, outside: outside, clusters: clusters.length };
  }

  /* 当前位置：只在“今天”且落在航道范围内时返回 */
  function nowOffset(opts) {
    var m = U.nowMin();
    if (m < opts.originMin || m > opts.endMin) return null;
    return (m - opts.originMin) * opts.px;
  }

  DM.lane = { compute: compute, nowOffset: nowOffset, MIN_H: MIN_H };
})();
