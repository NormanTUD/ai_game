<?php
	include("header.php");
	include_once("functions.php");
?>

<style>
	#progressContainer {
		display: none;
		margin-top: 20px;
	}
	#progressBar {
		width: 100%;
		background-color: #eee;
		border-radius: 5px;
		overflow: hidden;
	}
	#progressBarFill {
		height: 20px;
		width: 0%;
		background-color: #4caf50;
		text-align: center;
		color: white;
		line-height: 20px;
	}
	#progressInfo {
		margin-top: 5px;
		font-size: 0.9em;
	}
</style>

<script>
	$(document).ready(function () {
		$('#uploadForm').on('submit', function (e) {
			$("#defective_files").hide();
			$("#defective_files_ul").html("");

			e.preventDefault();

			var formData = new FormData();
			var files = $('input[type="file"]')[0].files;
			var currentIndex = 0;
			var startTime = new Date().getTime();

			var defective_files = [];

			if (files.length === 0) {
				alert("Please select at least one file.");
				return;
			}

			$("#progressContainer").show();
			$("#progressBarFill").css("width", "0%").text("0%");
			$("#progressInfo").text("");

			function uploadNextFile() {
				if (currentIndex < files.length) {
					var file = files[currentIndex];
					formData.set('image', file);

					var elapsed = (new Date().getTime() - startTime) / 1000;
					var estimatedTotal = (elapsed / (currentIndex + 1)) * files.length;
					var remaining = Math.max(0, estimatedTotal - elapsed);
					var percent = Math.round(((currentIndex + 1) / files.length) * 100);

					$("#progressBarFill")
						.css("width", percent + "%")
						.text(percent + "%");

					$("#progressInfo").html(
						"Uploading: <b>" + file.name + "</b><br>" +
						"Progress: " + (currentIndex + 1) + " of " + files.length + "<br>" +
						"Estimated time left: ~" + Math.ceil(remaining) + "s"
					);

					$.ajax({
						type: 'POST',
						url: 'upload_image.php',
						data: formData,
						cache: false,
						contentType: false,
						processData: false,
						success: function (response) {
							$('#response').html(response);
							if(response.includes("Error:")) {
								defective_files.push();
								$("#defective_files_ul").append("<li>" + files[currentIndex].name + "</li>");
								$("#defective_files").show();
							}
							currentIndex++;
							load_dynamic_content();
							uploadNextFile();
						}
					});
				} else {
					success("File import", `All ${files.length} file(s) imported`);
					$("#progressInfo").html("Upload complete.");
				}
			}

			uploadNextFile();
		});
	});
</script>

<h1>Upload Images</h1>
<form id="uploadForm" enctype="multipart/form-data">
	<input type="file" name="image" multiple accept="image/jpeg">
	<input type="submit" value="Upload">
</form>

<div id="progressContainer">
	<div id="progressBar">
		<div id="progressBarFill">0%</div>
	</div>
	<div id="progressInfo"></div>
</div>

<div id="response" style="height: 400px; overflow-y: auto; margin-top: 20px;"></div>

<div id="defective_files" style="display: none;">
	<p><b>Defective files:</b></p>
	<ul id="defective_files_ul"></ul>
</div>

<?php
	include_once("footer.php");
?>
