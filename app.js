'use strict';
// 成長ログ（第1段階）
// 記録はすべてこのスマホの中（IndexedDB）に保存する。外には送らない。

/* ---------- 保存（IndexedDB） ---------- */
const DB_NAME = 'seicho-log';
const KEYS = ['days', 'drinks', 'workouts', 'body', 'books', 'readLogs', 'engLogs', 'words', 'consults', 'treatments', 'labs', 'labTypes', 'secret', 'settings'];
let db;
const S = {};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function dbGet(key) {
  return new Promise((resolve, reject) => {
    const r = db.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function dbPut(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function save(key) {
  return dbPut(key, S[key]).catch(() => toast('保存できませんでした'));
}

const DEFAULTS = {
  days: {},
  drinks: [],
  workouts: [],
  body: [],
  books: [
    { id: 'b1', title: '奔馬（豊饒の海 第2部）', genre: '小説', status: 'reading', progress: '' },
    { id: 'b2', title: '暁の寺（豊饒の海 第3部）', genre: '小説', status: 'want', progress: '' },
    { id: 'b3', title: '天人五衰（豊饒の海 第4部）', genre: '小説', status: 'want', progress: '' },
    { id: 'b4', title: 'Nexus（ハラリ）', genre: '洋書', status: 'reading', progress: '' },
  ],
  readLogs: [],
  engLogs: [],
  words: [],
  consults: [],
  treatments: [
    'ファイバーコア',
    'セラミックアンレー',
    'セラミッククラウン',
    'インプラント（単冠）',
    '抜歯即時インプラント（リカバリー）',
    '再生療法',
    'フルマウス',
    '全顎矯正（ワイヤー）',
    'マウスピース矯正',
    '部分矯正',
  ].map((name, i) => ({ id: 't' + i, name })),
  labs: [],
  labTypes: [
    { id: 'l0', name: 'プリント模型', steps: ['プリント', '仕上げ'] },
    { id: 'l1', name: '保定装置', steps: ['設計', 'プリント', '仕上げ'] },
    { id: 'l2', name: 'マウスピース矯正のマウスピース', steps: ['設計', 'プリント', '仕上げ'] },
    { id: 'l3', name: 'サージカルステント', steps: ['設計', 'プリント', '仕上げ'] },
  ],
  secret: null,
  settings: { lastBackup: null },
};

/* ---------- 定義 ---------- */
const DRINK_TYPES = ['ビール', 'ハイボール', 'レモンサワー', '日本酒', '焼酎', 'ワイン', 'その他'];
const MARKS = ['◎', '○', '△', '×'];
const AMOUNTS = ['ちょうどいい', '少し多い', '多すぎ'];
const DAWDLE = [['none', 'なし'], ['some', '少し'], ['lots', '多い']];
const SAVINGS = [['conbini', 'コンビニに行かなかった'], ['bottle', '水筒を持っていった'], ['bento', 'お弁当にした']];
const TEMPLATES = {
  sun: { name: '日曜 ジム', exercises: ['ベンチプレス', 'スクワット', '懸垂', 'ディップス', 'インクラインベンチプレス'] },
  tue: { name: '火曜 パーソナル', exercises: ['ベンチプレス', 'スクワット', 'デッドリフト', 'ラットプルダウン', 'アームカール', '加重腕立て'] },
  clinic: { name: 'クリニック', exercises: ['ブルガリアンスクワット', 'アブローラー', '斜め懸垂'] },
  free: { name: '自由', exercises: [] },
};
const EXTRA_EXERCISES = ['ダンベルプレス', 'ダンベルロウ', 'ショルダープレス', 'サイドレイズ', 'レッグプレス', '腕立て伏せ'];
const ENG_KINDS = [
  ['radio', 'ラジオ英会話', ['聞く']],
  ['video', '英語の動画・Netflix', ['聞く']],
  ['podcast', 'ポッドキャスト', ['聞く']],
  ['paper', '英語の論文', ['読む']],
  ['speak', '話す練習', ['話す']],
  ['write', '書く練習', ['書く']],
  ['other', 'その他', []],
];
const SKILLS = ['読む', '聞く', '話す', '書く'];
const GENRES = ['小説', 'AI・テクノロジー', '洋書', '娘と共通', 'そのほか'];
const URGE_IDEAS = [
  '単語を3つ見直す（学び → 言葉）',
  '本を15分だけ読む',
  'アブローラーを1セット',
  '腕立て伏せを10回',
  'ラジオ英会話を1回分聞く',
  '今日の目標を見直す',
  '水を1杯飲んで、5分だけ散歩',
  '読む予定の記事を1本だけ開く',
];

/* ---------- 小道具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
const today = () => ymd(new Date());
const WD = ['日', '月', '火', '水', '木', '金', '土'];
function jpDate(s) {
  const d = parseYmd(s);
  return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
}
function weekStart(s) {
  const d = parseYmd(s);
  const back = (d.getDay() + 6) % 7; // 月曜はじまり
  d.setDate(d.getDate() - back);
  return ymd(d);
}
const monthKey = (s) => s.slice(0, 7);
function minutesLabel(m) {
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}時間${m % 60}分` : `${h}時間`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2200);
}

function day(date) {
  if (!S.days[date]) S.days[date] = { saving: {} };
  return S.days[date];
}

function choicesHTML(name, options, current) {
  return `<div class="choices" data-choice="${name}">${options
    .map(([v, label]) => `<button type="button" class="choice${current === v ? ' on' : ''}" data-v="${esc(v)}">${esc(label)}</button>`)
    .join('')}</div>`;
}
// 選択ボタン：押すと選ばれ、もう一度押すと外れる
function bindChoices(root, name, onPick) {
  const box = $(`[data-choice="${name}"]`, root);
  if (!box) return;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.choice');
    if (!b) return;
    const wasOn = b.classList.contains('on');
    $$('.choice', box).forEach((x) => x.classList.remove('on'));
    if (!wasOn) b.classList.add('on');
    onPick(wasOn ? null : b.dataset.v);
  });
}
function picked(root, name) {
  const b = $(`[data-choice="${name}"] .choice.on`, root);
  return b ? b.dataset.v : null;
}
const marks = (list) => list.map((m) => [m, m]);

/* ---------- 音声入力 ---------- */
const Recog = window.SpeechRecognition || window.webkitSpeechRecognition;
function voiceBtn(targetId, lang = 'ja-JP') {
  return `<button type="button" class="btn sub sm voice" data-voice="${targetId}" data-lang="${lang}">🎤 話す</button>`;
}
let activeRec = null;
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-voice]');
  if (!b) return;
  if (!Recog) {
    toast('キーボードのマイクボタンで話してください');
    $('#' + b.dataset.voice)?.focus();
    return;
  }
  if (activeRec) {
    activeRec.stop();
    return;
  }
  const target = $('#' + b.dataset.voice);
  const rec = new Recog();
  rec.lang = b.dataset.lang;
  rec.interimResults = false;
  rec.continuous = true;
  activeRec = rec;
  b.classList.add('rec');
  b.textContent = '■ 止める';
  rec.onresult = (ev) => {
    let text = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) if (ev.results[i].isFinal) text += ev.results[i][0].transcript;
    if (text) {
      target.value = (target.value ? target.value + (b.dataset.lang === 'ja-JP' ? '' : ' ') : '') + text;
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  rec.onend = () => {
    activeRec = null;
    b.classList.remove('rec');
    b.textContent = '🎤 話す';
  };
  rec.onerror = () => toast('うまく聞き取れませんでした');
  rec.start();
});

/* ---------- 下から出る画面 ---------- */
function openSheet(title, bodyHTML, { dark = false } = {}) {
  closeSheet();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet${dark ? ' secret' : ''}"><h2><span>${title}</span><button class="icon-btn" data-close aria-label="閉じる">✕</button></h2>${bodyHTML}</div>`;
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.closest('[data-close]')) closeSheet();
  });
  document.body.appendChild(bg);
  return $('.sheet', bg);
}
function closeSheet() {
  $('.sheet-bg')?.remove();
  if (activeRec) activeRec.stop();
}

/* ---------- タブ ---------- */
let tab = 'today';
let viewDate = today();
let learnTab = 'eng';

$$('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    tab = b.dataset.tab;
    $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    if (tab === 'today') viewDate = today();
    render();
    window.scrollTo(0, 0);
  })
);

function render() {
  const v = $('#view');
  ({ today: renderToday, drink: renderDrink, gym: renderGym, learn: renderLearn, consult: renderWork, review: renderReview })[tab](v);
}

/* ========== 今日 ========== */
function pendingMorningChecks() {
  const t = today();
  return S.drinks.filter((d) => !d.morning?.done && d.date < t && d.date >= addDays(t, -3));
}

function renderToday(v) {
  const date = viewDate;
  const d = day(date);
  const isToday = date === today();
  const notices = [];

  if (isToday && !isInstalled()) {
    notices.push(`<div class="card good"><h2>ホーム画面に置きましょう</h2>
      <p class="small">アイコンから1回で開けるようになります。</p>
      <button class="btn" data-install>ホーム画面に追加</button></div>`);
  }
  if (isToday) {
    for (const dr of pendingMorningChecks()) {
      notices.push(`<div class="card notice"><h2>${jpDate(dr.date)}の飲み会、どうでしたか？</h2>
        <p class="small">翌朝のチェックをしておくと、あとで振り返りやすくなります。</p>
        <button class="btn" data-morning="${dr.id}">翌朝チェックをする</button></div>`);
    }
    const run = labRunning();
    if (run) {
      notices.push(`<div class="card good"><h2>技工の作業中：${esc(labTypeName(run))} <span>${minutesLabel(runningMin(run))}</span></h2>
        <button class="btn" data-labstop>止める</button></div>`);
    }
    const waiting = S.labs.filter((j) => labState(j) === 'waiting');
    if (waiting.length) {
      const oldest = Math.max(...waiting.map((j) => daysBetween(j.ordered, today())));
      notices.push(`<div class="card${oldest >= LAB_LATE ? ' notice' : ''}"><h2>未着手の技工 ${waiting.length}件</h2>
        <p class="small">いちばん古いものは受注から${oldest}日です。${oldest >= LAB_LATE ? 'まず1件だけ、手をつけてみましょう。' : ''}</p>
        <button class="btn sub" data-golab>技工を見る</button></div>`);
    }
    for (const c of followUps()) {
      notices.push(`<div class="card notice"><h2>${jpDate(c.date)}に相談した方、その後どうなりましたか？</h2>
        <p class="small">${esc(c.items.filter((i) => i.status === 'pending').map((i) => treatmentName(i)).join('、'))}</p>
        <div class="row"><button class="btn" data-consult="${c.id}">結果を入れる</button><button class="btn ghost" data-later="${c.id}">まだ検討中</button></div></div>`);
    }
    const last = S.settings.lastBackup || S.settings.firstUse;
    const hasData = Object.keys(S.days).length > 0 || S.drinks.length > 0 || S.workouts.length > 0 || S.consults.length > 0 || S.labs.length > 0;
    if (hasData && (!last || (Date.now() - new Date(last).getTime()) / 864e5 >= 7)) {
      notices.push(`<div class="card notice"><h2>週1回のバックアップの日です</h2>
        <p class="small">「保存する」を押して、送り先にGoogleドライブを選んでください。</p>
        <button class="btn" data-backup>保存する</button></div>`);
    }
  }

  v.innerHTML = `
    <div class="nav">
      <button class="btn ghost sm" data-day="-1">◀ 前の日</button>
      <b>${isToday ? '今日 ' : ''}${jpDate(date)}</b>
      <button class="btn ghost sm" data-day="1" ${isToday ? 'disabled style="visibility:hidden"' : ''}>次の日 ▶</button>
    </div>
    ${notices.join('')}

    <div class="card">
      <h2>☀︎ 朝</h2>
      <div class="row">
        <label class="field grow"><span>寝た時刻</span><input type="time" id="bed" value="${esc(d.bed || '')}"></label>
        <label class="field grow"><span>起きた時刻</span><input type="time" id="wake" value="${esc(d.wake || '')}"></label>
      </div>
      <label class="field"><span class="row" style="justify-content:space-between">今日やりたいこと・目標 ${voiceBtn('goal')}</span>
        <textarea id="goal" placeholder="例：英語30分、昼休みに記事を1本、夜は10時に寝る">${esc(d.goal || '')}</textarea></label>
    </div>

    <button class="big-urge" data-urge>📱 YouTube見たくなった</button>
    <p class="muted" style="margin:6px 4px 12px">押すと、代わりにすぐできることを1つ出します。${d.urges ? `今日は${d.urges}回がまんしました。` : ''}</p>

    <div class="card">
      <h2>✍︎ 記録する</h2>
      <div class="grid2">
        <button class="btn sub grow" data-go="eng">英語</button>
        <button class="btn sub grow" data-go="read">読書</button>
        <button class="btn sub grow" data-go="gym">筋トレ</button>
        <button class="btn sub grow" data-go="drink">飲み会</button>
      </div>
      ${todayDoneHTML(date)}
    </div>

    <div class="card">
      <h2>☾ 夜のふりかえり</h2>
      <h3>仕事の調子</h3>${choicesHTML('work', marks(MARKS), d.work)}
      <h3>だらだらした時間</h3>${choicesHTML('dawdle', DAWDLE, d.dawdle)}
      <h3>日記</h3>
      <label class="check"><input type="checkbox" id="diary" ${d.diary ? 'checked' : ''}> 3年日記を書いた</label>
      <p class="muted" style="margin:4px 0 0">${diaryStreakText()}</p>
      <h3>節約</h3>
      ${SAVINGS.map(([k, label]) => `<label class="check"><input type="checkbox" data-saving="${k}" ${d.saving?.[k] ? 'checked' : ''}> ${label}</label>`).join('')}
      <label class="field"><span class="row" style="justify-content:space-between">今日のひとこと ${voiceBtn('night')}</span>
        <textarea id="night" placeholder="できたこと、反省、明日はどうするか">${esc(d.night || '')}</textarea></label>
    </div>`;

  const persist = () => save('days');
  $('#bed').onchange = (e) => ((d.bed = e.target.value), persist());
  $('#wake').onchange = (e) => ((d.wake = e.target.value), persist());
  $('#goal').onchange = (e) => ((d.goal = e.target.value), persist());
  $('#night').onchange = (e) => ((d.night = e.target.value), persist());
  bindChoices(v, 'work', (x) => ((d.work = x), persist()));
  bindChoices(v, 'dawdle', (x) => ((d.dawdle = x), persist()));
  $('#diary').onchange = (e) => {
    d.diary = e.target.checked;
    persist();
    render();
  };
  $$('[data-saving]', v).forEach((c) =>
    c.addEventListener('change', () => {
      d.saving = d.saving || {};
      d.saving[c.dataset.saving] = c.checked;
      persist();
    })
  );
  $$('[data-day]', v).forEach((b) =>
    b.addEventListener('click', () => {
      viewDate = addDays(viewDate, Number(b.dataset.day));
      render();
    })
  );
  $$('[data-morning]', v).forEach((b) => b.addEventListener('click', () => openMorningCheck(b.dataset.morning)));
  $('[data-backup]', v)?.addEventListener('click', doBackup);
  $('[data-install]', v)?.addEventListener('click', doInstall);
  $('[data-labstop]', v)?.addEventListener('click', () => {
    stopLabTimer(labRunning());
    render();
  });
  $('[data-golab]', v)?.addEventListener('click', () => {
    workTab = 'lab';
    $('.tabs [data-tab="consult"]').click();
  });
  $$('[data-consult]', v).forEach((b) => b.addEventListener('click', () => openConsult(b.dataset.consult)));
  $$('[data-later]', v).forEach((b) =>
    b.addEventListener('click', () => {
      const c = S.consults.find((x) => x.id === b.dataset.later);
      c.followAt = addDays(today(), 14);
      save('consults');
      toast('2週間後にまた聞きます');
      render();
    })
  );
  $('[data-urge]', v).addEventListener('click', () => openUrge(date));
  $$('[data-go]', v).forEach((b) =>
    b.addEventListener('click', () => {
      const g = b.dataset.go;
      if (g === 'eng') openEngLog(date);
      else if (g === 'read') openReadPicker(date);
      else if (g === 'gym') openWorkoutStart(date);
      else openDrinkSheet(null, date);
    })
  );
}

