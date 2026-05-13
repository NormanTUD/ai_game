<?php
	include_once("functions.php");

	$available_models = get_list_of_models();
	if(count($available_models)) {
		print 1;
	} else {
		print 0;
	}
?>
