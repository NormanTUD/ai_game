<?php
/**
 * test_batch_upload.php
 *
 * Pure logic tests for the batch upload feature.
 * NO database connection required.
 * Tests: YAML parsing, YOLO label parsing, coordinate conversion,
 *        filename stem matching, class resolution logic, edge cases.
 *
 * Usage:
 *   php test_batch_upload.php
 *   or open in browser: http://localhost:XXXX/test_batch_upload.php
 */

$is_cli = (php_sapi_name() === 'cli');
if (!$is_cli) {
    header('Content-Type: text/html; charset=utf-8');
    echo "<pre style='background:#111;color:#eee;padding:20px;font-family:monospace;font-size:14px;overflow:auto;'>";
}

// ============================================================
// Test framework
// ============================================================
$test_passed = 0;
$test_failed = 0;
$test_errors = [];
$current_test_group = '';

function test_group($name) {
    global $current_test_group;
    $current_test_group = $name;
    echo "\n--- $name ---\n";
}

function assert_true($condition, $msg) {
    global $test_passed, $test_failed, $test_errors, $current_test_group;
    if ($condition) {
        echo "  ✓ PASS: $msg\n";
        $test_passed++;
    } else {
        echo "  ✗ FAIL: $msg\n";
        $test_failed++;
        $test_errors[] = "[$current_test_group] $msg";
    }
}

function assert_false($condition, $msg) {
    assert_true(!$condition, $msg);
}

function assert_equals($expected, $actual, $msg) {
    $ok = ($expected === $actual);
    if (!$ok) {
        $msg .= " (expected: " . var_export($expected, true) . ", got: " . var_export($actual, true) . ")";
    }
    assert_true($ok, $msg);
}

function assert_equals_float($expected, $actual, $msg, $epsilon = 0.0001) {
    $ok = (abs($expected - $actual) < $epsilon);
    if (!$ok) {
        $msg .= " (expected: $expected, got: $actual, diff: " . abs($expected - $actual) . ")";
    }
    assert_true($ok, $msg);
}

function assert_not_null($val, $msg) {
    assert_true($val !== null && $val !== false, $msg);
}

function assert_greater_than($a, $b, $msg) {
    assert_true($a > $b, $msg . " ($a > $b)");
}

function assert_contains($haystack, $needle, $msg) {
    assert_true(strpos($haystack, $needle) !== false, $msg);
}

function assert_array_has_key($key, $arr, $msg) {
    assert_true(is_array($arr) && array_key_exists($key, $arr), $msg);
}

function assert_count($expected, $arr, $msg) {
    $actual = is_array($arr) ? count($arr) : -1;
    assert_equals($expected, $actual, $msg);
}

// ============================================================
// Functions under test (same logic as batch_upload_process.php)
// ============================================================

/**
 * Parse dataset.yaml to extract the names: block.
 * Returns associative array: int index => string name
 */
function parse_yaml_names($text) {
    $lines = preg_split('/\r?\n/', $text);
    $inside_names = false;
    $names = [];

    foreach ($lines as $line) {
        $trim = trim($line);
        if ($trim === '' || (isset($trim[0]) && $trim[0] === '#')) continue;

        if (!$inside_names) {
            if (preg_match('/^names\s*:/', $trim)) {
                $inside_names = true;
            }
            continue;
        }

        // Inside names block
        if (preg_match('/^\s+(\d+)\s*:\s*(.+)$/', $line, $m)) {
            $names[intval($m[1])] = trim($m[2]);
        } elseif (preg_match('/^\S/', $line)) {
            // New top-level key, end of names
            break;
        }
    }
    return $names;
}

/**
 * Parse YOLO label file content.
 * Each line: class_id x_center y_center width height
 * Returns array of associative arrays.
 */
function parse_yolo_label($content) {
    $lines = preg_split('/\r?\n/', trim($content));
    $annotations = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '') continue;
        $parts = preg_split('/\s+/', $line);
        if (count($parts) < 5) continue;
        $annotations[] = [
            'class_idx' => intval($parts[0]),
            'x_center'  => floatval($parts[1]),
            'y_center'  => floatval($parts[2]),
            'width'     => floatval($parts[3]),
            'height'    => floatval($parts[4]),
        ];
    }
    return $annotations;
}

/**
 * Convert YOLO normalized coordinates to pixel coordinates.
 * Returns [x_start, y_start, w_px, h_px]
 */
function yolo_to_pixel($x_center, $y_center, $w_rel, $h_rel, $img_w, $img_h) {
    $x_start = (int)max(0, round(($x_center - $w_rel / 2) * $img_w));
    $y_start = (int)max(0, round(($y_center - $h_rel / 2) * $img_h));
    $w_px = (int)round($w_rel * $img_w);
    $h_px = (int)round($h_rel * $img_h);

    if ($x_start + $w_px > $img_w) $w_px = $img_w - $x_start;
    if ($y_start + $h_px > $img_h) $h_px = $img_h - $y_start;

    return [$x_start, $y_start, $w_px, $h_px];
}

/**
 * Extract filename stem (remove image/label extension).
 */
function get_stem($filename) {
    return preg_replace('/\.(jpg|jpeg|png|bmp|webp|txt)$/i', '', $filename);
}

/**
 * Simulate the class resolution pipeline:
 * YOLO class_idx -> yaml_mapping -> class_name -> (would do DB lookup)
 * Returns class_name or null if not found.
 */
function resolve_class_name($class_idx, $yaml_mapping) {
    if (isset($yaml_mapping[$class_idx])) {
        return trim($yaml_mapping[$class_idx]);
    }
    if (isset($yaml_mapping[strval($class_idx)])) {
        return trim($yaml_mapping[strval($class_idx)]);
    }
    return null;
}

/**
 * Build the annotation JSON structure (same as batch_upload_process.php).
 */
function build_annotation_json($class_name, $x_px, $y_px, $w_px, $h_px, $db_filename, $annotarius_id) {
    $position_str = "xywh=pixel:$x_px,$y_px,$w_px,$h_px";
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

    return $annotation_full;
}

/**
 * Simulate the full pipeline for one image+label pair.
 * Returns array with 'annotations' (array of built annotation objects),
 * 'errors' (array of error strings), and 'class_counts' (name => count).
 */
