<?php
/**
 * Image Upload API
 * POST /api/upload-image.php
 *
 * Expects:
 *   - Header: Authorization: Bearer <idToken>   (same as profile-update.php)
 *   - File:   $_FILES['image']
 *
 * Returns JSON:
 *   { "success": true, "url": "uploads/events/xxxx.jpg", "message": "Image uploaded successfully" }
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Firebase-UID, Authorization');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Fallback for getallheaders if missing
if (!function_exists('getallheaders')) {
    function getallheaders(): array {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (str_starts_with($name, 'HTTP_')) {
                $key = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$key] = $value;
            }
        }
        return $headers;
    }
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        exit;
    }

    // ---------- AUTH (same style as profile-update.php) ----------
    $headers = getallheaders();
    $normalizedHeaders = [];
    foreach ($headers as $key => $value) {
        $normalizedHeaders[strtolower($key)] = $value;
    }

    $firebaseUid = $normalizedHeaders['x-firebase-uid'] ?? null;

    if (!$firebaseUid && isset($normalizedHeaders['authorization'])) {
        $firebaseUser = verifyFirebaseTokenFromHeader($normalizedHeaders['authorization']);
        $firebaseUid = $firebaseUser['localId'] ?? null;
    }

    if (!$firebaseUid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Missing authentication']);
        exit;
    }

    // ---------- DB + ROLE CHECK ----------
    /** @var PDO $db */
    $db = require __DIR__ . '/db.php';

    $stmt = $db->prepare('SELECT id, role FROM users WHERE firebase_uid = :uid');
    $stmt->execute([':uid' => $firebaseUid]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }

    if (!in_array($user['role'], ['admin', 'owner'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Not authorized to upload images']);
        exit;
    }

    // ---------- FILE VALIDATION ----------
    if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No image uploaded or upload error']);
        exit;
    }

    $file = $_FILES['image'];

    // Max ~2MB
    if ($file['size'] > 2 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'File too large (max 2MB)']);
        exit;
    }

    // Detect mime type
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($file['tmp_name']);

    $allowed = [
        'image/jpeg' => 'jpg',
        'image/png'  => 'png',
        'image/webp' => 'webp',
    ];

    if (!isset($allowed[$mime])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid image type']);
        exit;
    }

    $ext = $allowed[$mime];

    // ---------- UPLOAD DIRECTORY ----------
    $uploadDir = __DIR__ . '/../uploads/events';
    if (!is_dir($uploadDir)) {
        if (!mkdir($uploadDir, 0775, true) && !is_dir($uploadDir)) {
            throw new Exception('Failed to create upload directory');
        }
    }

    // Unique filename
    $basename = bin2hex(random_bytes(8));
    $filename = $basename . '.' . $ext;
    $target   = $uploadDir . '/' . $filename;

    if (!move_uploaded_file($file['tmp_name'], $target)) {
        throw new Exception('Failed to move uploaded file');
    }

    // URL used by frontend (relative to web-proj root)
    // If your project is served as http://localhost/web-proj/,
    // then "uploads/events/filename.jpg" works in <img src="...">
    $url = 'uploads/events/' . $filename;

    echo json_encode([
        'success' => true,
        'url'     => $url,
        'message' => 'Image uploaded successfully',
    ]);
} catch (Exception $e) {
    error_log('Image upload error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error during upload']);
    exit;
}

/**
 * Verify Firebase ID token from Authorization header.
 * This is the SAME logic style you already have in profile-update.php.
 * We return the decoded Firebase user array (or null on error).
 */
function verifyFirebaseTokenFromHeader(string $authHeader): ?array
{
    if (!preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        return null;
    }

    $idToken = $matches[1];

    // Same API key pattern as your profile-update.php
    $apiKey = getenv('FIREBASE_API_KEY') ?: 'AIzaSyAfWmO5Ye-ILmVcWbwN4cVOuP3_e-8ckD8';
    $url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" . $apiKey;

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['idToken' => $idToken]));
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    if ($response === false) {
        curl_close($ch);
        return null;
    }

    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        return null;
    }

    $data = json_decode($response, true);
    if (!is_array($data)) {
        return null;
    }

    return $data['users'][0] ?? null;
}
