import { getSupabase, isSupabaseConfigured } from "./supabase-config.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
}[char]));

const typeLabel = type => type === "contest" ? "대회" : "프로젝트";
const dateLabel = value => value ? new Intl.DateTimeFormat("ko-KR", { year:"numeric", month:"long", day:"numeric" }).format(new Date(`${value}T00:00:00`)) : "";

const folderGrid = document.querySelector("#folder-grid");
const detail = document.querySelector("#folder-detail");
const detailTitle = document.querySelector("#folder-detail-title");
const detailDescription = document.querySelector("#folder-detail-description");
const postGrid = document.querySelector("#post-grid");

function showFolder(folder, posts) {
  detail.hidden = false;
  detailTitle.textContent = folder.name;
  detailDescription.textContent = folder.description || "";
  const folderPosts = posts.filter(post => post.folder_id === folder.id);
  postGrid.innerHTML = folderPosts.length ? folderPosts.map(post => `
    <article class="card post-card">
      ${post.cover_url ? `<img src="${escapeHtml(post.cover_url)}" alt="${escapeHtml(post.title)}" loading="lazy">` : ""}
      <div class="post-card__body">
        <div class="post-card__date">${dateLabel(post.occurred_on)}</div>
        <h3>${escapeHtml(post.title)}</h3>
        <p>${escapeHtml(post.summary || "")}</p>
      </div>
    </article>`).join("") : "<p class=\"folder-empty\">아직 등록된 기록이 없습니다.</p>";
  detail.scrollIntoView({ behavior:"smooth", block:"start" });
}

async function renderArchive() {
  if (!folderGrid || !isSupabaseConfigured()) return;
  const supabase = await getSupabase();
  const [{ data: folders, error: folderError }, { data: posts, error: postError }] = await Promise.all([
    supabase.from("folders").select("*").order("sort_order").order("created_at", { ascending:false }),
    supabase.from("posts").select("*").order("occurred_on", { ascending:false })
  ]);
  if (folderError || postError) {
    folderGrid.innerHTML = "<p class=\"folder-empty\">기록을 불러오지 못했습니다. 잠시 뒤 다시 시도해주세요.</p>";
    return;
  }
  folderGrid.innerHTML = folders.length ? folders.map(folder => `
    <button class="card folder-card" type="button" data-folder-id="${folder.id}">
      ${folder.cover_url ? `<img class="folder-card__cover" src="${escapeHtml(folder.cover_url)}" alt="${escapeHtml(folder.name)}">` : ""}
      <span class="folder-card__body">
        <span class="folder-card__type">${typeLabel(folder.type)}</span>
        <h3>${escapeHtml(folder.name)}</h3>
        <p>${escapeHtml(folder.description || "기록 보기")}</p>
      </span>
    </button>`).join("") : "<p class=\"folder-empty\">관리자 페이지에서 대회 또는 프로젝트 폴더를 추가해보세요.</p>";
  folderGrid.querySelectorAll("[data-folder-id]").forEach(button => {
    button.addEventListener("click", () => showFolder(folders.find(folder => folder.id === button.dataset.folderId), posts));
  });
}

renderArchive();
