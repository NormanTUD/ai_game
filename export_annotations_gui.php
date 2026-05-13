<?php
	include("header.php");
	include_once("functions.php");
?>
	<script>
		function change_url () {
			var trs = $("#export_settings").find("tr");

			var url_pairs = [];

			for (var i = 1; i < trs.length; i++) {
				var children = $(trs[i]).children();

				var explanation = $(children[0]).html();
				var name = $(children[1]).html();
				var value_item = $(children[2]).find("select,input,checkbox");

				var value = "";
				if(value_item.attr("type") == "checkbox") {
					value = value_item.is(":checked") ? 1 : 0;
				} else {
					value = value_item.val();
				}

				url_pairs.push(name + "=" + value);
			}

			var new_url = url_pairs.join("&");

			$("#link").attr("href", "export_annotations.php?" + new_url).show();
		}
	</script>

<?php
	if(get_number_of_annotated_imgs()) {
?>
		<table id="export_settings" border=1>
			<tr>
				<th>Explanation</th>
				<th style="display: none">Option</th>
				<th>Value</th>
			</tr>

			<tr>
				<td>Model</td>
				<td style="display: none">model</td>
				<td>
					<select id="model" onchange="change_url()">
						<option>yolo11n.yaml</option>
						<option>yolo11n-cls.yaml</option>
						<option>yolo11n-obb.yaml</option>
						<option>yolo11n-pose.yaml</option>
						<option>yolo11n-seg.yaml</option>
						<option>yolo11s-cls.yaml</option>
						<option>yolo11s-obb.yaml</option>
						<option>yolo11s-pose.yaml</option>
						<option>yolo11s-seg.yaml</option>
						<option>yolo11s.yaml</option>
						<option>yolo11m-cls.yaml</option>
						<option>yolo11m-obb.yaml</option>
						<option>yolo11m-pose.yaml</option>
						<option>yolo11m-seg.yaml</option>
						<option>yolo11m.yaml</option>
						<option>yolo11l-cls.yaml</option>
						<option>yolo11l-obb.yaml</option>
						<option>yolo11l-pose.yaml</option>
						<option>yolo11l-seg.yaml</option>
						<option>yolo11l.yaml</option>
						<option>yolo11x-cls.yaml</option>
						<option>yolo11x-obb.yaml</option>
						<option>yolo11x-pose.yaml</option>
						<option>yolo11x-seg.yaml</option>
						<option>yolo11x.yaml</option>
					</select>
				</td>
			</tr>

			<tr>
				<td>Max number of files  (0 = no limit)</td>
				<td style="display: none">max_files</td>
				<td><input onchange="change_url()" type="number" value="0" /></td>
			</tr>

			<tr>
				<td>Epochs</td>
				<td style="display: none">epochs</td>
				<td><input onchange="change_url()" type="number" value="2000" /></td>
			</tr>

			<tr>
				<td>Validation Split Size</td>
				<td style="display: none">validation_split</td>
				<td><input onchange="change_url()" type="number" value="0" /></td>
			</tr>

			<tr>
				<td>Test Split Size</td>
				<td style="display: none">test_split</td>
				<td><input onchange="change_url()" type="number" value="0" /></td>
			</tr>

			<tr>
				<td>Empty?</td>
				<td style="display: none">empty</td>
				<td><input onchange="change_url()" type="checkbox" /></td>
			</tr>

			<tr>
				<td>Group by perception hash?</td>
				<td style="display: none">group_by_perception_hash</td>
				<td><input onchange="change_url()" type="checkbox" /></td>
			</tr>

			<tr>
				<td>Only curated?</td>
				<td style="display: none">only_curated</td>
				<td><input onchange="change_url()" type="checkbox" /></td>
			</tr>

			<tr>
				<td>Only uncurated?</td>
				<td style="display: none">only_uncurated</td>
				<td><input onchange="change_url()" type="checkbox" /></td>
			</tr>

			<tr>
				<td>Max perception hash truncation?</td>
				<td style="display: none">max_truncation</td>
				<td><input onchange="change_url()" type="number" value="100" /></td>
			</tr>
		</table>

		<button><a id="link" style="color: white; display: none" href="">Download</a></button>

		<script>
			change_url();
		</script>
<?php
	} else{
?>
		No files were annotated. For exporting, at least one image must be annotated.
<?php
	}
?>
<?php
	include_once("footer.php");
?>
