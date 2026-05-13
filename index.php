<?php
	include("header.php");
	include_once("functions.php");

	if(file_exists("/etc/import_annotate") || get_get("import")) {
		import_files();
	}

	$imgfile = "";
	if(isset($_GET["edit"])) {
		$imgfile = $_GET["edit"];
	} else {
		if(get_get("like")) {
			$imgfile = get_next_random_unannotated_image(get_get("like"));
		} else {
			$imgfile = get_next_random_unannotated_image();
		}
	}

	$number_annotated = get_number_of_annotated_imgs();

	$img_area_display = "none";
	$no_imgs_left_display = "none";

	if($imgfile) {
		$img_area_display = "block";
	}

	$img_data_id = get_image_data_id($imgfile);

	if(!$img_data_id) {
		$img_area_display = "none";
		$no_imgs_left_display = "block";
	}

	$available_models = get_list_of_models();

	if(file_exists("allow_local_training")) {
		// Auto-numerate the suggested model name
		$base_model_name = "auto_trained";
		$existing_models_res = rquery("SELECT model_name FROM models WHERE model_name LIKE " . esc($base_model_name . "%") . " GROUP BY model_name ORDER BY model_name ASC");
		$existing_model_names = [];
		while ($row = mysqli_fetch_row($existing_models_res)) {
			$existing_model_names[] = $row[0];
		}

		$next_number = 1;
		foreach ($existing_model_names as $existing_name) {
			if (preg_match('/^' . preg_quote($base_model_name, '/') . '_(\d+)$/', $existing_name, $m)) {
				$num = intval($m[1]);
				if ($num >= $next_number) {
					$next_number = $num + 1;
				}
			}
		}

		$suggested_model_name = $base_model_name . "_" . $next_number;

		// Collect available base models: from models/*.pt files AND from DB
		$available_base_models = [];

		// 1) Scan models/ directory for .pt files
		if (is_dir("models")) {
			$pt_files = glob("models/*.pt");
			foreach ($pt_files as $pt_path) {
				$pt_basename = basename($pt_path);
				$display_name = preg_replace('/\.pt$/', '', $pt_basename);
				$available_base_models[] = [
					'value' => 'file:' . $pt_path,
					'label' => $display_name
				];
			}
		}

		// 2) Scan DB for models that have a model.pt file stored
		$db_models_res = rquery("SELECT m.model_name, m.uuid FROM models m WHERE m.filename = 'model.pt' GROUP BY m.uuid ORDER BY m.upload_time DESC");
		while ($row = mysqli_fetch_row($db_models_res)) {
			$model_name_db = $row[0];
			$model_uuid_db = $row[1];
			$available_base_models[] = [
				'value' => 'db:' . $model_uuid_db,
				'label' => $model_name_db
			];
		}
?>
		<div style="margin: 10px 0; padding: 12px 16px; background: #1e1e2e; border: 1px solid #333; border-radius: 8px; display: flex; flex-direction: column; gap: 12px;">
		    <form id="train_form" style="display: flex; flex-direction: column; gap: 12px; margin: 0;">
			<!-- Row 1: Main training options -->
			<div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
			    <label style="color: #cdd6f4; font-size: 13px;">Training Mode:
				<select name="training_mode" id="training_mode_select" style="background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 4px 8px; font-size: 13px;">
				    <option value="from_scratch">New Model (from scratch)</option>
				    <option value="fine_tune_pretrained">Fine-tune Pretrained (COCO)</option>
				    <option value="continue_training" <?php echo count($available_base_models) ? '' : 'disabled'; ?>>Continue Training Existing Model</option>
				</select>
			    </label>

			    <label id="architecture_label" style="color: #cdd6f4; font-size: 13px;">Architecture:
				<select name="model" id="model_select" style="background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 4px 8px; font-size: 13px;">
				    <option value="yolo11n.yaml">YOLO11n (nano)</option>
				    <option value="yolo11s.yaml">YOLO11s (small)</option>
				    <option value="yolo11m.yaml">YOLO11m (medium)</option>
				    <option value="yolo11l.yaml">YOLO11l (large)</option>
				    <option value="yolo11x.yaml">YOLO11x (xlarge)</option>
				</select>
			    </label>

			    <label id="base_model_label" style="color: #cdd6f4; font-size: 13px; display: none;">Base Model:
				<select name="base_model" id="base_model_select" style="background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 4px 8px; font-size: 13px;">
				    <?php foreach ($available_base_models as $bm): ?>
					<option value="<?php echo htmlspecialchars($bm['value']); ?>"><?php echo htmlspecialchars($bm['label']); ?></option>
				    <?php endforeach; ?>
				</select>
			    </label>

			    <label style="color: #cdd6f4; font-size: 13px;">Epochs:
				<input type="number" name="epochs" value="50" min="1" max="9999" style="width: 70px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 4px 8px; font-size: 13px;">
			    </label>

			    <label style="color: #cdd6f4; font-size: 13px;">Model Name:
				<input type="text" name="model_name" value="<?php echo htmlspecialchars($suggested_model_name); ?>" placeholder="Name for saved model" style="background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 4px 8px; font-size: 13px; width: 160px;">
			    </label>

			    <button type="submit" id="train_submit_btn" style="background: #a6e3a1; color: #1e1e2e; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background 0.2s;">
				🔄 Train Model on Server
			    </button>
			</div>

			<!-- Row 2: Optional Hyperparameters (collapsible) -->
			<details style="background: #181825; border: 1px solid #45475a; border-radius: 6px; padding: 8px 12px;">
			    <summary style="color: #a6adc8; font-size: 12px; cursor: pointer; user-select: none;">⚙️ Advanced Hyperparameters (optional)</summary>
			    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
				<label style="color: #cdd6f4; font-size: 12px;">Batch Size:
				    <input type="number" name="batch" value="" placeholder="4" min="1" max="128" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Image Size:
				    <input type="number" name="imgsz" value="" placeholder="<?php echo $GLOBALS['imgsz']; ?>" min="32" max="4096" step="32" style="width: 65px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">LR0:
				    <input type="number" name="lr0" value="" placeholder="0.01" min="0" max="1" step="0.001" style="width: 70px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">LRF:
				    <input type="number" name="lrf" value="" placeholder="0.01" min="0" max="1" step="0.001" style="width: 70px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Momentum:
				    <input type="number" name="momentum" value="" placeholder="0.937" min="0" max="1" step="0.001" style="width: 70px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Weight Decay:
				    <input type="number" name="weight_decay" value="" placeholder="0.0005" min="0" max="1" step="0.0001" style="width: 80px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Warmup Epochs:
				    <input type="number" name="warmup_epochs" value="" placeholder="3" min="0" max="100" step="0.5" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Patience:
				    <input type="number" name="patience" value="" placeholder="0" min="0" max="999" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px; display: flex; align-items: center; gap: 4px;">
				    <input type="checkbox" name="cos_lr" value="1" style="accent-color: #a6e3a1; width: 14px; height: 14px;">
				    Cosine LR
				</label>
				<label style="color: #cdd6f4; font-size: 12px; display: flex; align-items: center; gap: 4px;">
				    <input type="checkbox" name="val" value="1" style="accent-color: #a6e3a1; width: 14px; height: 14px;">
				    Validate
				</label>
			    </div>
			    <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #313244;">
				<span style="color: #a6adc8; font-size: 11px; width: 100%;">Augmentation:</span>
				<label style="color: #cdd6f4; font-size: 12px;">HSV-H:
				    <input type="number" name="hsv_h" value="" placeholder="0.015" min="0" max="1" step="0.005" style="width: 65px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">HSV-S:
				    <input type="number" name="hsv_s" value="" placeholder="0.7" min="0" max="1" step="0.05" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">HSV-V:
				    <input type="number" name="hsv_v" value="" placeholder="0.4" min="0" max="1" step="0.05" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Degrees:
				    <input type="number" name="degrees" value="" placeholder="0.0" min="0" max="360" step="5" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Translate:
				    <input type="number" name="translate" value="" placeholder="0.1" min="0" max="1" step="0.05" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Scale:
				    <input type="number" name="scale" value="" placeholder="0.5" min="0" max="2" step="0.1" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Fliplr:
				    <input type="number" name="fliplr" value="" placeholder="0.5" min="0" max="1" step="0.1" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Mosaic:
				    <input type="number" name="mosaic" value="" placeholder="1.0" min="0" max="1" step="0.1" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Mixup:
				    <input type="number" name="mixup" value="" placeholder="0.0" min="0" max="1" step="0.1" style="width: 55px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
				<label style="color: #cdd6f4; font-size: 12px;">Copy-Paste:
				    <input type="number" name="copy_paste" value="" placeholder="0.0" min="0" max="1" step="0.1" style="width: 65px; background: #313244; color: #cdd6f4; border: 1px solid #45475a; border-radius: 4px; padding: 3px 6px; font-size: 12px;">
				</label>
			    </div>
			</details>
		    </form>

		    <div id="train_output_container" style="display: none; background: #11111b; border: 1px solid #45475a; border-radius: 6px; padding: 12px; max-height: 500px; overflow-y: auto;">
			<pre id="train_output" style="margin: 0; white-space: pre-wrap; word-wrap: break-word; color: #cdd6f4; font-size: 12px;"></pre>
		    </div>
		</div>

		<script>
			// Toggle visibility based on training mode
			document.getElementById('training_mode_select').addEventListener('change', function() {
			    var mode = this.value;
			    var archLabel = document.getElementById('architecture_label');
			    var baseLabel = document.getElementById('base_model_label');

			    if (mode === 'continue_training') {
				archLabel.style.display = 'none';
				baseLabel.style.display = '';
			    } else {
				archLabel.style.display = '';
				baseLabel.style.display = 'none';
			    }
			});

			document.getElementById('train_form').addEventListener('submit', function(e) {
			    e.preventDefault();

			    var form = this;
			    var btn = document.getElementById('train_submit_btn');
			    var container = document.getElementById('train_output_container');
			    var output = document.getElementById('train_output');

			    $("#annotation_area").parent().parent().hide();

			    btn.disabled = true;
			    btn.textContent = '⏳ Training in progress...';
			    btn.style.background = '#f9e2af';
			    container.style.display = 'block';
			    output.innerHTML = '<span style="color: #a6e3a1;">Starting training...</span>\n';

			    var fullText = '';
			    var formData = new FormData(form);

			    fetch('train_internal.php', {
				method: 'POST',
				body: formData
			    }).then(function(response) {
				var reader = response.body.getReader();
				var decoder = new TextDecoder();

				function read() {
				    return reader.read().then(function(result) {
					if (result.done) {
					    if (fullText.indexOf('successfully trained and uploaded') !== -1 ||
						fullText.indexOf('All done!') !== -1 ||
						fullText.indexOf('TRAINING_COMPLETE') !== -1) {
						output.innerHTML += '\n\n<span style="color: #a6e3a1; font-weight: bold;">✅ Training complete! Reloading page...</span>\n';
						setTimeout(function() {
						    window.location.reload();
						}, 2000);
					    } else {
						btn.textContent = '🔄 Train Model on Server';
						btn.style.background = '#a6e3a1';
						btn.disabled = false;
					    }
					    return;
					}

					var text = decoder.decode(result.value, {stream: true});
					var stripped = text.replace(/<br\s*\/?>/gi, '\n');
					stripped = stripped.replace(/<[^>]*>/g, '');
					stripped = stripped.replace(/^\s{100,}/, '');

					fullText += stripped;
					output.innerHTML = ansiToHtml(fullText);
					container.scrollTop = container.scrollHeight;

					return read();
				    });
				}

				return read();
			    }).catch(function(err) {
				output.innerHTML += '\n\n<span style="color: #f38ba8; font-weight: bold;">❌ Error: ' + err.message + '</span>\n';
				btn.textContent = '🔄 Train Model on Server';
				btn.style.background = '#a6e3a1';
				btn.disabled = false;
			    });
			});
		</script>
<?php
	}
