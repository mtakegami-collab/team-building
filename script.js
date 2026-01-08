function log(msg) {
  console.log(msg);
  const el = document.getElementById("log");
  if (el) el.textContent += msg + "\n";
}

log("script.js 読み込みOK");

// firebaseConfig（あなたの値）
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
log("Firebase 初期化OK");

const roomId = "room1";
const players = ["player1", "player2", "player3", "player4", "player5"];

// 表示名（役職名）
const playerLabel = {
  player1: "部長",
  player2: "課長A",
  player3: "課長B",
  player4: "社員A",
  player5: "社員B"
};
function labelOf(pid) {
  return playerLabel[pid] ?? pid;
}

// カード表示名（英語でも日本語でも日本語表示）
const cardLabel = {
  budget: "予算",
  people: "人材",
  quality: "品質",
  risk: "リスク",
  time: "時間",
  "予算": "予算",
  "人材": "人材",
  "品質": "品質",
  "リスク": "リスク",
  "時間": "時間"
};
function cardText(v) {
  return cardLabel[v] ?? String(v);
}

// 交換可能な相手（指定ルール）
const allowedPartners = {
  player1: ["player2", "player3"],
  player2: ["player1", "player4"],
  player3: ["player1", "player5"],
  player4: ["player2"],
  player5: ["player3"]
};

let incomingUnsub = null;

// URLパラメータ
function params() {
  return new URLSearchParams(location.search);
}
function isAdmin() {
  return params().get("admin") === "1";
}
function getMeFromUrl() {
  return params().get("me");
}

// 自分ID（参加者は me=playerX、運営は me が無くてもOKにする）
let me = getMeFromUrl();
if (!me) me = "player1"; // admin用に仮（表示用）
if (!players.includes(me)) {
  alert("URLに ?me=player1 のように指定してください（player1〜player5）");
  throw new Error("me is missing or invalid");
}

// Firestore参照
function playerRef(playerId) {
  return db.collection("rooms").doc(roomId).collection("players").doc(playerId);
}
function tradesRef() {
  return db.collection("rooms").doc(roomId).collection("trades");
}

// シャッフル
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// UI初期表示
document.getElementById("meLabel").textContent =
  isAdmin()
    ? `あなた：運営（admin=1） / 画面の本人役職：${labelOf(me)}`
    : `あなたの役職：${labelOf(me)}（固定）`;

document.getElementById("handTitle").textContent = `${labelOf(me)} の手札`;

// 管理者パネル表示＆URL生成
function setupAdminPanel() {
  const panel = document.getElementById("adminPanel");
  if (!panel) return;

  if (!isAdmin()) {
    panel.style.display = "none";
    return;
  }

  panel.style.display = "block";

  // 現在URLをベースに、me=playerX を作る
  // 例: https://xxx/index.html?admin=1  -> https://xxx/index.html?me=player1
  const baseUrl = new URL(location.href);
  baseUrl.searchParams.delete("admin"); // 参加者にはadminを渡さない
  baseUrl.searchParams.delete("me");    // me を付け直す

  const ul = document.getElementById("inviteLinks");
  ul.innerHTML = "";

  players.forEach(pid => {
    const u = new URL(baseUrl.toString());
    u.searchParams.set("me", pid);

    const li = document.createElement("li");

    const label = document.createElement("div");
    label.textContent = `${labelOf(pid)}：`;
    label.style.fontWeight = "bold";

    const link = document.createElement("a");
    link.href = u.toString();
    link.textContent = u.toString();
    link.target = "_blank";

    const btn = document.createElement("button");
    btn.textContent = "コピー";
    btn.style.marginLeft = "8px";
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(u.toString());
        alert(`${labelOf(pid)} のURLをコピーしました`);
      } catch (e) {
        // クリップボードが使えない環境向けフォールバック
        prompt("コピーできない場合、ここからコピーしてください", u.toString());
      }
    };

    li.appendChild(label);
    li.appendChild(link);
    li.appendChild(btn);

    ul.appendChild(li);
  });
}

// 交換相手候補（自分固定）
function renderPartnerOptions() {
  const partnerSelect = document.getElementById("partnerSelect");
  partnerSelect.innerHTML = "";

  (allowedPartners[me] || []).forEach(pid => {
    const opt = document.createElement("option");
    opt.value = pid;
    opt.textContent = labelOf(pid);
    partnerSelect.appendChild(opt);
  });
}

// 受信中リクエスト監視（自分宛）
function subscribeIncoming() {
  if (incomingUnsub) incomingUnsub();

  const list = document.getElementById("incoming");
  list.innerHTML = "";

  incomingUnsub = tradesRef()
    .where("to", "==", me)
    .where("status", "==", "pending")
    .onSnapshot((snap) => {
      list.innerHTML = "";
      if (snap.empty) {
        const li = document.createElement("li");
        li.textContent = "（なし）";
        list.appendChild(li);
        return;
      }

      snap.docs.forEach(doc => {
        const t = doc.data();
        const li = document.createElement("li");

        li.innerHTML = `
          <div>
            <strong>${labelOf(t.from)}</strong> から交換依頼：
            相手が出すカード = <strong>${cardText(t.fromCard)}</strong>
            <br/>
            <button>承認して交換</button>
            <button>拒否</button>
          </div>
        `;

        const [acceptBtn, rejectBtn] = li.querySelectorAll("button");
        acceptBtn.onclick = () => acceptTrade(doc.id);
        rejectBtn.onclick = () => rejectTrade(doc.id);

        list.appendChild(li);
      });
    }, (err) => {
      console.error(err);
      alert("受信監視でエラー。Console を確認してください。");
    });
}

