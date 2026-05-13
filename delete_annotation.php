<?php
	include_once("functions.php");

	if(array_key_exists("source", $_POST)) {
		if(array_key_exists("id", $_POST)) {
			$annotate_userid = $_COOKIE["annotate_userid"];
			$user_id = get_or_create_user_id($annotate_userid);

			flag_deleted($_POST["id"]);

			print("OK Deleted");
		} else {
			die("No ID given");
		}
	} else {
		die("No source given");
	}

?>
