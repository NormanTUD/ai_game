<?php
	include_once("functions.php");

	if(array_key_exists("image", $_GET)) {
		delete_all_annos_from_image(get_image_id($_GET["image"]));

		print("OK Deleted");
	} else {
		die("No source given");
	}

?>
