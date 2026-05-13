<?php
	include_once("functions.php");

	if(get_get("like")) {
		print get_next_random_unannotated_image(get_get("like"));
	} else {
		print get_next_random_unannotated_image();
	}
?>
