function log(msg) {
  console.log(msg);
  const el = document.getElementById("log");
  if (el) el.textContent += msg + "\n";
}
log("script.js 読み込みOK");

// Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCjB5Fs6TBqF_WSHlH5XKf9EOi1APpE-ww",
  authDomain: "teambuilding-7a17c.firebaseapp.com",
  projectId: "teambuilding-7a17c",
  storageBucket: "teambuilding-7a17c.firebasestorage.app",
  messagingSenderId: "901002422228",
  appId: "1:901002422228:web:ac6817c3241dbef8a61841"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===== 固定設定 =====
const players = ["player1", "player2", "player3", "player4", "player5"];

// ✅ 指示書PDF（GitHub Pages上のパス）
// まずは「pdf/ファイル名.pdf」で置いた前提
const instructionPdf = {
  player1: "pdf/bucho.pdf",
  player2: "pdf/kachoA.pdf",
  player3: "pdf/kachoB.pdf",
  player4: "pdf/shainA.pdf",
  player5: "pdf/shainB.pdf",
};

function showInstructionIfDealt(hand) {
  const box = document.getElementById("instructionBox");
  if (!box) return;

  // 配布前は表示しない（手札4枚になったら表示）
  if (!Array.isArray(hand) || hand.length !== 4) {
    box.textContent = "カード配布後に表示されます。";
    return;
  }

  const rel = instructionPdf[me];
  if (!rel) {
    box.textContent = "指示書が設定されていません。";
    return;
  }

  const url = `${basePath()}/${rel}`; // basePath() は既存の関数を使う想定

  // ① ダウンロード/別タブで開くリンク
  box.innerHTML = `
    <div>あなたの指示書：<b>${playerLabel[me]}</b></div>
    <div style="margin-top:6px;">
      <a href="${url}" target="_blank" rel="noopener">指示書PDFを開く（別タブ）</a>
      &nbsp;|&nbsp;
      <a href="${url}" download>ダウンロード</a>
    </div>
    <div style="margin-top:10px;">
      <iframe src="${url}" style="width:100%; height:520px; border:1px solid #ddd; border-radius:10px;"></iframe>
    </div>
  `;
}


const playerLabel = {
  player1: "部長",
  player2: "課長A",
  player3: "課長B",
  player4: "社員A",
  player5: "社員B"
};

// 交換可能
const allowedPartners = {
  player1: ["player2", "player3"],
  player2: ["player1", "player4"],
  player3: ["player1", "player5"],
  player4: ["player2"],
  player5: ["player3"]
};

// ✅ メッセージ可能（直属のみ）
const messagePeers = {
  player1: ["player2", "player3"], // 部長 ⇄ 課長A,課長B
  player2: ["player1", "player4"], // 課長A ⇄ 部長,社員A
  player3: ["player1", "player5"], // 課長B ⇄ 部長,社員B
  player4: ["player2"],           // 社員A ⇄ 課長A
  player5: ["player3"]            // 社員B ⇄ 課長B
};

// カード
function cardText(v) { return String(v ?? "").trim(); }
function normType(v) {
  const s = String(v ?? "").trim();
  if (s === "環境") return "environment";
  if (s === "予算") return "budget";
  if (s === "リスクマネジメント") return "riskmgmt";
  if (s === "人材") return "people";
  if (s === "品質") return "quality";
  if (s === "時間") return "time";
  return "budget";
}

// URLパラメータ
function params() { return new URLSearchParams(location.search); }
const q = params();

// ベースURLなら運営
const isAdmin = (q.get("admin") === "1") || (!q.has("me") && !q.has("admin"));
const me = (q.get("me") || "player1").trim();

// room
let roomId = (q.get("room") || "").trim();

function genRoomId() {
  const r = Math.random().toString(36).slice(2, 7);
  const t = Date.now().toString(36).slice(-5);
  return `room-${t}${r}`;
}
function basePath() {
  return `${location.origin}${location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "")}`;
}
function goto(url) { location.href = url; }

// 運営で room 無いなら自動生成して遷移
if (isAdmin && !roomId) {
  goto(`${basePath()}/?admin=1&room=${encodeURIComponent(genRoomId())}`);
}
roomId = roomId || "room1";

