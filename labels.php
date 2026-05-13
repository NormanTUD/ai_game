<?php
	include_once("functions.php");

	$model_uuid = $_GET['model_uuid'] ?? null;

	$labels_from_db = [];
	$loaded_from_db = 0;

	if ($model_uuid) {
		// Labels aus der neuen Tabelle holen
		$safe_uuid = addslashes($model_uuid);
		$query = "SELECT ml.label_name FROM model_labels ml JOIN models m ON ml.model_id = m.id WHERE m.uuid = '$safe_uuid' ORDER BY ml.label_index ASC";
		$res = rquery($query);

		while ($row = mysqli_fetch_assoc($res)) {
			$labels_from_db[] = $row['label_name'];
		}

		if (!empty($labels_from_db)) {
			$loaded_from_db = 1;
		}
	}

	$labels = [];

	if (!$loaded_from_db) {
		// Fallback auf alte labels.json
		$query = "SELECT file_contents FROM models WHERE filename = 'labels.json' ORDER BY upload_time DESC LIMIT 1";
		$res = rquery($query);

		if ($row = mysqli_fetch_assoc($res)) {
			$contents = $row['file_contents'];
			$json = json_decode($contents, true);
			if (is_array($json)) {
				print json_encode($json);
				exit;
			}
		}

		// Alte Kategorie-Tabelle
		include("export_helper.php");

		$categories = [];
		$res = rquery('SELECT name FROM category ORDER BY id');
		while ($row = mysqli_fetch_row($res)) {
			if (!in_array($row[0], $categories)) {
				$categories[] = $row[0];
			}
		}

		foreach ($categories as $cat) {
			$labels[] = $cat;
		}
	} else {
		// Alte Kategorien ergänzen, falls nicht schon in model_labels
		include("export_helper.php");

		$categories = [];
		$res = rquery('SELECT name FROM category ORDER BY id');
		while ($row = mysqli_fetch_row($res)) {
			$categories[] = $row[0];
		}

		foreach ($categories as $cat) {
			if (!in_array($cat, $labels_from_db)) {
				$labels_from_db[] = $cat;
			}
		}

		$labels = $labels_from_db;
	}

	print json_encode($labels);
?>
