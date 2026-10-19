/**
 * dashboard.js — ตรรกะเฉพาะหน้า dashboard.html
 */
(async function () {
  const user = await requireAuth();
  if (!user) return;

  try {
    await DataStore.init();
  } catch (err) {
    Toast.show(err.message || "โหลดข้อมูลอาการแพ้ไม่สำเร็จ", "danger", 5000);
  }

  const [profile, favorites] = await Promise.all([DB.getProfile(user.id), DB.getFavorites(user.id)]);
  const allergens = DataStore.getAllergens();

  renderAppShell({ activePage: "dashboard", user, profile });

  document.getElementById("avatar").textContent = (profile?.name || user.email || "?").trim().charAt(0).toUpperCase();
  document.getElementById("greeting").textContent = `สวัสดี ${profile?.name || user.email}`;

  const conditionSummaryEl = document.getElementById("condition-summary");
  const conditions = profile?.health_conditions || [];
  conditionSummaryEl.innerHTML = conditions.length
    ? conditions
        .map((id) => {
          const a = allergens.find((x) => x.id === id);
          return a ? `<span class="tag tag-fave">${escapeHtml(a.icon)} ${escapeHtml(a.label)}</span>` : "";
        })
        .join("")
    : `<span class="tag">ยังไม่ได้ระบุอาการแพ้</span>`;

  document.getElementById("stat-favorites").textContent = favorites.length;
  document.getElementById("stat-rated").textContent = favorites.filter((f) => f.rating).length;
  document.getElementById("stat-conditions").textContent = conditions.length;

  // แสดงลิงก์ไปแผงควบคุมแอดมิน เฉพาะบัญชีที่ profiles.role = 'admin' เท่านั้น
  // (ลิงก์นี้ปรากฏใน sidebar อยู่แล้วผ่าน renderAppShell — การ์ดนี้เป็นทางลัดเพิ่มเติมในหน้าแรก)
  if (profile?.role === "admin") {
    const adminLink = document.createElement("a");
    adminLink.href = "admin.html";
    adminLink.className = "quick-link";
    adminLink.innerHTML = `
      <span class="glyph">🛠️</span>
      <strong>แผงควบคุมแอดมิน</strong>
      <span class="muted">จัดการเมนู วัตถุดิบ อาการแพ้ และสิทธิ์ผู้ใช้งาน</span>
    `;
    document.querySelector(".quick-links").appendChild(adminLink);
  }
})();
