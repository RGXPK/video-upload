import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, TELEGRAM_BOT_TOKEN } from "./config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pasteForm = document.getElementById("pasteForm");
const pasteInput = document.getElementById("pasteInput");
const homeView = document.getElementById("homeView");
const playerView = document.getElementById("playerView");

function restoreRealPath() {
  const params = new URLSearchParams(location.search);
  const redirected = params.get("p");
  if (redirected) {
    history.replaceState(null, "", redirected);
  }
}
restoreRealPath();

function getRepoSegment() {
  if (!location.hostname.endsWith("github.io")) return "";
  const first = location.pathname.split("/").filter(Boolean)[0];
  return first ? "/" + first : "";
}
const REPO_SEGMENT = getRepoSegment();

function extractIdFromPath(pathname) {
  const m = pathname.match(/\/(?:v|file)\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

function extractIdFromPastedUrl(value) {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return extractIdFromPath(url.pathname);
  } catch {
    return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : null;
  }
}

pasteForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = extractIdFromPastedUrl(pasteInput.value);
  if (!id) return showState("رابط غير صالح. تأكد من نسخ الرابط كاملاً.", "⚠️");
  history.pushState(null, "", `${REPO_SEGMENT}/v/${id}`);
  loadVideo(id);
});

const idFromPath = extractIdFromPath(location.pathname);
if (idFromPath) {
  loadVideo(idFromPath);
}

async function loadVideo(id) {
  homeView.style.display = "none";
  playerView.style.display = "block";
  showState("جارِ التحميل...", "⏳");

  const snap = await getDoc(doc(db, "videos", id));
  if (!snap.exists()) {
    return showState("هذا الفيديو غير موجود أو تم حذفه.", "🚫");
  }
  const v = snap.data();

  let fileUrl;
  try {
    fileUrl = await getTelegramFileUrl(v.telegramFileId);
  } catch (err) {
    return showState("تعذّر جلب الفيديو من تيليجرام (قد يتجاوز حجمه 20MB وهو الحد الأقصى لبوتات تيليجرام العادية).", "🚫");
  }

  let thumbUrl = null;
  if (v.thumbFileId) {
    try { thumbUrl = await getTelegramFileUrl(v.thumbFileId); } catch {}
  }

  renderPlayer(v, fileUrl, thumbUrl);
}

async function getTelegramFileUrl(fileId) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.description);
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
}

function renderPlayer(v, fileUrl, thumbUrl) {
  playerView.innerHTML = `
    <div class="card player-card">
      <video controls playsinline ${thumbUrl ? `poster="${thumbUrl}"` : ""} src="${fileUrl}"></video>
      <div class="meta">
        <h2>${escapeHtml(v.title || "بدون عنوان")}</h2>
        <div class="stats">
          <span>⏱ المدة: <b>${formatDuration(v.duration)}</b></span>
          <span>💾 الحجم: <b>${formatSize(v.fileSize)}</b></span>
        </div>
      </div>
    </div>
    <div class="row" style="margin-top:16px; justify-content:center;">
      <button class="btn ghost" onclick="location.href='${REPO_SEGMENT}/'">🏠 رابط آخر</button>
    </div>
  `;
}

function showState(msg, icon) {
  playerView.innerHTML = `<div class="state-msg"><div class="icon">${icon}</div>${msg}</div>`;
}

function formatDuration(sec) {
  sec = sec || 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSize(bytes) {
  bytes = bytes || 0;
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
