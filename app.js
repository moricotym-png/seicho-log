'use strict';
const APP_VERSION = 32; // sw.js の CACHE の番号とそろえる
// 成長ログ（第1段階）
// 記録はすべてこのスマホの中（IndexedDB）に保存する。外には送らない。

/* ---------- 保存（IndexedDB） ---------- */
const DB_NAME = 'seicho-log';
const KEYS = ['days', 'drinks', 'workouts', 'cardio', 'body', 'books', 'readLogs', 'engLogs', 'words', 'readQs', 'consults', 'treatments', 'labs', 'labTypes', 'cases', 'notes', 'noteCats', 'chores', 'papers', 'secret', 'settings'];
let db;
const S = {};

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
    };
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
  cardio: [],
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
  readQs: [],
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
  cases: [],
  notes: [],
  chores: [],
  papers: [],
  noteCats: ['破折器具の除去', 'スクリュー破折・緩み', 'ブラケット・装置の脱離', '補綴物の破損・脱離', '外科のトラブル', '材料・器具', '患者さんへの説明', 'その他'],
  secret: null,
  settings: { lastBackup: null, clinicDays: [1, 2, 3, 4, 5, 6] },
};

/* ---------- 定義 ---------- */
const DRINK_TYPES = ['ビール', 'ハイボール', 'レモンサワー', '日本酒', '焼酎', 'ワイン', 'その他'];
const MARKS = ['◎', '○', '△', '×'];
const AMOUNTS = ['ちょうどいい', '少し多い', '多すぎ'];
const DAWDLE = [['none', 'なし'], ['some', '少し'], ['lots', '多い']];
const SAVINGS = [['conbini', 'コンビニに行かなかった'], ['bottle', '水筒を持っていった'], ['bento', 'お弁当にした']];
const TEMPLATES = {
  sun: { name: '日曜 ジム（＋Push）', place: 'gym', exercises: ['スクワット', 'ベンチプレス', 'オーバーヘッドプレス', 'インクラインベンチプレス', 'ディップス'] },
  tue: { name: '火曜 パーソナル（＋Pull）', place: 'gym', exercises: ['スクワット', 'ベンチプレス', 'デッドリフト', '懸垂', 'ラットプルダウン', 'アームカール'] },
  free: { name: 'ジム（自由）', place: 'gym', exercises: [] },
  cpush: { name: 'クリニック Push', place: 'clinic', ppl: 'push', exercises: ['ショルダープレス', 'サイドレイズ', '腕立て伏せ', 'フレンチプレス'] },
  cpull: { name: 'クリニック Pull', place: 'clinic', ppl: 'pull', exercises: ['斜め懸垂', 'ダンベルロウ', 'リアレイズ', 'ダンベルカール'] },
  clegs: { name: 'クリニック Legs', place: 'clinic', ppl: 'legs', exercises: ['ブルガリアンスクワット', 'ルーマニアンデッドリフト', 'カーフレイズ', 'アブローラー'] },
};
const PPL = [['push', 'Push', '胸・肩・三頭'], ['pull', 'Pull', '背中・二頭'], ['legs', 'Legs', '脚・お尻']];
// 種目 → Push / Pull / Legs（腹筋などはどれにも入れない）
const EX_PPL = {
  ベンチプレス: 'push', インクラインベンチプレス: 'push', ダンベルプレス: 'push', 腕立て伏せ: 'push', 加重腕立て: 'push', ディップス: 'push',
  オーバーヘッドプレス: 'push', ショルダープレス: 'push', サイドレイズ: 'push', フレンチプレス: 'push',
  懸垂: 'pull', 斜め懸垂: 'pull', ラットプルダウン: 'pull', ダンベルロウ: 'pull', リアレイズ: 'pull', アームカール: 'pull', ダンベルカール: 'pull', デッドリフト: 'pull',
  スクワット: 'legs', ブルガリアンスクワット: 'legs', レッグプレス: 'legs', ルーマニアンデッドリフト: 'legs', カーフレイズ: 'legs',
};
function pplOf(name) {
  if (EX_PPL[name]) return EX_PPL[name];
  const p = partsOf(name)[0];
  return { 胸: 'push', 肩: 'push', 背中: 'pull', 脚: 'legs' }[p] || null;
}
// その週の Push / Pull / Legs のセット数
function weekPPL(ws) {
  const out = { push: 0, pull: 0, legs: 0 };
  for (const w of weekWorkouts(ws)) for (const e of w.exercises) {
    const k = pplOf(e.name);
    if (k) out[k] += e.sets.filter((s) => s.reps).length;
  }
  return out;
}
// クリニックの日のおすすめ：その週にいちばん少ないもの
function clinicPick(ws) {
  const c = weekPPL(ws);
  return ['pull', 'push', 'legs'].sort((a, b) => c[a] - c[b])[0];
}
// 週に何回やりたいか（ジムの高重量のメイン種目）
const LIFT_GOALS = [
  ['ベンチプレス', 2],
  ['スクワット', 2],
  ['デッドリフト', 1],
];
const placeOf = (w) => (w.tpl === 'clinic' ? 'clinic' : TEMPLATES[w.tpl]?.place || 'gym'); // 'clinic' は以前のメニュー
// その週に、その種目を1セット以上やった日数
function liftDays(ws, name) {
  return new Set(weekWorkouts(ws).filter((w) => w.exercises.some((e) => e.name === name && e.sets.some((s) => s.reps))).map((w) => w.date)).size;
}
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

