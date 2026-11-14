(function () {
  // Finds the login token your app already stores (localStorage/sessionStorage key containing "token").
  function getToken() {
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (!/token/i.test(k)) continue;
        let v = store.getItem(k);
        try { const o = JSON.parse(v); v = o.access_token || o.token || v; } catch (e) {}
        if (typeof v === "string" && v.length > 20) return v.replace(/^Bearer\s+/i, "");
      }
    }
    return null;
  }

  const css = `
  #ai-fab{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:#4f46e5;color:#fff;font-size:26px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);z-index:9999}
  #ai-box{position:fixed;right:20px;bottom:88px;width:360px;max-width:calc(100vw - 40px);height:480px;max-height:70vh;background:#fff;color:#111;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;z-index:9999;font:14px/1.4 system-ui,sans-serif}
  #ai-box.open{display:flex}
  #ai-head{background:#4f46e5;color:#fff;padding:10px 14px;font-weight:600;display:flex;justify-content:space-between}
  #ai-head button{background:none;border:0;color:#fff;cursor:pointer;font-size:12px}
  #ai-msgs{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:8px;background:#f5f5f8}
  .ai-m{max-width:85%;padding:8px 10px;border-radius:10px;white-space:pre-wrap;word-wrap:break-word}
  .ai-u{align-self:flex-end;background:#4f46e5;color:#fff}
  .ai-b{align-self:flex-start;background:#fff;border:1px solid #ddd}
  #ai-form{display:flex;gap:6px;padding:8px;border-top:1px solid #ddd;background:#fff}
  #ai-in{flex:1;padding:8px;border:1px solid #ccc;border-radius:8px;font:inherit}
  #ai-send{padding:0 14px;border:0;border-radius:8px;background:#4f46e5;color:#fff;cursor:pointer}
  #ai-send:disabled{opacity:.5}`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const fab = document.createElement("button");
  fab.id = "ai-fab"; fab.title = "Trợ lý AI"; fab.textContent = "💬";
  const box = document.createElement("div");
  box.id = "ai-box";
  box.innerHTML = `<div id="ai-head"><span>Trợ lý đặt phòng</span><button id="ai-new">Cuộc mới</button></div>
    <div id="ai-msgs"></div>
    <form id="ai-form"><input id="ai-in" placeholder="Hỏi về phòng trống, đặt phòng..." autocomplete="off" maxlength="1000"><button id="ai-send">Gửi</button></form>`;
  document.body.append(fab, box);

  const msgs = box.querySelector("#ai-msgs");
  const input = box.querySelector("#ai-in");
  const send = box.querySelector("#ai-send");
  let convId = null;

  function add(text, who) {
    const d = document.createElement("div");
    d.className = "ai-m " + (who === "u" ? "ai-u" : "ai-b");
    d.textContent = text;           // textContent: no HTML injection
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function reset() {
    convId = null; msgs.innerHTML = "";
    add("Xin chào! Mình giúp bạn tìm phòng trống, gợi ý phòng phù hợp và đặt phòng.", "b");
  }
  reset();

  fab.onclick = () => { box.classList.toggle("open"); if (box.classList.contains("open")) input.focus(); };
  box.querySelector("#ai-new").onclick = reset;

  box.querySelector("#ai-form").onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const token = getToken();
    if (!token) { add("Bạn cần đăng nhập trước khi dùng trợ lý.", "b"); return; }
    input.value = ""; add(text, "u");
    send.disabled = true;
    const wait = add("Đang trả lời...", "b");
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ message: text, conversation_id: convId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { wait.textContent = body.detail || body.message || "Có lỗi xảy ra (" + res.status + ")"; }
      else {
        convId = body.data.conversation_id;
        wait.textContent = body.data.answer;
        if (body.data.booking_id) window.dispatchEvent(new CustomEvent("uniroom:booking-created", { detail: body.data }));
      }
    } catch (err) { wait.textContent = "Không kết nối được máy chủ."; }
    send.disabled = false; msgs.scrollTop = msgs.scrollHeight;
  };
})();