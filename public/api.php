<?php
// CORS ve Headers
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Upload dizini
$uploadDir = __DIR__ . '/../uploads/';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

// Kullanıcı email'ini normalize et
function getOwnerDir($owner) {
    if (!$owner) return __DIR__ . '/../uploads/public/';
    
    $safe = preg_replace('/[^a-zA-Z0-9._-]/', '_', $owner);
    $dir = __DIR__ . '/../uploads/' . $safe . '/';
    
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return $dir;
}

// Action belirleme
$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];
$owner = $_GET['owner'] ?? $_POST['owner'] ?? '';
$token = $_GET['token'] ?? '';
$singleFile = $_GET['file'] ?? '';

// GET - Dosyaları listele
if ($method === 'GET' && $action === 'files') {
    $uploadDir = getOwnerDir($owner);
    $files = array_diff(scandir($uploadDir), array('..', '.'));
    $fileList = [];
    $singleFileSafe = $singleFile ? basename($singleFile) : '';
    
    foreach ($files as $file) {
        if ($singleFileSafe && $file !== $singleFileSafe) {
            continue;
        }

        $filePath = $uploadDir . $file;
        if (is_file($filePath)) {
            $fileList[] = [
                'name' => $file,
                'size' => formatFileSize(filesize($filePath)),
                'sizeBytes' => filesize($filePath),
                'date' => date('d.m.Y H:i:s', filemtime($filePath)),
                'path' => '/api.php?action=download&file=' . rawurlencode($file) . ($owner ? '&owner=' . rawurlencode($owner) : '')
            ];
        }
    }
    
    echo json_encode($fileList);
    exit;
}

