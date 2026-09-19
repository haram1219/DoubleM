import { getSupabase, isSupabaseConfigured } from "./supabase-config.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;"
}[char]));

const splitLines = value => String(value || "")
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean);

function applyText(key, value) {
  document.querySelectorAll(`[data-content-key="${CSS.escape(key)}"]`).forEach(element => {
    element.textContent = value;
    if (String(value).includes("\n")) element.style.whiteSpace = "pre-line";
  });
}

function applyUrl(key, value) {
  if (!value) return;
  document.querySelectorAll(`[data-url-key="${CSS.escape(key)}"]`).forEach(element => {
    element.href = value;
  });
}

function applyVisibility(key, value) {
  const visible = String(value).toLowerCase() !== "false";
  document.querySelectorAll(`[data-visible-key="${CSS.escape(key)}"]`).forEach(element => {
    element.hidden = !visible;
    element.style.display = visible ? "" : "none";
  });
}

function applyLines(key, value) {
  document.querySelectorAll(`[data-lines-key="${CSS.escape(key)}"]`).forEach(element => {
    element.innerHTML = splitLines(value).map(line => `<li>${escapeHtml(line)}</li>`).join("");
  });
}

function applyStats(key, value) {
  document.querySelectorAll(`[data-stats-key="${CSS.escape(key)}"]`).forEach(element => {
    element.innerHTML = splitLines(value).map(line => {
      const [number, ...label] = line.split("|");
      return `<div class="stat"><div class="num">${escapeHtml(number?.trim())}</div><div class="label">${escapeHtml(label.join("|").trim())}</div></div>`;
    }).join("");
  });
}

function applyFlow(key, value) {
  document.querySelectorAll(`[data-flow-key="${CSS.escape(key)}"]`).forEach(element => {
    element.innerHTML = splitLines(value).map((line, index) => `${index ? '<div class="arrow">→</div>' : ""}<div class="step">${escapeHtml(line)}</div>`).join("");
  });
}

function applyCards(key, value) {
  document.querySelectorAll(`[data-cards-key="${CSS.escape(key)}"]`).forEach(element => {
    element.innerHTML = splitLines(value).map(line => {
      const [title, ...description] = line.split("|");
      return `<div class="card"><h3 style="margin-top:18px;">${escapeHtml(title?.trim())}</h3><p>${escapeHtml(description.join("|").trim())}</p></div>`;
    }).join("");
  });
}

function applyTimeline(key, value) {
  document.querySelectorAll(`[data-timeline-key="${CSS.escape(key)}"]`).forEach(element => {
    element.innerHTML = splitLines(value).map(line => {
      const [year, ...description] = line.split("|");
      return `<div class="item"><div class="year">${escapeHtml(year?.trim())}</div><div class="desc">${escapeHtml(description.join("|").trim())}</div></div>`;
    }).join("");
  });
}

function applyModel(key, value) {
  if (!value) return;
  document.querySelectorAll(`[data-model-key="${CSS.escape(key)}"]`).forEach(element => {
    element.setAttribute("src", value);
  });
}

function applyImage(key, value) {
  if (!value) return;
  document.querySelectorAll(`[data-image-key="${CSS.escape(key)}"]`).forEach(element => {
    const image = element.tagName === "IMG" ? element : element.querySelector("img");
    if (image) {
      image.src = value;
      return;
    }
    const target = element.classList.contains("photo") ? element : element.querySelector(".photo") || element;
    target.textContent = "";
    target.style.backgroundImage = `url("${String(value).replace(/"/g, "%22")}")`;
    target.style.backgroundPosition = "center";
    target.style.backgroundSize = "cover";
  });
}

async function loadSiteContent() {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase.from("site_content").select("key,value,value_type");
    if (error) throw error;
    const content = new Map((data || []).map(item => [item.key, item]));

    for (const item of content.values()) {
      applyText(item.key, item.value);
      applyUrl(item.key, item.value);
      applyVisibility(item.key, item.value);
      applyLines(item.key, item.value);
      applyStats(item.key, item.value);
      applyFlow(item.key, item.value);
      applyCards(item.key, item.value);
      applyTimeline(item.key, item.value);
      applyModel(item.key, item.value);
      applyImage(item.key, item.value);
    }

    const siteName = content.get("site_name")?.value;
    if (siteName) document.title = `${siteName} | 로봇 동아리`;
  } catch (error) {
    console.warn("사이트 설정을 불러오지 못했습니다:", error.message);
  }
}

loadSiteContent();
