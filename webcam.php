<?php
	include("header.php");
	include_once("functions.php");

	$available_models = get_list_of_models();
?>

<style>
	#webcam_container {
		position: relative;
		display: inline-block;
		margin: 10px 0;
	}

	#webcam_video {
		max-width: 100%;
		border: 2px solid #45475a;
		border-radius: 8px;
		background: #11111b;
	}

	#webcam_canvas {
		position: absolute;
		top: 0;
		left: 0;
		pointer-events: none;
		border-radius: 8px;
	}

	#capture_canvas {
		display: none;
	}

	.webcam-controls {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin: 10px 0;
		padding: 12px 16px;
		background: #1e1e2e;
		border: 1px solid #333;
		border-radius: 8px;
	}

	.webcam-controls label {
		color: #cdd6f4;
		font-size: 13px;
	}

	.webcam-controls select,
	.webcam-controls input {
		background: #313244;
		color: #cdd6f4;
		border: 1px solid #45475a;
		border-radius: 4px;
		padding: 4px 8px;
		font-size: 13px;
	}

	.webcam-controls button {
		padding: 8px 16px;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-weight: 600;
		font-size: 13px;
		transition: background 0.2s, opacity 0.2s;
	}

	.webcam-controls button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	#btn_stop_webcam {
		background: #f38ba8;
		color: #1e1e2e;
	}

	#btn_capture {
		background: #a6e3a1;
		color: #1e1e2e;
	}

	#btn_toggle_predict {
		background: #cba6f7;
		color: #1e1e2e;
	}

	#btn_toggle_predict.active {
		background: #f9e2af;
		color: #1e1e2e;
	}

	#prediction_info {
		margin-top: 10px;
		padding: 8px 12px;
		background: #181825;
		border: 1px solid #45475a;
		border-radius: 6px;
		color: #cdd6f4;
		font-size: 12px;
		font-family: monospace;
		min-height: 40px;
	}

	#webcam_toast {
		position: fixed;
		bottom: 24px;
		left: 50%;
		transform: translateX(-50%) translateY(80px);
		background: #313244;
		color: #cdd6f4;
		padding: 10px 20px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		box-shadow: 0 4px 16px rgba(0,0,0,0.4);
		z-index: 9999;
		opacity: 0;
		transition: opacity 0.3s, transform 0.3s;
		pointer-events: none;
	}

	#webcam_toast.visible {
		opacity: 1;
		transform: translateX(-50%) translateY(0);
	}

	#webcam_toast.error {
		border-left: 4px solid #f38ba8;
	}

	#webcam_toast.success {
		border-left: 4px solid #a6e3a1;
	}

	#webcam_toast.info {
		border-left: 4px solid #89b4fa;
	}

	#captured_images {
		margin-top: 20px;
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	#captured_images .captured-thumb {
		position: relative;
		border: 1px solid #45475a;
		border-radius: 6px;
		overflow: hidden;
	}

	#captured_images .captured-thumb img {
		max-height: 150px;
		display: block;
	}

	#captured_images .captured-thumb .thumb-actions {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(0,0,0,0.7);
		padding: 4px;
		display: flex;
		gap: 4px;
		justify-content: center;
	}

	#captured_images .captured-thumb .thumb-actions button {
		font-size: 11px;
		padding: 3px 8px;
		border: none;
		border-radius: 3px;
		cursor: pointer;
	}

	.upload-status {
		position: absolute;
		top: 4px;
		right: 4px;
		background: rgba(0,0,0,0.7);
		color: #a6e3a1;
		font-size: 11px;
		padding: 2px 6px;
		border-radius: 3px;
		font-weight: bold;
	}

	.upload-status.error {
		color: #f38ba8;
	}

	.upload-status.uploading {
		color: #f9e2af;
	}
</style>

<h1>&#128247; Live Webcam & Predictions</h1>

<div class="webcam-controls">
	<label>Camera:
		<select id="camera_select">
			<option value="">Loading cameras...</option>
		</select>
	</label>

	<label>Model:
		<select id="webcam_model_select">
			<option value="none">None (no predictions)</option>
			<?php foreach ($available_models as $_model): ?>
				<option value="<?php echo htmlspecialchars($_model[1]); ?>">
					<?php echo htmlspecialchars($_model[0]); ?>
				</option>
			<?php endforeach; ?>
		</select>
	</label>

	<label>Confidence:
		<input type="range" id="webcam_conf_slider" min="0" max="1" step="0.01" value="0.3">
		<span id="webcam_conf_value">0.30</span>
	</label>

	<label>FPS:
		<input type="number" id="webcam_fps" min="1" max="30" value="5" style="width: 50px;">
	</label>

	<button id="btn_stop_webcam" style="display:none;">&#9209; Stop All</button>
	<button id="btn_toggle_predict">&#129302; Start Predictions</button>
	<button id="btn_capture">&#128248; Capture</button>
</div>

<div id="webcam_container">
	<video id="webcam_video" autoplay playsinline muted width="800"></video>
	<canvas id="webcam_canvas" width="800" height="600"></canvas>
</div>
<canvas id="capture_canvas"></canvas>

<div id="prediction_info">Predictions will appear here...</div>

<div id="webcam_toast"></div>

<h3 style="margin-top: 20px;">Captured Frames</h3>
<p style="color: #a6adc8; font-size: 12px;">Frames are automatically uploaded for annotation when captured.</p>
<div id="captured_images"></div>

<script src="webcam.js"></script>

<?php
	include_once("footer.php");
?>
