/**
 * profile.js — ตรรกะเฉพาะหน้า profile.html (แดชบอร์ด + โปรไฟล์รวมกัน)
 */

/** แสดงรูปโปรไฟล์ (หรือตัวอักษรย่อถ้ายังไม่มีรูป) ในทุกจุดที่มีคลาส .avatar บนหน้า */
function paintAvatars(avatarUrl, fallbackLetter) {
  document.querySelectorAll(".avatar").forEach((el) => {
    if (avatarUrl) {
      el.style.background = "transparent";
      el.style.overflow = "hidden";
      el.style.padding = "0";
      el.innerHTML = `<img src="${escapeHtml(avatarUrl)}" style="width:100%; height:100%; aspect-ratio:1/1; object-fit:cover; border-radius:50%; display:block;" alt="" />`;
    } else {
      el.style.background = "";
      el.style.overflow = "";
      el.style.padding = "";
      el.textContent = fallbackLetter;
    }
  });
}

(async function () {
  const user = await requireAuth();
  if (!user) return;

  let profile = await DB.getProfile(user.id);
  renderAppShell({ activePage: "profile", user, profile });

  try {
    await DataStore.init();
  } catch (err) {
    Toast.show(err.message || "โหลดตัวเลือกอาการแพ้ไม่สำเร็จ", "danger", 5000);
  }

  const conditionPicker = createConditionPicker(document.getElementById("condition-grid"));

  // ---------- ส่วนหัว: ชื่อ + รูปโปรไฟล์ ----------
  const displayName = profile?.name || user.email.split("@")[0];
  const fallbackLetter = displayName.trim().charAt(0).toUpperCase();
  document.getElementById("dash-name").textContent = displayName;
  paintAvatars(profile?.avatar_url || null, fallbackLetter);

  // ---------- เซ็ตข้อมูลลงฟอร์มแก้ไขโปรไฟล์ ----------
  document.getElementById("name").value = profile?.name || "";
  document.getElementById("age").value = profile?.age ?? "";
  document.getElementById("weight").value = profile?.weight_kg ?? "";
  document.getElementById("height").value = profile?.height_cm ?? "";
  conditionPicker.setSelected(profile?.health_conditions || []);

  // ---------- สถิติ: อาการแพ้ ----------
  const allergens = DataStore.getAllergens();
  const statAllergiesList = document.getElementById("stat-allergies-list");
  const userConditions = profile?.health_conditions || [];
  if (userConditions.length > 0) {
    statAllergiesList.innerHTML = userConditions
      .map((id) => {
        const found = allergens.find((a) => a.id === id);
        return found ? `${escapeHtml(found.icon)} ${escapeHtml(found.label)}` : escapeHtml(id);
      })
      .join("<br>");
    statAllergiesList.style.color = "#333";
  } else {
    statAllergiesList.textContent = "ไม่มีข้อจำกัด";
    statAllergiesList.style.color = "#999";
  }

  // ---------- สถิติ: เมนูโปรด / คะแนน ----------
  const favorites = (await DB.getFavorites(user.id)) || [];
  document.getElementById("stat-fav-count").textContent = favorites.length;
  const ratedItems = favorites.filter((f) => f.rating && f.rating > 0);
  document.getElementById("stat-rating-count").textContent = ratedItems.length;

  const ratingsModal = document.getElementById("ratings-modal");
  const ratingsModalBody = document.getElementById("ratings-modal-body");
  const closeRatingsModal = document.getElementById("close-ratings-modal");

  document.getElementById("btn-show-ratings").addEventListener("click", () => {
    if (ratedItems.length === 0) {
      ratingsModalBody.innerHTML = `<div style="text-align:center; padding: 40px 0; color:#999;">คุณยังไม่เคยให้คะแนนเมนูใดๆ</div>`;
    } else {
      const defaultImg = "https://placehold.co/100x100?text=No+Image";
      ratingsModalBody.innerHTML = ratedItems
        .map((item) => {
          const menu = DataStore.getMenuById(item.menu_id);
          if (!menu) return "";
          const stars = "★".repeat(item.rating) + "☆".repeat(5 - item.rating);
          const img = menu.image_url && menu.image_url.trim() !== "" ? menu.image_url : defaultImg;
          return `
            <div style="display: flex; gap: 16px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #eee;">
              <img src="${escapeHtml(img)}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;" alt="${escapeHtml(menu.name)}" onerror="this.src='${defaultImg}'">
              <div>
                <h4 style="margin: 0 0 4px 0;">${escapeHtml(menu.name)}</h4>
                <div style="color: #FF5A1F; letter-spacing: 2px; font-size: 1.2rem;">${stars}</div>
                <div style="font-size: 0.8rem; color: #999; margin-top: 4px;">ให้คะแนนเมื่อ: ${new Date(item.created_at).toLocaleDateString("th-TH")}</div>
              </div>
            </div>
          `;
        })
        .join("");
    }
    ratingsModal.classList.add("is-open");
  });
  closeRatingsModal?.addEventListener("click", () => ratingsModal.classList.remove("is-open"));
  ratingsModal?.addEventListener("click", (e) => {
    if (e.target === ratingsModal) ratingsModal.classList.remove("is-open");
  });

  // ---------- เปิด/ปิด Modal แก้ไขโปรไฟล์ ----------
  const profileModal = document.getElementById("profile-modal");
  const btnEditProfile = document.getElementById("btn-edit-profile");
  const closeProfileModal = document.getElementById("close-profile-modal");

  btnEditProfile.addEventListener("click", () => profileModal.classList.add("is-open"));
  closeProfileModal.addEventListener("click", () => profileModal.classList.remove("is-open"));
  profileModal.addEventListener("click", (e) => {
    if (e.target === profileModal) profileModal.classList.remove("is-open");
  });

  // ---------- รูปโปรไฟล์: เลือกไฟล์ใหม่ + พรีวิว (อัปโหลดจริงตอนกดบันทึก) ----------
  const avatarInput = document.getElementById("avatar-upload");
  const avatarPreviewImg = document.getElementById("avatar-preview-img");
  const avatarPreviewText = document.getElementById("avatar-preview-text");
  let pendingAvatarFile = null;

  if (profile?.avatar_url) {
    avatarPreviewImg.src = profile.avatar_url;
    avatarPreviewImg.style.display = "block";
    avatarPreviewText.style.display = "none";
  }

  avatarInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      Toast.show("กรุณาเลือกไฟล์รูปภาพชนิด JPEG, PNG หรือ WEBP", "danger");
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      Toast.show("ไฟล์รูปภาพต้องมีขนาดไม่เกิน 5MB", "danger");
      e.target.value = "";
      return;
    }
    pendingAvatarFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
      avatarPreviewImg.src = event.target.result;
      avatarPreviewImg.style.display = "block";
      avatarPreviewText.style.display = "none";
    };
    reader.readAsDataURL(file);
  });

  // ---------- บันทึกฟอร์มโปรไฟล์ ----------
  const form = document.getElementById("profile-form");
  const errorEl = document.getElementById("form-error");
  const btnSave = document.getElementById("btn-save-profile");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.remove("is-visible");
    btnSave.disabled = true;

    try {
      // 1. ถ้าเลือกรูปใหม่ไว้ ให้อัปโหลดขึ้น Supabase Storage ก่อน (ได้ลิงก์สาธารณะกลับมา)
      let avatarUrl = profile?.avatar_url || null;
      if (pendingAvatarFile) {
        btnSave.textContent = "กำลังอัปโหลดรูป...";
        avatarUrl = await DB.uploadAvatar(user.id, pendingAvatarFile);
      }

      // 2. บันทึกข้อมูลโปรไฟล์ (รวมลิงก์รูปล่าสุด) ลง Supabase
      btnSave.textContent = "กำลังบันทึก...";
      await DB.updateProfile(user.id, {
        name: document.getElementById("name").value.trim(),
        age: Number(document.getElementById("age").value) || null,
        weight_kg: Number(document.getElementById("weight").value) || null,
        height_cm: Number(document.getElementById("height").value) || null,
        health_conditions: conditionPicker.getSelected(),
        ...(pendingAvatarFile ? { avatar_url: avatarUrl } : {}),
      });

      profile = { ...profile, avatar_url: avatarUrl };
      pendingAvatarFile = null;

      Toast.show("บันทึกโปรไฟล์แล้ว", "success");
      profileModal.classList.remove("is-open");
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      errorEl.textContent = err.message || "บันทึกไม่สำเร็จ";
      errorEl.classList.add("is-visible");
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = "บันทึกการเปลี่ยนแปลง";
    }
  });
})();
