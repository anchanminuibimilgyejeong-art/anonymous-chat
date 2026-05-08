const messagesEl = document.querySelector("#messages");
const onlineCountEl = document.querySelector("#onlineCount");
const statusEl = document.querySelector("#status");
const form = document.querySelector("#chatForm");
const input = document.querySelector("#messageInput");
const nameGate = document.querySelector("#nameGate");
const nameForm = document.querySelector("#nameForm");
const nicknameInput = document.querySelector("#nicknameInput");

let source;
let hasMessages = false;
let nickname = "";

function setStatus(text, bad = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("bad", bad);
}

function showEmpty() {
  messagesEl.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = "아직 메시지가 없습니다.";
  messagesEl.append(empty);
}

function clearMessages() {
  hasMessages = false;
  showEmpty();
}

function addMessage(message) {
  if (!hasMessages) {
    messagesEl.innerHTML = "";
    hasMessages = true;
  }

  const item = document.createElement("article");
  item.className = "message";

  const meta = document.createElement("div");
  meta.className = "meta";

  const alias = document.createElement("span");
  alias.className = "alias";
  alias.textContent = message.alias || "익명";

  const time = document.createElement("time");
  time.dateTime = new Date(message.at).toISOString();
  time.textContent = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(message.at);

  const text = document.createElement("div");
  text.className = "text";
  text.textContent = message.text;

  meta.append(alias, time);
  item.append(meta, text);
  messagesEl.append(item);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function connect() {
  if (source) source.close();
  source = new EventSource("/events");

  source.addEventListener("open", () => setStatus("연결됨"));

  source.addEventListener("hello", (event) => {
    const data = JSON.parse(event.data);
    onlineCountEl.textContent = String(data.count || 0);
    hasMessages = false;
    if (Array.isArray(data.history) && data.history.length) {
      messagesEl.innerHTML = "";
      data.history.forEach(addMessage);
    } else {
      showEmpty();
    }
    setStatus("연결됨");
  });

  source.addEventListener("presence", (event) => {
    const data = JSON.parse(event.data);
    onlineCountEl.textContent = String(data.count || 0);
  });

  source.addEventListener("message", (event) => {
    addMessage(JSON.parse(event.data));
  });

  source.addEventListener("clear", () => {
    clearMessages();
    setStatus("초기화됨");
  });

  source.addEventListener("error", () => {
    if (source.readyState === EventSource.CLOSED) {
      setStatus("이미 접속 중", true);
      return;
    }
    setStatus("재연결 중", true);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch("/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, alias: nickname })
    });
    if (response.status === 429) {
      setStatus("천천히", true);
      return;
    }
    if (!response.ok) {
      setStatus("전송 실패", true);
      return;
    }
    input.value = "";
    setStatus("연결됨");
  } catch {
    setStatus("전송 실패", true);
  } finally {
    button.disabled = false;
    input.focus();
  }
});

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  nickname = nicknameInput.value.replace(/\s+/g, " ").trim().slice(0, 16);
  if (!nickname) return;
  nameGate.hidden = true;
  input.focus();
  setStatus("연결 중");
  showEmpty();
  connect();
});

showEmpty();
nicknameInput.focus();
