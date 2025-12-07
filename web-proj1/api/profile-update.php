<?php
/**
 * Profile Update API
 * POST /api/profile-update.php
 * Body (JSON): { "name": "New Name", "age": 21, "phone": "+1 555-1234", "location": "Toronto, CA", "bio": "Short bio" }
 * Auth: X-Firebase-UID header or Authorization: Bearer <idToken>
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Firebase-UID, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

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

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid JSON body']);
        exit;
    }

    $name = isset($data['name']) ? trim($data['name']) : '';
    $age = $data['age'] ?? null;
    $phone = isset($data['phone']) ? trim((string) $data['phone']) : null;
    $location = isset($data['location']) ? trim((string) $data['location']) : null;
    $bio = isset($data['bio']) ? trim((string) $data['bio']) : null;

    $errors = [];

    if ($name === '') {
        $name = null;
    } elseif (mb_strlen($name) > 191) {
        $errors[] = 'Name is too long (max 191 characters)';
    }

    if ($age !== null && $age !== '') {
        if (!is_numeric($age)) {
            $errors[] = 'Age must be a number';
        } else {
            $age = (int) $age;
            if ($age < 13 || $age > 120) {
                $errors[] = 'Age must be between 13 and 120';
            }
        }
    } else {
        $age = null;
    }

    if ($phone !== null && $phone !== '') {
        $numericLength = strlen(preg_replace('/\D+/', '', $phone));
        if (mb_strlen($phone) > 30) {
            $errors[] = 'Phone is too long (max 30 characters)';
        } elseif ($numericLength < 7 || $numericLength > 15 || !preg_match('/^\+[0-9\s().\-]+$/', $phone)) {
            $errors[] = 'Phone must include country code (7-15 digits, e.g., +1 555 123 4567)';
        }
    } else {
        $phone = null;
    }

    if ($location !== null && $location !== '') {
        if (mb_strlen($location) > 191) {
            $errors[] = 'Location is too long (max 191 characters)';
        }
    } else {
        $location = null;
    }

    if ($bio !== null && $bio !== '') {
        if (mb_strlen($bio) > 500) {
            $errors[] = 'Bio is too long (max 500 characters)';
        }
    } else {
        $bio = null;
    }

    if (!empty($errors)) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => implode('. ', $errors)]);
        exit;
    }

    $db = require __DIR__ . '/db.php';

    ensureProfileColumns($db);

    $stmt = $db->prepare('UPDATE users SET name = :name, age = :age, phone = :phone, location = :location, bio = :bio WHERE firebase_uid = :uid');
    $stmt->execute([
        ':name' => $name,
        ':age' => $age,
        ':phone' => $phone,
        ':location' => $location,
        ':bio' => $bio,
        ':uid' => $firebaseUid,
    ]);

    if ($stmt->rowCount() === 0) {
        $check = $db->prepare('SELECT id FROM users WHERE firebase_uid = :uid');
        $check->execute([':uid' => $firebaseUid]);
        if (!$check->fetch(PDO::FETCH_ASSOC)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'User not found']);
            exit;
        }
    }

    $stmt2 = $db->prepare('SELECT id, name, email, age, phone, location, bio, role, joined_at FROM users WHERE firebase_uid = :uid');
    $stmt2->execute([':uid' => $firebaseUid]);
    $user = $stmt2->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found after update']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'user' => $user,
        'message' => 'Profile updated successfully',
    ]);
} catch (Exception $e) {
    error_log('Profile update error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error while updating profile']);
    exit;
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

function verifyFirebaseTokenFromHeader(string $authHeader): ?array
{
    if (!preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        return null;
    }

    $idToken = $matches[1];
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