function simulate_pipeline($label_content, $yaml_mapping, $img_w, $img_h, $db_filename, $batch_uuid, $image_id) {
    $result = [
        'annotations' => [],
        'errors' => [],
        'class_counts' => [],
        'all_in_bounds' => true,
        'bound_errors' => [],
    ];

    if ($label_content === null || trim($label_content) === '') {
        return $result;
    }

    $label_annos = parse_yolo_label($label_content);

    foreach ($label_annos as $line_num => $la) {
        $class_idx = $la['class_idx'];

        // Resolve class name
        $class_name = resolve_class_name($class_idx, $yaml_mapping);
        if ($class_name === null) {
            $result['errors'][] = "Line " . ($line_num + 1) . ": class index $class_idx not found in YAML mapping";
            continue;
        }

        // Convert to pixel coords
        list($x_px, $y_px, $w_px, $h_px) = yolo_to_pixel(
            $la['x_center'], $la['y_center'], $la['width'], $la['height'],
            $img_w, $img_h
        );

        if ($w_px <= 0 || $h_px <= 0) {
            $result['errors'][] = "Line " . ($line_num + 1) . ": zero/negative dimensions ($w_px x $h_px)";
            continue;
        }

        // Check bounds
        if ($x_px < 0 || $y_px < 0 || $x_px + $w_px > $img_w || $y_px + $h_px > $img_h) {
            $result['all_in_bounds'] = false;
            $result['bound_errors'][] = "x=$x_px y=$y_px w=$w_px h=$h_px";
        }

        $annotarius_id = "#batch_{$batch_uuid}_{$image_id}_" . ($line_num + 1);

        $anno_json = build_annotation_json($class_name, $x_px, $y_px, $w_px, $h_px, $db_filename, $annotarius_id);

        $result['annotations'][] = [
            'class_name' => $class_name,
            'class_idx' => $class_idx,
            'x' => $x_px,
            'y' => $y_px,
            'w' => $w_px,
            'h' => $h_px,
            'json' => $anno_json,
            'annotarius_id' => $annotarius_id,
        ];

        if (!isset($result['class_counts'][$class_name])) {
            $result['class_counts'][$class_name] = 0;
        }
        $result['class_counts'][$class_name]++;
    }

    return $result;
}

// ============================================================
// Test data
// ============================================================

$yaml_sample = <<<YAML
path: /home/vi/autowire/ai_training/merged_dataset
train: images/train
val: images/val

nc: 104
names:
  1: hutschiene
  2: fi
  3: 4pol
  4: ein
  5: lsa
  43: klemme
  57: kabelkanal
  58: montageplatte
  68: reihenklemme
YAML;

$label_sample = <<<LABEL
43 0.478516 0.390381 0.180990 0.090332
68 0.588867 0.391357 0.048828 0.087402
5 0.634115 0.393311 0.050781 0.087402
5 0.678711 0.393799 0.050130 0.089355
5 0.726562 0.395020 0.053385 0.089844
5 0.775065 0.395996 0.055339 0.092773
5 0.824544 0.395752 0.059245 0.094238
5 0.871419 0.399902 0.061849 0.099609
5 0.852865 0.650635 0.053385 0.098145
2 0.778320 0.645508 0.102214 0.101562
2 0.681641 0.639404 0.098958 0.097168
2 0.588867 0.631348 0.095703 0.092773
57 0.457031 0.622803 0.169271 0.098145
58 0.661842 0.510537 0.542435 0.744380
LABEL;

// ============================================================
// TESTS
// ============================================================

echo "=== BATCH UPLOAD TEST SUITE (No DB) ===\n";
echo "Time: " . date('Y-m-d H:i:s') . "\n";
echo "Mode: Pure logic tests, no database connection\n";

// ----------------------------------------------------------
test_group("YAML Parsing: Basic");
// ----------------------------------------------------------

$names = parse_yaml_names($yaml_sample);
assert_equals(9, count($names), "Parsed 9 class names");
assert_equals('hutschiene', $names[1], "Class 1 = hutschiene");
assert_equals('fi', $names[2], "Class 2 = fi");
assert_equals('4pol', $names[3], "Class 3 = 4pol");
assert_equals('ein', $names[4], "Class 4 = ein");
assert_equals('lsa', $names[5], "Class 5 = lsa");
assert_equals('klemme', $names[43], "Class 43 = klemme");
assert_equals('kabelkanal', $names[57], "Class 57 = kabelkanal");
assert_equals('montageplatte', $names[58], "Class 58 = montageplatte");
assert_equals('reihenklemme', $names[68], "Class 68 = reihenklemme");

// Verify keys are integers, not strings
assert_true(array_key_exists(43, $names), "Key 43 exists as integer");
assert_true(array_key_exists(68, $names), "Key 68 exists as integer");

// ----------------------------------------------------------
test_group("YAML Parsing: Edge Cases");
// ----------------------------------------------------------

$yaml_empty = "path: /foo\nnc: 0\nnames:\n";
assert_count(0, parse_yaml_names($yaml_empty), "Empty names block returns 0 entries");

$yaml_no_names = "path: /foo\nnc: 5\n";
assert_count(0, parse_yaml_names($yaml_no_names), "No names block returns 0 entries");

$yaml_comments = "# comment\nnames:\n  # another comment\n  0: test_class\n  1: another_class\npath: /foo\n";
$names_comments = parse_yaml_names($yaml_comments);
assert_count(2, $names_comments, "Handles comments correctly");
assert_equals('test_class', $names_comments[0], "Class after comment parsed");
assert_equals('another_class', $names_comments[1], "Second class after comment parsed");

$yaml_trailing = "names:\n  0: class_with_spaces  \n  1:   padded_class\n";
$names_trailing = parse_yaml_names($yaml_trailing);
assert_equals('class_with_spaces', $names_trailing[0], "Trims trailing spaces");
assert_equals('padded_class', $names_trailing[1], "Trims leading spaces in value");

$yaml_windows = "names:\r\n  0: win_class\r\n  1: win_class2\r\n";
$names_win = parse_yaml_names($yaml_windows);
assert_count(2, $names_win, "Handles Windows (CRLF) line endings");
assert_equals('win_class', $names_win[0], "Windows line ending: class 0 correct");

