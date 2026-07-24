/**
 * HTML chat panel for player ↔ agent conversations.
 * Lives above the Pixi canvas so typing works normally.
 */

export function createConversationUi() {
  const root = document.createElement("div");
  root.id = "convo-ui";
  root.className = "convo-ui hidden";
  root.innerHTML = `
    <div class="convo-panel">
      <div class="convo-header">
        <div class="convo-title">
          Talking with <span id="convo-name">…</span>
        </div>
        <button type="button" id="convo-close" class="convo-close" title="End chat (Esc)">✕</button>
      </div>
      <div id="convo-log" class="convo-log"></div>
      <form id="convo-form" class="convo-form">
        <input
          id="convo-input"
          class="convo-input"
          type="text"
          maxlength="200"
          autocomplete="off"
          placeholder="Type a message… Enter to send"
        />
        <button type="submit" class="convo-send">Send</button>
      </form>
      <div class="convo-hint">Esc ends conversation · agent stays put while chatting</div>
    </div>
  `;
  document.body.appendChild(root);

  const nameEl = root.querySelector("#convo-name");
  const logEl = root.querySelector("#convo-log");
  const form = root.querySelector("#convo-form");
  const input = root.querySelector("#convo-input");
  const closeBtn = root.querySelector("#convo-close");

  let onSend = null;
  let onClose = null;

  function open(agentName) {
    nameEl.textContent = agentName;
    logEl.innerHTML = "";
    root.classList.remove("hidden");
    input.value = "";
    setTimeout(() => input.focus(), 30);
  }

  function close() {
    root.classList.add("hidden");
    input.blur();
  }

  function isOpen() {
    return !root.classList.contains("hidden");
  }

  function addLine(from, text, kind = "") {
    const row = document.createElement("div");
    row.className = `convo-line ${kind}`.trim();
    const who = document.createElement("span");
    who.className = "convo-who";
    who.textContent = from;
    const msg = document.createElement("span");
    msg.className = "convo-msg";
    msg.textContent = text;
    row.appendChild(who);
    row.appendChild(document.createTextNode(": "));
    row.appendChild(msg);
    logEl.appendChild(row);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setBusy(busy) {
    input.disabled = busy;
    form.querySelector(".convo-send").disabled = busy;
    if (!busy) {
      input.focus();
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !onSend) {
      return;
    }
    input.value = "";
    onSend(text);
  });

  closeBtn.addEventListener("click", () => {
    if (onClose) {
      onClose();
    }
  });

  // Stop game keys while focused in the input
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.code === "Escape") {
      e.preventDefault();
      if (onClose) {
        onClose();
      }
    }
  });

  root.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      if (onClose) {
        onClose();
      }
    }
  });

  return {
    open,
    close,
    isOpen,
    addLine,
    setBusy,
    focus: () => input.focus(),
    setHandlers({ send, close: closeHandler }) {
      onSend = send;
      onClose = closeHandler;
    }
  };
}
