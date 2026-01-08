function log(msg) {
  console.log(msg);
  document.getElementById("log").textContent += msg + "\n";
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

// ★ 匿名ログイン（ここがSTEP3の本体）
firebase.auth().signInAnonymously()
  .then(() => log("匿名ログインOK"))
  .catch(err => {
    console.error(err);
    alert("匿名ログイン失敗。Consoleを確認してください");
  });

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
const allowedPartners = {
  player1: ["player2", "player3"],
  player2: ["player1", "player4"],
  player3: ["player1", "player5"],
  player4: ["player2"],
  player5: ["player3"]
};

const params = new URLSearchParams(location.search);
const me = params.get("me") || "player1";
const isAdmin = params.get("admin") === "1";

// 表示
document.getElementById("meLabel").textContent =
  isAdmin ? "あなた：運営" : `あなたの役職：${playerLabel[me]}`;

if (isAdmin) {
  document.getElementById("adminPanel").style.display = "block";
  const ul = document.getElementById("inviteLinks");
  ul.innerHTML = "";
  players.forEach(p => {
    const li = document.createElement("li");
    const url = `${location.origin}${location.pathname}?me=${p}`;
    li.textContent = `${playerLabel[p]}：${url}`;
    ul.appendChild(li);
  });
}

// Firestore参照
const playerRef = (p) =>
  db.collection("rooms").doc(roomId).collection("players").doc(p);
const tradesRef =
  db.collection("rooms").doc(roomId).collection("trades");

// シャッフル
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// 配布（運営のみ）
async function dealCards() {
  if (!isAdmin) return alert("運営のみ実行可能");

  const cardsSnap = await db.collection("cards").get();
  const deck = cardsSnap.docs.map(d => d.data().type);
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
  const data = snap.data();
  const ul = document.getElementById("hand");
  ul.innerHTML = "";

  document.getElementById("handTitle").textContent =
    `${playerLabel[me]}の手札`;

  document.getElementById("selectedText").textContent =
    `選択中：${data.selectedCard || "なし"}`;

  data.hand.forEach(card => {
    const li = document.createElement("li");
    li.textContent = card;
    li.style.cursor = "pointer";
    li.onclick = async () => {
      await playerRef(me).update({ selectedCard: card });
      showHand();
    };
    ul.appendChild(li);
  });
}

// 交換相手
const partnerSelect = document.getElementById("partnerSelect");
allowedPartners[me]?.forEach(p => {
  const o = document.createElement("option");
  o.value = p;
  o.textContent = playerLabel[p];
  partnerSelect.appendChild(o);
});

// 交換リクエスト
async function requestTrade() {
  const meData = (await playerRef(me).get()).data();
  if (!meData.selectedCard) {
    alert("カードを選択してください");
    return;
  }
  await tradesRef.add({
    from: me,
    to: partnerSelect.value,
    fromCard: meData.selectedCard,
    status: "pending"
  });
  alert("交換リクエスト送信");
}

// 受信監視
tradesRef
  .where("to", "==", me)
  .where("status", "==", "pending")
  .onSnapshot(snap => {
    const ul = document.getElementById("incoming");
    ul.innerHTML = "";
    snap.forEach(doc => {
      const t = doc.data();
      const li = document.createElement("li");
      li.textContent =
        `${playerLabel[t.from]}から：${t.fromCard}`;
      ul.appendChild(li);
    });
  });

// グローバル公開
window.dealCards = dealCards;
window.showHand = showHand;
window.requestTrade = requestTrade;
