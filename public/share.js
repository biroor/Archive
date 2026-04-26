// Auth Storage Key
const STORAGE_KEY = "biroor_auth_user_v2";
const SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000; // 30 days
const LAST_ACTIVITY_KEY = "biroor_last_activity";
const DEFAULT_API_BASE = "/archive/api.php";
const FAVORITES_KEY_PREFIX = "biroor_favorites_v2";
const VIEW_MODE_KEY = "biroor_share_view_mode_v1";

// DOM Elements
const dragDropArea = document.getElementById("dragDropArea");
const fileInput = document.getElementById("fileInput");
const filesList = document.getElementById("filesList");
const uploadProgress = document.getElementById("uploadProgress");
const progressBar = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const fileCount = document.getElementById("fileCount");
const toast = document.getElementById("toast");
const uploadForm = document.getElementById("uploadForm");
const uploadSection = document.getElementById("uploadSection");
const userDisplay = document.getElementById("userDisplay");
const logoutArea = document.getElementById("logoutArea");
const shareInfo = document.getElementById("shareInfo");
const shareLinkEl = document.getElementById("shareLink");
const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const favoritesFilter = document.getElementById("favoritesFilter");
const sortSelect = document.getElementById("sortSelect");
const refreshBtn = document.getElementById("refreshBtn");
const copyVisibleLinksBtn = document.getElementById("copyVisibleLinksBtn");
const listViewBtn = document.getElementById("listViewBtn");
const gridViewBtn = document.getElementById("gridViewBtn");
const visibleCountEl = document.getElementById("visibleCount");
const totalSizeEl = document.getElementById("totalSize");
const favoriteCountEl = document.getElementById("favoriteCount");
const previewModal = document.getElementById("previewModal");
const previewContent = document.getElementById("previewContent");
const previewTitle = document.getElementById("previewTitle");
const previewCloseBtn = document.getElementById("previewCloseBtn");
const simpleShareBox = document.getElementById("simpleShareBox");
const simpleShareHint = document.getElementById("simpleShareHint");
const fileShareLinkInput = document.getElementById("fileShareLinkInput");
const copyFileShareBtn = document.getElementById("copyFileShareBtn");
const clearFileShareBtn = document.getElementById("clearFileShareBtn");

// State
let currentUser = null;
let currentToken = "";
let sharedOwner = "";
let sharedFile = "";
let allFiles = [];
let filteredFiles = [];
let favoriteFiles = new Set();
let favoritesStorageKey = "";
let viewMode = "list";
let lastActivityWrite = 0;
let selectedFileShareLink = "";

// Emergency fallback in case config.js did not run
setTimeout(() => {
  ensureApiBase("[startup]");
}, 100);

window.addEventListener("load", () => {
  ensureApiBase("[load]");
  checkSessionValidity();
  restoreUser();
  readShareContext();
  restoreViewMode();
  restoreFavorites();
  setupUI();
  applyViewMode();
  setupEventListeners();
  loadFiles();
  setupActivityTracker();
});

function ensureApiBase(context = "") {
  if (!window.API_BASE || window.API_BASE === "undefined" || window.API_BASE === null) {
    window.API_BASE = DEFAULT_API_BASE;
    console.warn(`[share.js] API_BASE fallback${context ? ` ${context}` : ""}:`, window.API_BASE);
  }
  return window.API_BASE;
}

function getScopeKey() {
  if (currentUser?.email) return `owner:${String(currentUser.email).toLowerCase()}`;
  if (sharedOwner) return `share:${String(sharedOwner).toLowerCase()}`;
  if (currentToken) return `token:${currentToken}`;
  return "public";
}

function getFavoritesStorageKey() {
  return `${FAVORITES_KEY_PREFIX}:${getScopeKey()}`;
}

function restoreFavorites() {
  favoritesStorageKey = getFavoritesStorageKey();
  const raw = localStorage.getItem(favoritesStorageKey);

  if (!raw) {
    favoriteFiles = new Set();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      favoriteFiles = new Set(parsed.map((item) => String(item)));
      return;
    }
  } catch (error) {
    // ignore malformed favorites
  }

  favoriteFiles = new Set();
}

function saveFavorites() {
  try {
    localStorage.setItem(favoritesStorageKey, JSON.stringify([...favoriteFiles]));
  } catch (error) {
    console.warn("Favoriler kaydedilemedi:", error);
  }
}

