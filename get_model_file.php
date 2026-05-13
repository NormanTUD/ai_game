<?php
include_once("functions.php");

$uuid = get_get("uuid");
$filename_higher_prio = get_get("filename_higher_prio");
$filename = get_get("filename");

if ($filename_higher_prio) {
    $filename = $filename_higher_prio;
}

if ($filename === "model.json") {
    $json = get_model_file($uuid, $filename);

    $json = trim($json);
    $data = json_decode($json, true);

    if ($data === null) {
        echo $json;
        exit;
    }

    if (isset($data['weightsManifest']) && is_array($data['weightsManifest'])) {
        foreach ($data['weightsManifest'] as &$manifest) {
            if (isset($manifest['paths']) && is_array($manifest['paths'])) {
                foreach ($manifest['paths'] as $i => $path) {
                    $manifest['paths'][$i] = "get_model_file.php?filename_higher_prio=" . urlencode($path);
                }
            }
        }
    }

    header('Content-Type: application/json');
    echo json_encode($data);
} else {
    $file_content = get_model_file($uuid, $filename);

    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));

    switch ($ext) {
        case "json":
            $ctype = "application/json";
            break;
        case "yaml":
        case "yml":
            $ctype = "text/yaml";
            break;
        case "bin":
        case "pt":
            $ctype = "application/octet-stream";
            break;
        default:
            $ctype = "application/octet-stream";
    }

    header('Content-Type: ' . $ctype);
    header('Content-Disposition: attachment; filename="' . basename($filename) . '"');
    header('Content-Length: ' . strlen($file_content));

    echo $file_content;
}
?>
