<?php
	include_once("functions.php");

	$only_uncurated = "";
	$delete_on_click = "";
	$curate_on_click = "";
	if(isset($_GET["only_uncurated"])) {
		$only_uncurated = "&only_uncurated=1";
	}

	if(isset($_GET["delete_on_click"])) {
		$delete_on_click = "&delete_on_click=1";
	}

	$group_by_perception_hash = null;
	if(isset($_GET["group_by_perception_hash"])) {
		$delete_on_click = "&group_by_perception_hash=1";
		$group_by_perception_hash = 1;
	}

	if(isset($_GET["curate_on_click"])) {
		$curate_on_click = "&curate_on_click=1";
	}

	if($curate_on_click && $delete_on_click) {
		die("Either curate or delete on click, not both.");
	}

	$tags = get_current_tags($only_uncurated ?? 0, $group_by_perception_hash ?? 0);
	$tags_as_array = [];
	$html = "";

	if(count($tags)) {
		$html .= "<ul>";
		foreach ($tags as $tag => $nr) {
			$html .= "<li><a target='_blank' href='export_annotations.php?format=html&show_categories[]=".htmlentities(urlencode($tag))."$only_uncurated$delete_on_click$curate_on_click'>$tag ($nr)</li>";
		}
		$html .= "</ul>";
	} else {
		$html .= "<i>No tags</i>";
	}

	if(get_get("json")) {
		$json_string = json_encode(array("html" => $html, "tags" => $tags));

		print($json_string);
	} else {
		print $html;
	}
?>
