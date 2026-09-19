import { getSupabase, isSupabaseConfigured } from "./supabase-config.js";

const $ = selector => document.querySelector(selector);
const screens = { setup: $("#setup-screen"), login: $("#login-screen"), admin: $("#admin-screen") };
const signOutButton = $("#sign-out");
let supabase;
let folders = [];
let posts = [];
let siteContent = [];
let editState = null;

function show(name) {
  Object.entries(screens).forEach(([key, element]) => element.classList.toggle("active", key === name));
  signOutButton.classList.toggle("hidden", name !== "admin");
}

function message(target, text = "", kind = "") {
  target.textContent = text;
  target.className = `message ${kind}`;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
  }[char]));
}

function setBusy(form, busy) {
  form.querySelectorAll("button,input,textarea,select").forEach(element => element.disabled = busy);
}

function safeFilename(name) {
  return name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}

async function uploadImage(file, folderId) {
  if (!file) return { url: null, path: null };
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 올릴 수 있어요.");
  if (file.size > 12 * 1024 * 1024) throw new Error("사진은 12MB 이하만 올릴 수 있어요.");
  const path = `${folderId}/${Date.now()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from("doublem-media").upload(path, file, { cacheControl:"3600", upsert:false });
  if (error) throw error;
  const { data } = supabase.storage.from("doublem-media").getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function removeImages(paths) {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length) {
    const { error } = await supabase.storage.from("doublem-media").remove(validPaths);
    if (error) console.warn("이미지 삭제 실패:", error.message);
  }
}

async function uploadSiteAsset(file, key, valueType) {
  if (!file) return null;
  const isImage = valueType === "image";
  const isModel = valueType === "model";
  if (isImage && !file.type.startsWith("image/")) throw new Error("사진 항목에는 이미지 파일만 올릴 수 있어요.");
  if (isModel && !file.name.toLowerCase().endsWith(".glb")) throw new Error("3D 모델은 GLB 파일만 올릴 수 있어요.");
  if (file.size > 30 * 1024 * 1024) throw new Error("파일은 30MB 이하만 올릴 수 있어요.");
  const path = `site/${key}/${Date.now()}-${safeFilename(file.name)}`;
  const { error } = await supabase.storage.from("doublem-assets").upload(path, file, { cacheControl:"3600", upsert:false });
  if (error) throw error;
  const { data } = supabase.storage.from("doublem-assets").getPublicUrl(path);
  return data.publicUrl;
}

function renderSiteContentFields() {
  const root = $("#site-content-fields");
  if (!siteContent.length) {
    root.innerHTML = '<p class="message">수정할 사이트 설정이 없습니다.</p>';
    return;
  }
  const groups = new Map();
  siteContent.forEach(item => {
    if (!groups.has(item.group_name)) groups.set(item.group_name, []);
    groups.get(item.group_name).push(item);
  });
  root.innerHTML = [...groups.entries()].map(([group, items]) => `
    <section class="site-group">
      <h3>${escapeHtml(group)}</h3>
      <div class="site-fields">${items.map(item => renderSiteField(item)).join("")}</div>
    </section>`).join("");
  root.querySelectorAll("[data-clear-site-file]").forEach(button => button.addEventListener("click", () => {
    const key = button.dataset.clearSiteFile;
    const valueInput = root.querySelector(`[data-site-value="${CSS.escape(key)}"]`);
    const fileInput = root.querySelector(`[data-site-file="${CSS.escape(key)}"]`);
    if (valueInput) valueInput.value = "";
    if (fileInput) fileInput.value = "";
  }));
}

function renderSiteField(item) {
  const key = escapeHtml(item.key);
  const label = escapeHtml(item.label);
  const value = escapeHtml(item.value || "");
  if (item.value_type === "boolean") {
    return `<div class="site-field"><div class="toggle-row"><input id="site-${key}" data-site-value="${key}" type="checkbox" ${String(item.value).toLowerCase() !== "false" ? "checked" : ""}><label for="site-${key}">${label}</label></div></div>`;
  }
  if (item.value_type === "textarea") {
    return `<div class="site-field full"><label for="site-${key}">${label}<small>줄바꿈 가능</small></label><textarea id="site-${key}" data-site-value="${key}" rows="5">${value}</textarea></div>`;
  }
  if (item.value_type === "image" || item.value_type === "model") {
    const accept = item.value_type === "image" ? "image/*" : ".glb,model/gltf-binary,application/octet-stream";
    const help = item.value_type === "image" ? "새 사진을 선택하면 기존 사진 대신 표시됩니다." : "Inventor에서 변환한 GLB 파일을 선택하세요.";
    return `<div class="site-field full"><label for="site-${key}">${label}</label><div class="asset-row"><input id="site-${key}" data-site-value="${key}" type="url" value="${value}" placeholder="현재 파일 주소"><input data-site-file="${key}" type="file" accept="${accept}"></div><div class="actions" style="margin-top:8px"><button class="secondary" data-clear-site-file="${key}" type="button">현재 파일 제거</button></div><p class="format-help">${help}</p></div>`;
  }
  const type = item.value_type === "url" ? "url" : "text";
  return `<div class="site-field"><label for="site-${key}">${label}</label><input id="site-${key}" data-site-value="${key}" type="${type}" value="${value}"></div>`;
}

async function loadSiteContentAdmin() {
  const { data, error } = await supabase.from("site_content").select("*").order("group_name").order("sort_order");
  if (error) throw error;
  siteContent = data || [];
  renderSiteContentFields();
}

async function saveSiteContent(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#site-content-message");
  setBusy(form, true);
  message(status, "사이트 설정을 저장하는 중…");
  try {
    const values = new Map();
    form.querySelectorAll("[data-site-value]").forEach(input => {
      values.set(input.dataset.siteValue, input.type === "checkbox" ? String(input.checked) : input.value.trim());
    });
    for (const fileInput of form.querySelectorAll("[data-site-file]")) {
      const file = fileInput.files?.[0];
      if (!file) continue;
      const item = siteContent.find(entry => entry.key === fileInput.dataset.siteFile);
      if (!item) continue;
      values.set(item.key, await uploadSiteAsset(file, item.key, item.value_type));
    }
    const updates = [...values.entries()].map(([key, value]) => supabase.from("site_content").update({ value }).eq("key", key));
    const results = await Promise.all(updates);
    const failed = results.find(result => result.error);
    if (failed) throw failed.error;
    await loadSiteContentAdmin();
    message(status, "저장했습니다. 공개 사이트를 새로고침하면 바로 확인할 수 있어요.", "ok");
  } catch (error) {
    message(status, `저장하지 못했어요: ${error.message}`, "error");
  } finally {
    setBusy(form, false);
  }
}

async function loadData() {
  const [{ data: nextFolders, error: folderError }, { data: nextPosts, error: postError }] = await Promise.all([
    supabase.from("folders").select("*").order("sort_order").order("created_at", { ascending:false }),
    supabase.from("posts").select("*").order("occurred_on", { ascending:false })
  ]);
  if (folderError || postError) throw folderError || postError;
  folders = nextFolders;
  posts = nextPosts;
  renderFolderOptions();
  renderList();
}

function renderFolderOptions() {
  const select = $("#post-folder");
  select.innerHTML = folders.length
    ? folders.map(folder => `<option value="${folder.id}">[${folder.type === "contest" ? "대회" : "프로젝트"}] ${escapeHtml(folder.name)}</option>`).join("")
    : "<option value=\"\">먼저 폴더를 만들어주세요</option>";
  select.disabled = !folders.length;
  $("#post-form button").disabled = !folders.length;
}

function renderList() {
  const list = $("#admin-list");
  if (!folders.length) {
    list.innerHTML = "<p class=\"message\">아직 폴더가 없습니다.</p>";
    return;
  }
  list.innerHTML = folders.map(folder => {
    const children = posts.filter(post => post.folder_id === folder.id);
    return `<article class="manage-card">
      <div style="display:flex;gap:14px;min-width:0">
        ${folder.cover_url ? `<img src="${escapeHtml(folder.cover_url)}" alt="">` : ""}
        <div><span class="badge">${folder.type === "contest" ? "대회" : "프로젝트"}</span><h3>${escapeHtml(folder.name)}</h3><p>${escapeHtml(folder.description || "소개 없음")} · 기록 ${children.length}개</p>
          ${children.length ? `<div class="card-list" style="margin-top:14px">${children.map(post => `<div class="manage-card" style="padding:12px"><div><h3 style="font-size:15px">${escapeHtml(post.title)}</h3><p>${escapeHtml(post.summary || "내용 없음")}</p></div><div class="actions"><button type="button" data-edit-post="${post.id}">수정</button><button class="danger" type="button" data-delete-post="${post.id}">삭제</button></div></div>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="actions"><button type="button" data-edit-folder="${folder.id}">수정</button><button class="danger" type="button" data-delete-folder="${folder.id}">삭제</button></div>
    </article>`;
  }).join("");
  list.querySelectorAll("[data-delete-folder]").forEach(button => button.addEventListener("click", () => deleteFolder(button.dataset.deleteFolder)));
  list.querySelectorAll("[data-delete-post]").forEach(button => button.addEventListener("click", () => deletePost(button.dataset.deletePost)));
  list.querySelectorAll("[data-edit-folder]").forEach(button => button.addEventListener("click", () => openEdit("folder", button.dataset.editFolder)));
  list.querySelectorAll("[data-edit-post]").forEach(button => button.addEventListener("click", () => openEdit("post", button.dataset.editPost)));
}

function openEdit(kind, id) {
  const item = (kind === "folder" ? folders : posts).find(value => value.id === id);
  if (!item) return;
  editState = { kind, item };
  $("#edit-title").textContent = kind === "folder" ? "폴더 수정" : "기록 수정";
  const fields = $("#edit-fields");
  if (kind === "folder") {
    fields.innerHTML = `
      <label for="edit-type">분류</label><select id="edit-type" name="type"><option value="contest" ${item.type === "contest" ? "selected" : ""}>대회</option><option value="project" ${item.type === "project" ? "selected" : ""}>프로젝트</option></select>
      <label for="edit-name">폴더 이름</label><input id="edit-name" name="name" maxlength="80" required value="${escapeHtml(item.name)}">
      <label for="edit-description">소개</label><textarea id="edit-description" name="description" maxlength="300">${escapeHtml(item.description || "")}</textarea>
      <label for="edit-cover">대표 사진 교체 (선택)</label><input id="edit-cover" name="cover" type="file" accept="image/*">`;
  } else {
    fields.innerHTML = `
      <label for="edit-folder">저장 폴더</label><select id="edit-folder" name="folder">${folders.map(folder => `<option value="${folder.id}" ${folder.id === item.folder_id ? "selected" : ""}>[${folder.type === "contest" ? "대회" : "프로젝트"}] ${escapeHtml(folder.name)}</option>`).join("")}</select>
      <label for="edit-name">제목</label><input id="edit-name" name="name" maxlength="100" required value="${escapeHtml(item.title)}">
      <label for="edit-date">날짜</label><input id="edit-date" name="occurredOn" type="date" value="${item.occurred_on || ""}">
      <label for="edit-description">내용</label><textarea id="edit-description" name="description" maxlength="600">${escapeHtml(item.summary || "")}</textarea>
      <label for="edit-cover">사진 교체 (선택)</label><input id="edit-cover" name="cover" type="file" accept="image/*">`;
  }
  message($("#edit-message"));
  $("#edit-dialog").showModal();
}

async function saveEdit(event) {
  event.preventDefault();
  if (!editState) return;
  const form = event.currentTarget;
  const values = new FormData(form);
  const status = $("#edit-message");
  const { kind, item } = editState;
  setBusy(form, true); message(status, "저장하는 중…");
  try {
    const file = values.get("cover");
    const image = file && file.size ? await uploadImage(file, kind === "folder" ? item.id : values.get("folder")) : null;
    const changes = kind === "folder" ? {
      type: values.get("type"), name: values.get("name"), description: values.get("description") || null
    } : {
      folder_id: values.get("folder"), title: values.get("name"), summary: values.get("description") || null,
      occurred_on: values.get("occurredOn") || null
    };
    if (image) Object.assign(changes, { cover_url:image.url, cover_path:image.path });
    const { error } = await supabase.from(kind === "folder" ? "folders" : "posts").update(changes).eq("id", item.id);
    if (error) throw error;
    if (image) await removeImages([item.cover_path]);
    $("#edit-dialog").close(); editState = null; await loadData();
  } catch (error) { message(status, `저장하지 못했어요: ${error.message}`, "error"); }
  finally { setBusy(form, false); }
}

async function deletePost(id) {
  const post = posts.find(item => item.id === id);
  if (!post || !confirm(`“${post.title}” 기록을 삭제할까요?`)) return;
  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return alert(`삭제하지 못했어요: ${error.message}`);
  await removeImages([post.cover_path]);
  await loadData();
}

async function deleteFolder(id) {
  const folder = folders.find(item => item.id === id);
  if (!folder || !confirm(`“${folder.name}” 폴더와 안의 모든 기록을 삭제할까요?`)) return;
  const children = posts.filter(post => post.folder_id === id);
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) return alert(`삭제하지 못했어요: ${error.message}`);
  await removeImages([folder.cover_path, ...children.map(post => post.cover_path)]);
  await loadData();
}

async function ensureAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return show("login");
  const email = session.user.email?.trim().toLowerCase();
  const { data, error } = await supabase.from("admin_emails").select("email").eq("email", email || "").maybeSingle();
  if (error || !data) {
    await supabase.auth.signOut();
    message($("#login-message"), "이 계정은 관리자 권한이 없습니다.", "error");
    return show("login");
  }
  show("admin");
  try {
    await Promise.all([loadData(), loadSiteContentAdmin()]);
  } catch (error) {
    $("#admin-list").innerHTML = `<p class="message error">목록을 불러오지 못했어요: ${escapeHtml(error.message)}</p>`;
    $("#site-content-fields").innerHTML = `<p class="message error">사이트 설정을 불러오지 못했어요: ${escapeHtml(error.message)}</p>`;
  }
}

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#login-message");
  const values = new FormData(form);
  setBusy(form, true); message(status, "로그인하는 중…");
  const { error } = await supabase.auth.signInWithPassword({ email: values.get("email"), password: values.get("password") });
  setBusy(form, false);
  if (error) return message(status, `로그인하지 못했어요: ${error.message}`, "error");
  await ensureAdmin();
});

$("#sign-up").addEventListener("click", async () => {
  const form = $("#login-form");
  const status = $("#login-message");
  const values = new FormData(form);
  const email = String(values.get("email") || "").trim();
  const password = String(values.get("password") || "");
  if (!email || !password) return message(status, "이메일과 비밀번호를 먼저 입력해주세요.", "error");
  if (password.length < 6) return message(status, "비밀번호는 6자 이상으로 입력해주세요.", "error");
  setBusy(form, true); $("#sign-up").disabled = true; message(status, "계정을 만드는 중…");
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: new URL("admin.html", window.location.href).href } });
  setBusy(form, false); $("#sign-up").disabled = false;
  if (error) return message(status, `계정을 만들지 못했어요: ${error.message}`, "error");
  message(status, "확인 이메일을 보냈어요. 이메일 인증 후 이 페이지에서 로그인해주세요.", "ok");
});

$("#folder-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#folder-message");
  const values = new FormData(form);
  setBusy(form, true); message(status, "폴더를 만드는 중…");
  try {
    const { data: folder, error } = await supabase.from("folders").insert({
      type: values.get("type"), name: values.get("name"), description: values.get("description") || null
    }).select().single();
    if (error) throw error;
    const image = await uploadImage(values.get("cover"), folder.id);
    if (image.url) {
      const { error: updateError } = await supabase.from("folders").update({ cover_url:image.url, cover_path:image.path }).eq("id", folder.id);
      if (updateError) throw updateError;
    }
    form.reset(); message(status, "폴더를 만들었습니다.", "ok"); await loadData();
  } catch (error) { message(status, `만들지 못했어요: ${error.message}`, "error"); }
  finally { setBusy(form, false); }
});

$("#post-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#post-message");
  const values = new FormData(form);
  const folderId = values.get("folder");
  if (!folderId) return message(status, "먼저 저장할 폴더를 만들어주세요.", "error");
  setBusy(form, true); message(status, "기록을 추가하는 중…");
  try {
    const image = await uploadImage(values.get("cover"), folderId);
    const { error } = await supabase.from("posts").insert({
      folder_id: folderId, title: values.get("title"), summary: values.get("summary") || null,
      occurred_on: values.get("occurredOn") || null, cover_url:image.url, cover_path:image.path
    });
    if (error) throw error;
    form.reset(); message(status, "기록을 추가했습니다.", "ok"); await loadData();
  } catch (error) { message(status, `추가하지 못했어요: ${error.message}`, "error"); }
  finally { setBusy(form, false); }
});

signOutButton.addEventListener("click", async () => { await supabase.auth.signOut(); show("login"); });
$("#site-content-form").addEventListener("submit", saveSiteContent);
$("#edit-form").addEventListener("submit", saveEdit);
$("#edit-close").addEventListener("click", () => $("#edit-dialog").close());
$("#edit-cancel").addEventListener("click", () => $("#edit-dialog").close());
$("#edit-dialog").addEventListener("close", () => { editState = null; });

if (!isSupabaseConfigured()) {
  show("setup");
} else {
  supabase = await getSupabase();
  await ensureAdmin();
}