function toggleFavorite(fileName) {
  if (!fileName) return;

  if (favoriteFiles.has(fileName)) {
    favoriteFiles.delete(fileName);
  } else {
    favoriteFiles.add(fileName);
  }

  saveFavorites();
  applyFiltersAndRender();
}

function isFavorite(fileName) {
  return favoriteFiles.has(fileName);
}

function restoreViewMode() {
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  viewMode = stored === "grid" ? "grid" : "list";
}

function setViewMode(mode) {
  viewMode = mode === "grid" ? "grid" : "list";
  localStorage.setItem(VIEW_MODE_KEY, viewMode);
  applyViewMode();
  renderFiles(filteredFiles);
}

function applyViewMode() {
  if (filesList) {
    filesList.classList.toggle("grid-view", viewMode === "grid");
  }

  if (listViewBtn) {
    listViewBtn.classList.toggle("is-active", viewMode === "list");
  }

  if (gridViewBtn) {
    gridViewBtn.classList.toggle("is-active", viewMode === "grid");
  }
}

function checkSessionValidity() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!lastActivity) return;

  const now = Date.now();
  const lastTime = Number.parseInt(lastActivity, 10);

  if (Number.isNaN(lastTime)) return;

  if (now - lastTime > SESSION_TIMEOUT) {
    clearUser();
    showToast("Oturum süreniz doldu. Lütfen tekrar giriş yapın.", "warn");
    window.location.href = "login.html";
  }
}

function setupActivityTracker() {
  const events = ["click", "keypress", "scroll"];

  events.forEach((eventName) => {
    document.addEventListener(
      eventName,
      () => {
        if (!currentUser) return;

        const now = Date.now();
        if (now - lastActivityWrite < 10000) return;

        lastActivityWrite = now;
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      },
      { passive: true }
    );
  });
}

function restoreUser() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  try {
    currentUser = JSON.parse(raw);
    updateLastActivity();
  } catch (error) {
    clearUser();
  }
}

function updateLastActivity() {
  const now = Date.now();
  lastActivityWrite = now;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
}

