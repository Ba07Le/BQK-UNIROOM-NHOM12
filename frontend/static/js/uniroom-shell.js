/* Shared navbar + footer for Admin and Room Manager pages (the user site has its own copy in index.html). */
(function () {
  "use strict";
  const mode = document.body && document.body.dataset.shell;
  if (!mode) return;
  let me = null;
  try { me = JSON.parse(localStorage.getItem("uniroom_user") || "null"); } catch (e) {}
  const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const ADMIN_TABS = [["dashboard", "Dashboard"], ["users", "Người dùng"], ["bookings", "Đặt phòng"], ["rooms", "Cơ sở vật chất"], ["rules", "Quy định"], ["notifications", "Thông báo"], ["reports", "Báo cáo"], ["logs", "Nhật ký"]];
  const MANAGER_LINKS = [["Trang chủ", "/"], ["Khám phá phòng", "/#rooms"], ["Lịch tổng quan", "/#calendar"], ["Quản lý phòng", "/static/room-manager.html", true], ["Tài khoản", "/#profile"]];

  const isAdmin = mode === "admin";
  const items = isAdmin
    ? ADMIN_TABS.map(([k, l]) => `<li class="nav-item"><a class="nav-link" href="#${k}" data-tab="${k}">${l}</a></li>`)
    : MANAGER_LINKS.map(([l, h, a]) => `<li class="nav-item"><a class="nav-link${a ? " active" : ""}" href="${h}">${l}</a></li>`);
  const expand = isAdmin ? "navbar-expand-xl" : "navbar-expand-lg";
  const identityId = isAdmin ? "admin-name" : "rm-identity";
  const logoutId = isAdmin ? "ur-logout" : "rm-logout";

  const nav = `<nav class="navbar navbar-dark ${expand} ur-nav" aria-label="Điều hướng chính">
    <div class="${isAdmin ? "container" : "container-fluid ur-nav-wide"}">
      <a class="navbar-brand" href="${isAdmin ? "#dashboard" : "/"}"><span class="ur-brand-mark"><i class="bi bi-buildings-fill"></i></span><span>UniRoom</span><span class="ur-role">${isAdmin ? "ADMIN" : "MANAGER"}</span></a>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#ur-nav-menu" aria-controls="ur-nav-menu" aria-expanded="false" aria-label="Mở menu"><span class="navbar-toggler-icon"></span></button>
      <div class="collapse navbar-collapse" id="ur-nav-menu">
        <ul class="navbar-nav me-auto ms-xl-4 gap-xl-1">${items.join("")}</ul>
        <div class="ur-actions"><span id="${identityId}" class="ur-user">${esc(me?.full_name || "")}</span><button id="${logoutId}" type="button" class="btn btn-light btn-sm">Đăng xuất</button></div>
      </div>
    </div></nav>`;

  const footer = `<footer id="main-footer" class="footer uniroom-footer"><div class="container uniroom-footer-layout">
    <div class="uniroom-footer-info"><span class="uniroom-footer-eyebrow">ĐỒ ÁN LẬP TRÌNH PYTHON · NHÓM 12</span>
      <h2>Học viện Hàng không Việt Nam <span>– VAU</span></h2>
      <p class="uniroom-footer-description">UniRoom · Hệ thống đặt lịch phòng học và phòng Lab</p>
      <div class="uniroom-footer-members"><div><strong>Thành viên thực hiện</strong><span>Lê Đức Bảo · Lê Hồng Quân · Phạm Đăng Khoa</span></div><div><strong>Giáo viên hướng dẫn</strong><span>ThS. Lê Minh Hưng</span></div></div>
      <div class="uniroom-footer-bottom">© 2026 UniRoom · Nhóm 12 · Vietnam Aviation Academy</div></div>
    <div class="uniroom-footer-plane" aria-hidden="true"><svg viewBox="0 0 440 320" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="planeGradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#83b5ff"/></linearGradient></defs><circle cx="230" cy="160" r="135" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="2" stroke-dasharray="7 10"/><circle cx="230" cy="160" r="98" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="2"/><path d="M62 232 C135 255 300 257 395 182" stroke="#8dc4ff" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="8 12"/><g transform="translate(221 150) rotate(-32) scale(8.6)" fill="url(#planeGradient)"><path d="M0-16c1.2 0 2 1.3 2 3v10l13 9v3L2 5v8l5 4v2l-7-2-7 2v-2l5-4V5l-13 4V6l13-9v-10c0-1.7.8-3 2-3z"/></g><circle cx="370" cy="75" r="5" fill="#b6d7ff"/><circle cx="91" cy="111" r="3" fill="#b6d7ff"/></svg><span>FLY HIGH · LEARN SMART</span></div>
  </div></footer>`;

  document.body.insertAdjacentHTML("afterbegin", nav);
  const addFooter = () => document.body.insertAdjacentHTML("beforeend", footer);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addFooter, { once: true });
  else addFooter();

  if (isAdmin) {
    document.addEventListener("click", (e) => {
      if (e.target.closest("#ur-logout") && typeof window.logout === "function") window.logout();
      if (e.target.closest("#ur-nav-menu .nav-link") && window.bootstrap) {
        const m = document.getElementById("ur-nav-menu");
        if (m.classList.contains("show")) window.bootstrap.Collapse.getOrCreateInstance(m).hide();
      }
    });
  }
})();