// 今日まだ書いていなくても、昨日までつながっていれば続いている日数として数える
function diaryStreak() {
  let d = today();
  if (!S.days[d]?.diary) d = addDays(d, -1);
  let n = 0;
  while (S.days[d]?.diary) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
function diaryStreakText() {
  const n = diaryStreak();
  const t = today();
  let month = 0;
  for (let d = t.slice(0, 8) + '01'; d <= t; d = addDays(d, 1)) if (S.days[d]?.diary) month++;
  return n ? `${n}日続いています（今月${month}日）` : month ? `今月${month}日書きました。また今日から再開しましょう` : '書いたらチェックしましょう。書き忘れた日は「前の日」から付けられます';
}

function todayDoneHTML(date) {
  const items = [];
  const eng = englishMinutes(date, date);
  const rd = S.readLogs.filter((r) => r.date === date).reduce((a, r) => a + (r.minutes || 0), 0);
  const wo = S.workouts.filter((w) => w.date === date && !w.skipped);
  const dr = S.drinks.filter((x) => x.date === date);
  if (eng) items.push(`英語 ${minutesLabel(eng)}`);
  if (rd) items.push(`読書 ${minutesLabel(rd)}`);
  if (wo.length) items.push(`筋トレ ${wo.map((w) => w.name).join('・')}`);
  if (dr.length) items.push(`飲み会 ${dr.reduce((a, x) => a + totalCups(x), 0)}杯`);
  return items.length ? `<p class="small" style="margin:10px 0 0">この日の記録：${items.map(esc).join(' ／ ')}</p>` : '';
}

function openUrge(date) {
  const d = day(date);
  d.urges = (d.urges || 0) + 1;
  save('days');
  let i = Math.floor(Math.random() * URGE_IDEAS.length);
  const sheet = openSheet('代わりにこれをやってみませんか？', `
    <div class="card good"><p id="idea" style="font-size:18px;font-weight:700;margin:0">${esc(URGE_IDEAS[i])}</p></div>
    <p class="muted">見たくなるのは自然なことです。5分だけ別のことをすると、気持ちが切り替わりやすくなります。</p>
    <div class="row"><button class="btn grow" data-close>やってみる</button><button class="btn sub grow" id="next-idea">別の案</button></div>`);
  $('#next-idea', sheet).onclick = () => {
    i = (i + 1) % URGE_IDEAS.length;
    $('#idea', sheet).textContent = URGE_IDEAS[i];
  };
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) render();
  });
}

/* ========== 飲み会 ========== */
const totalCups = (x) => Object.values(x.cups || {}).reduce((a, n) => a + n, 0);

function renderDrink(v) {
  const t = today();
  const thisMonth = S.drinks.filter((d) => monthKey(d.date) === monthKey(t));
  const sorted = [...S.drinks].sort((a, b) => (a.date < b.date ? 1 : -1));
  const months = [];
  for (let i = 0; i < 6; i++) {
    const d = parseYmd(t);
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const k = ymd(d).slice(0, 7);
    months.push([k, S.drinks.filter((x) => monthKey(x.date) === k).length]);
  }
  const maxM = Math.max(1, ...months.map((m) => m[1]));

  v.innerHTML = `
    <div class="card">
      <h2>今月の飲み会 <span>${thisMonth.length}回</span></h2>
      <p class="muted">今月の合計 ${thisMonth.reduce((a, x) => a + totalCups(x), 0)}杯</p>
      <button class="btn wide" data-new>＋ 飲み会を記録する</button>
    </div>
    <div class="card">
      <h2>月ごとの回数</h2>
      ${months
        .map(
          ([k, n]) => `<div class="row small" style="margin:4px 0"><span style="width:64px">${Number(k.slice(5))}月</span>
          <div class="meter grow" style="margin:0"><i style="width:${(n / maxM) * 100}%"></i></div><span style="width:32px;text-align:right">${n}回</span></div>`
        )
        .join('')}
    </div>
    <div class="card">
      <h2>これまでの記録</h2>
      ${
        sorted.length
          ? sorted
              .slice(0, 30)
              .map(
                (d) => `<div class="list-item" data-open="${d.id}">
            <div class="row" style="justify-content:space-between"><b>${jpDate(d.date)}</b><span>${totalCups(d)}杯${d.nijikai ? '・二次会' : ''}</span></div>
            <div class="meta">${esc(cupsText(d))}</div>
            <div class="meta">${d.morning?.done ? `翌朝：頭${esc(d.morning.head || '-')} 体${esc(d.morning.body || '-')} ${esc(d.morning.amount || '')}` : '翌朝チェックまだ'}</div>
          </div>`
              )
              .join('')
          : '<p class="muted">まだ記録はありません。</p>'
      }
    </div>`;
  $('[data-new]', v).onclick = () => openDrinkSheet(null, t);
  $$('[data-open]', v).forEach((el) => (el.onclick = () => openDrinkSheet(el.dataset.open)));
}

function cupsText(d) {
  return Object.entries(d.cups || {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}${n}`)
    .join('、');
}

function openDrinkSheet(id, date) {
  const existing = id ? S.drinks.find((d) => d.id === id) : null;
  const rec = existing ? structuredClone(existing) : { id: uid(), date: date || today(), cups: {}, nijikai: false, memo: '' };
  const sheet = openSheet(existing ? '飲み会の記録' : '飲み会を記録', `
    <label class="field"><span>日付</span><input type="date" id="dr-date" value="${rec.date}"></label>
    <div class="card">
      ${DRINK_TYPES.map(
        (k) => `<div class="counter"><span>${k}</span><div class="ctl"><button type="button" data-minus="${k}">−</button><b id="c-${k}">${rec.cups[k] || 0}</b><button type="button" data-plus="${k}">＋</button></div></div>`
      ).join('')}
    </div>
    <label class="check"><input type="checkbox" id="dr-niji" ${rec.nijikai ? 'checked' : ''}> 二次会に行った</label>
    <label class="field"><span class="row" style="justify-content:space-between">メモ（誰と、どんな会か） ${voiceBtn('dr-memo')}</span>
      <textarea id="dr-memo">${esc(rec.memo)}</textarea></label>
    <div class="row">
      <button class="btn grow" id="dr-save">保存</button>
      ${existing ? `<button class="btn sub" id="dr-morning">翌朝チェック</button><button class="btn ghost" id="dr-del">削除</button>` : ''}
    </div>`);
  sheet.addEventListener('click', (e) => {
    const p = e.target.closest('[data-plus],[data-minus]');
    if (!p) return;
    const k = p.dataset.plus || p.dataset.minus;
    rec.cups[k] = Math.max(0, (rec.cups[k] || 0) + (p.dataset.plus ? 1 : -1));
    $(`#c-${CSS.escape(k)}`, sheet).textContent = rec.cups[k];
  });
  const collect = () => {
    rec.date = $('#dr-date', sheet).value || today();
    rec.nijikai = $('#dr-niji', sheet).checked;
    rec.memo = $('#dr-memo', sheet).value;
  };
  $('#dr-save', sheet).onclick = () => {
    collect();
    const i = S.drinks.findIndex((d) => d.id === rec.id);
    if (i >= 0) S.drinks[i] = rec;
    else S.drinks.push(rec);
    save('drinks');
    closeSheet();
    toast(existing ? '直しました' : '記録しました。明日の朝に振り返りましょう');
    render();
  };
  $('#dr-morning', sheet)?.addEventListener('click', () => {
    collect();
    const i = S.drinks.findIndex((d) => d.id === rec.id);
    S.drinks[i] = rec;
    save('drinks');
    openMorningCheck(rec.id);
  });
  $('#dr-del', sheet)?.addEventListener('click', () => {
    if (!confirm('この飲み会の記録を消しますか？')) return;
    S.drinks = S.drinks.filter((d) => d.id !== rec.id);
    save('drinks');
    closeSheet();
    render();
  });
}

function openMorningCheck(id) {
  const rec = S.drinks.find((d) => d.id === id);
  if (!rec) return;
  const next = addDays(rec.date, 1);
  const nd = day(next);
  const m = rec.morning || {};
  const sheet = openSheet(`${jpDate(rec.date)}の翌朝チェック`, `
    <p class="muted">${totalCups(rec)}杯（${esc(cupsText(rec)) || '記録なし'}）${rec.nijikai ? '・二次会あり' : ''}</p>
    <div class="row">
      <label class="field grow"><span>寝た時刻</span><input type="time" id="m-bed" value="${esc(nd.bed || '')}"></label>
      <label class="field grow"><span>起きた時刻</span><input type="time" id="m-wake" value="${esc(nd.wake || '')}"></label>
    </div>
    <h3>頭はすっきりしている？</h3>${choicesHTML('head', marks(MARKS), m.head)}
    <h3>胃腸・体のだるさ</h3>${choicesHTML('body', marks(MARKS), m.body)}
    <h3>飲んだ量は？</h3>${choicesHTML('amount', AMOUNTS.map((a) => [a, a]), m.amount)}
    <label class="field"><span class="row" style="justify-content:space-between">反省・よかったこと ${voiceBtn('m-note')}</span>
      <textarea id="m-note">${esc(m.note || '')}</textarea></label>
    <button class="btn wide" id="m-save">保存</button>`);
  $('#m-save', sheet).onclick = () => {
    rec.morning = {
      done: true,
      head: picked(sheet, 'head'),
      body: picked(sheet, 'body'),
      amount: picked(sheet, 'amount'),
      note: $('#m-note', sheet).value,
    };
    nd.bed = $('#m-bed', sheet).value || nd.bed;
    nd.wake = $('#m-wake', sheet).value || nd.wake;
    save('drinks');
    save('days');
    closeSheet();
    toast('おつかれさまです。今日も無理せずいきましょう');
    render();
  };
  ['head', 'body', 'amount'].forEach((n) => bindChoices(sheet, n, () => {}));
}

/* ========== 筋トレ ========== */
function weekWorkouts(ws) {
  return S.workouts.filter((w) => !w.skipped && w.date >= ws && w.date <= addDays(ws, 6));
}