function clearUser() {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LAST_ACTIVITY_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

function readShareContext() {
  const params = new URLSearchParams(window.location.search);
  currentToken = (params.get("token") || "").trim();
  sharedOwner = (params.get("share") || params.get("owner") || "").trim();
  sharedFile = (params.get("file") || "").trim();

  if (currentUser?.email && sharedOwner.toLowerCase() === String(currentUser.email).toLowerCase()) {
    sharedOwner = "";
  }
}

function setupUI() {
  applySingleFileModeControls();

  if (currentUser?.email) {
    uploadSection.style.display = "block";
    userDisplay.textContent = `Merhaba, ${currentUser.name || currentUser.email}!`;
    shareInfo.textContent = sharedFile
      ? `Tek dosya paylaşım görünümü: ${sharedFile}`
      : "Kişisel dosya yönetim alanınız";

    logoutArea.innerHTML = '<span class="logout-link" onclick="doLogout()">Çıkış Yap</span>';

    const shareLink = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(currentUser.email)}`;
    shareLinkEl.textContent = "Paylaşım linkini kopyala";
    shareLinkEl.classList.add("is-active");
    shareLinkEl.onclick = () => {
      copyToClipboard(shareLink, "Paylaşım linki kopyalandı!");
    };

    setupSimpleShareBoxForOwner();

    return;
  }

  if (sharedOwner) {
    uploadSection.style.display = "none";
    userDisplay.textContent = "Paylaşılan Arşiv";
    shareInfo.textContent = sharedFile
      ? `Paylaşılan tek dosya: ${sharedFile}`
      : `${sharedOwner} hesabının paylaştığı dosyaları görüntülüyorsunuz`;
    logoutArea.innerHTML = '<a href="login.html" class="logout-link">Kendi hesabınla giriş yap</a>';
    shareLinkEl.textContent = "";
    shareLinkEl.classList.remove("is-active");
    shareLinkEl.onclick = null;
    setupSimpleShareBoxForViewer();
    return;
  }

  if (currentToken) {
    uploadSection.style.display = "none";
    userDisplay.textContent = "Herkese Açık Paylaşım";
    shareInfo.textContent = "Bu paylaşım linkindeki dosyaları indirebilirsiniz";
    shareLinkEl.textContent = "";
    shareLinkEl.classList.remove("is-active");
    shareLinkEl.onclick = null;
    setupSimpleShareBoxForViewer();
    return;
  }

  uploadSection.style.display = "none";
  userDisplay.textContent = "Dosya görüntüleme modu";
  shareInfo.textContent = "Dosya yüklemek için giriş yapabilirsiniz";
  logoutArea.innerHTML = '<a href="login.html" class="logout-link">Giriş Yap</a>';
  shareLinkEl.textContent = "";
  shareLinkEl.classList.remove("is-active");
  shareLinkEl.onclick = null;
  setupSimpleShareBoxForViewer();
}

function applySingleFileModeControls() {
  const isSingleFileMode = Boolean(sharedFile);
  const controls = [searchInput, typeFilter, favoritesFilter, sortSelect, copyVisibleLinksBtn];

  controls.forEach((element) => {
    if (element) {
      element.disabled = isSingleFileMode;
    }
  });

  if (isSingleFileMode) {
    if (searchInput) searchInput.value = "";
    if (favoritesFilter) favoritesFilter.value = "all";
  }
}

function setupSimpleShareBoxForOwner() {
  if (!simpleShareBox) return;

  simpleShareBox.style.display = "block";
  selectedFileShareLink = "";

  if (fileShareLinkInput) {
    fileShareLinkInput.value = "";
  }

  if (copyFileShareBtn) {
    copyFileShareBtn.disabled = true;
  }

  if (simpleShareHint) {
    simpleShareHint.textContent = "Listeden bir dosyada “Paylaş” butonuna basın.";
  }
}

function setupSimpleShareBoxForViewer() {
  if (!simpleShareBox) return;
  simpleShareBox.style.display = "none";
  selectedFileShareLink = "";
}

function setupEventListeners() {
  dragDropArea?.addEventListener("click", () => fileInput?.click());
  dragDropArea?.addEventListener("dragover", handleDragOver);
  dragDropArea?.addEventListener("dragleave", handleDragLeave);
  dragDropArea?.addEventListener("drop", handleDrop);
  fileInput?.addEventListener("change", handleFileSelect);

  filesList?.addEventListener("click", handleFileActionClick);
  searchInput?.addEventListener("input", applyFiltersAndRender);
  typeFilter?.addEventListener("change", applyFiltersAndRender);
  favoritesFilter?.addEventListener("change", applyFiltersAndRender);
  sortSelect?.addEventListener("change", applyFiltersAndRender);
  refreshBtn?.addEventListener("click", () => loadFiles(true));
  copyVisibleLinksBtn?.addEventListener("click", copyVisibleFileLinks);
  copyFileShareBtn?.addEventListener("click", () => {
    if (!selectedFileShareLink) {
      showToast("Önce bir dosya paylaş linki üretin", "warn");
      return;
    }
    copyToClipboard(selectedFileShareLink, "Dosya paylaşım linki kopyalandı!");
  });
  clearFileShareBtn?.addEventListener("click", clearSimpleShareSelection);

  listViewBtn?.addEventListener("click", () => setViewMode("list"));
  gridViewBtn?.addEventListener("click", () => setViewMode("grid"));

  previewCloseBtn?.addEventListener("click", closePreview);
  previewModal?.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-close-preview]");
    if (closeTarget) {
      closePreview();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePreview();
    }
  });

  window.addEventListener("focus", () => {
    loadFiles();
  });
}

function doLogout() {
  if (!confirm("Çıkış yapmak istediğinizden emin misiniz?")) {
    return;
  }

  clearUser();
  window.location.href = "share.html";
}

function handleDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  dragDropArea?.classList.add("drag-over");
}

function handleDragLeave(event) {
  event.preventDefault();
  event.stopPropagation();
  dragDropArea?.classList.remove("drag-over");
}

function handleDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  dragDropArea?.classList.remove("drag-over");

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;

  handleFileSelect({ target: { files } });
}

function handleFileSelect(event) {
  const files = event.target?.files;
  if (!files || files.length === 0) return;

  if (!currentUser?.email) {
    showToast("Dosya yüklemek için önce giriş yapmalısınız", "error");
    return;
  }

  uploadFiles(files);
}

function handleFileActionClick(event) {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;

  const action = actionElement.dataset.action;
  if (!action) return;

  if (action === "delete") {
    const encodedName = actionElement.dataset.file || "";
    if (!encodedName) return;

    deleteFile(decodeURIComponent(encodedName));
    return;
  }

  if (action === "copy") {
    const encodedPath = actionElement.dataset.path || "";
    if (!encodedPath) return;

    const rawPath = decodeURIComponent(encodedPath);
    copyToClipboard(toAbsoluteUrl(rawPath), "İndirme linki kopyalandı!");
    return;
  }

  if (action === "favorite") {
    const encodedName = actionElement.dataset.file || "";
    if (!encodedName) return;

    toggleFavorite(decodeURIComponent(encodedName));
    return;
  }

  if (action === "preview") {
    const encodedName = actionElement.dataset.file || "";
    if (!encodedName) return;

    const fileName = decodeURIComponent(encodedName);
    const file = allFiles.find((item) => item.name === fileName);
    if (!file) return;

    openPreview(file);
    return;
  }

  if (action === "share-file") {
    const encodedName = actionElement.dataset.file || "";
    if (!encodedName) return;

    const fileName = decodeURIComponent(encodedName);
    setSimpleShareSelection(fileName);
  }
}

function copyVisibleFileLinks() {
  if (!filteredFiles.length) {
    showToast("Önce listede görünen dosya olmalı", "warn");
    return;
  }

  const payload = filteredFiles
    .map((file) => `${file.name}: ${toAbsoluteUrl(file.downloadPath)}`)
    .join("\n");

  copyToClipboard(payload, `${filteredFiles.length} dosyanın linki kopyalandı`);
}

function setSimpleShareSelection(fileName) {
  if (!currentUser?.email) {
    showToast("Dosya bazlı paylaşım için giriş yapmalısınız", "warn");
    return;
  }

  const link = buildSingleFileShareLink(fileName);
  if (!link) {
    showToast("Paylaşım linki üretilemedi", "error");
    return;
  }

  selectedFileShareLink = link;

  if (fileShareLinkInput) {
    fileShareLinkInput.value = link;
  }

  if (copyFileShareBtn) {
    copyFileShareBtn.disabled = false;
  }

  if (simpleShareHint) {
    simpleShareHint.textContent = `Seçilen dosya: ${fileName}`;
  }

  showToast("Tek dosya paylaşım linki hazır", "success");
}

function clearSimpleShareSelection() {
  selectedFileShareLink = "";

  if (fileShareLinkInput) {
    fileShareLinkInput.value = "";
  }

  if (copyFileShareBtn) {
    copyFileShareBtn.disabled = true;
  }

  if (simpleShareHint) {
    simpleShareHint.textContent = "Listeden bir dosyada “Paylaş” butonuna basın.";
  }
}

function buildSingleFileShareLink(fileName) {
  const ownerEmail = currentUser?.email || sharedOwner;
  if (!ownerEmail || !fileName) return "";

  const params = new URLSearchParams();
  params.set("share", ownerEmail);
  params.set("file", fileName);

  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

async function uploadFiles(files) {
  uploadProgress.style.display = "block";
  progressBar.style.width = "0%";
  progressText.textContent = "Yükleniyor: 0%";

  const formData = new FormData();
  for (let i = 0; i < files.length; i += 1) {
    formData.append("files[]", files[i]);
  }
  formData.append("owner", currentUser.email);

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (progressEvent) => {
      if (!progressEvent.lengthComputable) return;

      const percent = (progressEvent.loaded / progressEvent.total) * 100;
      progressBar.style.width = `${percent}%`;
      progressText.textContent = `Yükleniyor: ${Math.round(percent)}%`;
    });

    xhr.addEventListener("load", () => {
      let response = {};
      try {
        response = JSON.parse(xhr.responseText || "{}");
      } catch (error) {
        response = {};
      }

      if (xhr.status === 200) {
        if (Array.isArray(response.uploadedFiles) && response.uploadedFiles.length > 0) {
          response.uploadedFiles.forEach((file) => {
            showToast(`Yüklendi: ${file.name}`, "success");
          });
        }

        if (Array.isArray(response.errors) && response.errors.length > 0) {
          response.errors.forEach((errorText) => {
            showToast(`Hata: ${errorText}`, "error");
          });
        }

        setTimeout(() => {
          uploadProgress.style.display = "none";
          progressBar.style.width = "0%";
          progressText.textContent = "Yükleniyor...";
          uploadForm.reset();
          loadFiles();
        }, 450);
      } else {
        showToast(response.error || "Yükleme başarısız", "error");
        uploadProgress.style.display = "none";
      }
    });

    xhr.addEventListener("error", () => {
      showToast("Yükleme sırasında ağ hatası oluştu", "error");
      uploadProgress.style.display = "none";
    });

    const uploadUrl = `${ensureApiBase("[upload]")}?action=upload`;
    xhr.open("POST", uploadUrl);
    xhr.send(formData);
  } catch (error) {
    showToast(`Beklenmeyen hata: ${error.message}`, "error");
    uploadProgress.style.display = "none";
  }
}

async function loadFiles(showRefreshToast = false) {
  try {
    if (showRefreshToast) {
      showToast("Dosyalar yenileniyor...", "info");
    }

    filesList.innerHTML = '<p class="no-files">Dosyalar yükleniyor...</p>';

    let url = `${ensureApiBase("[loadFiles]")}?action=files`;

    if (currentUser?.email) {
      url += `&owner=${encodeURIComponent(currentUser.email)}`;
    } else if (sharedOwner) {
      url += `&owner=${encodeURIComponent(sharedOwner)}`;
    } else if (currentToken) {
      url += `&token=${encodeURIComponent(currentToken)}`;
    }

    if (sharedFile) {
      url += `&file=${encodeURIComponent(sharedFile)}`;
    }

    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      allFiles = [];
      filteredFiles = [];
      populateTypeFilter([]);
      applyFiltersAndRender();
      return;
    }

    const files = await response.json();
    allFiles = Array.isArray(files) ? files.map(normalizeFile).filter((file) => file.name) : [];

    populateTypeFilter(allFiles);
    applyFiltersAndRender();
  } catch (error) {
    console.error("Dosyalar yüklenemedi:", error);
    allFiles = [];
    filteredFiles = [];
    populateTypeFilter([]);
    applyFiltersAndRender();
    showToast("Dosyalar yüklenemedi", "error");
  }
}

function normalizeFile(file) {
  const safeName = String(file?.name || "").trim();
  const safeDate = String(file?.date || "");
  const safeSizeBytes = Number(file?.sizeBytes) || parseSizeText(file?.size);
  const safeSize = file?.size || formatBytes(safeSizeBytes);
  const downloadPath = buildDownloadPath(file?.path);

  return {
    name: safeName,
    date: safeDate,
    size: safeSize,
    sizeBytes: safeSizeBytes,
    timestamp: parseDateToTimestamp(safeDate),
    extension: getFileExtension(safeName),
    category: getFileCategory(safeName),
    downloadPath,
    previewPath: buildPreviewPath(safeName)
  };
}

function buildDownloadPath(path) {
  const rawPath = String(path || "").trim();
  if (!rawPath) return "#";
  return rawPath.startsWith("/") ? `.${rawPath}` : rawPath;
}

function buildPreviewPath(fileName) {
  if (!fileName) return "#";

  let url = `${ensureApiBase("[preview]")}?action=preview&file=${encodeURIComponent(fileName)}`;

  if (currentUser?.email) {
    url += `&owner=${encodeURIComponent(currentUser.email)}`;
  } else if (sharedOwner) {
    url += `&owner=${encodeURIComponent(sharedOwner)}`;
  } else if (currentToken) {
    url += `&token=${encodeURIComponent(currentToken)}`;
  }

  return url;
}

function populateTypeFilter(files) {
  if (!typeFilter) return;

  const previousValue = typeFilter.value || "all";

  const categoryOrder = ["image", "video", "audio", "document", "archive", "code", "other"];
  const categoryCounts = files.reduce((acc, file) => {
    const key = file.category || "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const options = [`<option value="all">Tüm türler (${files.length})</option>`];

  categoryOrder.forEach((category) => {
    if (!categoryCounts[category]) return;
    options.push(`<option value="${category}">${getCategoryLabel(category)} (${categoryCounts[category]})</option>`);
  });

  typeFilter.innerHTML = options.join("");

  if (previousValue === "all" || categoryCounts[previousValue]) {
    typeFilter.value = previousValue;
  } else {
    typeFilter.value = "all";
  }
}

function applyFiltersAndRender() {
  const searchTerm = sharedFile ? "" : (searchInput?.value || "").trim().toLowerCase();
  const selectedType = sharedFile ? "all" : typeFilter?.value || "all";
  const favoritesOnly = sharedFile ? false : favoritesFilter?.value === "favorites";
  const sortMode = sortSelect?.value || "newest";

  let filtered = allFiles.filter((file) => {
    if (sharedFile && file.name !== sharedFile) {
      return false;
    }

    if (selectedType !== "all" && file.category !== selectedType) {
      return false;
    }

    if (favoritesOnly && !isFavorite(file.name)) {
      return false;
    }

    if (!searchTerm) {
      return true;
    }

    const haystack = `${file.name} ${file.extension} ${file.date}`.toLowerCase();
    return haystack.includes(searchTerm);
  });

  filtered = sortFiles(filtered, sortMode);
  filteredFiles = filtered;
  renderFiles(filtered);
  updateStats(filtered);
}

function sortFiles(files, mode) {
  const copy = [...files];

  switch (mode) {
    case "oldest":
      copy.sort((a, b) => a.timestamp - b.timestamp);
      break;
    case "name-asc":
      copy.sort((a, b) => a.name.localeCompare(b.name, "tr", { sensitivity: "base" }));
      break;
    case "name-desc":
      copy.sort((a, b) => b.name.localeCompare(a.name, "tr", { sensitivity: "base" }));
      break;
    case "size-desc":
      copy.sort((a, b) => b.sizeBytes - a.sizeBytes);
      break;
    case "size-asc":
      copy.sort((a, b) => a.sizeBytes - b.sizeBytes);
      break;
    case "newest":
    default:
      copy.sort((a, b) => b.timestamp - a.timestamp);
      break;
  }

  return copy;
}

function renderFiles(files) {
  if (!filesList) return;

  applyViewMode();

  if (!Array.isArray(files) || files.length === 0) {
    const message = sharedFile
      ? "Paylaşılan dosya bulunamadı"
      : allFiles.length === 0
        ? "Hiçbir dosya yok"
        : "Filtreye uygun dosya bulunamadı";
    filesList.innerHTML = `<p class="no-files">${message}</p>`;
    return;
  }

  filesList.innerHTML = files
    .map((file) => {
      const safeName = escapeHtml(file.name);
      const safeDate = escapeHtml(file.date || "-");
      const safeSize = escapeHtml(file.size || "-");
      const safePath = escapeAttribute(file.downloadPath);
      const encodedFileName = encodeURIComponent(file.name);
      const encodedPath = encodeURIComponent(file.downloadPath);
      const previewLabel = canPreviewFile(file) ? "Önizle" : "Aç";
      const favoriteActive = isFavorite(file.name);

      return `
      <article class="file-item">
        <div class="file-info">
          <div class="file-icon">${getFileIcon(file.name)}</div>
          <div class="file-details">
            <div class="file-name" title="${safeName}">${safeName}</div>
            <div class="file-meta">
              <span>${safeSize}</span>
              <span>${safeDate}</span>
              <span class="file-tag">${getCategoryLabel(file.category)}</span>
            </div>
          </div>
        </div>
        <div class="file-actions">
          <button type="button" class="btn btn-secondary" data-action="preview" data-file="${encodedFileName}">${previewLabel}</button>
          <a href="${safePath}" download class="btn btn-download">İndir</a>
          ${currentUser ? `<button type="button" class="btn btn-secondary" data-action="share-file" data-file="${encodedFileName}">Paylaş</button>` : ""}
          <button type="button" class="btn btn-secondary" data-action="copy" data-path="${encodedPath}">Link</button>
          <button type="button" class="btn btn-favorite ${favoriteActive ? "is-active" : ""}" data-action="favorite" data-file="${encodedFileName}" title="Favori">★</button>
          ${currentUser ? `<button type="button" class="btn btn-danger" data-action="delete" data-file="${encodedFileName}">Sil</button>` : ""}
        </div>
      </article>
    `;
    })
    .join("");
}

function updateStats(visibleFiles) {
  const totalCount = allFiles.length;
  const visibleCount = Array.isArray(visibleFiles) ? visibleFiles.length : 0;
  const totalSize = allFiles.reduce((sum, file) => sum + (file.sizeBytes || 0), 0);
  const visibleSize = Array.isArray(visibleFiles)
    ? visibleFiles.reduce((sum, file) => sum + (file.sizeBytes || 0), 0)
    : 0;
  const favoriteCount = allFiles.filter((file) => isFavorite(file.name)).length;

  if (fileCount) {
    fileCount.textContent = `Toplam: ${totalCount} dosya`;
  }

  if (visibleCountEl) {
    visibleCountEl.textContent = `Görünen: ${visibleCount} dosya`;
  }

  if (totalSizeEl) {
    if (visibleCount !== totalCount) {
      totalSizeEl.textContent = `Boyut: ${formatBytes(visibleSize)} / ${formatBytes(totalSize)}`;
    } else {
      totalSizeEl.textContent = `Toplam boyut: ${formatBytes(totalSize)}`;
    }
  }

  if (favoriteCountEl) {
    favoriteCountEl.textContent = `Favori: ${favoriteCount}`;
  }
}

async function deleteFile(filename) {
  if (!currentUser?.email) {
    showToast("Silme işlemi için giriş gerekli", "error");
    return;
  }

  if (!confirm(`\"${filename}\" dosyasını silmek istediğinizden emin misiniz?`)) {
    return;
  }

  try {
    const apiBase = ensureApiBase("[delete]");
    const deleteUrl = `${apiBase}?action=delete&file=${encodeURIComponent(filename)}&owner=${encodeURIComponent(currentUser.email)}`;

    const response = await fetch(deleteUrl, { method: "DELETE" });
    const data = await response.json();

    if (response.ok) {
      if (favoriteFiles.has(filename)) {
        favoriteFiles.delete(filename);
        saveFavorites();
      }
      showToast("Dosya silindi", "success");
      loadFiles();
      return;
    }

    showToast(data.error || "Dosya silinemedi", "error");
  } catch (error) {
    showToast("Silme sırasında hata oluştu", "error");
  }
}

