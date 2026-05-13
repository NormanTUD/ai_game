<?php
		include_once("header.php");
		include_once("functions.php");

		$files = scandir("offtopic");

		$img_files = array();

		foreach($files as $file) {
			if(preg_match("/\.(?:jpe?|pn)g$/i", $file)) {
				$img_files[$file] = 1;
			}
		}

		asort($img_files);
		#print_header();
?>
	<div id="content">
<?php
		foreach ($img_files as $f => $k) {
?>
			<a target="_blank" href="index.php?edit=<?php print $f; ?>&move_from_offtopic=<?php print $f; ?>"><img class="images" id="<?php print uniqid(); ?>" src="offtopic/<?php print $f; ?>"></a>
<?php
		}
?>
	</div>
<?php include_once("footer.php"); ?>