function renderGym(v) {
  const t = today();
  const n = weekWorkouts(weekStart(t)).length;
  const sorted = [...S.workouts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created));
  const lastBody = [...S.body].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const msg = n >= 5 ? '最高の週です！' : n >= 3 ? 'いいペースです' : n >= 2 ? '今週は合格ライン達成' : `あと${2 - n}回で合格ライン`;

  v.innerHTML = `
    <div class="card">
      <h2>今週の筋トレ <span>${n}回</span></h2>
      <div class="meter"><i style="width:${Math.min(100, (n / 5) * 100)}%"></i></div>
      <div class="meter-marks"><span>0</span><span>2 合格</span><span>3 良い</span><span>5 最高</span></div>
      <p class="small" style="margin:8px 0 0">${msg}</p>
    </div>
    <div class="card">
      <h2>トレーニングを始める</h2>
      <div class="row">
        ${Object.entries(TEMPLATES).map(([k, t2]) => `<button class="btn sub grow" data-tpl="${k}">${t2.name}</button>`).join('')}
      </div>
      <button class="btn ghost wide" style="margin-top:8px" data-skip>飲み会などで行けなかった日を記録</button>
    </div>
    <div class="card">
      <h2>体の感覚 <button class="btn sub sm" data-body>記録</button></h2>
      <p class="muted">${lastBody ? `前回 ${jpDate(lastBody.date)}：お腹 ${esc(lastBody.feel || '-')}${lastBody.weight ? `・${lastBody.weight}kg` : ''}${lastBody.fat ? `・${lastBody.fat}%` : ''}` : 'お腹をつまんだ感覚を、週1回くらい記録しましょう。'}</p>
    </div>
    <div class="card">
      <h2>これまでの記録</h2>
      ${
        sorted.length
          ? sorted
              .slice(0, 30)
              .map((w) =>
                w.skipped
                  ? `<div class="list-item" data-open="${w.id}"><b>${jpDate(w.date)}</b> <span class="muted">行けなかった（${esc(w.reason || '')}）</span></div>`
                  : `<div class="list-item" data-open="${w.id}"><div class="row" style="justify-content:space-between"><b>${jpDate(w.date)}</b><span>${esc(w.name)}</span></div>
                     <div class="meta">${esc(w.exercises.filter((e) => e.sets.length).map((e) => `${e.name} ${bestSet(e)}`).join('、'))}</div></div>`
              )
              .join('')
          : '<p class="muted">まだ記録はありません。</p>'
      }
    </div>`;
  $$('[data-tpl]', v).forEach((b) => (b.onclick = () => openWorkout(null, b.dataset.tpl, t)));
  $('[data-skip]', v).onclick = () => openSkip(t);
  $('[data-body]', v).onclick = openBody;
  $$('[data-open]', v).forEach((el) => {
    el.onclick = () => {
      const w = S.workouts.find((x) => x.id === el.dataset.open);
      if (w.skipped) {
        if (confirm('この「行けなかった」記録を消しますか？')) {
          S.workouts = S.workouts.filter((x) => x.id !== w.id);
          save('workouts');
          render();
        }
      } else openWorkout(w.id);
    };
  });
}

function setText(s) {
  return s.kg ? `${s.kg}kg×${s.reps || 0}` : `${s.reps || 0}回`;
}
function bestSet(e) {
  const sets = e.sets.filter((s) => s.reps);
  if (!sets.length) return '';
  const best = sets.reduce((a, s) => (Number(s.kg || 0) > Number(a.kg || 0) || (Number(s.kg || 0) === Number(a.kg || 0) && Number(s.reps) > Number(a.reps)) ? s : a));
  return `${setText(best)}（${sets.length}セット）`;
}
function prevOf(name, beforeId, date) {
  const list = S.workouts
    .filter((w) => !w.skipped && w.id !== beforeId && w.date <= date)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created));
  for (const w of list) {
    const e = w.exercises.find((x) => x.name === name && x.sets.some((s) => s.reps));
    if (e) return { date: w.date, sets: e.sets.filter((s) => s.reps) };
  }
  return null;
}

function openWorkoutStart(date) {
  const sheet = openSheet('どのメニュー？', `<div class="row">${Object.entries(TEMPLATES)
    .map(([k, t]) => `<button class="btn sub grow" data-tpl="${k}">${t.name}</button>`)
    .join('')}</div>`);
  $$('[data-tpl]', sheet).forEach((b) => (b.onclick = () => openWorkout(null, b.dataset.tpl, date)));
}

function openWorkout(id, tplKey, date) {
  const existing = id ? S.workouts.find((w) => w.id === id) : null;
  const w = existing
    ? structuredClone(existing)
    : {
        id: uid(),
        created: Date.now(),
        date: date || today(),
        tpl: tplKey,
        name: TEMPLATES[tplKey].name,
        exercises: TEMPLATES[tplKey].exercises.map((name) => ({ name, sets: [] })),
        note: '',
      };

  const draw = () => {
    const sheet = openSheet(esc(w.name), `
      <label class="field"><span>日付</span><input type="date" id="w-date" value="${w.date}"></label>
      <p class="muted">重さが空欄なら自分の体重だけ（自重）として記録します。ディップスなどの加重は、付けた重りの重さを入れてください。</p>
      <div class="card" id="ex-list">
        ${w.exercises
          .map((e, ei) => {
            const prev = prevOf(e.name, w.id, w.date);
            return `<div class="exercise">
              <div class="row" style="justify-content:space-between"><b>${esc(e.name)}</b><button class="btn ghost sm" data-rmex="${ei}">外す</button></div>
              <div class="prev">${prev ? `前回 ${jpDate(prev.date)}：${prev.sets.map(setText).join(' / ')}` : '前回の記録なし'}</div>
              ${e.sets
                .map(
                  (s, si) => `<div class="set-row"><span class="no">${si + 1}</span>
                  <input class="num" type="number" inputmode="decimal" placeholder="kg" value="${esc(s.kg ?? '')}" data-kg="${ei}-${si}"> kg ×
                  <input class="num" type="number" inputmode="numeric" placeholder="回" value="${esc(s.reps ?? '')}" data-reps="${ei}-${si}"> 回
                  <button class="btn ghost sm" data-rmset="${ei}-${si}">✕</button></div>`
                )
                .join('')}
              <button class="btn sub sm" data-addset="${ei}" style="margin-top:4px">＋ セット</button>
            </div>`;
          })
          .join('')}
      </div>
      <div class="row">
        <select id="add-ex" class="grow">
          <option value="">＋ 種目を追加</option>
          ${[...new Set([...Object.values(TEMPLATES).flatMap((t) => t.exercises), ...EXTRA_EXERCISES, ...knownExercises()])]
            .filter((n) => !w.exercises.some((e) => e.name === n))
            .map((n) => `<option>${esc(n)}</option>`)
            .join('')}
          <option value="__new">（自分で入力）</option>
        </select>
      </div>
      <label class="field"><span class="row" style="justify-content:space-between">メモ（調子、フォームで気づいたこと） ${voiceBtn('w-note')}</span>
        <textarea id="w-note">${esc(w.note)}</textarea></label>
      <div class="row">
        <button class="btn grow" id="w-save">保存</button>
        ${existing ? '<button class="btn ghost" id="w-del">削除</button>' : ''}
      </div>`);

    const sync = () => {
      w.date = $('#w-date', sheet).value || w.date;
      w.note = $('#w-note', sheet).value;
      $$('[data-kg]', sheet).forEach((i) => {
        const [ei, si] = i.dataset.kg.split('-').map(Number);
        w.exercises[ei].sets[si].kg = i.value === '' ? '' : Number(i.value);
      });
      $$('[data-reps]', sheet).forEach((i) => {
        const [ei, si] = i.dataset.reps.split('-').map(Number);
        w.exercises[ei].sets[si].reps = i.value === '' ? '' : Number(i.value);
      });
    };
    const scroll = sheet.scrollTop;
    const redraw = () => {
      sync();
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    };
    sheet.scrollTop = scroll;

    sheet.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.addset !== undefined) {
        sync();
        const ex = w.exercises[Number(t.dataset.addset)];
        const last = ex.sets[ex.sets.length - 1] || prevOf(ex.name, w.id, w.date)?.sets[0] || { kg: '', reps: '' };
        ex.sets.push({ kg: last.kg ?? '', reps: last.reps ?? '' });
        redraw();
      } else if (t.dataset.rmset) {
        sync();
        const [ei, si] = t.dataset.rmset.split('-').map(Number);
        w.exercises[ei].sets.splice(si, 1);
        redraw();
      } else if (t.dataset.rmex !== undefined) {
        sync();
        w.exercises.splice(Number(t.dataset.rmex), 1);
        redraw();
      }
    });
    $('#add-ex', sheet).onchange = (e) => {
      let name = e.target.value;
      if (name === '__new') name = (prompt('種目の名前') || '').trim();
      if (!name) return;
      sync();
      w.exercises.push({ name, sets: [] });
      redraw();
    };
    $('#w-save', sheet).onclick = () => {
      sync();
      w.exercises.forEach((e) => (e.sets = e.sets.filter((s) => s.reps !== '' || s.kg !== '')));
      const i = S.workouts.findIndex((x) => x.id === w.id);
      if (i >= 0) S.workouts[i] = w;
      else S.workouts.push(w);
      save('workouts');
      closeSheet();
      const n = weekWorkouts(weekStart(today())).length;
      toast(existing ? '直しました' : `おつかれさまでした！今週${n}回目です`);
      render();
    };
    $('#w-del', sheet)?.addEventListener('click', () => {
      if (!confirm('このトレーニングの記録を消しますか？')) return;
      S.workouts = S.workouts.filter((x) => x.id !== w.id);
      save('workouts');
      closeSheet();
      render();
    });
  };
  draw();
}

function knownExercises() {
  return S.workouts.flatMap((w) => (w.exercises || []).map((e) => e.name));
}

function openSkip(date) {
  const sheet = openSheet('行けなかった日', `
    <label class="field"><span>日付</span><input type="date" id="s-date" value="${date}"></label>
    <h3>どのトレーニング？</h3>${choicesHTML('tpl', Object.entries(TEMPLATES).filter(([k]) => k !== 'free').map(([k, t]) => [k, t.name]), null)}
    <h3>理由</h3>${choicesHTML('reason', ['飲み会', '仕事', '体調', 'そのほか'].map((r) => [r, r]), '飲み会')}
    <button class="btn wide" id="s-save" style="margin-top:12px">記録</button>`);
  bindChoices(sheet, 'tpl', () => {});
  bindChoices(sheet, 'reason', () => {});
  $('#s-save', sheet).onclick = () => {
    const tk = picked(sheet, 'tpl');
    S.workouts.push({ id: uid(), created: Date.now(), date: $('#s-date', sheet).value || date, skipped: true, tpl: tk, name: tk ? TEMPLATES[tk].name : '', reason: picked(sheet, 'reason') || '', exercises: [] });
    save('workouts');
    closeSheet();
    toast('記録しました。次の機会にいきましょう');
    render();
  };
}

function openBody() {
  const sheet = openSheet('体の感覚', `
    <h3>お腹をつまんだ感じ（前と比べて）</h3>${choicesHTML('feel', ['薄くなった', '同じ', '厚くなった'].map((x) => [x, x]), null)}
    <div class="row">
      <label class="field grow"><span>体重（任意）</span><input type="number" inputmode="decimal" id="b-w" placeholder="kg"></label>
      <label class="field grow"><span>体脂肪（任意）</span><input type="number" inputmode="decimal" id="b-f" placeholder="%"></label>
    </div>
    <button class="btn wide" id="b-save">記録</button>
    <p class="muted">お腹の写真の記録は、次の段階で追加します。</p>`);
  bindChoices(sheet, 'feel', () => {});
  $('#b-save', sheet).onclick = () => {
    const w = $('#b-w', sheet).value;
    const f = $('#b-f', sheet).value;
    S.body.push({ id: uid(), date: today(), feel: picked(sheet, 'feel'), weight: w ? Number(w) : null, fat: f ? Number(f) : null });
    save('body');
    closeSheet();
    toast('記録しました');
    render();
  };
}

/* ========== 学び（英語・読書・言葉） ========== */
function englishMinutes(from, to) {
  const inRange = (x) => x.date >= from && x.date <= to;
  const eng = S.engLogs.filter(inRange).reduce((a, x) => a + (x.minutes || 0), 0);
  const yosho = S.readLogs.filter((r) => inRange(r) && bookOf(r.bookId)?.genre === '洋書').reduce((a, x) => a + (x.minutes || 0), 0);
  return eng + yosho;
}
function readingMinutes(from, to) {
  return S.readLogs.filter((r) => r.date >= from && r.date <= to && bookOf(r.bookId)?.genre !== '洋書').reduce((a, x) => a + (x.minutes || 0), 0);
}
const bookOf = (id) => S.books.find((b) => b.id === id);

function renderLearn(v) {
  v.innerHTML = `
    <div class="subtabs">${choicesHTML('learn', [['eng', '英語'], ['read', '読書'], ['words', '言葉の手帳']], learnTab)}</div>
    <div id="learn-body"></div>`;
  bindChoices(v, 'learn', (x) => {
    learnTab = x || learnTab;
    render();
  });
  const body = $('#learn-body', v);
  if (learnTab === 'eng') renderEng(body);
  else if (learnTab === 'read') renderRead(body);
  else renderWords(body);
}

