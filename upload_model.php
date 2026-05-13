<?php
include_once("functions.php");

// --- Unlimited execution time ---
ini_set('memory_limit', '-1');
ini_set('max_execution_time', '0');
set_time_limit(0);

// --- Output direkt an Browser senden ---
while (ob_get_level() > 0) ob_end_flush();
ob_implicit_flush(true);
header('Content-Type: text/html; charset=utf-8');

echo "Starting Conversion-process...\n<br>";
flush();

// --- Request Handling ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    die("❌Error: REQUEST_METHOD is not POST, but " . $_SERVER['REQUEST_METHOD']);
}

$has_model_uploaded = false;
$files = [];
$modelName = "";

if (isset($_POST['model_name']) && strtolower($_POST["model_name"]) == "none") {
    die("❌Error: Model name cannot be 'None' (case-insensitive).");
}

// --- TFJS Upload ---
if (isset($_FILES['tfjs_model']) && isset($_POST['model_name'])) {
    $modelName = $_POST['model_name'];
    if (empty($modelName)) die("❌Error: Model name is empty.");

    if (!is_array($_FILES["tfjs_model"]["name"])) die("❌Error: Invalid file input structure.");

    $has_labels = false;
    $has_model = false;
    $model_json_path = "";
    $file_paths = [];

    $upload_count = count($_FILES["tfjs_model"]["name"]);

    for ($i = 0; $i < $upload_count; $i++) {
        $filename = $_FILES["tfjs_model"]["name"][$i];
        $tmp = $_FILES["tfjs_model"]["tmp_name"][$i];
        $error = $_FILES["tfjs_model"]["error"][$i];

        if ($error !== UPLOAD_ERR_OK) die("❌Error: Upload failed for '$filename' (code $error).");
        if (empty($filename) || empty($tmp) || !file_exists($tmp)) die("❌Error: File '$filename' missing temporary file.");

        // Temporäre Datei in ein Arbeitsverzeichnis verschieben mit originalem Dateinamen
        $tmp_dir = sys_get_temp_dir() . '/tfjs_upload_' . session_id() . '_' . $modelName;
        if (!is_dir($tmp_dir)) mkdir($tmp_dir, 0777, true);

        $new_path = $tmp_dir . '/' . $filename;
        if (!move_uploaded_file($tmp, $new_path)) die("❌Error: Failed to move '$tmp' to '$new_path'.");

        $files[] = $new_path;
        $file_paths[] = $filename;

        if ($filename === "labels.json") {
            $has_labels = true;
            $labels_content = json_decode(file_get_contents($new_path));
            if ($labels_content === null) die("❌Error: Invalid labels.json");
            foreach ($labels_content as $label) get_or_create_category_id($label);
        } else if ($filename === "model.json") {
            $has_model = true;
            $model_json_path = $new_path;
        }

        echo "Uploaded: $filename<br>";
        flush();
    }

    if (!$has_model || !$has_labels) {
        if (!$has_model) echo "<b><tt>model.json</tt> is missing!</b><br>";
        if (!$has_labels) echo "<b><tt>labels.json</tt> is missing!</b><br>";
        die("❌Error: Required files missing.");
    }

    $model_json_raw = file_get_contents($model_json_path);
    $model_json = json_decode($model_json_raw, true);
    if ($model_json === null) die("❌Error: Invalid model.json");

    if (isset($model_json["weightsManifest"][0]["paths"])) {
        $paths = $model_json["weightsManifest"][0]["paths"];

        // Normalize paths: strip get_model_file.php?filename_higher_prio= prefix if present
        // This happens when model.json was downloaded from the online version where
        // get_model_file.php rewrites shard paths for browser fetching
        $normalized_paths = array_map(function($p) {
            if (preg_match('/get_model_file\.php\?filename_higher_prio=(.+)$/', $p, $m)) {
                return urldecode($m[1]);
            }
            return $p;
        }, $paths);

        $missing_files = array_diff($normalized_paths, $file_paths);
        if (count($missing_files)) {
            die("❌Error: Missing files: <tt>" . join("</tt>, <tt>", $missing_files) . "</tt>");
        }

        // Rewrite model.json on disk with clean paths so it stores correctly in DB
        if ($normalized_paths !== $paths) {
            $model_json["weightsManifest"][0]["paths"] = array_values($normalized_paths);
            file_put_contents($model_json_path, json_encode($model_json));
            echo "→ Normalized model.json shard paths (stripped get_model_file.php prefix)<br>";
            flush();
        }
    } else {
        die("❌Error: model.json does not contain expected weightsManifest->paths structure.");
    }

    $has_model_uploaded = true;
}

// --- PyTorch Upload ---
else if (isset($_FILES['pt_model_file'])) {
    $file = $_FILES['pt_model_file'];
    if ($file['error'] !== UPLOAD_ERR_OK) die("❌Error: Upload failed for '" . $file['name'] . "' (code " . $file['error'] . ").");
    $files[] = $file['tmp_name'];
    $modelName = $_POST['model_name'];
    $has_model_uploaded = true;
}

// --- Model in DB speichern ---
if (!$has_model_uploaded) {
    die("❌Error: Please provide both a TFJS model name + files, or a PyTorch model file.");
}

try {
    $is_tfjs = isset($_FILES['tfjs_model']);
    $pt_file = isset($_FILES['pt_model_file']) ? ($_FILES['pt_model_file']["full_path"] ?? $_FILES['pt_model_file']["name"]) : '';
    $pt_file_path = isset($_FILES['pt_model_file']) ? $_FILES['pt_model_file']['tmp_name'] : '';
    insert_model_into_db($modelName, $files, $pt_file_path, $pt_file, $is_tfjs);
    echo "✅ Success: Model '$modelName' saved into DB" . ($pt_file ? " (pt-file: $pt_file)" : " (TFJS direct upload)") . "<br>";
    flush();
} catch (\Throwable $e) {
    die("❌Error while inserting model into DB: " . $e->getMessage());
}
?>