$yaml_tabs = "names:\n\t0: tab_class\n\t1: tab_class2\n";
// This might not parse because we expect spaces, not tabs — let's test
$names_tabs = parse_yaml_names($yaml_tabs);
// The regex expects \s+ which includes tabs
assert_count(2, $names_tabs, "Handles tab indentation");

$yaml_large_indices = "names:\n  0: first\n  999: last\n  500: middle\n";
$names_large = parse_yaml_names($yaml_large_indices);
assert_count(3, $names_large, "Handles large non-sequential indices");
assert_equals('first', $names_large[0], "Large indices: class 0");
assert_equals('middle', $names_large[500], "Large indices: class 500");
assert_equals('last', $names_large[999], "Large indices: class 999");

$yaml_special_chars = "names:\n  0: class with spaces\n  1: class-with-dashes\n  2: class_with_underscores\n  3: UPPERCASE\n  4: MiXeD_CaSe\n  5: über-klasse\n  6: 4pol\n";
$names_special = parse_yaml_names($yaml_special_chars);
assert_count(7, $names_special, "Handles special characters in names");
assert_equals('class with spaces', $names_special[0], "Spaces in name preserved");
assert_equals('class-with-dashes', $names_special[1], "Dashes in name preserved");
assert_equals('class_with_underscores', $names_special[2], "Underscores in name preserved");
assert_equals('UPPERCASE', $names_special[3], "Uppercase preserved");
assert_equals('MiXeD_CaSe', $names_special[4], "Mixed case preserved");
assert_equals('über-klasse', $names_special[5], "Unicode characters preserved");
assert_equals('4pol', $names_special[6], "Name starting with number preserved");

// Names block followed by another key
$yaml_followed = "names:\n  0: alpha\n  1: beta\nother_key: value\n  2: gamma\n";
$names_followed = parse_yaml_names($yaml_followed);
assert_count(2, $names_followed, "Stops parsing at next top-level key");
assert_false(array_key_exists(2, $names_followed), "Does not include entries after top-level key");

// Completely empty input
assert_count(0, parse_yaml_names(""), "Empty string returns 0 entries");

// Only comments
assert_count(0, parse_yaml_names("# just a comment\n# another\n"), "Only comments returns 0 entries");

// ----------------------------------------------------------
test_group("YOLO Label Parsing: Basic");
// ----------------------------------------------------------

$annos = parse_yolo_label($label_sample);
assert_count(14, $annos, "Parsed 14 annotation lines");

assert_equals(43, $annos[0]['class_idx'], "Line 1: class = 43");
assert_equals_float(0.478516, $annos[0]['x_center'], "Line 1: x_center");
assert_equals_float(0.390381, $annos[0]['y_center'], "Line 1: y_center");
assert_equals_float(0.180990, $annos[0]['width'], "Line 1: width");
assert_equals_float(0.090332, $annos[0]['height'], "Line 1: height");

assert_equals(68, $annos[1]['class_idx'], "Line 2: class = 68");
assert_equals(5, $annos[2]['class_idx'], "Line 3: class = 5");
assert_equals(2, $annos[9]['class_idx'], "Line 10: class = 2");
assert_equals(57, $annos[12]['class_idx'], "Line 13: class = 57");
assert_equals(58, $annos[13]['class_idx'], "Line 14: class = 58");

// Verify last line values
assert_equals_float(0.661842, $annos[13]['x_center'], "Line 14: x_center");
assert_equals_float(0.510537, $annos[13]['y_center'], "Line 14: y_center");
assert_equals_float(0.542435, $annos[13]['width'], "Line 14: width");
assert_equals_float(0.744380, $annos[13]['height'], "Line 14: height");

// ----------------------------------------------------------
test_group("YOLO Label Parsing: Edge Cases");
// ----------------------------------------------------------

assert_count(0, parse_yolo_label(""), "Empty content = 0 annotations");
assert_count(0, parse_yolo_label("   \n\n  \t  \n"), "Whitespace-only = 0 annotations");

$label_blank_lines = "\n\n43 0.5 0.5 0.1 0.1\n\n\n5 0.3 0.3 0.2 0.2\n\n";
assert_count(2, parse_yolo_label($label_blank_lines), "Handles blank lines between entries");

$label_short = "43 0.5 0.5 0.1";
assert_count(0, parse_yolo_label($label_short), "Rejects lines with < 5 values");

$label_short2 = "43 0.5 0.5";
assert_count(0, parse_yolo_label($label_short2), "Rejects lines with 3 values");

$label_short3 = "43";
assert_count(0, parse_yolo_label($label_short3), "Rejects lines with 1 value");

$label_extra = "43 0.5 0.5 0.1 0.1 0.99 extra_data";
$annos_extra = parse_yolo_label($label_extra);
assert_count(1, $annos_extra, "Accepts lines with > 5 values (extra ignored)");
assert_equals(43, $annos_extra[0]['class_idx'], "Extra columns don't break class parsing");
assert_equals_float(0.1, $annos_extra[0]['width'], "Extra columns don't break width parsing");

$label_windows = "43 0.5 0.5 0.1 0.1\r\n5 0.3 0.3 0.2 0.2\r\n";
assert_count(2, parse_yolo_label($label_windows), "Handles Windows (CRLF) line endings");

$label_tabs = "43\t0.5\t0.5\t0.1\t0.1";
$annos_tabs = parse_yolo_label($label_tabs);
assert_count(1, $annos_tabs, "Handles tab-separated values");
assert_equals(43, $annos_tabs[0]['class_idx'], "Tab-separated: class correct");

$label_multi_space = "43   0.5   0.5   0.1   0.1";
$annos_ms = parse_yolo_label($label_multi_space);
assert_count(1, $annos_ms, "Handles multiple spaces between values");

// Class index 0
$label_zero = "0 0.5 0.5 0.1 0.1";
$annos_zero = parse_yolo_label($label_zero);
assert_count(1, $annos_zero, "Handles class index 0");
assert_equals(0, $annos_zero[0]['class_idx'], "Class index 0 parsed correctly");

