async function api(url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  let d;
  try {
    d = await r.json();
  } catch {
    d = {};
  }
  if (!r.ok) throw new Error(d.detail || "Có lỗi xảy ra");
  return d;
}
function esc(x) {
  return String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function statusBadge(s) {
  let map = {
    pending: ["Chờ duyệt", "yellow"],
    approved: ["Đã duyệt", "green"],
    rejected: ["Từ chối", "red"],
    cancelled: ["Đã hủy", "gray"],
    completed: ["Hoàn tất", "blue"],
  };
  let x = map[s] || [s, "gray"];
  return `<span class="badge ${x[1]}">${x[0]}</span>`;
}
async function loadDashboard() {
  try {
    let d = await api("/api/dashboard");
    let st = document.querySelector("#dashStats");
    if (st)
      st.innerHTML = `<div class="stat"><span>Phòng hoạt động</span><b>${d.rooms}</b><small>Trong hệ thống</small></div><div class="stat"><span>Tổng booking</span><b>${d.total_bookings}</b><small>Lịch của bạn</small></div><div class="stat"><span>Chờ duyệt</span><b>${d.pending}</b><small>Cần theo dõi</small></div><div class="stat"><span>Đã xác nhận</span><b>${d.approved}</b><small>Booking approved</small></div>`;
    let b = await api("/api/bookings");
    let el = document.querySelector("#recentBookings");
    if (el)
      el.innerHTML =
        b
          .slice(0, 5)
          .map(
            (x) =>
              `<div class="booking-row"><div class="room-symbol">▦</div><div class="booking-info"><b>${esc(x.title)}</b><small>${esc(x.room)} · ${new Date(x.start).toLocaleString("vi-VN")}</small></div>${statusBadge(x.status)}</div>`,
          )
          .join("") ||
        '<p class="muted">Chưa có booking. Hãy đặt phòng đầu tiên.</p>';
    let rooms = await api("/api/rooms");
    let rp = document.querySelector("#roomPreview");
    if (rp) rp.innerHTML = rooms.slice(0, 3).map(roomCard).join("");
  } catch (e) {
    console.error(e);
  }
}
function roomCard(r) {
  return `<article class="room-card"><div class="room-top"><span class="room-symbol">▦</span><span class="tag">${esc(r.type)}</span></div><h3>${esc(r.name)}</h3><p>${esc(r.code)} · Tòa ${esc(r.building)} · Tầng ${r.floor}</p><div class="room-meta"><span>♙ ${r.capacity} chỗ</span><span>⌁ ${esc(r.equipment).slice(0, 42)}</span></div><button class="btn full" onclick="openBooking(${r.id},'${esc(r.code)}')">Đặt phòng →</button></article>`;
}
async function loadRooms() {
  let grid = document.querySelector("#roomsGrid");
  if (!grid) return;
  grid.innerHTML = "Đang tìm...";
  let p = new URLSearchParams();
  let q = document.querySelector("#roomSearch")?.value || "",
    t = document.querySelector("#roomType")?.value || "",
    c = document.querySelector("#roomCapacity")?.value || "";
  if (q) p.set("q", q);
  if (t) p.set("room_type", t);
  if (c) p.set("capacity", c);
  try {
    let rs = await api("/api/rooms?" + p);
    grid.innerHTML =
      rs.map(roomCard).join("") ||
      '<div class="panel">Không tìm thấy phòng phù hợp.</div>';
  } catch (e) {
    grid.innerHTML = e.message;
  }
}
function openBooking(id, code) {
  let m = document.querySelector("#bookingModal");
  if (!m) return;
  document.querySelector("#bookingRoom").value = id;
  document.querySelector("#bookingError").classList.add("hidden");
  m.classList.remove("hidden");
}
function closeBooking() {
  document.querySelector("#bookingModal")?.classList.add("hidden");
}
document
  .querySelector("#bookingForm")
  ?.addEventListener("submit", async (e) => {
    e.preventDefault();
    let err = document.querySelector("#bookingError");
    try {
      let d = await api("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          room_id: +document.querySelector("#bookingRoom").value,
          title: document.querySelector("#bookingTitle").value,
          purpose: document.querySelector("#bookingPurpose").value,
          start: document.querySelector("#bookingStart").value,
          end: document.querySelector("#bookingEnd").value,
          recurrence: document.querySelector("#bookingRecurrence").value,
        }),
      });
      alert(d.message + " · " + d.status);
      closeBooking();
      location.href = "/bookings";
    } catch (x) {
      err.textContent = x.message;
      err.classList.remove("hidden");
    }
  });
