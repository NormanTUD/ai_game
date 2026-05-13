<?php
	include_once("functions.php");

	if(array_key_exists("image", $_GET)) {
		$image_id = get_image_id($_GET["image"]);
		if(preg_match("/^\d+$/", $image_id)) {
			mark_as_curated($image_id);

			print("Image $image_id curated");
		} else {
			die("Image not found");
		}
	} else {
		die("No source given");
	}

?>