// Very high class index
$label_high = "999 0.5 0.5 0.1 0.1";
$annos_high = parse_yolo_label($label_high);
assert_equals(999, $annos_high[0]['class_idx'], "Handles high class index (999)");

// Negative class index (unusual but test robustness)
$label_neg = "-1 0.5 0.5 0.1 0.1";
$annos_neg = parse_yolo_label($label_neg);
assert_equals(-1, $annos_neg[0]['class_idx'], "Handles negative class index");

// Non-numeric garbage line
$label_garbage = "hello world foo bar baz\n5 0.5 0.5 0.1 0.1\n";
$annos_garbage = parse_yolo_label($label_garbage);
// intval("hello") = 0, floatval("world") = 0.0 — line has 5 parts so it's "parsed"
assert_count(2, $annos_garbage, "Non-numeric line still parsed (intval/floatval handle it)");
assert_equals(0, $annos_garbage[0]['class_idx'], "Garbage class becomes 0 via intval");
assert_equals_float(0.0, $annos_garbage[0]['x_center'], "Garbage x_center becomes 0.0 via floatval");

// Single valid line
$label_single = "5 0.123 0.456 0.789 0.012";
$annos_single = parse_yolo_label($label_single);
assert_count(1, $annos_single, "Single line parsed");
assert_equals_float(0.123, $annos_single[0]['x_center'], "Single line x_center");
assert_equals_float(0.012, $annos_single[0]['height'], "Single line height");

// ----------------------------------------------------------
test_group("YOLO to Pixel Conversion: Basic");
// ----------------------------------------------------------

$img_w = 1000;
$img_h = 800;

// Center of image, 10% width, 20% height
list($x, $y, $w, $h) = yolo_to_pixel(0.5, 0.5, 0.1, 0.2, $img_w, $img_h);
assert_equals(450, $x, "Centered 10% box: x_start = 450");
assert_equals(320, $y, "Centered 20% box: y_start = 320");
assert_equals(100, $w, "Width = 100px");
assert_equals(160, $h, "Height = 160px");

// Verify: x + w should be 550, y + h should be 480
assert_equals(550, $x + $w, "x + w = 550");
assert_equals(480, $y + $h, "y + h = 480");

// Full image box
list($x, $y, $w, $h) = yolo_to_pixel(0.5, 0.5, 1.0, 1.0, $img_w, $img_h);
assert_equals(0, $x, "Full image: x_start = 0");
assert_equals(0, $y, "Full image: y_start = 0");
assert_equals(1000, $w, "Full image: width = 1000");
assert_equals(800, $h, "Full image: height = 800");

// Top-left corner small box
list($x, $y, $w, $h) = yolo_to_pixel(0.05, 0.05, 0.1, 0.1, $img_w, $img_h);
assert_equals(0, $x, "Top-left: x_start clamped to 0");
assert_equals(0, $y, "Top-left: y_start clamped to 0");
assert_equals(100, $w, "Top-left: width = 100");
assert_equals(80, $h, "Top-left: height = 80");

// ----------------------------------------------------------
test_group("YOLO to Pixel Conversion: Edge Cases");
// ----------------------------------------------------------

// Zero-size box
list($x, $y, $w, $h) = yolo_to_pixel(0.5, 0.5, 0.0, 0.0, 1000, 1000);
assert_equals(0, $w, "Zero-width YOLO box = 0px width");
assert_equals(0, $h, "Zero-height YOLO box = 0px height");

// Bottom-right corner (should clamp)
list($x, $y, $w, $h) = yolo_to_pixel(0.95, 0.95, 0.2, 0.2, $img_w, $img_h);
assert_true($x + $w <= $img_w, "Bottom-right: x+w does not exceed image width ($x + $w <= $img_w)");
assert_true($y + $h <= $img_h, "Bottom-right: y+h does not exceed image height ($y + $h <= $img_h)");
assert_true($x >= 0, "Bottom-right: x >= 0");
assert_true($y >= 0, "Bottom-right: y >= 0");

// Oversized box (larger than image)
list($x, $y, $w, $h) = yolo_to_pixel(0.5, 0.5, 2.0, 2.0, 1000, 1000);
assert_true($x >= 0, "Oversized: x >= 0");
assert_true($y >= 0, "Oversized: y >= 0");
assert_true($x + $w <= 1000, "Oversized: clamped to image width");
assert_true($y + $h <= 1000, "Oversized: clamped to image height");

// Negative center (unusual but possible in augmented datasets)
list($x, $y, $w, $h) = yolo_to_pixel(-0.1, -0.1, 0.1, 0.1, 1000, 1000);
assert_true($x >= 0, "Negative center: x clamped to >= 0");
assert_true($y >= 0, "Negative center: y clamped to >= 0");

// Very small image
list($x, $y, $w, $h) = yolo_to_pixel(0.5, 0.5, 0.5, 0.5, 1, 1);
assert_true($x >= 0 && $y >= 0, "Tiny image (1x1): coords non-negative");
assert_true($x + $w <= 1, "Tiny image: x+w <= 1");
assert_true($y + $h <= 1, "Tiny image: y+h <= 1");

// Large image
list($x, $y, $w, $h) = yolo_to_pixel(0.5, 0.5, 0.1, 0.1, 8000, 6000);
assert_equals(3600, $x, "Large image (8000x6000): x_start = 3600");
assert_equals(2700, $y, "Large image (8000x6000): y_start = 2700");
assert_equals(800, $w, "Large image: width = 800");
assert_equals(600, $h, "Large image: height = 600");

// Verify roundtrip: pixel coords back to relative should approximate original
$orig_xc = 0.5; $orig_yc = 0.5; $orig_wr = 0.1; $orig_hr = 0.1;
list($xp, $yp, $wp, $hp) = yolo_to_pixel($orig_xc, $orig_yc, $orig_wr, $orig_hr, 1920, 1080);
$back_xc = ($xp + $wp / 2) / 1920;
$back_yc = ($yp + $hp / 2) / 1080;
$back_wr = $wp / 1920;
$back_hr = $hp / 1080;
assert_equals_float($orig_xc, $back_xc, "Roundtrip: x_center preserved", 0.001);
assert_equals_float($orig_yc, $back_yc, "Roundtrip: y_center preserved", 0.001);
assert_equals_float($orig_wr, $back_wr, "Roundtrip: width preserved", 0.001);
assert_equals_float($orig_hr, $back_hr, "Roundtrip: height preserved", 0.001);