async function loadBookings() {
  let el = document.querySelector("#bookingList");
  if (!el) return;
  try {
    let f = document.querySelector("#bookingFilter")?.value || "",
      b = await api("/api/bookings" + (f ? "?status=" + f : ""));
    el.innerHTML =
      b
        .map(
          (x) =>
            `<div class="booking-row"><div class="room-symbol">▦</div><div class="booking-info"><b>${esc(x.title)} · ${esc(x.room)}</b><small>${new Date(x.start).toLocaleString("vi-VN")} → ${new Date(x.end).toLocaleTimeString("vi-VN")} · ${esc(x.purpose)}</small></div>${statusBadge(x.status)}${["pending", "approved"].includes(x.status) ? `<button class="btn danger small" onclick="cancelBooking(${x.id})">Hủy</button>` : ""}</div>`,
        )
        .join("") || '<p class="muted">Chưa có booking.</p>';
  } catch (e) {
    el.textContent = e.message;
  }
}
async function cancelBooking(id) {
  if (!confirm("Bạn chắc chắn muốn hủy booking này?")) return;
  try {
    await api("/api/bookings/" + id + "/cancel", { method: "POST" });
    loadBookings();
  } catch (e) {
    alert(e.message);
  }
}
async function askAI() {
  let inp = document.querySelector("#aiInput"),
    out = document.querySelector("#aiAnswer");
  if (!inp || !out) return;
  out.textContent = "UniRoom Assistant đang suy nghĩ...";
  try {
    let d = await api("/api/ai", {
      method: "POST",
      body: JSON.stringify({ message: inp.value }),
    });
    out.textContent = d.answer;
  } catch (e) {
    out.textContent = e.message;
  }
}
async function loadNotices() {
  let el = document.querySelector("#noticeList");
  if (!el) return;
  try {
    let n = await api("/api/notifications");
    el.innerHTML =
      n
        .map(
          (x) =>
            `<div class="booking-row"><div class="room-symbol">♧</div><div class="booking-info"><b>${esc(x.message)}</b><small>${new Date(x.created_at).toLocaleString("vi-VN")}</small></div>${x.read ? '<span class="badge gray">Đã đọc</span>' : `<button class="btn small" onclick="readNotice(${x.id})">Đánh dấu đã đọc</button>`}</div>`,
        )
        .join("") || "<p>Chưa có thông báo.</p>";
  } catch (e) {
    el.textContent = e.message;
  }
}
async function readNotice(id) {
  await api("/api/notifications/" + id + "/read", { method: "POST" });
  loadNotices();
}
async function loadAdminUsers() {
  let el = document.querySelector("#adminUsers");
  if (!el) return;
  try {
    let us = await api("/api/admin/users");
    el.innerHTML =
      "<table><thead><tr><th>ID</th><th>Họ tên</th><th>Email</th><th>Role</th><th>Trạng thái</th><th></th></tr></thead><tbody>" +
      us
        .map(
          (u) =>
            `<tr><td>${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${u.role}</td><td>${u.active ? "Hoạt động" : "Đã khóa"}</td><td><button class="btn small" onclick="toggleUser(${u.id})">${u.active ? "Khóa" : "Mở khóa"}</button></td></tr>`,
        )
        .join("") +
      "</tbody></table>";
    let rules = await api("/api/rules");
    document.querySelector("#rulesList").innerHTML = rules
      .map(
        (r) =>
          `<div class="booking-row"><b>${esc(r.name)}</b><span>${esc(r.value)}</span><span class="badge green">Enabled</span></div>`,
      )
      .join("");
  } catch (e) {
    el.textContent = e.message;
  }
}
async function toggleUser(id) {
  try {
    await api("/api/admin/users/" + id + "/toggle", { method: "POST" });
    loadAdminUsers();
  } catch (e) {
    alert(e.message);
  }
}
async function loadPending() {
  let el = document.querySelector("#pendingList");
  if (!el) return;
  try {
    let p = await api("/api/manager/pending");
    el.innerHTML =
      p
        .map(
          (x) =>
            `<div class="booking-row"><div class="booking-info"><b>${esc(x.title)} · ${esc(x.room)}</b><small>${esc(x.owner)} · ${new Date(x.start).toLocaleString("vi-VN")}</small></div><button class="btn small" onclick="managerAct(${x.id},'approve')">Duyệt</button><button class="btn danger small" onclick="managerAct(${x.id},'reject')">Từ chối</button></div>`,
        )
        .join("") || '<p class="muted">Không có yêu cầu chờ.</p>';
  } catch (e) {
    el.textContent = e.message;
  }
}
async function managerAct(id, a) {
  try {
    await api("/api/manager/bookings/" + id + "/" + a);
    loadPending();
  } catch (e) {
    alert(e.message);
  }
}
document.addEventListener("DOMContentLoaded", () => {
  loadDashboard();
  loadRooms();
  loadBookings();
  loadNotices();
  loadAdminUsers();
  loadPending();
});
