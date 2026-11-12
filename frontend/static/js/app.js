const API = "/api";
let token = localStorage.getItem("uniroom_token") || "";
let me = JSON.parse(localStorage.getItem("uniroom_user") || "null");
const app = document.getElementById("app");
function esc(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function alertMsg(msg, type = "success") {
  document.getElementById("alert-area").innerHTML =
    `<div class="alert alert-${type} alert-dismissible">${esc(msg)}<button class="btn-close" data-bs-dismiss="alert"></button></div>`;
  window.scrollTo(0, 0);
}
function apiErrorMessage(payload) {
  const detail = payload?.detail ?? payload?.message ?? payload?.error;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((item) => {
        const loc = Array.isArray(item?.loc)
          ? item.loc.filter((x) => x !== "body").join(".")
          : "";
        const msg = item?.msg || "Dữ liệu không hợp lệ";
        return loc ? `${loc}: ${msg}` : msg;
      })
      .join(" · ");
  if (detail && typeof detail === "object")
    return detail.message || detail.msg || JSON.stringify(detail);
  return "Có lỗi xảy ra. Vui lòng thử lại.";
}
async function api(path, opts = {}) {
  opts.headers = {
    ...(opts.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  if (opts.body && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  let r;
  try {
    r = await fetch(API + path, opts);
  } catch (e) {
    throw new Error(
      "Không thể kết nối máy chủ. Hãy kiểm tra ứng dụng UniRoom có đang chạy không.",
    );
  }
  const d = await r
    .json()
    .catch(() => ({ detail: "Máy chủ trả về dữ liệu không hợp lệ" }));
  if (!r.ok) throw new Error(apiErrorMessage(d));
  return d.data ?? d;
}
function setNavVisible(id, visible) {
  const element = document.getElementById(id);
  if (!element) return;
  // Bootstrap may override the HTML hidden attribute with display styles.
  element.hidden = !visible;
  element.classList.toggle("d-none", !visible);
}
function syncNav() {
  const logged = Boolean(token && me);
  const role = logged ? me.role : null;
  setNavVisible("nav-dashboard", logged && role !== "ROOM_MANAGER");
  setNavVisible("nav-calendar", logged);
  setNavVisible("nav-notifications", logged && role === "USER");
  setNavVisible("nav-user", logged);
  setNavVisible("nav-ai", logged && role === "USER");
  setNavVisible("nav-auth", !logged);
  setNavVisible("nav-register", !logged);
  setNavVisible("nav-logout", logged);
  // Chỉ Admin được xem liên kết duyệt booking; Manager tạm thời không có mục này.
  setNavVisible("nav-manager", logged && role === "ADMIN");
  setNavVisible("nav-admin", logged && role === "ADMIN");
  document.getElementById("nav-dashboard").querySelector("a").textContent =
    role === "ADMIN" ? "Dashboard" : role === "USER" ? "Theo dõi đặt phòng" : "Bảng điều khiển";
  document.getElementById("nav-calendar").querySelector("a").textContent =
    ["ADMIN", "ROOM_MANAGER"].includes(role) ? "Lịch tổng quan" : "Lịch cá nhân";
}
function showPage(p) {
  // Room Manager chưa sử dụng Dashboard và trang Duyệt booking.
  if (me?.role === "ROOM_MANAGER" && ["dashboard", "manager"].includes(p)) p = "rooms";
  if (p === "dashboard" && me?.role === "ADMIN") p = "adminDashboard";
  const isAuthPage = p === "login" || p === "register";
  const navbar = document.getElementById("main-navbar");
  const footer = document.getElementById("main-footer");
  const main = document.getElementById("main-content");

  // Login/Register dùng bố cục độc lập, không có Navbar và Footer.
  navbar.hidden = isAuthPage;
  footer.hidden = isAuthPage;
  main.classList.toggle("auth-main", isAuthPage);
  main.classList.toggle("container", !isAuthPage);
  main.classList.toggle("py-4", !isAuthPage);
  document.body.classList.toggle("auth-page", isAuthPage);

  ({
    home: homePage,
    login: loginPage,
    register: registerPage,
    rooms: roomsPage,
    dashboard: dashboardPage,
    adminDashboard: adminDashboardPage,
    calendar: calendarPage,
    notifications: notificationsPage,
    profile: profilePage,
    manager: managerPage,
    admin: adminPage,
    ai: aiPage,
  })[p]?.();
}
function homePage() {
  app.innerHTML = `
<section class="home-hero">
  <div class="hero-orb hero-orb-one"></div><div class="hero-orb hero-orb-two"></div>
  <div class="row align-items-center g-5 position-relative">
    <div class="col-lg-7">
      <div class="eyebrow eyebrow-light"><span class="eyebrow-dot"></span> NỀN TẢNG ĐẶT PHÒNG HỌC TẬP THÔNG MINH</div>
      <h1 class="hero-title">Không gian phù hợp.<br><span>Lịch học chủ động.</span></h1>
      <p class="hero-copy">UniRoom giúp bạn tìm kiếm phòng học, phòng Lab, kiểm tra thông tin không gian và gửi yêu cầu đặt phòng trên cùng một nền tảng — rõ ràng, thuận tiện và dễ theo dõi.</p>
      <div class="d-flex flex-wrap gap-3 mt-4">
        <button class="btn btn-hero-primary" onclick="showPage('rooms')">Khám phá phòng <i class="bi bi-arrow-right ms-2"></i></button>
        ${token ? '<button class="btn btn-hero-ghost" onclick="showPage(\'dashboard\')">Mở bảng điều khiển</button>' : '<button class="btn btn-hero-ghost" onclick="showPage(\'register\')">Tạo tài khoản miễn phí</button>'}
      </div>
      <div class="hero-proof mt-5"><div class="proof-avatars"><span><i class="bi bi-person-fill"></i></span><span><i class="bi bi-mortarboard-fill"></i></span><span><i class="bi bi-laptop-fill"></i></span></div><div><strong>Một nơi cho mọi nhu cầu đặt phòng</strong><small>Tìm kiếm · Đăng ký · Theo dõi</small></div></div>
    </div>
    <div class="col-lg-5">
      <div class="hero-visual">
        <div class="visual-top"><span class="live-dot"></span> KHÔNG GIAN HỌC TẬP</div>
        <div class="visual-building"><div class="building-icon"><i class="bi bi-building"></i></div><div><strong>Không gian của bạn</strong><small>Phòng học & phòng thực hành</small></div><span class="visual-check"><i class="bi bi-check-lg"></i></span></div>
        <div class="visual-room-grid"><div class="visual-room visual-room-main"><div class="room-illustration"><i class="bi bi-easel2"></i><i class="bi bi-display"></i><i class="bi bi-person-workspace"></i></div><span class="visual-label">PHÒNG HỌC</span><strong>Học tập & thảo luận</strong><small>Không gian cho nhóm và lớp học</small></div><div class="visual-room visual-room-side"><div class="side-icon"><i class="bi bi-cpu"></i></div><span class="visual-label">PHÒNG LAB</span><strong>Thực hành chuyên môn</strong><small>Không gian thiết bị</small></div></div>
        <div class="visual-bottom"><span><i class="bi bi-calendar2-check"></i> Lịch đặt tập trung</span><span><i class="bi bi-shield-check"></i> Theo dõi trạng thái</span></div>
        <div class="floating-note"><span class="floating-note-icon"><i class="bi bi-check2-circle"></i></span><span><strong>Quy trình rõ ràng</strong><small>Theo dõi từng yêu cầu đặt phòng</small></span></div>
      </div>
    </div>
  </div>
</section>
<section class="trust-strip"><div class="trust-item"><i class="bi bi-search"></i><span>Tìm kiếm thuận tiện</span></div><div class="trust-item"><i class="bi bi-calendar-week"></i><span>Quản lý lịch tập trung</span></div><div class="trust-item"><i class="bi bi-bell"></i><span>Cập nhật thông báo</span></div><div class="trust-item"><i class="bi bi-qr-code-scan"></i><span>Hỗ trợ QR check-in</span></div></section>
<section class="home-section intro-section"><div class="section-heading text-center"><span class="eyebrow">UNIROOM LÀ GÌ?</span><h2>Mọi thứ cần thiết để<br><span>đặt phòng dễ dàng hơn.</span></h2><p>Thay vì tìm thông tin ở nhiều nơi, UniRoom tập trung các bước quan trọng trong một quy trình thống nhất.</p></div><div class="row g-4 mt-2"><div class="col-md-4"><article class="feature-card"><div class="feature-icon icon-blue"><i class="bi bi-compass"></i></div><span class="feature-number">01 / DISCOVER</span><h3>Tìm đúng không gian</h3><p>Tìm theo tên, mã phòng và sức chứa để nhanh chóng thu hẹp lựa chọn phù hợp với nhu cầu.</p><a href="#" onclick="showPage('rooms')">Bắt đầu tìm phòng <i class="bi bi-arrow-up-right"></i></a></article></div><div class="col-md-4"><article class="feature-card"><div class="feature-icon icon-purple"><i class="bi bi-calendar2-plus"></i></div><span class="feature-number">02 / BOOK</span><h3>Gửi yêu cầu đặt lịch</h3><p>Chọn thời gian sử dụng, số người tham gia và mục đích để gửi yêu cầu đến hệ thống.</p><a href="#" onclick="showPage('rooms')">Xem quy trình đặt <i class="bi bi-arrow-up-right"></i></a></article></div><div class="col-md-4"><article class="feature-card"><div class="feature-icon icon-green"><i class="bi bi-clipboard2-check"></i></div><span class="feature-number">03 / MANAGE</span><h3>Theo dõi chủ động</h3><p>Kiểm tra trạng thái booking, lịch cá nhân và thông báo ngay trong tài khoản của bạn.</p><a href="#" onclick="showPage(token?'dashboard':'login')">Mở tài khoản <i class="bi bi-arrow-up-right"></i></a></article></div></div></section>
<section class="home-section spaces-section"><div class="row align-items-end g-3 mb-4"><div class="col-lg-8"><span class="eyebrow">KHÔNG GIAN SỬ DỤNG</span><h2 class="section-title display-6 mt-2">Một nền tảng, nhiều<br>nhu cầu học tập.</h2></div><div class="col-lg-4"><p class="muted mb-1">Khám phá danh sách phòng được quản lý trên hệ thống. Thông tin chi tiết và sức chứa được hiển thị theo dữ liệu thực tế.</p></div></div><div class="row g-4"><div class="col-lg-6"><div class="space-card space-classroom"><div class="space-card-art"><div class="art-window"></div><div class="art-board"></div><div class="art-desk desk-one"></div><div class="art-desk desk-two"></div><div class="art-desk desk-three"></div></div><div class="space-card-content"><span class="space-tag">HỌC TẬP & THẢO LUẬN</span><h3>Phòng học đa năng</h3><p>Không gian dành cho lớp học, làm việc nhóm, trao đổi và các hoạt động học thuật.</p><button class="btn btn-space" onclick="showPage('rooms')">Tìm phòng học <i class="bi bi-arrow-right"></i></button></div></div></div><div class="col-lg-6"><div class="space-card space-lab"><div class="space-card-art"><div class="lab-screen"></div><div class="lab-chip"><i class="bi bi-cpu"></i></div><div class="lab-table"></div><div class="lab-device device-one"></div><div class="lab-device device-two"></div></div><div class="space-card-content"><span class="space-tag">THỰC HÀNH & NGHIÊN CỨU</span><h3>Phòng Lab chuyên dụng</h3><p>Không gian thực hành và sử dụng thiết bị phục vụ học tập, nghiên cứu chuyên môn.</p><button class="btn btn-space" onclick="showPage('rooms')">Tìm phòng Lab <i class="bi bi-arrow-right"></i></button></div></div></div></div></section>
<section class="home-section process-section"><div class="section-heading text-center"><span class="eyebrow">CÁCH SỬ DỤNG</span><h2>Đặt phòng qua <span>4 bước đơn giản.</span></h2><p>Quy trình được thiết kế trực quan để người dùng dễ bắt đầu và dễ theo dõi.</p></div><div class="process-line"><div class="process-step"><div class="process-icon"><i class="bi bi-person-plus"></i></div><span>BƯỚC 01</span><h4>Tạo tài khoản</h4><p>Đăng ký hoặc đăng nhập vào UniRoom.</p></div><div class="process-step"><div class="process-icon"><i class="bi bi-search"></i></div><span>BƯỚC 02</span><h4>Tìm kiếm phòng</h4><p>Lọc phòng theo thông tin và sức chứa.</p></div><div class="process-step"><div class="process-icon"><i class="bi bi-calendar2-plus"></i></div><span>BƯỚC 03</span><h4>Gửi yêu cầu</h4><p>Chọn thời gian và gửi thông tin đặt phòng.</p></div><div class="process-step"><div class="process-icon"><i class="bi bi-bell"></i></div><span>BƯỚC 04</span><h4>Theo dõi kết quả</h4><p>Xem trạng thái và lịch sử trong tài khoản.</p></div></div></section>
<section class="home-section tools-section"><div class="row align-items-center g-5"><div class="col-lg-5"><span class="eyebrow">CÔNG CỤ ĐỒNG HÀNH</span><h2 class="section-title display-6 mt-2">Không chỉ đặt phòng.<br><span class="text-gradient">Còn quản lý thuận tiện.</span></h2><p class="muted mt-3">Các tiện ích hỗ trợ người dùng trong suốt quá trình sử dụng phòng và theo dõi lịch đặt.</p><button class="btn btn-primary btn-lg mt-2" onclick="showPage(token?'dashboard':'register')">${token ? "Vào bảng điều khiển" : "Bắt đầu sử dụng"} <i class="bi bi-arrow-right ms-2"></i></button></div><div class="col-lg-7"><div class="tools-grid"><div class="tool-tile"><span class="tool-icon"><i class="bi bi-calendar3"></i></span><h5>Lịch cá nhân</h5><p>Tập trung các lịch đặt phòng đã tạo.</p></div><div class="tool-tile"><span class="tool-icon purple"><i class="bi bi-bell"></i></span><h5>Thông báo</h5><p>Cập nhật thông tin và trạng thái booking.</p></div><div class="tool-tile"><span class="tool-icon green"><i class="bi bi-qr-code"></i></span><h5>QR check-in</h5><p>Hỗ trợ thao tác check-in theo booking.</p></div><div class="tool-tile"><span class="tool-icon orange"><i class="bi bi-file-earmark-arrow-down"></i></span><h5>Xuất báo cáo</h5><p>Hỗ trợ xuất dữ liệu lịch theo định dạng hệ thống.</p></div><div class="tool-tile tool-tile-wide"><span class="tool-icon dark"><i class="bi bi-stars"></i></span><div><h5>UniRoom AI Assistant</h5><p>Trợ lý hỗ trợ giải đáp và định hướng tìm phòng.</p><button class="btn btn-sm btn-outline-primary" onclick="showPage(token?'ai':'login')">Trải nghiệm trợ lý <i class="bi bi-arrow-up-right"></i></button></div></div></div></div></div></section>
<section class="home-cta"><div><span class="eyebrow eyebrow-light">SẴN SÀNG BẮT ĐẦU?</span><h2>Không gian tốt bắt đầu<br>từ một lịch đặt rõ ràng.</h2><p>Khám phá phòng học và phòng Lab đang được quản lý trên UniRoom.</p></div><div class="cta-actions"><button class="btn btn-light btn-lg" onclick="showPage('rooms')">Khám phá phòng <i class="bi bi-arrow-right ms-2"></i></button>${token ? "" : '<button class="btn btn-outline-light btn-lg" onclick="showPage(\'register\')">Tạo tài khoản</button>'}</div></section>
<section class="home-section faq-section"><div class="row g-5"><div class="col-lg-4"><span class="eyebrow">CÂU HỎI THƯỜNG GẶP</span><h2 class="section-title display-6 mt-2">Bạn muốn<br>biết thêm?</h2><p class="muted">Một vài thông tin cơ bản để bạn bắt đầu sử dụng UniRoom thuận lợi hơn.</p></div><div class="col-lg-8"><div class="accordion accordion-flush" id="homeFaq"><div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button" data-bs-toggle="collapse" data-bs-target="#faq1">Tôi có cần tài khoản để đặt phòng không?</button></h3><div id="faq1" class="accordion-collapse collapse show" data-bs-parent="#homeFaq"><div class="accordion-body">Bạn cần đăng ký và đăng nhập để gửi yêu cầu đặt phòng, xem lịch cá nhân và quản lý các booking của mình.</div></div></div><div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq2">Làm thế nào để biết yêu cầu đã được duyệt?</button></h3><div id="faq2" class="accordion-collapse collapse" data-bs-parent="#homeFaq"><div class="accordion-body">Bạn có thể theo dõi trạng thái booking và thông báo trong bảng điều khiển cá nhân.</div></div></div><div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq3">Tôi có thể xem lịch đặt phòng ở đâu?</button></h3><div id="faq3" class="accordion-collapse collapse" data-bs-parent="#homeFaq"><div class="accordion-body">Sau khi đăng nhập, mở mục Lịch cá nhân trên thanh điều hướng để xem lịch đặt đã được đồng bộ.</div></div></div><div class="accordion-item"><h3 class="accordion-header"><button class="accordion-button collapsed" data-bs-toggle="collapse" data-bs-target="#faq4">Nếu cần hỗ trợ tìm phòng thì sao?</button></h3><div id="faq4" class="accordion-collapse collapse" data-bs-parent="#homeFaq"><div class="accordion-body">Bạn có thể sử dụng bộ lọc tìm kiếm phòng hoặc mở UniRoom AI Assistant từ tài khoản.</div></div></div></div></div></div></section>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function loginPage() {
  app.innerHTML = `<div class="row justify-content-center"><div class="col-md-6 col-lg-5"><div class="panel auth-panel"><div class="auth-brand"><span class="brand-mark"><i class="bi bi-buildings-fill"></i></span><span>UniRoom</span></div><span class="eyebrow">CHÀO MỪNG QUAY TRỞ LẠI</span><h2 class="section-title">Đăng nhập UniRoom</h2><p class="muted">Tiếp tục quản lý lịch học và không gian của bạn.</p><form id="login-form"><label class="form-label">Email</label><input class="form-control mb-3" name="email" type="email" required><label class="form-label">Mật khẩu</label><input class="form-control mb-3" name="password" type="password" required><button class="btn btn-primary w-100">Đăng nhập</button></form><p class="mt-3 mb-0 text-center">Chưa có tài khoản? <a href="#" onclick="showPage('register')">Đăng ký</a></p></div></div></div>`;
  document.getElementById("login-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const f = new FormData(e.target);
      const d = await api("/auth/login", {
        method: "POST",
        body: { email: f.get("email"), password: f.get("password") },
      });
      token = d.access_token;
      me = d.user;
      localStorage.setItem("uniroom_token", token);
      localStorage.setItem("uniroom_user", JSON.stringify(me));
      syncNav();
      showPage(me.role === "ADMIN" ? "adminDashboard" : me.role === "ROOM_MANAGER" ? "rooms" : "dashboard");
      alertMsg("Đăng nhập thành công");
    } catch (x) {
      alertMsg(x.message, "danger");
    }
  };
}
function registerPage() {
  app.innerHTML = `<div class="row justify-content-center"><div class="col-md-6"><div class="panel auth-panel"><div class="auth-brand"><span class="brand-mark"><i class="bi bi-buildings-fill"></i></span><span>UniRoom</span></div><span class="eyebrow">BẮT ĐẦU CÙNG UNIROOM</span><h2 class="section-title">Tạo tài khoản</h2><p class="muted">Đăng ký để khám phá và đặt không gian học tập.</p><form id="reg-form"><label class="form-label">Họ và tên</label><input class="form-control mb-3" name="full_name" required minlength="2"><label class="form-label">Email</label><input class="form-control mb-3" name="email" type="email" required><label class="form-label">Mật khẩu (ít nhất 8 ký tự)</label><input class="form-control mb-3" name="password" type="password" minlength="8" required><button class="btn btn-primary w-100">Đăng ký</button></form></div></div></div>`;
  document.getElementById("reg-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const f = new FormData(e.target);
      const d = await api("/auth/register", {
        method: "POST",
        body: Object.fromEntries(f),
      });
      token = d.access_token;
      me = d.user;
      localStorage.setItem("uniroom_token", token);
      localStorage.setItem("uniroom_user", JSON.stringify(me));
      syncNav();
      showPage("dashboard");
      alertMsg("Tạo tài khoản thành công");
    } catch (x) {
      alertMsg(x.message, "danger");
    }
  };
}
async function roomsPage() {
  app.innerHTML = `<div class="page-heading"><div><span class="eyebrow">KHÔNG GIAN HỌC TẬP</span><h2 class="section-title display-6 mt-2">Khám phá phòng</h2><p class="muted">Tìm kiếm theo tên, mã phòng hoặc sức chứa để chọn không gian phù hợp.</p></div><div class="page-heading-icon"><i class="bi bi-buildings"></i></div></div><div class="panel mb-4"><div class="row g-2"><div class="col-md-5"><input id="q" class="form-control" placeholder="Tên phòng hoặc mã phòng"></div><div class="col-md-3"><input id="capacity" type="number" min="1" value="1" class="form-control" placeholder="Sức chứa tối thiểu"></div><div class="col-md-2"><button class="btn btn-primary w-100" onclick="loadRooms()">Tìm phòng</button></div><div class="col-md-2"><button class="btn btn-outline-secondary w-100" onclick="document.getElementById('q').value='';loadRooms()">Xoá lọc</button></div></div></div><div id="room-results" class="row g-3"></div>`;
  await loadRooms();
}
async function loadRooms() {
  try {
    const q = encodeURIComponent(document.getElementById("q")?.value || "");
    const c = document.getElementById("capacity")?.value || 1;
    const rows = await api(`/rooms?q=${q}&min_capacity=${c}`);
    document.getElementById("room-results").innerHTML = rows.length
      ? rows
          .map(
            (r) =>
              `<div class="col-md-6 col-xl-4"><div class="room-card"><div class="room-icon mb-3"><i class="bi bi-door-open"></i></div><div class="d-flex justify-content-between"><span class="badge text-bg-light">${esc(r.code)}</span><span class="badge text-bg-success">${r.capacity} chỗ</span></div><h5 class="mt-3">${esc(r.name)}</h5><p class="muted mb-1">${esc(r.building)} · Tầng ${r.floor}</p><p class="muted">${esc(r.room_type)}</p><p>${esc(r.description)}</p><div class="room-equipment-summary"><span class="room-equipment-heading"><i class="bi bi-pc-display-horizontal me-1"></i>Thiết bị phòng</span><div class="room-equipment-tags">${(r.equipment || []).length ? r.equipment.map((name) => `<span class="room-equipment-tag">${esc(name)}</span>`).join("") : '<span class="muted small">Chưa cập nhật thiết bị</span>'}</div></div><button class="btn btn-primary w-100" onclick="bookingForm(${r.id},'${esc(r.name)}',${r.capacity})">Đặt phòng</button></div></div>`,
          )
          .join("")
      : '<div class="col-12"><div class="panel text-center muted">Không tìm thấy phòng phù hợp.</div></div>';
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
function bookingForm(id, name, capacity) {
  if (!token) {
    alertMsg("Vui lòng đăng nhập trước khi đặt phòng", "warning");
    return showPage("login");
  }
  app.innerHTML = `<div class="row justify-content-center"><div class="col-lg-7"><div class="panel"><button class="btn btn-sm btn-link px-0" onclick="roomsPage()">← Quay lại</button><h2 class="section-title">Đặt ${esc(name)}</h2><p class="muted">Sức chứa tối đa: ${capacity} người</p><form id="booking-form"><input type="hidden" name="room_id" value="${id}"><label class="form-label">Tên buổi sử dụng</label><input class="form-control mb-3" name="title" required minlength="3"><label class="form-label">Mục đích</label><textarea class="form-control mb-3" name="purpose"></textarea><label class="form-label">Số người</label><input class="form-control mb-3" type="number" name="attendee_count" min="1" max="${capacity}" value="1" required><div class="row"><div class="col"><label class="form-label">Bắt đầu</label><input class="form-control mb-3" type="datetime-local" name="start_at" required></div><div class="col"><label class="form-label">Kết thúc</label><input class="form-control mb-3" type="datetime-local" name="end_at" required></div></div><button class="btn btn-primary w-100">Gửi yêu cầu đặt phòng</button></form></div></div></div>`;
  document.getElementById("booking-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const f = new FormData(e.target),
        o = Object.fromEntries(f);
      o.room_id = +o.room_id;
      o.attendee_count = +o.attendee_count;
      await api("/bookings", { method: "POST", body: o });
      alertMsg("Đã gửi yêu cầu. Booking đang chờ duyệt.");
      dashboardPage();
    } catch (x) {
      if (x.message.includes("booking giao") || x.message.includes("đã có booking")) {
        const f = new FormData(e.target);
        const o = Object.fromEntries(f);
        o.room_id = Number(o.room_id);
        o.attendee_count = Number(o.attendee_count);
        const area = document.createElement("div");
        area.className = "alert alert-warning mt-3";
        area.innerHTML = `<strong>Khung giờ đã có lịch đặt.</strong><p class="mb-2">Bạn có thể tham gia danh sách chờ và được thông báo khi phòng trống.</p><button type="button" class="btn btn-primary btn-sm">Tham gia Waitlist</button>`;
        e.target.querySelector(".waitlist-conflict")?.remove();
        area.classList.add("waitlist-conflict");
        area.querySelector("button").onclick = async () => {
          try {
            await api("/waitlist", {method:"POST", body:o});
            alertMsg("Đã đăng ký danh sách chờ thành công");
            dashboardPage();
          } catch (err) { alertMsg(err.message,"danger"); }
        };
        e.target.appendChild(area);
      } else alertMsg(x.message, "danger");
    }
  };
}
async function dashboardPage() {
  if (!token) return showPage("login");
  try {
    const [bs, ns] = await Promise.all([
      api("/bookings/me"),
      api("/notifications/me"),
    ]);
    const waitlist = me?.role === "USER" ? await api("/waitlist/me") : [];
    const upcoming = bs.filter((b) => new Date(b.end_at) > new Date()).length;
    app.innerHTML = `<div class="d-flex justify-content-between flex-wrap"><div><h2 class="section-title">Xin chào, ${esc(me?.full_name || "")} 👋</h2><p class="muted">Tổng quan hoạt động đặt phòng của bạn</p></div><button class="btn btn-primary align-self-start" onclick="showPage('rooms')">+ Đặt phòng mới</button></div><div class="row g-3 my-2"><div class="col-md-4"><div class="stat"><span class="muted">Tổng booking</span><strong>${bs.length}</strong></div></div><div class="col-md-4"><div class="stat"><span class="muted">Lịch sắp tới</span><strong>${upcoming}</strong></div></div><div class="col-md-4"><div class="stat"><span class="muted">Thông báo</span><strong>${ns.filter((n) => !n.read).length}</strong></div></div></div><div class="panel mt-3"><div class="d-flex justify-content-between"><h5>Booking gần đây</h5><a href="#" onclick="showPage('calendar')">Xem lịch</a></div>${bookingTable(bs)}</div><div class="panel mt-3"><h5>Thông báo mới</h5>${
      ns
        .slice(0, 5)
        .map(
          (n) =>
            `<div class="border-bottom py-2"><b>${esc(n.title)}</b><div class="muted small">${esc(n.body)}</div></div>`,
        )
        .join("") || '<p class="muted">Chưa có thông báo.</p>'
    }</div>${me?.role === "USER" ? `<div class="panel mt-3"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0">Danh sách chờ (Waitlist)</h5><span class="badge text-bg-primary">${waitlist.filter(x=>x.status==="WAITING").length} đang chờ</span></div>${waitlist.length ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Phòng</th><th>Thời gian</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>${waitlist.map(w=>`<tr><td>${esc(w.room_code)}</td><td>${new Date(w.start_at).toLocaleString("vi-VN")} – ${new Date(w.end_at).toLocaleString("vi-VN")}</td><td><span class="badge ${w.status==="NOTIFIED"?"text-bg-success":"text-bg-secondary"}">${esc(w.status)}</span></td><td>${["WAITING","NOTIFIED"].includes(w.status)?`<button class="btn btn-sm btn-outline-danger" onclick="leaveWaitlist(${w.id})">Rời danh sách</button>`:""} ${w.status==="NOTIFIED"?`<button class="btn btn-sm btn-primary" onclick="openWaitlistBooking(${w.room_id},'${esc(w.room_code)}',${JSON.stringify(w.start_at)},${JSON.stringify(w.end_at)})">Đặt phòng</button>`:""}</td></tr>`).join("")}</tbody></table></div>`:"<p class='muted mb-0'>Chưa tham gia danh sách chờ.</p>"}</div>` : ""}<div class="mt-3"><button class="btn btn-outline-primary" onclick="showPage('ai')">Mở AI Assistant</button></div>`;
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function leaveWaitlist(id) {
  if (!(await uniroomConfirm("Rời danh sách chờ","Bạn muốn hủy yêu cầu chờ này?","Rời danh sách"))) return;
  try { await api(`/waitlist/${id}`,{method:"DELETE"}); alertMsg("Đã rời danh sách chờ"); dashboardPage(); }
  catch(e) { alertMsg(e.message,"danger"); }
}
async function openWaitlistBooking(roomId, code, start, end) {
  const room = await api(`/rooms/${roomId}`);
  bookingForm(roomId, code, room.capacity);
  const form = document.getElementById("booking-form");
  if (form) {
    form.elements.start_at.value = start.slice(0,16);
    form.elements.end_at.value = end.slice(0,16);
  }
}
function bookingTable(bs) {
  return bs.length
    ? `<div class="table-responsive"><table class="table"><thead><tr><th>Phòng</th><th>Nội dung</th><th>Thời gian</th><th>Trạng thái</th><th></th></tr></thead><tbody>${bs.map((b) => `<tr><td>${esc(b.room_code)}</td><td>${esc(b.title)}</td><td>${new Date(b.start_at).toLocaleString("vi-VN")}</td><td><span class="badge text-bg-${b.status === "APPROVED" ? "success" : b.status === "REJECTED" ? "danger" : "warning"} badge-status">${esc(b.status)}</span></td><td>${b.status === "PENDING" ? `<button class="btn btn-sm btn-outline-danger" onclick="cancelBooking(${b.id})">Huỷ</button>` : ""} ${b.status === "APPROVED" ? `<button class="btn btn-sm btn-outline-primary" onclick="checkIn(${b.id})">Check-in</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`
    : '<p class="muted">Bạn chưa có booking nào.</p>';
}
function uniroomConfirm(title, message, actionLabel = "Xác nhận") {
  return new Promise((resolve) => {
    let element = document.getElementById("uniroom-confirm-modal");
    if (!element) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="uniroom-confirm-modal" tabindex="-1" aria-labelledby="uniroom-confirm-title" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered"><div class="modal-content uniroom-reject-modal-content">
            <div class="modal-header uniroom-reject-modal-header">
              <div><div class="uniroom-reject-eyebrow">UNIROOM · XÁC NHẬN THAO TÁC</div><h5 id="uniroom-confirm-title" class="modal-title"></h5></div>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
            </div>
            <div class="modal-body"><p id="uniroom-confirm-message" class="mb-0"></p></div>
            <div class="modal-footer border-0"><button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Quay lại</button>
              <button type="button" class="btn btn-danger" id="uniroom-confirm-action"></button></div>
          </div></div></div>`);
      element = document.getElementById("uniroom-confirm-modal");
    }
    document.getElementById("uniroom-confirm-title").textContent = title;
    document.getElementById("uniroom-confirm-message").textContent = message;
    const action = document.getElementById("uniroom-confirm-action");
    action.textContent = actionLabel;
    const instance = bootstrap.Modal.getOrCreateInstance(element);
    let completed = false;
    const finish = (value) => {
      if (completed) return;
      completed = true;
      action.removeEventListener("click", accept);
      element.removeEventListener("hidden.bs.modal", cancel);
      resolve(value);
    };
    const accept = () => { finish(true); instance.hide(); };
    const cancel = () => finish(false);
    action.addEventListener("click", accept);
    element.addEventListener("hidden.bs.modal", cancel, { once: true });
    instance.show();
  });
}
async function cancelBooking(id) {
  if (!(await uniroomConfirm("Hủy yêu cầu đặt phòng", "Bạn chắc chắn muốn hủy booking này? Hành động này không thể hoàn tác.", "Xác nhận hủy"))) return;
  try {
    await api(`/bookings/${id}`, { method: "DELETE" });
    alertMsg("Đã huỷ booking");
    dashboardPage();
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function checkIn(id) {
  try {
    const d = await api(`/bookings/${id}/check-in`, { method: "POST" });
    alertMsg("Check-in thành công · QR token: " + d.qr_token);
    dashboardPage();
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function notificationsPage() {
  if (!token) return showPage("login");
  try {
    const rows = await api("/notifications/me");
    app.innerHTML = `<h2 class="section-title">Thông báo mới</h2><p class="muted">Thông báo về đặt phòng, bảo trì và hoạt động của UniRoom.</p>
      <div class="panel">${rows.length ? rows.map(n => `<div class="border-bottom py-3 d-flex justify-content-between gap-3">
        <div><div class="fw-semibold">${esc(n.title)} ${n.read ? '' : '<span class="badge text-bg-primary">Mới</span>'}</div>
        <div class="muted mt-1">${esc(n.body)}</div><small class="muted">${new Date(n.created_at).toLocaleString('vi-VN')}</small></div>
        ${n.read ? '' : `<button class="btn btn-sm btn-outline-primary align-self-center" onclick="markNotificationRead(${n.id})">Đã đọc</button>`}
      </div>`).join('') : '<p class="muted">Chưa có thông báo.</p>'}</div>`;
  } catch (e) { alertMsg(e.message, "danger"); }
}
async function markNotificationRead(id) {
  try { await api(`/notifications/${id}/read`, { method: "PATCH" }); notificationsPage(); }
  catch (e) { alertMsg(e.message, "danger"); }
}
async function calendarPage() {
  if (!token) return showPage("login");
  const rows = await api("/calendar/me");
  const overview = me && ["ADMIN", "ROOM_MANAGER"].includes(me.role);
  app.innerHTML = `<h2 class="section-title">${overview ? "Lịch tổng quan" : "Lịch cá nhân"}</h2><p class="muted">${overview ? "Lịch booking do User/Giảng viên tạo trong phạm vi được phân quyền." : "Các lịch đặt phòng được đồng bộ từ database."}</p><div class="panel"><div id="calendar"></div></div><div class="mt-3 d-flex gap-2"><a class="btn btn-outline-primary" href="/api/calendar/export.csv" onclick="return downloadWithAuth(event,'/api/calendar/export.csv')">Xuất Excel/CSV</a><button class="btn btn-outline-primary" onclick="downloadPDF()">Xuất PDF</button></div>`;
  const cal = new FullCalendar.Calendar(document.getElementById("calendar"), {
    initialView: "dayGridMonth",
    locale: "vi",
    height: "auto",
    fixedWeekCount: false,
    dayMaxEvents: false,
    displayEventTime: true,
    eventDisplay: "block",
    eventTimeFormat: { hour: "numeric", minute: "2-digit", meridiem: "short", hour12: true },
    events: rows.filter((event) => !/\(CANCELLED\)/i.test(event.title || "")),
    eventClassNames: function (arg) {
      return arg.event.extendedProps.status === "REJECTED" ? ["uniroom-event-rejected"] :
             arg.event.extendedProps.status === "MAINTENANCE" ? ["uniroom-event-maintenance"] : [];
    },
    eventContent: function (arg) {
      const wrapper = document.createElement("div");
      wrapper.className = "uniroom-calendar-event";
      const time = document.createElement("span");
      time.className = "uniroom-calendar-event-time";
      const formatTime = (value) => value ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(value) : "";
      time.textContent = arg.event.start ? `${formatTime(arg.event.start)}${arg.event.end ? " - " + formatTime(arg.event.end) : ""}` : "";
      const title = document.createElement("span");
      title.className = "uniroom-calendar-event-title";
      title.textContent = arg.event.title || "";
      const status = arg.event.extendedProps.status;
      const statusLabels = {
        PENDING: "CHỜ DUYỆT · PENDING",
        REJECTED: "ĐÃ TỪ CHỐI · REJECTED",
        APPROVED: "ĐÃ DUYỆT · APPROVED",
        CHECKED_IN: "ĐÃ CHECK-IN · CHECKED IN",
        MAINTENANCE: "ĐANG BẢO TRÌ · MAINTENANCE"
      };
      if (statusLabels[status] && arg.event.extendedProps.show_status !== false) {
        const badge = document.createElement("span");
        badge.className = "uniroom-calendar-status-badge status-" + status.toLowerCase();
        badge.textContent = statusLabels[status];
        wrapper.appendChild(badge);
      }
      if (time.textContent) wrapper.appendChild(time);
      wrapper.appendChild(title);
      return { domNodes: [wrapper] };
    },
  });
  cal.render();
  // Sau 2 phút kể từ lúc từ chối, lịch bị loại khỏi cả ba vai trò.
  // Tự đồng bộ dữ liệu khi trang lịch còn hiển thị, không cần tải lại thủ công.
  if (window.uniroomCalendarRefreshTimer) clearInterval(window.uniroomCalendarRefreshTimer);
  window.uniroomCalendarRefreshTimer = setInterval(async () => {
    if (!document.getElementById("calendar") || !token) {
      clearInterval(window.uniroomCalendarRefreshTimer);
      window.uniroomCalendarRefreshTimer = null;
      return;
    }
    try {
      const updated = await api("/calendar/me");
      cal.removeAllEvents();
      cal.addEventSource(updated);
    } catch (e) { console.warn("Không thể cập nhật lịch:", e); }
  }, 10000);
}
async function downloadWithAuth(e, url) {
  e.preventDefault();
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return alertMsg("Không thể xuất file", "danger");
  const blob = await r.blob(),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "uniroom-calendar.csv";
  a.click();
  URL.revokeObjectURL(a.href);
  return false;
}
async function downloadPDF() {
  const r = await fetch("/api/calendar/export.pdf", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return alertMsg("Không thể xuất PDF", "danger");
  const b = await r.blob(),
    a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = "uniroom-calendar.pdf";
  a.click();
  URL.revokeObjectURL(a.href);
}
async function profilePage() {
  const u = await api("/users/me");
  app.innerHTML = `<div class="row justify-content-center"><div class="col-lg-7"><div class="panel"><h2 class="section-title">Hồ sơ cá nhân</h2><form id="profile-form"><label class="form-label">Họ tên</label><input class="form-control mb-3" name="full_name" value="${esc(u.full_name)}" required><label class="form-label">Email</label><input class="form-control mb-3" value="${esc(u.email)}" disabled>${["ADMIN", "ROOM_MANAGER"].includes(me.role) ? "" : `<label class="form-label">Số điện thoại</label><input class="form-control mb-3" name="phone" value="${esc(u.phone || "")}">`}<button class="btn btn-primary">Lưu hồ sơ</button></form><hr><h5>Đổi mật khẩu</h5><form id="pass-form"><input class="form-control mb-2" name="current_password" type="password" placeholder="Mật khẩu hiện tại" required><input class="form-control mb-2" name="new_password" type="password" placeholder="Mật khẩu mới (8 ký tự)" minlength="8" required><button class="btn btn-outline-primary">Đổi mật khẩu</button></form></div></div></div>`;
  document.getElementById("profile-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const d = await api("/users/me", {
        method: "PATCH",
        body: Object.fromEntries(new FormData(e.target)),
      });
      me = d;
      localStorage.setItem("uniroom_user", JSON.stringify(d));
      alertMsg("Đã cập nhật hồ sơ");
    } catch (x) {
      alertMsg(x.message, "danger");
    }
  };
  document.getElementById("pass-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/users/me/change-password", {
        method: "POST",
        body: Object.fromEntries(new FormData(e.target)),
      });
      alertMsg("Đổi mật khẩu thành công");
    } catch (x) {
      alertMsg(x.message, "danger");
    }
  };
}
async function managerPage() {
  if (!token) return showPage("login");
  if (!me || !["ROOM_MANAGER", "ADMIN"].includes(me.role))
    return alertMsg(
      "Bạn không có quyền truy cập khu vực quản lý phòng",
      "danger",
    );
  try {
    const [sum, rooms, bookings, maint, allBookings, equipment] =
      await Promise.all([
        api("/manager/summary"),
        api("/manager/rooms"),
        api("/manager/bookings"),
        api("/manager/maintenance"),
        api("/manager/bookings/all"),
        api("/manager/equipment"),
      ]);
    app.innerHTML = `<div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4"><div><span class="eyebrow">ROOM OPERATIONS</span><h2 class="section-title mb-1">Trung tâm quản lý phòng</h2><p class="muted mb-0">Theo dõi lịch sử dụng, xử lý yêu cầu và tình trạng cơ sở vật chất.</p></div><span class="badge text-bg-primary p-2">${me.role === "ADMIN" ? "Admin" : "Manager"}</span></div>
  <div class="row g-3 mb-4">${[
    ["Phòng trong hệ thống", sum.rooms, "bi-building"],
    ["Chờ duyệt", sum.pending, "bi-hourglass-split"],
    ["Đã duyệt", sum.approved, "bi-calendar-check"],
    ["Đang bảo trì", sum.maintenance, "bi-tools"],
  ]
    .map(
      (x) =>
        `<div class="col-6 col-xl-3"><div class="stat h-100"><span class="muted"><i class="bi ${x[2]} me-1"></i>${x[0]}</span><strong>${x[1]}</strong></div></div>`,
    )
    .join("")}</div>
  <div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-primary" onclick="managerTab('requests')">Yêu cầu đặt phòng (${bookings.length})</button><button class="btn btn-outline-primary" onclick="managerTab('rooms')">Danh sách phòng</button><button class="btn btn-outline-primary" onclick="managerTab('maintenance')">Bảo trì & sự cố</button><button class="btn btn-outline-primary" onclick="managerTab('equipment')">Thiết bị</button><button class="btn btn-outline-primary" onclick="managerTab('schedule')">Lịch sử dụng</button><button class="btn btn-outline-primary" onclick="managerTab('waitlist')">Danh sách chờ</button></div><div id="manager-content"></div>`;
    window.managerData = {
      sum,
      rooms,
      bookings,
      maint,
      allBookings,
      equipment,
    };
    managerTab("requests");
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
function managerTab(tab) {
  const d = window.managerData || {},
    el = document.getElementById("manager-content");
  if (!el) return;
  if (tab === "waitlist") {
    el.innerHTML = '<div class="panel"><h5>Danh sách chờ theo phòng phụ trách</h5><div id="manager-waitlist-data">Đang tải...</div></div>';
    api("/manager/waitlist").then(rows => {
      const target = document.getElementById("manager-waitlist-data");
      if (!target) return;
      target.innerHTML = rows.length ? `<div class="table-responsive"><table class="table"><thead><tr><th>Người chờ</th><th>Phòng</th><th>Khung giờ</th><th>Trạng thái</th></tr></thead><tbody>${rows.map(w=>`<tr><td>${esc(w.user)}</td><td>${esc(w.room_code)}</td><td>${new Date(w.start_at).toLocaleString("vi-VN")} – ${new Date(w.end_at).toLocaleString("vi-VN")}</td><td>${esc(w.status)}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">Chưa có người đăng ký chờ.</p>';
    }).catch(e=>alertMsg(e.message,"danger"));
    return;
  }
  if (tab === "requests") {
    el.innerHTML = `<div class="panel"><div class="d-flex justify-content-between align-items-center mb-3"><div class="d-flex align-items-center gap-2"><h5 class="mb-0">Yêu cầu đang chờ xử lý</h5><span class="badge text-bg-primary">${me.role === "ADMIN" ? "Admin" : "Manager"}</span></div><button class="btn btn-sm btn-outline-primary" onclick="managerPage()">Làm mới</button></div>${d.bookings?.length ? `<div class="table-responsive"><table class="table align-middle"><thead><tr><th>Người đặt</th><th>Phòng</th><th>Nội dung</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>${d.bookings.map((b) => `<tr><td>${esc(b.user)}</td><td><b>${esc(b.room_code)}</b></td><td>${esc(b.title)}<div class="small muted">${esc(b.purpose || "")}</div></td><td>${new Date(b.start_at).toLocaleString("vi-VN")}<br>${new Date(b.end_at).toLocaleString("vi-VN")}</td><td class="text-nowrap"><button class="btn btn-sm btn-success" onclick="decision(${b.id},'APPROVED')">Duyệt</button> <button class="btn btn-sm btn-outline-danger" onclick="decision(${b.id},'REJECTED')">Từ chối</button></td></tr>`).join("")}</tbody></table></div>` : '<p class="muted mb-0">Không có yêu cầu chờ duyệt.</p>'}</div>`;
  }
  if (tab === "rooms") {
    el.innerHTML = `<div class="panel"><div class="d-flex justify-content-between flex-wrap gap-2 mb-3"><h5>Danh mục phòng & tình trạng</h5><button class="btn btn-primary btn-sm" onclick="showCreateRoom()">+ Thêm phòng</button></div><div class="table-responsive"><table class="table"><thead><tr><th>Mã phòng</th><th>Tòa nhà</th><th>Loại</th><th>Sức chứa</th><th>Tầng</th><th>Trạng thái</th></tr></thead><tbody>${(d.rooms || []).map((r) => `<tr><td><b>${esc(r.code)}</b><div class="small muted">${esc(r.name)}</div></td><td>${esc(r.building)}</td><td>${esc(r.room_type)}</td><td>${r.capacity}</td><td>${r.floor}</td><td><span class="badge ${r.status === "ACTIVE" ? "text-bg-success" : r.status === "MAINTENANCE" ? "text-bg-warning" : "text-bg-secondary"}">${esc(r.status)}</span></td></tr>`).join("")}</tbody></table></div><p class="small muted mb-0">Room Manager có thể theo dõi danh mục phòng; thao tác thêm phòng phụ thuộc quyền được cấp.</p></div>`;
  }
  if (tab === "maintenance") {
    el.innerHTML = `<div class="row g-3"><div class="col-lg-5"><form class="panel" id="maintenance-form"><h5>Tạo lịch bảo trì / ghi nhận sự cố</h5><label class="form-label">Phòng</label><select class="form-select mb-2" name="room_id" required>${(d.rooms || []).map((r) => `<option value="${r.id}">${esc(r.code)} · ${esc(r.name)}</option>`).join("")}</select><label class="form-label">Bắt đầu</label><input class="form-control mb-2" type="datetime-local" name="start_at" required><label class="form-label">Kết thúc</label><input class="form-control mb-2" type="datetime-local" name="end_at" required><label class="form-label">Lý do / mô tả</label><textarea class="form-control mb-3" name="reason" required></textarea><button class="btn btn-primary">Lưu lịch bảo trì</button></form></div><div class="col-lg-7"><div class="panel"><h5>Lịch bảo trì</h5>${d.maint?.length ? d.maint.map((m) => `<div class="border-bottom py-3 d-flex justify-content-between gap-2"><div><b>${esc(m.room)} · ${esc(m.reason)}</b><div class="small muted">${new Date(m.start_at).toLocaleString("vi-VN")} – ${new Date(m.end_at).toLocaleString("vi-VN")}</div><span class="badge text-bg-${m.status === "ACTIVE" ? "warning" : "success"}">${esc(m.status)}</span></div>${m.status === "ACTIVE" ? `<button class="btn btn-sm btn-outline-success align-self-center" onclick="finishMaintenance(${m.id})">Hoàn tất</button>` : ""}</div>`).join("") : '<p class="muted">Chưa có lịch bảo trì.</p>'}</div></div></div>`;
    document.getElementById("maintenance-form").onsubmit = async (e) => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target));
      o.room_id = +o.room_id;
      try {
        await api("/manager/maintenance", { method: "POST", body: o });
        alertMsg("Đã ghi nhận lịch bảo trì");
        managerPage();
      } catch (x) {
        alertMsg(x.message, "danger");
      }
    };
  }
  if (tab === "equipment") {
    el.innerHTML = `<div class="row g-3"><div class="col-lg-5"><form class="panel" id="equipment-form"><h5>Cập nhật thiết bị phòng</h5><label class="form-label">Phòng</label><select class="form-select mb-2" name="room_id">${(d.rooms || []).map((r) => `<option value="${r.id}">${esc(r.code)}</option>`).join("")}</select><label class="form-label">Tên thiết bị</label><input class="form-control mb-2" name="name" placeholder="Máy chiếu, máy tính..." required><label class="form-label">Số lượng</label><input class="form-control mb-3" type="number" min="1" name="quantity" value="1"><button class="btn btn-primary">Lưu thiết bị</button></form></div><div class="col-lg-7"><div class="panel"><h5>Thiết bị theo phòng</h5>${(d.equipment || []).map((x) => `<div class="border-bottom py-2 d-flex justify-content-between"><span>${esc(x.room)} · ${esc(x.equipment)}</span><b>× ${x.quantity}</b></div>`).join("") || '<p class="muted">Chưa có thiết bị được ghi nhận.</p>'}</div></div></div>`;
    document.getElementById("equipment-form").onsubmit = async (e) => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target));
      o.room_id = +o.room_id;
      o.quantity = +o.quantity;
      try {
        await api("/manager/equipment", { method: "POST", body: o });
        alertMsg("Đã cập nhật thiết bị");
        managerPage();
      } catch (x) {
        alertMsg(x.message, "danger");
      }
    };
  }
  if (tab === "schedule") {
    const active = d.allBookings || [];
    el.innerHTML = `<div class="panel"><h5>Lịch yêu cầu cần xử lý</h5><p class="muted">Danh sách dưới đây tập trung vào các booking chờ duyệt. Lịch đã duyệt có thể xem trong bảng booking tổng hợp của Admin.</p>${active.length ? active.map((b) => `<div class="border-bottom py-2 d-flex justify-content-between"><div><b>${esc(b.room_code)} · ${esc(b.title)}</b><div class="small muted">${new Date(b.start_at).toLocaleString("vi-VN")} – ${new Date(b.end_at).toLocaleString("vi-VN")}</div></div><span class="badge text-bg-secondary align-self-center">${esc(b.status)}</span></div>`).join("") : '<p class="muted">Không có lịch đặt phòng.</p>'}</div>`;
  }
}
async function finishMaintenance(id) {
  try {
    await api(`/manager/maintenance/${id}`, { method: "PATCH" });
    alertMsg("Đã hoàn tất bảo trì");
    managerPage();
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function showCreateRoom() {
  try {
    const meta = await api("/rooms/meta");
    const host = document.getElementById("manager-content");
    host.innerHTML = `<div class="panel"><h5>Thêm phòng mới</h5><form id="create-room-form" class="row g-3"><div class="col-md-6"><label class="form-label">Mã phòng</label><input class="form-control" name="code" required></div><div class="col-md-6"><label class="form-label">Tên phòng</label><input class="form-control" name="name" required></div><div class="col-md-6"><label class="form-label">Tòa nhà</label><select class="form-select" name="building_id">${meta.buildings.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div><div class="col-md-6"><label class="form-label">Loại phòng</label><select class="form-select" name="room_type_id">${meta.room_types.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div><div class="col-md-4"><label class="form-label">Sức chứa</label><input class="form-control" type="number" min="1" name="capacity" value="30"></div><div class="col-md-4"><label class="form-label">Tầng</label><input class="form-control" type="number" min="0" name="floor" value="1"></div><div class="col-md-4"><label class="form-label">Mô tả</label><input class="form-control" name="description"></div><div class="col-12"><button class="btn btn-primary">Tạo phòng</button> <button type="button" class="btn btn-light" onclick="managerPage()">Quay lại</button></div></form></div>`;
    document.getElementById("create-room-form").onsubmit = async (e) => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target));
      ["building_id", "room_type_id", "capacity", "floor"].forEach(
        (k) => (o[k] = +o[k]),
      );
      try {
        await api("/manager/rooms", { method: "POST", body: o });
        alertMsg("Đã tạo phòng");
        managerPage();
      } catch (x) {
        alertMsg(x.message, "danger");
      }
    };
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function decision(id, d) {
  if (d === "REJECTED") {
    let modalEl = document.getElementById("uniroom-reject-modal");
    if (!modalEl) {
      document.body.insertAdjacentHTML("beforeend", `
        <div class="modal fade" id="uniroom-reject-modal" tabindex="-1" aria-labelledby="uniroom-reject-title" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content uniroom-reject-modal-content">
              <div class="modal-header uniroom-reject-modal-header">
                <div><div class="uniroom-reject-eyebrow">UNIROOM · QUẢN LÝ YÊU CẦU</div><h5 class="modal-title" id="uniroom-reject-title"><i class="bi bi-x-circle me-2"></i>Từ chối yêu cầu đặt phòng</h5></div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
              </div>
              <form id="uniroom-reject-form">
                <div class="modal-body">
                  <p class="text-secondary mb-3">Vui lòng nhập lý do để người đặt phòng biết nguyên nhân yêu cầu không được duyệt.</p>
                  <label for="uniroom-reject-note" class="form-label fw-semibold">Lý do từ chối <span class="text-danger">*</span></label>
                  <textarea id="uniroom-reject-note" class="form-control uniroom-reject-textarea" rows="4" maxlength="1000" placeholder="Ví dụ: Phòng đang bảo trì trong khung giờ đã chọn..." required></textarea>
                  <div id="uniroom-reject-error" class="small text-danger mt-2 d-none"></div>
                </div>
                <div class="modal-footer border-0 pt-0">
                  <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Quay lại</button>
                  <button type="submit" id="uniroom-reject-submit" class="btn btn-danger"><i class="bi bi-send me-1"></i>Xác nhận từ chối</button>
                </div>
              </form>
            </div>
          </div>
        </div>`);
      modalEl = document.getElementById("uniroom-reject-modal");
    }
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const form = document.getElementById("uniroom-reject-form");
    const textarea = document.getElementById("uniroom-reject-note");
    const error = document.getElementById("uniroom-reject-error");
    const submit = document.getElementById("uniroom-reject-submit");
    form.reset();
    error.classList.add("d-none");
    submit.disabled = false;
    form.onsubmit = async (event) => {
      event.preventDefault();
      const note = textarea.value.trim();
      if (!note) {
        error.textContent = "Vui lòng nhập lý do từ chối.";
        error.classList.remove("d-none");
        textarea.focus();
        return;
      }
      submit.disabled = true;
      try {
        await api(`/manager/bookings/${id}/decision`, { method: "POST", body: { decision: d, note } });
        modal.hide();
        alertMsg("Đã từ chối booking và gửi lý do đến người đặt.");
        managerPage();
      } catch (e) {
        error.textContent = e.message;
        error.classList.remove("d-none");
      } finally { submit.disabled = false; }
    };
    modal.show();
    setTimeout(() => textarea.focus(), 200);
    return;
  }
  try {
    await api(`/manager/bookings/${id}/decision`, { method: "POST", body: { decision: d, note: "" } });
    alertMsg("Đã cập nhật booking");
    managerPage();
  } catch (e) { alertMsg(e.message, "danger"); }
}

async function adminDashboardPage() {
  if (!token) return showPage("login");
  if (!me || me.role !== "ADMIN")
    return alertMsg("Bạn không có quyền truy cập Dashboard Admin", "danger");
  try {
    const [sum, reports, bookings, rooms, roles] = await Promise.all([
      api("/admin/summary"),
      api("/admin/reports"),
      api("/admin/bookings"),
      api("/admin/rooms"),
      api("/admin/roles"),
    ]);
    const statuses = reports.by_status || {};
    const total = Number(reports.total_bookings || 0),
      approved = Number(statuses.APPROVED || 0);
    const activeRooms = rooms.filter((r) => r.status === "ACTIVE").length;
    const approvalRate = total ? Math.round((approved / total) * 100) : 0;
    const topRooms = (reports.by_room || [])
      .slice()
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5);
    app.innerHTML = `<div class="d-flex justify-content-between flex-wrap gap-3 align-items-end mb-4">
   <div><span class="eyebrow">UNIROOM · ADMIN ANALYTICS</span><h2 class="section-title mb-1">Dashboard</h2><p class="muted mb-0">Tổng quan vận hành hệ thống đặt phòng học và phòng Lab.</p></div>
   <button class="btn btn-dark" onclick="showPage('admin')"><i class="bi bi-sliders me-2"></i>Quản trị hệ thống</button></div>
   <div class="row g-3 mb-3">
    ${[
      ["Tổng người dùng", sum.users, "bi-people"],
      ["Tổng số phòng", sum.rooms, "bi-building"],
      ["Tổng booking", sum.bookings, "bi-calendar-check"],
      ["Chờ duyệt", sum.pending, "bi-hourglass-split"],
    ]
      .map(
        (x) =>
          `<div class="col-6 col-xl-3"><div class="stat h-100"><span class="muted"><i class="bi ${x[2]} me-1"></i>${x[0]}</span><strong>${x[1]}</strong></div></div>`,
      )
      .join("")}
   </div>
   <div class="row g-3 mb-3">
    <div class="col-md-4"><div class="panel h-100 admin-insight"><span class="muted">Tỷ lệ booking được duyệt</span><h3>${approvalRate}%</h3><div class="progress"><div class="progress-bar" style="width:${approvalRate}%"></div></div><small class="muted">${approved} / ${total} lượt đặt</small></div></div>
    <div class="col-md-4"><div class="panel h-100 admin-insight"><span class="muted">Phòng đang hoạt động</span><h3>${activeRooms} / ${rooms.length}</h3><small class="muted">Dựa trên trạng thái phòng trong database</small></div></div>
    <div class="col-md-4"><div class="panel h-100 admin-insight"><span class="muted">Nhóm quyền hệ thống</span><h3>${roles.length}</h3><small class="muted">Vai trò đã được cấu hình</small></div></div>
   </div>
   <div class="row g-3">
    <div class="col-lg-5"><div class="panel h-100"><h5>Trạng thái booking</h5><div style="height:260px"><canvas id="admin-status-chart"></canvas></div></div></div>
    <div class="col-lg-7"><div class="panel h-100"><h5>Lượt đặt theo phòng</h5><div style="height:260px"><canvas id="admin-room-chart"></canvas></div></div></div>
    <div class="col-12"><div class="panel"><h5>Xu hướng booking theo tháng · ${new Date().getFullYear()}</h5><div style="height:230px"><canvas id="admin-month-chart"></canvas></div></div></div>
   </div>
   <div class="row g-3 mt-1">
    <div class="col-lg-7"><div class="panel h-100"><h5>Top 5 phòng được đặt nhiều nhất</h5>${topRooms.length ? topRooms.map((r, i) => `<div class="admin-rank"><span class="admin-rank-index">${i + 1}</span><span class="admin-rank-name">${esc(r.room)}</span><div class="admin-rank-track"><div style="width:${topRooms[0].bookings ? Math.round((r.bookings / topRooms[0].bookings) * 100) : 0}%"></div></div><strong>${r.bookings}</strong></div>`).join("") : '<p class="muted">Chưa có dữ liệu phòng.</p>'}</div></div>
    <div class="col-lg-5"><div class="panel h-100"><h5>Phân bổ người dùng theo vai trò</h5>${roles.length ? roles.map((r) => `<div class="d-flex justify-content-between border-bottom py-2"><span>${esc(r.description || r.name)}</span><b>${r.members}</b></div>`).join("") : '<p class="muted">Chưa có vai trò.</p>'}</div></div>
    <div class="col-lg-7"><div class="panel"><h5>Booking mới nhất</h5>${bookingTable(bookings.slice(0, 7))}</div></div>
    <div class="col-lg-5"><div class="panel"><h5>Thông tin vận hành</h5>
     <div class="d-flex justify-content-between border-bottom py-2"><span>Booking đã duyệt</span><b>${statuses.APPROVED || 0}</b></div>
     <div class="d-flex justify-content-between border-bottom py-2"><span>Booking bị từ chối</span><b>${statuses.REJECTED || 0}</b></div>
     <div class="d-flex justify-content-between border-bottom py-2"><span>Booking đã hủy</span><b>${statuses.CANCELLED || 0}</b></div>
     <div class="d-flex justify-content-between border-bottom py-2"><span>Booking hoàn tất</span><b>${statuses.COMPLETED || 0}</b></div>
     <div class="d-flex flex-wrap gap-2 mt-3">

  <button class="btn btn-sm btn-outline-primary"
          onclick="adminPage('users')">
    Tài khoản & vai trò
  </button>

  <button class="btn btn-sm btn-outline-primary"
          onclick="adminPage('rules')">
    Rules / Policy
  </button>

  <button class="btn btn-sm btn-outline-primary"
          onclick="adminPage('reports')">
    Báo cáo
  </button>

  <button class="btn btn-sm btn-outline-primary"
          onclick="showPage('calendar')">
    Lịch tổng quan
  </button>

</div></div></div>
   </div>`;
    if (window.Chart) {
      const labels = Object.keys(statuses),
        values = Object.values(statuses);
      new Chart(document.getElementById("admin-status-chart"), {
        type: "doughnut",
        data: { labels, datasets: [{ data: values }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
        },
      });
      const roomRows = topRooms;
      new Chart(document.getElementById("admin-room-chart"), {
        type: "bar",
        data: {
          labels: roomRows.map((x) => x.room),
          datasets: [
            { label: "Số booking", data: roomRows.map((x) => x.bookings) },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
      const monthRows = reports.by_month || [];
      new Chart(document.getElementById("admin-month-chart"), {
        type: "line",
        data: {
          labels: monthRows.map((x) => x.month),
          datasets: [
            {
              label: "Booking tạo mới",
              data: monthRows.map((x) => x.bookings),
              tension: 0.3,
              fill: true,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
    }
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}

async function adminPage(defaultTab = "overview") {
  if (!token) return showPage("login");
  if (!me || me.role !== "ADMIN")
    return alertMsg("Bạn không có quyền truy cập khu vực Admin", "danger");
  try {
    const [
      sum,
      users,
      bookings,
      rooms,
      roles,
      rules,
      reports,
      logs,
      notifications,
      managers,
    ] = await Promise.all([
      api("/admin/summary"),
      api("/admin/users"),
      api("/admin/bookings"),
      api("/admin/rooms"),
      api("/admin/roles"),
      api("/admin/rules"),
      api("/admin/reports"),
      api("/admin/logs"),
      api("/admin/notifications"),
      api("/admin/room-managers"),
    ]);
    window.adminData = {
      sum,
      users,
      bookings,
      rooms,
      roles,
      rules,
      reports,
      logs,
      notifications,
      managers,
    };
    app.innerHTML = `<div class="d-flex justify-content-between flex-wrap gap-3 align-items-end mb-4"><div><span class="eyebrow">System Control</span><h2 class="section-title mb-1">Quản trị hệ thống</h2><p class="muted mb-0">Khu vực thao tác chuyên sâu: tài khoản, booking, cơ sở vật chất, chính sách và nhật ký.</p></div><span class="badge text-bg-dark p-2"><i class="bi bi-shield-lock me-1"></i> Admin</span></div>
 <div class="row g-3 mb-4">${[
   ["Người dùng", sum.users, "bi-people"],
   ["Phòng học", sum.rooms, "bi-building"],
   ["Tổng booking", sum.bookings, "bi-calendar2-check"],
   ["Chờ duyệt", sum.pending, "bi-hourglass-split"],
 ]
   .map(
     (x) =>
       `<div class="col-6 col-xl-3"><div class="stat h-100"><span class="muted"><i class="bi ${x[2]} me-1"></i>${x[0]}</span><strong>${x[1]}</strong></div></div>`,
   )
   .join("")}</div>
 <div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-outline-dark" onclick="showPage('adminDashboard')">Dashboard</button><button class="btn btn-primary" onclick="adminTab('overview')">Tổng quan</button><button class="btn btn-outline-primary" onclick="adminTab('users')">Người dùng & vai trò</button><button class="btn btn-outline-primary" onclick="adminTab('bookings')">Đặt phòng</button><button class="btn btn-outline-primary" onclick="adminTab('rooms')">Cơ sở vật chất</button><button class="btn btn-outline-primary" onclick="adminTab('rules')">Quy định</button><button class="btn btn-outline-primary" onclick="adminTab('notifications')">Thông báo</button><button class="btn btn-outline-primary" onclick="adminTab('reports')">Báo cáo</button><button class="btn btn-outline-primary" onclick="adminTab('logs')">Nhật ký</button></div><div id="admin-content"></div>`;
    adminTab(defaultTab);
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
function adminTab(tab) {
  const d = window.adminData || {},
    el = document.getElementById("admin-content");
  if (!el) return;
  if (tab === "overview") {
    el.innerHTML = `<div class="row g-3"><div class="col-lg-7"><div class="panel"><h5>Tình hình booking</h5><div class="row g-2">${Object.entries(
      d.reports.by_status || {},
    )
      .map(
        ([k, v]) =>
          `<div class="col-6 col-md-4"><div class="stat"><span class="muted">${esc(k)}</span><strong>${v}</strong></div></div>`,
      )
      .join(
        "",
      )}</div></div></div><div class="col-lg-5"><div class="panel"><h5>Phân bổ vai trò</h5>${(d.roles || []).map((r) => `<div class="d-flex justify-content-between border-bottom py-2"><span>${esc(r.name)}</span><b>${r.members}</b></div>`).join("")}</div></div></div><div class="panel mt-3"><h5>Booking mới nhất</h5>${bookingTable((d.bookings || []).slice(0, 6))}</div>`;
  }
  if (tab === "users") {
    el.innerHTML = `<div class="panel"><div class="d-flex justify-content-between flex-wrap gap-2"><h5>Quản lý người dùng</h5><input id="admin-user-search" class="form-control" style="max-width:280px" placeholder="Tìm tên hoặc email" oninput="filterAdminUsers()"></div><div class="table-responsive mt-3"><table class="table align-middle"><thead><tr><th>Họ tên</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody id="admin-user-rows">${(d.users || []).map((u) => `<tr data-search="${esc((u.full_name + " " + u.email).toLowerCase())}"><td>${esc(u.full_name)}</td><td>${esc(u.email)}</td><td><select class="form-select form-select-sm" style="min-width:150px" id="role-${u.id}"><option value="USER" ${u.role === "USER" ? "selected" : ""}>USER</option><option value="ROOM_MANAGER" ${u.role === "ROOM_MANAGER" ? "selected" : ""}>ROOM_MANAGER</option><option value="ADMIN" ${u.role === "ADMIN" ? "selected" : ""}>ADMIN</option></select></td><td><span class="badge text-bg-${u.is_active ? "success" : "secondary"}">${u.is_active ? "Hoạt động" : "Đã khóa"}</span></td><td class="text-nowrap"><button class="btn btn-sm btn-primary" onclick="saveAdminUser(${u.id},${u.is_active})">Lưu vai trò</button> <button class="btn btn-sm btn-outline-${u.is_active ? "danger" : "success"}" onclick="toggleAdminUser(${u.id},${!u.is_active})">${u.is_active ? "Khóa" : "Mở khóa"}</button></td></tr>`).join("")}</tbody></table></div><h6 class="mt-4">Ma trận vai trò</h6><div class="row g-2">${(d.roles || []).map((r) => `<div class="col-md-4"><div class="border rounded p-3"><b>${esc(r.name)}</b><div class="small muted">${esc(r.description)} · ${r.members} tài khoản</div></div></div>`).join("")}</div></div>`;
  }
  if (tab === "bookings") {
    el.innerHTML = `<div class="panel"><div class="d-flex justify-content-between align-items-center mb-3"><h5 class="mb-0">Toàn bộ yêu cầu đặt phòng</h5><span class="badge text-bg-primary p-2">${me.role === "ADMIN" ? "Admin" : "Manager"}</span></div><div class="d-flex gap-2 mb-3"><select class="form-select" style="max-width:220px" id="booking-filter" onchange="filterAdminBookings()"><option value="">Tất cả trạng thái</option>${["PENDING", "APPROVED", "REJECTED", "CANCELLED", "CHECKED_IN", "COMPLETED"].map((x) => `<option>${x}</option>`).join("")}</select></div><div id="admin-booking-list">${bookingTable(d.bookings || [])}</div></div>`;
  }
  if (tab === "rooms") {
    el.innerHTML = `<div class="panel"><h5>Quản lý phòng & cơ sở vật chất</h5><div class="table-responsive"><table class="table"><thead><tr><th>Mã / Tên phòng</th><th>Tòa nhà</th><th>Loại</th><th>Sức chứa</th><th>Trạng thái</th><th>Người phụ trách</th><th>Cập nhật</th></tr></thead><tbody>${(d.rooms || []).map((r) => `<tr><td><b>${esc(r.code)}</b><div class="small muted">${esc(r.name)}</div></td><td>${esc(r.building)}</td><td>${esc(r.room_type)}</td><td>${r.capacity}</td><td>${esc(r.status)}</td><td><select class="form-select form-select-sm" id="room-manager-${r.id}"><option value="0">Chưa phân công</option>${(d.managers || []).map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join("")}</select><button class="btn btn-sm btn-outline-primary mt-1" onclick="assignRoomManager(${r.id})">Gán quản lý</button></td><td><select class="form-select form-select-sm" id="room-status-${r.id}"><option value="ACTIVE" ${r.status === "ACTIVE" ? "selected" : ""}>Hoạt động</option><option value="INACTIVE" ${r.status === "INACTIVE" ? "selected" : ""}>Ngừng hoạt động</option><option value="MAINTENANCE" ${r.status === "MAINTENANCE" ? "selected" : ""}>Bảo trì</option></select><button class="btn btn-sm btn-primary mt-1" onclick="saveRoomStatus(${r.id})">Lưu trạng thái</button></td></tr>`).join("")}</tbody></table></div></div>`;
  }
  if (tab === "rules") {
    el.innerHTML = `<div class="panel"><h5>Rules Engine – Quy định hệ thống</h5>${(d.rules || []).map((r) => `<form class="row g-2 align-items-end border-bottom py-3" onsubmit="saveRule(event,${r.id})"><div class="col-md-4"><label class="form-label">${{ MAX_DURATION_HOURS: "Thời lượng đặt tối đa (giờ)", MAX_ADVANCE_DAYS: "Thời gian được đặt trước tối đa (ngày)", MAX_ACTIVE_BOOKINGS: "Số booking hoạt động tối đa / User", CANCELLATION_MIN_HOURS: "Hạn hủy trước giờ bắt đầu (giờ)", REQUIRE_APPROVAL: "Yêu cầu Manager/Admin duyệt booking" }[r.code] || esc(r.code)} <small class="text-secondary">(${esc(r.code)})</small></label><input class="form-control" name="value" value="${esc(r.value)}"></div><div class="col-md-3"><label class="form-label">Kích hoạt</label><select class="form-select" name="enabled"><option value="true" ${r.enabled ? "selected" : ""}>Bật</option><option value="false" ${!r.enabled ? "selected" : ""}>Tắt</option></select></div><div class="col-md-2"><button class="btn btn-primary">Lưu</button></div></form>`).join("") || '<p class="muted">Chưa có quy định.</p>'}</div>`;
  }
  if (tab === "notifications") {
    el.innerHTML = `<div class="row g-3"><div class="col-lg-5"><form class="panel" id="admin-notify-form"><h5>Phát thông báo</h5><label class="form-label">Tiêu đề</label><input class="form-control mb-2" name="title" required><label class="form-label">Nội dung</label><textarea class="form-control mb-2" name="body" rows="4" required></textarea><label class="form-label">Đối tượng</label><select class="form-select mb-3" name="audience"><option value="ALL">Tất cả người dùng</option><option value="USER">USER</option><option value="ROOM_MANAGER">ROOM_MANAGER</option><option value="ADMIN">ADMIN</option></select><button class="btn btn-primary">Gửi thông báo</button></form></div><div class="col-lg-7"><div class="panel"><h5>Thông báo gần đây</h5>${(d.notifications || []).map((n) => `<div class="border-bottom py-2"><b>${esc(n.title)}</b><p class="mb-1">${esc(n.body)}</p><small class="muted">${new Date(n.created_at).toLocaleString("vi-VN")}</small></div>`).join("") || '<p class="muted">Chưa có thông báo.</p>'}</div></div></div>`;
    document.getElementById("admin-notify-form").onsubmit = async (e) => {
      e.preventDefault();
      try {
        const x = await api("/admin/notifications", {
          method: "POST",
          body: Object.fromEntries(new FormData(e.target)),
        });
        alertMsg(
          x.recipients !== undefined
            ? `Đã gửi tới ${x.recipients} tài khoản`
            : "Đã gửi thông báo",
        );
        adminPage();
      } catch (x) {
        alertMsg(x.message, "danger");
      }
    };
  }
  if (tab === "reports") {
    el.innerHTML = `<div class="row g-3 mb-3">${[
      ["Tổng booking", d.reports.total_bookings],
      ["Người dùng", d.reports.users],
      ["Phòng", d.reports.rooms],
    ]
      .map(
        (x) =>
          `<div class="col-md-4"><div class="stat"><span class="muted">${x[0]}</span><strong>${x[1]}</strong></div></div>`,
      )
      .join(
        "",
      )}</div><div class="panel"><h5>Lượt đặt theo phòng</h5>${(d.reports.by_room || []).map((r) => `<div class="d-flex align-items-center gap-3 border-bottom py-2"><span style="width:100px">${esc(r.room)}</span><div class="progress flex-grow-1" style="height:9px"><div class="progress-bar" style="width:${Math.min(100, (r.bookings / Math.max(1, d.reports.total_bookings)) * 100)}%"></div></div><b>${r.bookings}</b></div>`).join("")}</div>`;
  }
  if (tab === "logs") {
    el.innerHTML = `<div class="panel"><h5>Nhật ký thao tác duyệt booking</h5><div class="table-responsive"><table class="table"><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Ghi chú</th></tr></thead><tbody>${(d.logs || []).map((l) => `<tr><td>${new Date(l.time).toLocaleString("vi-VN")}</td><td>${esc(l.actor)}</td><td>${esc(l.action)}</td><td>${esc(l.target)}</td><td>${esc(l.note || "")}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">Chưa có nhật ký.</td></tr>'}</tbody></table></div><p class="small muted">Nguồn dữ liệu: lịch sử quyết định BookingApproval. Các thao tác khác chưa có bảng audit riêng trong mô hình gốc.</p></div>`;
  }
}
function filterAdminUsers() {
  const q = (
    document.getElementById("admin-user-search")?.value || ""
  ).toLowerCase();
  document
    .querySelectorAll("#admin-user-rows tr")
    .forEach((r) => (r.hidden = !r.dataset.search.includes(q)));
}
function filterAdminBookings() {
  const f = document.getElementById("booking-filter").value;
  const rows = (window.adminData?.bookings || []).filter(
    (b) => !f || b.status === f,
  );
  document.getElementById("admin-booking-list").innerHTML = bookingTable(rows);
}
async function saveAdminUser(id, isActive) {
  try {
    await api(`/admin/users/${id}`, {
      method: "PATCH",
      body: { role: document.getElementById(`role-${id}`).value },
    });
    alertMsg("Đã cập nhật vai trò");
    adminPage();
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function toggleAdminUser(id, active) {
  try {
    await api(`/admin/users/${id}`, {
      method: "PATCH",
      body: { is_active: active },
    });
    alertMsg("Đã cập nhật trạng thái tài khoản");
    adminPage();
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function saveRoomStatus(id) {
  try {
    await api(`/admin/rooms/${id}`, {
      method: "PATCH",
      body: { status: document.getElementById(`room-status-${id}`).value },
    });
    alertMsg("Đã cập nhật trạng thái phòng");
    adminPage();
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function assignRoomManager(id) {
  try {
    await api(`/admin/rooms/${id}/manager`, {
      method: "PUT",
      body: {
        manager_id: +document.getElementById(`room-manager-${id}`).value,
      },
    });
    alertMsg("Đã phân công Room Manager cho phòng");
    adminPage();
  } catch (e) {
    alertMsg(e.message, "danger");
  }
}
async function saveRule(e, id) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    await api(`/admin/rules/${id}`, {
      method: "PATCH",
      body: { value: f.get("value"), enabled: f.get("enabled") === "true" },
    });
    alertMsg("Đã lưu quy định");
    adminPage();
  } catch (x) {
    alertMsg(x.message, "danger");
  }
}
function aiPage() {
  app.innerHTML = `<div class="row justify-content-center"><div class="col-lg-8"><div class="panel"><h2 class="section-title">UniRoom AI Assistant</h2><p class="muted">Trợ lý hỗ trợ tìm phòng và giải thích quy trình. Khi chưa cấu hình AI ngoài, hệ thống dùng chế độ dự phòng nội bộ.</p><div id="chat" class="mb-3"></div><form id="chat-form" class="d-flex gap-2"><input class="form-control" name="message" placeholder="Ví dụ: Tôi cần phòng Lab..." required><button class="btn btn-primary">Gửi</button></form></div></div></div>`;
  document.getElementById("chat-form").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const d = await api("/ai/chat", {
        method: "POST",
        body: { message: f.get("message") },
      });
      document.getElementById("chat").innerHTML +=
        `<div class="alert alert-light"><b>Bạn:</b> ${esc(f.get("message"))}<br><b>UniRoom:</b> ${esc(d.answer)}</div>`;
      e.target.reset();
    } catch (x) {
      alertMsg(x.message, "danger");
    }
  };
}
async function logout() {
  try {
    await api("/auth/logout", { method: "POST" });
  } catch (e) {}
  token = "";
  me = null;
  localStorage.removeItem("uniroom_token");
  localStorage.removeItem("uniroom_user");
  syncNav();
  showPage("home");
  alertMsg("Bạn đã đăng xuất");
}
// Kiểm tra phiên đăng nhập cũ trước khi gọi các API cần xác thực.
// Token không hợp lệ/hết hạn sẽ được xóa để tránh request 401 lặp lại lúc mở trang.
async function initializeApp() {
  if (token && me) {
    try {
      const response = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 401 || response.status === 403) {
        token = "";
        me = null;
        localStorage.removeItem("uniroom_token");
        localStorage.removeItem("uniroom_user");
      }
    } catch (error) {
      // Không xóa phiên khi máy chủ tạm thời mất kết nối.
      console.warn("Không thể kiểm tra phiên đăng nhập:", error);
    }
  } else if (token || me) {
    token = "";
    me = null;
    localStorage.removeItem("uniroom_token");
    localStorage.removeItem("uniroom_user");
  }
  syncNav();
  if (token && me) {
    showPage(me.role === "ADMIN" ? "adminDashboard" : me.role === "ROOM_MANAGER" ? "rooms" : "dashboard");
  } else {
    showPage("home");
  }
}
initializeApp();