// Roundtrip with the real sample line: 43 0.478516 0.390381 0.180990 0.090332
list($xp, $yp, $wp, $hp) = yolo_to_pixel(0.478516, 0.390381, 0.180990, 0.090332, 1920, 1080);
$back_xc = ($xp + $wp / 2) / 1920;
$back_yc = ($yp + $hp / 2) / 1080;
assert_equals_float(0.478516, $back_xc, "Roundtrip real sample: x_center preserved", 0.002);
assert_equals_float(0.390381, $back_yc, "Roundtrip real sample: y_center preserved", 0.002);

// ----------------------------------------------------------
test_group("Filename Stem Extraction: Basic");
// ----------------------------------------------------------

assert_equals(
    'WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541',
    get_stem('WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541.jpg'),
    "Complex jpg filename"
);

assert_equals(
    'WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541',
    get_stem('WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541.txt'),
    "Matching txt filename"
);

// Verify image and label stems match
$img_stem = get_stem('WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541.jpg');
$lbl_stem = get_stem('WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541.txt');
assert_equals($img_stem, $lbl_stem, "Image and label stems match");

assert_equals('simple', get_stem('simple.png'), "Simple png");
assert_equals('simple', get_stem('simple.txt'), "Simple txt");
assert_equals('simple', get_stem('simple.jpg'), "Simple jpg");
assert_equals('simple', get_stem('simple.jpeg'), "Simple jpeg");
assert_equals('simple', get_stem('simple.bmp'), "Simple bmp");
assert_equals('simple', get_stem('simple.webp'), "Simple webp");

assert_equals('file.with.dots', get_stem('file.with.dots.jpg'), "File with dots in name (jpg)");
assert_equals('file.with.dots', get_stem('file.with.dots.txt'), "File with dots in name (txt)");

assert_equals(
    'IMG_0154_jpg.rf.bee0c2896be8448f1c1dabf4263dd7c1',
    get_stem('IMG_0154_jpg.rf.bee0c2896be8448f1c1dabf4263dd7c1.jpg'),
    "Real sample image filename"
);

// ----------------------------------------------------------
test_group("Filename Stem Extraction: Edge Cases");
// ----------------------------------------------------------

// Case insensitive extensions
assert_equals('test', get_stem('test.JPG'), "Uppercase JPG");
assert_equals('test', get_stem('test.TXT'), "Uppercase TXT");
assert_equals('test', get_stem('test.Png'), "Mixed case Png");
assert_equals('test', get_stem('test.JPEG'), "Uppercase JPEG");
assert_equals('test', get_stem('test.BMP'), "Uppercase BMP");
assert_equals('test', get_stem('test.WebP'), "Mixed case WebP");

// No extension
assert_equals('noextension', get_stem('noextension'), "No extension returns full name");

// Unknown extension (should NOT be stripped)
assert_equals('file.pdf', get_stem('file.pdf'), "Non-image/txt extension preserved");
assert_equals('file.csv', get_stem('file.csv'), "CSV extension preserved");

// Double extension
assert_equals('file.txt', get_stem('file.txt.jpg'), "Double extension: .txt.jpg strips .jpg");

// Empty string
assert_equals('', get_stem(''), "Empty string returns empty");

// Just an extension
assert_equals('', get_stem('.jpg'), "Just .jpg returns empty stem");
assert_equals('', get_stem('.txt'), "Just .txt returns empty stem");

// ----------------------------------------------------------
test_group("Filename Stem Matching: Batch Pairing Simulation");
// ----------------------------------------------------------

// Simulate the JS-side pairing logic
$image_filenames = [
    'IMG_0154_jpg.rf.bee0c2896be8448f1c1dabf4263dd7c1.jpg',
    'IMG_0469_jpg.rf.1b264a2d416c40e047f22888053e5073.jpg',
    'WhatsApp-Image-2025-07-08-at-16_36_50_jpeg.rf.4b27fda62ca4f6f2d70f6f3c8eff06b6.jpg',
    'WhatsApp-Image-2025-07-08-at-16_37_41-5-_jpeg.rf.b2bb6674fe1d60acd04ec8a9c1f630d0.jpg',
    'WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541.jpg',
    'WhatsApp-Image-2025-07-08-at-16_37_47-6-_jpeg.rf.525b945bed713e1a5e96363e4dc5303a.jpg',
    'orphan_image.png',
];

$label_filenames = [
    'IMG_0154_jpg.rf.bee0c2896be8448f1c1dabf4263dd7c1.txt',
    'IMG_0469_jpg.rf.1b264a2d416c40e047f22888053e5073.txt',
    'WhatsApp-Image-2025-07-08-at-16_36_50_jpeg.rf.4b27fda62ca4f6f2d70f6f3c8eff06b6.txt',
    'WhatsApp-Image-2025-07-08-at-16_37_41-5-_jpeg.rf.b2bb6674fe1d60acd04ec8a9c1f630d0.txt',
    'WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541.txt',
    'WhatsApp-Image-2025-07-08-at-16_37_47-6-_jpeg.rf.525b945bed713e1a5e96363e4dc5303a.txt',
    'orphan_label.txt',
];

$img_by_stem = [];
foreach ($image_filenames as $f) {
    $img_by_stem[get_stem($f)] = $f;
}

$lbl_by_stem = [];
foreach ($label_filenames as $f) {
    $lbl_by_stem[get_stem($f)] = $f;
}

$all_stems = array_unique(array_merge(array_keys($img_by_stem), array_keys($lbl_by_stem)));
$matched = 0;
$img_only = 0;
$lbl_only = 0;

foreach ($all_stems as $stem) {
    $has_img = isset($img_by_stem[$stem]);
    $has_lbl = isset($lbl_by_stem[$stem]);
    if ($has_img && $has_lbl) $matched++;
    elseif ($has_img) $img_only++;
    else $lbl_only++;
}

