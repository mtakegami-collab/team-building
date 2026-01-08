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

// 固定設定
const players = ["player1", "player2", "player3", "player4", "player5"];
const playerLabel = {
  player1: "部長",
  player2: "課長A",
  player3: "課長B",
  player4: "社員A",
  player5: "社員B"
};
const allowedPartners = {
  player1: ["player2", "player3"],
  player2: ["player1", "player4"],
  player3: ["player1", "player5"],
  player4: ["player2"],
  player5: ["player3"]
};

// カード名（日本語前提）
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

// ✅ ベースURL（何も無し）なら運営
const isAdmin = (q.get("admin") === "1") || (!q.has("me") && !q.has("admin"));
const me = (q.get("me") || "player1").trim();

// ✅ room（部屋）をURLで受け取る（並行開催の鍵）
let roomId = (q.get("room") || "").trim();

// 運営がベースURLで来たら「部屋IDを自動生成して admin&room に遷移」する
function genRoomId() {
  const r = Math.random().toString(36).slice(2, 7);
  const t = Date.now().toString(36).slice(-5);
  return `room-${t}${r}`;
}
function basePath() {
  // /team-building/ でも /team-building/index.html でも対応
  const base = `${location.origin}${location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "")}`;
  return base;
}
function goto(url) { location.href = url; }

// ✅ 運営で room が無い場合は自動で作って移動
if (isAdmin && !roomId) {
  const newId = genRoomId();
  const url = `${basePath()}/?admin=1&room=${encodeURIComponent(newId)}`;
  goto(url);
}

// room がまだ空（参加者がroom無しで来た等）なら room1 に落とす
roomId = roomId || "room1";

if (!players.includes(me)) {
  alert("URLの me が不正です。?me=player1 のように指定してください。");
  throw new Error("invalid me");
}

// 表示
const meLabel = document.getElementById("meLabel");
if (meLabel) {
  meLabel.textContent = isAdmin
    ? `あなた：運営（部屋：${roomId}）`
    : `あなたの役職：${playerLabel[me]}（部屋：${roomId}）`;
}
const roomLabel = document.getElementById("roomLabel");
if (roomLabel) roomLabel.textContent = roomId;

// Firestore参照（✅ roomId を使う）
const playerRef = (pid) => db.collection("rooms").doc(roomId).collection("players").doc(pid);
const tradesCol = db.collection("rooms").doc(roomId).collection("trades");

// シャッフル
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
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

function initAfterLogin() {
  if (isAdmin) setupAdminPanel();
  renderPartners();
  subscribeHand();
  subscribeIncoming();
  subscribeOutgoing();
}

// 運営パネル：URL生成（room付き）＋コピー
function setupAdminPanel() {
  document.getElementById("adminPanel").style.display = "block";
  const ul = document.getElementById("inviteLinks");
  ul.innerHTML = "";

  const base = basePath();

  players.forEach(pid => {
    const url = `${base}/index.html?me=${pid}&room=${encodeURIComponent(roomId)}`;

    const li = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = `${playerLabel[pid]}：`;

    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.textContent = url;
    a.style.marginRight = "8px";

    const btn = document.createElement("button");
    btn.textContent = "コピー";
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        alert(`${playerLabel[pid]} のURLをコピーしました`);
      } catch {
        prompt("コピーできない場合、ここからコピーしてください", url);
      }
    };

    li.appendChild(label);
    li.appendChild(a);
    li.appendChild(btn);
    ul.appendChild(li);
  });
}

// 運営：新しい部屋を作る（別会場用）
function newRoom() {
  const newId = genRoomId();
  goto(`${basePath()}/?admin=1&room=${encodeURIComponent(newId)}`);
}

// 運営：部屋IDを入力して切替
function goRoom() {
  const v = (document.getElementById("roomInput").value || "").trim();
  if (!v) return alert("部屋IDを入力してください（例：tokyoA）");
  goto(`${basePath()}/?admin=1&room=${encodeURIComponent(v)}`);
}

// 交換相手選択肢
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

