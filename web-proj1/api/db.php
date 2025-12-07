<?php
/**
 * Database Connection - MySQL Only
 * Returns a PDO connection to MySQL database
 */

date_default_timezone_set('UTC');

// Database credentials
$host = 'localhost';        // Change for InfinityFree: e.g., 'sqlxxx.infinityfreeapp.com'
$db   = 'eventfinder';     // Change for InfinityFree: e.g., 'epiz_xxxxx_eventfinder'
$user = 'root';             // Change for InfinityFree: e.g., 'epiz_xxxxx'
$pass = '';                 // Change for InfinityFree: your database password

// Create DSN (Data Source Name)
$dsn = "mysql:host={$host};dbname={$db};charset=utf8mb4";

try {
    // Create PDO connection
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    
    // Return connection
    return $pdo;
    
} catch (PDOException $e) {
    // Log error and return error response
    error_log('Database connection failed: ' .  $e->getMessage());
    http_response_code(500);
    
    // Only show detailed error in development
    if ($_SERVER['SERVER_NAME'] === 'localhost' || $_SERVER['SERVER_NAME'] === '127.0.0.1') {
        echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    } else {
        echo json_encode(['error' => 'Database connection failed']);
    }
    exit;
}