if (!players.includes(me)) {
  alert("URLの me が不正です。?me=player1 のように指定してください。");
  throw new Error("invalid me");
}

// 表示
const meLabelEl = document.getElementById("meLabel");
if (meLabelEl) {
  meLabelEl.textContent = isAdmin
    ? `あなた：運営（部屋：${roomId}）`
    : `あなたの役職：${playerLabel[me]}（部屋：${roomId}）`;
}
const roomLabelEl = document.getElementById("roomLabel");
if (roomLabelEl) roomLabelEl.textContent = roomId;

// Firestore参照（room対応）
const roomDoc = () => db.collection("rooms").doc(roomId);
const playerRef = (pid) => roomDoc().collection("players").doc(pid);
const tradesCol = roomDoc().collection("trades");
const messagesCol = roomDoc().collection("messages");

// 共通
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
async function ensurePlayerDoc(pid) {
  const ref = playerRef(pid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ name: pid, hand: [], selectedCard: null }, { merge: true });
    log(`players/${pid} を作成しました`);
  }
}

// --- 匿名ログイン ---
firebase.auth().signInAnonymously()
  .then(() => {
    log("匿名ログインOK");
    initAfterLogin();
  })
  .catch(err => {
    console.error(err);
    alert("匿名ログイン失敗: " + (err?.message || err));
  });

async function initAfterLogin() {
  await ensurePlayerDoc(me);

  if (isAdmin) {
    for (const pid of players) await ensurePlayerDoc(pid);
    setupAdminPanel();
  }

  renderPartners();
  subscribeHand();
  subscribeIncoming();
  subscribeOutgoing();

  // ✅ メッセージ
  renderMessagePeers();
  subscribeMessages(); // ← これが「相手側で見えない」の対策を含む
}