function renderEng(v) {
  const t = today();
  const ws = weekStart(t);
  const todayMin = englishMinutes(t, t);
  const weekMin = englishMinutes(ws, t);
  const skills = {};
  S.engLogs.filter((x) => x.date >= ws).forEach((x) => (x.skills || []).forEach((s) => (skills[s] = (skills[s] || 0) + (x.minutes || 0))));
  S.readLogs.filter((r) => r.date >= ws && bookOf(r.bookId)?.genre === '洋書').forEach((r) => (skills['読む'] = (skills['読む'] || 0) + (r.minutes || 0)));
  const recent = [...S.engLogs].sort((a, b) => b.created - a.created).slice(0, 20);

  v.innerHTML = `
    <div class="card">
      <h2>今日の英語 <span>${minutesLabel(todayMin)}</span></h2>
      <div class="meter"><i style="width:${Math.min(100, (todayMin / 180) * 100)}%"></i></div>
      <div class="meter-marks"><span>0</span><span>45分 最低ライン</span><span>3時間</span></div>
      <p class="small">${todayMin >= 45 ? '最低ラインを超えました。いい調子です！' : `あと${45 - todayMin}分で最低ライン`}</p>
      <button class="btn wide" data-add>＋ 英語を記録する</button>
      <p class="muted">洋書は「読書」の本棚から記録すると、英語の時間にも入ります。</p>
    </div>
    <div class="card">
      <h2>今週 <span>${minutesLabel(weekMin)}</span></h2>
      <div class="stats">${SKILLS.map((s) => `<div class="stat"><div class="v">${minutesLabel(skills[s] || 0)}</div><div class="l">${s}</div></div>`).join('')}</div>
      ${SKILLS.filter((s) => !skills[s]).length ? `<p class="small">今週まだ：${SKILLS.filter((s) => !skills[s]).join('・')}</p>` : ''}
    </div>
    <div class="card"><h2>最近の記録</h2>
      ${recent.length ? recent.map((x) => `<div class="list-item" data-open="${x.id}"><div class="row" style="justify-content:space-between"><b>${esc(x.kindLabel)}</b><span>${minutesLabel(x.minutes)}</span></div><div class="meta">${jpDate(x.date)} ${esc((x.skills || []).join('・'))} ${esc(x.memo || '')}</div></div>`).join('') : '<p class="muted">まだ記録はありません。</p>'}
    </div>`;
  $('[data-add]', v).onclick = () => openEngLog(t);
  $$('[data-open]', v).forEach((el) => (el.onclick = () => openEngLog(null, el.dataset.open)));
}

function openEngLog(date, id) {
  const existing = id ? S.engLogs.find((x) => x.id === id) : null;
  const rec = existing ? structuredClone(existing) : { id: uid(), created: Date.now(), date: date || today(), kind: null, minutes: 15, skills: [], memo: '' };
  const sheet = openSheet('英語を記録', `
    <label class="field"><span>日付</span><input type="date" id="e-date" value="${rec.date}"></label>
    <h3>何をした？</h3>${choicesHTML('kind', ENG_KINDS.map(([k, l]) => [k, l]), rec.kind)}
    <h3>時間</h3>
    <div class="row">${choicesHTML('min', [15, 30, 45, 60, 90, 120].map((m) => [String(m), minutesLabel(m)]), String(rec.minutes))}
      <input type="number" inputmode="numeric" class="num" id="e-min" value="${rec.minutes}"> 分</div>
    <h3>使った力</h3>
    <div class="choices" id="e-skills">${SKILLS.map((s) => `<button type="button" class="choice${rec.skills.includes(s) ? ' on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
    <label class="field"><span class="row" style="justify-content:space-between">気になった表現・メモ <span>${voiceBtn('e-memo', 'en-US')} ${voiceBtn('e-memo')}</span></span>
      <textarea id="e-memo" placeholder="英語のまま話すときは左の🎤">${esc(rec.memo)}</textarea></label>
    <div class="row"><button class="btn grow" id="e-save">保存</button>${existing ? '<button class="btn ghost" id="e-del">削除</button>' : ''}</div>`);
  bindChoices(sheet, 'kind', (k) => {
    rec.kind = k;
    const def = ENG_KINDS.find((x) => x[0] === k);
    if (def && !rec.skills.length) {
      rec.skills = [...def[2]];
      $$('#e-skills .choice', sheet).forEach((b) => b.classList.toggle('on', rec.skills.includes(b.dataset.s)));
    }
  });
  bindChoices(sheet, 'min', (m) => m && ($('#e-min', sheet).value = m));
  $('#e-skills', sheet).onclick = (e) => {
    const b = e.target.closest('.choice');
    if (!b) return;
    b.classList.toggle('on');
    rec.skills = $$('#e-skills .choice.on', sheet).map((x) => x.dataset.s);
  };
  $('#e-save', sheet).onclick = () => {
    if (!rec.kind) return toast('何をしたかを選んでください');
    rec.date = $('#e-date', sheet).value || rec.date;
    rec.minutes = Number($('#e-min', sheet).value) || 0;
    rec.kindLabel = ENG_KINDS.find((x) => x[0] === rec.kind)[1];
    rec.memo = $('#e-memo', sheet).value;
    const i = S.engLogs.findIndex((x) => x.id === rec.id);
    if (i >= 0) S.engLogs[i] = rec;
    else S.engLogs.push(rec);
    save('engLogs');
    closeSheet();
    toast(`記録しました。今日の英語は${minutesLabel(englishMinutes(today(), today()))}`);
    render();
  };
  $('#e-del', sheet)?.addEventListener('click', () => {
    if (!confirm('この記録を消しますか？')) return;
    S.engLogs = S.engLogs.filter((x) => x.id !== rec.id);
    save('engLogs');
    closeSheet();
    render();
  });
}

const STATUS = [['reading', '読んでいる'], ['want', '読みたい'], ['done', '読み終えた']];
function renderRead(v) {
  const t = today();
  const ws = weekStart(t);
  const group = (st) => S.books.filter((b) => b.status === st);
  const bookRow = (b) => {
    const logs = S.readLogs.filter((r) => r.bookId === b.id);
    const total = logs.reduce((a, r) => a + (r.minutes || 0), 0);
    return `<div class="list-item"><div class="row" style="justify-content:space-between">
      <div class="grow" data-book="${b.id}"><b>${esc(b.title)}</b><div class="meta">${esc(b.genre)}${b.progress ? ` ・ ${esc(b.progress)}` : ''}${total ? ` ・ 合計${minutesLabel(total)}` : ''}</div></div>
      ${b.status === 'reading' ? `<button class="btn sm" data-log="${b.id}">読んだ</button>` : ''}</div></div>`;
  };
  v.innerHTML = `
    <div class="card">
      <h2>今週の読書 <span>${minutesLabel(readingMinutes(ws, t))}</span></h2>
      <p class="muted">15分読んだら「読んだ」を押して、ひとことつぶやきましょう。</p>
    </div>
    ${STATUS.map(([st, label]) => `<div class="card"><h2>${label}${st === 'reading' ? ' <button class="btn sub sm" data-addbook>＋ 本を追加</button>' : ''}</h2>
      ${group(st).map(bookRow).join('') || '<p class="muted">なし</p>'}</div>`).join('')}`;
  $('[data-addbook]', v).onclick = () => openBook(null);
  $$('[data-book]', v).forEach((el) => (el.onclick = () => openBook(el.dataset.book)));
  $$('[data-log]', v).forEach((el) => (el.onclick = () => openReadLog(el.dataset.log, t)));
}

function openReadPicker(date) {
  const reading = S.books.filter((b) => b.status === 'reading');
  if (!reading.length) return openBook(null);
  const sheet = openSheet('どの本を読みましたか？', reading.map((b) => `<button class="btn sub wide" style="margin-bottom:8px" data-log="${b.id}">${esc(b.title)}</button>`).join(''));
  $$('[data-log]', sheet).forEach((el) => (el.onclick = () => openReadLog(el.dataset.log, date)));
}

function openReadLog(bookId, date) {
  const b = bookOf(bookId);
  const isEn = b.genre === '洋書';
  const sheet = openSheet(esc(b.title), `
    <label class="field"><span>日付</span><input type="date" id="r-date" value="${date || today()}"></label>
    <div class="row">${choicesHTML('rmin', [10, 15, 20, 30, 45, 60].map((m) => [String(m), `${m}分`]), '15')}
      <input type="number" inputmode="numeric" class="num" id="r-min" value="15"> 分</div>
    <label class="field"><span>どこまで読んだ？（任意）</span><input type="text" id="r-prog" value="${esc(b.progress || '')}" placeholder="例：p.120、第3章まで"></label>
    <label class="field"><span class="row" style="justify-content:space-between">ひとことつぶやき <span>${isEn ? voiceBtn('r-note', 'en-US') + ' ' : ''}${voiceBtn('r-note')}</span></span>
      <textarea id="r-note" placeholder="心に残ったこと、感じたこと"></textarea></label>
    <button class="btn wide" id="r-save">記録</button>
    ${isEn ? '<p class="muted">洋書の時間は英語の時間にも入ります。</p>' : ''}`);
  bindChoices(sheet, 'rmin', (m) => m && ($('#r-min', sheet).value = m));
  $('#r-save', sheet).onclick = () => {
    S.readLogs.push({ id: uid(), created: Date.now(), date: $('#r-date', sheet).value || today(), bookId, minutes: Number($('#r-min', sheet).value) || 0, note: $('#r-note', sheet).value });
    b.progress = $('#r-prog', sheet).value;
    save('readLogs');
    save('books');
    closeSheet();
    toast('記録しました。積み重なっています');
    render();
  };
}

function openBook(id) {
  const existing = id ? bookOf(id) : null;
  const b = existing ? structuredClone(existing) : { id: uid(), title: '', genre: '小説', status: 'reading', progress: '' };
  const logs = existing ? S.readLogs.filter((r) => r.bookId === id).sort((a, c) => a.created - c.created) : [];
  const sheet = openSheet(existing ? '本の記録' : '本を追加', `
    <label class="field"><span>タイトル</span><input type="text" id="bk-title" value="${esc(b.title)}"></label>
    <h3>ジャンル</h3>${choicesHTML('genre', GENRES.map((g) => [g, g]), b.genre)}
    <h3>状態</h3>${choicesHTML('status', STATUS, b.status)}
    <label class="field"><span>どこまで読んだか</span><input type="text" id="bk-prog" value="${esc(b.progress)}"></label>
    <div class="row"><button class="btn grow" id="bk-save">保存</button>${existing ? '<button class="btn ghost" id="bk-del">削除</button>' : ''}</div>
    ${logs.length ? `<div class="card" style="margin-top:12px"><h2>つぶやきの記録</h2>${logs.map((r) => `<div class="list-item"><div class="meta">${jpDate(r.date)}・${r.minutes}分</div>${esc(r.note || '（つぶやきなし）')}</div>`).join('')}</div>` : ''}`);
  bindChoices(sheet, 'genre', () => {});
  bindChoices(sheet, 'status', () => {});
  $('#bk-save', sheet).onclick = () => {
    b.title = $('#bk-title', sheet).value.trim();
    if (!b.title) return toast('タイトルを入れてください');
    b.genre = picked(sheet, 'genre') || 'そのほか';
    b.status = picked(sheet, 'status') || 'reading';
    b.progress = $('#bk-prog', sheet).value;
    const i = S.books.findIndex((x) => x.id === b.id);
    if (i >= 0) S.books[i] = b;
    else S.books.push(b);
    save('books');
    closeSheet();
    render();
  };
  $('#bk-del', sheet)?.addEventListener('click', () => {
    if (!confirm('この本を本棚から消しますか？（読んだ記録は残ります）')) return;
    S.books = S.books.filter((x) => x.id !== b.id);
    save('books');
    closeSheet();
    render();
  });
}

function renderWords(v) {
  const list = [...S.words].sort((a, b) => b.created - a.created);
  v.innerHTML = `
    <div class="card">
      <h2>言葉の手帳 <span>${S.words.length}語</span></h2>
      <p class="muted">赤線を引いた言葉を貯めていく場所です。写真からの取り込みと、忘れかけた頃に出る復習クイズは次の段階で追加します。</p>
      <button class="btn wide" data-add>＋ 言葉を追加</button>
    </div>
    <div class="card">${list.length ? list.map((w) => `<div class="list-item" data-open="${w.id}"><b>${esc(w.word)}</b> <span class="muted">${w.lang === 'en' ? '英語' : '日本語'}</span><div class="meta">${esc(w.meaning || '')}${w.source ? ` ／ ${esc(w.source)}` : ''}</div></div>`).join('') : '<p class="muted">まだありません。</p>'}</div>`;
  $('[data-add]', v).onclick = () => openWord(null);
  $$('[data-open]', v).forEach((el) => (el.onclick = () => openWord(el.dataset.open)));
}

function openWord(id) {
  const existing = id ? S.words.find((w) => w.id === id) : null;
  const w = existing ? structuredClone(existing) : { id: uid(), created: Date.now(), word: '', meaning: '', source: '', lang: 'ja' };
  const sheet = openSheet(existing ? '言葉' : '言葉を追加', `
    ${choicesHTML('lang', [['ja', '日本語'], ['en', '英語']], w.lang)}
    <label class="field"><span>言葉</span><input type="text" id="wd-word" value="${esc(w.word)}"></label>
    <label class="field"><span>意味</span><textarea id="wd-mean">${esc(w.meaning)}</textarea></label>
    <label class="field"><span>出てきた本</span><select id="wd-src"><option value="">（なし）</option>${S.books.map((b) => `<option ${w.source === b.title ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>
    <div class="row"><button class="btn grow" id="wd-save">保存</button>${existing ? '<button class="btn ghost" id="wd-del">削除</button>' : ''}</div>`);
  bindChoices(sheet, 'lang', () => {});
  $('#wd-save', sheet).onclick = () => {
    w.word = $('#wd-word', sheet).value.trim();
    if (!w.word) return toast('言葉を入れてください');
    w.meaning = $('#wd-mean', sheet).value;
    w.source = $('#wd-src', sheet).value;
    w.lang = picked(sheet, 'lang') || 'ja';
    const i = S.words.findIndex((x) => x.id === w.id);
    if (i >= 0) S.words[i] = w;
    else S.words.push(w);
    save('words');
    closeSheet();
    render();
  };
  $('#wd-del', sheet)?.addEventListener('click', () => {
    S.words = S.words.filter((x) => x.id !== w.id);
    save('words');
    closeSheet();
    render();
  });
}

/* ========== ふりかえり ========== */
let reviewWeek = null;
function renderReview(v) {
  const t = today();
  const ws = reviewWeek || weekStart(t);
  const we = addDays(ws, 6);
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const wos = weekWorkouts(ws);
  const drinksWeek = S.drinks.filter((d) => d.date >= ws && d.date <= we);
  const savingCount = days.reduce((a, d) => a + Object.values(S.days[d]?.saving || {}).filter(Boolean).length, 0);
  const wakes = days.map((d) => S.days[d]?.wake).filter(Boolean);
  const avgWake = wakes.length
    ? (() => {
        const m = Math.round(wakes.map((w) => Number(w.slice(0, 2)) * 60 + Number(w.slice(3))).reduce((a, b) => a + b, 0) / wakes.length);
        return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
      })()
    : '-';
  const lots = days.filter((d) => S.days[d]?.dawdle === 'lots').length;
  const urges = days.reduce((a, d) => a + (S.days[d]?.urges || 0), 0);

  v.innerHTML = `
    <div class="nav">
      <button class="btn ghost sm" data-wk="-7">◀ 前の週</button>
      <b>${jpDate(ws)} 〜 ${jpDate(we)}</b>
      <button class="btn ghost sm" data-wk="7" ${ws >= weekStart(t) ? 'style="visibility:hidden"' : ''}>次の週 ▶</button>
    </div>
    <div class="card">
      <div class="week">${days
        .map((d) => {
          const dd = S.days[d] || {};
          const dots = [];
          if (S.workouts.some((w) => w.date === d && !w.skipped)) dots.push('💪');
          if (S.drinks.some((x) => x.date === d)) dots.push('🍺');
          const e = englishMinutes(d, d);
          if (e) dots.push(`英${e}`);
          const r = readingMinutes(d, d);
          if (r) dots.push(`本${r}`);
          if (dd.diary) dots.push('📔');
          if (dd.dawdle === 'lots') dots.push('📱');
          return `<div class="d${d === t ? ' today' : ''}"><div>${WD[parseYmd(d).getDay()]}</div><div class="dots">${dots.join('<br>')}</div></div>`;
        })
        .join('')}</div>
      <p class="muted" style="margin:8px 0 0">💪筋トレ 🍺飲み会 英=英語(分) 本=読書(分) 📔日記 📱だらだら多め</p>
    </div>
    <div class="card">
      <h2>この週のまとめ</h2>
      <div class="stats">
        <div class="stat"><div class="v">${wos.length}回</div><div class="l">筋トレ（2回で合格）</div></div>
        <div class="stat"><div class="v">${minutesLabel(englishMinutes(ws, we))}</div><div class="l">英語</div></div>
        <div class="stat"><div class="v">${minutesLabel(readingMinutes(ws, we))}</div><div class="l">読書</div></div>
        <div class="stat"><div class="v">${drinksWeek.length}回</div><div class="l">飲み会（${drinksWeek.reduce((a, x) => a + totalCups(x), 0)}杯）</div></div>
        <div class="stat"><div class="v">${avgWake}</div><div class="l">平均の起きた時刻</div></div>
        <div class="stat"><div class="v">${savingCount}回</div><div class="l">節約できた行動</div></div>
        <div class="stat"><div class="v">${lots}日</div><div class="l">だらだら多めの日</div></div>
        <div class="stat"><div class="v">${urges}回</div><div class="l">YouTubeをがまん</div></div>
        <div class="stat"><div class="v">${days.filter((d) => S.days[d]?.diary).length}日</div><div class="l">日記を書いた</div></div>
      </div>
    </div>
    ${afterDrinkHTML()}`;
  $$('[data-wk]', v).forEach((b) =>
    b.addEventListener('click', () => {
      reviewWeek = addDays(ws, Number(b.dataset.wk));
      render();
    })
  );
}

// 飲み会の翌日と、それ以外の日の比べっこ（直近60日）
function afterDrinkHTML() {
  const t = today();
  const from = addDays(t, -60);
  const drinkDates = new Set(S.drinks.map((d) => d.date));
  const after = [];
  const normal = [];
  for (let d = from; d < t; d = addDays(d, 1)) {
    const rec = S.days[d];
    if (!rec || (!rec.work && !rec.dawdle)) continue;
    (drinkDates.has(addDays(d, -1)) ? after : normal).push(d);
  }
  if (after.length < 2 || normal.length < 2) {
    return `<div class="card"><h2>飲み会の翌日はどう違う？</h2><p class="muted">夜のふりかえりと飲み会の記録が貯まると、ここに比べた結果が出ます。</p></div>`;
  }
  const score = { '◎': 4, '○': 3, '△': 2, '×': 1 };
  const summary = (list) => {
    const works = list.map((d) => score[S.days[d].work]).filter(Boolean);
    const avg = works.length ? works.reduce((a, b) => a + b, 0) / works.length : null;
    const lotsRate = Math.round((list.filter((d) => S.days[d].dawdle === 'lots').length / list.length) * 100);
    const study = Math.round(list.reduce((a, d) => a + englishMinutes(d, d) + readingMinutes(d, d), 0) / list.length);
    return { avg, lotsRate, study };
  };
  const a = summary(after);
  const n = summary(normal);
  const mark = (x) => (x == null ? '-' : x >= 3.5 ? '◎' : x >= 2.5 ? '○' : x >= 1.5 ? '△' : '×');
  return `<div class="card"><h2>飲み会の翌日はどう違う？</h2>
    <p class="muted">直近60日（翌日${after.length}日 ／ ふだん${normal.length}日）</p>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td></td><th>翌日</th><th>ふだん</th></tr>
      <tr><td>仕事の調子</td><td align="center">${mark(a.avg)}</td><td align="center">${mark(n.avg)}</td></tr>
      <tr><td>だらだら多め</td><td align="center">${a.lotsRate}%</td><td align="center">${n.lotsRate}%</td></tr>
      <tr><td>英語＋読書</td><td align="center">${a.study}分</td><td align="center">${n.study}分</td></tr>
    </table></div>`;
}

/* ========== 設定・バックアップ ========== */
$('#btn-settings').onclick = () => {
  const last = S.settings.lastBackup;
  const sheet = openSheet('設定', `
    <div class="card">
      <h2>バックアップ</h2>
      <p class="small">前回：${last ? jpDate(ymd(new Date(last))) : 'まだ'}</p>
      <p class="muted">「保存する」を押すと、送り先を選ぶ画面が出ます。Googleドライブを選んでください。</p>
      <button class="btn wide" id="bk-out">保存する</button>
      <label class="btn sub wide" style="display:block;text-align:center;margin-top:8px">バックアップから戻す<input type="file" id="bk-in" accept=".json,application/json" hidden></label>
    </div>
    <p class="muted">成長ログ 第1段階 ・ 記録はこのスマホの中だけに保存されています。</p>`);
  $('#bk-out', sheet).onclick = doBackup;
  $('#bk-in', sheet).onchange = (e) => restore(e.target.files[0]);
};

async function doBackup() {
  const data = { app: 'seicho-log', version: 1, savedAt: new Date().toISOString() };
  KEYS.forEach((k) => (data[k] = S[k]));
  const name = `seicho-log-${today()}.json`;
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    S.settings.lastBackup = new Date().toISOString();
    await save('settings');
    toast('バックアップしました');
    closeSheet();
    render();
  } catch (err) {
    if (err?.name !== 'AbortError') toast('バックアップできませんでした');
  }
}

async function restore(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'seicho-log') throw new Error('not ours');
    if (!confirm(`${data.savedAt ? jpDate(ymd(new Date(data.savedAt))) : ''}のバックアップに戻します。今の記録は置きかわります。よろしいですか？`)) return;
    for (const k of KEYS) {
      S[k] = data[k] ?? structuredClone(DEFAULTS[k]);
      await save(k);
    }
    closeSheet();
    toast('戻しました');
    render();
  } catch {
    toast('このファイルは読み込めませんでした');
  }
}

