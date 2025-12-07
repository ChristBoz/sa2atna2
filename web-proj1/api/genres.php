<?php
/**
 * Genres API - Public endpoint to get all event genres
 * GET /api/genres.php - Get all genres
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

try {
    $db = require __DIR__ . '/db.php';

    // Ensure the genres and event_genres tables exist for older databases
    $db->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS `genres` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(100) NOT NULL UNIQUE,
            `slug` VARCHAR(100) NOT NULL UNIQUE,
            `description` TEXT,
            `icon` VARCHAR(50),
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    SQL);

    $db->exec(<<<SQL
        CREATE TABLE IF NOT EXISTS `event_genres` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `event_id` INT NOT NULL,
            `genre_id` INT NOT NULL,
            `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY `unique_event_genre` (`event_id`, `genre_id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    SQL);

    // Seed defaults if the genres table is empty
    $countStmt = $db->query('SELECT COUNT(*) AS total FROM genres');
    $count = (int) $countStmt->fetchColumn();

    if ($count === 0) {
        $seed = $db->prepare(
            'INSERT INTO genres (name, slug, description, icon) VALUES
            ("Music", "music", "Concerts, festivals, and live performances", "🎵"),
            ("Sports", "sports", "Sporting events and competitions", "⚽"),
            ("Food & Drink", "food-drink", "Food festivals, tastings, and culinary events", "🍔"),
            ("Arts & Culture", "arts-culture", "Art exhibitions, theater, and cultural events", "🎨"),
            ("Business", "business", "Conferences, networking, and professional events", "💼"),
            ("Technology", "technology", "Tech meetups, hackathons, and workshops", "💻"),
            ("Family", "family", "Family-friendly activities and events", "👨‍👩‍👧‍👦"),
            ("Nightlife", "nightlife", "Clubs, bars, and evening entertainment", "🌙"),
            ("Education", "education", "Workshops, classes, and learning opportunities", "📚"),
            ("Outdoor", "outdoor", "Outdoor activities and adventures", "🏕️"),
            ("Comedy", "comedy", "Stand-up comedy and humor shows", "😂"),
            ("Film", "film", "Movie screenings and film festivals", "🎬")'
        );
        $seed->execute();
    }

    $stmt = $db->query(
        "SELECT g.*, COUNT(eg.event_id) AS event_count
         FROM genres g
         LEFT JOIN event_genres eg ON g.id = eg.genre_id
         LEFT JOIN events e ON eg.event_id = e.id AND e.status = 'published'
         GROUP BY g.id
         ORDER BY g.name ASC"
    );

    $genres = $stmt->fetchAll();

    echo json_encode(['success' => true, 'genres' => $genres]);
    exit;
} catch (Exception $e) {
    error_log('Genres API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
    exit;
}