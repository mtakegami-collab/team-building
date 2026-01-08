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

// Firebase 初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const roomId = "room1";
const players = ["player1", "player2", "player3", "player4", "player5"];

// 表示名
const playerLabel = {
  player1: "部長",
  player2: "課長A",
  player3: "課長B",
  player4: "社員A",
  player5: "社員B"
};

// 交換可能な相手（指定ルール）
const allowedPartners = {
  player1: ["player2", "player3"],
  player2: ["player1", "player4"],
  player3: ["player1", "player5"],
  player4: ["player2"],
  player5: ["player3"]
};

function params() {
  return new URLSearchParams(location.search);
}

const me = params().get("me") || "player1";
const isAdmin = params().get("admin") === "1";

if (!players.includes(me)) {
  alert("URLの me が不正です。?me=player1 のように指定してください。");
  throw new Error("invalid me");
}

// 表示
document.getElementById("meLabel").textContent =
  isAdmin ? `あなた：運営（admin=1） / 画面の本人役職：${playerLabel[me]}` : `あなたの役職：${playerLabel[me]}（固定）`;

// Firestore参照
const playerRef = (p) => db.collection("rooms").doc(roomId).collection("players").doc(p);
const tradesCol = db.collection("rooms").doc(roomId).collection("trades");

// シャッフル
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// --- ここから「運営パネル」表示＆URL生成 ---
if (isAdmin) {
  document.getElementById("adminPanel").style.display = "block";
  const ul = document.getElementById("inviteLinks");
  ul.innerHTML = "";

  // GitHub Pages でも確実に index.html を含める
const base = `${location.origin}${location.pathname.replace(/\/index\.html$/, "")}`;

  players.forEach(p => {
    const li = document.createElement("li");
const url = `${base}/index.html?me=${p}`;
    li.textContent = `${playerLabel[p]}：${url}`;
    ul.appendChild(li);
  });
}

// --- 匿名ログイン（Firestoreルールでauth必須にした場合に必要） ---
firebase.auth().signInAnonymously()
  .then(() => {
    log("匿名ログインOK");
    // ログインが完了してから監視や初期化を始める
    initAfterLogin();
  })
  .catch(err => {
    console.error(err);
    alert("匿名ログイン失敗: " + (err?.message || err));
  });

// ログイン後にまとめて起動
function initAfterLogin() {
  renderPartners();
  subscribeIncoming(); // ここで受信監視開始
}

// 交換相手の選択肢を描画
function renderPartners() {
  const partnerSelect = document.getElementById("partnerSelect");
  partnerSelect.innerHTML = "";

  (allowedPartners[me] || []).forEach(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = playerLabel[p];
    partnerSelect.appendChild(o);
  });
}

// 配布（運営のみ）
async function dealCards() {
  if (!isAdmin) {
    alert("運営のみ実行可能です");
    return;
  }

  log("配布開始");

  const cardsSnap = await db.collection("cards").get();
  const deck = cardsSnap.docs.map(d => d.data().type);

  if (deck.length !== 20) {
    alert(`cards が ${deck.length} 枚です（20枚必要）`);
    return;
  }

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

// 手札表示
async function showHand() {
  const snap = await playerRef(me).get();
  if (!snap.exists) {
    alert("プレイヤーデータが存在しません。Firestoreの players を確認してください。");
    return;
  }

  const data = snap.data();
  const ul = document.getElementById("hand");
  ul.innerHTML = "";

  document.getElementById("handTitle").textContent = `${playerLabel[me]}の手札`;
  document.getElementById("selectedText").textContent = `選択中：${data.selectedCard || "なし"}`;

  (data.hand || []).forEach(card => {
    const li = document.createElement("li");
    li.textContent = card;
    li.style.cursor = "pointer";
    if (data.selectedCard === card) li.style.fontWeight = "bold";

    li.onclick = async () => {
      await playerRef(me).update({ selectedCard: card });
      showHand();
    };

    ul.appendChild(li);
  });
}

// 交換リクエスト
async function requestTrade() {
  const partnerSelect = document.getElementById("partnerSelect");
  const partner = partnerSelect.value;

  if (!(allowedPartners[me] || []).includes(partner)) {
    alert("その相手とは交換できません（ルール違反）");
    return;
  }

  const meSnap = await playerRef(me).get();
  const meData = meSnap.data() || {};

  if (!meData.selectedCard) {
    alert("交換に出すカードを、手札からクリックして選択してください");
    return;
  }

  await tradesCol.add({
    from: me,
    to: partner,
    fromCard: meData.selectedCard,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  alert("交換リクエスト送信");
}

// ✅ 受信監視（ここが修正点）
// 以前：where(to==me).where(status==pending) → 複合インデックスが必要になりやすい
// 今回：where(to==me) だけにして、ブラウザ側で pending を絞り込む
function subscribeIncoming() {
  tradesCol
    .where("to", "==", me)
    .onSnapshot((snap) => {
      const ul = document.getElementById("incoming");
      ul.innerHTML = "";

      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.status === "pending");

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

// グローバル公開
window.dealCards = dealCards;
window.showHand = showHand;
window.requestTrade = requestTrade;