/* ========== 鍵付きメモ（タイトル長押しで開く） ========== */
// 中身は暗証番号から作った鍵で暗号化して保存する。暗証番号そのものは保存しない。
let secretKey = null;
let secretItems = null;

async function deriveKey(pin, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sealSecret() {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secretKey, new TextEncoder().encode(JSON.stringify(secretItems)));
  S.secret = { salt: S.secret.salt, iv: b64(iv), ct: b64(ct) };
  await save('secret');
}

function lockSecret() {
  secretKey = null;
  secretItems = null;
  if ($('.sheet.secret')) closeSheet();
  if (tab === 'consult') render();
}
document.addEventListener('visibilitychange', () => document.hidden && lockSecret());

let pressTimer;
const title = $('#title');
title.addEventListener('pointerdown', () => (pressTimer = setTimeout(openSecretGate, 900)));
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => title.addEventListener(ev, () => clearTimeout(pressTimer)));
title.addEventListener('contextmenu', (e) => e.preventDefault());

async function setupPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  secretKey = await deriveKey(pin, salt);
  secretItems = [];
  S.secret = { salt: b64(salt) };
  await sealSecret();
}
async function unlockPin(pin) {
  try {
    secretKey = await deriveKey(pin, unb64(S.secret.salt));
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(S.secret.iv) }, secretKey, unb64(S.secret.ct));
    secretItems = JSON.parse(new TextDecoder().decode(pt));
    return true;
  } catch {
    secretKey = null;
    return false;
  }
}
async function encJSON(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, secretKey, new TextEncoder().encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}
async function decJSON(enc) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(enc.iv) }, secretKey, unb64(enc.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

function openSecretGate() {
  const first = !S.secret;
  const sheet = openSheet(first ? '暗証番号を決める' : '暗証番号', `
    ${first ? '<p class="small">ここに書いたことは暗号化され、この暗証番号でしか開けません。<b>忘れると誰にも開けなくなります。</b></p>' : ''}
    <label class="field"><span>暗証番号（4けた以上）</span><input type="password" inputmode="numeric" id="pin1" autocomplete="off"></label>
    ${first ? '<label class="field"><span>もう一度</span><input type="password" inputmode="numeric" id="pin2" autocomplete="off"></label>' : ''}
    <button class="btn wide" id="pin-ok">${first ? '決める' : '開く'}</button>`, { dark: true });
  $('#pin1', sheet).focus();
  $('#pin-ok', sheet).onclick = async () => {
    const p1 = $('#pin1', sheet).value;
    if (p1.length < 4) return toast('4けた以上にしてください');
    if (first) {
      if (p1 !== $('#pin2', sheet).value) return toast('2回の入力が違います');
      await setupPin(p1);
    } else if (!(await unlockPin(p1))) {
      return toast('違います');
    }
    renderSecret();
  };
}

function renderSecret() {
  const items = [...secretItems].sort((a, b) => (a.date < b.date ? 1 : -1));
  const byMonth = {};
  items.forEach((x) => {
    const k = monthKey(x.date);
    byMonth[k] = byMonth[k] || { n: 0, yen: 0 };
    byMonth[k].n++;
    byMonth[k].yen += Number(x.yen) || 0;
  });
  const sheet = openSheet('自分だけのメモ', `
    <button class="btn wide" id="sc-new">＋ 書く</button>
    ${Object.keys(byMonth).length ? `<div class="card" style="margin-top:12px"><h2>月ごと</h2>${Object.entries(byMonth).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 6).map(([k, m]) => `<div class="row small" style="justify-content:space-between"><span>${k.slice(0, 4)}年${Number(k.slice(5))}月</span><span>${m.n}回・${m.yen.toLocaleString()}円</span></div>`).join('')}</div>` : ''}
    <div class="card">${items.length ? items.map((x) => `<div class="list-item" data-sc="${x.id}"><div class="row" style="justify-content:space-between"><b>${jpDate(x.date)}</b><span>${x.yen ? Number(x.yen).toLocaleString() + '円' : ''}</span></div><div class="meta">${esc(x.what || '')}</div>${x.next ? `<div class="meta">次は：${esc(x.next)}</div>` : ''}</div>`).join('') : '<p class="muted">まだありません。</p>'}</div>
    <p class="muted">アプリを閉じると自動で鍵がかかります。</p>`, { dark: true });
  $('#sc-new', sheet).onclick = () => openSecretEntry(null);
  $$('[data-sc]', sheet).forEach((el) => (el.onclick = () => openSecretEntry(el.dataset.sc)));
}

