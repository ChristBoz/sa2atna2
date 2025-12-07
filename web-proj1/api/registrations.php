<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
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
        if (isset($_SERVER['CONTENT_TYPE'])) {
            $headers['Content-Type'] = $_SERVER['CONTENT_TYPE'];
        }
        if (isset($_SERVER['Authorization'])) {
            $headers['Authorization'] = $_SERVER['Authorization'];
        }
        return $headers;
    }
}

function normalize_headers(array $headers): array
{
    $normalized = [];
    foreach ($headers as $k => $v) {
        $normalized[strtolower($k)] = $v;
    }
    return $normalized;
}

try {
    $db = require __DIR__ . '/db.php';
    ensureRegistrationsTable($db);
    ensureEventCapacityColumns($db);

    $headers = normalize_headers(getallheaders());
    $firebaseUid = $headers['x-firebase-uid'] ?? '';

    if (!$firebaseUid) {
        $authHeader = $headers['authorization'] ?? '';
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $firebaseUid = $matches[1]; // For legacy callers sending UID directly in Authorization
        }
    }

    if (!$firebaseUid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'Missing Firebase UID']);
        exit;
    }

    $user = findUserByFirebaseUid($db, $firebaseUid);
    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }

    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            handleGet($db, $user['id']);
            break;
        case 'POST':
            handlePost($db, $user['id']);
            break;
        case 'DELETE':
            handleDelete($db, $user['id']);
            break;
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
} catch (Exception $e) {
    error_log('Registrations API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Server error while processing registration']);
}

