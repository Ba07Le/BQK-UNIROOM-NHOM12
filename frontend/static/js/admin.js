const API = "/api";
let token = localStorage.getItem("uniroom_token") || "";
let me = JSON.parse(localStorage.getItem("uniroom_user") || "null");
let D = {};
let charts = [];
let META = null;

const TABS = [
  ["dashboard", "Dashboard", "Tổng quan vận hành hệ thống đặt phòng."],
  ["users", "Người dùng & vai trò", "Quản lý tài khoản, phân quyền và khóa / mở khóa người dùng."],
  ["bookings", "Đặt phòng", "Toàn bộ yêu cầu đặt phòng trong hệ thống."],
  ["rooms", "Cơ sở vật chất", "Trạng thái phòng và phân công Room Manager."],
  ["rules", "Quy định hệ thống", "Cấu hình Rules Engine cho việc đặt phòng."],
  ["notifications", "Thông báo", "Phát thông báo tới người dùng và xem thông báo gần đây."],
  ["reports", "Báo cáo", "Thống kê lượt đặt theo phòng."],
  ["logs", "Nhật ký", "Lịch sử thao tác duyệt booking."],
];
const STATUS_COLORS = { APPROVED: "#2f9e8f", PENDING: "#e0a030", REJECTED: "#c9504f", CANCELLED: "#9aa8b5", COMPLETED: "#245c83", CHECKED_IN: "#6a8fd8" };
const BRAND = "#245c83";
const RULE_LABELS = {
  MAX_DURATION_HOURS: "Thời lượng đặt tối đa (giờ)",
  MAX_ADVANCE_DAYS: "Thời gian được đặt trước tối đa (ngày)",
  MAX_ACTIVE_BOOKINGS: "Số booking hoạt động tối đa / User",
  CANCELLATION_MIN_HOURS: "Hạn hủy trước giờ bắt đầu (giờ)",
  REQUIRE_APPROVAL: "Yêu cầu Manager/Admin duyệt booking",
};

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
function alertMsg(msg, type = "success") {
  document.getElementById("alert-area").innerHTML =
    `<div class="alert alert-${type} alert-dismissible">${esc(msg)}<button class="btn-close" data-bs-dismiss="alert"></button></div>`;
  window.scrollTo(0, 0);
}
function apiErrorMessage(p) {
  const d = p?.detail ?? p?.message ?? p?.error;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((i) => i?.msg || "Dữ liệu không hợp lệ").join(" · ");
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}
async function api(path, opts = {}) {
  opts.headers = { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  if (opts.body && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(API + path, opts);
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { clearSession(); location.replace("/"); throw new Error("Phiên đăng nhập hết hạn"); }
  if (!r.ok) throw new Error(apiErrorMessage(d));
  return d.data ?? d;
}
function clearSession() {
  localStorage.removeItem("uniroom_token");
  localStorage.removeItem("uniroom_user");
  token = ""; me = null;
}
function logout() {
  api("/auth/logout", { method: "POST" }).catch(() => {}).finally(() => { clearSession(); location.replace("/"); });
}

// ---------- guard: only ADMIN may stay on this page ----------
async function init() {
  if (!token) return location.replace("/");
  try {
    const u = await api("/users/me");
    const role = u.role || me?.role;
    if (role !== "ADMIN") return location.replace("/");
    me = { ...(me || {}), ...u, role };
    const nm = document.getElementById("admin-name"); if (nm) nm.textContent = me.full_name || me.email || "";
  } catch (e) { return; }
  await loadAll();
  go(location.hash.slice(1) || "dashboard");
}
async function loadAll() {
  try {
    const [sum, users, bookings, rooms, roles, rules, reports, logs, notifications, managers] = await Promise.all([
      api("/admin/summary"), api("/admin/users"), api("/admin/bookings"), api("/admin/rooms"), api("/admin/roles"),
      api("/admin/rules"), api("/admin/reports"), api("/admin/logs"), api("/admin/notifications"), api("/admin/room-managers"),
    ]);
    D = { sum, users, bookings, rooms, roles, rules, reports, logs, notifications, managers };
  } catch (e) { alertMsg(e.message, "danger"); }
}
async function reload(tab) { await loadAll(); go(tab); }
function go(tab) {
  if (!TABS.some((t) => t[0] === tab)) tab = "dashboard";
  if (location.hash.slice(1) !== tab) history.replaceState(null, "", "#" + tab);
  const meta = TABS.find((t) => t[0] === tab);
  document.getElementById("admin-title").textContent = meta[1];
  document.getElementById("admin-sub").textContent = meta[2];
  document.title = meta[1] + " · Quản trị UniRoom";
  document.querySelectorAll(".ur-nav [data-tab]").forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  charts.forEach((c) => c.destroy()); charts = [];
  ({ dashboard, users, bookings, rooms, rules, notifications, reports, logs })[tab]();
}
window.addEventListener("hashchange", () => { if (D.sum) go(location.hash.slice(1)); });
document.getElementById("admin-refresh")?.addEventListener("click", () => reload(location.hash.slice(1) || "dashboard"));

function statCards(items) {
  return `<div class="row g-3 mb-3">${items.map((x) => `<div class="col-6 col-xl-3"><div class="stat h-100"><span class="muted"><i class="bi ${x[2]} me-1"></i>${x[0]}</span><strong>${x[1]}</strong></div></div>`).join("")}</div>`;
}
function bookingTable(bs) {
  if (!bs.length) return '<p class="muted mb-0">Không có booking.</p>';
  const cls = (s) => (s === "APPROVED" ? "success" : s === "REJECTED" ? "danger" : "warning");
  return `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Người đặt</th><th>Phòng</th><th>Nội dung</th><th>Thời gian</th><th>Trạng thái</th></tr></thead><tbody>${bs.map((b) => `<tr><td>${esc(b.user)}</td><td>${esc(b.room_code)}</td><td>${esc(b.title)}</td><td>${new Date(b.start_at).toLocaleString("vi-VN")}</td><td><span class="badge text-bg-${cls(b.status)}">${esc(b.status)}</span></td></tr>`).join("")}</tbody></table></div>`;
}
const $c = () => document.getElementById("admin-content");

// ---------- tabs ----------
function dashboard() {
  const { sum, reports, bookings, rooms, roles } = D;
  const st = reports.by_status || {};
  const total = Number(reports.total_bookings || 0), approved = Number(st.APPROVED || 0);
  const rate = total ? Math.round((approved / total) * 100) : 0;
  const active = rooms.filter((r) => r.status === "ACTIVE").length;
  const top = (reports.by_room || []).slice().sort((a, b) => b.bookings - a.bookings).slice(0, 5);
  $c().innerHTML = `${statCards([["Tổng người dùng", sum.users, "bi-people"], ["Tổng số phòng", sum.rooms, "bi-building"], ["Tổng booking", sum.bookings, "bi-calendar-check"], ["Chờ duyệt", sum.pending, "bi-hourglass-split"]])}
  <div class="row g-3 mb-3">
    <div class="col-md-4"><div class="panel h-100"><span class="muted">Tỷ lệ booking được duyệt</span><h3>${rate}%</h3><div class="progress"><div class="progress-bar" style="width:${rate}%"></div></div><small class="muted">${approved} / ${total} lượt đặt</small></div></div>
    <div class="col-md-4"><div class="panel h-100"><span class="muted">Phòng đang hoạt động</span><h3>${active} / ${rooms.length}</h3></div></div>
    <div class="col-md-4"><div class="panel h-100"><span class="muted">Nhóm quyền hệ thống</span><h3>${roles.length}</h3></div></div>
  </div>
  <div class="row g-3">
    <div class="col-lg-5"><div class="panel h-100"><h5>Trạng thái booking</h5><div style="height:260px"><canvas id="c-status"></canvas></div></div></div>
    <div class="col-lg-7"><div class="panel h-100"><h5>Lượt đặt theo phòng</h5><div style="height:260px"><canvas id="c-room"></canvas></div></div></div>
    <div class="col-12"><div class="panel"><h5>Xu hướng booking theo tháng</h5><div style="height:230px"><canvas id="c-month"></canvas></div></div></div>
    <div class="col-lg-7"><div class="panel h-100"><h5>Top 5 phòng được đặt nhiều nhất</h5>${top.length ? top.map((r, i) => `<div class="admin-rank"><b>${i + 1}</b><span style="width:110px">${esc(r.room)}</span><div class="admin-rank-track"><div style="width:${top[0].bookings ? Math.round((r.bookings / top[0].bookings) * 100) : 0}%"></div></div><strong>${r.bookings}</strong></div>`).join("") : '<p class="muted">Chưa có dữ liệu.</p>'}</div></div>
    <div class="col-lg-5"><div class="panel h-100"><h5>Người dùng theo vai trò</h5>${roles.map((r) => `<div class="d-flex justify-content-between border-bottom py-2"><span>${esc(r.description || r.name)}</span><b>${r.members}</b></div>`).join("")}</div></div>
    <div class="col-12"><div class="panel"><h5>Booking mới nhất</h5>${bookingTable(bookings.slice(0, 7))}</div></div>
  </div>`;
  if (!window.Chart) return;
  const base = { responsive: true, maintainAspectRatio: false };
  charts.push(new Chart(document.getElementById("c-status"), { type: "doughnut", data: { labels: Object.keys(st), datasets: [{ data: Object.values(st), backgroundColor: Object.keys(st).map((k) => STATUS_COLORS[k] || "#9aa8b5"), borderWidth: 0 }] }, options: { ...base, plugins: { legend: { position: "bottom" } } } }));
  charts.push(new Chart(document.getElementById("c-room"), { type: "bar", data: { labels: top.map((x) => x.room), datasets: [{ label: "Số booking", data: top.map((x) => x.bookings), backgroundColor: BRAND, borderRadius: 6 }] }, options: { ...base, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }));
  const m = reports.by_month || [];
  charts.push(new Chart(document.getElementById("c-month"), { type: "line", data: { labels: m.map((x) => x.month), datasets: [{ label: "Booking tạo mới", data: m.map((x) => x.bookings), tension: 0.3, fill: true, borderColor: BRAND, backgroundColor: "rgba(36,92,131,.12)", pointBackgroundColor: BRAND }] }, options: { ...base, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } }));
}
function users() {
  $c().innerHTML = `<div class="panel"><div class="d-flex justify-content-between flex-wrap gap-2"><h5>Quản lý người dùng</h5><input id="u-search" class="form-control" style="max-width:280px" placeholder="Tìm tên hoặc email" oninput="filterUsers()"></div>
  <div class="table-responsive mt-3"><table class="table align-middle"><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="u-rows">${D.users.map((u) => `<tr data-s="${esc((u.full_name + " " + u.email).toLowerCase())}"><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td><td><select class="form-select form-select-sm" style="min-width:150px" id="role-${u.id}">${["USER", "ROOM_MANAGER", "ADMIN"].map((r) => `<option ${u.role === r ? "selected" : ""}>${r}</option>`).join("")}</select></td><td><span class="badge text-bg-${u.is_active ? "success" : "secondary"}">${u.is_active ? "Hoạt động" : "Đã khóa"}</span></td><td class="text-nowrap"><button class="btn btn-sm btn-primary" onclick="saveRole(${u.id})">Lưu vai trò</button> <button class="btn btn-sm btn-outline-${u.is_active ? "danger" : "success"}" onclick="toggleUser(${u.id},${!u.is_active})">${u.is_active ? "Khóa" : "Mở khóa"}</button></td></tr>`).join("")}</tbody></table></div></div>`;
}
function filterUsers() {
  const q = document.getElementById("u-search").value.toLowerCase();
  document.querySelectorAll("#u-rows tr").forEach((r) => (r.hidden = !r.dataset.s.includes(q)));
}
async function saveRole(id) {
  try { await api(`/admin/users/${id}`, { method: "PATCH", body: { role: document.getElementById(`role-${id}`).value } }); alertMsg("Đã cập nhật vai trò"); reload("users"); }
  catch (e) { alertMsg(e.message, "danger"); }
}
async function toggleUser(id, active) {
  try { await api(`/admin/users/${id}`, { method: "PATCH", body: { is_active: active } }); alertMsg("Đã cập nhật trạng thái tài khoản"); reload("users"); }
  catch (e) { alertMsg(e.message, "danger"); }
}
function bookings() {
  $c().innerHTML = `<div class="panel"><h5>Toàn bộ yêu cầu đặt phòng</h5><select class="form-select mb-3" style="max-width:220px" id="b-filter" onchange="filterBookings()"><option value="">Tất cả trạng thái</option>${["PENDING", "APPROVED", "REJECTED", "CANCELLED", "CHECKED_IN", "COMPLETED"].map((x) => `<option>${x}</option>`).join("")}</select><div id="b-list">${bookingTable(D.bookings)}</div></div>`;
}
function filterBookings() {
  const f = document.getElementById("b-filter").value;
  document.getElementById("b-list").innerHTML = bookingTable(D.bookings.filter((b) => !f || b.status === f));
}
function rooms() {
  $c().innerHTML = `<div class="panel"><div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><h5 class="mb-0">Quản lý phòng & cơ sở vật chất</h5><button type="button" class="btn btn-primary btn-sm" onclick="openRoomModal()"><i class="bi bi-plus-lg me-1"></i>Thêm phòng</button></div><div class="table-responsive"><table class="table"><thead><tr><th>Phòng</th><th>Tòa nhà</th><th>Loại</th><th>Sức chứa</th><th>Người phụ trách</th><th>Trạng thái</th></tr></thead><tbody>${D.rooms.map((r) => `<tr><td><b>${esc(r.code)}</b><div class="small muted">${esc(r.name)}</div></td><td>${esc(r.building)}</td><td>${esc(r.room_type)}</td><td>${r.capacity}</td><td><select class="form-select form-select-sm" id="rm-${r.id}"><option value="0">Chưa phân công</option>${D.managers.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select><button class="btn btn-sm btn-outline-primary mt-1" onclick="assignManager(${r.id})">Gán quản lý</button></td><td><select class="form-select form-select-sm" id="rs-${r.id}">${[["ACTIVE", "Hoạt động"], ["INACTIVE", "Ngừng hoạt động"], ["MAINTENANCE", "Bảo trì"]].map(([v, l]) => `<option value="${v}" ${r.status === v ? "selected" : ""}>${l}</option>`).join("")}</select><button class="btn btn-sm btn-primary mt-1" onclick="saveRoomStatus(${r.id})">Lưu trạng thái</button></td></tr>`).join("")}</tbody></table></div></div>`;
}
async function saveRoomStatus(id) {
  try { await api(`/admin/rooms/${id}`, { method: "PATCH", body: { status: document.getElementById(`rs-${id}`).value } }); alertMsg("Đã cập nhật trạng thái phòng"); reload("rooms"); }
  catch (e) { alertMsg(e.message, "danger"); }
}
async function assignManager(id) {
  try { await api(`/admin/rooms/${id}/manager`, { method: "PUT", body: { manager_id: +document.getElementById(`rm-${id}`).value } }); alertMsg("Đã phân công Room Manager"); reload("rooms"); }
  catch (e) { alertMsg(e.message, "danger"); }
}
function rules() {
  $c().innerHTML = `<div class="panel"><h5>Rules Engine – Quy định hệ thống</h5>${D.rules.map((r) => `<form class="row g-2 align-items-end border-bottom py-3" onsubmit="saveRule(event,${r.id})"><div class="col-md-5"><label class="form-label">${RULE_LABELS[r.code] || ""} <small class="text-secondary">(${esc(r.code)})</small></label><input class="form-control" name="value" value="${esc(r.value)}"></div><div class="col-md-3"><label class="form-label">Kích hoạt</label><select class="form-select" name="enabled"><option value="true" ${r.enabled ? "selected" : ""}>Bật</option><option value="false" ${!r.enabled ? "selected" : ""}>Tắt</option></select></div><div class="col-md-2"><button class="btn btn-primary">Lưu</button></div></form>`).join("") || '<p class="muted">Chưa có quy định.</p>'}</div>`;
}
async function saveRule(e, id) {
  e.preventDefault();
  const f = new FormData(e.target);
  try { await api(`/admin/rules/${id}`, { method: "PATCH", body: { value: f.get("value"), enabled: f.get("enabled") === "true" } }); alertMsg("Đã lưu quy định"); reload("rules"); }
  catch (x) { alertMsg(x.message, "danger"); }
}
function notifications() {
  $c().innerHTML = `<div class="row g-3"><div class="col-lg-5"><form class="panel" id="n-form"><h5>Phát thông báo</h5><label class="form-label">Tiêu đề</label><input class="form-control mb-2" name="title" required><label class="form-label">Nội dung</label><textarea class="form-control mb-2" name="body" rows="4" required></textarea><label class="form-label">Đối tượng</label><select class="form-select mb-3" name="audience"><option value="ALL">Tất cả người dùng</option><option>USER</option><option>ROOM_MANAGER</option><option>ADMIN</option></select><button class="btn btn-primary">Gửi thông báo</button></form></div><div class="col-lg-7"><div class="panel"><h5>Thông báo gần đây</h5>${D.notifications.map((n) => `<div class="border-bottom py-2"><b>${esc(n.title)}</b><p class="mb-1">${esc(n.body)}</p><small class="muted">${new Date(n.created_at).toLocaleString("vi-VN")}</small></div>`).join("") || '<p class="muted">Chưa có thông báo.</p>'}</div></div></div>`;
  document.getElementById("n-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const x = await api("/admin/notifications", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      alertMsg(x.recipients !== undefined ? `Đã gửi tới ${x.recipients} tài khoản` : "Đã gửi thông báo");
      reload("notifications");
    } catch (x) { alertMsg(x.message, "danger"); }
  };
}
function reports() {
  const r = D.reports;
  $c().innerHTML = `<div class="row g-3 mb-3">${[["Tổng booking", r.total_bookings], ["Người dùng", r.users], ["Phòng", r.rooms]].map((x) => `<div class="col-md-4"><div class="stat"><span class="muted">${x[0]}</span><strong>${x[1]}</strong></div></div>`).join("")}</div><div class="panel"><h5>Lượt đặt theo phòng</h5>${(r.by_room || []).map((x) => `<div class="d-flex align-items-center gap-3 border-bottom py-2"><span style="width:100px">${esc(x.room)}</span><div class="progress flex-grow-1" style="height:9px"><div class="progress-bar" style="width:${Math.min(100, (x.bookings / Math.max(1, r.total_bookings)) * 100)}%"></div></div><b>${x.bookings}</b></div>`).join("")}</div>`;
}
function logs() {
  $c().innerHTML = `<div class="panel"><h5>Nhật ký thao tác duyệt booking</h5><div class="table-responsive"><table class="table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Ghi chú</th></tr></thead><tbody>${D.logs.map((l) => `<tr><td>${new Date(l.time).toLocaleString("vi-VN")}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td>${esc(l.note || "")}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Chưa có nhật ký.</td></tr>'}</tbody></table></div></div>`;
}

// ---------- add room ----------
async function openRoomModal() {
  try { if (!META) META = await api("/rooms/meta"); }
  catch (e) { return alertMsg(e.message, "danger"); }
  if (!META.buildings.length || !META.room_types.length)
    return alertMsg("Chưa có tòa nhà hoặc loại phòng. Hãy tạo trước trong Quản lý phòng → Tòa nhà & loại phòng.", "warning");
  document.getElementById("room-modal")?.remove();
  const opt = (arr) => arr.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
  document.body.insertAdjacentHTML("beforeend", `
  <div class="modal fade" id="room-modal" tabindex="-1" aria-labelledby="room-modal-title" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content">
      <form id="room-form" novalidate>
        <div class="modal-header"><h5 class="modal-title" id="room-modal-title"><i class="bi bi-door-open me-2"></i>Thêm phòng mới</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
        <div class="modal-body"><div class="row g-3">
          <div class="col-md-4"><label class="form-label">Mã phòng <span class="text-danger">*</span></label><input class="form-control" name="code" required maxlength="30" placeholder="VD: A101"></div>
          <div class="col-md-8"><label class="form-label">Tên phòng <span class="text-danger">*</span></label><input class="form-control" name="name" required maxlength="120" placeholder="VD: Phòng học A101"></div>
          <div class="col-md-6"><label class="form-label">Tòa nhà</label><select class="form-select" name="building_id">${opt(META.buildings)}</select></div>
          <div class="col-md-6"><label class="form-label">Loại phòng</label><select class="form-select" name="room_type_id">${opt(META.room_types)}</select></div>
          <div class="col-md-4"><label class="form-label">Sức chứa <span class="text-danger">*</span></label><input class="form-control" type="number" name="capacity" min="1" value="30" required></div>
          <div class="col-md-4"><label class="form-label">Tầng</label><input class="form-control" type="number" name="floor" min="0" value="1"></div>
          <div class="col-md-4"><label class="form-label">Trạng thái</label><select class="form-select" name="status"><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Ngừng hoạt động</option><option value="MAINTENANCE">Bảo trì</option></select></div>
          <div class="col-md-6"><label class="form-label">Người phụ trách (tùy chọn)</label><select class="form-select" name="manager_id"><option value="0">Chưa phân công</option>${(D.managers || []).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select></div>
          <div class="col-md-6"><label class="form-label">Mô tả</label><input class="form-control" name="description" maxlength="300" placeholder="Máy chiếu, điều hòa..."></div>
        </div><div id="room-error" class="alert alert-danger mt-3 mb-0 d-none"></div></div>
        <div class="modal-footer"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button><button type="submit" id="room-submit" class="btn btn-primary">Tạo phòng</button></div>
      </form></div></div></div>`);
  const el = document.getElementById("room-modal");
  const modal = bootstrap.Modal.getOrCreateInstance(el);
  el.addEventListener("hidden.bs.modal", () => el.remove(), { once: true });
  document.getElementById("room-form").onsubmit = submitRoom;
  modal.show();
  el.addEventListener("shown.bs.modal", () => el.querySelector("[name=code]").focus(), { once: true });
}
async function submitRoom(e) {
  e.preventDefault();
  const form = e.target, err = document.getElementById("room-error"), btn = document.getElementById("room-submit");
  err.classList.add("d-none");
  if (!form.checkValidity()) { form.classList.add("was-validated"); err.textContent = "Vui lòng nhập đủ mã phòng, tên phòng và sức chứa hợp lệ."; err.classList.remove("d-none"); return; }
  const o = Object.fromEntries(new FormData(form));
  const managerId = +o.manager_id; delete o.manager_id;
  ["building_id", "room_type_id", "capacity", "floor"].forEach((k) => (o[k] = +o[k]));
  o.code = o.code.trim(); o.name = o.name.trim();
  btn.disabled = true;
  try {
    const r = await api("/manager/rooms", { method: "POST", body: o });
    if (managerId && r?.id) await api(`/admin/rooms/${r.id}/manager`, { method: "PUT", body: { manager_id: managerId } });
    bootstrap.Modal.getOrCreateInstance(document.getElementById("room-modal")).hide();
    alertMsg(`Đã tạo phòng ${o.code}`);
    reload("rooms");
  } catch (x) {
    err.textContent = x.message; err.classList.remove("d-none");
  } finally { btn.disabled = false; }
}

init();