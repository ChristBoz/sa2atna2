<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

try {
    $db = require __DIR__ . '/../db.php';
    require_once __DIR__ . '/../auth.php';
    $auth = new Auth($db);

    $method = $_SERVER['REQUEST_METHOD'];

    // GET - Fetch comments for an event
    if ($method === 'GET') {
        $eventId = isset($_GET['event_id']) ? (int)$_GET['event_id'] : 0;

        if (!$eventId) {
            http_response_code(400);
            echo json_encode(['error' => 'Event ID required']);
            exit;
        }

        $stmt = $db->prepare("
            SELECT c.*, u.name AS user_name
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.event_id = :event_id
            ORDER BY c.created_at DESC
        ");
        $stmt->execute([':event_id' => $eventId]);
        $comments = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['success' => true, 'comments' => $comments]);
        exit;
    }

    // POST - Add comment (requires auth)
    if ($method === 'POST') {
        $currentUser = $auth->requireAuth();

        $data = json_decode(file_get_contents('php://input'), true);
        $eventId = isset($data['event_id']) ? (int)$data['event_id'] : 0;
        $comment = trim($data['comment'] ?? '');

        if (!$eventId) {
            http_response_code(400);
            echo json_encode(['error' => 'Event ID required']);
            exit;
        }

        if ($comment === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Comment cannot be empty']);
            exit;
        }

        if (strlen($comment) > 1000) {
            http_response_code(400);
            echo json_encode(['error' => 'Comment too long (max 1000 characters)']);
            exit;
        }

        $stmt = $db->prepare("
            INSERT INTO comments (event_id, user_id, comment)
            VALUES (:event_id, :user_id, :comment)
        ");
        $stmt->execute([
            ':event_id' => $eventId,
            ':user_id'  => $currentUser['id'],
            ':comment'  => $comment
        ]);

        // Return the new comment with user info
        $commentId = (int)$db->lastInsertId();
        $stmt = $db->prepare("
            SELECT c.*, u.name AS user_name
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = :id
        ");
        $stmt->execute([':id' => $commentId]);
        $newComment = $stmt->fetch(PDO::FETCH_ASSOC);

        echo json_encode(['success' => true, 'comment' => $newComment]);
        exit;
    }

    // DELETE - Remove comment (only own comments)
    if ($method === 'DELETE') {
        $currentUser = $auth->requireAuth();

        $commentId = isset($_GET['comment_id']) ? (int)$_GET['comment_id'] : 0;

        if (!$commentId) {
            http_response_code(400);
            echo json_encode(['error' => 'Comment ID required']);
            exit;
        }

        // Check ownership or admin
        $stmt = $db->prepare("SELECT user_id FROM comments WHERE id = :id");
        $stmt->execute([':id' => $commentId]);
        $commentRow = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$commentRow) {
            http_response_code(404);
            echo json_encode(['error' => 'Comment not found']);
            exit;
        }

        $isOwner = (int)$commentRow['user_id'] === (int)$currentUser['id'];
        $isAdmin = in_array($currentUser['role'], ['admin', 'owner'], true);

        if (!$isOwner && !$isAdmin) {
            http_response_code(403);
            echo json_encode(['error' => 'Not authorized to delete this comment']);
            exit;
        }

        $stmt = $db->prepare("DELETE FROM comments WHERE id = :id");
        $stmt->execute([':id' => $commentId]);

        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
} catch (Exception $e) {
    error_log('comments error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Server error']);
    exit;
}