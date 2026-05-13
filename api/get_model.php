<?php
include_once("../functions.php");
// api/get_model.php

try {
    if (!isset($_GET['uuid'])) {
        http_response_code(400);
        die(json_encode(["error" => "Missing model UUID"]));
    }

    $model_uid = $_GET['uuid'];

    // DB-Verbindung
    $pdo = new PDO(
        "mysql:host=" . $GLOBALS["db_host"] . ";dbname=" . $GLOBALS["db_name"],
        $GLOBALS["db_username"],
        $GLOBALS["db_password"]
    );

    // Alle Dateien für dieses Modell abrufen
    $stmt = $pdo->prepare("SELECT filename, file_contents FROM models WHERE uuid = :uuid");
    $stmt->bindParam(":uuid", $model_uid);
    $stmt->execute();

    $files = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (!$files) {
        http_response_code(404);
        die(json_encode(["error" => "Model not found"]));
    }

    // Finde die model.json
    $model_json = null;
    $weights_files = [];

    foreach ($files as $file) {
        $name = $file['filename'];
        $content = $file['file_contents'];

        if ($name === 'model.json') {
            $model_json = $content;
        } else {
            $weights_files[$name] = $content;
        }
    }

    if (!$model_json) {
        http_response_code(500);
        die(json_encode(["error" => "model.json missing in DB"]));
    }

    // JSON parsen und Gewichts-URLs anpassen
    $model_data = json_decode($model_json, true);
    if (!$model_data) {
        http_response_code(500);
        die(json_encode(["error" => "Invalid JSON in DB"]));
    }

    if (isset($model_data['weightsManifest'])) {
        foreach ($model_data['weightsManifest'] as &$manifest) {
            foreach ($manifest['paths'] as &$path) {
                // Wir ersetzen den Pfad mit einem API-Call
                $path = "get_model.php?uuid=" . urlencode($model_uid) . "&weight=" . urlencode($path);
            }
        }
    }

    header("Content-Type: application/json");
    echo json_encode($model_data);
    exit();

} catch (\Throwable $e) {
    http_response_code(500);
    die(json_encode(["error" => $e->getMessage()]));
}

// Zusätzliche Abfrage für Gewichte
if (isset($_GET['weight'])) {
    try {
        $model_uid = $_GET['uuid'];
        $weight_name = $_GET['weight'];

        $pdo = new PDO(
            "mysql:host=" . $GLOBALS["db_host"] . ";dbname=" . $GLOBALS["db_name"],
            $GLOBALS["db_username"],
            $GLOBALS["db_password"]
        );

        $stmt = $pdo->prepare("SELECT file_contents FROM models WHERE uuid = :uuid AND filename = :filename");
        $stmt->bindParam(":uuid", $model_uid);
        $stmt->bindParam(":filename", $weight_name);
        $stmt->execute();

        $file = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$file) {
            http_response_code(404);
            die("Weight file not found");
        }

        header("Content-Type: application/octet-stream");
        echo $file['file_contents'];
        exit();
    } catch (\Throwable $e) {
        http_response_code(500);
        die("Error: " . $e->getMessage());
    }
}
