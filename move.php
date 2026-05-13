<?php
	include("functions.php");

	if(array_key_exists("move_from_offtopic", $_GET)) {
		move_from_offtopic($_GET["move_from_offtopic"]);
	} else if(array_key_exists("move_to_unidentifiable", $_GET)) {
		move_to_unidentifiable($_GET["move_to_unidentifiable"]);
	} else if(array_key_exists("move_to_offtopic", $_GET)) {
		move_to_offtopic($_GET["move_to_offtopic"]);
	} else {
		die("Missing param. Must be move_to_offtopic, move_from_offtopic or move_to_unidentifiable");
	}
?>
