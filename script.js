function log(msg) {
  console.log(msg);
  const el = document.getElementById("log");
  if (el) el.textContent += msg + "\n";
}

log("script.js 読み込みOK");

// Firebase設定（あなたのプロジェクト）
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

function params() { return new URLSearchParams(location.search); }
const me = params().get("me") || "player1";
const isAdmin = params().get("admin") === "1";

document.getElementById("meLabel").textContent =
  isAdmin ? "あなた：運営（admin=1）" : `あなたの役職：${playerLabel[me]}（固定）`;

const playerRef = (p) => db.collection("rooms").doc(roomId).collection("players").doc(p);
const tradesCol = db.collection("rooms").doc(roomId).collection("trades");

// ---- 匿名ログイン（ルールでauth必須のため）----
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
}

function setupAdminPanel() {
  const panel = document.getElementById("adminPanel");
  panel.style.display = "block";

  const ul = document.getElementById("inviteLinks");
  ul.innerHTML = "";

  // ✅ index.html が二重にならないベースURL
  const base = `${location.origin}${location.pathname.replace(/\/index\.html$/, "").replace(/\/$/, "")}`;
  players.forEach(p => {
    const url = `${base}/index.html?me=${p}`;
    const li = document.createElement("li");
    li.textContent = `${playerLabel[p]}：${url}`;
    ul.appendChild(li);
  });
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

async function dealCards() {
  if (!isAdmin) return alert("運営のみ実行可能です");
  log("配布開始");

  const cardsSnap = await db.collection("cards").get();
  const deck = cardsSnap.docs.map(d => d.data().type);

  if (deck.length !== 20) return alert(`cards が ${deck.length} 枚です（20枚必要）`);

  shuffle(deck);

  const batch = db.batch();
  players.forEach(p => {
    batch.update(playerRef(p), {
      hand: deck.splice(0, 4),
      selectedCard: null
    });
  });

  await batch.commit();
  alert("配布完了");
}

async function showHand() {
  const snap = await playerRef(me).get();
  if (!snap.exists) {
    alert("プレイヤーデータが存在しません（Firestoreのplayersを確認）");
    return;
  }

  const data = snap.data();
  const hand = Array.isArray(data.hand) ? data.hand : [];
  const selected = data.selectedCard ?? null;

  document.getElementById("handTitle").textContent = `${playerLabel[me]}の手札`;
  document.getElementById("selectedText").textContent = `選択中：${selected || "なし"}`;

  const ul = document.getElementById("hand");
  ul.innerHTML = "";

  // ★ここが「カードっぽく」する部分
  hand.forEach(card => {
    const li = document.createElement("li");
    li.className = "card" + (selected === card ? " selected" : "");
    li.textContent = card;         // 表示文字（予算/人材/品質/リスク/時間）
    li.title = "クリックで選択";

    li.onclick = async () => {
      await playerRef(me).update({ selectedCard: card });
      showHand(); // 選択状態を再描画
    };

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

async function requestTrade() {
  const partner = document.getElementById("partnerSelect").value;

  if (!(allowedPartners[me] || []).includes(partner)) {
    alert("その相手とは交換できません（ルール違反）");
    return;
  }

  const meData = (await playerRef(me).get()).data() || {};
  if (!meData.selectedCard) return alert("カードをクリックして選択してください");

  await tradesCol.add({
    from: me,
    to: partner,
    fromCard: meData.selectedCard,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("交換リクエスト送信");
}

// 受信監視（権限・インデックス問題を避けるため to==me のみ）
function subscribeIncoming() {
  tradesCol.where("to", "==", me).onSnapshot((snap) => {
    const ul = document.getElementById("incoming");
    ul.innerHTML = "";

    const docs = snap.docs.map(d => d.data()).filter(t => t.status === "pending");
    if (docs.length === 0) {
      const li = document.createElement("li");
      li.textContent = "（なし）";
      ul.appendChild(li);
      return;
    }

    docs.forEach(t => {
      const li = document.createElement("li");
      li.textContent = `${playerLabel[t.from]}から：${t.fromCard}`;
      ul.appendChild(li);
    });
  }, (err) => {
    console.error(err);
    alert("受信監視でエラー: " + (err?.message || err));
  });
}

// グローバル
window.dealCards = dealCards;
window.showHand = showHand;
window.requestTrade = requestTrade;
