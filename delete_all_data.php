<?php
	include_once("functions.php");

	function delete_all_data() {
		header('Content-Type: application/json');

		$keyfile = '/etc/delete_all_key';

		if (!isset($_GET['delete_key'])) {
			http_response_code(400);
			echo json_encode(["error" => "Missing delete_key."]);
			return;
		}

		if (!is_readable($keyfile)) {
			http_response_code(403);
			echo json_encode(["error" => "Security key file not found or not readable."]);
			return;
		}

		$expected_key = trim(file_get_contents($keyfile));
		$provided_key = trim($_GET['delete_key']);

		if ($expected_key === '' || $provided_key !== $expected_key) {
			http_response_code(403);
			echo json_encode(["error" => "Invalid delete_key."]);
			return;
		}

		$queries = [
			"DELETE FROM model_labels",
			"DELETE FROM models",
			"DELETE FROM annotation",
			"DELETE FROM image_data",
			"DELETE FROM category",
			"DELETE FROM user",
			"DELETE FROM image"
		];

		foreach ($queries as $sql) {
			$ok = rquery($sql);
			if (!$ok) {
				http_response_code(500);
				echo json_encode(["error" => "Failed executing: $sql"]);
				return;
			}
		}

		echo json_encode(["success" => true, "message" => "All data deleted."]);
	}

	delete_all_data();
?>