function toast(msg, ms = msg.includes('🏆') ? 4500 : 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
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
    // 閉じたら下の画面も最新にする（計測の開始・一時停止などを反映）
    if (e.target === bg || e.target.closest('[data-close]')) {
      closeSheet();
      render();
    }
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
    if (run) notices.push(runningCardHTML(run));
    const waiting = S.labs.filter((j) => labState(j) === 'waiting');
    if (waiting.length) {
      const oldest = Math.max(...waiting.map((j) => daysBetween(j.ordered, today())));
      notices.push(`<div class="card${oldest >= LAB_LATE ? ' notice' : ''}"><h2>未着手の技工 ${waiting.length}件</h2>
        <p class="small">いちばん古いものは受注から${oldest}日です。${oldest >= LAB_LATE ? 'まず1件だけ、手をつけてみましょう。' : ''}</p>
        <button class="btn sub" data-golab>技工を見る</button></div>`);
    }
    const dueN = dueWords().length;
    if (dueN) {
      notices.push(`<div class="card good"><h2>今日の言葉の復習 ${dueN}語</h2>
        <button class="btn" data-wquiz>復習クイズを始める</button></div>`);
    }
    const late = chartPending();
    if (late.length) {
      notices.push(`<div class="card notice"><h2>書き終えていないカルテ ${late.length}日分</h2>
        ${late
          .map(
            (d) => `<div class="row" style="justify-content:space-between;padding:4px 0"><span>${jpDate(d)} <b style="color:var(--warn)">${daysBetween(d, today())}日たっています</b></span>
            <span class="row" style="gap:6px"><button class="btn sm" data-chartdone="${d}">書き終えた</button><button class="btn ghost sm" data-chartoff="${d}">休診</button></span></div>`
          )
          .join('')}</div>`);
    }
    for (const pa of paperTryAsks()) {
      notices.push(`<div class="card"><h2>臨床で試しましたか？</h2>
        <p class="small">${jpDate(pa.readOn)}に読んだ「${esc(pa.title.slice(0, 40))}」に「臨床にすぐ活かせる」を付けていました。</p>
        <div class="row"><button class="btn" data-tried="${pa.id}">試した</button><button class="btn ghost" data-trylater="${pa.id}">まだ（1週間後にまた聞く）</button></div></div>`);
    }
    for (const c of choreOpen().filter((x) => choreActive(x) && x.due !== today())) {
      notices.push(`<div class="card"><h2>${esc(c.title)}の期間です</h2>
        <p class="small">${jpDate(c.due)}までに終えましょう（あと${daysBetween(today(), c.due)}日）。</p>
        <div class="row"><button class="btn" data-chnow="${c.id}">終えた</button><button class="btn ghost" data-gochores>雑務を見る</button></div></div>`);
    }
    const chDue = choreOpen().filter((c) => c.due && c.due <= today());
    if (chDue.length) {
      const worst = Math.max(...chDue.map((c) => daysBetween(c.due, today())));
      notices.push(`<div class="card${worst > 0 ? ' notice' : ''}"><h2>期限の雑務 ${chDue.length}件</h2>
        <p class="small">${esc(chDue.slice(0, 3).map((c) => c.title).join('、'))}${chDue.length > 3 ? ' など' : ''}${worst > 0 ? `（いちばん古いものは期限から${worst}日）` : ''}</p>
        <button class="btn sub" data-gochores>雑務を見る</button></div>`);
    }
    for (const k of caseFollowUps()) {
      notices.push(`<div class="card"><h2>経過を見る日：${esc(k.area)}${k.mark ? ` ${esc(k.mark)}` : ''}</h2>
        <p class="small">${jpDate(k.date)}の症例です。${esc(k.procedure || '')}</p>
        <button class="btn sub" data-case="${k.id}">経過を追記する</button></div>`);
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

    ${chartCardHTML(date)}

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
  bindRunningCard(v);
  $('[data-wquiz]', v)?.addEventListener('click', openQuizMenu);
  $$('[data-chartdone]', v).forEach((b) => b.addEventListener('click', () => setChart(b.dataset.chartdone, 'done')));
  $$('[data-chartoff]', v).forEach((b) => b.addEventListener('click', () => setChart(b.dataset.chartoff, 'off')));
  $$('[data-chartundo]', v).forEach((b) => b.addEventListener('click', () => setChart(b.dataset.chartundo, 'undo')));
  $$('[data-charton]', v).forEach((b) => b.addEventListener('click', () => setChart(b.dataset.charton, 'on')));
  $('[data-golab]', v)?.addEventListener('click', () => {
    workTab = 'lab';
    $('.tabs [data-tab="consult"]').click();
  });
  $$('[data-case]', v).forEach((b) => b.addEventListener('click', () => openCase(b.dataset.case)));
  $$('[data-tried]', v).forEach((b) =>
    b.addEventListener('click', () => {
      const pa = S.papers.find((x) => x.id === b.dataset.tried);
      pa.tried = today();
      save('papers');
      toast('すばらしい！結果は文献のコメントに書き足しておきましょう', 4000);
      workTab = 'papers';
      $('.tabs [data-tab="consult"]').click();
      openPaper(pa.id);
    })
  );
  $$('[data-trylater]', v).forEach((b) =>
    b.addEventListener('click', () => {
      const pa = S.papers.find((x) => x.id === b.dataset.trylater);
      pa.askOn = addDays(today(), 7);
      save('papers');
      render();
    })
  );
  $$('[data-chnow]', v).forEach((b) => b.addEventListener('click', () => completeChore(S.chores.find((c) => c.id === b.dataset.chnow))));
  $$('[data-gochores]', v).forEach((b) =>
    b.addEventListener('click', () => {
      workTab = 'chores';
      $('.tabs [data-tab="consult"]').click();
    })
  );
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

/* ---------- カルテ ---------- */
// 診療した日に、その日のうちにカルテを書き終えたか。遅れたら何日後だったかを残す。
function isClinicDay(date) {
  const d = S.days[date];
  if (d?.chartOff) return false;
  if (d?.chartOn) return true;
  return (S.settings.clinicDays || []).includes(parseYmd(date).getDay());
}
const chartDelay = (date) => (S.days[date]?.chartDone ? daysBetween(date, S.days[date].chartDone) : null);
// 書き終えていない診療日（カルテのチェックを使い始めた日以降、直近14日）
function chartPending() {
  const t = today();
  const from = [addDays(t, -14), S.settings.chartFrom || t].sort().pop();
  const out = [];
  for (let d = from; d < t; d = addDays(d, 1)) if (isClinicDay(d) && !S.days[d]?.chartDone) out.push(d);
  return out;
}
function setChart(date, action) {
  const d = day(date);
  if (action === 'done') d.chartDone = today();
  if (action === 'undo') delete d.chartDone;
  if (action === 'off') {
    d.chartOff = true;
    delete d.chartOn;
  }
  if (action === 'on') {
    d.chartOn = true;
    delete d.chartOff;
  }
  save('days');
  if (action === 'done') {
    const n = chartDelay(date);
    toast(n === 0 ? 'その日のうちに書き終えました！' : `${jpDate(date)}のカルテ、${n}日後に書き終えました`);
  }
  render();
}
function chartCardHTML(date) {
  if (date > today()) return '';
  const d = S.days[date] || {};
  if (!isClinicDay(date)) {
    return `<div class="card"><h2>🗂 カルテ <span class="muted small">休診日</span></h2>
      <button class="btn ghost sm" data-charton="${date}">この日は診療した</button></div>`;
  }
  if (d.chartDone) {
    const n = chartDelay(date);
    return `<div class="card${n === 0 ? ' good' : ''}"><h2>🗂 カルテ <span>${n === 0 ? '当日に書き終えた ✓' : `${n}日後に書き終えた`}</span></h2>
      <button class="btn ghost sm" data-chartundo="${date}">取り消す</button></div>`;
  }
  const n = daysBetween(date, today());
  return `<div class="card"><h2>🗂 カルテ ${n ? `<span style="color:var(--warn)">${n}日たっています</span>` : ''}</h2>
    <div class="row"><button class="btn grow" data-chartdone="${date}">この日のカルテを書き終えた</button><button class="btn ghost sm" data-chartoff="${date}">休診日</button></div></div>`;
}
function chartWeekStatHTML(days) {
  const t = today();
  const clinic = days.filter((d) => d <= t && isClinicDay(d));
  if (!clinic.length) return '';
  const same = clinic.filter((d) => chartDelay(d) === 0).length;
  const lateDays = clinic.map(chartDelay).filter((n) => n > 0);
  const open = clinic.filter((d) => d < t && !S.days[d]?.chartDone).length;
  const avg = lateDays.length ? Math.round((lateDays.reduce((a, b) => a + b, 0) / lateDays.length) * 10) / 10 : null;
  return `<div class="stat"><div class="v">${same}/${clinic.length}日</div><div class="l">カルテを当日に書けた</div></div>
    <div class="stat"><div class="v">${lateDays.length}日${open ? `＋未${open}` : ''}</div><div class="l">遅れた日${avg != null ? `（平均${avg}日後）` : ''}</div></div>`;
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
  const cd = S.cardio.filter((c) => c.date === date);
  if (cd.length) items.push(`有酸素 ${cd.reduce((a, c) => a + c.min, 0)}分`);
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
  const ws = weekStart(t);
  const n = weekWorkouts(ws).length;
  const nGym = weekWorkouts(ws).filter((w) => placeOf(w) === 'gym').length;
  const nClinic = n - nGym;
  const pick = clinicPick(ws);
  const ppl = weekPPL(ws);
  const tplBtns = (place) =>
    Object.entries(TEMPLATES)
      .filter(([, t2]) => t2.place === place)
      .map(([k, t2]) => `<button class="btn ${t2.ppl === pick ? '' : 'sub '}grow" data-tpl="${k}">${t2.name}${t2.ppl === pick ? ' ★' : ''}</button>`)
      .join('');
  const sorted = [...S.workouts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created));
  const lastBody = [...S.body].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  const msg = n >= 5 ? '最高の週です！' : n >= 3 ? 'いいペースです' : n >= 2 ? '今週は合格ライン達成' : `あと${2 - n}回で合格ライン`;

  v.innerHTML = `
    <div class="card">
      <h2>今週のメイン種目</h2>
      ${LIFT_GOALS.map(([name, goal]) => {
        const d = liftDays(ws, name);
        return `<div class="row" style="justify-content:space-between;padding:4px 0"><span>${name}</span>
          <span>${[...Array(goal)].map((_, i) => (i < d ? '●' : '○')).join(' ')} <b style="color:${d >= goal ? 'var(--accent)' : 'inherit'}">${d}/${goal}${d >= goal ? ' ✓' : ''}</b></span></div>`;
      }).join('')}
      <h3>今週の Push / Pull / Legs（セット数）</h3>
      <div class="stats" style="grid-template-columns:repeat(3,1fr)">${PPL.map(([k, l, d]) => `<div class="stat"><div class="v">${ppl[k]}</div><div class="l">${l}（${d}）</div></div>`).join('')}</div>
    </div>
    <div class="card">
      <h2>今週の筋トレ <span>${n}回</span></h2>
      <p class="small" style="margin:0 0 4px">🏋️ ジム ${nGym}回 ・ 🏥 クリニック ${nClinic}回</p>
      <div class="meter"><i style="width:${Math.min(100, (n / 5) * 100)}%"></i></div>
      <div class="meter-marks"><span>0</span><span>2 合格</span><span>3 良い</span><span>5 最高</span></div>
      <p class="small" style="margin:8px 0 0">${msg}</p>
    </div>
    ${cardioWeekHTML(ws)}
    ${balanceHTML()}
    <div class="card">
      <h2>トレーニングを始める</h2>
      <h3>🏋️ ジム（バーベル高重量・日曜90分／火曜60分）</h3>
      <div class="row">${tplBtns('gym')}</div>
      <h3>🏥 クリニック（ダンベル・30分）</h3>
      <div class="row">${tplBtns('clinic')}</div>
      <p class="muted" style="margin:6px 0 0">★ 今週いちばん少ない ${PPL.find((x) => x[0] === pick)[1]} がおすすめです。</p>
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
                  : `<div class="list-item" data-open="${w.id}"><div class="row" style="justify-content:space-between"><b>${jpDate(w.date)}</b><span>${placeOf(w) === 'clinic' ? '🏥' : '🏋️'} ${esc(w.name)}</span></div>
                     <div class="meta">${esc(w.exercises.filter((e) => e.sets.length).map((e) => `${e.name} ${bestSet(e)}`).join('、'))}</div></div>`
              )
              .join('')
          : '<p class="muted">まだ記録はありません。</p>'
      }
    </div>`;
  $$('[data-tpl]', v).forEach((b) => (b.onclick = () => openWorkout(null, b.dataset.tpl, t)));
  $('[data-skip]', v).onclick = () => openSkip(t);
  bindBalance(v);
  $('[data-cardio]', v).onclick = () => openCardio(null);
  $$('[data-cd]', v).forEach((el) => (el.onclick = () => openCardio(el.dataset.cd)));
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

// 自重で始める種目（記録するときに「自重」が最初から選ばれる）
const BW_DEFAULT = new Set(['懸垂', '斜め懸垂', 'ディップス', '腕立て伏せ', 'アブローラー']);
const RPE_LIST = ['6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'];
function setText(s) {
  const load = s.bw ? (s.kg ? `自重+${s.kg}kg` : '自重') : s.kg ? `${s.kg}kg` : '';
  return `${load ? `${load}×${s.reps || 0}` : `${s.reps || 0}回`}${s.rpe ? ` @${s.rpe}` : ''}${s.fail ? '🔥' : ''}`;
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
    .join('')}</div><button class="btn wide" data-cardio2 style="margin-top:10px">🏃 有酸素（ウォーキング・ジョギング）</button>`);
  $$('[data-tpl]', sheet).forEach((b) => (b.onclick = () => openWorkout(null, b.dataset.tpl, date)));
  $('[data-cardio2]', sheet).onclick = () => openCardio(null);
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
      <p class="muted">自重の種目は「自重」を押します。加重するときは、付けた重りの重さをkgに入れます。RPEは 10＝限界、9＝あと1回、8＝あと2回、7＝あと3回。出し切ったセットには🔥。</p>
      <div class="card" id="ex-list">
        ${w.exercises
          .map((e, ei) => {
            const prev = prevOf(e.name, w.id, w.date);
            return `<div class="exercise">
              <div class="row" style="justify-content:space-between"><b>${esc(e.name)}</b><button class="btn ghost sm" data-rmex="${ei}">外す</button></div>
              <div class="prev">${prev ? `前回 ${jpDate(prev.date)}：${prev.sets.map(setText).join(' / ')}` : '前回の記録なし'}</div>
              ${e.sets
                .map(
                  (s, si) => `<div class="set-box">
                  <div class="set-row"><span class="no">${si + 1}</span>
                    <button type="button" class="choice sm${s.bw ? ' on' : ''}" data-bw="${ei}-${si}">自重</button>
                    ${s.bw ? '<span class="small">＋</span>' : ''}<input class="num" type="number" inputmode="decimal" placeholder="${s.bw ? '0' : 'kg'}" value="${esc(s.kg ?? '')}" data-kg="${ei}-${si}"> kg ×
                    <input class="num" type="number" inputmode="numeric" placeholder="回" value="${esc(s.reps ?? '')}" data-reps="${ei}-${si}"> 回</div>
                  <div class="set-row" style="padding-left:28px">
                    <select class="rpe" data-rpe="${ei}-${si}"><option value="">RPE</option>${RPE_LIST.map((r) => `<option ${String(s.rpe) === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
                    <button type="button" class="choice sm${s.fail ? ' on' : ''}" data-fail="${ei}-${si}">🔥 出し切った</button>
                    <button class="btn ghost sm" data-rmset="${ei}-${si}" style="margin-left:auto">✕</button></div>
                  </div>`
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
        if (!w.exercises[ei]?.sets[si]) return;
        w.exercises[ei].sets[si].kg = i.value === '' ? '' : Number(i.value);
      });
      $$('[data-reps]', sheet).forEach((i) => {
        const [ei, si] = i.dataset.reps.split('-').map(Number);
        if (!w.exercises[ei]?.sets[si]) return;
        w.exercises[ei].sets[si].reps = i.value === '' ? '' : Number(i.value);
      });
      $$('[data-rpe]', sheet).forEach((i) => {
        const [ei, si] = i.dataset.rpe.split('-').map(Number);
        if (!w.exercises[ei]?.sets[si]) return;
        w.exercises[ei].sets[si].rpe = i.value === '' ? '' : Number(i.value);
      });
    };
    const scroll = sheet.scrollTop;
    // 画面の読み取りは、呼ぶ側が変更の前に済ませておく（消したあとに古い画面を読むと番号がずれる）
    const redraw = () => {
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
        const last = ex.sets[ex.sets.length - 1] || prevOf(ex.name, w.id, w.date)?.sets[0] || { kg: '', reps: '', bw: BW_DEFAULT.has(ex.name) };
        ex.sets.push({ kg: last.kg ?? '', reps: last.reps ?? '', bw: !!last.bw });
        redraw();
      } else if (t.dataset.bw || t.dataset.fail) {
        sync();
        const [ei, si] = (t.dataset.bw || t.dataset.fail).split('-').map(Number);
        const st = w.exercises[ei].sets[si];
        if (t.dataset.bw) st.bw = !st.bw;
        else st.fail = !st.fail;
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

/* ---------- 有酸素（ウォーキング・ジョギング） ---------- */
// 消費カロリーは「(METs − 1) × 体重kg × 時間」で、安静にしていた分を引いた“運動で増えた分”の目安。
// 脂肪の重さは「体脂肪1kg ≒ 7,200kcal」で換算した目安。
const CARDIO = [
  ['walk', 'ウォーキング', 3.5],
  ['brisk', '早歩き', 4.3],
  ['jog', 'ジョギング', 7.0],
  ['run', 'ランニング', 9.0],
];
function bodyWeight() {
  const last = [...S.body].filter((b) => b.weight).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return last?.weight || S.settings.weight || null;
}
const cardioKcal = (kind, min, kg) => Math.round((CARDIO.find((c) => c[0] === kind)[2] - 1) * kg * (min / 60));
const fatGrams = (kcal) => Math.round(kcal / 7.2);

function cardioWeekHTML(ws) {
  const list = S.cardio.filter((c) => c.date >= ws && c.date <= addDays(ws, 6));
  const min = list.reduce((a, c) => a + c.min, 0);
  const kcal = list.reduce((a, c) => a + (c.kcal || 0), 0);
  const recent = [...S.cardio].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created - a.created)).slice(0, 5);
  return `<div class="card">
    <h2>有酸素 <button class="btn sub sm" data-cardio>＋ 記録</button></h2>
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat"><div class="v">${minutesLabel(min)}</div><div class="l">今週の合計</div></div>
      <div class="stat"><div class="v">${kcal}</div><div class="l">kcal（目安）</div></div>
      <div class="stat"><div class="v">${fatGrams(kcal)}g</div><div class="l">脂肪に換算</div></div>
    </div>
    ${recent.map((c) => `<div class="list-item" data-cd="${c.id}"><div class="row" style="justify-content:space-between"><b>${jpDate(c.date)} ${esc(CARDIO.find((x) => x[0] === c.kind)?.[1] || '')} ${c.min}分</b><span class="small">${c.kcal}kcal・脂肪${fatGrams(c.kcal)}g</span></div>
      <div class="meta">${c.fasted ? '空腹時' : ''}${c.km ? `${c.fasted ? '・' : ''}${c.km}km` : ''}</div></div>`).join('')}
  </div>`;
}

function openCardio(id) {
  const existing = id ? S.cardio.find((c) => c.id === id) : null;
  const c = existing ? { ...existing } : { id: uid(), created: Date.now(), date: today(), kind: 'jog', min: 20, fasted: new Date().getHours() < 10, km: '' };
  const kg0 = bodyWeight();
  const sheet = openSheet(existing ? '有酸素' : '有酸素を記録', `
    <label class="field"><span>日付</span><input type="date" id="cd-date" value="${c.date}"></label>
    <h3>種類</h3>${choicesHTML('cdkind', CARDIO.map(([k, l]) => [k, l]), c.kind)}
    <h3>時間</h3>
    <div class="row">${choicesHTML('cdmin', [5, 10, 15, 20, 30, 45, 60].map((m) => [String(m), `${m}分`]), String(c.min))}
      <input type="number" inputmode="numeric" class="num" id="cd-min" value="${c.min}"> 分</div>
    <label class="check"><input type="checkbox" id="cd-fast" ${c.fasted ? 'checked' : ''}> 空腹時（朝食の前）</label>
    <div class="row">
      <label class="field grow"><span>距離（任意）</span><input type="number" inputmode="decimal" id="cd-km" value="${esc(c.km)}" placeholder="km"></label>
      <label class="field grow"><span>体重（計算用）</span><input type="number" inputmode="decimal" id="cd-kg" value="${esc(kg0 ?? '')}" placeholder="kg"></label>
    </div>
    <div class="card good" id="cd-est"></div>
    <div class="row"><button class="btn grow" id="cd-save">保存</button>${existing ? '<button class="btn ghost" id="cd-del">削除</button>' : ''}</div>
    <p class="muted">消費カロリーと脂肪の量は、運動の強さ（METs）と体重から出した目安です。</p>`);
  const est = () => {
    const kind = picked(sheet, 'cdkind') || c.kind;
    const min = Number($('#cd-min', sheet).value) || 0;
    const kg = Number($('#cd-kg', sheet).value) || 0;
    if (!kg) return ($('#cd-est', sheet).innerHTML = '<p class="small" style="margin:0">体重を入れると、消費カロリーの目安が出ます。</p>');
    const kcal = cardioKcal(kind, min, kg);
    $('#cd-est', sheet).innerHTML = `<b>約${kcal}kcal</b>（脂肪に換算すると約${fatGrams(kcal)}g）`;
  };
  bindChoices(sheet, 'cdkind', est);
  bindChoices(sheet, 'cdmin', (m) => {
    if (m) $('#cd-min', sheet).value = m;
    est();
  });
  $('#cd-min', sheet).oninput = est;
  $('#cd-kg', sheet).oninput = est;
  est();
  $('#cd-save', sheet).onclick = () => {
    const kg = Number($('#cd-kg', sheet).value) || 0;
    c.date = $('#cd-date', sheet).value || c.date;
    c.kind = picked(sheet, 'cdkind') || c.kind;
    c.min = Number($('#cd-min', sheet).value) || 0;
    c.fasted = $('#cd-fast', sheet).checked;
    c.km = $('#cd-km', sheet).value;
    c.kcal = kg ? cardioKcal(c.kind, c.min, kg) : 0;
    if (!c.min) return toast('時間を入れてください');
    if (kg && kg !== bodyWeight()) {
      S.settings.weight = kg;
      save('settings');
    }
    const i = S.cardio.findIndex((x) => x.id === c.id);
    if (i >= 0) S.cardio[i] = c;
    else S.cardio.push(c);
    save('cardio');
    closeSheet();
    toast(c.kcal ? `おつかれさまです！約${c.kcal}kcal、脂肪約${fatGrams(c.kcal)}g分です` : '記録しました');
    render();
  };
  $('#cd-del', sheet)?.addEventListener('click', () => {
    if (!confirm('この記録を消しますか？')) return;
    S.cardio = S.cardio.filter((x) => x.id !== c.id);
    save('cardio');
    closeSheet();
    render();
  });
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

/* ---------- 部位のバランス（1か月） ---------- */
// 部位ごとの色。色だけに頼らず、カレンダーにも棒にも部位の文字を必ず添える。
const PARTS = [
  ['胸', '#2a78d6'],
  ['背中', '#eb6834'],
  ['脚', '#1baf7a'],
  ['肩', '#eda100'],
  ['腕', '#e87ba4'],
  ['腹', '#6250d6'],
  ['その他', '#9aa39f'],
];
const PART_COLOR = Object.fromEntries(PARTS);
// 種目 → 鍛える部位（複数あれば両方に数える）。分からない種目は設定で決められる。
const EX_PARTS = {
  ベンチプレス: ['胸'],
  インクラインベンチプレス: ['胸'],
  ダンベルプレス: ['胸'],
  腕立て伏せ: ['胸'],
  加重腕立て: ['胸'],
  ディップス: ['胸', '腕'],
  懸垂: ['背中'],
  斜め懸垂: ['背中'],
  ラットプルダウン: ['背中'],
  ダンベルロウ: ['背中'],
  デッドリフト: ['背中', '脚'],
  スクワット: ['脚'],
  ブルガリアンスクワット: ['脚'],
  レッグプレス: ['脚'],
  ショルダープレス: ['肩'],
  サイドレイズ: ['肩'],
  アームカール: ['腕'],
  アブローラー: ['腹'],
  オーバーヘッドプレス: ['肩'],
  リアレイズ: ['肩'],
  フレンチプレス: ['腕'],
  ダンベルカール: ['腕'],
  ルーマニアンデッドリフト: ['脚'],
  カーフレイズ: ['脚'],
};
const partsOf = (name) => S.settings.exParts?.[name] || EX_PARTS[name] || ['その他'];
let balanceMonth = null;

// その月の、日ごと・部位ごとのセット数
function monthParts(ym) {
  const days = {};
  const total = Object.fromEntries(PARTS.map(([p]) => [p, 0]));
  for (const w of S.workouts) {
    if (w.skipped || monthKey(w.date) !== ym) continue;
    for (const e of w.exercises) {
      const n = e.sets.filter((s) => s.reps).length;
      if (!n) continue;
      for (const p of partsOf(e.name)) {
        total[p] += n;
        days[w.date] = days[w.date] || {};
        days[w.date][p] = (days[w.date][p] || 0) + n;
      }
    }
  }
  return { days, total };
}
const prevMonth = (ym) => {
  const d = parseYmd(ym + '-01');
  d.setMonth(d.getMonth() - 1);
  return ymd(d).slice(0, 7);
};

function balanceHTML() {
  const ym = balanceMonth || today().slice(0, 7);
  const cur = monthParts(ym);
  const last = monthParts(prevMonth(ym)).total;
  const first = parseYmd(ym + '-01');
  const lead = (first.getDay() + 6) % 7; // 月曜はじまり
  const nDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-d empty"></div>');
  for (let d = 1; d <= nDays; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const ps = cur.days[date] || {};
    const tags = PARTS.filter(([p]) => ps[p]).map(([p, c]) => `<span class="pt"><i style="background:${c}"></i>${p === 'その他' ? '他' : p === '背中' ? '背' : p}</span>`);
    cells.push(`<button type="button" class="cal-d${date === today() ? ' today' : ''}${tags.length ? ' has' : ''}" data-cal="${date}"><b>${d}</b>${tags.join('')}</button>`);
  }
  const shown = PARTS.filter(([p]) => p !== 'その他' || cur.total[p] || last[p]);
  const max = Math.max(1, ...shown.map(([p]) => Math.max(cur.total[p], last[p])));
  const trained = shown.filter(([p]) => p !== 'その他');
  const low = trained.filter(([p]) => cur.total[p] === Math.min(...trained.map(([q]) => cur.total[q])));
  const isNow = ym === today().slice(0, 7);
  const unknown = [...new Set(S.workouts.flatMap((w) => (w.skipped ? [] : w.exercises.filter((e) => e.sets.length && partsOf(e.name)[0] === 'その他').map((e) => e.name))))];
  return `<div class="card">
    <h2>部位のバランス</h2>
    <div class="nav"><button class="btn ghost sm" data-bm="-1">◀</button><b>${first.getFullYear()}年${first.getMonth() + 1}月</b><button class="btn ghost sm" data-bm="1" ${isNow ? 'style="visibility:hidden"' : ''}>▶</button></div>
    <div class="cal">${['月', '火', '水', '木', '金', '土', '日'].map((w) => `<div class="cal-h">${w}</div>`).join('')}${cells.join('')}</div>
    <h3>部位ごとのセット数</h3>
    <div class="bars">
      ${shown
        .map(
          ([p, c]) => `<div class="bar-row"><span class="bar-l"><i style="background:${c}"></i>${p}</span>
          <span class="bar-t"><span class="bar" style="width:${(cur.total[p] / max) * 100}%;background:${c}"></span><span class="bar ghost" style="width:${(last[p] / max) * 100}%"></span></span>
          <span class="bar-v"><b>${cur.total[p]}</b><span class="muted">／${last[p]}</span></span></div>`
        )
        .join('')}
    </div>
    <p class="muted" style="margin:6px 0 0">色の棒＝${isNow ? '今月' : 'この月'}、灰色の棒＝前の月（数字は セット数／前の月）</p>
    ${isNow && low.length && Object.values(cur.total).some(Boolean) ? `<p class="small" style="margin:8px 0 0">今月まだ少ないのは <b>${low.map(([p]) => p).join('・')}</b> です。次のトレーニングで足してみましょう。</p>` : ''}
    ${unknown.length ? `<button class="btn ghost sm" data-parts style="margin-top:8px">部位が決まっていない種目 ${unknown.length}つ</button>` : ''}
  </div>`;
}

function bindBalance(v) {
  $$('[data-bm]', v).forEach(
    (b) =>
      (b.onclick = () => {
        balanceMonth = (Number(b.dataset.bm) < 0 ? prevMonth : (ym) => {
          const d = parseYmd(ym + '-01');
          d.setMonth(d.getMonth() + 1);
          return ymd(d).slice(0, 7);
        })(balanceMonth || today().slice(0, 7));
        render();
      })
  );
  $$('[data-cal]', v).forEach(
    (b) =>
      (b.onclick = () => {
        const list = S.workouts.filter((w) => w.date === b.dataset.cal && !w.skipped);
        if (list.length === 1) openWorkout(list[0].id);
        else if (list.length > 1) {
          const sheet = openSheet(jpDate(b.dataset.cal), list.map((w) => `<button class="btn sub wide" style="margin-bottom:8px" data-w="${w.id}">${esc(w.name)}</button>`).join(''));
          $$('[data-w]', sheet).forEach((x) => (x.onclick = () => openWorkout(x.dataset.w)));
        }
      })
  );
  $('[data-parts]', v)?.addEventListener('click', openExParts);
}

// 部位が決まっていない種目に部位を付ける
function openExParts() {
  const names = [...new Set(S.workouts.flatMap((w) => (w.skipped ? [] : w.exercises.map((e) => e.name))))].filter((n) => !EX_PARTS[n]);
  const sheet = openSheet('種目の部位', `
    <p class="muted">鍛える部位を選んでください（いくつでも）。</p>
    ${names.map((n, i) => `<h3>${esc(n)}</h3>${multiHTML('xp' + i, PARTS.map(([p]) => p).filter((p) => p !== 'その他'), S.settings.exParts?.[n] || [])}`).join('')}
    <button class="btn wide" id="xp-save" style="margin-top:12px">保存</button>`);
  $('#xp-save', sheet).onclick = () => {
    S.settings.exParts = S.settings.exParts || {};
    names.forEach((n, i) => {
      const ps = readMulti(sheet, 'xp' + i);
      if (ps.length) S.settings.exParts[n] = ps;
      else delete S.settings.exParts[n];
    });
    save('settings');
    closeSheet();
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
      <button class="btn sub wide" data-cap style="margin-top:8px">📷 洋書のページを取り込む（線を引いた単語）</button>
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
  $('[data-cap]', v).onclick = () => openPageCapture('en');
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
    <button class="btn sub wide" id="r-cap" style="margin-top:8px">📷 線を引いたページを取り込む</button>
    ${isEn ? '<p class="muted">洋書の時間は英語の時間にも入ります。</p>' : ''}`);
  $('#r-cap', sheet).onclick = () => openPageCapture(isEn ? 'en' : 'ja', bookId);
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
        ${chartWeekStatHTML(days)}
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
    <div class="card">
      <h2>保存している量</h2>
      <div id="usage"><p class="muted">計算しています…</p></div>
    </div>
    <div class="card">
      <h2>AIの鍵</h2>
      <p class="muted">今はClaudeのアプリで読み取る形にしているので、入れなくても大丈夫です（将来、アプリから直接AIを呼ぶときに使います）。</p>
      <div class="row"><input type="password" id="ai-key" class="grow" placeholder="sk-ant-..." autocomplete="off"><button class="btn sm" id="ai-save">保存</button></div>
      <p class="small" id="ai-state"></p>
    </div>
    <div class="card">
      <h2>診療日</h2>
      <p class="muted">カルテのチェックは、この曜日だけ出します。</p>
      <div class="choices" id="cdays">${WD.map((w, i) => `<button type="button" class="choice${S.settings.clinicDays.includes(i) ? ' on' : ''}" data-wd="${i}">${w}</button>`).join('')}</div>
    </div>
    <p class="muted">成長ログ 版${APP_VERSION} ・ 記録はこのスマホの中だけに保存されています。</p>`);
  showUsage($('#usage', sheet));
  aiKey().then((k) => ($('#ai-state', sheet).textContent = k ? `保存済み（…${k.slice(-4)}）` : 'まだ入っていません'));
  $('#ai-save', sheet).onclick = async () => {
    const k = $('#ai-key', sheet).value.trim();
    if (!k) return toast('キーを貼り付けてください');
    await setAiKey(k);
    $('#ai-key', sheet).value = '';
    $('#ai-state', sheet).textContent = `保存済み（…${k.slice(-4)}）`;
    toast('AIの鍵を保存しました');
  };
  $('#cdays', sheet).onclick = (e) => {
    const b = e.target.closest('[data-wd]');
    if (!b) return;
    b.classList.toggle('on');
    S.settings.clinicDays = $$('#cdays .choice.on', sheet).map((x) => Number(x.dataset.wd));
    save('settings');
  };
  $('#bk-out', sheet).onclick = doBackup;
  $('#bk-in', sheet).onchange = (e) => restore(e.target.files[0]);
};

// 設定画面の「保存している量」
async function showUsage(box) {
  const mb = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}MB` : n ? `${Math.max(1, Math.round(n / 1e3))}KB` : "0KB");
  const text = new Blob([JSON.stringify(KEYS.map((k) => S[k]))]).size;
  let photoN = 0;
  let photoSize = 0;
  try {
    for (const p of await photoAll()) {
      photoN++;
      photoSize += (p.blob?.size || 0) + (p.thumb?.size || 0);
    }
  } catch {}
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const kept = await navigator.storage?.persisted?.().catch(() => false);
  const from = S.settings.firstUse ? jpDate(ymd(new Date(S.settings.firstUse))) : '';
  box.innerHTML = `
    <div class="row small" style="justify-content:space-between"><span>文字の記録${from ? `（${from}から）` : ''}</span><b>${mb(text)}</b></div>
    <div class="row small" style="justify-content:space-between"><span>写真 ${photoN}枚</span><b>${mb(photoSize)}</b></div>
    ${est?.quota ? `<div class="row small" style="justify-content:space-between"><span>このアプリ全体／使える上限</span><b>${mb(est.usage || 0)}／${mb(est.quota)}</b></div>
    <div class="meter"><i style="width:${Math.max(1, Math.min(100, ((est.usage || 0) / est.quota) * 100))}%"></i></div>` : ''}
    <p class="muted" style="margin:6px 0 0">${kept ? '容量が足りなくなっても、勝手に消されない設定になっています。' : 'スマホの容量が足りなくなると消される可能性があります。ホーム画面に追加すると守られやすくなります。'}週1回のバックアップは続けてください。</p>`;
}

async function doBackup() {
  const data = { app: 'seicho-log', version: 1, savedAt: new Date().toISOString() };
  KEYS.forEach((k) => (data[k] = S[k]));
  data.photos = await photosForBackup();
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
    await restorePhotos(data.photos);
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
    // 画面の読み取りは、呼ぶ側が変更の前に済ませておく（消したあとに古い画面を読むと番号がずれる）
    const redraw = () => {
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
      sync();
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
  v.innerHTML = `<div class="subtabs">${choicesHTML('work', [['consult', '相談'], ['lab', '院内技工'], ['clinic', '臨床ノート'], ['papers', '文献'], ['chores', '雑務']], workTab)}</div><div id="work-body"></div>`;
  bindChoices(v, 'work', (x) => {
    workTab = x || workTab;
    render();
  });
  const body = $('#work-body', v);
  if (workTab === 'lab') renderLab(body);
  else if (workTab === 'clinic') renderClinic(body);
  else if (workTab === 'chores') renderChores(body);
  else if (workTab === 'papers') renderPapers(body);
  else renderConsult(body);
}

/* ========== 院内技工 ========== */
// 受注 → 着手 → 作業 → 完成 を記録して、ためている件数と日数を見えるようにする。患者さんの名前は入れない。
// 作業時間は工程ごとにストップウォッチで計り、種類×工程ごとの最速を「自己ベスト」として残す。
const LAB_LATE = 3; // 受注からこの日数たっても未着手なら「先送り」として目立たせる
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const labType = (j) => S.labTypes.find((t) => t.id === j.typeId);
const labTypeName = (j) => labType(j)?.name || j.typeName;
const sessSec = (s) => s.sec ?? (s.min || 0) * 60; // 以前の記録は分単位
const runSec = (j) => (j.running ? Math.max(0, Math.round((Date.now() - j.running) / 1000)) : 0);
const jobSec = (j) => (j.sessions || []).reduce((a, s) => a + sessSec(s), 0);
const stepSec = (j, i) => (j.sessions || []).filter((s) => s.step === i).reduce((a, s) => a + sessSec(s), 0);
const labMinutes = (j) => Math.round(jobSec(j) / 60);
function labState(j) {
  if (j.finished) return 'done';
  if (j.started) return 'doing';
  return 'waiting';
}
const labRunning = () => S.labs.find((j) => j.running);

function fmtSec(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function secLabel(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return minutesLabel(m);
  return m ? `${m}分${s ? `${s}秒` : ''}` : `${s}秒`;
}
// data-tick を付けた表示を1秒ごとに進める（画面を描き直さずに数字だけ変える）
setInterval(() => {
  $$('[data-left]').forEach((el) => (el.textContent = fmtSec(Math.max(0, Math.round((Number(el.dataset.left) - Date.now()) / 1000)))));
  $$('[data-tick]').forEach((el) => {
    el.textContent = fmtSec(Number(el.dataset.base || 0) + Math.max(0, Math.round((Date.now() - Number(el.dataset.tick)) / 1000)));
  });
}, 1000);
const tickHTML = (j, base, big = false) =>
  `<span class="${big ? 'clock' : 'mono'}" ${j.running ? `data-tick="${j.running}" data-base="${base}"` : ''}>${fmtSec(base + runSec(j))}</span>`;

// 自己ベスト（同じ種類・同じ工程で、計測して完了した中でいちばん短い時間）
function bestStep(typeId, name, excludeId) {
  let best = null;
  for (const j of S.labs) {
    if (j.typeId !== typeId || j.id === excludeId) continue;
    j.steps.forEach((s, i) => {
      if (s.name !== name || !s.done) return;
      const sec = stepSec(j, i);
      if (sec > 0 && (!best || sec < best.sec)) best = { sec, date: s.doneAt || j.finished };
    });
  }
  return best;
}
function bestTotal(typeId, excludeId) {
  let best = null;
  for (const j of S.labs) {
    if (j.typeId !== typeId || j.id === excludeId || !j.finished) continue;
    // 工程ごとに全部計ったものだけを比べる
    if (!j.steps.every((s, i) => stepSec(j, i) > 0)) continue;
    const sec = j.steps.reduce((a, s, i) => a + stepSec(j, i), 0);
    if (!best || sec < best.sec) best = { sec, date: j.finished };
  }
  return best;
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

// 計測中の大きな表示（技工の画面と「今日」の画面で使う）
function runningCardHTML(run) {
  const i = run.runningStep;
  const step = run.steps[i];
  const best = step ? bestStep(run.typeId, step.name, run.id) : null;
  return `<div class="card good">
    <div class="small">⏱ ${esc(labTypeName(run))}${run.mark ? ` ${esc(run.mark)}` : ''}・${esc(step?.name || '作業')}</div>
    <div style="text-align:center;margin:6px 0">${tickHTML(run, step ? stepSec(run, i) : 0, true)}</div>
    ${best ? `<div class="small" style="text-align:center">🏆 自己ベスト ${fmtSec(best.sec)}</div>` : ''}
    <div class="row" style="margin-top:10px">
      <button class="btn sub grow" data-pause="${run.id}">⏸ 一時停止</button>
      ${step ? `<button class="btn grow" data-stepdone="${run.id}">✓ ${esc(step.name)}を完了</button>` : ''}
    </div></div>`;
}
function bindRunningCard(v) {
  $$('[data-pause]', v).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      stopLabTimer(S.labs.find((j) => j.id === b.dataset.pause));
      render();
    })
  );
  $$('[data-stepdone]', v).forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const j = S.labs.find((x) => x.id === b.dataset.stepdone);
      completeStep(j, j.runningStep);
      render();
    })
  );
}

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
      ? `着手まで${daysBetween(j.ordered, j.started)}日・作業${secLabel(jobSec(j))}${j.record ? ' 🏆' : ''}`
      : `${jpDate(j.ordered)}受注${due}${jobSec(j) ? `・作業${secLabel(jobSec(j))}` : ''}`;
    return `<div class="list-item" data-job="${j.id}"><div class="row" style="justify-content:space-between"><b>${esc(labTypeName(j))}${j.mark ? ` <span class="muted">${esc(j.mark)}</span>` : ''}</b><span class="small">${right}</span></div>
      <div class="meta">${sub}</div></div>`;
  };

  v.innerHTML = `
    ${run ? runningCardHTML(run) : ''}
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
    ${recordsHTML()}
    ${labTypeTable()}
    <div class="card"><h2>完成した技工 <button class="btn ghost sm" data-types>種類を編集</button></h2>${done.slice(0, 20).map(jobRow).join('') || '<p class="muted">まだありません。</p>'}</div>`;

  $('[data-new]', v).onclick = () => openLabJob(null);
  $('[data-types]', v).onclick = openLabTypes;
  $$('[data-job]', v).forEach((el) => (el.onclick = () => openLabJob(el.dataset.job)));
  bindRunningCard(v);
}

