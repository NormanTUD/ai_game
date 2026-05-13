<?php
/**
 * batch_upload_process.php
 *
 * Processes a single image + optional YOLO label from the batch upload page.
 * - Inserts image into image_data / image (same as normal upload)
 * - Parses YOLO label lines, resolves class names via yaml_mapping or DB
 * - Creates annotations (same as normal annotation flow)
 * - Records provenance in batch_upload table (foreign keys to annotation.id and image.id)
 *
 * Expects multipart/form-data POST:
 *   image                   - the image file
 *   batch_uuid              - unique identifier for this batch
 *   original_image_filename - original filename of the image
 *   label_content           - (optional) text content of the .txt label file
 *   original_label_filename - (optional) original filename of the label
 *   yaml_source             - (optional) name of the yaml file used
 *   yaml_mapping            - (optional) JSON string: {"0":"classname", "1":"classname", ...}
 */

header('Content-Type: application/json');
include_once("functions.php");

// Ensure batch_upload table exists
rquery("CREATE TABLE IF NOT EXISTS batch_upload (
    id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    batch_uuid VARCHAR(100) NOT NULL,
    annotation_id INT UNSIGNED DEFAULT NULL,
    image_id INT UNSIGNED DEFAULT NULL,
    original_image_filename VARCHAR(500) DEFAULT NULL,
    original_label_filename VARCHAR(500) DEFAULT NULL,
    yaml_source VARCHAR(500) DEFAULT NULL,
    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INT UNSIGNED DEFAULT NULL,
    FOREIGN KEY (annotation_id) REFERENCES annotation(id) ON DELETE SET NULL,
    FOREIGN KEY (image_id) REFERENCES image(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE SET NULL,
    INDEX idx_batch_uuid (batch_uuid),
    INDEX idx_batch_image (image_id),
    INDEX idx_batch_annotation (annotation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

function json_ok($msg, $extra = []) {
    echo json_encode(array_merge(["ok" => true, "message" => $msg], $extra));
    exit(0);
}

function json_err($msg) {
    echo json_encode(["ok" => false, "error" => $msg]);
    exit(0);
}

// --- Validate inputs ---
if (!isset($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    json_err("No image file uploaded or upload error");
}

$batch_uuid = isset($_POST['batch_uuid']) ? trim($_POST['batch_uuid']) : '';
if (!$batch_uuid) {
    json_err("No batch_uuid provided");
}

$original_image_filename = isset($_POST['original_image_filename']) ? trim($_POST['original_image_filename']) : $_FILES['image']['name'];
$original_label_filename = isset($_POST['original_label_filename']) ? trim($_POST['original_label_filename']) : null;
$yaml_source = isset($_POST['yaml_source']) ? trim($_POST['yaml_source']) : null;
$label_content = isset($_POST['label_content']) ? $_POST['label_content'] : null;

// Parse yaml mapping if provided
$yaml_mapping = [];
if (isset($_POST['yaml_mapping'])) {
    $decoded = json_decode($_POST['yaml_mapping'], true);
    if (is_array($decoded)) {
        $yaml_mapping = $decoded;
    }
}

// --- Get or create user ---
$user_id_hash = isset($_COOKIE["annotate_userid"]) ? $_COOKIE["annotate_userid"] : hash("sha256", $_SERVER['REMOTE_ADDR'] ?? 'batch_upload');
$user_id = get_or_create_user_id($user_id_hash);

// --- Insert image (same as normal upload flow) ---
$tmp_path = $_FILES['image']['tmp_name'];

// Use the original filename as the DB filename (like normal upload)
// Sanitize: use just the basename
$db_filename = basename($original_image_filename);

// Ensure it ends with a valid image extension
if (!preg_match('/\.(jpg|jpeg|png|bmp|webp)$/i', $db_filename)) {
    // Force .jpg
    $db_filename .= '.jpg';
}

try {
    $image_id = insert_image_into_db($tmp_path, $db_filename);
    if (!$image_id) {
        json_err("Failed to insert image into database");
    }
} catch (Throwable $e) {
    json_err("Image insert error: " . $e->getMessage());
}

// Get image dimensions from DB
$img_width = get_image_width($image_id);
$img_height = get_image_height($image_id);

if (!$img_width || !$img_height) {
    // Try to get from file
    $dims = get_image_width_and_height_from_file($tmp_path);
    $img_width = $dims[0];
    $img_height = $dims[1];
}

// Record batch_upload entry for the image (even if no labels)
rquery("INSERT INTO batch_upload (batch_uuid, image_id, original_image_filename, original_label_filename, yaml_source, user_id) 
    VALUES (" . esc($batch_uuid) . ", " . esc($image_id) . ", " . esc($original_image_filename) . ", " . esc($original_label_filename) . ", " . esc($yaml_source) . ", " . esc($user_id) . ")");

$batch_image_row_id = $GLOBALS["dbh"]->insert_id;

// --- Parse and insert annotations if label content exists ---
if ($label_content === null || trim($label_content) === '') {
    json_ok("Image imported (no labels)", ["image_id" => $image_id, "annotations" => 0]);
}

$lines = preg_split('/\r?\n/', trim($label_content));
$annotation_count = 0;
$errors = [];

foreach ($lines as $line_num => $line) {
    $line = trim($line);
    if ($line === '') continue;

    $parts = preg_split('/\s+/', $line);
    if (count($parts) < 5) {
        $errors[] = "Line " . ($line_num + 1) . ": expected at least 5 values, got " . count($parts);
        continue;
    }

    $class_idx = intval($parts[0]);
    $x_center_rel = floatval($parts[1]);
    $y_center_rel = floatval($parts[2]);
    $w_rel = floatval($parts[3]);
    $h_rel = floatval($parts[4]);

    // --- Resolve class name ---
    $class_name = null;

    // First: try yaml_mapping
    if (isset($yaml_mapping[$class_idx])) {
        $class_name = trim($yaml_mapping[$class_idx]);
    } elseif (isset($yaml_mapping[strval($class_idx)])) {
        $class_name = trim($yaml_mapping[strval($class_idx)]);
    }

    if (!$class_name) {
        $errors[] = "Line " . ($line_num + 1) . ": class index $class_idx not found in YAML mapping, skipping";
        continue;
    }

    // Look up category by NAME in the DB (get_or_create_category_id finds by name)
    $category_id = get_or_create_category_id($class_name);
    if (!$category_id) {
        $errors[] = "Line " . ($line_num + 1) . ": could not get/create category for '$class_name'";
        continue;
    }

    // --- Convert YOLO normalized coords to pixel coords ---
    // YOLO format: x_center, y_center, w, h (all relative 0..1)
    $x_start_px = max(0, round(($x_center_rel - $w_rel / 2) * $img_width));
    $y_start_px = max(0, round(($y_center_rel - $h_rel / 2) * $img_height));
    $w_px = round($w_rel * $img_width);
    $h_px = round($h_rel * $img_height);

    // Clamp
    if ($x_start_px + $w_px > $img_width) $w_px = $img_width - $x_start_px;
    if ($y_start_px + $h_px > $img_height) $h_px = $img_height - $y_start_px;

    if ($w_px <= 0 || $h_px <= 0) {
        $errors[] = "Line " . ($line_num + 1) . ": computed zero/negative dimensions, skipping";
        continue;
    }

    // --- Build annotation JSON (same format as normal annotations) ---
    $annotarius_id = "#batch_" . $batch_uuid . "_" . $image_id . "_" . ($line_num + 1);

    $position_str = "xywh=pixel:$x_start_px,$y_start_px,$w_px,$h_px";
    $source_url = "print_image.php?filename=" . urlencode($db_filename);

    $body_item = [
        "type" => "TextualBody",
        "value" => $class_name,
        "purpose" => "tagging"
    ];

    $annotation_full = [
        "type" => "Annotation",
        "body" => [$body_item],
        "target" => [
            "source" => $source_url,
            "selector" => [
                "type" => "FragmentSelector",
                "conformsTo" => "http://www.w3.org/TR/media-frags/",
                "value" => $position_str
            ]
        ],
        "id" => $annotarius_id,
        "@context" => "http://www.w3.org/ns/anno.jsonld"
    ];

    $per_post = [
        "position" => $position_str,
        "body" => [$body_item],
        "id" => $annotarius_id,
        "source" => $source_url,
        "full" => json_encode($annotation_full, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
    ];

    $json_to_store = json_encode($per_post, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    // Insert annotation using existing function
    $anno_id = create_annotation(
        $image_id,
        $user_id,
        $category_id,
        $x_start_px,
        $y_start_px,
        $w_px,
        $h_px,
        $json_to_store,
        $annotarius_id,
        null // no model_uuid for batch imports
    );

    if (!$anno_id) {
        $errors[] = "Line " . ($line_num + 1) . ": create_annotation returned no ID";
        continue;
    }

    // Record batch_upload entry for this annotation
    rquery("INSERT INTO batch_upload (batch_uuid, annotation_id, image_id, original_image_filename, original_label_filename, yaml_source, user_id) 
        VALUES (" . esc($batch_uuid) . ", " . esc($anno_id) . ", " . esc($image_id) . ", " . esc($original_image_filename) . ", " . esc($original_label_filename) . ", " . esc($yaml_source) . ", " . esc($user_id) . ")");

    $annotation_count++;
}

$msg = "Image imported, $annotation_count annotation(s) created";
if (count($errors) > 0) {
    $msg .= ". Warnings: " . implode("; ", $errors);
}

json_ok($msg, [
    "image_id" => $image_id,
    "annotations" => $annotation_count,
    "errors" => $errors
]);
