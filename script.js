function log(msg) {
  console.log(msg);
  const el = document.getElementById("log");
  if (el) el.textContent += msg + "\n";
}
log("script.js 読み込みOK");

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

const roomId = "room1";
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

// ✅ カード名（日本語前提）
const cardLabel = {
  "環境": "環境",
  "予算": "予算",
  "リスクマネジメント": "リスクマネジメント",
  "人材": "人材",
  "品質": "品質",
  "時間": "時間"
};
function cardText(v) {
  const s = String(v ?? "").trim();
  return cardLabel[s] ?? s;
}

// ✅ 色分けの判定（日本語カード名で確実に判定）
function normType(v) {
  const s = String(v ?? "").trim();
  if (s === "環境") return "environment";
  if (s === "予算") return "budget";
  if (s === "リスクマネジメント") return "riskmgmt";
  if (s === "人材") return "people";
  if (s === "品質") return "quality";
  if (s === "時間") return "time";
  return "budget"; // 不明は仮
}

function params() { return new URLSearchParams(location.search); }
const me = (params().get("me") || "player1").trim();
const isAdmin = params().get("admin") === "1";

if (!players.includes(me)) {
  alert("URLの me が不正です。?me=player1 のように指定してください。");
  throw new Error("invalid me");
}

document.getElementById("meLabel").textContent =
  isAdmin ? `あなた：運営（admin=1）` : `あなたの役職：${playerLabel[me]}（固定）`;

const playerRef = (p) => db.collection("rooms").doc(roomId).collection("players").doc(p);
const tradesCol = db.collection("rooms").doc(roomId).collection("trades");

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
  subscribeIncoming();
  subscribeOutgoing(); // ✅ 送信中表示
}

function setupAdminPanel() {
  document.getElementById("adminPanel").style.display = "block";
  const ul = document.getElementById("inviteLinks");
  ul.innerHTML = "";

  // index.html が二重にならないベース
  const base = `${location.origin}${location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "")}`;

  players.forEach(p => {
    const url = `${base}/index.html?me=${p}`;

    const li = document.createElement("li");

    const label = document.createElement("span");
    label.textContent = `${playerLabel[p]}：`;

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
        alert(`${playerLabel[p]} のURLをコピーしました`);
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

function renderPartners() {
  const sel = document.getElementById("partnerSelect");
  sel.innerHTML = "";
  (allowedPartners[me] || []).forEach(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = playerLabel[p];
    sel.appendChild(o);
  });
}

// 運営：配布
async function dealCards() {
  if (!isAdmin) return alert("運営のみ実行可能です");
  log("配布開始");

  const cardsSnap = await db.collection("cards").get();
  const deck = cardsSnap.docs.map(d => String(d.data().type ?? "").trim());

  if (deck.length !== 20) return alert(`cards が ${deck.length} 枚です（20枚必要）`);
  if (deck.some(x => !x)) return alert("cards の type が空のものがあります");

  shuffle(deck);

  const batch = db.batch();
  players.forEach(p => {
    batch.update(playerRef(p), { hand: deck.splice(0, 4), selectedCard: null });
  });

  await batch.commit();
  alert("配布完了");
}

// 手札（カード型）
async function showHand() {
  const snap = await playerRef(me).get();
  if (!snap.exists) return alert("プレイヤーデータが存在しません（Firestoreのplayersを確認）");

  const data = snap.data();
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
      showHand();
    };

    ul.appendChild(li);
  });
}

// 交換リクエスト（自分→相手）
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

// ✅ 送信中（自分→相手）の表示
function subscribeOutgoing() {
  tradesCol.where("from", "==", me).onSnapshot((snap) => {
    const ul = document.getElementById("outgoing");
    ul.innerHTML = "";

    const pending = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.status === "pending");

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
  }, (err) => {
    console.error(err);
    alert("送信中監視でエラー: " + (err?.message || err));
  });
}

// 受信（相手→自分）
function subscribeIncoming() {
  tradesCol.where("to", "==", me).onSnapshot((snap) => {
    const ul = document.getElementById("incoming");
    ul.innerHTML = "";

    const pending = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.status === "pending");

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
  }, (err) => {
    console.error(err);
    alert("受信監視でエラー: " + (err?.message || err));
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

    // ルールチェック（双方向）
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

    const fromGive = t.fromCard;                // 相手が出す
    const toGive = toData.selectedCard ?? null; // 自分が出す（手札で選択）

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

    tx.update(tradeRef, {
      status: "done",
      toCard: toGive,
      doneAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  alert("交換完了！手札を更新します。");
  showHand();
}

async function rejectTrade(tradeId) {
  const tradeRef = tradesCol.doc(tradeId);
  const snap = await tradeRef.get();
  if (!snap.exists) return;

  const t = snap.data();
  if (t.to !== me) return alert("自分宛ではありません");
  if (t.status !== "pending") return alert("すでに処理済みです");

  await tradeRef.update({
    status: "rejected",
    rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("拒否しました");
}

// グローバル
window.dealCards = dealCards;
window.showHand = showHand;
window.requestTrade = requestTrade;
window.acceptTrade = acceptTrade;
window.rejectTrade = rejectTrade;
