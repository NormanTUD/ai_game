<?php
	header("Access-Control-Allow-Origin: *");
	include_once("functions.php");
?>
<!DOCTYPE html>
<head>
	<title>AI Game</title>
	<link rel="stylesheet" href="style.css">
	<link rel="stylesheet" href="auto_animations.css">
	<script src="<?= asset('libs/jquery.min.js') ?>"></script>

	<script src="<?= asset('label_annos.js') ?>"></script>

	<script src="<?= asset('libs/tf.js') ?>"></script>
	<script src="<?= asset('libs/tf-backend-wasm.min.js') ?>"></script>
	<script>
		var labels = [];
		const imgsz = <?php print $GLOBALS["imgsz"]; ?>;
	</script>
</head>

<body>

<?php
	if(isset($_GET["searchtag"])) {
		print "<br><a href='export_annotations.php?show_categories[]=".urlencode($_GET["searchtag"])."'>Export this category</a>";
		print "<br><a href='export_annotations.php?format=html&show_categories[]=".urlencode($_GET["searchtag"])."'>Export this category (HTML Overview)</a>";
	}
?>
