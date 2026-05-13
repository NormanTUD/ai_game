<?php
	include_once("functions.php");

	$first_other = 0;
	if(array_key_exists("first_other", $_GET)) {
		$first_other = 1;
	}

	if(array_key_exists("source", $_GET)) {
		$query = "select a.json, a.annotarius_id from annotation a 
			left join image i on a.image_id = i.id 
			left join user u on u.id = a.user_id 
			where i.filename = ".esc($_GET["source"])."
			and a.deleted = 0 and i.deleted = 0";

		if(!$first_other) {
			$query .= " and u.name = ".esc($_COOKIE["annotate_userid"]);
		}

		$res = rquery($query);

		$raw_annotations = [];

		while ($row = mysqli_fetch_row($res)) {
			$annotarius_id = $row[1];
			$decoded_json = json_decode(stripcslashes($row[0]), true);
			$full = json_decode($decoded_json["full"], true);

			if (!$full) continue;

			$raw_annotations[] = [
				'annotarius_id' => $annotarius_id,
				'full' => $full
			];
		}

		// Group by the FULL annotarius_id (do NOT strip suffix).
		// Multiple rows with the same annotarius_id are body tags
		// for the same bounding box.
		$grouped = [];

		foreach ($raw_annotations as $entry) {
			$annotarius_id = $entry['annotarius_id'];
			$full = $entry['full'];

			if (!isset($grouped[$annotarius_id])) {
				$full['id'] = $annotarius_id;
				$grouped[$annotarius_id] = $full;
			} else {
				// Merge body tags from the same box
				if (isset($full['body']) && is_array($full['body'])) {
					foreach ($full['body'] as $body_item) {
						$exists = false;
						foreach ($grouped[$annotarius_id]['body'] as $existing) {
							if (isset($existing['value']) && isset($body_item['value']) &&
								$existing['value'] === $body_item['value']) {
								$exists = true;
								break;
							}
						}
						if (!$exists) {
							$grouped[$annotarius_id]['body'][] = $body_item;
						}
					}
				}
			}
		}

		// Deduplicate by position: if two different annotarius_ids
		// have the exact same bounding box, merge them into one.
		$by_position = [];

		foreach ($grouped as $annotation) {
			$pos = isset($annotation['target']['selector']['value'])
				? $annotation['target']['selector']['value']
				: null;

			if ($pos === null) {
				$by_position[] = $annotation;
				continue;
			}

			if (!isset($by_position[$pos])) {
				$by_position[$pos] = $annotation;
			} else {
				if (isset($annotation['body']) && is_array($annotation['body'])) {
					foreach ($annotation['body'] as $body_item) {
						$exists = false;
						foreach ($by_position[$pos]['body'] as $existing) {
							if (isset($existing['value']) && isset($body_item['value']) &&
								$existing['value'] === $body_item['value']) {
								$exists = true;
								break;
							}
						}
						if (!$exists) {
							$by_position[$pos]['body'][] = $body_item;
						}
					}
				}
			}
		}

		$jsons = array_values($by_position);

		print json_encode($jsons, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
	} else {
		print("[]");
		exit(0);
	}
?>
