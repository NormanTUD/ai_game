<?php
	include_once("functions.php");

	header('Content-Type: text/html; charset=utf-8');

	if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
		http_response_code(405);
		die("Method not allowed. Use POST.");
	}

	$input = json_decode(file_get_contents('php://stdin') ?: file_get_contents('php://input'), true);

	if (!$input || !isset($input['annotations']) || !is_array($input['annotations'])) {
		http_response_code(400);
		die("Invalid or missing 'annotations' array in request body.");
	}

	$annotations = $input['annotations'];

	if (count($annotations) === 0) {
		echo "OK Deleted 0 annotations";
		exit(0);
	}

	$annotate_userid = $_COOKIE["annotate_userid"] ?? null;

	if (!$annotate_userid) {
		http_response_code(400);
		die("No user cookie set.");
	}

	$user_id = get_or_create_user_id($annotate_userid);
	$deleted_count = 0;

	foreach ($annotations as $annotation) {
		if (!isset($annotation['id']) || empty($annotation['id'])) {
			continue;
		}

		$annotarius_id = $annotation['id'];

		// Strip leading '#' if present (Annotorious uses #uuid format)
		if (strpos($annotarius_id, '#') === 0) {
			$annotarius_id = substr($annotarius_id, 1);
		}

		// Try deleting with the stripped ID first
		flag_deleted($annotarius_id);

		// If nothing was deleted, try with the original (with #)
		if (mysqli_affected_rows($GLOBALS['dbh']) === 0) {
			flag_deleted($annotation['id']);
		}

		if (mysqli_affected_rows($GLOBALS['dbh']) > 0) {
			$deleted_count++;
		}
	}

	echo "OK Deleted $deleted_count annotations";
?>
