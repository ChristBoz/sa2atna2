<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Firebase-UID, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// Fallback for getallheaders in some SAPIs
if (!function_exists('getallheaders')) {
    function getallheaders(): array {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (str_starts_with($name, 'HTTP_')) {
                $key = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$key] = $value;
            }
        }
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['Content-Type'] = $_SERVER['CONTENT_TYPE'];
        }
        if (isset($_SERVER['Authorization'])) {
            $headers['Authorization'] = $_SERVER['Authorization'];
        }
        return $headers;
    }
}

$method = $_SERVER['REQUEST_METHOD'];
if ($method !== 'DELETE') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require __DIR__ . '/db.php';

try {
    $headers = getallheaders();
    $normalized = [];
    foreach ($headers as $k => $v) {
        $normalized[strtolower($k)] = $v;
    }

    $firebaseUid = $normalized['x-firebase-uid'] ?? '';

    if (!$firebaseUid) {
        $authHeader = $normalized['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $idToken = $matches[1];
            $firebaseUser = verifyFirebaseToken($idToken);
            if ($firebaseUser) {
                $firebaseUid = $firebaseUser['localId'] ?? '';
            }
        }
    }

    if (!$firebaseUid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Not authenticated']);
        exit;
    }

    /** @var PDO $db */
    $db = require __DIR__ . '/db.php';
    $db->beginTransaction();

    $stmt = $db->prepare('SELECT id FROM users WHERE firebase_uid = :uid');
    $stmt->execute([':uid' => $firebaseUid]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        $db->rollBack();
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }

    $delete = $db->prepare('DELETE FROM users WHERE firebase_uid = :uid');
    $delete->execute([':uid' => $firebaseUid]);

    $db->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Account deleted successfully'
    ]);
} catch (Exception $e) {
    if ($db && $db->inTransaction()) {
        $db->rollBack();
    }
    error_log('Delete account error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error while deleting account']);
}

function verifyFirebaseToken($idToken) {
    $apiKey = getenv('FIREBASE_API_KEY') ?: 'AIzaSyAfWmO5Ye-ILmVcWbwN4cVOuP3_e-8ckD8';
    $url = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' . $apiKey;

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
    if (!is_array($data)) return null;
    return $data['users'][0] ?? null;
}