// 自己ベストの一覧（種類ごと・工程ごと）
function recordsHTML() {
  const blocks = S.labTypes
    .map((t) => {
      const rows = t.steps.map((name) => [name, bestStep(t.id, name, null)]).filter(([, b]) => b);
      const total = bestTotal(t.id, null);
      if (!rows.length) return '';
      return `<h3>${esc(t.name)}</h3>${rows
        .map(([name, b]) => `<div class="row small" style="justify-content:space-between;padding:2px 0"><span>${esc(name)}</span><span><b class="mono">${fmtSec(b.sec)}</b> <span class="muted">${jpDate(b.date)}</span></span></div>`)
        .join('')}${total ? `<div class="row small" style="justify-content:space-between;padding:2px 0;border-top:1px solid var(--line)"><span>全工程の合計</span><span><b class="mono">${fmtSec(total.sec)}</b> <span class="muted">${jpDate(total.date)}</span></span></div>` : ''}`;
    })
    .join('');
  return blocks ? `<div class="card"><h2>🏆 自己ベスト</h2>${blocks}</div>` : '';
}

// 種類ごとの平均（これまでの完成分すべて）
function labTypeTable() {
  const rows = S.labTypes
    .map((t) => [t.name, labStats(S.labs.filter((j) => j.finished && j.typeId === t.id))])
    .filter(([, s]) => s.n);
  if (!rows.length) return '';
  const td = 'style="text-align:center;padding:4px 2px"';
  return `<div class="card"><h2>種類ごとの平均（これまで）</h2>
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
function startLabTimer(j, step) {
  const other = labRunning();
  if (other) stopLabTimer(other, true);
  j.running = Date.now();
  j.runningStep = step;
  markStarted(j, today());
  save('labs');
}
function stopLabTimer(j, quiet = false) {
  if (!j?.running) return;
  const sec = Math.max(1, runSec(j));
  j.sessions = j.sessions || [];
  j.sessions.push({ date: ymd(new Date(j.running)), sec, step: j.runningStep ?? null });
  j.running = null;
  j.runningStep = null;
  save('labs');
  if (!quiet) toast(`${secLabel(sec)}作業しました`);
}

// 工程を完了にする。計測していれば自己ベストと比べる
function completeStep(j, i) {
  if (j.running && j.runningStep === i) stopLabTimer(j, true);
  const s = j.steps[i];
  s.done = true;
  s.doneAt = today();
  markStarted(j, today());
  const sec = stepSec(j, i);
  let msg = `${s.name}が終わりました`;
  if (sec > 0) {
    const prev = bestStep(j.typeId, s.name, j.id);
    if (!prev) msg = `${s.name} ${fmtSec(sec)}。初めての記録です`;
    else if (sec < prev.sec) {
      msg = `🏆 新記録！ ${s.name} ${fmtSec(sec)}（これまで ${fmtSec(prev.sec)}）`;
      s.record = true;
    } else msg = `${s.name} ${fmtSec(sec)}（自己ベスト ${fmtSec(prev.sec)}）`;
  }
  if (j.steps.every((x) => x.done) && !j.finished) return finishJob(j, msg);
  save('labs');
  toast(msg);
}

function openLabJob(id) {
  const existing = id ? S.labs.find((j) => j.id === id) : null;
  if (!existing && !S.labTypes.length) return toast('先に技工の種類を登録してください');
  const j = existing || { id: uid(), created: Date.now(), typeId: S.labTypes[0].id, typeName: S.labTypes[0].name, ordered: today(), due: '', mark: '', note: '', steps: S.labTypes[0].steps.map((name) => ({ name, done: false })), sessions: [], started: null, finished: null, running: null };
  const isNew = !existing;

  const draw = () => {
    const t = today();
    const stepRow = (s, i) => {
      const best = bestStep(j.typeId, s.name, j.id);
      const runningHere = j.running && j.runningStep === i;
      const sec = stepSec(j, i);
      let btn = '';
      if (runningHere) btn = `<button type="button" class="btn sub sm" data-spause>⏸ 止める</button><button type="button" class="btn sm" data-sdone="${i}">✓ 完了</button>`;
      else if (!s.done) btn = `<button type="button" class="btn sm" data-sgo="${i}">▶ ${sec ? '再開' : '開始'}</button>`;
      return `<div class="step${runningHere ? ' on' : ''}">
        <label class="row" style="gap:8px"><input type="checkbox" data-step="${i}" ${s.done ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"> <b>${esc(s.name)}</b>${s.record ? ' 🏆' : ''}</label>
        <div class="row" style="justify-content:space-between;margin-top:4px">
          <span>${runningHere ? tickHTML(j, sec) : `<span class="mono">${sec ? fmtSec(sec) : '--:--'}</span>`} <span class="muted small">${best ? `ベスト ${fmtSec(best.sec)}` : ''}</span></span>
          <span class="row" style="gap:6px">${btn}</span>
        </div></div>`;
    };
    const bestAll = bestTotal(j.typeId, j.id);
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
        <h2>⏱ 工程ごとのタイム</h2>
        ${j.steps.map(stepRow).join('')}
        <div class="row" style="justify-content:space-between;margin-top:10px"><b>合計</b><span>${j.running ? tickHTML(j, jobSec(j)) : `<span class="mono">${fmtSec(jobSec(j))}</span>`} <span class="muted small">${bestAll ? `ベスト ${fmtSec(bestAll.sec)}` : ''}</span></span></div>
        <p class="muted">アプリを閉じても計測は続きます。</p>
        <div class="row"><span class="small">計り忘れたとき：</span>${[10, 15, 30, 60].map((m) => `<button type="button" class="btn ghost sm" data-addmin="${m}">＋${m}分</button>`).join('')}</div>
        <p class="muted" style="margin:4px 0 0">あとから足した時間は合計には入りますが、自己ベストの比べっこには入りません。</p>
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
        ${isNew ? '<button class="btn sub" id="l-now">記録してすぐ始める</button>' : j.finished ? '<button class="btn sub" id="l-reopen">完成を取り消す</button>' : '<button class="btn sub" id="l-done">完成！</button>'}
        ${isNew ? '' : '<button class="btn ghost" id="l-del">削除</button>'}
      </div>`);

    const sync = () => {
      const tid = picked(sheet, 'ltype') || j.typeId;
      if (tid !== j.typeId && !j.steps.some((s) => s.done) && !jobSec(j) && !j.running) {
        const tp = S.labTypes.find((x) => x.id === tid);
        j.steps = tp.steps.map((name) => ({ name, done: false }));
        j.typeId = tid;
      } else if (tid !== j.typeId) {
        toast('作業を始めたあとは種類を変えられません');
      }
      j.typeName = labType(j)?.name || j.typeName;
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
      if (!$('.sheet')) return render();
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    };
    bindChoices(sheet, 'ltype', () => {});
    $$('[data-sgo]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          commit();
          startLabTimer(j, Number(b.dataset.sgo));
          redraw();
        })
    );
    $('[data-spause]', sheet)?.addEventListener('click', () => {
      commit();
      stopLabTimer(j);
      redraw();
    });
    $$('[data-sdone]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          commit();
          completeStep(j, Number(b.dataset.sdone));
          redraw();
        })
    );
    $$('[data-addmin]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          commit();
          j.sessions.push({ date: today(), sec: Number(b.dataset.addmin) * 60, step: null });
          markStarted(j, today());
          save('labs');
          redraw();
        })
    );
    $$('[data-step]', sheet).forEach((c) =>
      c.addEventListener('change', () => {
        commit();
        const i = Number(c.dataset.step);
        if (c.checked) completeStep(j, i);
        else {
          j.steps[i].done = false;
          j.steps[i].doneAt = null;
          j.steps[i].record = false;
          save('labs');
        }
        redraw();
      })
    );
    $('#l-save', sheet).onclick = () => {
      commit();
      closeSheet();
      toast(isNew ? '受注を記録しました。早めに着手しましょう' : '保存しました');
      render();
    };
    $('#l-now', sheet)?.addEventListener('click', () => {
      commit();
      startLabTimer(j, 0);
      closeSheet();
      render();
    });
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

