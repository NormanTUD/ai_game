<?php
include("functions.php");

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(["error" => "Method not allowed. Use POST."]);
    exit;
}

if (!isset($_POST['id']) || !is_numeric($_POST['id'])) {
    http_response_code(400);
    echo json_encode(["error" => "Missing or invalid category ID."]);
    exit;
}

$category_id = (int)$_POST['id'];

// Prüfen, ob Kategorie existiert
$result = rquery("SELECT id FROM category WHERE id = $category_id");
if ($result->num_rows === 0) {
    http_response_code(404);
    echo json_encode(["error" => "Category not found."]);
    exit;
}

// Kategorie löschen (Hard delete)
$result = rquery("DELETE FROM category WHERE id = $category_id");
if ($result) {
    echo json_encode(["success" => true, "message" => "Category deleted."]);
} else {
    http_response_code(500);
    echo json_encode(["error" => "Failed to delete category."]);
}
?>