function openSecretEntry(id) {
  const existing = id ? secretItems.find((x) => x.id === id) : null;
  const x = existing ? { ...existing } : { id: uid(), date: today(), what: '', yen: '', reflect: '', next: '' };
  const prev = [...secretItems].filter((i) => i.id !== x.id && i.next).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const sheet = openSheet(existing ? '自分だけのメモ' : '書く', `
    ${prev ? `<div class="card"><p class="muted" style="margin:0">前回（${jpDate(prev.date)}）決めたこと</p><p style="margin:4px 0 0">${esc(prev.next)}</p></div>` : ''}
    <label class="field"><span>日付</span><input type="date" id="sc-date" value="${x.date}"></label>
    <label class="field"><span class="row" style="justify-content:space-between">何があったか ${voiceBtn('sc-what')}</span><textarea id="sc-what">${esc(x.what)}</textarea></label>
    <label class="field"><span>使った金額（任意）</span><input type="number" inputmode="numeric" id="sc-yen" value="${esc(x.yen)}" placeholder="円"></label>
    <label class="field"><span class="row" style="justify-content:space-between">反省 ${voiceBtn('sc-ref')}</span><textarea id="sc-ref">${esc(x.reflect)}</textarea></label>
    <label class="field"><span class="row" style="justify-content:space-between">次はどうする ${voiceBtn('sc-next')}</span><textarea id="sc-next">${esc(x.next)}</textarea></label>
    <div class="row"><button class="btn grow" id="sc-save">保存</button>${existing ? '<button class="btn ghost" id="sc-del">削除</button>' : ''}<button class="btn ghost" id="sc-back">戻る</button></div>`, { dark: true });
  $('#sc-back', sheet).onclick = renderSecret;
  $('#sc-save', sheet).onclick = async () => {
    Object.assign(x, {
      date: $('#sc-date', sheet).value || today(),
      what: $('#sc-what', sheet).value,
      yen: $('#sc-yen', sheet).value,
      reflect: $('#sc-ref', sheet).value,
      next: $('#sc-next', sheet).value,
    });
    const i = secretItems.findIndex((s) => s.id === x.id);
    if (i >= 0) secretItems[i] = x;
    else secretItems.push(x);
    await sealSecret();
    toast('書き留めました。気づけたことが一歩です');
    renderSecret();
  };
  $('#sc-del', sheet)?.addEventListener('click', async () => {
    if (!confirm('消しますか？')) return;
    secretItems = secretItems.filter((s) => s.id !== x.id);
    await sealSecret();
    renderSecret();
  });
}

/* ========== コンサルテーション ========== */
// 患者さんの名前は入れない。金額は暗証番号から作った鍵で暗号化して保存する（単位は万円）。
const AGES = ['10代以下', '20代', '30代', '40代', '50代', '60代', '70代以上'];
const SEXES = ['女性', '男性'];
const PATIENT = ['新患', '通院中'];
const SOURCES = ['紹介', 'ホームページ', 'SNS', '通院中に提案', '看板・通りがかり', 'その他'];
const TOOLS = ['口の中の写真', 'レントゲン・CT', '模型', 'シミュレーション', '症例写真', '見積書'];
const REASONS = ['説明が分かりやすい', '症例写真', '見た目を良くしたい', '長持ちさせたい', '紹介者の安心感', '費用', '期間', '家族と相談', '痛み・不安', '時期を見て', '他院と比較'];
const C_STATUS = [['won', '決まった'], ['pending', '検討中'], ['lost', '見送り']];
let consultRange = 'month';

const treatmentName = (it) => S.treatments.find((t) => t.id === it.tid)?.name || it.name;
function consultOutcome(c) {
  if (c.items.some((i) => i.status === 'won')) return 'won';
  if (c.items.some((i) => i.status === 'pending')) return 'pending';
  return 'lost';
}
// 検討中のまま2週間たった相談
function followUps() {
  const t = today();
  return S.consults.filter((c) => c.items.some((i) => i.status === 'pending') && (c.followAt || addDays(c.date, 14)) <= t);
}
function consultFrom() {
  const t = today();
  if (consultRange === 'month') return t.slice(0, 8) + '01';
  if (consultRange === '3m') {
    const d = parseYmd(t);
    d.setDate(1);
    d.setMonth(d.getMonth() - 2);
    return ymd(d);
  }
  return '0000-00-00';
}
const man = (n) => `${Math.round(n * 10) / 10}万円`;

function multiHTML(name, options, selected = []) {
  return `<div class="choices" data-multi="${name}">${options
    .map((o) => `<button type="button" class="choice${selected.includes(o) ? ' on' : ''}" data-v="${esc(o)}">${esc(o)}</button>`)
    .join('')}</div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-multi] .choice');
  if (b) b.classList.toggle('on');
});
const readMulti = (root, name) => $$(`[data-multi="${name}"] .choice.on`, root).map((b) => b.dataset.v);

function pinRowHTML(px = 'cp') {
  const first = !S.secret;
  return `<div class="row">
      <input type="password" inputmode="numeric" id="${px}1" class="grow" placeholder="${first ? '暗証番号を決める（4けた以上）' : '暗証番号'}" autocomplete="off">
      ${first ? `<input type="password" inputmode="numeric" id="${px}2" class="grow" placeholder="もう一度" autocomplete="off">` : ''}
      <button type="button" class="btn sm" id="${px}-ok">${first ? '決める' : '開く'}</button>
    </div>
    ${first ? '<p class="muted">金額はこの暗証番号で暗号化します。忘れると、金額は誰にも開けなくなります。</p>' : ''}`;
}
function bindPinRow(root, done, px = 'cp') {
  const ok = $(`#${px}-ok`, root);
  if (!ok) return;
  ok.onclick = async () => {
    const p = $(`#${px}1`, root).value;
    if (p.length < 4) return toast('4けた以上にしてください');
    if (!S.secret) {
      if (p !== $(`#${px}2`, root).value) return toast('2回の入力が違います');
      await setupPin(p);
    } else if (!(await unlockPin(p))) {
      return toast('違います');
    }
    done();
  };
}

function renderConsult(v) {
  const from = consultFrom();
  const list = S.consults.filter((c) => c.date >= from);
  const cnt = { won: 0, pending: 0, lost: 0 };
  list.forEach((c) => cnt[consultOutcome(c)]++);
  const per = {};
  list.forEach((c) =>
    c.items.forEach((i) => {
      const n = treatmentName(i);
      per[n] = per[n] || { won: 0, pending: 0, lost: 0, all: 0 };
      per[n][i.status]++;
      per[n].all++;
    })
  );
  const reasons = {};
  list.forEach((c) => (c.reasons || []).forEach((r) => (reasons[r] = (reasons[r] || 0) + 1)));
  const sources = {};
  list.forEach((c) => {
    if (!c.source) return;
    sources[c.source] = sources[c.source] || { all: 0, won: 0 };
    sources[c.source].all++;
    if (consultOutcome(c) === 'won') sources[c.source].won++;
  });
  const sorted = [...S.consults].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created));
  const td = 'style="text-align:center;padding:4px 2px"';

  v.innerHTML = `
    <div class="subtabs">${choicesHTML('crange', [['month', '今月'], ['3m', '3か月'], ['all', 'すべて']], consultRange)}</div>
    <div class="card">
      <h2>相談 <span>${list.length}件</span></h2>
      <div class="stats">
        <div class="stat"><div class="v">${cnt.won}件</div><div class="l">決まった</div></div>
        <div class="stat"><div class="v">${cnt.pending}件</div><div class="l">検討中</div></div>
        <div class="stat"><div class="v">${cnt.lost}件</div><div class="l">見送り</div></div>
        <div class="stat"><div class="v">${list.length ? Math.round((cnt.won / list.length) * 100) : 0}%</div><div class="l">決まった割合</div></div>
      </div>
      <button class="btn wide" data-new style="margin-top:10px">＋ 相談を記録する</button>
    </div>
    <div class="card" id="money"><h2>金額 <span>🔒</span></h2>${secretKey ? '<p class="muted">計算しています…</p>' : pinRowHTML()}</div>
    <div class="card"><h2>治療ごと</h2>
      ${
        Object.keys(per).length
          ? `<table style="width:100%;font-size:14px;border-collapse:collapse">
          <tr class="muted"><td></td><td ${td}>提案</td><td ${td}>決</td><td ${td}>検討</td><td ${td}>見送</td></tr>
          ${Object.entries(per)
            .sort((a, b) => b[1].all - a[1].all)
            .map(([n, x]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:6px 0">${esc(n)}</td><td ${td}>${x.all}</td><td ${td}><b>${x.won}</b></td><td ${td}>${x.pending}</td><td ${td}>${x.lost}</td></tr>`)
            .join('')}</table>`
          : '<p class="muted">まだ記録はありません。</p>'
      }
    </div>
    ${
      Object.keys(sources).length
        ? `<div class="card"><h2>きっかけ</h2>${Object.entries(sources)
            .sort((a, b) => b[1].all - a[1].all)
            .map(([k, x]) => `<div class="row small" style="justify-content:space-between;padding:3px 0"><span>${esc(k)}</span><span>${x.all}件中 ${x.won}件 決まった</span></div>`)
            .join('')}</div>`
        : ''
    }
    ${
      Object.keys(reasons).length
        ? `<div class="card"><h2>決め手・見送りの理由</h2>${Object.entries(reasons)
            .sort((a, b) => b[1] - a[1])
            .map(([k, n]) => `<div class="row small" style="justify-content:space-between;padding:3px 0"><span>${esc(k)}</span><span>${n}件</span></div>`)
            .join('')}</div>`
        : ''
    }
    <div class="card"><h2>これまでの相談 <button class="btn ghost sm" data-menu>治療メニューを編集</button></h2>
      ${
        sorted.length
          ? sorted
              .slice(0, 40)
              .map((c) => {
                const o = consultOutcome(c);
                return `<div class="list-item" data-open="${c.id}"><div class="row" style="justify-content:space-between"><b>${jpDate(c.date)}</b><span>${C_STATUS.find((s) => s[0] === o)[1]}</span></div>
                  <div class="meta">${esc([c.age, c.sex, c.patient].filter(Boolean).join('・'))}</div>
                  <div class="meta">${esc(c.items.map((i) => `${treatmentName(i)}（${C_STATUS.find((s) => s[0] === i.status)[1]}）`).join('、'))}</div></div>`;
              })
              .join('')
          : '<p class="muted">まだ記録はありません。</p>'
      }
    </div>`;

  bindChoices(v, 'crange', (x) => {
    consultRange = x || consultRange;
    render();
  });
  $('[data-new]', v).onclick = () => openConsult(null);
  $('[data-menu]', v).onclick = openTreatmentMenu;
  $$('[data-open]', v).forEach((el) => (el.onclick = () => openConsult(el.dataset.open)));
  bindPinRow(v, render);
  if (secretKey) fillMoney($('#money', v), list);
}

async function fillMoney(box, list) {
  let won = 0;
  let pending = 0;
  let proposed = 0;
  let wonCount = 0;
  for (const c of list) {
    if (!c.enc) continue;
    let a;
    try {
      a = await decJSON(c.enc);
    } catch {
      continue;
    }
    let w = 0;
    c.items.forEach((i) => {
      const y = Number(a[i.id]) || 0;
      proposed += y;
      if (i.status === 'won') w += y;
      if (i.status === 'pending') pending += y;
    });
    won += w;
    if (w) wonCount++;
  }
  box.innerHTML = `<h2>金額 <span>🔓</span></h2>
    <div class="stats">
      <div class="stat"><div class="v">${man(won)}</div><div class="l">決まった合計</div></div>
      <div class="stat"><div class="v">${man(pending)}</div><div class="l">検討中の合計</div></div>
      <div class="stat"><div class="v">${man(proposed)}</div><div class="l">提案した合計</div></div>
      <div class="stat"><div class="v">${wonCount ? man(won / wonCount) : '-'}</div><div class="l">決まった相談1件あたり</div></div>
    </div>
    <p class="muted">アプリを閉じると、また鍵がかかります。</p>`;
}

async function openConsult(id) {
  const existing = id ? S.consults.find((c) => c.id === id) : null;
  const c = existing
    ? structuredClone(existing)
    : { id: uid(), created: Date.now(), date: today(), age: null, sex: null, patient: null, source: null, complaint: '', items: [], tools: [], reasons: [], score: null, note: '', enc: null };
  let amounts = {};
  if (existing?.enc && secretKey) {
    try {
      amounts = await decJSON(existing.enc);
    } catch {
      amounts = {};
    }
  }
  // 暗証番号を入れていないときに直した場合でも、前に入れた金額は消さない
  const keepOldEnc = () => existing?.enc && !secretKey;

  const draw = () => {
    const unlocked = !!secretKey;
    const sheet = openSheet(existing ? '相談の記録' : '相談を記録', `
      <label class="field"><span>日付</span><input type="date" id="c-date" value="${c.date}"></label>
      <h3>年代</h3>${choicesHTML('age', AGES.map((x) => [x, x]), c.age)}
      <h3>性別</h3>${choicesHTML('sex', SEXES.map((x) => [x, x]), c.sex)}
      <h3>新患・通院中</h3>${choicesHTML('patient', PATIENT.map((x) => [x, x]), c.patient)}
      <h3>きっかけ</h3>${choicesHTML('source', SOURCES.map((x) => [x, x]), c.source)}
      <label class="field"><span class="row" style="justify-content:space-between">相談の内容（主訴） ${voiceBtn('c-comp')}</span>
        <textarea id="c-comp" placeholder="例：前歯の見た目が気になる、奥歯でかめない">${esc(c.complaint)}</textarea></label>

      <div class="card">
        <h2>提案した治療</h2>
        ${c.items
          .map(
            (it, i) => `<div class="exercise">
            <div class="row" style="justify-content:space-between"><b>${esc(treatmentName(it))}</b><button type="button" class="btn ghost sm" data-rmit="${i}">外す</button></div>
            ${choicesHTML('st' + i, C_STATUS, it.status)}
            ${unlocked ? `<div class="row" style="margin-top:6px">金額 <input type="number" inputmode="decimal" class="num" style="width:110px" data-amt="${it.id}" value="${esc(amounts[it.id] ?? '')}"> 万円</div>` : ''}
          </div>`
          )
          .join('') || '<p class="muted">下から選んで追加してください（いくつでも）。</p>'}
        <select id="c-add" style="margin-top:10px">
          <option value="">＋ 治療を追加</option>
          ${S.treatments.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}
          <option value="__new">（自分で入力）</option>
        </select>
        ${unlocked ? '' : `<h3>🔒 金額を入れるときは暗証番号</h3>${pinRowHTML('cs')}`}
      </div>

      <h3>説明に使ったもの</h3>${multiHTML('tools', TOOLS, c.tools)}
      <h3>決め手・見送りの理由</h3>${multiHTML('reasons', REASONS, c.reasons)}
      <h3>自分の説明の手ごたえ</h3>${choicesHTML('score', ['1', '2', '3', '4', '5'].map((x) => [x, x]), c.score)}
      <label class="field"><span class="row" style="justify-content:space-between">ふりかえり（うまくいった点・次に変えること） ${voiceBtn('c-note')}</span>
        <textarea id="c-note">${esc(c.note)}</textarea></label>
      <div class="row"><button class="btn grow" id="c-save">保存</button>${existing ? '<button class="btn ghost" id="c-del">削除</button>' : ''}</div>`);

    const sync = () => {
      c.date = $('#c-date', sheet).value || c.date;
      c.age = picked(sheet, 'age');
      c.sex = picked(sheet, 'sex');
      c.patient = picked(sheet, 'patient');
      c.source = picked(sheet, 'source');
      c.complaint = $('#c-comp', sheet).value;
      c.items.forEach((it, i) => (it.status = picked(sheet, 'st' + i) || 'pending'));
      $$('[data-amt]', sheet).forEach((inp) => (amounts[inp.dataset.amt] = inp.value === '' ? '' : Number(inp.value)));
      c.tools = readMulti(sheet, 'tools');
      c.reasons = readMulti(sheet, 'reasons');
      c.score = picked(sheet, 'score');
      c.note = $('#c-note', sheet).value;
    };
    const redraw = () => {
      sync();
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    };

    ['age', 'sex', 'patient', 'source', 'score', ...c.items.map((_, i) => 'st' + i)].forEach((n) => bindChoices(sheet, n, () => {}));
    $('#c-add', sheet).onchange = (e) => {
      let tid = e.target.value;
      if (!tid) return;
      if (tid === '__new') {
        const name = (prompt('治療の名前（メニューにも追加されます）') || '').trim();
        if (!name) return (e.target.value = '');
        tid = uid();
        S.treatments.push({ id: tid, name });
        save('treatments');
      }
      sync();
      c.items.push({ id: uid(), tid, name: S.treatments.find((t) => t.id === tid).name, status: 'pending' });
      redraw();
    };
    $$('[data-rmit]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          sync();
          const [it] = c.items.splice(Number(b.dataset.rmit), 1);
          delete amounts[it.id];
          redraw();
        })
    );
    bindPinRow(sheet, async () => {
      if (existing?.enc) {
        try {
          amounts = { ...(await decJSON(existing.enc)), ...Object.fromEntries(Object.entries(amounts).filter(([, y]) => y !== '')) };
        } catch {}
      }
      redraw();
    }, 'cs');
    $('#c-save', sheet).onclick = async () => {
      sync();
      if (!c.items.length) return toast('提案した治療を1つ以上選んでください');
      const hasAmount = Object.values(amounts).some((y) => y !== '' && y != null);
      if (secretKey) {
        const clean = Object.fromEntries(c.items.map((it) => [it.id, amounts[it.id]]).filter(([, y]) => y !== '' && y != null));
        c.enc = Object.keys(clean).length ? await encJSON(clean) : null;
      } else if (hasAmount) {
        return toast('鍵がかかりました。暗証番号を入れ直してから保存してください');
      } else if (!keepOldEnc()) {
        c.enc = null;
      }
      if (existing && c.items.some((i) => i.status === 'pending') && existing.items.some((i) => i.status !== 'pending')) c.followAt = null;
      const i = S.consults.findIndex((x) => x.id === c.id);
      if (i >= 0) S.consults[i] = c;
      else S.consults.push(c);
      await save('consults');
      closeSheet();
      toast(existing ? '直しました' : 'おつかれさまでした。記録しました');
      render();
    };
    $('#c-del', sheet)?.addEventListener('click', () => {
      if (!confirm('この相談の記録を消しますか？')) return;
      S.consults = S.consults.filter((x) => x.id !== c.id);
      save('consults');
      closeSheet();
      render();
    });
  };
  draw();
}