function finishJob(j, stepMsg) {
  if (j.running) stopLabTimer(j, true);
  const t = today();
  j.steps.forEach((s) => {
    if (!s.done) {
      s.done = true;
      s.doneAt = t;
    }
  });
  markStarted(j, t);
  // 全工程の合計タイムが自己ベストか（工程を全部計ったときだけ）
  const prev = bestTotal(j.typeId, j.id);
  const allTimed = j.steps.every((s, i) => stepSec(j, i) > 0);
  const total = j.steps.reduce((a, s, i) => a + stepSec(j, i), 0);
  j.record = allTimed && (!prev || total < prev.sec);
  j.finished = t;
  save('labs');
  closeSheet();
  const d = daysBetween(j.ordered, j.finished);
  let msg = d <= 1 ? `完成！受注から${d}日、すばやいです` : `完成！受注から${d}日でした`;
  if (allTimed && prev && total < prev.sec) msg = `🏆 合計タイムの新記録！ ${fmtSec(total)}（これまで ${fmtSec(prev.sec)}）`;
  else if (stepMsg?.startsWith('🏆')) msg = stepMsg + '／完成！';
  toast(msg);
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

/* ========== 臨床ノート ========== */
// 症例（術前診断 → 術式 → 結果 → 振り返り → 経過）と、日々の気づき・トラブル対処を貯める。患者さんの名前は入れない。
const CASE_AREAS = ['歯周', 'インプラント', '根管', '補綴・修復', '矯正', '外科', 'その他'];
// 分野ごとの診断項目（国際的な分類に合わせる。どれも任意）
const DIAG = {
  歯周: [
    ['ステージ（2017 AAP/EFP）', ['I', 'II', 'III', 'IV']],
    ['グレード', ['A', 'B', 'C']],
    ['範囲', ['限局型', '広汎型', '臼歯・切歯型']],
    ['分岐部（Hamp）', ['なし', '1度', '2度', '3度']],
    ['骨欠損の形態', ['水平性', '1壁性', '2壁性', '3壁性', '複合型', 'クレーター状']],
    ['歯肉退縮（Cairo）', ['なし', 'RT1', 'RT2', 'RT3']],
  ],
  インプラント: [
    ['埋入のタイミング（ITI）', ['Type 1 即時', 'Type 2 早期（軟組織治癒）', 'Type 3 早期（部分的な骨治癒）', 'Type 4 遅延']],
    ['抜歯窩（Elian）', ['Type I', 'Type II', 'Type III']],
    ['骨量（Lekholm & Zarb）', ['A', 'B', 'C', 'D', 'E']],
    ['骨質（Lekholm & Zarb）', ['1', '2', '3', '4']],
    ['骨造成', ['なし', 'GBR 同時', 'GBR 段階', 'サイナス（ラテラル）', 'サイナス（クレスタル）', 'ソケットプリザベーション']],
    ['軟組織の処置', ['なし', 'CTG', 'FGG', 'その他']],
    ['荷重', ['即時', '早期', '通常']],
    ['難易度（ITI SAC）', ['S', 'A', 'C']],
  ],
  根管: [
    ['歯髄の診断（AAE）', ['正常', '可逆性歯髄炎', '不可逆性歯髄炎（症状あり）', '不可逆性歯髄炎（症状なし）', '歯髄壊死', '根管治療済み', '治療開始済み']],
    ['根尖の診断（AAE）', ['正常', '症状のある根尖性歯周炎', '症状のない根尖性歯周炎', '急性根尖膿瘍', '慢性根尖膿瘍', '硬化性骨炎']],
    ['難易度（AAE）', ['低', '中', '高']],
  ],
  '補綴・修復': [],
  矯正: [],
  外科: [],
  その他: [],
};
const CASE_RESULTS = [['good', '予定どおり'], ['partial', '一部課題あり'], ['bad', 'うまくいかなかった']];
let clinicTab = 'cases';
let clinicQuery = '';

function caseFollowUps() {
  const t = today();
  return S.cases.filter((c) => c.nextCheck && c.nextCheck <= t);
}

function renderClinic(v) {
  const q = clinicQuery.trim().toLowerCase();
  const hit = (obj) => !q || JSON.stringify(obj).toLowerCase().includes(q);
  const cases = S.cases.filter(hit).sort((a, b) => (a.date < b.date ? 1 : -1));
  const notes = S.notes.filter(hit).sort((a, b) => (a.date < b.date ? 1 : -1));
  const count = (list, key) => {
    const m = {};
    list.forEach((x) => (m[x[key]] = (m[x[key]] || 0) + 1));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} ${n}`).join('・');
  };
  const resLabel = (r) => CASE_RESULTS.find((x) => x[0] === r)?.[1] || '';

  v.innerHTML = `
    <input type="text" id="cl-q" placeholder="🔍 探す（例：分岐部、ファイル、スクリュー）" value="${esc(clinicQuery)}" style="margin-bottom:10px">
    <div class="subtabs">${choicesHTML('cltab', [['cases', `症例 ${cases.length}`], ['notes', `気づき・トラブル ${notes.length}`]], clinicTab)}</div>
    ${
      clinicTab === 'cases'
        ? `<div class="card"><button class="btn wide" data-newcase>＋ 症例を記録する</button>
            <p class="muted" style="margin:8px 0 0">${count(S.cases, 'area') || '術前の診断・術式・結果・課題を残していきます。'}</p></div>
          <div class="card">${
            cases
              .map(
                (c) => `<div class="list-item" data-case="${c.id}"><div class="row" style="justify-content:space-between"><b>${esc(c.area)}${c.mark ? ` ${esc(c.mark)}` : ''}</b><span class="small">${jpDate(c.date)}</span></div>
              <div class="meta">${esc(c.procedure || '')}</div>
              <div class="meta">${esc(resLabel(c.result))}${c.next ? ` ・次は：${esc(c.next)}` : ''}</div></div>`
              )
              .join('') || '<p class="muted">なし</p>'
          }</div>`
        : `<div class="card"><button class="btn wide" data-newnote>＋ 気づき・トラブルを記録する</button>
            <p class="muted" style="margin:8px 0 0">${count(S.notes, 'cat') || '同じ失敗や苦労をくり返さないために、対処の手順を残します。'}</p></div>
          <div class="card">${
            notes
              .map(
                (n) => `<div class="list-item" data-note="${n.id}"><div class="row" style="justify-content:space-between"><b>${esc(n.title || n.cat)}</b><span class="small">${jpDate(n.date)}</span></div>
              <div class="meta">${esc(n.cat)}</div>${n.prevent ? `<div class="meta">次から：${esc(n.prevent)}</div>` : ''}</div>`
              )
              .join('') || '<p class="muted">なし</p>'
          }<button class="btn ghost sm" data-cats style="margin-top:8px">分類を編集</button></div>`
    }`;
  const qi = $('#cl-q', v);
  qi.oninput = () => {
    clinicQuery = qi.value;
    render();
    const again = $('#cl-q');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  };
  bindChoices(v, 'cltab', (x) => {
    clinicTab = x || clinicTab;
    render();
  });
  $('[data-newcase]', v)?.addEventListener('click', () => openCase(null));
  $('[data-newnote]', v)?.addEventListener('click', () => openNote(null));
  $('[data-cats]', v)?.addEventListener('click', openNoteCats);
  $$('[data-case]', v).forEach((el) => (el.onclick = () => openCase(el.dataset.case)));
  $$('[data-note]', v).forEach((el) => (el.onclick = () => openNote(el.dataset.note)));
}

function openCase(id) {
  const existing = id ? S.cases.find((c) => c.id === id) : null;
  const c = existing ? structuredClone(existing) : { id: uid(), created: Date.now(), date: today(), area: null, mark: '', diag: {}, diagNote: '', procedure: '', result: null, good: '', issue: '', next: '', progress: [], nextCheck: '' };

  const draw = () => {
    const items = DIAG[c.area] || [];
    const sheet = openSheet(existing ? '症例' : '症例を記録', `
      <div class="row">
        <label class="field grow"><span>日付</span><input type="date" id="k-date" value="${c.date}"></label>
        <label class="field grow"><span>部位・目印（名前は入れない）</span><input type="text" id="k-mark" value="${esc(c.mark)}" placeholder="例：#36"></label>
      </div>
      <h3>分野</h3>${choicesHTML('karea', CASE_AREAS.map((x) => [x, x]), c.area)}
      <div class="card" style="margin-top:12px">
        <h2>術前の診断</h2>
        ${items.length ? items.map(([label, opts], i) => `<h3>${esc(label)}</h3>${choicesHTML('kd' + i, opts.map((o) => [o, o]), c.diag[label] || null)}`).join('') : '<p class="muted">分野を選ぶと、その分野の分類が出ます。</p>'}
        <label class="field"><span class="row" style="justify-content:space-between">診断のメモ（所見、検査値など） ${voiceBtn('k-dn')}</span><textarea id="k-dn">${esc(c.diagNote)}</textarea></label>
      </div>
      <label class="field"><span class="row" style="justify-content:space-between">選んだ術式・治療計画 ${voiceBtn('k-proc')}</span><textarea id="k-proc" placeholder="例：再生療法（EMD＋骨補填材）、抜歯即時埋入＋CTG">${esc(c.procedure)}</textarea></label>
      <h3>実際どうだったか</h3>${choicesHTML('kres', CASE_RESULTS, c.result)}
      <label class="field"><span class="row" style="justify-content:space-between">うまくできたこと ${voiceBtn('k-good')}</span><textarea id="k-good">${esc(c.good)}</textarea></label>
      <label class="field"><span class="row" style="justify-content:space-between">課題 ${voiceBtn('k-issue')}</span><textarea id="k-issue">${esc(c.issue)}</textarea></label>
      <label class="field"><span class="row" style="justify-content:space-between">次はこうする ${voiceBtn('k-next')}</span><textarea id="k-next">${esc(c.next)}</textarea></label>
      ${photoBlockHTML(c.photos || [], (c.photos || []).length ? '経過' : '術前')}
      <div class="card">
        <h2>経過</h2>
        ${c.progress.map((p) => `<div class="list-item"><div class="meta">${jpDate(p.date)}</div>${esc(p.text)}</div>`).join('') || '<p class="muted">まだありません。</p>'}
        <label class="field"><span class="row" style="justify-content:space-between">経過を追記 ${voiceBtn('k-prog')}</span><textarea id="k-prog" placeholder="例：3か月後、PD 3mm、BOPなし"></textarea></label>
        <label class="field"><span>次に経過を見る日（その日に「今日」の画面でお知らせ）</span><input type="date" id="k-check" value="${esc(c.nextCheck || '')}"></label>
        <div class="row">${[['1か月後', 1], ['3か月後', 3], ['6か月後', 6], ['1年後', 12]].map(([l, m]) => `<button type="button" class="btn ghost sm" data-in="${m}">${l}</button>`).join('')}</div>
      </div>
      <div class="row"><button class="btn grow" id="k-save">保存</button>${existing ? '<button class="btn ghost" id="k-del">削除</button>' : ''}</div>`);

    const sync = () => {
      c.date = $('#k-date', sheet).value || c.date;
      c.mark = $('#k-mark', sheet).value;
      const area = picked(sheet, 'karea');
      if (area !== c.area) {
        c.area = area;
        return true;
      }
      items.forEach(([label], i) => {
        const val = picked(sheet, 'kd' + i);
        if (val) c.diag[label] = val;
        else delete c.diag[label];
      });
      c.diagNote = $('#k-dn', sheet).value;
      c.procedure = $('#k-proc', sheet).value;
      c.result = picked(sheet, 'kres');
      c.good = $('#k-good', sheet).value;
      c.issue = $('#k-issue', sheet).value;
      c.next = $('#k-next', sheet).value;
      c.nextCheck = $('#k-check', sheet).value;
      return false;
    };
    const readText = () => {
      c.diagNote = $('#k-dn', sheet).value;
      c.procedure = $('#k-proc', sheet).value;
      c.result = picked(sheet, 'kres');
      c.good = $('#k-good', sheet).value;
      c.issue = $('#k-issue', sheet).value;
      c.next = $('#k-next', sheet).value;
      c.nextCheck = $('#k-check', sheet).value;
    };
    ['kres', ...items.map((_, i) => 'kd' + i)].forEach((n) => bindChoices(sheet, n, () => {}));
    // 分野を変えたら、その分野の診断項目に描き直す
    bindChoices(sheet, 'karea', (a) => {
      readText();
      c.mark = $('#k-mark', sheet).value;
      c.area = a;
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    });
    bindPhotoBlock(sheet, c.id, c.photos || [], (list) => {
      readText();
      c.mark = $('#k-mark', sheet).value;
      c.photos = list;
      // 保存済みの症例なら、写真の増減はすぐ記録に反映する
      const stored = S.cases.find((x) => x.id === c.id);
      if (stored) {
        stored.photos = list;
        save('cases');
      }
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    });
    $$('[data-in]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          const d = new Date();
          d.setMonth(d.getMonth() + Number(b.dataset.in));
          $('#k-check', sheet).value = ymd(d);
        })
    );
    $('#k-save', sheet).onclick = () => {
      sync();
      if (!c.area) return toast('分野を選んでください');
      const prog = $('#k-prog', sheet).value.trim();
      if (prog) c.progress.push({ date: today(), text: prog });
      // 経過を書いたら、過ぎたお知らせは終わりにする
      if (prog && c.nextCheck && c.nextCheck <= today()) c.nextCheck = '';
      const i = S.cases.findIndex((x) => x.id === c.id);
      if (i >= 0) S.cases[i] = c;
      else S.cases.push(c);
      save('cases');
      closeSheet();
      toast(existing ? '保存しました' : '記録しました。経験が積み重なっています');
      render();
    };
    $('#k-del', sheet)?.addEventListener('click', () => {
      if (!confirm('この症例の記録を消しますか？')) return;
      S.cases = S.cases.filter((x) => x.id !== c.id);
      (c.photos || []).forEach((p) => photoDel(p.id));
      save('cases');
      closeSheet();
      render();
    });
  };
  draw();
}

function openNote(id) {
  const existing = id ? S.notes.find((n) => n.id === id) : null;
  const n = existing ? structuredClone(existing) : { id: uid(), created: Date.now(), date: today(), cat: null, title: '', what: '', cause: '', how: '', prevent: '', minutes: '', photos: [] };
  const field = (key, label, ph = '') =>
    `<label class="field"><span class="row" style="justify-content:space-between">${label} ${voiceBtn('n-' + key)}</span><textarea id="n-${key}" placeholder="${ph}">${esc(n[key])}</textarea></label>`;

  const draw = () => {
    const sheet = openSheet(existing ? '気づき・トラブル' : '気づき・トラブルを記録', `
      <label class="field"><span>日付</span><input type="date" id="n-date" value="${n.date}"></label>
      <h3>分類</h3>${choicesHTML('ncat', S.noteCats.map((x) => [x, x]), n.cat)}
      <label class="field"><span>ひとことで</span><input type="text" id="n-title" value="${esc(n.title)}" placeholder="例：#46 遠心根 NiTiファイル先端の除去"></label>
      ${field('what', '何が起きたか')}
      ${field('cause', '原因（分かる範囲で）')}
      ${field('how', 'どう対処したか（使った道具・手順）', '例：超音波チップ＋マイクロスコープで周囲を削合 → ...')}
      ${field('prevent', '次から防ぐには・次はこうする')}
      <label class="field"><span>かかった時間（任意）</span><input type="number" inputmode="numeric" class="num" id="n-min" value="${esc(n.minutes)}"> 分</label>
      ${photoBlockHTML(n.photos || [], (n.photos || []).length ? '術後' : 'レントゲン')}
      <div class="row"><button class="btn grow" id="n-save">保存</button>${existing ? '<button class="btn ghost" id="n-del">削除</button>' : ''}</div>`);

    const sync = () => {
      n.date = $('#n-date', sheet).value || n.date;
      n.cat = picked(sheet, 'ncat');
      n.title = $('#n-title', sheet).value.trim();
      ['what', 'cause', 'how', 'prevent'].forEach((k) => (n[k] = $('#n-' + k, sheet).value));
      n.minutes = $('#n-min', sheet).value;
    };
    bindChoices(sheet, 'ncat', () => {});
    bindPhotoBlock(sheet, n.id, n.photos || [], (list) => {
      sync();
      n.photos = list;
      // 保存済みの記録なら、写真の増減はすぐ記録に反映する
      const stored = S.notes.find((x) => x.id === n.id);
      if (stored) {
        stored.photos = list;
        save('notes');
      }
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    });
    $('#n-save', sheet).onclick = () => {
      sync();
      n.cat = n.cat || 'その他';
      const i = S.notes.findIndex((x) => x.id === n.id);
      if (i >= 0) S.notes[i] = n;
      else S.notes.push(n);
      save('notes');
      closeSheet();
      toast('残しました。次の自分が助かります');
      render();
    };
    $('#n-del', sheet)?.addEventListener('click', () => {
      if (!confirm('この記録を消しますか？')) return;
      S.notes = S.notes.filter((x) => x.id !== n.id);
      (n.photos || []).forEach((p) => photoDel(p.id));
      save('notes');
      closeSheet();
      render();
    });
  };
  draw();
}

function openNoteCats() {
  const sheet = openSheet('気づき・トラブルの分類', `
    <p class="muted">1行に1つずつ書きます。消しても、これまでの記録は残ります。</p>
    <textarea id="nc" style="min-height:220px">${esc(S.noteCats.join('\n'))}</textarea>
    <button class="btn wide" id="nc-save" style="margin-top:8px">保存</button>`);
  $('#nc-save', sheet).onclick = () => {
    const list = $('#nc', sheet).value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!list.length) return toast('1つ以上入れてください');
    S.noteCats = list;
    save('noteCats');
    closeSheet();
    render();
  };
}

/* ========== 写真（症例に付ける。スマホの中だけに保存） ========== */
const PHOTO_LABELS = ['術前', '術中', '術後', '経過', 'レントゲン', 'CT', '検査表', 'その他'];

function photoTx(mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', mode);
    const r = fn(tx.objectStore('photos'));
    tx.oncomplete = () => resolve(r?.result);
    tx.onerror = () => reject(tx.error);
  });
}
const photoGet = (id) => photoTx('readonly', (st) => st.get(id));
const photoPut = (rec) => photoTx('readwrite', (st) => st.put(rec));
const photoDel = (id) => photoTx('readwrite', (st) => st.delete(id));
const photoAll = () => photoTx('readonly', (st) => st.getAll());

// 撮った写真は大きいので、長い辺を決めた大きさに縮めてから保存する
async function shrink(file, max, quality) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * scale);
  cv.height = Math.round(bmp.height * scale);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', quality));
}

async function addPhotos(files, owner, label) {
  const added = [];
  for (const f of files) {
    try {
      const rec = { id: uid(), owner, label, date: today(), blob: await shrink(f, 1800, 0.85), thumb: await shrink(f, 360, 0.75) };
      await photoPut(rec);
      added.push({ id: rec.id, label, date: rec.date });
    } catch {
      toast('写真を読み込めませんでした');
    }
  }
  return added;
}

const thumbURLs = new Map();
async function thumbURL(id) {
  if (!thumbURLs.has(id)) {
    const rec = await photoGet(id);
    if (!rec) return '';
    thumbURLs.set(id, URL.createObjectURL(rec.thumb));
  }
  return thumbURLs.get(id);
}

// 症例の画面の「写真」欄。photos は [{id,label,date}]、onChange で記録側に戻す
function photoBlockHTML(photos, label) {
  return `<div class="card"><h2>写真 <span class="muted">${photos.length}枚</span></h2>
    <div class="photo-grid">${photos.map((p) => `<button type="button" class="ph" data-ph="${p.id}"><img alt=""><span>${esc(p.label)}・${jpDate(p.date)}</span></button>`).join('')}</div>
    <h3>種類</h3>${choicesHTML('phlabel', PHOTO_LABELS.map((x) => [x, x]), label)}
    <div class="row" style="margin-top:8px">
      <label class="btn sub grow" style="text-align:center">📷 撮る<input type="file" accept="image/*" capture="environment" data-phin hidden></label>
      <label class="btn sub grow" style="text-align:center">🖼 選ぶ<input type="file" accept="image/*" multiple data-phin hidden></label>
    </div>
    <p class="muted">写真はこのスマホの中だけに保存します。患者さんの顔や名前が写らないように撮りましょう。</p></div>`;
}
function bindPhotoBlock(sheet, owner, photos, onChange) {
  $$('[data-ph]', sheet).forEach(async (b) => {
    $('img', b).src = await thumbURL(b.dataset.ph);
    b.onclick = () => viewPhoto(b.dataset.ph, photos, onChange);
  });
  bindChoices(sheet, 'phlabel', () => {});
  $$('[data-phin]', sheet).forEach(
    (inp) =>
      (inp.onchange = async () => {
        if (!inp.files.length) return;
        toast('保存しています…');
        const label = picked(sheet, 'phlabel') || 'その他';
        const added = await addPhotos([...inp.files], owner, label);
        onChange([...photos, ...added]);
      })
  );
}

// 全画面で見る（症例の画面の上に重ねる）
async function viewPhoto(id, photos, onChange) {
  const rec = await photoGet(id);
  if (!rec) return;
  const url = URL.createObjectURL(rec.blob);
  const ov = document.createElement('div');
  ov.className = 'viewer';
  ov.innerHTML = `<img src="${url}" alt="">
    <div class="viewer-bar"><span>${esc(rec.label)}・${jpDate(rec.date)}</span>
      <span><button class="btn ghost sm" data-vdel>削除</button> <button class="btn sm" data-vclose>閉じる</button></span></div>`;
  const close = () => {
    URL.revokeObjectURL(url);
    ov.remove();
  };
  $('[data-vclose]', ov).onclick = close;
  $('[data-vdel]', ov).onclick = async () => {
    if (!confirm('この写真を消しますか？')) return;
    await photoDel(id);
    close();
    onChange(photos.filter((p) => p.id !== id));
  };
  document.body.appendChild(ov);
}

// 保存されずに終わった記録の写真を片付ける
async function cleanOrphanPhotos() {
  const owners = new Set([...S.cases.map((c) => c.id), ...S.notes.map((n) => n.id), ...S.papers.map((x) => x.id)]);
  for (const p of await photoAll()) if (!owners.has(p.owner)) await photoDel(p.id);
}

const blobToDataURL = (b) => new Promise((res) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.readAsDataURL(b);
});
async function photosForBackup() {
  const out = [];
  for (const p of await photoAll()) out.push({ ...p, blob: await blobToDataURL(p.blob), thumb: await blobToDataURL(p.thumb) });
  return out;
}
async function restorePhotos(list) {
  await photoTx('readwrite', (st) => st.clear());
  for (const p of list || []) {
    await photoPut({ ...p, blob: await (await fetch(p.blob)).blob(), thumb: await (await fetch(p.thumb)).blob() });
  }
  thumbURLs.clear();
}

/* ========== AI（Claude）の呼び出し ========== */
// 鍵（APIキー）はこのスマホの中だけに保存し、バックアップにも入れない。
const AI_MODEL = 'claude-opus-5-5';
let aiKeyCache = null;
async function aiKey() {
  if (aiKeyCache === null) aiKeyCache = (await dbGet('apiKey')) || '';
  return aiKeyCache;
}
async function setAiKey(k) {
  aiKeyCache = k;
  await dbPut('apiKey', k);
}
let sdkPromise = null;
const loadSDK = () => (sdkPromise ||= import('./vendor/anthropic-sdk-0.135.0.mjs').then((m) => m.default));

const PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['words', 'questions'],
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'surface', 'reading', 'pos', 'meaning_ja', 'meaning_en', 'sentence', 'note'],
        properties: {
          word: { type: 'string' },
          surface: { type: 'string' },
          reading: { type: 'string' },
          pos: { type: 'string' },
          meaning_ja: { type: 'string' },
          meaning_en: { type: 'string' },
          sentence: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'choices', 'answer', 'explanation_ja'],
        properties: {
          question: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          explanation_ja: { type: 'string' },
        },
      },
    },
  },
};

const PAGE_PROMPT = {
  en: `This is a photo of a page from an English book the reader is reading aloud. The reader underlines words and phrases they don't know.

1. Find every underlined word or phrase (pen or pencil lines under the text). Only underlined ones. If nothing is underlined, return an empty "words" list.
2. For each one, fill in:
   - word: the dictionary form (lemma). Keep multi-word phrases as phrases.
   - surface: the form as written on the page.
   - reading: IPA pronunciation of the dictionary form.
   - pos: part of speech in Japanese (名詞, 動詞, 形容詞, 副詞, 句動詞, 熟語 etc.).
   - meaning_ja: a short Japanese meaning that fits this context.
   - meaning_en: a short, simple English definition (learner's dictionary style).
   - sentence: the full sentence from the page that contains it, copied exactly.
   - note: one short Japanese line on nuance, common collocations, or a confusable word. Empty string if nothing useful.
3. Write 3 comprehension questions in English about the content of this page, each with 4 English choices. "answer" is the 0-based index of the correct choice. explanation_ja explains the answer in one or two short Japanese sentences and points to where in the text it is. Test understanding of the argument, not trivia. Do not put a summary of the page into the questions or notes.

The reader is a Japanese dentist reading at about CEFR C1.`,
  ja: `これは読書中の日本語の本（純文学など）のページの写真です。読者は分からない言葉に線を引いています。

1. 線が引かれた言葉・語句をすべて見つけてください（線のあるものだけ）。なければ words は空の配列にしてください。
2. それぞれについて：
   - word: 辞書に載っている形
   - surface: ページに書かれている形
   - reading: ひらがなの読み
   - pos: 品詞（名詞、動詞、形容詞、副詞、慣用句など）
   - meaning_ja: この文脈に合う短い意味
   - meaning_en: 空文字
   - sentence: その言葉を含む一文を、ページの通りに書き写す
   - note: 語源、似た言葉との違い、使い方など、覚えるのに役立つことを一行で。なければ空文字
3. questions は空の配列にしてください。`,
};

// ページの写真から、線を引いた言葉と（英語なら）内容の確認問題を作ってもらう
async function aiReadPage(blobs, lang) {
  const key = await aiKey();
  if (!key) throw new Error('nokey');
  const Anthropic = await loadSDK();
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  const images = [];
  for (const b of blobs) {
    const data = (await blobToDataURL(b)).split(',')[1];
    images.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  }
  const res = await client.beta.messages.create({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: { type: 'json_schema', schema: PAGE_SCHEMA } },
    messages: [{ role: 'user', content: [...images, { type: 'text', text: PAGE_PROMPT[lang] }] }],
  });
  if (res.stop_reason === 'refusal') throw new Error('refusal');
  if (res.stop_reason === 'max_tokens') throw new Error('toolong');
  const text = res.content.filter((c) => c.type === 'text').map((c) => c.text).join('');
  return JSON.parse(text);
}

function aiErrorText(e) {
  if (e?.message === 'nokey') return 'AIの鍵がまだ入っていません。⚙︎（設定）の「AIの鍵」に入れてください。';
  if (e?.message === 'refusal') return 'AIがこの写真を読み取れませんでした。別の写真で試してください。';
  if (e?.message === 'toolong') return '1回に読み取る量が多すぎました。写真の枚数を減らしてください。';
  const status = e?.status;
  if (status === 401) return 'AIの鍵が正しくないようです。⚙︎（設定）で入れ直してください。';
  if (status === 429) return 'AIが混み合っています。少し待ってからもう一度試してください。';
  if (status === 400 && /credit/i.test(e?.message || '')) return 'AIの利用残高が足りません。Anthropicのサイトで残高を追加してください。';
  if (!navigator.onLine) return '電波がつながっていません。';
  return `うまくいきませんでした（${esc(String(status || e?.message || 'エラー'))}）。もう一度試してください。`;
}

/* ========== ページの写真から言葉を取り込む ========== */
// Claudeのアプリ（定額プラン）で読み取ってもらい、返事を貼り付けて取り込む。追加料金はかからない。
const CHAT_FORMAT = `

最後に、成長ログ（私の記録アプリ）に取り込むためのまとめを、次の形のJSONだけで、\`\`\`json のコードブロック1つにまとめて出してください。キーの名前は変えないでください。
{"words":[{"word":"","surface":"","reading":"","pos":"","meaning_ja":"","meaning_en":"","sentence":"","note":""}],"questions":[{"question":"","choices":["","","",""],"answer":0,"explanation_ja":""}]}`;
const chatPrompt = (lang) => PAGE_PROMPT[lang] + CHAT_FORMAT;

// 貼り付けた返事から JSON を取り出す（コードブロックがあればその中、なければ最初の { から最後の } まで）
function parseChatReply(text) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  let body = block ? block[1] : text;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('nojson');
  const data = JSON.parse(body.slice(a, b + 1));
  const str = (v) => (v == null ? '' : String(v));
  const words = (Array.isArray(data.words) ? data.words : [])
    .filter((w) => w && (w.word || w.surface))
    .map((w) => ({ word: str(w.word || w.surface), surface: str(w.surface || w.word), reading: str(w.reading), pos: str(w.pos), meaning_ja: str(w.meaning_ja || w.meaning), meaning_en: str(w.meaning_en), sentence: str(w.sentence), note: str(w.note) }));
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .filter((q) => q && q.question && Array.isArray(q.choices))
    .map((q) => ({ question: str(q.question), choices: q.choices.map(str), answer: Number(q.answer) || 0, explanation_ja: str(q.explanation_ja) }));
  return { words, questions };
}

function openPageCapture(lang = 'en', bookId = null) {
  const books = S.books.filter((b) => (lang === 'en' ? b.genre === '洋書' : b.genre !== '洋書') && b.status !== 'done');
  const sheet = openSheet(lang === 'en' ? '洋書のページを取り込む' : '本のページを取り込む', `
    <label class="field"><span>本</span><select id="pc-book"><option value="">（選ばない）</option>${books
      .map((b) => `<option value="${b.id}" ${b.id === bookId ? 'selected' : ''}>${esc(b.title)}</option>`)
      .join('')}</select></label>
    <div class="card">
      <h2>Claudeのアプリで読み取る</h2>
      <ol class="small" style="padding-left:20px;margin:0 0 10px">
        <li>下の「① 頼む文章をコピー」を押す</li>
        <li>Claudeのアプリで、線を引いたページの写真を付けて、文章を貼り付けて送る（内容について話したり質問したりしてもOK）</li>
        <li>返事の最後のまとめ（コード欄）の右上のコピーボタンを押す</li>
        <li>ここに戻って「② 貼り付けて取り込む」を押す</li>
      </ol>
      <button class="btn sub wide" id="pc-copy">① 頼む文章をコピー</button>
      <button class="btn wide" id="pc-paste" style="margin-top:8px">② 貼り付けて取り込む</button>
      <details style="margin-top:10px"><summary class="small">うまく貼り付けられないとき</summary>
        <textarea id="pc-text" placeholder="ここにClaudeの返事を貼り付けてください" style="margin-top:6px;min-height:100px"></textarea>
        <button class="btn sub wide" id="pc-take" style="margin-top:6px">この内容で取り込む</button>
      </details>
    </div>`);
  const take = (text) => {
    try {
      const out = parseChatReply(text);
      if (!out.words.length && !out.questions.length) return toast('取り込める言葉が見つかりませんでした', 4000);
      openPageResult({ words: out.words, questions: out.questions.slice(0, 5) }, lang, $('#pc-book', sheet).value || null);
    } catch {
      toast('まとめの部分が見つかりませんでした。返事の最後のコード欄をコピーしてください', 5000);
    }
  };
  $('#pc-copy', sheet).onclick = async () => {
    try {
      await navigator.clipboard.writeText(chatPrompt(lang));
      toast('コピーしました。Claudeのアプリに貼り付けてください', 3500);
    } catch {
      $('#pc-text', sheet).closest('details').open = true;
      $('#pc-text', sheet).value = chatPrompt(lang);
      $('#pc-text', sheet).select();
      toast('自動でコピーできませんでした。下の文章を長押ししてコピーしてください', 5000);
    }
  };
  $('#pc-paste', sheet).onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return toast('コピーされた内容がありません', 3500);
      take(text);
    } catch {
      $('#pc-text', sheet).closest('details').open = true;
      $('#pc-text', sheet).value = '';
      $('#pc-text', sheet).focus();
      toast('下の欄に長押しで貼り付けて、「この内容で取り込む」を押してください', 5000);
    }
  };
  $('#pc-take', sheet).onclick = () => take($('#pc-text', sheet).value);
}

