<?php
    include_once("functions.php");

    // Read JSON body
    $raw = file_get_contents("php://input");
    $payload = json_decode($raw, true);

    if (!$payload || !isset($payload["annotations"]) || !is_array($payload["annotations"])) {
        die("Invalid batch payload");
    }

    $results = [];

    foreach ($payload["annotations"] as $entry) {
        $used_model = isset($entry["used_model"]) ? $entry["used_model"] : "";

        if (!isset($entry["source"])) { $results[] = "Skipped: no source"; continue; }
        if (!isset($entry["id"]))     { $results[] = "Skipped: no id";     continue; }

        $filename = urldecode(html_entity_decode($entry["source"]));
        $filename = preg_replace("/print_image.php.filename=/", "", $filename);
        $filename = preg_replace("/&_=.*/", "", $filename);

        $image_id = get_or_create_image_id("", $filename);
        if (!$image_id) { $results[] = "Skipped: no image_id for $filename"; continue; }

        $user_id = get_or_create_user_id($_COOKIE["annotate_userid"]);
        $base_annotarius_id = $entry["id"];

        $parsed_position = parse_position(
            $entry["position"],
            get_image_width($image_id),
            get_image_height($image_id)
        );

        if (!$parsed_position) { $results[] = "Skipped: bad position"; continue; }
        list($x_start, $y_start, $w, $h) = $parsed_position;

        if (!isset($entry["body"]) || !is_array($entry["body"]) || count($entry["body"]) === 0) {
            $results[] = "Skipped: no body";
            continue;
        }

        // Decode 'full' once if present
        $original_full = null;
        if (isset($entry['full'])) {
            $decoded = json_decode($entry['full'], true);
            if (json_last_error() === JSON_ERROR_NONE) $original_full = $decoded;
        }

        $counter = 1;

        foreach ($entry["body"] as $body_item) {
            if (!isset($body_item["value"])) continue;

            $category_name = trim($body_item["value"]);
            $category_id = get_or_create_category_id($category_name);

            $annotarius_id = $base_annotarius_id . "_" . $counter;

            // Build per-tag structure (same logic as submit.php)
            $per_post = $entry;
            $per_post['body'] = array($body_item);
            $per_post['id'] = $annotarius_id;

            if ($original_full !== null) {
                $per_full = $original_full;
                $per_full['body'] = array($body_item);
                $per_full['id'] = $annotarius_id;
                $per_post['full'] = json_encode($per_full, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            } else {
                $per_full = array(
                    'type' => 'Annotation',
                    'body' => array($body_item),
                    'target' => array(
                        'source' => isset($entry['source']) ? $entry['source'] : null,
                        'selector' => array(
                            'type' => 'FragmentSelector',
                            'value' => isset($entry['position']) ? $entry['position'] : null
                        )
                    ),
                    'id' => $annotarius_id,
                    '@context' => 'http://www.w3.org/ns/anno.jsonld'
                );
                $per_post['full'] = json_encode($per_full, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            }

            $json_to_store = json_encode($per_post, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            $anno_id = create_annotation(
                $image_id,
                $user_id,
                $category_id,
                $x_start,
                $y_start,
                $w,
                $h,
                $json_to_store,
                $annotarius_id,
                $used_model
            );

            $results[] = htmlspecialchars($category_name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . " (anno-id: $anno_id)";
            $counter++;
        }
    }

    if (count($results) > 0) {
        print "Batch saved " . count($results) . " annotation(s): " . implode(", ", $results);
    } else {
        die("No annotations saved in batch");
    }
?>