function openTreatmentMenu() {
  const sheet = openSheet('治療メニュー', `
    <p class="muted">名前を直すと、これまでの記録の表示も変わります。消しても、これまでの記録は残ります。</p>
    <div class="card" id="tm-list">
      ${S.treatments
        .map(
          (t) => `<div class="row" style="margin:6px 0"><input type="text" class="grow" data-tm="${t.id}" value="${esc(t.name)}">
          <button type="button" class="btn ghost sm" data-up="${t.id}">↑</button><button type="button" class="btn ghost sm" data-tmdel="${t.id}">✕</button></div>`
        )
        .join('')}
    </div>
    <div class="row"><input type="text" id="tm-new" class="grow" placeholder="新しい治療の名前"><button class="btn sub sm" id="tm-add">追加</button></div>
    <button class="btn wide" id="tm-save" style="margin-top:12px">保存</button>`);
  const syncNames = () =>
    $$('[data-tm]', sheet).forEach((inp) => {
      const t = S.treatments.find((x) => x.id === inp.dataset.tm);
      if (t && inp.value.trim()) t.name = inp.value.trim();
    });
  sheet.addEventListener('click', (e) => {
    const up = e.target.dataset.up;
    const del = e.target.dataset.tmdel;
    if (!up && !del) return;
    syncNames();
    const i = S.treatments.findIndex((x) => x.id === (up || del));
    if (del) {
      if (!confirm(`「${S.treatments[i].name}」をメニューから消しますか？`)) return;
      S.treatments.splice(i, 1);
    } else if (i > 0) {
      [S.treatments[i - 1], S.treatments[i]] = [S.treatments[i], S.treatments[i - 1]];
    }
    save('treatments');
    openTreatmentMenu();
  });
  $('#tm-add', sheet).onclick = () => {
    const name = $('#tm-new', sheet).value.trim();
    if (!name) return;
    syncNames();
    S.treatments.push({ id: uid(), name });
    save('treatments');
    openTreatmentMenu();
  };
  $('#tm-save', sheet).onclick = () => {
    syncNames();
    save('treatments');
    closeSheet();
    toast('メニューを保存しました');
    render();
  };
}

/* ========== 仕事（相談・院内技工） ========== */
let workTab = 'consult';
function renderWork(v) {
  v.innerHTML = `<div class="subtabs">${choicesHTML('work', [['consult', '相談'], ['lab', '院内技工']], workTab)}</div><div id="work-body"></div>`;
  bindChoices(v, 'work', (x) => {
    workTab = x || workTab;
    render();
  });
  const body = $('#work-body', v);
  if (workTab === 'lab') renderLab(body);
  else renderConsult(body);
}

/* ========== 院内技工 ========== */
// 受注 → 着手 → 作業 → 完成 を記録して、ためている件数と日数を見えるようにする。患者さんの名前は入れない。
const LAB_LATE = 3; // 受注からこの日数たっても未着手なら「先送り」として目立たせる
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const labType = (j) => S.labTypes.find((t) => t.id === j.typeId);
const labTypeName = (j) => labType(j)?.name || j.typeName;
const labMinutes = (j) => (j.sessions || []).reduce((a, s) => a + (s.min || 0), 0);
function labState(j) {
  if (j.finished) return 'done';
  if (j.started) return 'doing';
  return 'waiting';
}
const labRunning = () => S.labs.find((j) => j.running);
function runningMin(j) {
  return Math.max(0, Math.round((Date.now() - j.running) / 60000));
}

function labStats(list) {
  const done = list.filter((j) => j.finished);
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);
  return {
    n: done.length,
    toStart: avg(done.map((j) => daysBetween(j.ordered, j.started))),
    toFinish: avg(done.map((j) => daysBetween(j.ordered, j.finished))),
    work: avg(done.map(labMinutes).filter(Boolean)),
    late: done.filter((j) => daysBetween(j.ordered, j.started) >= LAB_LATE).length,
  };
}

let labTimer = null;
function renderLab(v) {
  const t = today();
  const waiting = S.labs.filter((j) => labState(j) === 'waiting').sort((a, b) => (a.ordered < b.ordered ? -1 : 1));
  const doing = S.labs.filter((j) => labState(j) === 'doing').sort((a, b) => (a.ordered < b.ordered ? -1 : 1));
  const done = S.labs.filter((j) => j.finished).sort((a, b) => (a.finished < b.finished ? 1 : -1));
  const monthDone = done.filter((j) => monthKey(j.finished) === monthKey(t));
  const st = labStats(monthDone);
  const run = labRunning();
  const lateNow = waiting.filter((j) => daysBetween(j.ordered, t) >= LAB_LATE).length;

  const jobRow = (j) => {
    const age = daysBetween(j.ordered, t);
    const stepsDone = j.steps.filter((s) => s.done).length;
    const due = j.due ? `・使う日 ${jpDate(j.due)}${j.due < t ? '（過ぎています）' : j.due === t ? '（今日）' : ''}` : '';
    let right;
    if (j.finished) right = `${daysBetween(j.ordered, j.finished)}日で完成`;
    else if (j.started) right = `${stepsDone}/${j.steps.length} 工程`;
    else right = `<span style="color:${age >= LAB_LATE ? 'var(--warn)' : 'inherit'};font-weight:700">受注から${age}日</span>`;
    const sub = j.finished
      ? `着手まで${daysBetween(j.ordered, j.started)}日・作業${minutesLabel(labMinutes(j))}`
      : `${jpDate(j.ordered)}受注${due}${labMinutes(j) ? `・作業${minutesLabel(labMinutes(j))}` : ''}`;
    return `<div class="list-item" data-job="${j.id}"><div class="row" style="justify-content:space-between"><b>${esc(labTypeName(j))}${j.mark ? ` <span class="muted">${esc(j.mark)}</span>` : ''}</b><span class="small">${right}</span></div>
      <div class="meta">${sub}</div></div>`;
  };

  v.innerHTML = `
    ${
      run
        ? `<div class="card good"><h2>作業中：${esc(labTypeName(run))} <span>${minutesLabel(runningMin(run))}</span></h2>
        <div class="row"><button class="btn grow" data-stop="${run.id}">止める</button><button class="btn sub" data-job="${run.id}">開く</button></div></div>`
        : ''
    }
    <div class="card">
      <h2>院内技工</h2>
      <div class="stats">
        <div class="stat"><div class="v" style="color:${lateNow ? 'var(--warn)' : 'inherit'}">${waiting.length}件</div><div class="l">未着手${lateNow ? `（うち${LAB_LATE}日以上 ${lateNow}件）` : ''}</div></div>
        <div class="stat"><div class="v">${doing.length}件</div><div class="l">作業中</div></div>
      </div>
      <button class="btn wide" data-new style="margin-top:10px">＋ 受注を記録する</button>
    </div>
    <div class="card"><h2>未着手 <span class="muted">古い順</span></h2>${waiting.map(jobRow).join('') || '<p class="muted">ためている技工はありません。すばらしい！</p>'}</div>
    ${doing.length ? `<div class="card"><h2>作業中</h2>${doing.map(jobRow).join('')}</div>` : ''}
    <div class="card">
      <h2>今月の完成 <span>${st.n}件</span></h2>
      <div class="stats">
        <div class="stat"><div class="v">${st.toStart ?? '-'}日</div><div class="l">受注から着手まで（平均）</div></div>
        <div class="stat"><div class="v">${st.toFinish ?? '-'}日</div><div class="l">受注から完成まで（平均）</div></div>
        <div class="stat"><div class="v">${st.work != null ? minutesLabel(Math.round(st.work)) : '-'}</div><div class="l">作業時間（平均）</div></div>
        <div class="stat"><div class="v">${st.late}件</div><div class="l">${LAB_LATE}日以上 先送りした</div></div>
      </div>
    </div>
    ${labTypeTable()}
    <div class="card"><h2>完成した技工 <button class="btn ghost sm" data-types>種類を編集</button></h2>${done.slice(0, 20).map(jobRow).join('') || '<p class="muted">まだありません。</p>'}</div>`;

  $('[data-new]', v).onclick = () => openLabJob(null);
  $('[data-types]', v).onclick = openLabTypes;
  $$('[data-job]', v).forEach((el) => (el.onclick = () => openLabJob(el.dataset.job)));
  $$('[data-stop]', v).forEach((el) =>
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      stopLabTimer(S.labs.find((j) => j.id === el.dataset.stop));
      render();
    })
  );
  // 計測中は1分ごとに表示を進める
  clearInterval(labTimer);
  if (run)
    labTimer = setInterval(() => {
      if (tab === 'consult' && workTab === 'lab' && !$('.sheet-bg')) render();
      else if (!labRunning()) clearInterval(labTimer);
    }, 60000);
}

