/* 点卯 · jsdom 冒烟测试
 * 运行：npm test  (需先 npm install)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, ResourceLoader, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '20261115a';

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  \x1b[32m✓\x1b[0m ' + name); }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  \x1b[31m✗\x1b[0m ' + name + (extra ? '  \x1b[33m' + extra + '\x1b[0m' : '')); }
}
function eq(name, got, want) {
  ok(name, JSON.stringify(got) === JSON.stringify(want), 'got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class LocalFiles extends ResourceLoader {
  fetch(url) {
    const u = new URL(url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!fs.existsSync(f)) return Promise.resolve(Buffer.from(''));
    if (f.endsWith('.css')) return Promise.resolve(Buffer.from('')); // jsdom 不解析样式，跳过
    return Promise.resolve(fs.readFileSync(f));
  }
}

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => { if (!/Could not parse CSS/.test(String(e.message))) errors.push(String(e.message)); });
vc.on('error', (...a) => errors.push(a.join(' ')));

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'dangerously',
  resources: new LocalFiles(),
  pretendToBeVisual: true,
  virtualConsole: vc
});
const { window } = dom;
const doc = window.document;

await new Promise(res => {
  if (doc.readyState === 'complete') return res();
  window.addEventListener('load', res);
});
await sleep(120);

const DM = window.DM;
const U = DM.util;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll ? doc.querySelectorAll(s) : []);

console.log('\n\x1b[1m1. 启动与骨架\x1b[0m');
ok('DM 命名空间完整', !!(DM.store && DM.day && DM.month && DM.editor && DM.remind && DM.app));
ok('启动无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));
ok('顶栏日期已渲染', /月\d+日/.test($('#dayTitle').textContent));
ok('航道容器高度已计算', parseInt($('#track').style.height, 10) > 500);
ok('时间刻度已生成', $$('#axis .hour').length >= 15);

console.log('\n\x1b[1m2. 首次进入的示范数据\x1b[0m');
const today = U.todayKey();
eq('示范任务 2 条', DM.store.tasksOn(today).length, 2);
eq('航道块 1 个（有航程）', $$('#blocks .blk').length, 1);
eq('航标 1 个（仅时刻）', $$('#blocks .mark').length, 1);
ok('firstRun 已关闭', DM.store.settings().firstRun === false);

console.log('\n\x1b[1m3. 重叠分列\x1b[0m');
DM.store.upsert({
  id: 'ovl1', date: today, start: '09:45', duration: 60,
  title: '撞车的事', domain: 'life', remind: { before: -1 }
});
DM.day.render();
const blks = $$('#blocks .blk');
eq('重叠后共 2 块', blks.length, 2);
const lefts = blks.map(b => b.style.left).sort();
eq('两列各占一半', lefts, ['0%', '50%']);
ok('宽度按列分配', /50%/.test(blks[0].style.width));

const pure = DM.lane.compute([
  { id: 'a', start: '10:00', duration: 60 },
  { id: 'b', start: '10:15', duration: 60 },
  { id: 'c', start: '10:30', duration: 60 }
], { originMin: 360, endMin: 1440, px: 1.2 });
eq('三段重叠 → 3 列', pure.blocks[0].lanes, 3);
const pure2 = DM.lane.compute([
  { id: 'a', start: '10:00', duration: 30 },
  { id: 'b', start: '10:30', duration: 30 },
  { id: 'c', start: '10:30', duration: 30 }
], { originMin: 360, endMin: 1440, px: 1.2 });
eq('首尾相接不算重叠，后两个分 2 列', pure2.blocks.filter(b => b.lanes === 2).length, 2);

console.log('\n\x1b[1m4. 打勾完成与持久化\x1b[0m');
const demo = DM.store.tasksOn(today).find(t => /试试/.test(t.title));
let box = Array.from($$('#blocks .blk')).find(b => b.dataset.id === demo.id);
box.querySelector('.b-check').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(220);
ok('任务标记为完成', DM.store.getTask(demo.id).done === true);
ok('块渲染出 done 态', !!Array.from($$('#blocks .blk')).find(b => b.dataset.id === demo.id).classList.contains('done'));
const raw = JSON.parse(window.localStorage.getItem(DM.store.KEY));
ok('已写进 localStorage', raw.tasks.find(t => t.id === demo.id).done === true);

const again = DM.store.init();
ok('重新载入后仍是完成态', again.tasks.find(t => t.id === demo.id).done === true);

console.log('\n\x1b[1m5. 航标与未来日期\x1b[0m');
const future = U.addDays(today, 3);
DM.store.upsert({ id: 'fut1', date: future, start: '20:00', duration: null, title: '三天后的饭局', domain: 'life', remind: { before: 30 } });
DM.day.go(future);
eq('切到未来日：1 个航标', $$('#blocks .mark').length, 1);
eq('未来日没有今天的事', $$('#blocks .blk').length, 0);
ok('标题显示未来日期', $('#dayTitle').textContent === U.fmtDayTitle(future));
DM.day.go(today);
eq('切回今天：块回来了', $$('#blocks .blk').length, 2);
eq('今天不含未来任务', DM.store.tasksOn(today).filter(t => t.id === 'fut1').length, 0);

console.log('\n\x1b[1m6. 编辑器保存链路\x1b[0m');
const beforeCount = DM.store.all().tasks.length;
DM.editor.open(null, { date: today, start: '16:15' });
$('#fTitle').value = '写点卯的测试';
$('#fStart').value = '16:15';
$('#drSave').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
await sleep(160);
eq('新增 1 条任务', DM.store.all().tasks.length, beforeCount + 1);
const saved = DM.store.all().tasks.find(t => t.title === '写点卯的测试');
ok('任务已落库且时间正确', !!saved && saved.start === '16:15');
ok('默认归类为工作', saved.domain === 'work');
ok('编辑抽屉已关闭', !$('#drawer').classList.contains('open'));

console.log('\n\x1b[1m7. 只设开始时刻的语义\x1b[0m');
eq('duration 为 null 存为空档', saved.duration, null);
ok('null 在渲染时走航标分支', DM.lane.compute([saved], { originMin: 360, endMin: 1440, px: 1.2 }).marks.length === 1);

console.log('\n\x1b[1m8. 提醒扫描\x1b[0m');
const nm = new Date();
nm.setMinutes(nm.getMinutes() + 5);
const soonStart = U.toHHMM(nm.getHours() * 60 + nm.getMinutes());
DM.store.upsert({ id: 'rem1', date: today, start: soonStart, duration: null, title: '五分钟后开始', domain: 'misc', remind: { before: 5, notified: false } });
const hits = DM.remind.scan(false);
ok('命中一条待提醒', hits.length === 1, 'hits=' + hits.length + ' start=' + soonStart);
ok('已打上 notified 标记', DM.store.getTask('rem1').remind.notified === true);
const hits2 = DM.remind.scan(false);
eq('再次扫描不重复提醒', hits2.length, 0);

console.log('\n\x1b[1m9. 附件 leanClone / hydrateFiles\x1b[0m');
const fakeData = 'data:image/png;base64,' + 'A'.repeat(800);
const lean = DM.store.leanClone({ pic: fakeData, n: 1 });
ok('dataURL 被抽成引用', lean.pic && typeof lean.pic.__ref === 'string');
eq('普通字段原样保留', lean.n, 1);
const back = await DM.store.hydrateFiles(lean);
eq('hydrate 还原等值', back.pic, fakeData);

const attKey = DM.store.fileKey();
await DM.store.filePut(attKey, fakeData);
eq('IndexedDB 往返一致', await DM.store.fileGet(attKey), fakeData);

console.log('\n\x1b[1m10. 月历\x1b[0m');
DM.month.render();
eq('月历 42 格', $$('#monthGrid .mcell').length, 42);
ok('今天有 today 标记', !!$('#monthGrid .mcell.today'));
ok('月标题格式正确', /^\d{4}年\d{1,2}月$/.test($('#monthTitle').textContent));

console.log('\n\x1b[1m11. 设置与显示开关\x1b[0m');
DM.store.saveSettings({ showDone: false });
DM.day.render();
ok('关闭“显示已完成”后 done 块消失', !Array.from($$('#blocks .blk')).some(b => b.dataset.id === demo.id));
DM.store.saveSettings({ showDone: true });
DM.day.render();
ok('打开后 done 块回来', Array.from($$('#blocks .blk')).some(b => b.dataset.id === demo.id));
DM.store.saveSettings({ dayStart: '08:00' });
DM.day.render();
eq('航道起点可改', parseInt($('#track').style.height, 10), Math.round((1440 - 480) * 1.2));
dmResetSettings();

function dmResetSettings() { DM.store.saveSettings({ dayStart: '06:00', dayEnd: '24:00' }); DM.day.render(); }

console.log('\n\x1b[1m12. 边界值\x1b[0m');
eq('24:00 解析为 1440', U.toMin('24:00'), 1440);
eq('1440 回写为 24:00', U.toHHMM(1440), '24:00');
eq('跨天加 1 天', U.addDays('2026-12-31', 1), '2027-01-01');
eq('跨月回退 1 天', U.addDays('2026-03-01', -1), '2026-02-28');

console.log('\n\x1b[1m13. 附件清理与空状态\x1b[0m');
DM.store.upsert({ id: 'att1', date: today, start: '19:00', duration: 30, title: '带图的任务', domain: 'misc', attachments: [], remind: { before: -1 } });
const attK = await DM.store.addAttachment('att1', 'data:image/png;base64,' + 'B'.repeat(600));
eq('附件已挂到任务上', DM.store.getTask('att1').attachments.length, 1);
DM.store.remove('att1');
await sleep(60);
eq('删除任务时附件一并清掉', await DM.store.fileGet(attK), '');
ok('任务确实没了', DM.store.getTask('att1') === null);

DM.store.clearAll();
DM.day.render();
ok('清空后出现空航道提示', $('#emptyHint').hidden === false);
eq('清空后任务数为 0', DM.store.all().tasks.length, 0);
ok('空状态提示不占航道高度', !!$('#emptyHint'));

console.log('\n\x1b[1m14. 一句话拆多条 · 子任务\x1b[0m');
eq('逗号拆成 4 条', DM.store.splitTitle('起床，先喂猫，刷牙，洗脸'), ['起床', '先喂猫', '刷牙', '洗脸']);
eq('顿号分号竖线都拆', DM.store.splitTitle('买菜、做饭；洗碗|拖地'), ['买菜', '做饭', '洗碗', '拖地']);
eq('换行拆', DM.store.splitTitle('写周报\n回邮件'), ['写周报', '回邮件']);
eq('没有分隔符就不拆', DM.store.splitTitle('写周报'), ['写周报']);
eq('空段被丢掉', DM.store.splitTitle('，洗澡，，刷牙，'), ['洗澡', '刷牙']);

const T = U.todayKey();
DM.day.setDate(T);
DM.store.upsert({
  id: 'sub1', date: T, start: '12:00', duration: 90, title: '起床，先喂猫，刷牙', domain: 'life',
  subs: DM.store.splitTitle('起床，先喂猫，刷牙').map(x => ({ text: x, done: false })),
  remind: { before: -1 }
});
const p1 = DM.store.getTask('sub1');
eq('子任务落库 3 条', p1.subs.length, 3);
ok('每条都补了 id', p1.subs.every(s => !!s.id));
ok('父任务初始未完成', p1.done === false);

DM.day.render();
const blk1 = Array.from($$('#blocks .blk')).find(b => b.dataset.id === 'sub1');
ok('块内渲染出子任务行', !!blk1 && blk1.querySelectorAll('.sub-row').length === 3,
  'rows=' + (blk1 ? blk1.querySelectorAll('.sub-row').length : 'none'));
ok('meta 显示 0/3 进度', /0\/3/.test(blk1.querySelector('.b-meta').textContent));

blk1.querySelector('.s-box').click();
const after1 = DM.store.getTask('sub1');
ok('点单条只勾那一条', after1.subs[0].done && !after1.subs[1].done);
ok('父任务仍未完成', after1.done === false);
ok('块显示半勾态 part', Array.from($$('#blocks .blk')).find(b => b.dataset.id === 'sub1').classList.contains('part'));

DM.store.toggleSub('sub1', after1.subs[1].id);
DM.store.toggleSub('sub1', after1.subs[2].id);
ok('全部勾完 → 父任务自动完成', DM.store.getTask('sub1').done === true);

DM.store.toggle('sub1');
ok('点父勾 → 一键全取消', DM.store.getTask('sub1').subs.every(s => !s.done) && DM.store.getTask('sub1').done === false);
DM.store.toggle('sub1');
ok('再点父勾 → 一键全勾', DM.store.getTask('sub1').subs.every(s => s.done) && DM.store.getTask('sub1').done === true);

console.log('\n\x1b[1m15. 空间够就折行显示\x1b[0m');
const LONG = '把上周积压的会议纪要全部整理归档，再给相关同事回一封说明邮件';
DM.store.upsert({ id: 'long1', date: T, start: '15:30', duration: 90, title: LONG, domain: 'work', remind: { before: -1 } });
DM.store.upsert({ id: 'mid1', date: T, start: '17:30', duration: 45, title: LONG, domain: 'work', remind: { before: -1 } });
DM.store.upsert({ id: 'tiny1', date: T, start: '19:00', duration: 15, title: LONG, domain: 'work', remind: { before: -1 } });
DM.day.render();
const pick = id => Array.from($$('#blocks .blk')).find(b => b.dataset.id === id);
const ln = id => {
  const b = pick(id); if (!b) return 0;
  const e = b.querySelector('.b-title'); if (!e) return 0;
  return +(e.dataset.lines || 0);
};
ok('90 分钟块标题折成多行', ln('long1') >= 3, 'lines=' + ln('long1'));
ok('45 分钟块只留 1 行', ln('mid1') === 1, 'lines=' + ln('mid1'));
ok('15 分钟块走 tiny（单行不折）', pick('tiny1').classList.contains('tiny'));
ok('标题带了行数上限', !!pick('long1').querySelector('.b-title').style.maxHeight);

console.log('\n\x1b[1m16. 编辑器：识别 / 合并 / 删除\x1b[0m');
DM.store.clearAll();
DM.day.setDate(T);
DM.editor.open(null, { date: T, start: '12:00', duration: 90 });
$('#fTitle').value = '起床，先喂猫，刷牙';
$('#fTitle').dispatchEvent(new window.Event('input', { bubbles: true }));
eq('输入后立刻识别出 3 条', $$('#subList .subitem').length, 3);
ok('子任务面板展开', $('#subPanel').hidden === false);
ok('提示写明条数', /3\s*条/.test($('#subHint').textContent));

$('#drSave').click();
await sleep(80);
const savedSub = DM.store.tasksOn(T)[0];
eq('保存后子任务 3 条', savedSub.subs.length, 3);
eq('标题由子任务拼回', savedSub.title, '起床，先喂猫，刷牙');
eq('编辑器已关闭', $('#drawer').classList.contains('open'), false);

DM.editor.open(savedSub.id);
await sleep(20);
eq('再次打开能还原清单', $$('#subList .subitem').length, 3);
$('#subMerge').click();
eq('合并后清单清空', $$('#subList .subitem').length, 0);
ok('合并后面板收起', $('#subPanel').hidden === true);
$('#drSave').click();
await sleep(80);
ok('合并后存成单条任务', DM.store.getTask(savedSub.id).subs === null);
eq('合并后标题仍是完整句子', DM.store.getTask(savedSub.id).title, '起床，先喂猫，刷牙');

DM.editor.open(savedSub.id);
$('#fTitle').value = 'A，B，C';
$('#fTitle').dispatchEvent(new window.Event('input', { bubbles: true }));
eq('三条再次识别', $$('#subList .subitem').length, 3);
$('#subList .subitem:nth-child(1) .s-del').click();
eq('删一条剩两条', $$('#subList .subitem').length, 2);
eq('标题跟着改', $('#fTitle').value, 'B，C');
$('#subList .subitem:nth-child(1) .s-del').click();
ok('删到一条自动回到单条', $('#subPanel').hidden === true && $$('#subList .subitem').length === 0);
eq('单条时标题留下那一条', $('#fTitle').value, 'C');

DM.editor.close();
DM.store.clearAll();
DM.day.render();

console.log('\n\x1b[1m17. 版本号一致性\x1b[0m');
const vers = new Set(Array.from(html.matchAll(/\?v=([a-z0-9]+)/g)).map(m => m[1]));
eq('index.html 内版本号唯一', Array.from(vers), [VERSION]);
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok('sw.js 版本号同步', sw.includes("'" + VERSION + "'"));
ok('manifest 图标齐全', fs.existsSync(path.join(ROOT, 'icons/icon-192.png')) &&
  fs.existsSync(path.join(ROOT, 'icons/icon-512.png')) &&
  fs.existsSync(path.join(ROOT, 'icons/maskable-512.png')));

console.log('\n' + '─'.repeat(52));
if (fail) {
  console.log('\x1b[31m✗ ' + fail + ' 项失败\x1b[0m / ' + (pass + fail) + ' 项');
  failures.forEach(f => console.log('  · ' + f));
  process.exit(1);
} else {
  console.log('\x1b[32m✓ 全部通过\x1b[0m / ' + pass + ' 项');
  process.exit(0);
}