assert_equals(6, $matched, "Pairing: 6 matched pairs");
assert_equals(1, $img_only, "Pairing: 1 image without label (orphan_image.png)");
assert_equals(1, $lbl_only, "Pairing: 1 label without image (orphan_label.txt)");

// ----------------------------------------------------------
test_group("Class Name Resolution");
// ----------------------------------------------------------

$yaml_names = parse_yaml_names($yaml_sample);

assert_equals('klemme', resolve_class_name(43, $yaml_names), "Resolve class 43 = klemme");
assert_equals('fi', resolve_class_name(2, $yaml_names), "Resolve class 2 = fi");
assert_equals('lsa', resolve_class_name(5, $yaml_names), "Resolve class 5 = lsa");
assert_equals('reihenklemme', resolve_class_name(68, $yaml_names), "Resolve class 68 = reihenklemme");
assert_equals('montageplatte', resolve_class_name(58, $yaml_names), "Resolve class 58 = montageplatte");
assert_equals('kabelkanal', resolve_class_name(57, $yaml_names), "Resolve class 57 = kabelkanal");
assert_equals('hutschiene', resolve_class_name(1, $yaml_names), "Resolve class 1 = hutschiene");
assert_equals('4pol', resolve_class_name(3, $yaml_names), "Resolve class 3 = 4pol");
assert_equals('ein', resolve_class_name(4, $yaml_names), "Resolve class 4 = ein");

// Non-existent class
assert_equals(null, resolve_class_name(0, $yaml_names), "Resolve class 0 = null (not in YAML)");
assert_equals(null, resolve_class_name(999, $yaml_names), "Resolve class 999 = null (not in YAML)");
assert_equals(null, resolve_class_name(-1, $yaml_names), "Resolve class -1 = null");

// String key lookup (simulating JSON decode where keys become strings)
$string_keyed = ["43" => "klemme", "2" => "fi"];
assert_equals('klemme', resolve_class_name(43, $string_keyed), "Resolve with string-keyed mapping (43)");
assert_equals('fi', resolve_class_name(2, $string_keyed), "Resolve with string-keyed mapping (2)");

// ----------------------------------------------------------
test_group("Annotation JSON Structure");
// ----------------------------------------------------------

$json = build_annotation_json('fi', 100, 200, 300, 400, 'test_image.jpg', '#test_anno_1');

assert_equals('Annotation', $json['type'], "JSON: type = Annotation");
assert_equals('http://www.w3.org/ns/anno.jsonld', $json['@context'], "JSON: @context correct");
assert_equals('#test_anno_1', $json['id'], "JSON: id correct");

// Body
assert_true(is_array($json['body']), "JSON: body is array");
assert_equals(1, count($json['body']), "JSON: body has 1 item");
assert_equals('TextualBody', $json['body'][0]['type'], "JSON: body type = TextualBody");
assert_equals('fi', $json['body'][0]['value'], "JSON: body value = fi");
assert_equals('tagging', $json['body'][0]['purpose'], "JSON: body purpose = tagging");

// Target
assert_true(is_array($json['target']), "JSON: target is array");
assert_contains($json['target']['source'], 'test_image.jpg', "JSON: target source contains filename");
assert_contains($json['target']['source'], 'print_image.php', "JSON: target source uses print_image.php");
assert_equals('FragmentSelector', $json['target']['selector']['type'], "JSON: selector type = FragmentSelector");
assert_equals('http://www.w3.org/TR/media-frags/', $json['target']['selector']['conformsTo'], "JSON: selector conformsTo correct");
assert_equals('xywh=pixel:100,200,300,400', $json['target']['selector']['value'], "JSON: selector value = xywh=pixel:100,200,300,400");

// Verify JSON is serializable
$encoded = json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
assert_true($encoded !== false, "JSON: serializable without errors");
assert_true(strlen($encoded) > 50, "JSON: serialized string has reasonable length");

// Verify JSON roundtrip
$decoded = json_decode($encoded, true);
assert_equals($json['id'], $decoded['id'], "JSON: roundtrip preserves id");
assert_equals($json['body'][0]['value'], $decoded['body'][0]['value'], "JSON: roundtrip preserves body value");

// ----------------------------------------------------------
test_group("Full Pipeline Simulation (No DB)");
// ----------------------------------------------------------

$yaml_names = parse_yaml_names($yaml_sample);
$db_filename = 'WhatsApp-Image-2025-07-08-at-16_37_46-2-_jpeg.rf.e7bcaf66e0f940827a35943266971541.jpg';
$batch_uuid = 'test_pipeline_' . time();
$fake_image_id = 42;

$result = simulate_pipeline($label_sample, $yaml_names, 1920, 1080, $db_filename, $batch_uuid, $fake_image_id);

assert_count(14, $result['annotations'], "Pipeline: 14 annotations created");
assert_count(0, $result['errors'], "Pipeline: 0 errors" . (count($result['errors']) > 0 ? " (" . implode("; ", $result['errors']) . ")" : ""));
assert_true($result['all_in_bounds'], "Pipeline: all annotations within image bounds" . (count($result['bound_errors']) > 0 ? " (" . implode(", ", $result['bound_errors']) . ")" : ""));

// Verify class distribution
assert_equals(7, $result['class_counts']['lsa'] ?? 0, "Pipeline: 7 'lsa' (class 5)");
assert_equals(3, $result['class_counts']['fi'] ?? 0, "Pipeline: 3 'fi' (class 2)");
assert_equals(1, $result['class_counts']['klemme'] ?? 0, "Pipeline: 1 'klemme' (class 43)");
assert_equals(1, $result['class_counts']['reihenklemme'] ?? 0, "Pipeline: 1 'reihenklemme' (class 68)");
assert_equals(1, $result['class_counts']['kabelkanal'] ?? 0, "Pipeline: 1 'kabelkanal' (class 57)");
assert_equals(1, $result['class_counts']['montageplatte'] ?? 0, "Pipeline: 1 'montageplatte' (class 58)");

