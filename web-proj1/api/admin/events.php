<?php
/**
 * Admin Events API - Protected endpoint for event management
 * POST /api/admin/events.php - Create new event
 * PUT /api/admin/events.php?id=X - Update event
 * DELETE /api/admin/events.php?id=X - Delete event
 * GET /api/admin/events.php - Get all events (including drafts)
 */

session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Firebase-UID');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

$db = require __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth.php';

// Ensure tables/columns exist before we start querying/inserting
ensureEventsSchema($db);

$auth = new Auth($db);
$currentUser = $auth->requireAdmin();

// Ensure supporting tables exist for legacy databases
$db->exec(
    "CREATE TABLE IF NOT EXISTS `event_genres` (
        `event_id` INT NOT NULL,
        `genre_id` INT NOT NULL,
        PRIMARY KEY (`event_id`, `genre_id`),
        CONSTRAINT `fk_eg_event` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_eg_genre` FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
);

$db->exec(
    "CREATE TABLE IF NOT EXISTS `registrations` (
        `id` INT AUTO_INCREMENT PRIMARY KEY,
        `user_id` INT NOT NULL,
        `event_id` INT NOT NULL,
        `status` ENUM('registered','canceled') DEFAULT 'registered',
        `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
        `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY `unique_user_event` (`user_id`, `event_id`),
        INDEX `idx_event` (`event_id`),
        INDEX `idx_user` (`user_id`),
        CONSTRAINT `fk_reg_user_events` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `fk_reg_event_events` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
);
$method = $_SERVER['REQUEST_METHOD'];

function respond($status, $payload)
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function sanitizeFloat($value)
{
    if ($value === null || $value === '') {
        return null;
    }
    return (float) $value;
}

function sanitizeInt($value)
{
    if ($value === null || $value === '') {
        return null;
    }
    return (int) $value;
}

function columnExists(PDO $db, string $table, string $column): bool
{
    $stmt = $db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column");
    $stmt->execute([':table' => $table, ':column' => $column]);
    return (bool) $stmt->fetchColumn();
}

function ensureEventsSchema(PDO $db): void
{
    // Create events table if missing
    $db->exec(
        "CREATE TABLE IF NOT EXISTS `events` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(255) NOT NULL,
            `description` TEXT,
            `location` VARCHAR(255),
            `lat` DOUBLE,
            `lng` DOUBLE,
            `date` DATE,
            `time` TIME,
            `price` DECIMAL(10,2) DEFAULT 0.00,
            `image_url` VARCHAR(500),
            `status` ENUM('draft','published','archived') DEFAULT 'published',
            `genre_id` INT,
            `owner_id` INT NOT NULL,
            `capacity` INT DEFAULT 0,
            `available_spots` INT DEFAULT 0,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX `idx_date` (`date`),
            INDEX `idx_status` (`status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Backfill critical columns for older schemas
    $columns = [
        'owner_id' => 'ADD COLUMN `owner_id` INT NOT NULL DEFAULT 1',
        'capacity' => 'ADD COLUMN `capacity` INT DEFAULT 0',
        'available_spots' => 'ADD COLUMN `available_spots` INT DEFAULT 0',
        'status' => "ADD COLUMN `status` ENUM('draft','published','archived') DEFAULT 'published'",
        'genre_id' => 'ADD COLUMN `genre_id` INT NULL',
        'image_url' => 'ADD COLUMN `image_url` VARCHAR(500) NULL',
        'price' => 'ADD COLUMN `price` DECIMAL(10,2) DEFAULT 0.00',
        'lat' => 'ADD COLUMN `lat` DOUBLE NULL',
        'lng' => 'ADD COLUMN `lng` DOUBLE NULL',
    ];

    $alter = [];
    foreach ($columns as $column => $sql) {
        if (!columnExists($db, 'events', $column)) {
            $alter[] = $sql;
        }
    }

    if (!empty($alter)) {
        $db->exec('ALTER TABLE events ' . implode(', ', $alter));
    }
}

if ($method === 'GET') {
    $stmt = $db->query(
        "SELECT e.*, u.name AS owner_name,
                GROUP_CONCAT(g.name) AS genres,
                GROUP_CONCAT(g.slug) AS genre_slugs
         FROM events e
         LEFT JOIN users u ON e.owner_id = u.id
         LEFT JOIN event_genres eg ON e.id = eg.event_id
         LEFT JOIN genres g ON eg.genre_id = g.id
         GROUP BY e.id
         ORDER BY e.created_at DESC"
    );
    $events = $stmt->fetchAll();

    foreach ($events as &$event) {
        $event['genres'] = $event['genres'] ? explode(',', $event['genres']) : [];
        $event['genre_slugs'] = $event['genre_slugs'] ? explode(',', $event['genre_slugs']) : [];
    }

    respond(200, ['success' => true, 'events' => $events]);
}

$input = json_decode(file_get_contents('php://input'), true) ?? [];

