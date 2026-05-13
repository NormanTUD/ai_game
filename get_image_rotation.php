<?php
	include_once("functions.php");

	header('Content-Type: application/json');

	$fn = get_get("filename");

	print(api_get_rotation($fn));
?>