// Verify first annotation details
$first = $result['annotations'][0];
assert_equals('klemme', $first['class_name'], "Pipeline first: class_name = klemme");
assert_equals(43, $first['class_idx'], "Pipeline first: class_idx = 43 (original YOLO index preserved in data)");
assert_true($first['x'] >= 0, "Pipeline first: x >= 0");
assert_true($first['y'] >= 0, "Pipeline first: y >= 0");
assert_true($first['w'] > 0, "Pipeline first: w > 0");
assert_true($first['h'] > 0, "Pipeline first: h > 0");
assert_true($first['x'] + $first['w'] <= 1920, "Pipeline first: x+w <= 1920");
assert_true($first['y'] + $first['h'] <= 1080, "Pipeline first: y+h <= 1080");
assert_contains($first['annotarius_id'], $batch_uuid, "Pipeline first: annotarius_id contains batch_uuid");
assert_contains($first['annotarius_id'], '#batch_', "Pipeline first: annotarius_id starts with #batch_");

// Verify last annotation (montageplatte, the big box)
$last = $result['annotations'][13];
assert_equals('montageplatte', $last['class_name'], "Pipeline last: class_name = montageplatte");
assert_true($last['w'] > 500, "Pipeline last: montageplatte box is wide (>500px)");
assert_true($last['h'] > 500, "Pipeline last: montageplatte box is tall (>500px)");

// Verify JSON structure of first annotation
$first_json = $first['json'];
assert_equals('Annotation', $first_json['type'], "Pipeline first JSON: type = Annotation");
assert_equals('klemme', $first_json['body'][0]['value'], "Pipeline first JSON: body value = klemme");

// ----------------------------------------------------------
test_group("Pipeline: Empty Label");
// ----------------------------------------------------------

$result_empty = simulate_pipeline("", $yaml_names, 1920, 1080, 'test.jpg', 'batch_empty', 1);
assert_count(0, $result_empty['annotations'], "Empty label: 0 annotations");
assert_count(0, $result_empty['errors'], "Empty label: 0 errors");

$result_null = simulate_pipeline(null, $yaml_names, 1920, 1080, 'test.jpg', 'batch_null', 1);
assert_count(0, $result_null['annotations'], "Null label: 0 annotations");

$result_ws = simulate_pipeline("  \n\n  \t  \n", $yaml_names, 1920, 1080, 'test.jpg', 'batch_ws', 1);
assert_count(0, $result_ws['annotations'], "Whitespace label: 0 annotations");

// ----------------------------------------------------------
test_group("Pipeline: Missing Classes in YAML");
// ----------------------------------------------------------

// Use a label with class indices not in the YAML
$label_missing = "0 0.5 0.5 0.1 0.1\n99 0.3 0.3 0.2 0.2\n5 0.7 0.7 0.1 0.1\n";
$result_missing = simulate_pipeline($label_missing, $yaml_names, 1920, 1080, 'test.jpg', 'batch_miss', 1);
assert_count(1, $result_missing['annotations'], "Missing classes: only 1 valid annotation (class 5)");
assert_count(2, $result_missing['errors'], "Missing classes: 2 errors (class 0 and 99 not in YAML)");
assert_equals('lsa', $result_missing['annotations'][0]['class_name'], "Missing classes: valid annotation is 'lsa'");

// ----------------------------------------------------------
test_group("Pipeline: All Classes Missing");
// ----------------------------------------------------------

$label_all_missing = "0 0.5 0.5 0.1 0.1\n99 0.3 0.3 0.2 0.2\n100 0.7 0.7 0.1 0.1\n";
$result_all_missing = simulate_pipeline($label_all_missing, $yaml_names, 1920, 1080, 'test.jpg', 'batch_all_miss', 1);
assert_count(0, $result_all_missing['annotations'], "All missing: 0 annotations");
assert_count(3, $result_all_missing['errors'], "All missing: 3 errors");

// ----------------------------------------------------------
test_group("Pipeline: Malformed Lines Mixed with Valid");
// ----------------------------------------------------------

$label_mixed = "5 0.5 0.5 0.1 0.1\ngarbage line\n2 0.3 0.3 0.2 0.2\nshort\n43 0.7 0.7 0.1 0.1\n";
$result_mixed = simulate_pipeline($label_mixed, $yaml_names, 1920, 1080, 'test.jpg', 'batch_mixed', 1);
// "garbage line" has only 2 parts -> skipped by parse_yolo_label
// "short" has only 1 part -> skipped
assert_count(3, $result_mixed['annotations'], "Mixed: 3 valid annotations");
assert_equals('lsa', $result_mixed['annotations'][0]['class_name'], "Mixed: first = lsa");
assert_equals('fi', $result_mixed['annotations'][1]['class_name'], "Mixed: second = fi");
assert_equals('klemme', $result_mixed['annotations'][2]['class_name'], "Mixed: third = klemme");

// ----------------------------------------------------------
test_group("Pipeline: Different Image Sizes");
// ----------------------------------------------------------

$single_label = "5 0.5 0.5 0.1 0.1\n";

// Small image
$r_small = simulate_pipeline($single_label, $yaml_names, 100, 100, 'small.jpg', 'b', 1);
assert_count(1, $r_small['annotations'], "Small image: 1 annotation");
$a = $r_small['annotations'][0];
assert_true($a['x'] + $a['w'] <= 100, "Small image: within bounds");
assert_true($a['y'] + $a['h'] <= 100, "Small image: within bounds (y)");

// 4K image
$r_4k = simulate_pipeline($single_label, $yaml_names, 3840, 2160, '4k.jpg', 'b', 1);
$a = $r_4k['annotations'][0];
assert_equals(384, $a['w'], "4K image: width = 384 (0.1 * 3840)");
assert_equals(216, $a['h'], "4K image: height = 216 (0.1 * 2160)");

// 1x1 image
$r_tiny = simulate_pipeline($single_label, $yaml_names, 1, 1, 'tiny.jpg', 'b', 1);
// 0.1 * 1 = 0.1 -> round = 0 -> zero dimension -> should be skipped
assert_count(0, $r_tiny['annotations'], "1x1 image: annotation skipped (zero pixel dimensions)");
assert_count(1, $r_tiny['errors'], "1x1 image: 1 error for zero dimensions");

// ----------------------------------------------------------
test_group("Pipeline: Annotarius ID Uniqueness");
// ----------------------------------------------------------

