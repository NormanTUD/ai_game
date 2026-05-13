<?php
	include_once("functions.php");

	$used_model = "";

	if (!isset($_POST["source"])) die("No source given");
	if (!isset($_POST["id"])) die("No ID given");
	if (isset($_POST["used_model"])) {
		$used_model = $_POST["used_model"];
	}

	$filename = urldecode(html_entity_decode($_POST["source"]));
	$filename = preg_replace("/print_image.php.filename=/", "", $filename);
	$filename = preg_replace("/&_=.*/", "", $filename);

	$image_id = get_or_create_image_id("", $filename);
	if (!$image_id) die("Could not get image id for $filename");

	$user_id = get_or_create_user_id($_COOKIE["annotate_userid"]);
	$base_annotarius_id = $_POST["id"];

	$parsed_position = parse_position($_POST["position"], get_image_width($image_id), get_image_height($image_id));
	list($x_start, $y_start, $w, $h) = $parsed_position;

	if (!isset($_POST["body"]) || !is_array($_POST["body"]) || count($_POST["body"]) === 0)
		die("Label not properly found");

	$saved_categories = [];
	$counter = 1;

	// if original 'full' exists and is JSON, decode it once to reuse as template
	$original_full = null;
	if (isset($_POST['full'])) {
		$decoded = json_decode($_POST['full'], true);
		if (json_last_error() === JSON_ERROR_NONE) $original_full = $decoded;
	}

	foreach ($_POST["body"] as $body_item) {
		if (!isset($body_item["value"])) continue;

		$category_name = trim($body_item["value"]);
		$category_id = get_or_create_category_id($category_name);

		// create a unique annotarius id variant so inserts don't collide
		$annotarius_id = $base_annotarius_id . "_" . $counter;

		// Build a per-tag POST-like structure that contains only this body element
		$per_post = $_POST;
		$per_post['body'] = array($body_item);
		$per_post['id'] = $annotarius_id;

		// If there was a 'full' JSON originally, build a per-tag full with only this body
		if ($original_full !== null) {
			$per_full = $original_full;
			$per_full['body'] = array($body_item);
			$per_full['id'] = $annotarius_id;
			$per_post['full'] = json_encode($per_full, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		} else {
			// otherwise create a minimal full representation
			$per_full = array(
				'type' => 'Annotation',
				'body' => array($body_item),
				'target' => array(
					'source' => isset($_POST['source']) ? $_POST['source'] : null,
					'selector' => array(
						'type' => 'FragmentSelector',
						'value' => isset($_POST['position']) ? $_POST['position'] : null
					)
				),
				'id' => $annotarius_id,
				'@context' => 'http://www.w3.org/ns/anno.jsonld'
			);
			$per_post['full'] = json_encode($per_full, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		}

		// encode the per-post JSON for storage (only this single body inside)
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

		$saved_categories[] = htmlspecialchars($category_name, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') . " (anno-id: $anno_id)";
		$counter++;
	}

	if (count($saved_categories) > 0) {
		print "Annotation categories saved for image <i>$filename</i>: " . implode(", ", $saved_categories);
	} else {
		die("No categories saved");
	}
?>
