// Biroor Authentication Check
const BIROOR_AUTH_KEY = "biroor_auth_user_v2";
const user = localStorage.getItem(BIROOR_AUTH_KEY);
if (user) {
  // Eğer Biroor'dan geldiyse, share.html'ye yönlendir
  window.location.href = 'share.html';
}

// DOM Elements
const dragDropArea = document.getElementById('dragDropArea');
const fileInput = document.getElementById('fileInput');
const filesList = document.getElementById('filesList');
const uploadProgress = document.getElementById('uploadProgress');
const progressBar = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const fileCount = document.getElementById('fileCount');
const toast = document.getElementById('toast');
const uploadForm = document.getElementById('uploadForm');

// Note: API_BASE is set globally by config.js, accessible as window.API_BASE

// Events
dragDropArea.addEventListener('click', () => fileInput.click());
dragDropArea.addEventListener('dragover', handleDragOver);
dragDropArea.addEventListener('dragleave', handleDragLeave);
dragDropArea.addEventListener('drop', handleDrop);
fileInput.addEventListener('change', handleFileSelect);

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  dragDropArea.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  dragDropArea.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  dragDropArea.classList.remove('drag-over');
  
  const files = e.dataTransfer.files;
  handleFileSelect({ target: { files } });
}

function handleFileSelect(e) {
  const files = e.target.files;
  if (files.length === 0) return;

  uploadFiles(files);
}

async function uploadFiles(files) {
  uploadProgress.style.display = 'block';
  
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files[]', files[i]);
  }

  try {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        progressBar.style.width = percentComplete + '%';
        progressText.textContent = `Yükleniyor: ${Math.round(percentComplete)}%`;
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        
        if (response.uploadedFiles && response.uploadedFiles.length > 0) {
          response.uploadedFiles.forEach(file => {
            showToast(`✓ ${file.name} başarıyla yüklendi`, 'success');
          });
        }
        
        if (response.errors && response.errors.length > 0) {
          response.errors.forEach(error => {
            showToast(`✗ ${error}`, 'error');
          });
        }
        
        setTimeout(() => {
          uploadProgress.style.display = 'none';
          progressBar.style.width = '0%';
          uploadForm.reset();
          loadFiles();
        }, 500);
      } else {
        showToast('Yükleme başarısız', 'error');
      }
    });

    xhr.addEventListener('error', () => {
      showToast('Yükleme hatası', 'error');
      uploadProgress.style.display = 'none';
    });

    xhr.open('POST', `${window.API_BASE || '/archive/api.php'}?action=upload`);
    xhr.send(formData);

  } catch (error) {
    showToast(`Hata: ${error.message}`, 'error');
  }
}

async function loadFiles() {
  try {
    const apiBase = window.API_BASE || '/archive/api.php';
    const response = await fetch(`${apiBase}?action=files`);
    const files = await response.json();

    if (!Array.isArray(files) || files.length === 0) {
      filesList.innerHTML = '<p class="no-files">Hiçbir dosya yok</p>';
      fileCount.textContent = 'Toplam: 0 dosya';
      return;
    }

    fileCount.textContent = `Toplam: ${files.length} dosya`;
    filesList.innerHTML = files.map(file => {
      // Convert absolute paths to relative
      const downloadPath = file.path.startsWith('/') ? '.' + file.path : file.path;
      return `
      <div class="file-item">
        <div class="file-info">
          <div class="file-icon">${getFileIcon(file.name)}</div>
          <div class="file-details">
            <div class="file-name" title="${file.name}">${file.name}</div>
            <div class="file-meta">
              <span>${file.size}</span>
              <span>${file.date}</span>
            </div>
          </div>
        </div>
        <div class="file-actions">
          <a href="${downloadPath}" download class="btn btn-download">⬇ İndir</a>
          <button onclick="deleteFile('${file.name}')" class="btn btn-danger">🗑 Sil</button>
        </div>
      </div>
    `;
    }).join('');

  } catch (error) {
    console.error('Dosyalar yüklenirken hata:', error);
    showToast('Dosyalar yüklenemedi', 'error');
  }
}

async function deleteFile(filename) {
  if (!confirm(`"${filename}" dosyasını silmek istediğinizden emin misiniz?`)) {
    return;
  }

  try {
    const response = await fetch(`${window.API_BASE || '/archive/api.php'}?action=delete&file=${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok) {
      showToast(`✓ Dosya silindi`, 'success');
      loadFiles();
    } else {
      showToast(data.error || 'Dosya silinemedi', 'error');
    }
  } catch (error) {
    showToast('Silme işleminde hata oluştu', 'error');
  }
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  
  const iconMap = {
    // Resimler
    'jpg': '🖼',
    'jpeg': '🖼',
    'png': '🖼',
    'gif': '🖼',
    'webp': '🖼',
    'svg': '🖼',
    
    // Videolar
    'mp4': '🎬',
    'avi': '🎬',
    'mkv': '🎬',
    'mov': '🎬',
    'webm': '🎬',
    
    // Sesler
    'mp3': '🎵',
    'wav': '🎵',
    'flac': '🎵',
    'aac': '🎵',
    
    // Belgeler
    'pdf': '📄',
    'doc': '📝',
    'docx': '📝',
    'txt': '📝',
    'xlsx': '📊',
    'xls': '📊',
    'csv': '📊',
    'ppt': '🎯',
    'pptx': '🎯',
    
    // Kod
    'html': '🌐',
    'css': '🎨',
    'js': '📜',
    'json': '📋',
    'python': '🐍',
    'java': '☕',
    'cpp': '⚙',
    'c': '⚙',
    'php': '🐘',
    'sql': '🗄',
    
    // Sıkıştırılmış
    'zip': '📦',
    'rar': '📦',
    '7z': '📦',
    'tar': '📦',
  };
  
  return iconMap[ext] || '📁';
}

function showToast(message, type = 'info') {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// İlk yüklemede dosyaları getir
loadFiles();

// Sayfa focus olduğunda dosyaları yenile
window.addEventListener('focus', () => {
  loadFiles();
});