function openPageResult(out, lang, bookId) {
  const book = bookOf(bookId);
  const words = out.words || [];
  const qs = (out.questions || []).filter((q) => q.choices?.length >= 2 && q.answer >= 0 && q.answer < q.choices.length);
  const sheet = openSheet('読み取った言葉', `
    ${words.length ? `<p class="small">${words.length}語見つかりました。手帳に入れないものはチェックを外してください。</p>` : '<p class="small">線を引いた言葉は見つかりませんでした。</p>'}
    ${words
      .map(
        (w, i) => `<div class="card" style="padding:10px">
        <label class="row" style="gap:8px"><input type="checkbox" data-keep="${i}" checked style="width:22px;height:22px;accent-color:var(--accent)">
          <b>${esc(w.word)}</b> <span class="muted small">${esc(w.reading)} ${esc(w.pos)}</span></label>
        <input type="text" data-mean="${i}" value="${esc(w.meaning_ja)}" style="margin-top:6px">
        ${w.meaning_en ? `<div class="small" style="margin-top:4px">${esc(w.meaning_en)}</div>` : ''}
        <div class="muted" style="margin-top:4px">${esc(w.sentence)}</div>
        ${w.note ? `<div class="small" style="margin-top:4px">💡 ${esc(w.note)}</div>` : ''}
      </div>`
      )
      .join('')}
    <button class="btn wide" id="pr-save">${words.length ? '手帳に入れる' : '閉じる'}</button>`);
  $('#pr-save', sheet).onclick = () => {
    let n = 0;
    words.forEach((w, i) => {
      if (!$(`[data-keep="${i}"]`, sheet).checked) return;
      const meaning = $(`[data-mean="${i}"]`, sheet).value.trim() || w.meaning_ja;
      // 同じ言葉がもう手帳にあれば、例文と出てきた本を足して復習をやり直す
      const dup = S.words.find((x) => x.lang === lang && x.word.toLowerCase() === w.word.toLowerCase());
      if (dup) {
        dup.sentences = [...new Set([...(dup.sentences || (dup.sentence ? [dup.sentence] : [])), w.sentence].filter(Boolean))];
        dup.srs = { level: 0, due: today() };
        dup.seen = (dup.seen || 1) + 1;
        return;
      }
      S.words.push({
        id: uid(),
        created: Date.now(),
        lang,
        word: w.word,
        surface: w.surface,
        reading: w.reading,
        pos: w.pos,
        meaning,
        meaningEn: w.meaning_en,
        sentence: w.sentence,
        note: w.note,
        source: book?.title || '',
        srs: { level: 0, due: addDays(today(), 1) },
      });
      n++;
    });
    save('words');
    if (lang === 'en' && qs.length) {
      S.readQs.push({ id: uid(), date: today(), bookId, questions: qs, answered: null });
      save('readQs');
    }
    closeSheet();
    if (lang === 'en' && qs.length) {
      toast(`${n}語を手帳に入れました。続けて内容のクイズです`);
      openReadQuiz(S.readQs[S.readQs.length - 1].id);
    } else {
      toast(`${n}語を手帳に入れました。明日から復習クイズに出ます`);
      render();
    }
  };
}

