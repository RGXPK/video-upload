import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } from "../config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const loginView = document.getElementById("loginView");
const appView = document.getElementById("appView");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const logoutBtn = document.getElementById("logoutBtn");

const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const pickedName = document.getElementById("pickedName");
const titleInput = document.getElementById("titleInput");
const uploadBtn = document.getElementById("uploadBtn");
const progressShell = document.getElementById("progressShell");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");
const result = document.getElementById("result");
const linkBox = document.getElementById("linkBox");
const copyBtn = document.getElementById("copyBtn");
const openBtn = document.getElementById("openBtn");
const toast = document.getElementById("toast");
const videosList = document.getElementById("videosList");

let selectedFile = null;

function getRepoSegment() {
  if (!location.hostname.endsWith("github.io")) return "";
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[0] ? "/" + parts[0] : "";
}
const REPO_SEGMENT = getRepoSegment();

onAuthStateChanged(auth, (user) => {
  loginView.style.display = user ? "none" : "block";
  appView.style.display = user ? "block" : "none";
  if (user) listenToVideos();
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = loginForm.email.value.trim();
  const password = loginForm.password.value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = "بيانات الدخول غير صحيحة.";
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag");
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(file) {
  selectedFile = file;
  pickedName.textContent = `${file.name} — ${formatSize(file.size)}`;
  if (!titleInput.value) titleInput.value = file.name.replace(/\.[^.]+$/, "");
  uploadBtn.disabled = false;
}

uploadBtn.addEventListener("click", () => {
  if (!selectedFile) return;
  uploadBtn.disabled = true;
  progressShell.style.display = "block";
  result.classList.remove("show");

  const formData = new FormData();
  formData.append("chat_id", TELEGRAM_CHAT_ID);
  formData.append("supports_streaming", "true");
  formData.append("video", selectedFile);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendVideo`);

  xhr.upload.onprogress = (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    progressFill.style.width = pct + "%";
    progressLabel.textContent = `${pct}% — ${formatSize(e.loaded)} / ${formatSize(e.total)}`;
  };

  xhr.onload = async () => {
    try {
      const res = JSON.parse(xhr.responseText);
      if (!res.ok) throw new Error(res.description || "فشل الرفع");
      await handleTelegramSuccess(res.result);
    } catch (err) {
      showToast("خطأ: " + err.message);
      uploadBtn.disabled = false;
    }
  };
  xhr.onerror = () => {
    showToast("فشل الاتصال بتيليجرام");
    uploadBtn.disabled = false;
  };
  xhr.send(formData);
});

async function handleTelegramSuccess(message) {
  const video = message.video || message.document;
  if (!video) throw new Error("لم يتم التعرف على الفيديو في رد تيليجرام");

  const shortId = generateShortId();
  const thumbFileId = video.thumbnail?.file_id || video.thumb?.file_id || null;

  await setDoc(doc(db, "videos", shortId), {
    title: titleInput.value.trim() || selectedFile.name,
    telegramFileId: video.file_id,
    thumbFileId,
    duration: video.duration || 0,
    fileSize: video.file_size || selectedFile.size,
    messageId: message.message_id,
    mimeType: video.mime_type || selectedFile.type,
    createdAt: Date.now(),
  });

  const link = `${window.location.origin}${REPO_SEGMENT}/v/${shortId}`;
  linkBox.textContent = link;
  openBtn.href = link;
  result.classList.add("show");
  progressLabel.textContent = "اكتمل الرفع ✓";

  selectedFile = null;
  fileInput.value = "";
  pickedName.textContent = "";
  titleInput.value = "";
  uploadBtn.disabled = true;
}

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(linkBox.textContent);
  showToast("تم نسخ الرابط");
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function generateShortId(len = 9) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let id = "";
  const rnd = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) id += chars[rnd[i] % chars.length];
  return id;
}

function listenToVideos() {
  const q = query(collection(db, "videos"), orderBy("createdAt", "desc"), limit(50));
  onSnapshot(q, (snap) => {
    videosList.innerHTML = "";
    snap.forEach((d) => {
      const v = d.data();
      const row = document.createElement("div");
      row.className = "video-item";
      row.innerHTML = `
        <div>
          <div class="name">${escapeHtml(v.title)}</div>
          <div class="id">/v/${d.id} — ${formatSize(v.fileSize || 0)}</div>
        </div>
        <button class="btn danger" data-id="${d.id}" data-msg="${v.messageId || ""}">حذف</button>
      `;
      row.querySelector("button").addEventListener("click", () => deleteVideo(d.id, v.messageId));
      videosList.appendChild(row);
    });
  });
}

async function deleteVideo(id, messageId) {
  if (!confirm("حذف هذا الفيديو؟ سيتوقف رابطه عن العمل فوراً.")) return;
  await deleteDoc(doc(db, "videos", id));
  if (messageId) {
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, message_id: messageId }),
    }).catch(() => {});
  }
  showToast("تم الحذف");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