// ★運営のみ配布可能（admin=1 以外は弾く）
async function dealCards() {
  if (!isAdmin()) {
    alert("配布は運営（admin=1）だけが実行できます");
    return;
  }

  log("=== DEAL START (ADMIN) ===");

  const cardsSnap = await db.collection("cards").get();
  log("cards: " + cardsSnap.size);

  const deck = cardsSnap.docs.map(d => d.data().type);

  if (deck.length !== 20) {
    alert(`cards が ${deck.length} 枚です（20枚必要）`);
    return;
  }
  if (deck.some(x => x === undefined || x === null || x === "")) {
    alert("cards の type が空のものがあります");
    return;
  }

  shuffle(deck);

  const batch = db.batch();
  for (const pid of players) {
    const hand = deck.splice(0, 4);
    batch.update(playerRef(pid), { hand, selectedCard: null });
    log(`${labelOf(pid)} => ${JSON.stringify(hand.map(cardText))}`);
  }

  await batch.commit();
  log("=== DEAL DONE ===");
  alert("配布完了！");
}

// 自分の手札表示（クリックで選択）
async function showHand() {
  log(`--- SHOW HAND: ${labelOf(me)} ---`);

  const ref = playerRef(me);
  const snap = await ref.get();
  if (!snap.exists) {
    alert(`${labelOf(me)} が存在しません（Firestoreのplayersを確認）`);
    return;
  }

  const data = snap.data();
  const hand = Array.isArray(data.hand) ? data.hand : [];
  const selected = data.selectedCard ?? null;

  document.getElementById("selectedText").textContent =
    `選択中：${selected ? cardText(selected) : "なし"}`;

  const ul = document.getElementById("hand");
  ul.innerHTML = "";

  hand.forEach(card => {
    const li = document.createElement("li");
    li.textContent = cardText(card);
    li.style.cursor = "pointer";
    if (selected === card) li.style.fontWeight = "bold";

    li.onclick = async () => {
      await ref.update({ selectedCard: card });
      log(`${labelOf(me)} selectedCard => ${cardText(card)}`);
      showHand();
    };

    ul.appendChild(li);
  });

  log(`hand length: ${hand.length}`);
}

// 交換リクエスト送信
async function requestTrade() {
  const partner = document.getElementById("partnerSelect").value;

  if (!(allowedPartners[me] || []).includes(partner)) {
    alert("その相手とは交換できません（ルール違反）");
    return;
  }

  const meSnap = await playerRef(me).get();
  const meData = meSnap.data() || {};
  const give = meData.selectedCard ?? null;
  const myHand = Array.isArray(meData.hand) ? meData.hand : [];

  if (!give) {
    alert("まず自分の手札から、交換に出す1枚をクリックして選択してください");
    return;
  }
  if (!myHand.includes(give)) {
    alert("selectedCard が hand にありません（不整合）");
    return;
  }

  const existing = await tradesRef()
    .where("from", "==", me)
    .where("to", "==", partner)
    .where("status", "==", "pending")
    .get();

  if (!existing.empty) {
    alert("同じ相手への未処理リクエストが既にあります。相手の承認を待ってください。");
    return;
  }

  const doc = await tradesRef().add({
    from: me,
    to: partner,
    fromCard: give,
    status: "pending",
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  log(`trade requested: ${doc.id} (${labelOf(me)} -> ${labelOf(partner)}) give=${cardText(give)}`);
  alert(`交換リクエスト送信：${labelOf(partner)}へ（出すカード：${cardText(give)}）`);
}

// 承認して交換（トランザクション）
async function acceptTrade(tradeId) {
  await db.runTransaction(async (tx) => {
    const tradeDocRef = tradesRef().doc(tradeId);
    const tradeSnap = await tx.get(tradeDocRef);
    if (!tradeSnap.exists) throw new Error("trade が存在しません");

    const t = tradeSnap.data();

    if (t.status !== "pending") throw new Error("すでに処理済みです");
    if (t.to !== me) throw new Error("自分宛ではありません");

    // ルールチェック
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
    if (!toGive) throw new Error("承認前に、自分の出すカードを手札から選択してください");

    if (!fromHand.includes(fromGive)) throw new Error("相手のカードが手札にありません（不整合）");
    if (!toHand.includes(toGive)) throw new Error("自分の selectedCard が手札にありません（不整合）");

    fromHand.splice(fromHand.indexOf(fromGive), 1);
    toHand.splice(toHand.indexOf(toGive), 1);

    fromHand.push(toGive);
    toHand.push(fromGive);

    tx.update(fromRef, { hand: fromHand, selectedCard: null });
    tx.update(toRef, { hand: toHand, selectedCard: null });

    tx.update(tradeDocRef, {
      status: "done",
      toCard: toGive,
      doneAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  });

  log(`trade accepted: ${tradeId}`);
  alert("交換完了！手札が更新されました。");
  showHand();
}

// 拒否
async function rejectTrade(tradeId) {
  const ref = tradesRef().doc(tradeId);
  const snap = await ref.get();
  if (!snap.exists) return;

  const t = snap.data();
  if (t.to !== me) {
    alert("自分宛ではありません");
    return;
  }
  if (t.status !== "pending") {
    alert("すでに処理済みです");
    return;
  }

  await ref.update({
    status: "rejected",
    rejectedAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  log(`trade rejected: ${tradeId}`);
}

window.dealCards = dealCards;
window.showHand = showHand;
window.requestTrade = requestTrade;
window.acceptTrade = acceptTrade;
window.rejectTrade = rejectTrade;

// 初期化
setupAdminPanel();
renderPartnerOptions();
subscribeIncoming();
