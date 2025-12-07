<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

function distance_km($lat1, $lon1, $lat2, $lon2) {
    $R = 6371;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat/2) * sin($dLat/2) + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon/2) * sin($dLon/2);
    $c = 2 * atan2(sqrt($a), sqrt(1-$a));
    return $R * $c;
}

try {
    $db = require __DIR__ . '/db.php';

    // Single event fetch
    if (isset($_GET['id'])) {
        $stmt = $db->prepare('
            SELECT e.*, u.name AS owner_name
            FROM events e
            LEFT JOIN users u ON e.owner_id = u.id
            WHERE e.id = :id
        ');
        $stmt->execute([':id' => $_GET['id']]);
        $event = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$event) {
            http_response_code(404);
            echo json_encode(['error' => 'Event not found']);
            exit;
        }

        // Load genres for this event (many-to-many)
        $gstmt = $db->prepare('
            SELECT g.name, g.slug, g.icon
            FROM event_genres eg
            INNER JOIN genres g ON eg.genre_id = g.id
            WHERE eg.event_id = :eid
        ');
        $gstmt->execute([':eid' => $event['id']]);
        $event['genres'] = $gstmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode(['success' => true, 'event' => $event]);
        exit;
    }

    $where = ["1=1"];
    $params = [];

    if (!empty($_GET['search'])) {
        $where[] = "(e.name LIKE :search OR e.location LIKE :search OR e.description LIKE :search)";
        $params[':search'] = '%' . $_GET['search'] . '%';
    }

    // Genre filter against many-to-many map
    $genreFilterJoin = '';
    if (!empty($_GET['genre'])) {
        $genreFilterJoin = 'INNER JOIN event_genres egf ON egf.event_id = e.id INNER JOIN genres gf ON gf.id = egf.genre_id';
        if (is_numeric($_GET['genre'])) {
            $where[] = "gf.id = :genre_id";
            $params[':genre_id'] = $_GET['genre'];
        } else {
            $where[] = "gf.slug = :genre_slug";
            $params[':genre_slug'] = $_GET['genre'];
        }
    }

    if (!empty($_GET['date_from'])) {
        $where[] = "e.date >= :date_from";
        $params[':date_from'] = $_GET['date_from'];
    }

    if (!empty($_GET['date_to'])) {
        $where[] = "e.date <= :date_to";
        $params[':date_to'] = $_GET['date_to'];
    }
    
    if (! empty($_GET['location'])) {
    $where[] = "e.location LIKE :location";
    $params[':location'] = '%' . $_GET['location'] . '%';
}

    if (isset($_GET['price_min'])) {
        $where[] = "e.price >= :price_min";
        $params[':price_min'] = $_GET['price_min'];
    }

    if (isset($_GET['price_max'])) {
        // FIX: remove stray space after e. to avoid SQL parse issues
        $where[] = "e.price <= :price_max";
        $params[':price_max'] = $_GET['price_max'];
    }

    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    // Temporary: increase default limit so "All Events" typically shows everything until pagination UI is implemented
    $limit = isset($_GET['limit']) ? min(100, max(1, intval($_GET['limit']))) : 50;
    $offset = ($page - 1) * $limit;

    $sortField = $_GET['sort'] ?? 'date';
    $sortOrder = ($_GET['order'] ?? 'ASC') === 'DESC' ? 'DESC' : 'ASC';
    $allowedSorts = ['date', 'price', 'name', 'created_at'];

    if (!in_array($sortField, $allowedSorts)) {
        $sortField = 'date';
    }

    $whereClause = implode(' AND ', $where);

    // Count
    $countSql = "
        SELECT COUNT(DISTINCT e.id) AS total
        FROM events e
        $genreFilterJoin
        WHERE $whereClause
    ";
    $countStmt = $db->prepare($countSql);
    $countStmt->execute($params);
    $total = (int)$countStmt->fetch(PDO::FETCH_ASSOC)['total'];

    // Main query: LEFT JOIN event_genres to aggregate genres (does not filter unless genre provided)
    $sql = "
        SELECT e.*,
               u.name AS owner_name,
               GROUP_CONCAT(DISTINCT g.name) AS genres,
               GROUP_CONCAT(DISTINCT g.slug) AS genre_slugs
        FROM events e
        LEFT JOIN users u ON e.owner_id = u.id
        LEFT JOIN event_genres eg ON e.id = eg.event_id
        LEFT JOIN genres g ON eg.genre_id = g.id
        $genreFilterJoin
        WHERE $whereClause
        GROUP BY e.id
        ORDER BY e.$sortField $sortOrder
        LIMIT :limit OFFSET :offset
    ";

    $stmt = $db->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);

    $stmt->execute();
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Optional: distance filtering
    $lat = isset($_GET['lat']) ? floatval($_GET['lat']) : null;
    $lng = isset($_GET['lng']) ? floatval($_GET['lng']) : null;
    $radius = isset($_GET['radius']) ? floatval($_GET['radius']) : 50;

    if ($lat !== null && $lng !== null) {
        $filtered = [];
        foreach ($events as $e) {
            if (isset($e['lat']) && isset($e['lng']) && $e['lat'] !== null && $e['lng'] !== null) {
                $d = distance_km($lat, $lng, floatval($e['lat']), floatval($e['lng']));
                if ($d > $radius) {
                    continue; // skip events outside the requested radius
                }
                $e['distance_km'] = round($d, 2);
            }
            // Keep events without coordinates so geolocation doesn't hide everything
            $filtered[] = $e;
        }
        $events = $filtered;
        $total = count($filtered);
    }

    echo json_encode([
        'success' => true,
        'events' => $events,
        'pagination' => [
            'page' => $page,
            'limit' => $limit,
            'total' => (int)$total,
            'pages' => $limit > 0 ? ceil($total / $limit) : 1
        ]
    ]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>