/* ========== 内容の確認クイズ（英語・4択） ========== */
function openReadQuiz(id) {
  const set = S.readQs.find((x) => x.id === id);
  if (!set) return;
  let i = 0;
  let correct = 0;
  const step = () => {
    if (i >= set.questions.length) {
      set.answered = { date: today(), correct, total: set.questions.length };
      save('readQs');
      const sheet = openSheet('内容の確認クイズ', `<div class="card good"><h2>${correct} / ${set.questions.length} 問正解</h2>
        <p class="small">${correct === set.questions.length ? 'しっかり読めています！' : '分からなかったところを、もう一度音読してみましょう。'}</p></div>
        <button class="btn wide" data-close>閉じる</button>`);
      return sheet;
    }
    const q = set.questions[i];
    const sheet = openSheet(`内容の確認クイズ ${i + 1}/${set.questions.length}`, `
      <p style="font-size:17px">${esc(q.question)}</p>
      ${q.choices.map((c, k) => `<button class="btn sub wide" style="margin-bottom:8px;text-align:left" data-ans="${k}">${'ABCD'[k] || k + 1}. ${esc(c)}</button>`).join('')}
      <div id="rq-exp"></div>`);
    $$('[data-ans]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          const k = Number(b.dataset.ans);
          const ok = k === q.answer;
          if (ok) correct++;
          $$('[data-ans]', sheet).forEach((x) => {
            x.disabled = true;
            if (Number(x.dataset.ans) === q.answer) x.classList.remove('sub');
          });
          $('#rq-exp', sheet).innerHTML = `<div class="card ${ok ? 'good' : 'notice'}"><b>${ok ? '正解！' : '惜しい'}</b><p class="small" style="margin:6px 0 0">${esc(q.explanation_ja)}</p></div>
            <button class="btn wide" id="rq-next">${i + 1 < set.questions.length ? '次へ' : '結果を見る'}</button>`;
          $('#rq-next', sheet).onclick = () => {
            i++;
            step();
          };
        })
    );
  };
  step();
}

