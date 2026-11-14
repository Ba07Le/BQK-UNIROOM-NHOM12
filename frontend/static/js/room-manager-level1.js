(() => {
  "use strict";

  const token = localStorage.getItem("uniroom_token") || "";
  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("uniroom_user") || "null");
  } catch {
    user = null;
  }
  const content = document.getElementById("rm-content");
  const alertBox = document.getElementById("rm-alert");
  let activeTab = "overview";
  let calendar = null;

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
    );
  }

  function showMessage(message, isError = false) {
    alertBox.textContent = message;
    alertBox.classList.toggle("error", isError);
    if (!isError) {
      window.setTimeout(() => {
        if (alertBox.textContent === message) alertBox.textContent = "";
      }, 4500);
    }
  }

  async function api(path, options = {}) {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    };
    let body = options.body;
    if (body && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetch(`/api${path}`, {
        ...options,
        headers,
        body,
      });
    } catch {
      throw new Error("Không kết nối được máy chủ UniRoom.");
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = payload.detail || payload.message || "Yêu cầu thất bại.";
      throw new Error(
        Array.isArray(detail)
          ? detail.map((item) => item.msg || "Dữ liệu không hợp lệ").join(" · ")
          : detail,
      );
    }
    return payload.data ?? payload;
  }

  function setTab(tab) {
    activeTab = tab;
    document.querySelectorAll(".rm-tabs button").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === tab);
    });
    renderTab().catch((error) => showMessage(error.message, true));
  }

  function statusBadge(status) {
    const labels = {
      PENDING: ["Chờ duyệt", "text-bg-warning"],
      APPROVED: ["Đã duyệt", "text-bg-success"],
      REJECTED: ["Từ chối", "text-bg-danger"],
      CANCELLED: ["Đã hủy", "text-bg-secondary"],
      CHECKED_IN: ["Đang sử dụng", "text-bg-primary"],
      COMPLETED: ["Hoàn tất", "text-bg-secondary"],
      ACTIVE: ["Đang hoạt động", "text-bg-success"],
      INACTIVE: ["Đã khóa", "text-bg-secondary"],
      MAINTENANCE: ["Bảo trì", "text-bg-warning"],
    };
    const [label, style] = labels[status] || [status, "text-bg-secondary"];
    return `<span class="badge ${style}">${escapeHtml(label)}</span>`;
  }

  function localDateTimeValue(date) {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 19);
  }

  function table(headers, rows, emptyText) {
    if (!rows.length) return `<div class="rm-empty">${escapeHtml(emptyText)}</div>`;
    return `<div class="table-responsive"><table class="table rm-table align-middle mb-0"><thead><tr>${headers
      .map((header) => `<th>${header}</th>`)
      .join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }

  async function renderTab() {
    if (calendar) {
      calendar.destroy();
      calendar = null;
    }
    content.innerHTML = '<div class="rm-panel">Đang tải dữ liệu...</div>';
    if (activeTab === "overview") return renderOverview();
    if (activeTab === "approvals") return renderApprovals();
    if (activeTab === "rooms") return renderRooms();
    if (activeTab === "catalog") return renderCatalog();
    if (activeTab === "equipment") return renderEquipment();
    if (activeTab === "calendar") return renderCalendar();
    if (activeTab === "maintenance") return renderMaintenance();
    if (activeTab === "reports") return renderReports();
  }

  async function renderOverview() {
    const [summary, pending, report] = await Promise.all([
      api("/manager/summary"),
      api("/manager/bookings"),
      api("/manager/usage-report"),
    ]);
    content.innerHTML = `
      <div class="row g-3 mb-3">
        ${[
          ["Phòng phụ trách", summary.rooms],
          ["Booking chờ duyệt", summary.pending],
          ["Booking đã duyệt", summary.approved],
          ["Phòng đang bảo trì", summary.maintenance],
        ]
          .map(
            ([label, value]) =>
              `<div class="col-6 col-xl-3"><div class="rm-stat"><span>${label}</span><strong>${value}</strong></div></div>`,
          )
          .join("")}
      </div>
      <div class="row g-3">
        <div class="col-lg-7"><section class="rm-panel"><h5>Yêu cầu cần xử lý</h5>
          ${table(
            ["Người đặt", "Phòng", "Yêu cầu", "Thời gian"],
            pending.slice(0, 6).map(
              (booking) =>
                `<tr><td>${escapeHtml(booking.user)}</td><td>${escapeHtml(booking.room_code)}</td><td>${escapeHtml(booking.title)}</td><td>${new Date(booking.start_at).toLocaleString("vi-VN")}</td></tr>`,
            ),
            "Không có booking chờ duyệt.",
          )}
        </section></div>
        <div class="col-lg-5"><section class="rm-panel"><h5>Sử dụng trong 30 ngày</h5>
          <div class="display-5 fw-bold">${report.usage_hours} giờ</div>
          <p class="rm-muted">${report.total_bookings} booking trong kỳ báo cáo</p>
          <button class="btn btn-outline-primary btn-sm mt-2" data-go="reports">Mở báo cáo</button>
        </section></div>
      </div>`;
    content.querySelector("[data-go]").addEventListener("click", () => setTab("reports"));
  }

  async function renderApprovals() {
    const rows = await api("/manager/bookings");
    content.innerHTML = `<section class="rm-panel"><div class="d-flex justify-content-between align-items-center mb-3"><div><h5 class="mb-1">Booking chờ duyệt</h5><p class="rm-muted">Khi từ chối, cần nhập lý do để gửi thông báo cho người đặt.</p></div><span class="badge text-bg-primary">${rows.length}</span></div>
      ${table(
        ["Người đặt", "Phòng", "Thông tin booking", "Thời gian", "Thao tác"],
        rows.map(
          (booking) =>
            `<tr><td>${escapeHtml(booking.user)}</td><td><strong>${escapeHtml(booking.room_code)}</strong></td><td>${escapeHtml(booking.title)}<div class="small text-secondary">${escapeHtml(booking.purpose || "")} · ${booking.attendee_count} người</div></td><td>${new Date(booking.start_at).toLocaleString("vi-VN")}<br>${new Date(booking.end_at).toLocaleString("vi-VN")}</td><td class="text-nowrap"><button class="btn btn-sm btn-success me-1" data-approve="${booking.id}">Duyệt</button><button class="btn btn-sm btn-outline-danger" data-reject="${booking.id}">Từ chối</button></td></tr>`,
        ),
        "Không có booking chờ duyệt.",
      )}
    </section>`;
    content.querySelectorAll("[data-approve]").forEach((button) =>
      button.addEventListener("click", () => decide(button.dataset.approve, "APPROVED")),
    );
    content.querySelectorAll("[data-reject]").forEach((button) =>
      button.addEventListener("click", () => decide(button.dataset.reject, "REJECTED")),
    );
  }

  async function decide(id, decision) {
    let note = "";
    if (decision === "REJECTED") {
      note = window.prompt("Nhập lý do từ chối:");
      if (note === null) return;
      note = note.trim();
      if (!note) return showMessage("Lý do từ chối không được để trống.", true);
    }
    try {
      await api(`/manager/bookings/${id}/decision`, {
        method: "POST",
        body: { decision, note },
      });
      showMessage(decision === "APPROVED" ? "Đã duyệt booking." : "Đã từ chối và gửi lý do.");
      await renderApprovals();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function renderRooms() {
    const [rooms, buildings, types] = await Promise.all([
      api("/manager/rooms"),
      api("/manager/buildings"),
      api("/manager/room-types"),
    ]);
    content.innerHTML = `
      <div class="row g-3">
        <div class="col-xl-4"><section class="rm-panel"><h5>Thêm phòng</h5>
          <form id="rm-create-room" class="rm-form-grid">
            <label>Mã phòng<input class="form-control" name="code" maxlength="30" required></label>
            <label>Tên phòng<input class="form-control" name="name" maxlength="120" required></label>
            <label>Tòa nhà<select class="form-select" name="building_id" required>${buildings.map((item) => `<option value="${item.id}">${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`).join("")}</select></label>
            <label>Loại phòng<select class="form-select" name="room_type_id" required>${types.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}</select></label>
            <label>Sức chứa<input class="form-control" name="capacity" type="number" min="1" value="30" required></label>
            <label>Tầng<input class="form-control" name="floor" type="number" min="0" value="1" required></label>
            <label class="wide">Mô tả<textarea class="form-control" name="description" rows="2"></textarea></label>
            <button class="btn btn-primary wide">Tạo phòng</button>
          </form>
        </section></div>
        <div class="col-xl-8"><section class="rm-panel"><h5>Phòng được phân công</h5>
          ${table(
            ["Phòng", "Vị trí", "Sức chứa", "Trạng thái", "Cập nhật"],
            rooms.map(
              (room) =>
                `<tr><td><strong>${escapeHtml(room.code)}</strong><div class="small text-secondary">${escapeHtml(room.name)}</div></td><td>${escapeHtml(room.building)} · tầng ${room.floor}</td><td><input class="form-control form-control-sm rm-capacity" type="number" min="1" value="${room.capacity}" data-id="${room.id}" style="width:90px"></td><td>${statusBadge(room.status)}</td><td><select class="form-select form-select-sm rm-status" data-id="${room.id}" style="width:135px"><option value="ACTIVE" ${room.status === "ACTIVE" ? "selected" : ""}>Hoạt động</option><option value="INACTIVE" ${room.status === "INACTIVE" ? "selected" : ""}>Khóa</option>${room.status === "MAINTENANCE" ? '<option value="MAINTENANCE" selected>Bảo trì</option>' : ""}</select><button class="btn btn-sm btn-outline-primary mt-1" data-save-room="${room.id}">Lưu</button></td></tr>`,
            ),
            "Chưa có phòng được phân công.",
          )}
          <p class="small text-secondary mt-3 mb-0">Không thể khóa phòng đang có booking hoạt động. Phòng bảo trì được quản lý trong mục Bảo trì / khóa.</p>
        </section></div>
      </div>`;
    document.getElementById("rm-create-room").addEventListener("submit", createRoom);
    content.querySelectorAll("[data-save-room]").forEach((button) =>
      button.addEventListener("click", () => updateRoom(button.dataset.saveRoom)),
    );
  }

  async function createRoom(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    ["building_id", "room_type_id", "capacity", "floor"].forEach(
      (key) => (values[key] = Number(values[key])),
    );
    try {
      await api("/manager/rooms", { method: "POST", body: values });
      showMessage("Đã tạo phòng.");
      await renderRooms();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function updateRoom(id) {
    const capacity = Number(content.querySelector(`.rm-capacity[data-id="${id}"]`).value);
    const status = content.querySelector(`.rm-status[data-id="${id}"]`).value;
    try {
      const body = { capacity };
      if (status !== "MAINTENANCE") body.status = status;
      await api(`/manager/rooms/${id}`, {
        method: "PATCH",
        body,
      });
      showMessage("Đã cập nhật phòng.");
      await renderRooms();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function renderCatalog() {
    const [buildings, types] = await Promise.all([
      api("/manager/buildings"),
      api("/manager/room-types"),
    ]);
    content.innerHTML = `
      <div class="row g-3">
        <div class="col-lg-6"><section class="rm-panel"><h5>Tòa nhà</h5>
          <form id="rm-building-form" class="rm-form-grid mb-3">
            <label>Mã tòa nhà<input class="form-control" name="code" maxlength="30" required></label>
            <label>Tên tòa nhà<input class="form-control" name="name" maxlength="120" required></label>
            <label class="wide">Địa chỉ<input class="form-control" name="address" maxlength="255"></label>
            <button class="btn btn-primary wide">Thêm tòa nhà</button>
          </form>
          ${table(
            ["Mã", "Tên", "Địa chỉ", "Số phòng", ""],
            buildings.map(
              (item) =>
                `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.address)}</td><td>${item.room_count}</td><td><button class="btn btn-sm btn-outline-primary me-1" data-edit-building="${item.id}">Sửa</button><button class="btn btn-sm btn-outline-danger" data-delete-building="${item.id}">Xóa</button></td></tr>`,
            ),
            "Chưa có tòa nhà.",
          )}
        </section></div>
        <div class="col-lg-6"><section class="rm-panel"><h5>Loại phòng</h5>
          <form id="rm-type-form" class="rm-form-grid mb-3">
            <label>Tên loại phòng<input class="form-control" name="name" maxlength="80" required></label>
            <label>Mô tả<input class="form-control" name="description" maxlength="255"></label>
            <button class="btn btn-primary wide">Thêm loại phòng</button>
          </form>
          ${table(
            ["Tên loại", "Mô tả", "Số phòng", ""],
            types.map(
              (item) =>
                `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.description)}</td><td>${item.room_count}</td><td><button class="btn btn-sm btn-outline-primary me-1" data-edit-type="${item.id}">Sửa</button><button class="btn btn-sm btn-outline-danger" data-delete-type="${item.id}">Xóa</button></td></tr>`,
            ),
            "Chưa có loại phòng.",
          )}
        </section></div>
      </div>`;
    document.getElementById("rm-building-form").addEventListener("submit", (event) =>
      createCatalogItem(event, "buildings"),
    );
    document.getElementById("rm-type-form").addEventListener("submit", (event) =>
      createCatalogItem(event, "room-types"),
    );
    content.querySelectorAll("[data-edit-building]").forEach((button) =>
      button.addEventListener("click", () => editCatalogItem("buildings", button.dataset.editBuilding, buildings)),
    );
    content.querySelectorAll("[data-edit-type]").forEach((button) =>
      button.addEventListener("click", () => editCatalogItem("room-types", button.dataset.editType, types)),
    );
    content.querySelectorAll("[data-delete-building]").forEach((button) =>
      button.addEventListener("click", () => deleteCatalogItem("buildings", button.dataset.deleteBuilding)),
    );
    content.querySelectorAll("[data-delete-type]").forEach((button) =>
      button.addEventListener("click", () => deleteCatalogItem("room-types", button.dataset.deleteType)),
    );
  }

  async function createCatalogItem(event, endpoint) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api(`/manager/${endpoint}`, { method: "POST", body: values });
      showMessage("Đã thêm dữ liệu danh mục.");
      await renderCatalog();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function editCatalogItem(endpoint, id, items) {
    const item = items.find((entry) => String(entry.id) === String(id));
    if (!item) return;
    const name = window.prompt("Tên:", item.name);
    if (name === null) return;
    const body = { name };
    if (endpoint === "buildings") {
      const address = window.prompt("Địa chỉ:", item.address);
      if (address === null) return;
      body.address = address;
    } else {
      const description = window.prompt("Mô tả:", item.description);
      if (description === null) return;
      body.description = description;
    }
    try {
      await api(`/manager/${endpoint}/${id}`, { method: "PATCH", body });
      showMessage("Đã cập nhật danh mục.");
      await renderCatalog();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function deleteCatalogItem(endpoint, id) {
    if (!window.confirm("Xóa mục này? Thao tác sẽ bị từ chối nếu đang có phòng sử dụng.")) return;
    try {
      await api(`/manager/${endpoint}/${id}`, { method: "DELETE" });
      showMessage("Đã xóa mục danh mục.");
      await renderCatalog();
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function renderEquipment() {
    const [rooms, equipment] = await Promise.all([
      api("/manager/rooms"),
      api("/manager/equipment"),
    ]);
    content.innerHTML = `<div class="row g-3">
      <div class="col-lg-4"><section class="rm-panel"><h5>Gán thiết bị cho phòng</h5>
        <form id="rm-equipment-form" class="rm-form-grid">
          <label class="wide">Phòng<select class="form-select" name="room_id" required>${rooms.map((room) => `<option value="${room.id}">${escapeHtml(room.code)} · ${escapeHtml(room.name)}</option>`).join("")}</select></label>
          <label class="wide">Tên thiết bị<input class="form-control" name="name" maxlength="100" required></label>
          <label>Số lượng<input class="form-control" type="number" name="quantity" min="1" value="1" required></label>
          <button class="btn btn-primary wide">Lưu thiết bị</button>
        </form>
      </section></div>
      <div class="col-lg-8"><section class="rm-panel"><h5>Thiết bị theo phòng</h5>
        ${table(
          ["Phòng", "Thiết bị", "Số lượng", ""],
          equipment.map(
            (item) =>
              `<tr><td>${escapeHtml(item.room)}</td><td>${escapeHtml(item.equipment)}</td><td>${item.quantity}</td><td><button class="btn btn-sm btn-outline-danger" data-remove-equipment="${item.id}">Gỡ</button></td></tr>`,
          ),
          "Chưa ghi nhận thiết bị.",
        )}
      </section></div>
    </div>`;
    document.getElementById("rm-equipment-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      values.room_id = Number(values.room_id);
      values.quantity = Number(values.quantity);
      try {
        await api("/manager/equipment", { method: "POST", body: values });
        showMessage("Đã cập nhật thiết bị.");
        await renderEquipment();
      } catch (error) {
        showMessage(error.message, true);
      }
    });
    content.querySelectorAll("[data-remove-equipment]").forEach((button) =>
      button.addEventListener("click", async () => {
        if (!window.confirm("Gỡ thiết bị này khỏi phòng?")) return;
        try {
          await api(`/manager/equipment/${button.dataset.removeEquipment}`, { method: "DELETE" });
          showMessage("Đã gỡ thiết bị.");
          await renderEquipment();
        } catch (error) {
          showMessage(error.message, true);
        }
      }),
    );
  }

  async function renderCalendar() {
    content.innerHTML = '<section class="rm-panel"><div id="rm-calendar" class="rm-calendar"></div></section>';
    const calendarHost = document.getElementById("rm-calendar");
    calendar = new FullCalendar.Calendar(calendarHost, {
      initialView: "dayGridMonth",
      locale: "vi",
      height: "auto",
      headerToolbar: {
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      },
      events: async (info, success, failure) => {
        try {
          const query = new URLSearchParams({
            start_at: localDateTimeValue(info.start),
            end_at: localDateTimeValue(info.end),
          });
          const rows = await api(`/manager/calendar?${query}`);
          success(
            rows.map((item) => ({
              ...item,
              color:
                item.type === "MAINTENANCE"
                  ? "#b45309"
                  : item.status === "PENDING"
                    ? "#64748b"
                    : item.status === "REJECTED"
                      ? "#b91c1c"
                      : "#1d5fd0",
            })),
          );
        } catch (error) {
          failure(error);
          showMessage(error.message, true);
        }
      },
    });
    calendar.render();
  }

  async function renderMaintenance() {
    const [rooms, entries] = await Promise.all([
      api("/manager/rooms"),
      api("/manager/maintenance"),
    ]);
    content.innerHTML = `<div class="row g-3">
      <div class="col-lg-5"><section class="rm-panel"><h5>Lên lịch bảo trì / khóa phòng</h5>
        <form id="rm-maintenance-form" class="rm-form-grid">
          <label class="wide">Phòng<select class="form-select" name="room_id" required>${rooms.map((room) => `<option value="${room.id}">${escapeHtml(room.code)} · ${escapeHtml(room.name)}</option>`).join("")}</select></label>
          <label>Bắt đầu<input class="form-control" type="datetime-local" name="start_at" required></label>
          <label>Kết thúc<input class="form-control" type="datetime-local" name="end_at" required></label>
          <label class="wide">Lý do<textarea class="form-control" name="reason" maxlength="255" required></textarea></label>
          <button class="btn btn-primary wide">Tạo lịch bảo trì</button>
        </form>
      </section></div>
      <div class="col-lg-7"><section class="rm-panel"><h5>Lịch bảo trì</h5>
        ${table(
          ["Phòng", "Thời gian", "Lý do", "Trạng thái", ""],
          entries.map(
            (item) =>
              `<tr><td>${escapeHtml(item.room)}</td><td>${new Date(item.start_at).toLocaleString("vi-VN")}<br>${new Date(item.end_at).toLocaleString("vi-VN")}</td><td>${escapeHtml(item.reason)}</td><td>${statusBadge(item.status)}</td><td>${item.status === "ACTIVE" ? `<button class="btn btn-sm btn-outline-success" data-finish-maintenance="${item.id}">Hoàn tất</button>` : ""}</td></tr>`,
          ),
          "Chưa có lịch bảo trì.",
        )}
      </section></div>
    </div>`;
    document.getElementById("rm-maintenance-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(event.currentTarget));
      values.room_id = Number(values.room_id);
      try {
        await api("/manager/maintenance", { method: "POST", body: values });
        showMessage("Đã tạo lịch bảo trì và gửi thông báo.");
        await renderMaintenance();
      } catch (error) {
        showMessage(error.message, true);
      }
    });
    content.querySelectorAll("[data-finish-maintenance]").forEach((button) =>
      button.addEventListener("click", async () => {
        try {
          await api(`/manager/maintenance/${button.dataset.finishMaintenance}`, { method: "PATCH" });
          showMessage("Đã hoàn tất bảo trì.");
          await renderMaintenance();
        } catch (error) {
          showMessage(error.message, true);
        }
      }),
    );
  }

  async function renderReports() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 30);
    content.innerHTML = `<section class="rm-panel mb-3"><form id="rm-report-form" class="row g-2 align-items-end">
      <div class="col-md-4"><label class="form-label">Từ ngày</label><input class="form-control" type="date" name="start_at" value="${start.toISOString().slice(0, 10)}" required></div>
      <div class="col-md-4"><label class="form-label">Đến ngày</label><input class="form-control" type="date" name="end_at" value="${end.toISOString().slice(0, 10)}" required></div>
      <div class="col-md-4"><button class="btn btn-primary">Xem báo cáo</button></div>
    </form></section><div id="rm-report-result"></div>`;
    document.getElementById("rm-report-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await loadReport(new FormData(event.currentTarget));
      } catch (error) {
        showMessage(error.message, true);
      }
    });
    try {
      await loadReport(new FormData(document.getElementById("rm-report-form")));
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function loadReport(formData) {
    const startDate = formData.get("start_at");
    const endDate = formData.get("end_at");
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T23:59:59`);
    if (start >= end) throw new Error("Ngày kết thúc phải sau ngày bắt đầu.");
    const query = new URLSearchParams({
      start_at: `${startDate}T00:00:00`,
      end_at: `${endDate}T23:59:59`,
    });
    const report = await api(`/manager/usage-report?${query}`);
    const host = document.getElementById("rm-report-result");
    if (!host) return;
    host.innerHTML = `<div class="row g-3 mb-3">
      <div class="col-md-6"><div class="rm-stat"><span>Tổng booking trong kỳ</span><strong>${report.total_bookings}</strong></div></div>
      <div class="col-md-6"><div class="rm-stat"><span>Thời lượng đã duyệt / sử dụng</span><strong>${report.usage_hours} giờ</strong></div></div>
      <div class="col-12"><section class="rm-panel"><h5>Thống kê theo phòng</h5>
        ${table(
          ["Phòng", "Tòa nhà", "Booking", "Giờ sử dụng"],
          report.by_room.map(
            (item) =>
              `<tr><td><strong>${escapeHtml(item.room_code)}</strong> · ${escapeHtml(item.room_name)}</td><td>${escapeHtml(item.building)}</td><td>${item.booking_count}</td><td>${item.usage_hours}</td></tr>`,
          ),
          "Không có dữ liệu phòng trong kỳ.",
        )}
      </section></div>
      <div class="col-12"><section class="rm-panel"><h5>Booking theo trạng thái</h5>
        ${table(
          ["Trạng thái", "Số lượng"],
          Object.entries(report.by_status).map(
            ([status, count]) => `<tr><td>${statusBadge(status)}</td><td>${count}</td></tr>`,
          ),
          "Không có booking trong kỳ.",
        )}
      </section></div>
    </div>`;
  }

  document.querySelectorAll(".rm-tabs button").forEach((button) =>
    button.addEventListener("click", () => setTab(button.dataset.tab)),
  );
  document.getElementById("rm-refresh").addEventListener("click", () => setTab(activeTab));
  document.getElementById("rm-logout").addEventListener("click", () => {
    localStorage.removeItem("uniroom_token");
    localStorage.removeItem("uniroom_user");
    window.location.href = "/";
  });

  if (!token || !user) {
    showMessage("Hãy đăng nhập tài khoản Room Manager tại trang UniRoom trước.", true);
    document.getElementById("rm-identity").textContent = "Chưa đăng nhập";
  } else if (!["ROOM_MANAGER", "ADMIN"].includes(user.role)) {
    showMessage("Tài khoản này không có quyền Room Manager.", true);
    document.getElementById("rm-identity").textContent = user.full_name || "";
  } else {
    document.getElementById("rm-identity").textContent =
      `${user.full_name || "Tài khoản"} · ${user.role === "ADMIN" ? "Admin" : "Room Manager"}`;
    setTab("overview");
  }
})();