$result = simulate_pipeline($label_sample, $yaml_names, 1920, 1080, 'test.jpg', 'unique_batch', 99);
$ids = array_map(function($a) { return $a['annotarius_id']; }, $result['annotations']);
$unique_ids = array_unique($ids);
assert_equals(count($ids), count($unique_ids), "All annotarius_ids are unique within a batch");

// Verify format
foreach ($ids as $id) {
    assert_contains($id, '#batch_unique_batch_99_', "Annotarius ID contains batch_uuid and image_id");
}

// ----------------------------------------------------------
test_group("Pipeline: Coordinate Precision for All 14 Sample Lines");
// ----------------------------------------------------------

$result = simulate_pipeline($label_sample, $yaml_names, 1920, 1080, 'test.jpg', 'precision_batch', 1);

foreach ($result['annotations'] as $i => $anno) {
    $label = "Anno " . ($i + 1) . " (" . $anno['class_name'] . ")";
    assert_true($anno['x'] >= 0, "$label: x >= 0");
    assert_true($anno['y'] >= 0, "$label: y >= 0");
    assert_true($anno['w'] > 0, "$label: w > 0");
    assert_true($anno['h'] > 0, "$label: h > 0");
    assert_true($anno['x'] + $anno['w'] <= 1920, "$label: x+w <= 1920 (got " . ($anno['x'] + $anno['w']) . ")");
    assert_true($anno['y'] + $anno['h'] <= 1080, "$label: y+h <= 1080 (got " . ($anno['y'] + $anno['h']) . ")");
}

// ----------------------------------------------------------
test_group("Batch UUID Generation Pattern");
// ----------------------------------------------------------

// Verify the pattern used in JS: 'batch_' + Date.now() + '_' + random
$uuids = [];
for ($i = 0; $i < 100; $i++) {
    $uuid = 'batch_' . microtime(true) . '_' . bin2hex(random_bytes(4));
    $uuids[] = $uuid;
}
$unique = array_unique($uuids);
assert_equals(100, count($unique), "100 generated batch UUIDs are all unique");

// Verify format
assert_true(strpos($uuids[0], 'batch_') === 0, "UUID starts with 'batch_'");
assert_true(strlen($uuids[0]) > 20, "UUID has reasonable length (>20 chars)");

// ----------------------------------------------------------
test_group("SQL Statement Construction (String Safety)");
// ----------------------------------------------------------

// Test that filenames with special characters would be safe
$dangerous_names = [
    "file'with'quotes.jpg",
    'file"with"doublequotes.jpg',
    "file\\with\\backslashes.jpg",
    "file;DROP TABLE image;--.jpg",
    "file\x00null.jpg",
    "file with spaces.jpg",
    "über-datei.jpg",
    "файл.jpg",
];

foreach ($dangerous_names as $name) {
    // Verify get_stem doesn't crash
    $stem = get_stem($name);
    assert_true($stem !== null, "get_stem handles: " . substr(preg_replace('/[^\x20-\x7E]/', '?', $name), 0, 40));

    // Verify build_annotation_json doesn't crash
    $json = build_annotation_json('test', 10, 10, 50, 50, $name, '#test');
    assert_true($json !== null, "build_annotation_json handles: " . substr(preg_replace('/[^\x20-\x7E]/', '?', $name), 0, 40));

    // Verify JSON encoding doesn't fail
    $encoded = json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    assert_true($encoded !== false, "JSON encode handles: " . substr(preg_replace('/[^\x20-\x7E]/', '?', $name), 0, 40));
}

// ----------------------------------------------------------
test_group("Performance: Large Label File");
// ----------------------------------------------------------

// Generate a label file with 1000 lines
$large_label = "";
$classes_in_yaml = array_keys($yaml_names);
for ($i = 0; $i < 1000; $i++) {
    $cls = $classes_in_yaml[$i % count($classes_in_yaml)];
    $xc = 0.1 + ($i % 10) * 0.08;
    $yc = 0.1 + (intval($i / 10) % 10) * 0.08;
    $large_label .= "$cls $xc $yc 0.05 0.05\n";
}

$start = microtime(true);
$result_large = simulate_pipeline($large_label, $yaml_names, 1920, 1080, 'large.jpg', 'perf_batch', 1);
$elapsed = microtime(true) - $start;

assert_count(1000, $result_large['annotations'], "Large file: 1000 annotations parsed");
assert_count(0, $result_large['errors'], "Large file: 0 errors");
assert_true($elapsed < 1.0, "Large file: processed in < 1 second (took " . round($elapsed, 3) . "s)");
echo "  ℹ 1000 annotations processed in " . round($elapsed * 1000, 1) . "ms\n";

// ----------------------------------------------------------
test_group("Performance: YAML Parsing Large File");
// ----------------------------------------------------------

$large_yaml = "names:\n";
for ($i = 0; $i < 500; $i++) {
    $large_yaml .= "  $i: class_$i\n";
}
$large_yaml .= "other_key: value\n";

$start = microtime(true);
$large_names = parse_yaml_names($large_yaml);
$elapsed = microtime(true) - $start;

assert_count(500, $large_names, "Large YAML: 500 classes parsed");
assert_equals('class_0', $large_names[0], "Large YAML: first class correct");
assert_equals('class_499', $large_names[499], "Large YAML: last class correct");
assert_true($elapsed < 0.1, "Large YAML: parsed in < 100ms (took " . round($elapsed * 1000, 1) . "ms)");

// ============================================================
// SUMMARY
// ============================================================
echo "\n";
echo "============================================\n";
echo "  TEST RESULTS\n";
echo "============================================\n";
echo "  Passed: $test_passed\n";
echo "  Failed: $test_failed\n";
echo "  Total:  " . ($test_passed + $test_failed) . "\n";
echo "============================================\n";

if ($test_failed > 0) {
    echo "\n  FAILURES:\n";
    foreach ($test_errors as $err) {
        echo "    • $err\n";
    }
    echo "\n";
} else {
    echo "\n  ✓ ALL TESTS PASSED\n\n";
}

$exit_code = ($test_failed > 0) ? 1 : 0;
echo "Exit code: $exit_code\n";

if (!$is_cli) {
    echo "</pre>";
}

exit($exit_code);
?>
