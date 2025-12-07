<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Firebase-UID, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

/**
 * getallheaders() is not available on all SAPIs (e.g. some FastCGI setups).
 * Provide a fallback to ensure header access is reliable.
 */
if (!function_exists('getallheaders')) {
    function getallheaders(): array {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) === 'HTTP_') {
                $headerName = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$headerName] = $value;
            }
        }
        // Content-Type and Authorization may not appear prefixed with HTTP_
        if (isset($_SERVER['CONTENT_TYPE'])) $headers['Content-Type'] = $_SERVER['CONTENT_TYPE'];
        if (isset($_SERVER['Authorization'])) $headers['Authorization'] = $_SERVER['Authorization'];
        return $headers;
    }
}

$headers = getallheaders();

// Normalize header keys to make lookups case-insensitive
$normalized = [];
foreach ($headers as $k => $v) {
    $normalized[strtolower($k)] = $v;
}

// Try X-Firebase-UID header first (used by index/event pages)
$firebaseUid = $normalized['x-firebase-uid'] ?? '';

// If no X-Firebase-UID, try Bearer token (used during signup/login)
if (!$firebaseUid) {
    $authHeader = $normalized['authorization'] ?? '';

    if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $idToken = $matches[1];
        $firebaseUser = verifyFirebaseToken($idToken);

        if ($firebaseUser) {
            // accounts:lookup returns 'localId' for the user UID
            $firebaseUid = $firebaseUser['localId'] ?? '';
        }
    }
}

if (!$firebaseUid) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Not authenticated']);
    exit;
}

try {
    // fixed: remove stray space in filename
    $db = require __DIR__ . '/db.php';

    ensureProfileColumns($db);

    $stmt = $db->prepare('SELECT id, name, email, age, phone, location, bio, role, joined_at FROM users WHERE firebase_uid = :uid');
    $stmt->execute([':uid' => $firebaseUid]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found in database']);
        exit;
    }

    echo json_encode(['success' => true, 'user' => $user]);
} catch (Exception $e) {
    http_response_code(500);
    // Avoid leaking stack traces in production; consider logging $e->getMessage()
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

/**
 * Ensure optional profile columns exist even if the database was created
 * before these fields were added. Safe to run on every request.
 */
function ensureProfileColumns(PDO $db): void
{
    $missing = [];
    foreach (['phone' => 'VARCHAR(30)', 'location' => 'VARCHAR(191)', 'bio' => 'TEXT'] as $column => $definition) {
        if (!columnExists($db, $column)) {
            $missing[] = "ADD COLUMN `$column` $definition NULL";
        }
    }

    if (!empty($missing)) {
        $sql = 'ALTER TABLE users ' . implode(', ', $missing);
        $db->exec($sql);
    }
}

function columnExists(PDO $db, string $column): bool
{
    $stmt = $db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = :column");
    $stmt->execute([':column' => $column]);
    return (bool) $stmt->fetchColumn();
}

/**
 * Verifies a Firebase ID token by calling the Identity Toolkit lookup endpoint.
 * Important: Prefer using Firebase Admin SDK server-side verification when possible.
 * Put your API key in an environment variable (FIREBASE_API_KEY) rather than hard-coding.
 */
function verifyFirebaseToken($idToken) {
    // Use env var first; fallback to hard-coded string only if necessary.
    $apiKey = getenv('FIREBASE_API_KEY') ?: 'AIzaSyAfWmO5Ye-ILmVcWbwN4cVOuP3_e-8ckD8';

    // fixed: remove stray space in URL
    $url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" . $apiKey;

    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['idToken' => $idToken]));
    // optional: set reasonable timeouts
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    $response = curl_exec($ch);
    if ($response === false) {
        // Log curl_error($ch) in real app
        curl_close($ch);
        return null;
    }
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        return null;
    }

    $data = json_decode($response, true);
    if (!is_array($data)) return null;
    return $data['users'][0] ?? null;
}