function ensureRegistrationsTable(PDO $db): void
{
    $db->exec(
        "CREATE TABLE IF NOT EXISTS registrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            event_id INT NOT NULL,
            status ENUM('registered','canceled') DEFAULT 'registered',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_user_event (user_id, event_id),
            INDEX idx_event (event_id),
            INDEX idx_user (user_id),
            CONSTRAINT fk_reg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_reg_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
}

function ensureEventCapacityColumns(PDO $db): void
{
    $columnStmt = $db->prepare("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME IN ('capacity','available_spots')");
    $columnStmt->execute();
    $existing = $columnStmt->fetchAll(PDO::FETCH_COLUMN);
    $missing = [];
    if (!in_array('capacity', $existing, true)) {
        $missing[] = "ADD COLUMN capacity INT DEFAULT 0";
    }
    if (!in_array('available_spots', $existing, true)) {
        $missing[] = "ADD COLUMN available_spots INT DEFAULT 0";
    }
    if ($missing) {
        $db->exec('ALTER TABLE events ' . implode(', ', $missing));
    }
}

function findUserByFirebaseUid(PDO $db, string $uid): ?array
{
    $stmt = $db->prepare('SELECT id, role FROM users WHERE firebase_uid = :uid LIMIT 1');
    $stmt->execute([':uid' => $uid]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    return $user ?: null;
}

function handleGet(PDO $db, int $userId): void
{
    if (isset($_GET['event_id'])) {
        $eventId = (int) $_GET['event_id'];
        if ($eventId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid event_id']);
            return;
        }

        $registration = fetchRegistration($db, $userId, $eventId);
        $capacityInfo = fetchCapacity($db, $eventId);

        echo json_encode([
            'success' => true,
            'status' => $registration['status'] ?? 'not_registered',
            'registration' => $registration,
            'capacity' => $capacityInfo,
        ]);
        return;
    }

    $stmt = $db->prepare(
        'SELECT r.event_id, r.status, r.created_at, e.name, e.location, e.date, e.time, e.image_url
         FROM registrations r
         JOIN events e ON e.id = r.event_id
         WHERE r.user_id = :uid
         ORDER BY r.created_at DESC'
    );
    $stmt->execute([':uid' => $userId]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['success' => true, 'registrations' => $items]);
}

function handlePost(PDO $db, int $userId): void
{
    $payload = json_decode(file_get_contents('php://input'), true);
    $eventId = isset($payload['event_id']) ? (int) $payload['event_id'] : 0;

    if ($eventId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'event_id is required']);
        return;
    }

    $event = fetchEvent($db, $eventId);
    if (!$event) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Event not found']);
        return;
    }

    $existing = fetchRegistration($db, $userId, $eventId);
    if ($existing && $existing['status'] === 'registered') {
        echo json_encode(['success' => true, 'status' => 'registered', 'message' => 'Already registered']);
        return;
    }

    $db->beginTransaction();
    try {
        $capacityInfo = fetchCapacity($db, $eventId, true);
        if ($capacityInfo['capacity'] > 0 && $capacityInfo['available'] <= 0) {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'Event is at capacity']);
            return;
        }

        if ($existing) {
            $stmt = $db->prepare('UPDATE registrations SET status = "registered", updated_at = NOW() WHERE id = :id');
            $stmt->execute([':id' => $existing['id']]);
        } else {
            $stmt = $db->prepare('INSERT INTO registrations (user_id, event_id, status) VALUES (:uid, :event, "registered")');
            $stmt->execute([':uid' => $userId, ':event' => $eventId]);
        }

        if ($event['capacity'] > 0) {
            $update = $db->prepare('UPDATE events SET available_spots = GREATEST(0, available_spots - 1) WHERE id = :id');
            $update->execute([':id' => $eventId]);
        }

        $db->commit();
        echo json_encode(['success' => true, 'status' => 'registered']);
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function handleDelete(PDO $db, int $userId): void
{
    $eventId = isset($_GET['event_id']) ? (int) $_GET['event_id'] : 0;
    if ($eventId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'event_id is required']);
        return;
    }

    $existing = fetchRegistration($db, $userId, $eventId);
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Registration not found']);
        return;
    }

    $db->beginTransaction();
    try {
        $stmt = $db->prepare('DELETE FROM registrations WHERE id = :id');
        $stmt->execute([':id' => $existing['id']]);

        $event = fetchEvent($db, $eventId);
        if ($event && $event['capacity'] > 0) {
            $update = $db->prepare('UPDATE events SET available_spots = LEAST(capacity, available_spots + 1) WHERE id = :id');
            $update->execute([':id' => $eventId]);
        }

        $db->commit();
        echo json_encode(['success' => true, 'status' => 'canceled']);
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function fetchRegistration(PDO $db, int $userId, int $eventId): ?array
{
    $stmt = $db->prepare('SELECT * FROM registrations WHERE user_id = :uid AND event_id = :event LIMIT 1');
    $stmt->execute([':uid' => $userId, ':event' => $eventId]);
    $reg = $stmt->fetch(PDO::FETCH_ASSOC);
    return $reg ?: null;
}

function fetchEvent(PDO $db, int $eventId): ?array
{
    $stmt = $db->prepare('SELECT id, name, capacity, available_spots, status FROM events WHERE id = :id AND status != "archived"');
    $stmt->execute([':id' => $eventId]);
    $event = $stmt->fetch(PDO::FETCH_ASSOC);
    return $event ?: null;
}

function fetchCapacity(PDO $db, int $eventId, bool $forUpdate = false): array
{
    $lock = $forUpdate ? 'FOR UPDATE' : '';
    $stmt = $db->prepare("SELECT capacity, available_spots FROM events WHERE id = :id $lock");
    $stmt->execute([':id' => $eventId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['capacity' => 0, 'available_spots' => 0];

    if ((int) $row['capacity'] > 0) {
        $countStmt = $db->prepare('SELECT COUNT(*) FROM registrations WHERE event_id = :id AND status = "registered"');
        $countStmt->execute([':id' => $eventId]);
        $used = (int) $countStmt->fetchColumn();
        $available = max(0, (int) $row['capacity'] - $used);
    } else {
        $available = null; // unlimited
    }

    return [
        'capacity' => (int) $row['capacity'],
        'available' => $available,
    ];
}
