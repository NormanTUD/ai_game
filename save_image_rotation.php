<?php
	include_once("functions.php");

	header('Content-Type: application/json');

	$fn = get_get("filename");
	$rotation = get_get("rotation");

	print(api_set_rotation($fn, $rotation));
?>