// 運営：配布（この部屋だけ）
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
    batch.update(playerRef(pid), { hand: deck.splice(0, 4), selectedCard: null });
  });

  await batch.commit();
  alert("配布完了（部屋：" + roomId + "）");
}

// 手札ボタン（任意）
async function showHand() {
  const snap = await playerRef(me).get();
  if (!snap.exists) return alert("プレイヤーデータが存在しません");
  renderHandFromData(snap.data());
}

// ✅ 手札リアルタイム監視（交換後、送信側も自動更新）
function subscribeHand() {
  playerRef(me).onSnapshot((snap) => {
    if (!snap.exists) return;
    renderHandFromData(snap.data());
  }, (err) => {
    console.error(err);
    alert("手札監視でエラー: " + (err?.message || err));
  });
}

// 描画
function renderHandFromData(data) {
  const hand = Array.isArray(data.hand) ? data.hand : [];
  const selected = data.selectedCard ?? null;

  document.getElementById("handTitle").textContent = `${playerLabel[me]}の手札`;
  document.getElementById("selectedText").textContent = `選択中：${selected ? cardText(selected) : "なし"}`;

  const ul = document.getElementById("hand");
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
      await playerRef(me).update({ selectedCard: card });
    };

    ul.appendChild(li);
  });
}

// 交換リクエスト
async function requestTrade() {
  const partner = document.getElementById("partnerSelect").value;

  if (!(allowedPartners[me] || []).includes(partner)) {
    alert("その相手とは交換できません（ルール違反）");
    return;
  }

  const meData = (await playerRef(me).get()).data() || {};
  const give = meData.selectedCard ?? null;
  const myHand = Array.isArray(meData.hand) ? meData.hand : [];

  if (!give) return alert("手札のカードをクリックして選択してください");
  if (!myHand.includes(give)) return alert("selectedCard が hand にありません（不整合）");

  await tradesCol.add({
    from: me,
    to: partner,
    fromCard: give,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert(`提案しました：${playerLabel[partner]}へ（${cardText(give)}）`);
}

// 送信中
function subscribeOutgoing() {
  tradesCol.where("from", "==", me).onSnapshot((snap) => {
    const ul = document.getElementById("outgoing");
    if (!ul) return;
    ul.innerHTML = "";

    const pending = snap.docs.map(d => d.data()).filter(t => t.status === "pending");
    if (pending.length === 0) {
      const li = document.createElement("li");
      li.textContent = "（なし）";
      ul.appendChild(li);
      return;
    }

    pending.forEach(t => {
      const li = document.createElement("li");
      li.className = `card type-${normType(t.fromCard)}`;

      const title = document.createElement("div");
      title.className = "card-title";
      title.textContent = cardText(t.fromCard);

      const sub = document.createElement("div");
      sub.className = "card-sub";
      sub.textContent = `${playerLabel[t.to]} に提案中`;

      li.appendChild(title);
      li.appendChild(sub);
      ul.appendChild(li);
    });
  });
}

// 受信
function subscribeIncoming() {
  tradesCol.where("to", "==", me).onSnapshot((snap) => {
    const ul = document.getElementById("incoming");
    if (!ul) return;
    ul.innerHTML = "";

    const pending = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.status === "pending");
    if (pending.length === 0) {
      const li = document.createElement("li");
      li.textContent = "（なし）";
      ul.appendChild(li);
      return;
    }

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

// 承認：手札を入れ替え
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

    tx.update(fromRef, { hand: fromHand, selectedCard: null });
    tx.update(toRef, { hand: toHand, selectedCard: null });

    tx.update(tradeRef, { status: "done", toCard: toGive, doneAt: firebase.firestore.FieldValue.serverTimestamp() });
  });

  alert("交換完了！（部屋：" + roomId + "）");
}

// 拒否
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

// グローバル
window.dealCards = dealCards;
window.showHand = showHand;
window.requestTrade = requestTrade;
window.acceptTrade = acceptTrade;
window.rejectTrade = rejectTrade;
window.newRoom = newRoom;
window.goRoom = goRoom;
