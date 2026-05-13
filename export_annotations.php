<?php
	ini_set('memory_limit', '16384M');
	ini_set('max_execution_time', '3600');
	set_time_limit(3600);

	include_once("functions.php");
	include_once("export_helper.php");

	if(get_get("curate_on_click") && get_get("delete_on_click")) {
		die("Either curate or delete on click, not both");
	}

	$items_per_page = get_param("items_per_page", 500);

	$images_and_number_of_rows_and_format_and_categories = get_annotated_images();
	$images = $images_and_number_of_rows_and_format_and_categories[0];
	$number_of_rows = $images_and_number_of_rows_and_format_and_categories[1];
	$format = $images_and_number_of_rows_and_format_and_categories[2];
	$categories = $images_and_number_of_rows_and_format_and_categories[3];

	if ($format == "html") {
		print_export_html_and_exit($number_of_rows, $items_per_page, $images);
	}

	$tmp_dir = create_tmp_dir();

	$validation_split = get_get("validation_split", 0);
	$epochs = get_get("epochs", 50);
	$model_name = get_get("model_name", "yolo11s.yaml");

	if(is_dir($tmp_dir)) {
		$dataset_yaml = "path: ./\n";
		$dataset_yaml .= "train: images/\n";
		if($validation_split) {
			$dataset_yaml .= "val: validation/\n";
		} else {
			$dataset_yaml .= "val: images/\n";
		}

		$dataset_yaml .= "names:\n";

		$labels_json = "";
		$_labels = [];

		// NEU: Alle Kategorien aus der DB holen (nicht nur die aktuell annotierten)
		$category_numbers = array();
		$_labels = [];

		$cat_query = "SELECT id - 1, name FROM category ORDER BY id ASC";
		$cat_res = rquery($cat_query);

		while ($row = mysqli_fetch_row($cat_res)) {
			$db_id = intval($row[0]);
			$cat_name = strtolower($row[1]);
			$category_numbers[$cat_name] = $db_id;
		}

		// dataset.yaml mit den DB-IDs schreiben
		foreach ($category_numbers as $cat => $db_id) {
			$dataset_yaml .= "  $db_id: $cat\n";
			$_labels[$db_id] = $cat;
		}


		$labels_json = json_encode($_labels);

		ob_start();
		mkdir("$tmp_dir/labels/");
		ob_clean();

		if($validation_split) {
			mkdir("$tmp_dir/validation/");
		}

		file_put_contents("$tmp_dir/dataset.yaml", $dataset_yaml);
		file_put_contents("$tmp_dir/labels.json", $labels_json);

		foreach ($images as $fn => $img) {
			$fn_txt = preg_replace("/\.\w+$/", ".txt", $fn);

			$str = "";
			$str_arr = array();
			foreach ($img as $single_anno) {
				$category_number = $category_numbers[$single_anno["category"]];
				$x_center = $single_anno["x_center"];
				$y_center = $single_anno["y_center"];
				$width_relative = $single_anno["w_rel"];
				$height_relative= $single_anno["h_rel"];

				$str_arr[] = "$category_number $x_center $y_center $width_relative $height_relative";
			}

			$str = join("\n", array_unique($str_arr));

			file_put_contents("$tmp_dir/labels/$fn_txt", "$str\n");
		}

		write_bash_files($tmp_dir, $epochs, $model_name);

		#die("a");

		$tmp_zip = "$tmp_dir/yolo_export.zip";
		ob_start();
		system("cd $tmp_dir; zip -r yolo_export.zip .");
		ob_clean();

		//if(file_exists($tmp_zip)) {
		header("Content-type: application/zip");
		header("Content-Disposition: attachment; filename=data.zip");
		header("Content-Disposition: attachment; filename=\"yolo_export.zip\"");
		header("Pragma: no-cache");
		header("Expires: 0");
		header("Content-Length: ".filesize($tmp_zip));

		#readfile($tmp_zip);
		$handle = @fopen($tmp_zip, "r");
		if ($handle) {
			while (($buffer = fgets($handle, 4096)) !== false) {
				echo $buffer;
			}

			fclose($handle);
		}

		ob_start();
		system("rm -rf $tmp_dir");
		ob_clean();
		//} else {
		//	print("Could not create zip-file\n");
		//	exit(1);
		//}
		exit(0);
	} else {
		print "The folder '$tmp_name' could not be created.";
	}
?>