?>
	<div id="loader"></div>
	<table>
		<tr>
			<td style="vertical-align: baseline;">
				<div id="annotation_area" style="display: <?php print $img_area_display; ?>">
					<button class="disable_in_autonext" style="background-color: red;" id="skip_img_button" onClick="skip_current_image()">
					    Skip
					</button>

					<div id="content">
						<p>
							<button class="disable_in_autonext" id="next_img_button" onClick="load_next_random_image()">Next image</button>
							<!--<button class='ai_stuff' id="autonext_img_button" onClick="autonext()">AutoNext</button>-->
							<button class='disable_in_autonext ai_stuff' onclick="predictImageWithModel()">AI-Labelling</button>
							<button class="disable_in_autonext" onclick="move_to_offtopic()">Offtopic</button>
							<input class="disable_in_autonext" placeholder="Filename contains..." id="like" onchange="start_like()" />
<?php
							if(count($available_models)) {
								if(count($available_models) == 1) {
									print "<span style='visibility: none'>";
								}
								print "Model: <select class='disable_in_autonext' onchange='on_model_selection_change()' id='chosen_model'>";
								print "<option selected value='none'>None</option>";

								$i = 0;
								foreach ($available_models as $_model) {
									$model_name = $_model[0];
									$model_uid = $_model[1];

									print "<option value='{$model_uid}||all'>{$model_name} (all)</option>";
									print "<option value='{$model_uid}||selected'>{$model_name} (selected)</option>";
									$i++;
								}
								print "</select>";
								if(count($available_models) == 1) {
									print "</span>";
								}

								// Collapsible Container für die Klassen-Auswahl (initial versteckt)
								print "<div id='model_class_filter_container' style='display:none; margin-top:8px;'>";
								print "<div onclick='toggle_class_filter_panel()' id='model_class_filter_header' style='padding:6px 10px; background:#313244; border:1px solid #45475a; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none;'>";
								print "<span style='color:#cdd6f4; font-size:12px; font-weight:bold;'>⚙ Class Filter</span>";
								print "<span id='model_class_filter_toggle_icon' style='color:#a6adc8; font-size:14px; transition:transform 0.2s;'>▼</span>";
								print "</div>";
								print "<div id='model_class_filter_body' style='display:none; padding:8px; background:#1e1e2e; border:1px solid #45475a; border-top:none; border-radius:0 0 6px 6px; max-height:180px; overflow-y:auto;'>";
								print "<div id='model_class_filter_list'></div>";
								print "<div style='margin-top:6px;'>";
								print "<button type='button' onclick='select_all_model_classes(true)' style='font-size:11px; margin-right:4px;'>Select All</button>";
								print "<button type='button' onclick='select_all_model_classes(false)' style='font-size:11px;'>Deselect All</button>";
								print "</div>";
								print "</div>";
								print "</div>";

								print "<br>";
							}
?>

						</p>
						<div id="image_container" style="position: relative; display: inline-block; transform-origin: top left;">
							<canvas id="rotation_canvas" style="display:none;"></canvas>
							<img id="image" />
						</div>
						<br>
						<div id="filename"></div>
						<div id="ki_detected_names"></div>
					</div>
				</div>

				<div id="no_imgs_left" style="display: <?php print $no_imgs_left_display; ?>">
<?php
					if(get_number_of_annotated_imgs()) {
?>
						All available images are annotated.
<?php
					} else {
?>
						No images are available.
<?php
					}
?>

					<a href="upload.php">Upload images</a> or check again later.
				</div>
			</td>
			<td id="col_right">
				<div id="list"></div>
			</td>
		</tr>
	</table>

	<script>
		load_dynamic_content();
<?php
		if($no_imgs_left_display == "none") {
?>
			load_next_random_image("<?php print $imgfile; ?>");
<?php
		}
?>
	</script>
<?php
	include_once("footer.php");
?>
