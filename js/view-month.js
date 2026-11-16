/* 点卯 · 月历视图 */
(function () {
  'use strict';
  var DM = (window.DM = window.DM || {});
  var U = DM.util;

  var el = {};
  var view = { y: 0, m: 0 };

  function $(id) { return document.getElementById(id); }

  function init() {
    el.grid = $('monthGrid');
    el.title = $('monthTitle');
    el.view = $('viewMonth');
    var now = new Date();
    view.y = now.getFullYear();
    view.m = now.getMonth();

    $('mPrev').addEventListener('click', function () { shift(-1); });
    $('mNext').addEventListener('click', function () { shift(1); });

    el.grid.addEventListener('click', function (e) {
      var c = e.target.closest('.mcell');
      if (!c || !c.dataset.date) return;
      if (DM.app) DM.app.openDate(c.dataset.date);
    });

    render();
  }

  function shift(n) {
    view.m += n;
    if (view.m < 0) { view.m = 11; view.y--; }
    if (view.m > 11) { view.m = 0; view.y++; }
    render();
  }

  function heatOf(min) {
    if (!min) return 0;
    if (min <= 120) return 1;
    if (min <= 300) return 2;
    if (min <= 480) return 3;
    return 4;
  }

  function render() {
    var y = view.y, m = view.m;
    el.title.textContent = y + '年' + (m + 1) + '月';

    var first = new Date(y, m, 1);
    var lead = (first.getDay() + 6) % 7;      // 周一为首
    var start = new Date(y, m, 1 - lead);
    var today = U.todayKey();
    var selected = DM.state ? DM.state.date : today;

    var html = '';
    for (var i = 0; i < 42; i++) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var key = U.dateKey(d);
      var out = d.getMonth() !== m;
      var st = DM.store.stats(key);
      var cls = 'mcell' + (out ? ' out' : '');
      if (key === today) cls += ' today';
      if (key === selected) cls += ' sel';

      var pct = st.totalMin ? Math.min(100, Math.round(st.totalMin / 480 * 100)) : 0;

      /* 三种状态各一枚小圆点，同时存在就一起排 */
      var dots = '';
      if (st.undone) dots += '<i class="dot u"></i>';
      if (st.dropped) dots += '<i class="dot g"></i>';
      if (st.delayed) dots += '<i class="dot y"></i>';

      html += '<div class="' + cls + '" data-date="' + key + '">' +
        '<span class="dnum">' + d.getDate() + '</span>' +
        (dots ? '<div class="dots">' + dots + '</div>' : '') +
        (st.totalMin ? '<div class="heat"><i style="width:' + Math.max(12, pct) + '%"></i></div>' : '') +
        '</div>';
    }
    el.grid.innerHTML = html;
  }

  function refresh() { render(); }

  DM.month = { init: init, render: render, refresh: refresh, view: view };
})();