// ===== 運営パネル =====
function setupAdminPanel() {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;
  panel.style.display = "block";

  const ul = document.getElementById("inviteLinks");
  if (!ul) return;
  ul.innerHTML = "";

  const base = basePath();
  players.forEach(pid => {
    const url = `${base}/index.html?me=${pid}&room=${encodeURIComponent(roomId)}`;

    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${playerLabel[pid]}：`;

    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.textContent = url;
    a.style.marginRight = "8px";

    const btn = document.createElement("button");
    btn.textContent = "コピー";
    btn.onclick = async () => {
      try { await navigator.clipboard.writeText(url); alert(`${playerLabel[pid]} のURLをコピーしました`); }
      catch { prompt("コピーできない場合、ここからコピーしてください", url); }
    };

    li.appendChild(label); li.appendChild(a); li.appendChild(btn);
    ul.appendChild(li);
  });
}
function newRoom() {
  goto(`${basePath()}/?admin=1&room=${encodeURIComponent(genRoomId())}`);
}
function goRoom() {
  const v = (document.getElementById("roomInput")?.value || "").trim();
  if (!v) return alert("部屋IDを入力してください（例：tokyoA）");
  goto(`${basePath()}/?admin=1&room=${encodeURIComponent(v)}`);
}

// ===== 交換 =====
function renderPartners() {
  const sel = document.getElementById("partnerSelect");
  if (!sel) return;
  sel.innerHTML = "";
  (allowedPartners[me] || []).forEach(pid => {
    const o = document.createElement("option");
    o.value = pid;
    o.textContent = playerLabel[pid];
    sel.appendChild(o);
  });
}

async function dealCards() {
  if (!isAdmin) return alert("運営のみ実行可能です");
  log("配布開始（部屋：" + roomId + "）");

  const cardsSnap = await db.collection("cards").get();
  const deck = cardsSnap.docs.map(d => String(d.data().type ?? "").trim());
  if (deck.length !== 20) return alert(`cards が ${deck.length} 枚です（20枚必要）`);
  if (deck.some(x => !x)) return alert("cards の type が空のものがあります");

  shuffle(deck);

  const batch = db.batch();
  players.forEach(pid => {
    batch.set(playerRef(pid), { hand: deck.splice(0, 4), selectedCard: null }, { merge: true });
  });
  await batch.commit();
  alert("配布完了（部屋：" + roomId + "）");
}

async function showHand() {
  await ensurePlayerDoc(me);
  const snap = await playerRef(me).get();
  if (!snap.exists) return alert("プレイヤーデータが存在しません");
  renderHandFromData(snap.data());
}

function subscribeHand() {
  playerRef(me).onSnapshot((snap) => {
    if (!snap.exists) return;
    renderHandFromData(snap.data());
  }, (err) => alert("手札監視でエラー: " + (err?.message || err)));
}

function renderHandFromData(data) {
  const hand = Array.isArray(data.hand) ? data.hand : [];
  showInstructionIfDealt(hand);

  const selected = data.selectedCard ?? null;

  document.getElementById("handTitle").textContent = `${playerLabel[me]}の手札`;
  document.getElementById("selectedText").textContent = `選択中：${selected ? cardText(selected) : "なし"}`;

  const ul = document.getElementById("hand");
  if (!ul) return;
  ul.innerHTML = "";

  hand.forEach(card => {
    const li = document.createElement("li");
    li.className = `card clickable type-${normType(card)}${selected === card ? " selected" : ""}`;

    const title = document.createElement("div");
    title.className = "card-title";
    title.textContent = cardText(card);

    const sub = document.createElement("div");
    sub.className = "card-sub";
    sub.textContent = "クリックで選択";

    li.appendChild(title);
    li.appendChild(sub);

    li.onclick = async () => {
      await playerRef(me).set({ selectedCard: card }, { merge: true });
    };
    ul.appendChild(li);
  });
}

async function requestTrade() {
  const partner = document.getElementById("partnerSelect")?.value;
  if (!partner) return alert("交換相手を選んでください");
  if (!(allowedPartners[me] || []).includes(partner)) return alert("その相手とは交換できません（ルール違反）");

  await ensurePlayerDoc(me);
  await ensurePlayerDoc(partner);

  const meData = (await playerRef(me).get()).data() || {};
  const give = meData.selectedCard ?? null;
  const myHand = Array.isArray(meData.hand) ? meData.hand : [];

  if (!give) return alert("手札のカードをクリックして選択してください");
  if (!myHand.includes(give)) return alert("selectedCard が hand にありません（不整合）");

  await tradesCol.add({
    from: me, to: partner, fromCard: give, status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert(`提案しました：${playerLabel[partner]}へ（${cardText(give)}）`);
}

function subscribeOutgoing() {
  const ul = document.getElementById("outgoing");
  if (!ul) return;

  tradesCol.where("from", "==", me).onSnapshot((snap) => {
    ul.innerHTML = "";
    const pending = snap.docs.map(d => d.data()).filter(t => t.status === "pending");
    if (pending.length === 0) { const li = document.createElement("li"); li.textContent = "（なし）"; ul.appendChild(li); return; }

    pending.forEach(t => {
      const li = document.createElement("li");
      li.className = `card type-${normType(t.fromCard)}`;

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = cardText(t.fromCard);

      const sub = document.createElement("div");
      sub.className = "card-sub";
      sub.textContent = `${playerLabel[t.to]} に提案中`;

      li.appendChild(title); li.appendChild(sub);
      ul.appendChild(li);
    });
  });
}

function subscribeIncoming() {
  const ul = document.getElementById("incoming");
  if (!ul) return;

  tradesCol.where("to", "==", me).onSnapshot((snap) => {
    ul.innerHTML = "";
    const pending = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.status === "pending");
    if (pending.length === 0) { const li = document.createElement("li"); li.textContent = "（なし）"; ul.appendChild(li); return; }

    pending.forEach(t => {
      const li = document.createElement("li");
      li.className = `card type-${normType(t.fromCard)}`;

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = cardText(t.fromCard);

      const sub = document.createElement("div");
      sub.className = "card-sub";
      sub.textContent = `${playerLabel[t.from]} からの交換依頼`;

      const btnrow = document.createElement("div");
      btnrow.className = "btnrow";

      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "承認して交換";
      acceptBtn.onclick = () => acceptTrade(t.id);

      const rejectBtn = document.createElement("button");
      rejectBtn.textContent = "拒否";
      rejectBtn.onclick = () => rejectTrade(t.id);

      btnrow.appendChild(acceptBtn);
      btnrow.appendChild(rejectBtn);

      li.appendChild(title);
      li.appendChild(sub);
      li.appendChild(btnrow);

      ul.appendChild(li);
    });
  });
}

async function acceptTrade(tradeId) {
  await db.runTransaction(async (tx) => {
    const tradeRef = tradesCol.doc(tradeId);
    const tradeSnap = await tx.get(tradeRef);
    if (!tradeSnap.exists) throw new Error("trade が存在しません");

    const t = tradeSnap.data();
    if (t.status !== "pending") throw new Error("すでに処理済みです");
    if (t.to !== me) throw new Error("自分宛ではありません");

    if (!(allowedPartners[t.from] || []).includes(t.to)) throw new Error("ルール違反の交換です");
    if (!(allowedPartners[t.to] || []).includes(t.from)) throw new Error("ルール違反の交換です");

    const fromRef = playerRef(t.from);
    const toRef = playerRef(t.to);

    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);

    const fromData = fromSnap.data() || {};
    const toData = toSnap.data() || {};

    const fromHand = Array.isArray(fromData.hand) ? fromData.hand.slice() : [];
    const toHand = Array.isArray(toData.hand) ? toData.hand.slice() : [];

    const fromGive = t.fromCard;
    const toGive = toData.selectedCard ?? null;

    if (!fromGive) throw new Error("相手の出すカードがありません");
    if (!toGive) throw new Error("承認前に、あなたも手札から『渡す1枚』を選んでください");
    if (!fromHand.includes(fromGive)) throw new Error("相手のカードが手札にありません（不整合）");
    if (!toHand.includes(toGive)) throw new Error("あなたの selectedCard が手札にありません（不整合）");

    fromHand.splice(fromHand.indexOf(fromGive), 1);
    toHand.splice(toHand.indexOf(toGive), 1);

    fromHand.push(toGive);
    toHand.push(fromGive);

    tx.set(fromRef, { hand: fromHand, selectedCard: null }, { merge: true });
    tx.set(toRef, { hand: toHand, selectedCard: null }, { merge: true });
    tx.update(tradeRef, { status: "done", toCard: toGive, doneAt: firebase.firestore.FieldValue.serverTimestamp() });
  });

  alert("交換完了！（部屋：" + roomId + "）");
}

async function rejectTrade(tradeId) {
  const tradeRef = tradesCol.doc(tradeId);
  const snap = await tradeRef.get();
  if (!snap.exists) return;

  const t = snap.data();
  if (t.to !== me) return alert("自分宛ではありません");
  if (t.status !== "pending") return alert("すでに処理済みです");

  await tradeRef.update({ status: "rejected", rejectedAt: firebase.firestore.FieldValue.serverTimestamp() });
  alert("拒否しました");
}

// ===== ✅ メッセージ（安定版 + 通知）=====

// 送信先の選択肢（直属のみ）
function renderMessagePeers() {
  const sel = document.getElementById("msgTo");
  const hint = document.getElementById("msgHint");
  if (!sel) return;

  sel.innerHTML = "";
  const peers = messagePeers[me] || [];

  if (peers.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "（送信できる相手がいません）";
    sel.appendChild(o);
    if (hint) hint.textContent = "";
    return;
  }

  peers.forEach(pid => {
    const o = document.createElement("option");
    o.value = pid;
    o.textContent = playerLabel[pid];
    sel.appendChild(o);
  });

  if (hint) hint.textContent = `あなたの直属：${peers.map(pid => playerLabel[pid]).join(" / ")}`;
}

// ✅ 送信：serverTimestamp + clientAt(数値) を両方入れる（これが安定の鍵）
async function sendMessage() {
  const to = document.getElementById("msgTo")?.value;
  const textEl = document.getElementById("msgText");
  const text = (textEl?.value || "").trim();

  if (!to) return alert("送信先を選んでください");
  if (!(messagePeers[me] || []).includes(to)) return alert("直属以外には送信できません");
  if (!text) return alert("メッセージを入力してください");

  await ensurePlayerDoc(me);
  await ensurePlayerDoc(to);

  await messagesCol.add({
    from: me,
    to,
    text,
    clientAt: Date.now(), // ✅ 並び/通知用
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  textEl.value = "";
}

// トースト通知（画面右下に出す）
let toastTimer = null;
function toast(msg) {
  let box = document.getElementById("toast");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast";
    box.style.position = "fixed";
    box.style.right = "16px";
    box.style.bottom = "16px";
    box.style.padding = "10px 12px";
    box.style.borderRadius = "12px";
    box.style.background = "rgba(0,0,0,0.82)";
    box.style.color = "white";
    box.style.fontSize = "13px";
    box.style.maxWidth = "320px";
    box.style.zIndex = "9999";
    box.style.boxShadow = "0 6px 16px rgba(0,0,0,0.25)";
    document.body.appendChild(box);
  }
  box.textContent = msg;
  box.style.display = "block";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.style.display = "none"; }, 2500);
}

// メッセージ監視：room内の最新100件を監視して、クライアント側で「自分の直属だけ」抽出
// ===== メッセージ（監視・表示・カウント）=====

let msgUnsub = null;
let msgInitialLoaded = false;
const msgCache = new Map(); // id -> msg
let lastNotifiedClientAt = 0;

function updateMsgCount(n) {
  const el = document.getElementById("msgCount");
  if (el) el.textContent = String(n);
}

// メッセージ監視：この部屋の最新100件（研修用途なら十分）
// ※総数は「この監視に入っている件数」を表示します（0〜100）
function subscribeMessages() {
  if (msgUnsub) msgUnsub();

  msgInitialLoaded = false;
  msgCache.clear();
  lastNotifiedClientAt = 0;

  msgUnsub = messagesCol
    .orderBy("clientAt", "asc")
    .limitToLast(100)
    .onSnapshot((snap) => {

      // ✅ ここで必ずカウント更新（監視と同じタイミングで確実に増える）
      updateMsgCount(snap.size);

      const changes = snap.docChanges();

      changes.forEach(ch => {
        const m = { id: ch.doc.id, ...ch.doc.data() };
        msgCache.set(m.id, m);

        // 通知は「初回ロード後」「自分宛て」「直属から」「新規追加」のみ
        if (msgInitialLoaded && ch.type === "added") {
          const allowed = new Set(messagePeers[me] || []);
          const isToMe = m.to === me;
          const fromAllowed = allowed.has(m.from);

          if (isToMe && fromAllowed && (m.clientAt || 0) > lastNotifiedClientAt) {
            lastNotifiedClientAt = m.clientAt || lastNotifiedClientAt;
            toast(`新着メッセージ：${playerLabel[m.from]} から`);
          }
        }
      });

      if (!msgInitialLoaded) {
        // 初回ロードでは通知しない（既存分の最大 clientAt を記録）
        for (const m of msgCache.values()) {
          lastNotifiedClientAt = Math.max(lastNotifiedClientAt, m.clientAt || 0);
        }
        msgInitialLoaded = true;
      }

      renderMessages();
    }, (err) => {
      console.error(err);
      alert("メッセージ監視でエラー: " + (err?.message || err));
    });
}

function formatTimeClient(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderMessages() {
  const box = document.getElementById("msgList");
  if (!box) return;

  const allowed = new Set(messagePeers[me] || []);

  // 自分と直属のやり取りだけ表示
  const arr = Array.from(msgCache.values())
    .filter(m =>
      (m.from === me && allowed.has(m.to)) ||
      (m.to === me && allowed.has(m.from))
    )
    .sort((a, b) => (a.clientAt || 0) - (b.clientAt || 0));

  box.innerHTML = "";

  if (arr.length === 0) {
    box.textContent = "（メッセージはまだありません）";
    return;
  }

  for (const m of arr) {
    const div = document.createElement("div");
    const mine = m.from === me;
    div.className = `msgItem ${mine ? "msgMine" : "msgTheirs"}`;
    div.textContent = m.text;

    const meta = document.createElement("div");
    meta.className = "msgMeta";
    const who = mine ? `→ ${playerLabel[m.to]}` : `${playerLabel[m.from]} → あなた`;
    meta.textContent = `${who}　${formatTimeClient(m.clientAt)}`;

    div.appendChild(meta);
    box.appendChild(div);
  }

  box.scrollTop = box.scrollHeight;
}

// ===== グローバル（HTMLボタン用）=====
window.newRoom = newRoom;
window.goRoom = goRoom;
window.dealCards = dealCards;
window.showHand = showHand;
window.requestTrade = requestTrade;
window.acceptTrade = acceptTrade;
window.rejectTrade = rejectTrade;
window.sendMessage = sendMessage;