function canPreviewFile(file) {
  const ext = file.extension;
  const previewableExtensions = [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "svg",
    "avif",
    "bmp",
    "mp4",
    "mov",
    "webm",
    "avi",
    "mkv",
    "mp3",
    "wav",
    "flac",
    "aac",
    "ogg",
    "m4a",
    "pdf",
    "txt",
    "md",
    "json",
    "csv",
    "js",
    "css",
    "html",
    "xml",
    "log"
  ];

  return previewableExtensions.includes(ext);
}

async function openPreview(file) {
  if (!file || !file.previewPath) return;

  if (!previewModal || !previewContent || !previewTitle) {
    window.open(toAbsoluteUrl(file.downloadPath), "_blank", "noopener");
    return;
  }

  previewTitle.textContent = file.name;
  previewContent.innerHTML = '<p class="preview-loading">Önizleme hazırlanıyor...</p>';
  previewModal.classList.add("show");
  previewModal.setAttribute("aria-hidden", "false");

  const ext = file.extension;
  const previewUrl = file.previewPath;

  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"].includes(ext)) {
    previewContent.innerHTML = `<img src="${escapeAttribute(previewUrl)}" alt="${escapeAttribute(file.name)}" class="preview-image">`;
    return;
  }

  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) {
    previewContent.innerHTML = `<video class="preview-video" controls preload="metadata" src="${escapeAttribute(previewUrl)}"></video>`;
    return;
  }

  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) {
    previewContent.innerHTML = `<audio class="preview-audio" controls preload="metadata" src="${escapeAttribute(previewUrl)}"></audio>`;
    return;
  }

  if (ext === "pdf") {
    previewContent.innerHTML = `<iframe class="preview-frame" src="${escapeAttribute(previewUrl)}" title="${escapeAttribute(file.name)}"></iframe>`;
    return;
  }

  if (["txt", "md", "json", "csv", "js", "css", "html", "xml", "log"].includes(ext)) {
    try {
      const response = await fetch(previewUrl, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const text = await response.text();
      const limitedText = text.length > 18000 ? `${text.slice(0, 18000)}\n\n... (devamı kesildi)` : text;
      previewContent.innerHTML = `<pre class="preview-text">${escapeHtml(limitedText)}</pre>`;
      return;
    } catch (error) {
      previewContent.innerHTML =
        '<p class="preview-error">Dosya metin olarak önizlenemedi. İndirme veya yeni sekmede açmayı deneyin.</p>';
      return;
    }
  }

  previewContent.innerHTML =
    `<p class="preview-error">Bu dosya türü için önizleme desteklenmiyor.</p>
     <a class="btn btn-download" href="${escapeAttribute(file.downloadPath)}" target="_blank" rel="noopener">Yeni sekmede aç</a>`;
}