// POST - Dosya yükle
if ($method === 'POST' && $action === 'upload') {
    if (!$owner) {
        http_response_code(400);
        echo json_encode(['error' => 'Owner bilgisi gerekli']);
        exit;
    }

    if (!isset($_FILES['files'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Dosya seçilmedi']);
        exit;
    }
    
    $uploadDir = getOwnerDir($owner);
    $files = $_FILES['files'];
    $uploadedFiles = [];
    $errors = [];
    
    $isMultiple = is_array($files['name']);
    
    for ($i = 0; $i < ($isMultiple ? count($files['name']) : 1); $i++) {
        $name = $isMultiple ? $files['name'][$i] : $files['name'];
        $tmp = $isMultiple ? $files['tmp_name'][$i] : $files['tmp_name'];
        $error = $isMultiple ? $files['error'][$i] : $files['error'];
        $size = $isMultiple ? $files['size'][$i] : $files['size'];
        
        if ($error !== UPLOAD_ERR_OK) {
            $errors[] = "Hata ($name): " . getErrorMessage($error);
            continue;
        }
        
        if ($size > 500 * 1024 * 1024) {
            $errors[] = "$name dosyası çok büyük (Max: 500MB)";
            continue;
        }
        
        $safeName = sanitizeFileName($name);
        $targetPath = $uploadDir . $safeName;
        
        if (file_exists($targetPath)) {
            $pathInfo = pathinfo($safeName);
            $counter = 1;
            do {
                $safeName = $pathInfo['filename'] . '_' . $counter . '.' . $pathInfo['extension'];
                $targetPath = $uploadDir . $safeName;
                $counter++;
            } while (file_exists($targetPath));
        }
        
        if (move_uploaded_file($tmp, $targetPath)) {
            $uploadedFiles[] = [
                'name' => $safeName,
                'size' => formatFileSize(filesize($targetPath))
            ];
        } else {
            $errors[] = "Dosya taşınamadı: $name";
        }
    }
    
    http_response_code(200);
    echo json_encode([
        'uploadedFiles' => $uploadedFiles,
        'errors' => $errors,
        'message' => 'İşlem tamamlandı'
    ]);
    exit;
}

// DELETE - Dosya sil
if ($method === 'DELETE' && $action === 'delete') {
    if (!$owner) {
        http_response_code(400);
        echo json_encode(['error' => 'Owner bilgisi gerekli']);
        exit;
    }

    $filename = $_GET['file'] ?? '';
    
    if (!$filename) {
        http_response_code(400);
        echo json_encode(['error' => 'Dosya adı belirtilmedi']);
        exit;
    }
    
    $uploadDir = getOwnerDir($owner);
    $filePath = $uploadDir . basename($filename);
    
    // Güvenlik kontrolü
    if (realpath($filePath) === false || strpos(realpath($filePath), realpath($uploadDir)) !== 0) {
        http_response_code(403);
        echo json_encode(['error' => 'Erişim reddedildi']);
        exit;
    }
    
    if (!file_exists($filePath)) {
        http_response_code(404);
        echo json_encode(['error' => 'Dosya bulunamadı']);
        exit;
    }
    
    if (unlink($filePath)) {
        echo json_encode(['message' => 'Dosya silindi', 'file' => $filename]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Dosya silinemedi']);
    }
    exit;
}

// GET - Dosya indir
if ($method === 'GET' && $action === 'download') {
    $filename = $_GET['file'] ?? '';
    
    if (!$filename) {
        http_response_code(400);
        echo json_encode(['error' => 'Dosya adı belirtilmedi']);
        exit;
    }
    
    $uploadDir = getOwnerDir($owner);
    $filePath = $uploadDir . basename($filename);
    
    // Güvenlik kontrolü
    if (realpath($filePath) === false || strpos(realpath($filePath), realpath($uploadDir)) !== 0) {
        http_response_code(403);
        echo json_encode(['error' => 'Erişim reddedildi']);
        exit;
    }
    
    if (!file_exists($filePath)) {
        http_response_code(404);
        echo json_encode(['error' => 'Dosya bulunamadı']);
        exit;
    }
    
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="' . basename($filePath) . '"');
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
    exit;
}

// GET - Dosya onizle (inline)
if ($method === 'GET' && $action === 'preview') {
    $filename = $_GET['file'] ?? '';
    
    if (!$filename) {
        http_response_code(400);
        echo json_encode(['error' => 'Dosya adÄ± belirtilmedi']);
        exit;
    }
    
    $uploadDir = getOwnerDir($owner);
    $filePath = $uploadDir . basename($filename);
    
    // GÃ¼venlik kontrolÃ¼
    if (realpath($filePath) === false || strpos(realpath($filePath), realpath($uploadDir)) !== 0) {
        http_response_code(403);
        echo json_encode(['error' => 'EriÅŸim reddedildi']);
        exit;
    }
    
    if (!file_exists($filePath)) {
        http_response_code(404);
        echo json_encode(['error' => 'Dosya bulunamadÄ±']);
        exit;
    }

    $mime = detectMimeType($filePath);
    header('Content-Type: ' . $mime);
    header('Content-Disposition: inline; filename="' . basename($filePath) . '"');
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
    exit;
}

// Hata
http_response_code(400);
echo json_encode(['error' => 'Geçersiz istek']);

// Yardımcı Fonksiyonlar
function formatFileSize($bytes) {
    if ($bytes === 0) return '0 Bytes';
    $k = 1024;
    $sizes = ['Bytes', 'KB', 'MB', 'GB'];
    $i = floor(log($bytes, $k));
    return round($bytes / pow($k, $i), 2) . ' ' . $sizes[$i];
}

function sanitizeFileName($filename) {
    $filename = basename($filename);
    $filename = preg_replace('/[^a-zA-Z0-9._-]/', '_', $filename);
    $filename = preg_replace('/_{2,}/', '_', $filename);
    return $filename;
}

function getErrorMessage($code) {
    switch ($code) {
        case UPLOAD_ERR_INI_SIZE:
            return 'Dosya php.ini limiti aşıyor';
        case UPLOAD_ERR_FORM_SIZE:
            return 'Dosya form limiti aşıyor';
        case UPLOAD_ERR_PARTIAL:
            return 'Dosya kısmen yüklendi';
        case UPLOAD_ERR_NO_FILE:
            return 'Dosya seçilmedi';
        case UPLOAD_ERR_NO_TMP_DIR:
            return 'Geçici klasör eksik';
        case UPLOAD_ERR_CANT_WRITE:
            return 'Diske yazılamadı';
        case UPLOAD_ERR_EXTENSION:
            return 'Dosya türü engellendi';
        default:
            return 'Bilinmeyen hata';
    }
}

function detectMimeType($filePath) {
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $mime = finfo_file($finfo, $filePath);
            finfo_close($finfo);
            if ($mime) {
                return $mime;
            }
        }
    }
    
    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $map = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'avif' => 'image/avif',
        'mp4' => 'video/mp4',
        'webm' => 'video/webm',
        'mov' => 'video/quicktime',
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'flac' => 'audio/flac',
        'aac' => 'audio/aac',
        'ogg' => 'audio/ogg',
        'pdf' => 'application/pdf',
        'txt' => 'text/plain; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'csv' => 'text/csv; charset=utf-8',
        'html' => 'text/html; charset=utf-8',
        'css' => 'text/css; charset=utf-8',
        'js' => 'application/javascript; charset=utf-8'
    ];
    
    return $map[$ext] ?? 'application/octet-stream';
}
?>