/* ========== 言葉の復習クイズ ========== */
// 正解するたびに次に出す日をのばす（忘れかけた頃にもう一度出す）。間違えたら翌日にやり直し。
const SRS_DAYS = [1, 3, 7, 14, 30, 60, 120];
const dueWords = () => S.words.filter((w) => (w.srs?.due || today()) <= today());

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function makeQuestion(w) {
  const pool = S.words.filter((x) => x.id !== w.id && x.lang === w.lang && x.meaning);
  const kinds = ['meaning'];
  const sent = w.sentence || w.sentences?.[0];
  const surf = w.surface || w.word;
  if (sent && sent.toLowerCase().includes(surf.toLowerCase())) kinds.push('blank');
  if (pool.length < 3) return { kind: 'self', w };
  // 日本語の言葉は「読み方」も問う（難しい漢字の読みを覚えるため）
  const readPool = pool.filter((x) => x.reading && x.reading !== w.reading);
  if (w.lang === 'ja' && w.reading && readPool.length >= 3) kinds.push('reading', 'reading');
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  if (kind === 'reading') {
    const choices = shuffle([w.reading, ...shuffle([...new Set(readPool.map((x) => x.reading))]).slice(0, 3)]);
    return { kind, w, prompt: w.word, sub: 'この言葉の読み方は？', choices, answer: choices.indexOf(w.reading) };
  }
  if (kind === 'meaning') {
    const choices = shuffle([w.meaning, ...shuffle(pool).slice(0, 3).map((x) => x.meaning)]);
    return { kind, w, prompt: w.word, sub: w.reading || '', choices, answer: choices.indexOf(w.meaning) };
  }
  const re = new RegExp(surf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const choices = shuffle([surf, ...shuffle(pool).slice(0, 3).map((x) => x.surface || x.word)]);
  return { kind, w, prompt: sent.replace(re, '＿＿＿＿'), sub: `ヒント：${w.meaning}`, choices, answer: choices.indexOf(surf) };
}

function gradeWord(w, ok) {
  const lv = ok ? Math.min((w.srs?.level || 0) + 1, SRS_DAYS.length) : 0;
  w.srs = { level: lv, due: addDays(today(), ok ? SRS_DAYS[lv - 1] : 1), last: today() };
  w.stats = { right: (w.stats?.right || 0) + (ok ? 1 : 0), wrong: (w.stats?.wrong || 0) + (ok ? 0 : 1) };
}

// 気分に合わせて、時間と言葉の種類を選んでから始める
const QUIZ_TIMES = [['1', 'さっと1分'], ['3', '3分'], ['5', '5分'], ['10', 'じっくり10分'], ['0', '全部']];
function openQuizMenu() {
  const due = dueWords();
  if (!due.length) return toast('今日の復習は終わっています');
  const nEn = due.filter((w) => w.lang === 'en').length;
  const nJa = due.length - nEn;
  const last = S.settings.quizPick || {};
  const sheet = openSheet('復習クイズ', `
    <p class="small">今日の復習は <b>${due.length}語</b>（英語${nEn}・日本語${nJa}）です。</p>
    <h3>時間</h3>${choicesHTML('qtime', QUIZ_TIMES, last.min ?? '3')}
    <h3>言葉</h3>${choicesHTML('qlang', [['all', 'ぜんぶ'], ['en', '英語だけ'], ['ja', '日本語だけ']], last.lang || 'all')}
    <button class="btn wide" id="q-go" style="margin-top:12px">始める</button>
    <p class="muted">時間が来たら、その問題で終わります。残った言葉は次に回ります。<br>正解した言葉は 翌日 → 3日後 → 1週間後 → 2週間後 → 1か月後 → 2か月後 → 4か月後 と間をあけて出し、間違えた言葉は翌日にもう一度出します。</p>`);
  bindChoices(sheet, 'qtime', () => {});
  bindChoices(sheet, 'qlang', () => {});
  $('#q-go', sheet).onclick = () => {
    const min = picked(sheet, 'qtime') ?? '3';
    const lang = picked(sheet, 'qlang') || 'all';
    S.settings.quizPick = { min, lang };
    save('settings');
    openWordQuiz({ min: Number(min), lang });
  };
}

function openWordQuiz({ min = 0, lang = 'all' } = {}) {
  let queue = shuffle(dueWords().filter((w) => lang === 'all' || w.lang === lang));
  if (!min) queue = queue.slice(0, 50);
  if (!queue.length) return toast('選んだ言葉の復習は終わっています');
  const endAt = min ? Date.now() + min * 60000 : null;
  let total = queue.length;
  let asked = 0;
  let right = 0;
  const missed = new Set();
  const next = () => {
    const timeUp = endAt && Date.now() >= endAt;
    if (!queue.length || timeUp) {
      save('words');
      const left = new Set(queue.filter((w) => !missed.has(w.id)).map((w) => w.id)).size;
      openSheet('復習クイズ', `<div class="card good"><h2>${timeUp ? '時間です！' : 'おわり！'} ${asked}問</h2>
        <p class="small">一度で正解：${right}語${missed.size ? `／もう一度：${missed.size}語（明日また出ます）` : ''}${left ? `／残り${left}語は次に回します` : ''}</p></div>
        <button class="btn wide" data-close>閉じる</button>`);
      return;
    }
    asked++;
    const w = queue.shift();
    const q = makeQuestion(w);
    const head = `<div class="row muted small" style="justify-content:space-between"><span>${asked}問目・${w.lang === 'en' ? '英語' : '日本語'}${w.source ? `・${esc(w.source)}` : ''}</span>${
      endAt ? `<span>残り <b class="mono" data-left="${endAt}">${fmtSec(Math.max(0, Math.round((endAt - Date.now()) / 1000)))}</b></span>` : `<span>残り${queue.length + 1}語</span>`
    }</div>`;
    const finish = (ok) => {
      if (!missed.has(w.id)) {
        gradeWord(w, ok);
        if (ok) right++;
      }
      if (!ok) {
        missed.add(w.id);
        queue.push(w); // 間違えた言葉は最後にもう一度
      }
    };
    const answerCard = (ok) => `<div class="card ${ok ? 'good' : 'notice'}">
        <b>${ok ? '正解！' : 'こたえ'}</b>：<b>${esc(w.word)}</b> ${esc(w.reading || '')}<br>${esc(w.meaning)}
        ${w.meaningEn ? `<div class="small">${esc(w.meaningEn)}</div>` : ''}
        ${w.sentence ? `<div class="muted" style="margin-top:4px">${esc(w.sentence)}</div>` : ''}
        ${w.note ? `<div class="small" style="margin-top:4px">💡 ${esc(w.note)}</div>` : ''}</div>
        <button class="btn wide" id="wq-next">次へ</button>`;
    if (q.kind === 'self') {
      const sheet = openSheet('復習クイズ', `${head}<p style="font-size:22px;font-weight:700;margin:10px 0">${esc(w.word)}</p>
        <p class="small">意味を思い出してから、めくってください。</p>
        <button class="btn wide" id="wq-flip">めくる</button><div id="wq-a"></div>`);
      $('#wq-flip', sheet).onclick = () => {
        $('#wq-flip', sheet).remove();
        $('#wq-a', sheet).innerHTML = `${answerCard(true).replace('正解！', 'こたえ').split('<button')[0]}
          <div class="row"><button class="btn grow" id="wq-ok">覚えていた</button><button class="btn sub grow" id="wq-ng">忘れていた</button></div>`;
        $('#wq-ok', sheet).onclick = () => (finish(true), next());
        $('#wq-ng', sheet).onclick = () => (finish(false), next());
      };
      return;
    }
    const sheet = openSheet('復習クイズ', `${head}
      <p style="font-size:${q.kind === 'meaning' ? '22px;font-weight:700' : '16px'};margin:10px 0">${esc(q.prompt)}</p>
      ${q.sub ? `<p class="muted">${esc(q.sub)}</p>` : ''}
      ${q.choices.map((c, k) => `<button class="btn sub wide" style="margin-bottom:8px;text-align:left" data-wa="${k}">${esc(c)}</button>`).join('')}
      <div id="wq-a"></div>`);
    $$('[data-wa]', sheet).forEach(
      (b) =>
        (b.onclick = () => {
          const ok = Number(b.dataset.wa) === q.answer;
          finish(ok);
          $$('[data-wa]', sheet).forEach((x) => {
            x.disabled = true;
            if (Number(x.dataset.wa) === q.answer) x.classList.remove('sub');
          });
          $('#wq-a', sheet).innerHTML = answerCard(ok);
          $('#wq-next', sheet).onclick = next;
        })
    );
  };
  next();
}

function renderWords(v) {
  const list = [...S.words].sort((a, b) => b.created - a.created);
  const due = dueWords().length;
  const learned = S.words.filter((w) => (w.srs?.level || 0) >= 4).length;
  const pendingQs = S.readQs.filter((x) => !x.answered);
  v.innerHTML = `
    <div class="card${due ? ' good' : ''}">
      <h2>今日の復習 <span>${due}語</span></h2>
      <button class="btn wide" data-quiz ${due ? '' : 'disabled'}>${due ? '復習クイズを始める' : '今日の復習は終わりました'}</button>
      <p class="muted" style="margin:8px 0 0">手帳 ${S.words.length}語 ・ 定着（4回以上連続で正解）${learned}語</p>
    </div>
    ${pendingQs.length ? `<div class="card"><h2>まだ解いていない内容クイズ <span>${pendingQs.length}</span></h2>${pendingQs.map((x) => `<button class="btn sub wide" style="margin-bottom:6px" data-rq="${x.id}">${jpDate(x.date)} ${esc(bookOf(x.bookId)?.title || '')}</button>`).join('')}</div>` : ''}
    <div class="card">
      <h2>ページから取り込む</h2>
      <div class="row"><button class="btn sub grow" data-cap="en">📷 洋書</button><button class="btn sub grow" data-cap="ja">📷 日本語の本</button></div>
      <button class="btn ghost wide" data-add style="margin-top:8px">＋ 手で追加</button>
    </div>
    <div class="card">${
      list.length
        ? list
            .map(
              (w) => `<div class="list-item" data-open="${w.id}"><b>${esc(w.word)}</b> <span class="muted">${w.lang === 'en' ? '英語' : '日本語'}${w.srs ? ` ・次 ${jpDate(w.srs.due)}` : ''}</span>
              <div class="meta">${esc(w.meaning || '')}${w.source ? ` ／ ${esc(w.source)}` : ''}</div></div>`
            )
            .join('')
        : '<p class="muted">まだありません。</p>'
    }</div>`;
  $('[data-quiz]', v).onclick = openQuizMenu;
  $('[data-add]', v).onclick = () => openWord(null);
  $$('[data-cap]', v).forEach((b) => (b.onclick = () => openPageCapture(b.dataset.cap)));
  $$('[data-rq]', v).forEach((b) => (b.onclick = () => openReadQuiz(b.dataset.rq)));
  $$('[data-open]', v).forEach((el) => (el.onclick = () => openWord(el.dataset.open)));
}

function openWord(id) {
  const existing = id ? S.words.find((w) => w.id === id) : null;
  const w = existing ? structuredClone(existing) : { id: uid(), created: Date.now(), word: '', meaning: '', source: '', lang: 'en', srs: { level: 0, due: addDays(today(), 1) } };
  const sheet = openSheet(existing ? '言葉' : '言葉を追加', `
    ${choicesHTML('lang', [['en', '英語'], ['ja', '日本語']], w.lang)}
    <label class="field"><span>言葉</span><input type="text" id="wd-word" value="${esc(w.word)}"></label>
    <label class="field"><span>読み・発音</span><input type="text" id="wd-read" value="${esc(w.reading || '')}"></label>
    <label class="field"><span>意味</span><textarea id="wd-mean">${esc(w.meaning)}</textarea></label>
    <label class="field"><span>英語での意味</span><input type="text" id="wd-en" value="${esc(w.meaningEn || '')}"></label>
    <label class="field"><span>出てきた文</span><textarea id="wd-sent">${esc(w.sentence || '')}</textarea></label>
    <label class="field"><span>メモ</span><input type="text" id="wd-note" value="${esc(w.note || '')}"></label>
    <label class="field"><span>出てきた本</span><select id="wd-src"><option value="">（なし）</option>${S.books.map((b) => `<option ${w.source === b.title ? 'selected' : ''}>${esc(b.title)}</option>`).join('')}</select></label>
    ${existing?.stats ? `<p class="muted">正解${existing.stats.right}回・間違い${existing.stats.wrong}回・次の復習 ${jpDate(existing.srs.due)}</p>` : ''}
    <div class="row"><button class="btn grow" id="wd-save">保存</button>${existing ? '<button class="btn ghost" id="wd-del">削除</button>' : ''}</div>`);
  bindChoices(sheet, 'lang', () => {});
  $('#wd-save', sheet).onclick = () => {
    w.word = $('#wd-word', sheet).value.trim();
    if (!w.word) return toast('言葉を入れてください');
    w.reading = $('#wd-read', sheet).value.trim();
    w.meaning = $('#wd-mean', sheet).value;
    w.meaningEn = $('#wd-en', sheet).value.trim();
    w.sentence = $('#wd-sent', sheet).value.trim();
    w.note = $('#wd-note', sheet).value.trim();
    w.source = $('#wd-src', sheet).value;
    w.lang = picked(sheet, 'lang') || 'en';
    const i = S.words.findIndex((x) => x.id === w.id);
    if (i >= 0) S.words[i] = w;
    else S.words.push(w);
    save('words');
    closeSheet();
    render();
  };
  $('#wd-del', sheet)?.addEventListener('click', () => {
    if (!confirm('この言葉を手帳から消しますか？')) return;
    S.words = S.words.filter((x) => x.id !== w.id);
    save('words');
    closeSheet();
    render();
  });
}

/* ========== 文献（雑誌の記事・論文） ========== */
// 写真で登録し、5段階評価と読後のコメントを残す。参考文献からたどった文献は「孫引き」としてつなげる。
const PAPER_KINDS = ['雑誌の記事', '英語論文', '日本語論文', '書籍', 'セミナー資料'];
const PAPER_STATUS = [['want', '読む予定'], ['get', '取り寄せ中'], ['printed', '印刷済み'], ['done', '読了']];
const PAPER_TAGS = ['もう一度読む', '臨床にすぐ活かせる', '発表・講演の材料', 'あまり参考にならなかった', 'つまらなかった'];
const PAPER_THEMES = ['審美補綴', '接着修復', 'フルマウス', 'ワイヤー矯正', 'マウスピース矯正', '小児矯正', 'インプラント', '再生療法', '軟組織マネジメント', 'デジタル機器', '経営', 'スタッフ'];
let paperFilter = 'all';
let paperTheme = '';
let paperQuery = '';
const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

// 「臨床にすぐ活かせる」を付けて読み終えた文献は、1週間後に「試しましたか？」と聞く
function paperTryAsks() {
  const t = today();
  return S.papers.filter((p) => p.status === 'done' && (p.tags || []).includes('臨床にすぐ活かせる') && !p.tried && (p.askOn || addDays(p.readOn || t, 7)) <= t);
}

const PAPER_PROMPT = `この写真は、歯科の文献（雑誌の記事・論文・書籍など）の表紙か最初のページです。書誌情報を読み取って、次の形のJSONだけを \`\`\`json のコードブロック1つで出してください。分からない項目は空文字にしてください。要約はいりません。
{"paper":{"title":"","authors":"","journal":"","year":"","kind":"雑誌の記事／英語論文／日本語論文／書籍／セミナー資料のどれか","lang":"en か ja","themes":["次から当てはまるもの：${PAPER_THEMES.join('、')}"]}}`;

function parsePaperReply(text) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = block ? block[1] : text;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('nojson');
  const d = JSON.parse(body.slice(a, b + 1));
  return d.paper || d;
}

function renderPapers(v) {
  const t = today();
  const q = paperQuery.trim().toLowerCase();
  const list = S.papers
    .filter((p) => paperFilter === 'all' || (paperFilter === 'done' ? p.status === 'done' : p.status !== 'done'))
    .filter((p) => !paperTheme || (p.themes || []).includes(paperTheme))
    .filter((p) => !q || JSON.stringify([p.title, p.authors, p.journal, p.comment, p.themes]).toLowerCase().includes(q))
    .sort((a, b) => (a.status === 'done' && b.status === 'done' ? (a.readOn < b.readOn ? 1 : -1) : b.created - a.created));
  const toRead = S.papers.filter((p) => p.status !== 'done').length;
  const monthDone = S.papers.filter((p) => p.status === 'done' && monthKey(p.readOn || '') === monthKey(t)).length;
  const kids = (id) => S.papers.filter((p) => p.parent === id).length;
  v.innerHTML = `
    <div class="card">
      <h2>文献</h2>
      <div class="stats"><div class="stat"><div class="v">${toRead}件</div><div class="l">読む予定・取り寄せ中</div></div><div class="stat"><div class="v">${monthDone}件</div><div class="l">今月読み終えた</div></div></div>
      <button class="btn wide" data-newpaper style="margin-top:10px">＋ 文献を登録する（写真）</button>
    </div>
    <input type="text" id="pp-q" placeholder="🔍 探す（題名、著者、コメント）" value="${esc(paperQuery)}" style="margin-bottom:8px">
    <div class="subtabs">${choicesHTML('ppf', [['all', 'すべて'], ['todo', '読む予定'], ['done', '読了']], paperFilter)}</div>
    <select id="pp-theme" style="margin-bottom:10px"><option value="">テーマ：すべて</option>${PAPER_THEMES.map((x) => `<option ${x === paperTheme ? 'selected' : ''}>${x}</option>`).join('')}</select>
    <div class="card">${
      list
        .map(
          (p) => `<div class="list-item" data-paper="${p.id}">
          <div class="row" style="justify-content:space-between;align-items:flex-start"><b class="grow">${esc(p.title || '（題名なし）')}</b><span class="small" style="color:var(--warn);white-space:nowrap">${stars(p.rating)}</span></div>
          <div class="meta">${esc([p.authors, p.journal, p.year].filter(Boolean).join(' ・ '))}</div>
          <div class="meta">${esc(PAPER_STATUS.find((s) => s[0] === p.status)?.[1] || '')}${(p.themes || []).length ? ` ・ ${esc(p.themes.join('、'))}` : ''}${p.parent ? ' ・ ↳孫引き' : ''}${kids(p.id) ? ` ・ 参考文献から${kids(p.id)}件` : ''}</div>
          ${(p.tags || []).length ? `<div class="meta">🏷 ${esc(p.tags.join('、'))}</div>` : ''}
        </div>`
        )
        .join('') || '<p class="muted">なし</p>'
    }</div>`;
  $('[data-newpaper]', v).onclick = () => openPaper(null);
  $$('[data-paper]', v).forEach((el) => (el.onclick = () => openPaper(el.dataset.paper)));
  bindChoices(v, 'ppf', (x) => {
    paperFilter = x || 'all';
    render();
  });
  $('#pp-theme', v).onchange = (e) => {
    paperTheme = e.target.value;
    render();
  };
  const qi = $('#pp-q', v);
  qi.oninput = () => {
    paperQuery = qi.value;
    render();
    const again = $('#pp-q');
    again.focus();
    again.setSelectionRange(again.value.length, again.value.length);
  };
}