function closePreview() {
  if (!previewModal || !previewContent) return;

  previewModal.classList.remove("show");
  previewModal.setAttribute("aria-hidden", "true");
  previewContent.innerHTML = "";
}

function getFileIcon(filename) {
  const ext = getFileExtension(filename);

  const iconMap = {
    jpg: "🖼",
    jpeg: "🖼",
    png: "🖼",
    gif: "🖼",
    webp: "🖼",
    svg: "🖼",
    avif: "🖼",
    mp4: "🎬",
    avi: "🎬",
    mkv: "🎬",
    mov: "🎬",
    webm: "🎬",
    mp3: "🎵",
    wav: "🎵",
    flac: "🎵",
    aac: "🎵",
    pdf: "📄",
    doc: "📝",
    docx: "📝",
    txt: "📝",
    xlsx: "📊",
    xls: "📊",
    csv: "📊",
    ppt: "📌",
    pptx: "📌",
    html: "💻",
    css: "💻",
    js: "💻",
    json: "💻",
    ts: "💻",
    php: "💻",
    sql: "💻",
    zip: "📦",
    rar: "📦",
    "7z": "📦",
    tar: "📦",
    gz: "📦"
  };

  return iconMap[ext] || "📁";
}

function getFileCategory(filename) {
  const ext = getFileExtension(filename);

  const imageExtensions = ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "bmp"];
  const videoExtensions = ["mp4", "avi", "mkv", "mov", "webm", "mpeg", "wmv"];
  const audioExtensions = ["mp3", "wav", "flac", "aac", "ogg", "m4a"];
  const documentExtensions = ["pdf", "doc", "docx", "txt", "xlsx", "xls", "csv", "ppt", "pptx", "odt"];
  const archiveExtensions = ["zip", "rar", "7z", "tar", "gz"];
  const codeExtensions = ["html", "css", "js", "json", "ts", "tsx", "jsx", "php", "py", "java", "sql", "c", "cpp"];

  if (imageExtensions.includes(ext)) return "image";
  if (videoExtensions.includes(ext)) return "video";
  if (audioExtensions.includes(ext)) return "audio";
  if (documentExtensions.includes(ext)) return "document";
  if (archiveExtensions.includes(ext)) return "archive";
  if (codeExtensions.includes(ext)) return "code";

  return "other";
}

