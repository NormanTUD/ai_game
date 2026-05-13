<?php
		include_once("header.php");
		include_once("functions.php");

		$img_files = array();

		$query = "select filename from image i left join annotation a on i.id = a.image_id where a.image_id is not null group by filename";
		$res = rquery($query);

		while ($row = mysqli_fetch_row($res)) {
			$img_files[] = $row[0];
		}

		#print_header();
?>
	<div id="content">
<?php
		foreach ($img_files as $f) {
?>
			<a target="_blank" href="index.php?edit=<?php print urlencode($f); ?>"><img class="images" id="<?php print uniqid(); ?>" src="print_image.php?filename=<?php print urlencode($f); ?>"></a>
<?php
		}
?>
	</div>
<?php include_once("footer.php"); ?>