// 種類ごとの平均（これまでの完成分すべて）
function labTypeTable() {
  const rows = S.labTypes
    .map((t) => [t.name, labStats(S.labs.filter((j) => j.finished && j.typeId === t.id))])
    .filter(([, s]) => s.n);
  if (!rows.length) return '';
  const td = 'style="text-align:center;padding:4px 2px"';
  return `<div class="card"><h2>種類ごと（これまで）</h2>
    <table style="width:100%;font-size:13px;border-collapse:collapse">
      <tr class="muted"><td></td><td ${td}>件数</td><td ${td}>着手まで</td><td ${td}>作業</td><td ${td}>完成まで</td></tr>
      ${rows
        .map(
          ([n, s]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:6px 0">${esc(n)}</td><td ${td}>${s.n}</td><td ${td}>${s.toStart}日</td><td ${td}>${s.work != null ? minutesLabel(Math.round(s.work)) : '-'}</td><td ${td}>${s.toFinish}日</td></tr>`
        )
        .join('')}
    </table></div>`;
}

function markStarted(j, date) {
  if (!j.started || date < j.started) j.started = date;
}
function startLabTimer(j) {
  const other = labRunning();
  if (other && other.id !== j.id) stopLabTimer(other);
  j.running = Date.now();
  markStarted(j, today());
  save('labs');
}
function stopLabTimer(j) {
  if (!j?.running) return;
  const min = Math.max(1, runningMin(j));
  j.sessions = j.sessions || [];
  j.sessions.push({ date: ymd(new Date(j.running)), min });
  j.running = null;
  save('labs');
  toast(`${minutesLabel(min)}作業しました`);
}

function openLabJob(id) {
  const existing = id ? S.labs.find((j) => j.id === id) : null;
  if (!existing && !S.labTypes.length) return toast('先に技工の種類を登録してください');
  const j = existing || { id: uid(), created: Date.now(), typeId: S.labTypes[0].id, typeName: S.labTypes[0].name, ordered: today(), due: '', mark: '', note: '', steps: S.labTypes[0].steps.map((name) => ({ name, done: false })), sessions: [], started: null, finished: null, running: null };
  const isNew = !existing;

  const draw = () => {
    const t = today();
    const sheet = openSheet(isNew ? '受注を記録' : esc(labTypeName(j)), `
      <h3>種類</h3>${choicesHTML('ltype', S.labTypes.map((x) => [x.id, x.name]), j.typeId)}
      <div class="row">
        <label class="field grow"><span>受注日</span><input type="date" id="l-ord" value="${j.ordered}"></label>
        <label class="field grow"><span>使う日（装着・手術など。任意）</span><input type="date" id="l-due" value="${esc(j.due || '')}"></label>
      </div>
      <label class="field"><span>目印（部位やカルテ番号の下2けたなど。名前は入れない）</span><input type="text" id="l-mark" value="${esc(j.mark)}"></label>
      ${
        isNew
          ? ''
          : `<div class="card">
        <h2>作業時間 <span>${minutesLabel(labMinutes(j) + (j.running ? runningMin(j) : 0))}</span></h2>
        ${
          j.running
            ? `<p class="small">計測中（${minutesLabel(runningMin(j))}）。アプリを閉じても計測は続きます。</p><button class="btn warn wide" id="l-stop">止める</button>`
            : `<button class="btn wide" id="l-start">▶ 作業を始める（時間を計る）</button>`
        }
        <div class="row" style="margin-top:8px"><span class="small">計り忘れたとき：</span>${[10, 15, 30, 60].map((m) => `<button type="button" class="btn ghost sm" data-addmin="${m}">＋${m}分</button>`).join('')}</div>
        ${(j.sessions || []).length ? `<p class="muted" style="margin:6px 0 0">${j.sessions.map((s) => `${jpDate(s.date)} ${s.min}分`).join('、')}</p>` : ''}
      </div>
      <div class="card"><h2>工程</h2>
        ${j.steps.map((s, i) => `<label class="check"><input type="checkbox" data-step="${i}" ${s.done ? 'checked' : ''}> ${esc(s.name)}${s.doneAt ? ` <span class="muted">${jpDate(s.doneAt)}</span>` : ''}</label>`).join('')}
      </div>
      <p class="small">${
        j.finished
          ? `受注から着手まで${daysBetween(j.ordered, j.started)}日、完成まで${daysBetween(j.ordered, j.finished)}日でした。`
          : j.started
            ? `${jpDate(j.started)}に着手（受注から${daysBetween(j.ordered, j.started)}日）`
            : `受注から${daysBetween(j.ordered, t)}日、まだ着手していません。`
      }</p>`
      }
      <label class="field"><span class="row" style="justify-content:space-between">メモ ${voiceBtn('l-note')}</span><textarea id="l-note">${esc(j.note)}</textarea></label>
      <div class="row">
        <button class="btn grow" id="l-save">${isNew ? '記録' : '保存'}</button>
        ${isNew ? '' : j.finished ? '<button class="btn sub" id="l-reopen">完成を取り消す</button>' : '<button class="btn sub" id="l-done">完成！</button>'}
        ${isNew ? '' : '<button class="btn ghost" id="l-del">削除</button>'}
      </div>`);

    const sync = () => {
      const tid = picked(sheet, 'ltype') || j.typeId;
      if (tid !== j.typeId && !j.steps.some((s) => s.done)) {
        const tp = S.labTypes.find((x) => x.id === tid);
        j.steps = tp.steps.map((name) => ({ name, done: false }));
      }
      j.typeId = tid;
      j.typeName = S.labTypes.find((x) => x.id === tid)?.name || j.typeName;
      j.ordered = $('#l-ord', sheet).value || j.ordered;
      j.due = $('#l-due', sheet).value;
      j.mark = $('#l-mark', sheet).value;
      j.note = $('#l-note', sheet).value;
    };
    const commit = () => {
      sync();
      if (!S.labs.includes(j)) S.labs.push(j);
      save('labs');
    };
    const redraw = () => {
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    };
    bindChoices(sheet, 'ltype', () => {});
    $('#l-start', sheet)?.addEventListener('click', () => {
      commit();
      startLabTimer(j);
      closeSheet();
      toast('計測を始めました。終わったら「止める」を押してください');
      render();
    });
    $('#l-stop', sheet)?.addEventListener('click', () => {
      commit();
      stopLabTimer(j);
      redraw();
    });
    $$('[data-addmin]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          commit();
          j.sessions.push({ date: today(), min: Number(b.dataset.addmin) });
          markStarted(j, today());
          save('labs');
          redraw();
        })
    );
    $$('[data-step]', sheet).forEach((c) =>
      c.addEventListener('change', () => {
        commit();
        const s = j.steps[Number(c.dataset.step)];
        s.done = c.checked;
        s.doneAt = c.checked ? today() : null;
        if (c.checked) markStarted(j, today());
        if (j.steps.every((x) => x.done) && !j.finished) {
          finishJob(j);
          return;
        }
        save('labs');
        redraw();
      })
    );
    $('#l-save', sheet).onclick = () => {
      commit();
      closeSheet();
      toast(isNew ? '受注を記録しました。早めに着手しましょう' : '保存しました');
      render();
    };
    $('#l-done', sheet)?.addEventListener('click', () => {
      commit();
      finishJob(j);
    });
    $('#l-reopen', sheet)?.addEventListener('click', () => {
      commit();
      j.finished = null;
      save('labs');
      redraw();
    });
    $('#l-del', sheet)?.addEventListener('click', () => {
      if (!confirm('この技工の記録を消しますか？')) return;
      S.labs = S.labs.filter((x) => x.id !== j.id);
      save('labs');
      closeSheet();
      render();
    });
  };
  draw();
}

function finishJob(j) {
  if (j.running) stopLabTimer(j);
  const t = today();
  j.steps.forEach((s) => {
    if (!s.done) {
      s.done = true;
      s.doneAt = t;
    }
  });
  markStarted(j, t);
  j.finished = t;
  save('labs');
  closeSheet();
  const d = daysBetween(j.ordered, j.finished);
  toast(d <= 1 ? `受注から${d}日で完成！すばやいです` : `完成！受注から${d}日でした`);
  render();
}

function openLabTypes() {
  const sheet = openSheet('技工の種類', `
    <p class="muted">工程は「、」で区切って入れます。例：設計、プリント、仕上げ</p>
    ${S.labTypes
      .map(
        (t) => `<div class="card" style="padding:10px">
        <div class="row"><input type="text" class="grow" data-tn="${t.id}" value="${esc(t.name)}"><button type="button" class="btn ghost sm" data-tdel="${t.id}">✕</button></div>
        <input type="text" data-ts="${t.id}" value="${esc(t.steps.join('、'))}" style="margin-top:6px"></div>`
      )
      .join('')}
    <div class="card" style="padding:10px"><input type="text" id="tn-new" placeholder="新しい種類の名前"><input type="text" id="ts-new" placeholder="工程（例：設計、プリント、仕上げ）" style="margin-top:6px"></div>
    <button class="btn wide" id="t-save">保存</button>
    <p class="muted">これまでの記録の工程は変わりません。</p>`);
  const splitSteps = (s) => s.split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean);
  const syncAll = () => {
    S.labTypes.forEach((t) => {
      const n = $(`[data-tn="${t.id}"]`, sheet)?.value.trim();
      const st = splitSteps($(`[data-ts="${t.id}"]`, sheet)?.value || '');
      if (n) t.name = n;
      if (st.length) t.steps = st;
    });
    const nn = $('#tn-new', sheet).value.trim();
    if (nn) S.labTypes.push({ id: uid(), name: nn, steps: splitSteps($('#ts-new', sheet).value).length ? splitSteps($('#ts-new', sheet).value) : ['作業'] });
  };
  $$('[data-tdel]', sheet).forEach(
    (b) =>
      (b.onclick = () => {
        const t = S.labTypes.find((x) => x.id === b.dataset.tdel);
        if (!confirm(`「${t.name}」を消しますか？（これまでの記録は残ります）`)) return;
        syncAll();
        S.labTypes = S.labTypes.filter((x) => x.id !== t.id);
        save('labTypes');
        openLabTypes();
      })
  );
  $('#t-save', sheet).onclick = () => {
    syncAll();
    save('labTypes');
    closeSheet();
    toast('保存しました');
    render();
  };
}

/* ========== ホーム画面に追加 ========== */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  toast('ホーム画面に追加しました');
  render();
});
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

async function doInstall() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  const sheet = openSheet('ホーム画面に追加', `
    <p class="small">準備に少し時間がかかることがあります。30秒ほど待ってから、もう一度このボタンを押してください。</p>
    <p class="small">それでも出ないときは、この画面をスクリーンショットで送ってください。原因を調べます。</p>
    <div class="card" id="diag"><p class="muted">確認しています…</p></div>
    <button class="btn wide" data-close>閉じる</button>`);
  const ok = (b) => (b ? '○' : '×');
  let manifest = false;
  try {
    const m = await (await fetch('manifest.webmanifest', { cache: 'no-store' })).json();
    manifest = !!m.name;
  } catch {}
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  const ua = navigator.userAgent;
  const chrome = (ua.match(/Chrome\/(\d+)/) || [])[1] || '不明';
  $('#diag', sheet).innerHTML = `
    <div class="small">Chromeの版：${esc(chrome)}</div>
    <div class="small">設定ファイル：${ok(manifest)}</div>
    <div class="small">電波なしで開く準備：${ok(reg)}${reg ? (navigator.serviceWorker.controller ? '' : '（再読み込みで完了）') : ''}</div>
    <div class="small">追加の合図：${ok(installPrompt)}</div>
    <div class="small">表示の形：${isInstalled() ? 'アプリ' : 'ブラウザ'}</div>
    <div class="muted" style="word-break:break-all;margin-top:6px">${esc(ua)}</div>`;
}

/* ========== 起動 ========== */
(async function start() {
  db = await openDB();
  for (const k of KEYS) {
    const val = await dbGet(k);
    S[k] = val === undefined ? structuredClone(DEFAULTS[k]) : val;
  }
  if (!S.settings.firstUse) {
    S.settings.firstUse = new Date().toISOString();
    save('settings');
  }
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  render();
})();