function getCategoryLabel(category) {
  const labels = {
    image: "Görsel",
    video: "Video",
    audio: "Ses",
    document: "Belge",
    archive: "Arşiv",
    code: "Kod",
    other: "Diğer"
  };

  return labels[category] || labels.other;
}

function getFileExtension(filename) {
  const safeName = String(filename || "");
  const split = safeName.split(".");
  if (split.length < 2) return "";
  return split.pop().toLowerCase();
}

function parseDateToTimestamp(dateText) {
  if (!dateText) return 0;

  const match = String(dateText).match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return 0;

  const [, day, month, year, hour, minute, second] = match;
  const parsed = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function parseSizeText(value) {
  if (!value || typeof value !== "string") return 0;

  const match = value.trim().match(/^([\d.,]+)\s*(bytes|kb|mb|gb|tb)$/i);
  if (!match) return 0;

  const amount = Number.parseFloat(match[1].replace(",", "."));
  if (Number.isNaN(amount)) return 0;

  const unit = match[2].toLowerCase();
  const multipliers = {
    bytes: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4
  };

  return Math.round(amount * (multipliers[unit] || 1));
}

function formatBytes(bytes) {
  const size = Number(bytes) || 0;
  if (size <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** unitIndex;
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);

  return `${rounded} ${units[unitIndex]}`;
}

function toAbsoluteUrl(path) {
  return new URL(path, window.location.href).href;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

async function copyToClipboard(text, successMessage) {
  if (!text) {
    showToast("Kopyalanacak içerik bulunamadı", "warn");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, "success");
  } catch (error) {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.style.position = "fixed";
    helper.style.top = "-9999px";
    document.body.appendChild(helper);
    helper.focus();
    helper.select();

    try {
      document.execCommand("copy");
      showToast(successMessage, "success");
    } catch (fallbackError) {
      showToast("Kopyalama başarısız", "error");
    } finally {
      helper.remove();
    }
  }
}

function showToast(message, type = "info") {
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast show ${type}`;

  window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}