if ($method === 'POST') {
    $required = ['name', 'description', 'date', 'time', 'location'];
    foreach ($required as $field) {
        if (empty($input[$field])) {
            respond(422, ['success' => false, 'error' => ucfirst($field) . ' is required']);
        }
    }

    $genres = isset($input['genres']) && is_array($input['genres']) ? $input['genres'] : [];

    $primaryGenre = $genres[0] ?? null;
    $capacity = sanitizeInt($input['capacity'] ?? 0);
    $available = $capacity !== null ? $capacity : 0;

    $stmt = $db->prepare(
        "INSERT INTO events
            (name, description, location, lat, lng, date, time, price, image_url, genre_id, owner_id, capacity, available_spots)
         VALUES
            (:name, :description, :location, :lat, :lng, :date, :time, :price, :image_url, :genre_id, :owner_id, :capacity, :available_spots)"
    );

    $stmt->execute([
        ':name' => $input['name'],
        ':description' => $input['description'],
        ':location' => $input['location'],
        ':lat' => sanitizeFloat($input['lat'] ?? null),
        ':lng' => sanitizeFloat($input['lng'] ?? null),
        ':date' => $input['date'],
        ':time' => $input['time'],
        ':price' => sanitizeFloat($input['price'] ?? 0),
        ':image_url' => $input['image_url'] ?? null,
        ':genre_id' => $primaryGenre,
        ':owner_id' => $currentUser['id'],
        ':capacity' => $capacity ?? 0,
        ':available_spots' => $available,
    ]);

    $eventId = $db->lastInsertId();

    if (!empty($genres)) {
        $genreStmt = $db->prepare('INSERT INTO event_genres (event_id, genre_id) VALUES (:event_id, :genre_id)');
        foreach ($genres as $genreId) {
            $genreStmt->execute([':event_id' => $eventId, ':genre_id' => $genreId]);
        }
    }

    respond(201, ['success' => true, 'event_id' => (int) $eventId, 'message' => 'Event created successfully']);
}

if ($method === 'PUT') {
    if (!isset($_GET['id'])) {
        respond(400, ['success' => false, 'error' => 'Event ID required']);
    }
    $eventId = (int) $_GET['id'];

    $check = $db->prepare('SELECT * FROM events WHERE id = :id');
    $check->execute([':id' => $eventId]);
    $existing = $check->fetch();

    if (!$existing) {
        respond(404, ['success' => false, 'error' => 'Event not found']);
    }

    $capacity = array_key_exists('capacity', $input) ? sanitizeInt($input['capacity']) : $existing['capacity'];
    $regStmt = $db->prepare("SELECT COUNT(*) FROM registrations WHERE event_id = :event_id AND status = 'registered'");
    $regStmt->execute([':event_id' => $eventId]);
    $registeredCount = (int) $regStmt->fetchColumn();
    $available = $capacity !== null ? max($capacity - $registeredCount, 0) : 0;

    $stmt = $db->prepare(
        "UPDATE events SET
            name = :name,
            description = :description,
            location = :location,
            lat = :lat,
            lng = :lng,
            date = :date,
            time = :time,
            price = :price,
            image_url = :image_url,
            status = 'published',
            genre_id = :genre_id,
            capacity = :capacity,
            available_spots = :available_spots
         WHERE id = :id"
    );

    $stmt->execute([
        ':name' => $input['name'] ?? $existing['name'],
        ':description' => $input['description'] ?? $existing['description'],
        ':location' => $input['location'] ?? $existing['location'],
        ':lat' => array_key_exists('lat', $input) ? sanitizeFloat($input['lat']) : $existing['lat'],
        ':lng' => array_key_exists('lng', $input) ? sanitizeFloat($input['lng']) : $existing['lng'],
        ':date' => $input['date'] ?? $existing['date'],
        ':time' => $input['time'] ?? $existing['time'],
        ':price' => array_key_exists('price', $input) ? sanitizeFloat($input['price']) : $existing['price'],
        ':image_url' => array_key_exists('image_url', $input) ? $input['image_url'] : $existing['image_url'],
        ':genre_id' => isset($input['genres'][0]) ? $input['genres'][0] : $existing['genre_id'],
        ':capacity' => $capacity,
        ':available_spots' => $available,
        ':id' => $eventId,
    ]);

    if (isset($input['genres']) && is_array($input['genres'])) {
        $db->prepare('DELETE FROM event_genres WHERE event_id = :event_id')->execute([':event_id' => $eventId]);
        $genreStmt = $db->prepare('INSERT INTO event_genres (event_id, genre_id) VALUES (:event_id, :genre_id)');
        foreach ($input['genres'] as $genreId) {
            $genreStmt->execute([':event_id' => $eventId, ':genre_id' => $genreId]);
        }
    }

    respond(200, ['success' => true, 'message' => 'Event updated successfully']);
}

if ($method === 'DELETE') {
    if (!isset($_GET['id'])) {
        respond(400, ['success' => false, 'error' => 'Event ID required']);
    }
    $eventId = (int) $_GET['id'];

    $check = $db->prepare('SELECT name FROM events WHERE id = :id');
    $check->execute([':id' => $eventId]);
    $event = $check->fetch();

    if (!$event) {
        respond(404, ['success' => false, 'error' => 'Event not found']);
    }

    $db->prepare('DELETE FROM event_genres WHERE event_id = :event_id')->execute([':event_id' => $eventId]);
    $db->prepare('DELETE FROM events WHERE id = :id')->execute([':id' => $eventId]);

    respond(200, ['success' => true, 'message' => 'Event deleted successfully']);
}

respond(405, ['success' => false, 'error' => 'Method not allowed']);
