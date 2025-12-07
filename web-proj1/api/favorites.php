<?php
/**
 * Favorites API - User favorites management
 * GET /api/favorites.php - Get user's favorites
 * POST /api/favorites.php - Add event to favorites
 * DELETE /api/favorites.php? event_id=X - Remove from favorites
 */

session_start();
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Firebase-UID');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

try {
    $db = require __DIR__ . '/db.php';
    require_once __DIR__ . '/auth.php';

    $auth = new Auth($db);
    $method = $_SERVER['REQUEST_METHOD'];

    // Require authentication for all operations
    $currentUser = $auth->requireAuth();
    // Require authentication for all operations
$currentUser = $auth->requireAuth();

// Debug logging
error_log("Favorites API - User ID: " . $currentUser['id']);
error_log("Favorites API - Firebase UID: " . ($currentUser['firebase_uid'] ??  'none'));

    // GET - Fetch user's favorite events
    if ($method === 'GET') {
        $stmt = $db->prepare("
            SELECT e.*, 
                   uf.created_at as favorited_at,
                   u.name as creator_name,
                   GROUP_CONCAT(g.name) as genres,
                   GROUP_CONCAT(g.slug) as genre_slugs,
                   GROUP_CONCAT(g.icon) as genre_icons
            FROM user_favorites uf
            JOIN events e ON uf.event_id = e.id
            LEFT JOIN users u ON e.owner_id = u.id
            LEFT JOIN event_genres eg ON e.id = eg.event_id
            LEFT JOIN genres g ON eg.genre_id = g.id
            WHERE uf.user_id = :user_id
            GROUP BY e.id
            ORDER BY uf.created_at DESC
        ");
        $stmt->execute([':user_id' => $currentUser['id']]);
        $favorites = $stmt->fetchAll();
        
        // Convert comma-separated strings to arrays
        foreach ($favorites as &$event) {
            $event['genres'] = $event['genres'] ?  explode(',', $event['genres']) : [];
            $event['genre_slugs'] = $event['genre_slugs'] ? explode(',', $event['genre_slugs']) : [];
            $event['genre_icons'] = $event['genre_icons'] ? explode(',', $event['genre_icons']) : [];
        }
        
        echo json_encode(['success' => true, 'favorites' => $favorites, 'count' => count($favorites)]);
        exit;
    }

    // POST - Add event to favorites
    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (empty($data['event_id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Event ID is required']);
            exit;
        }
        
        $eventId = intval($data['event_id']);
        
        // Check if event exists
        $checkStmt = $db->prepare("SELECT id FROM events WHERE id = :id");
        $checkStmt->execute([':id' => $eventId]);
        if (! $checkStmt->fetch()) {
            http_response_code(404);
            echo json_encode(['error' => 'Event not found']);
            exit;
        }
        
        // Add to favorites (INSERT IGNORE handles duplicates)
        try {
            $stmt = $db->prepare("INSERT INTO user_favorites (user_id, event_id) VALUES (:user_id, :event_id)");
            $stmt->execute([
                ':user_id' => $currentUser['id'],
                ':event_id' => $eventId
            ]);
            echo json_encode(['success' => true, 'message' => 'Event added to favorites']);
        } catch (PDOException $e) {
            if ($e->getCode() == 23000) { // Duplicate entry
                echo json_encode(['success' => true, 'message' => 'Event already in favorites']);
            } else {
                throw $e;
            }
        }
        exit;
    }

    // DELETE - Remove event from favorites
    if ($method === 'DELETE') {
        $eventId = isset($_GET['event_id']) ?  intval($_GET['event_id']) : 0;
        
        if (! $eventId) {
            http_response_code(400);
            echo json_encode(['error' => 'Event ID is required']);
            exit;
        }
        
        $stmt = $db->prepare("DELETE FROM user_favorites WHERE user_id = :user_id AND event_id = :event_id");
        $stmt->execute([
            ':user_id' => $currentUser['id'],
            ':event_id' => $eventId
        ]);
        
        if ($stmt->rowCount() > 0) {
            echo json_encode(['success' => true, 'message' => 'Event removed from favorites']);
        } else {
            echo json_encode(['success' => true, 'message' => 'Event was not in favorites']);
        }
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);

} catch (Exception $e) {
    error_log('Favorites API error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
}
?>