function openPaper(id, parentId = null) {
  const existing = id ? S.papers.find((p) => p.id === id) : null;
  const p = existing
    ? structuredClone(existing)
    : { id: uid(), created: Date.now(), title: '', authors: '', journal: '', year: '', kind: '雑誌の記事', lang: 'ja', themes: [], status: 'want', rating: 0, tags: [], comment: '', readOn: '', minutes: '', parent: parentId, photos: [] };
  const parent = p.parent ? S.papers.find((x) => x.id === p.parent) : null;
  const children = S.papers.filter((x) => x.parent === p.id);

  const draw = () => {
    const sheet = openSheet(existing ? '文献' : parent ? '参考文献から登録' : '文献を登録', `
      ${parent ? `<p class="small">↳ 「${esc(parent.title)}」の参考文献から</p>` : ''}
      ${photoBlockHTML(p.photos || [], 'その他')}
      <div class="card">
        <h2>題名などをClaudeで読み取る</h2>
        <p class="muted" style="margin:0 0 8px">① を押してClaudeのアプリに写真と一緒に送り、返事のコード欄をコピーして ② を押すと、下の欄に入ります（手で入れてもOK）。</p>
        <div class="row"><button type="button" class="btn sub grow" id="pp-copy">① 頼む文章をコピー</button><button type="button" class="btn sub grow" id="pp-paste">② 貼り付ける</button></div>
      </div>
      <label class="field"><span>題名</span><textarea id="pp-title" style="min-height:56px">${esc(p.title)}</textarea></label>
      <label class="field"><span>著者</span><input type="text" id="pp-auth" value="${esc(p.authors)}"></label>
      <div class="row">
        <label class="field grow"><span>雑誌・出典</span><input type="text" id="pp-jour" value="${esc(p.journal)}"></label>
        <label class="field" style="width:90px"><span>年</span><input type="text" inputmode="numeric" id="pp-year" value="${esc(p.year)}"></label>
      </div>
      <h3>種類</h3>${choicesHTML('ppkind', PAPER_KINDS.map((x) => [x, x]), p.kind)}
      <h3>テーマ</h3>${multiHTML('pptheme', PAPER_THEMES, p.themes)}
      <h3>状態</h3>${choicesHTML('ppst', PAPER_STATUS, p.status)}
      <div class="card" style="margin-top:12px">
        <h2>読み終えたら</h2>
        <h3>評価</h3>${choicesHTML('pprate', [1, 2, 3, 4, 5].map((n) => [String(n), '★'.repeat(n)]), p.rating ? String(p.rating) : null)}
        <h3>当てはまるもの</h3>${multiHTML('pptag', PAPER_TAGS, p.tags)}
        <label class="field"><span class="row" style="justify-content:space-between">読後のコメント（分かったこと、自分の臨床でどう使うか） ${voiceBtn('pp-com')}</span><textarea id="pp-com" style="min-height:110px">${esc(p.comment)}</textarea></label>
        <div class="row">
          <label class="field grow"><span>読み終えた日</span><input type="date" id="pp-read" value="${esc(p.readOn || '')}"></label>
          <label class="field" style="width:110px"><span>読んだ時間</span><input type="number" inputmode="numeric" id="pp-min" value="${esc(p.minutes)}" placeholder="分"></label>
        </div>
        <p class="muted" style="margin:0">英語の文献で読んだ時間を入れると、英語の時間にも入ります。</p>
      </div>
      ${
        existing
          ? `<div class="card"><h2>参考文献からたどる <span>${children.length}件</span></h2>
        ${children.map((c) => `<div class="list-item" data-child="${c.id}">↳ ${esc(c.title || '（題名なし）')} <span class="small">${esc(PAPER_STATUS.find((s) => s[0] === c.status)?.[1] || '')}</span></div>`).join('')}
        <button type="button" class="btn sub wide" id="pp-addref" style="margin-top:8px">＋ この文献の参考文献から登録</button></div>`
          : ''
      }
      <div class="row"><button class="btn grow" id="pp-save">保存</button>${existing ? '<button class="btn ghost" id="pp-del">削除</button>' : ''}</div>`);

    const sync = () => {
      p.title = $('#pp-title', sheet).value.trim();
      p.authors = $('#pp-auth', sheet).value.trim();
      p.journal = $('#pp-jour', sheet).value.trim();
      p.year = $('#pp-year', sheet).value.trim();
      p.kind = picked(sheet, 'ppkind') || p.kind;
      p.lang = p.kind === '英語論文' ? 'en' : p.lang;
      p.themes = readMulti(sheet, 'pptheme');
      p.status = picked(sheet, 'ppst') || 'want';
      p.rating = Number(picked(sheet, 'pprate')) || 0;
      p.tags = readMulti(sheet, 'pptag');
      p.comment = $('#pp-com', sheet).value;
      p.readOn = $('#pp-read', sheet).value;
      p.minutes = $('#pp-min', sheet).value;
      if (p.status === 'done' && !p.readOn) p.readOn = today();
    };
    const store = () => {
      const i = S.papers.findIndex((x) => x.id === p.id);
      if (i >= 0) S.papers[i] = p;
      else S.papers.push(p);
      // 英語の文献を読んだ時間は、英語の記録にも入れる（1件につき1つ）
      if (p.lang === 'en' && p.status === 'done' && Number(p.minutes) > 0) {
        const log = S.engLogs.find((x) => x.paperId === p.id);
        const rec = { date: p.readOn, minutes: Number(p.minutes), kind: 'paper', kindLabel: '英語の論文', skills: ['読む'], memo: p.title.slice(0, 40), paperId: p.id };
        if (log) Object.assign(log, rec);
        else S.engLogs.push({ id: uid(), created: Date.now(), ...rec });
        save('engLogs');
      }
      save('papers');
    };
    const redraw = () => {
      const top = $('.sheet').scrollTop;
      draw();
      $('.sheet').scrollTop = top;
    };
    ['ppkind', 'ppst', 'pprate'].forEach((n) => bindChoices(sheet, n, () => {}));
    bindPhotoBlock(sheet, p.id, p.photos || [], (list) => {
      sync();
      p.photos = list;
      const stored = S.papers.find((x) => x.id === p.id);
      if (stored) {
        stored.photos = list;
        save('papers');
      }
      redraw();
    });
    $('#pp-copy', sheet).onclick = async () => {
      try {
        await navigator.clipboard.writeText(PAPER_PROMPT);
        toast('コピーしました。Claudeのアプリに写真と一緒に貼り付けてください', 3500);
      } catch {
        toast('自動でコピーできませんでした', 3500);
      }
    };
    $('#pp-paste', sheet).onclick = async () => {
      let text = '';
      try {
        text = await navigator.clipboard.readText();
      } catch {
        text = prompt('Claudeの返事を貼り付けてください') || '';
      }
      try {
        const d = parsePaperReply(text);
        sync();
        p.title = d.title || p.title;
        p.authors = d.authors || p.authors;
        p.journal = d.journal || p.journal;
        p.year = String(d.year || p.year || '');
        if (PAPER_KINDS.includes(d.kind)) p.kind = d.kind;
        if (d.lang === 'en' || d.lang === 'ja') p.lang = d.lang;
        const th = (Array.isArray(d.themes) ? d.themes : []).filter((x) => PAPER_THEMES.includes(x));
        if (th.length) p.themes = [...new Set([...p.themes, ...th])];
        redraw();
        toast('読み取った内容を入れました。確認してください', 3500);
      } catch {
        toast('まとめの部分が見つかりませんでした。返事の最後のコード欄をコピーしてください', 5000);
      }
    };
    $$('[data-child]', sheet).forEach((el) => (el.onclick = () => openPaper(el.dataset.child)));
    $('#pp-addref', sheet)?.addEventListener('click', () => {
      sync();
      store();
      openPaper(null, p.id);
    });
    $('#pp-save', sheet).onclick = () => {
      sync();
      if (!p.title && !(p.photos || []).length) return toast('題名か写真を入れてください');
      store();
      closeSheet();
      toast(existing ? '保存しました' : '登録しました');
      render();
    };
    $('#pp-del', sheet)?.addEventListener('click', () => {
      if (!confirm('この文献を消しますか？')) return;
      S.papers = S.papers.filter((x) => x.id !== p.id);
      S.papers.forEach((x) => x.parent === p.id && (x.parent = null));
      S.engLogs = S.engLogs.filter((x) => x.paperId !== p.id);
      (p.photos || []).forEach((ph) => photoDel(ph.id));
      save('papers');
      save('engLogs');
      closeSheet();
      render();
    });
  };
  draw();
}

/* ========== 雑務（領収書・振込・書類など） ========== */
// 期限と「何日過ぎたか」を見えるようにして、ためないようにする。毎月・毎週くり返すものは、終えると次の回を自動で作る。
const CHORE_CATS = ['領収書', '振込', '書類', '連絡', '買い物', 'その他'];
const choreOpen = () => S.chores.filter((c) => !c.done);
function nextDue(c) {
  const base = parseYmd(c.due || today());
  if (c.repeat?.type === 'weekly') {
    base.setDate(base.getDate() + 7);
    return ymd(base);
  }
  if (c.repeat?.type === 'monthly') {
    const d = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(c.repeat.day, last));
    return ymd(d);
  }
  return null;
}
const repeatText = (r) => (r?.type === 'monthly' ? `毎月${r.startOffset ? `${r.day - r.startOffset}〜` : ''}${r.day}日` : r?.type === 'weekly' ? `毎週${WD[r.wd]}曜` : '');
// 開始日がある雑務は、その日から「取りかかる期間」になる
const choreActive = (c) => !c.done && c.start && c.start <= today() && (!c.due || c.due >= today());

function completeChore(c) {
  const t = today();
  c.done = t;
  if (c.repeat) {
    const due = nextDue(c);
    const start = c.repeat.startOffset ? addDays(due, -c.repeat.startOffset) : '';
    S.chores.push({ id: uid(), created: Date.now(), title: c.title, cat: c.cat, start, due, repeat: c.repeat, note: c.note, done: null });
  }
  save('chores');
  const late = c.due ? daysBetween(c.due, t) : 0;
  toast(late > 0 ? `終わりました（期限から${late}日）。次は早めにいきましょう` : '終わりました！期限内です');
  render();
}

function renderChores(v) {
  const t = today();
  const open = choreOpen().sort((a, b) => ((a.due || '9999') < (b.due || '9999') ? -1 : 1));
  const over = open.filter((c) => c.due && c.due < t);
  const now = open.filter((c) => c.due === t || (c.due > t && choreActive(c)));
  const soon = open.filter((c) => c.due && c.due > t && !choreActive(c));
  const noDue = open.filter((c) => !c.due);
  const done = S.chores.filter((c) => c.done).sort((a, b) => (a.done < b.done ? 1 : -1));
  const monthDone = done.filter((c) => monthKey(c.done) === monthKey(t));
  const onTime = monthDone.filter((c) => !c.due || c.done <= c.due).length;
  const row = (c) => {
    const late = c.due && c.due < t ? daysBetween(c.due, t) : 0;
    const dueTxt = !c.due
      ? ''
      : late
        ? `<b style="color:var(--warn)">期限から${late}日</b>`
        : c.due === t
          ? '<b>今日まで</b>'
          : c.start && c.start > t
            ? c.start === c.due
              ? `${jpDate(c.due)}`
              : `${jpDate(c.start)}から${jpDate(c.due)}まで`
            : `${jpDate(c.due)}まで（あと${daysBetween(t, c.due)}日）`;
    return `<div class="check" style="align-items:flex-start"><input type="checkbox" data-chdone="${c.id}">
      <div class="grow" data-ch="${c.id}"><div>${esc(c.title)}</div><div class="meta">${esc(c.cat)}${dueTxt ? ` ・ ${dueTxt}` : ''}${c.repeat ? ` ・ 🔁${repeatText(c.repeat)}` : ''}</div></div></div>`;
  };
  const block = (title, list) => (list.length ? `<h3>${title}</h3>${list.map(row).join('')}` : '');
  // 「今日まで」の見出しは、期間中のものも含めて「今やること」にする
  v.innerHTML = `
    <div class="card">
      <h2>雑務 <span>${open.length}件</span></h2>
      <div class="row"><input type="text" id="ch-quick" class="grow" placeholder="例：A社に振込、領収書を整理"><button class="btn sm" id="ch-add">追加</button></div>
      <p class="muted" style="margin:6px 0 0">期限やくり返しを決めるときは、追加したあとに押して開きます。</p>
    </div>
    <div class="card">
      ${open.length ? block(`期限を過ぎた ${over.length}件`, over) + block('今やること', now) + block('これから', soon) + block('期限なし', noDue) : '<p class="muted">ためている雑務はありません。すっきりですね！</p>'}
    </div>
    <div class="card">
      <h2>今月終えた <span>${monthDone.length}件</span></h2>
      <p class="small" style="margin:0 0 6px">期限内 ${onTime}件 ・ 遅れ ${monthDone.length - onTime}件</p>
      ${done.slice(0, 10).map((c) => `<div class="list-item" data-ch="${c.id}"><div class="row" style="justify-content:space-between"><span>${esc(c.title)}</span><span class="small">${jpDate(c.done)}</span></div>
        <div class="meta">${c.due && c.done > c.due ? `期限から${daysBetween(c.due, c.done)}日遅れ` : '期限内'}</div></div>`).join('')}
    </div>`;
  const add = () => {
    const title = $('#ch-quick', v).value.trim();
    if (!title) return;
    const cat = CHORE_CATS.find((k) => title.includes(k)) || (/振込|振り込/.test(title) ? '振込' : /領収/.test(title) ? '領収書' : 'その他');
    S.chores.push({ id: uid(), created: Date.now(), title, cat, due: '', repeat: null, note: '', done: null });
    save('chores');
    render();
  };
  $('#ch-add', v).onclick = add;
  $('#ch-quick', v).onkeydown = (e) => e.key === 'Enter' && add();
  $$('[data-chdone]', v).forEach((b) => (b.onchange = () => completeChore(S.chores.find((c) => c.id === b.dataset.chdone))));
  $$('[data-ch]', v).forEach((el) => (el.onclick = () => openChore(el.dataset.ch)));
}

function openChore(id) {
  const existing = S.chores.find((c) => c.id === id);
  const c = { ...existing };
  const rt = c.repeat?.type || 'none';
  const sheet = openSheet('雑務', `
    <label class="field"><span>やること</span><input type="text" id="cd-title" value="${esc(c.title)}"></label>
    <h3>分類</h3>${choicesHTML('chcat', CHORE_CATS.map((x) => [x, x]), c.cat)}
    <div class="row">
      <label class="field grow"><span>取りかかる日（任意）</span><input type="date" id="cd-start" value="${esc(c.start || '')}"></label>
      <label class="field grow"><span>期限</span><input type="date" id="cd-due" value="${esc(c.due || '')}"></label>
    </div>
    <div class="row">${[['今日', 0], ['明日', 1], ['3日後', 3], ['1週間後', 7]].map(([l, n]) => `<button type="button" class="btn ghost sm" data-in="${n}">${l}</button>`).join('')}</div>
    <h3>くり返し</h3>${choicesHTML('chrep', [['none', 'なし'], ['weekly', '毎週'], ['monthly', '毎月']], rt)}
    <p class="muted" style="margin:4px 0 0">毎週は期限の曜日、毎月は期限の日付でくり返します。終えると次の回が自動でできます。</p>
    <label class="field"><span class="row" style="justify-content:space-between">メモ（振込先、金額、必要な書類など） ${voiceBtn('cd-note')}</span><textarea id="cd-note">${esc(c.note || '')}</textarea></label>
    <div class="row"><button class="btn grow" id="cd-save">保存</button>${c.done ? '<button class="btn sub" id="cd-undo">未完了に戻す</button>' : '<button class="btn sub" id="cd-done">終えた</button>'}<button class="btn ghost" id="cd-del">削除</button></div>`);
  bindChoices(sheet, 'chcat', () => {});
  bindChoices(sheet, 'chrep', () => {});
  $$('[data-in]', sheet).forEach((b) => (b.onclick = () => ($('#cd-due', sheet).value = addDays(today(), Number(b.dataset.in)))));
  const sync = () => {
    c.title = $('#cd-title', sheet).value.trim() || c.title;
    c.cat = picked(sheet, 'chcat') || 'その他';
    c.due = $('#cd-due', sheet).value;
    c.start = $('#cd-start', sheet).value;
    if (c.start && c.due && c.start > c.due) c.start = c.due;
    c.note = $('#cd-note', sheet).value;
    const r = picked(sheet, 'chrep') || 'none';
    if (r !== 'none' && !c.due) c.due = today();
    c.repeat = r === 'weekly' ? { type: 'weekly', wd: parseYmd(c.due).getDay() } : r === 'monthly' ? { type: 'monthly', day: parseYmd(c.due).getDate() } : null;
    if (c.repeat && c.start) c.repeat.startOffset = daysBetween(c.start, c.due);
    Object.assign(existing, c);
    save('chores');
  };
  $('#cd-save', sheet).onclick = () => {
    sync();
    closeSheet();
    render();
  };
  $('#cd-done', sheet)?.addEventListener('click', () => {
    sync();
    closeSheet();
    completeChore(existing);
  });
  $('#cd-undo', sheet)?.addEventListener('click', () => {
    existing.done = null;
    save('chores');
    closeSheet();
    render();
  });
  $('#cd-del', sheet).onclick = () => {
    if (!confirm('この雑務を消しますか？')) return;
    S.chores = S.chores.filter((x) => x.id !== id);
    save('chores');
    closeSheet();
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

/* ========== エラーを画面に出す（原因を調べるため） ========== */
function showError(where, err) {
  const msg = `${where}：${err?.name || ''} ${err?.message || err}`.slice(0, 300);
  const box = document.createElement('div');
  box.className = 'errbox';
  box.innerHTML = `<b>エラーが起きました</b><div>${esc(msg)}</div><div class="small">この画面をスクリーンショットで送ってください。</div><button class="btn sm">閉じる</button>`;
  $('button', box).onclick = () => box.remove();
  document.body.appendChild(box);
}
window.addEventListener('error', (e) => showError('画面', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError('処理', e.reason));

/* ========== 起動 ========== */
(async function start() {
  db = await openDB();
  for (const k of KEYS) {
    const val = await dbGet(k);
    S[k] = val === undefined ? structuredClone(DEFAULTS[k]) : val;
  }
  if (!S.settings.clinicDays) S.settings.clinicDays = [...DEFAULTS.settings.clinicDays];
  if (!S.settings.receiptSeeded) {
    const t = today();
    let y = Number(t.slice(0, 4));
    let m = Number(t.slice(5, 7));
    if (Number(t.slice(8, 10)) > 10) m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    const d = (n) => `${y}-${String(m).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
    S.chores.push(
      { id: uid(), created: Date.now(), title: 'レセプトのチェック', cat: '書類', start: d(5), due: d(9), repeat: { type: 'monthly', day: 9, startOffset: 4 }, note: '10日の提出までに見直す', done: null },
      { id: uid(), created: Date.now() + 1, title: 'レセプトの提出', cat: '書類', start: d(10), due: d(10), repeat: { type: 'monthly', day: 10, startOffset: 0 }, note: '', done: null }
    );
    S.settings.receiptSeeded = true;
    save('chores');
    save('settings');
  }
  // 文献のタグ「読む価値なし」は「あまり参考にならなかった」に名前を変えた
  S.papers.forEach((x) => (x.tags = (x.tags || []).map((t) => (t === '読む価値なし' ? 'あまり参考にならなかった' : t))));
  // カルテのチェックは、この機能を使い始めた日から数える
  if (!S.settings.chartFrom) {
    S.settings.chartFrom = today();
    save('settings');
  }
  if (!S.settings.firstUse) {
    S.settings.firstUse = new Date().toISOString();
    save('settings');
  }
  navigator.storage?.persist?.();
  cleanOrphanPhotos().catch(() => {});
  if ('serviceWorker' in navigator) {
    // 新しい版が入ったら、1回だけ自動で読み込み直す
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || $('.sheet-bg')) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker
      .register('sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update())
      .catch(() => {});
  }
  render();
})();
