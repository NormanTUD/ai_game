(function() {
	"use strict";

	var webcamStream = null;
	var predictionLoop = null;
	var isPredicting = false;
	var webcamModel = null;
	var webcamLabels = [];
	var capturedCount = 0;
	var currentModelUuid = null;
	var isStartingWebcam = false;
	var isLoadingModel = false;
	var toastTimeout = null;

	var video = document.getElementById('webcam_video');
	var overlayCanvas = document.getElementById('webcam_canvas');
	var overlayCtx = overlayCanvas.getContext('2d');
	var captureCanvas = document.getElementById('capture_canvas');
	var captureCtx = captureCanvas.getContext('2d');

	// ─── Toast notification ─────────────────────────────────────────────
	function clearToastTimeout() {
		if (toastTimeout) clearTimeout(toastTimeout);
		toastTimeout = null;
	}

	function scheduleToastHide(toast, duration) {
		toastTimeout = setTimeout(function() {
			toast.className = '';
			toastTimeout = null;
		}, duration);
	}

	function showToast(message, type, duration) {
		var toast = document.getElementById('webcam_toast');
		if (!toast) return;
		clearToastTimeout();
		toast.textContent = message;
		toast.className = 'visible ' + (type || 'info');
		scheduleToastHide(toast, duration || 3000);
	}

	// ─── Button state helpers ───────────────────────────────────────────
	function setButtonLoading(btnId, loading, loadingText) {
		var btn = document.getElementById(btnId);
		if (!btn) return;
		btn.disabled = loading;
		if (loading && loadingText) {
			btn.dataset.originalText = btn.innerHTML;
			btn.innerHTML = loadingText;
		} else if (!loading && btn.dataset.originalText) {
			btn.innerHTML = btn.dataset.originalText;
			delete btn.dataset.originalText;
		}
	}

	// ─── Webcam state checks ────────────────────────────────────────────
	function isWebcamActive() {
		return webcamStream !== null && video.srcObject !== null;
	}

	// ─── Enumerate cameras ──────────────────────────────────────────────
	async function requestTempCameraAccess() {
		var tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
		if (tempStream) tempStream.getTracks().forEach(function(t) { t.stop(); });
	}

	function populateCameraSelect(select, videoDevices) {
		select.innerHTML = '';
		videoDevices.forEach(function(device, idx) {
			var option = document.createElement('option');
			option.value = device.deviceId;
			option.textContent = device.label || ('Camera ' + (idx + 1));
			select.appendChild(option);
		});
	}

	function setCameraSelectError(select, msg) {
		select.innerHTML = '<option value="">' + msg + '</option>';
	}

	async function enumerateCameras() {
		var select = document.getElementById('camera_select');
		try {
			await requestTempCameraAccess();
		} catch (permErr) {
			setCameraSelectError(select, 'No camera access');
			showToast("Camera permission denied. Please allow camera access.", "error", 5000);
			return;
		}
		try {
			var devices = await navigator.mediaDevices.enumerateDevices();
			var videoDevices = devices.filter(function(d) { return d.kind === 'videoinput'; });
			if (videoDevices.length === 0) return setCameraSelectError(select, 'No cameras found');
			populateCameraSelect(select, videoDevices);
		} catch (err) {
			setCameraSelectError(select, 'Camera error');
			showToast("Could not detect cameras: " + (err.message || "Unknown error"), "error", 5000);
		}
	}

	enumerateCameras();

	// ─── Start webcam helpers ───────────────────────────────────────────
	function getWebcamConstraints() {
		var deviceId = document.getElementById('camera_select').value;
		return { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };
	}

	function waitForMetadata() {
		return new Promise(function(resolve) {
			var resolved = false;
			video.onloadedmetadata = function() { if (!resolved) { resolved = true; resolve(); } };
			setTimeout(function() { if (!resolved) { resolved = true; resolve(); } }, 5000);
		});
	}

	function waitForCanPlay() {
		return new Promise(function(resolve) {
			if (video.readyState >= 2) return resolve();
			video.oncanplay = function() { resolve(); };
			setTimeout(resolve, 2000);
		});
	}

	function syncOverlaySize() {
		if (video.videoWidth <= 0 || video.videoHeight <= 0) return;
		overlayCanvas.width = video.videoWidth;
		overlayCanvas.height = video.videoHeight;
		overlayCanvas.style.width = video.clientWidth + 'px';
		overlayCanvas.style.height = video.clientHeight + 'px';
	}

	function showWebcamRunningUI() {
		document.getElementById('btn_stop_webcam').style.display = '';
		showToast("Webcam started", "success", 2000);
	}

	function lockWebcamButtons() {
		setButtonLoading('btn_toggle_predict', true);
		setButtonLoading('btn_capture', true);
	}

	function unlockWebcamButtons() {
		isStartingWebcam = false;
		setButtonLoading('btn_toggle_predict', false);
		setButtonLoading('btn_capture', false);
	}

	function getWebcamErrorMessage(err) {
		if (err.name === 'NotAllowedError') return "Camera permission was denied.";
		if (err.name === 'NotFoundError') return "No camera found.";
		if (err.name === 'NotReadableError') return "Camera is in use by another application.";
		return "Could not access webcam." + (err.message ? " " + err.message : "");
	}

	async function startWebcam() {
		if (isStartingWebcam || isWebcamActive()) return true;
		isStartingWebcam = true;
		lockWebcamButtons();
		try {
			webcamStream = await navigator.mediaDevices.getUserMedia(getWebcamConstraints());
			video.srcObject = webcamStream;
			await waitForMetadata();
			await waitForCanPlay();
			syncOverlaySize();
			showWebcamRunningUI();
			unlockWebcamButtons();
			return true;
		} catch (err) {
			webcamStream = null;
			video.srcObject = null;
			showToast(getWebcamErrorMessage(err), "error", 6000);
			unlockWebcamButtons();
			return false;
		}
	}

	// ─── Stop webcam ────────────────────────────────────────────────────
	function stopStreamTracks() {
		if (!webcamStream) return;
		try { webcamStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
		webcamStream = null;
	}

	function clearOverlay() {
		try { overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height); } catch (e) {}
	}

	function showWebcamStoppedUI() {
		document.getElementById('btn_stop_webcam').style.display = 'none';
		document.getElementById('prediction_info').textContent = 'Webcam stopped.';
		showToast("Webcam stopped", "info", 2000);
	}

	function stopWebcam() {
		if (isPredicting) stopPredictionLoop();
		stopStreamTracks();
		video.srcObject = null;
		clearOverlay();
		showWebcamStoppedUI();
	}

	// ─── Stop prediction loop ───────────────────────────────────────────
	function clearPredictionInterval() {
		if (predictionLoop) clearInterval(predictionLoop);
		predictionLoop = null;
	}

	function resetPredictButton() {
		var btn = document.getElementById('btn_toggle_predict');
		if (!btn) return;
		btn.innerHTML = '&#129302; Start Predictions';
		btn.classList.remove('active');
	}

	function stopPredictionLoop() {
		isPredicting = false;
		clearPredictionInterval();
		resetPredictButton();
		clearOverlay();
		document.getElementById('prediction_info').textContent = 'Predictions stopped.';
	}

	// ─── Toggle prediction ──────────────────────────────────────────────
	function getSelectedModelUuid() {
		return document.getElementById('webcam_model_select').value;
	}

	function getPredictionFps() {
		return Math.max(1, Math.min(30, parseInt(document.getElementById('webcam_fps').value) || 5));
	}

	function startPredictionInterval() {
		var fps = getPredictionFps();
		predictionLoop = setInterval(runWebcamPrediction, Math.round(1000 / fps));
		showToast("Predictions running at " + fps + " FPS", "success", 2500);
	}

	function activatePredictButton() {
		var btn = document.getElementById('btn_toggle_predict');
		if (!btn) return;
		isPredicting = true;
		btn.innerHTML = '&#9209; Stop Predictions';
		btn.classList.add('active');
		setButtonLoading('btn_toggle_predict', false);
	}

	async function ensureWebcamForPrediction() {
		if (isWebcamActive()) return true;
		showToast("Starting webcam...", "info", 2000);
		return await startWebcam();
	}

	async function ensureVideoReady() {
		if (video.readyState >= 2) return true;
		document.getElementById('prediction_info').textContent = 'Waiting for webcam feed...';
		return await waitForVideoReady(3000);
	}

	async function togglePrediction() {
		if (isPredicting) {
			stopPredictionLoop();
			showToast("Predictions stopped", "info", 2000);
			return;
		}
		var modelUuid = getSelectedModelUuid();
		if (modelUuid === 'none') {
			showToast("Please select a model.", "error", 4000);
			return;
		}
		setButtonLoading('btn_toggle_predict', true, '&#129302; Starting...');
		if (!await ensureWebcamForPrediction() || !webcamStream || !video.srcObject) {
			setButtonLoading('btn_toggle_predict', false);
			resetPredictButton();
			return;
		}
		if (!await ensureVideoReady() || !await loadWebcamModel(modelUuid)) {
			setButtonLoading('btn_toggle_predict', false);
			resetPredictButton();
			return;
		}
		activatePredictButton();
		startPredictionInterval();
	}

	// ─── Wait for video ready ───────────────────────────────────────────
	function waitForVideoReady(timeoutMs) {
		return new Promise(function(resolve) {
			if (video.readyState >= 2) return resolve(true);
			var resolved = false;
			var onReady = function() { if (!resolved) { resolved = true; resolve(true); } };
			video.addEventListener('canplay', onReady);
			setTimeout(function() {
				if (!resolved) { resolved = true; resolve(video.readyState >= 2); }
			}, timeoutMs || 3000);
		});
	}

	// ─── Load model helpers ─────────────────────────────────────────────
	async function fetchLabels(modelUuid) {
		try {
			var resp = await fetch('labels.php?model_uuid=' + encodeURIComponent(modelUuid));
			if (resp.ok) return await resp.json();
		} catch (e) { console.warn("Could not load labels:", e); }
		return [];
	}

	function getModelJsonUrl(modelUuid) {
		return "get_model_file.php?&uuid=" + encodeURIComponent(modelUuid) + "&filename=model.json";
	}

	function disposeCurrentModel() {
		if (webcamModel) try { webcamModel.dispose(); } catch (e) {}
		webcamModel = null;
		currentModelUuid = null;
	}

	function getModelLoadErrorMessage(e) {
		if (!e.message) return "Failed to load model.";
		if (e.message.includes("404")) return "Model file not found.";
		if (e.message.includes("fetch")) return "Network error loading model.";
		return "Model error: " + e.message.substring(0, 100);
	}

	async function loadWebcamModel(modelUuid) {
		if (webcamModel && currentModelUuid === modelUuid) return true;
		if (isLoadingModel) {
			showToast("Model is already loading...", "info", 2000);
			return false;
		}
		isLoadingModel = true;
		document.getElementById('prediction_info').textContent = 'Loading model...';
		webcamLabels = await fetchLabels(modelUuid);
		if (!Array.isArray(webcamLabels)) webcamLabels = [];
		try {
			if (typeof tf === 'undefined') throw new Error("TensorFlow.js is not loaded.");
			await tf.ready();
			disposeCurrentModel();
			webcamModel = await tf.loadGraphModel(getModelJsonUrl(modelUuid), {
				onProgress: function(p) {
					document.getElementById('prediction_info').textContent = 'Loading model... ' + (p * 100).toFixed(0) + '%';
				}
			});
			currentModelUuid = modelUuid;
			document.getElementById('prediction_info').textContent = 'Model loaded. Running predictions...';
			isLoadingModel = false;
			return true;
		} catch (e) {
			document.getElementById('prediction_info').textContent = 'Error loading model.';
			disposeCurrentModel();
			isLoadingModel = false;
			showToast(getModelLoadErrorMessage(e), "error", 6000);
			return false;
		}
	}

	// ─── Run prediction frame helpers ───────────────────────────────────
	function shouldSkipPrediction() {
		return !isPredicting || !webcamModel || !webcamStream || video.readyState < 2;
	}

	function getModelInputShape() {
		try {
			if (webcamModel.inputs && webcamModel.inputs[0] && webcamModel.inputs[0].shape)
				return webcamModel.inputs[0].shape.slice(1, 3);
		} catch (e) {}
		return [640, 640];
	}

	function getConfThreshold() {
		return parseFloat(document.getElementById('webcam_conf_slider').value) || 0.3;
	}

	function createInputTensor(modelHeight, modelWidth) {
		return tf.tidy(function() {
			return tf.browser.fromPixels(video)
				.resizeBilinear([modelHeight, modelWidth])
				.div(255)
				.expandDims();
		});
	}

	function disposeTensor(t) {
		if (t) try { t.dispose(); } catch(x) {}
	}

	function extractOutputArray(output) {
		if (output instanceof tf.Tensor) {
			var r = output.arraySync();
			output.dispose();
			return r;
		}
		if (Array.isArray(output)) {
			var r2 = output[0].arraySync();
			output.forEach(function(t) { disposeTensor(t); });
			return r2;
		}
		return output;
	}

	async function runWebcamPrediction() {
		if (shouldSkipPrediction()) return;
		var shape = getModelInputShape();
		var startTime = performance.now();
		var inputTensor = null;
		var output = null;
		try {
			inputTensor = createInputTensor(shape[0], shape[1]);
		} catch (e) {
			disposeTensor(inputTensor);
			return;
		}
		try {
			output = await webcamModel.execute(inputTensor);
		} catch (e) {
			disposeTensor(inputTensor);
			return;
		}
		disposeTensor(inputTensor);
		var res;
		try {
			res = extractOutputArray(output);
		} catch (e) { return; }
		var detections = safeProcessOutput(res, shape[1], shape[0], getConfThreshold());
		drawDetections(detections, (performance.now() - startTime).toFixed(1));
	}

	function safeProcessOutput(res, modelWidth, modelHeight, confThreshold) {
		try { return processWebcamOutput(res, modelWidth, modelHeight, confThreshold); }
		catch (e) { return []; }
	}

	// ─── Process model output helpers ───────────────────────────────────
	function isValidOutputShape(res) {
		return res && Array.isArray(res) && Array.isArray(res[0]) && Array.isArray(res[0][0]);
	}

	function orientTensor(rawTensor) {
		var shape = rawTensor.shape;
		if (shape[1] <= shape[2]) return rawTensor;
		var transposed = rawTensor.transpose([0, 2, 1]);
		rawTensor.dispose();
		return transposed;
	}

	function computeNormalizedBox(box, modelWidth, modelHeight) {
		var cx = box[0], cy = box[1], w = box[2], h = box[3];
		var isPixel = cx > 2.0 || cy > 2.0;
		if (isPixel) return {
			xMin: (cx - w/2)/modelWidth, yMin: (cy - h/2)/modelHeight,
			xMax: (cx + w/2)/modelWidth, yMax: (cy + h/2)/modelHeight
		};
		return { xMin: cx - w/2, yMin: cy - h/2, xMax: cx + w/2, yMax: cy + h/2 };
	}

	function findBestClass(classScores) {
		if (!Array.isArray(classScores)) return { score: classScores, classIdx: 0 };
		var bestScore = 0, bestClass = -1;
		for (var c = 0; c < classScores.length; c++) {
			if (classScores[c] > bestScore) { bestScore = classScores[c]; bestClass = c; }
		}
		return { score: bestScore, classIdx: bestClass };
	}

	function clampBox(box) {
		return {
			xMin: Math.max(0, box.xMin), yMin: Math.max(0, box.yMin),
			xMax: Math.min(1, box.xMax), yMax: Math.min(1, box.yMax)
		};
	}

	function buildDetection(box, best, modelWidth, modelHeight) {
		var coords = clampBox(computeNormalizedBox(box, modelWidth, modelHeight));
		var label = (webcamLabels && webcamLabels[best.classIdx]) ? webcamLabels[best.classIdx] : ('class_' + best.classIdx);
		return {
			xMin: coords.xMin, yMin: coords.yMin,
			xMax: coords.xMax, yMax: coords.yMax,
			score: best.score, label: label
		};
	}

	function extractDetections(boxesArr, scoresArr, numClasses, confThreshold, modelWidth, modelHeight) {
		var detections = [];
		for (var i = 0; i < boxesArr.length; i++) {
			var classScores = numClasses === 1 ? [scoresArr[i]] : scoresArr[i];
			var best = findBestClass(classScores);
			if (best.score >= confThreshold)
				detections.push(buildDetection(boxesArr[i], best, modelWidth, modelHeight));
		}
		return detections;
	}

	function processWebcamOutput(res, modelWidth, modelHeight, confThreshold) {
		if (!isValidOutputShape(res)) return [];
		var rawTensor = null, predTensor = null, rawBoxes = null, scores = null, boxes = null, scoresSqueezed = null;
		try {
			rawTensor = orientTensor(tf.tensor3d(res));
			var numClasses = rawTensor.shape[2] - 4;
			if (numClasses <= 0) { rawTensor.dispose(); return []; }
			predTensor = rawTensor.transpose([0, 2, 1]);
			var splits = tf.split(predTensor, [4, numClasses], 2);
			rawBoxes = splits[0]; scores = splits[1];
			boxes = rawBoxes.squeeze(); scoresSqueezed = scores.squeeze();
			var detections = extractDetections(
				boxes.arraySync(), scoresSqueezed.arraySync(),
				numClasses, confThreshold, modelWidth, modelHeight
			);
			[rawTensor, predTensor, rawBoxes, scores, boxes, scoresSqueezed].forEach(disposeTensor);
			return simpleNMS(detections, 0.5);
		} catch (e) {
			[rawTensor, predTensor, rawBoxes, scores, boxes, scoresSqueezed].forEach(disposeTensor);
			return [];
		}
	}

	// ─── NMS ────────────────────────────────────────────────────────────
	function computeIoU(a, b) {
		var x1 = Math.max(a.xMin, b.xMin), y1 = Math.max(a.yMin, b.yMin);
		var x2 = Math.min(a.xMax, b.xMax), y2 = Math.min(a.yMax, b.yMax);
		var inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
		var union = (a.xMax - a.xMin) * (a.yMax - a.yMin) + (b.xMax - b.xMin) * (b.yMax - b.yMin) - inter;
		return union <= 0 ? 0 : inter / union;
	}

	function isDominated(det, kept, iouThresh) {
		for (var j = 0; j < kept.length; j++) {
			if (computeIoU(det, kept[j]) > iouThresh) return true;
		}
		return false;
	}

	function simpleNMS(detections, iouThresh) {
		if (!detections || detections.length === 0) return [];
		detections.sort(function(a, b) { return b.score - a.score; });
		var kept = [];
		for (var i = 0; i < detections.length; i++) {
			if (!isDominated(detections[i], kept, iouThresh)) kept.push(detections[i]);
		}
		return kept;
	}

	// ─── Draw detections on overlay canvas ──────────────────────────────
	function drawBoxRect(det, w, h) {
		var x = det.xMin * w, y = det.yMin * h;
		var bw = (det.xMax - det.xMin) * w;
		var bh = (det.yMax - det.yMin) * h;
		overlayCtx.strokeStyle = '#00ff88';
		overlayCtx.lineWidth = 2;
		overlayCtx.strokeRect(x, y, bw, bh);
		return { x: x, y: y };
	}

	function drawBoxLabel(det, pos) {
		var text = det.label + ' ' + (det.score * 100).toFixed(0) + '%';
		overlayCtx.font = 'bold 13px monospace';
		var textWidth = overlayCtx.measureText(text).width;
		overlayCtx.fillStyle = 'rgba(0, 255, 100, 0.85)';
		overlayCtx.fillRect(pos.x, pos.y - 18, textWidth + 6, 18);
		overlayCtx.fillStyle = '#000';
		overlayCtx.fillText(text, pos.x + 3, pos.y - 4);
	}

	function buildInfoText(detections, elapsed) {
		var summary = detections.map(function(d) {
			return d.label + '(' + (d.score * 100).toFixed(0) + '%)';
		}).join(', ');
		return 'Detections: ' + detections.length + ' | Inference: ' + elapsed + 'ms | ' + summary;
	}

	function drawDetections(detections, elapsed) {
		var w = overlayCanvas.width, h = overlayCanvas.height;
		try { overlayCtx.clearRect(0, 0, w, h); } catch (e) { return; }
		if (!detections || detections.length === 0) {
			document.getElementById('prediction_info').textContent = 'No detections | Inference: ' + elapsed + 'ms';
			return;
		}
		for (var i = 0; i < detections.length; i++) {
			var pos = drawBoxRect(detections[i], w, h);
			drawBoxLabel(detections[i], pos);
		}
		document.getElementById('prediction_info').textContent = buildInfoText(detections, elapsed);
	}

	// ─── Capture frame helpers ──────────────────────────────────────────
	async function ensureWebcamForCapture() {
		if (isWebcamActive()) return true;
		showToast("Starting webcam for capture...", "info", 2000);
		setButtonLoading('btn_capture', true, '&#128248; Starting...');
		var ok = await startWebcam();
		if (!ok) {
			setButtonLoading('btn_capture', false);
			showToast("Cannot capture — webcam failed to start.", "error", 4000);
		}
		return ok;
	}

	async function waitForCaptureReady() {
		if (video.readyState >= 2) return true;
		var ready = await waitForVideoReady(3000);
		if (!ready) showToast("Webcam feed not ready for capture. Please try again.", "error", 3000);
		return ready;
	}

	function validateVideoDimensions() {
		if (video.videoWidth && video.videoHeight) return true;
		showToast("Webcam not producing frames yet. Please wait a moment.", "error", 3000);
		return false;
	}

	function drawCaptureFrame() {
		captureCanvas.width = video.videoWidth;
		captureCanvas.height = video.videoHeight;
		captureCtx.drawImage(video, 0, 0);
	}

	function generateFilename() {
		capturedCount++;
		var timestamp = new Date().toISOString().replace(/[:.]/g, '-');
		return 'webcam_' + timestamp + '.jpg';
	}

	function createThumbElement(url, filename) {
		var thumb = document.createElement('div');
		thumb.className = 'captured-thumb';

		var img = document.createElement('img');
		img.src = url;
		img.alt = filename;
		thumb.appendChild(img);

		var status = document.createElement('span');
		status.className = 'upload-status uploading';
		status.textContent = 'Uploading...';
		thumb.appendChild(status);

		var actions = document.createElement('div');
		actions.className = 'thumb-actions';
		var removeBtn = document.createElement('button');
		removeBtn.innerHTML = '&#10005;';
		removeBtn.style.background = '#f38ba8';
		removeBtn.style.color = '#1e1e2e';
		removeBtn.addEventListener('click', function() {
			thumb.remove();
		});
		actions.appendChild(removeBtn);
		thumb.appendChild(actions);

		return thumb;
	}

	function handleCaptureBlob(blob, filename) {
		if (!blob) {
			setButtonLoading('btn_capture', false);
			showToast("Failed to encode frame as image.", "error", 3000);
			return;
		}
		var url;
		try {
			url = URL.createObjectURL(blob);
		} catch (e) {
			setButtonLoading('btn_capture', false);
			showToast("Failed to create image preview.", "error", 3000);
			return;
		}
		var thumb = createThumbElement(url, filename);
		document.getElementById('captured_images').prepend(thumb);
		autoUpload(thumb, blob, filename);
		setButtonLoading('btn_capture', false);
		showToast("Frame captured and uploading...", "success", 2000);
	}

	async function captureFrame() {
		if (!await ensureWebcamForCapture()) return;
		if (!isWebcamActive()) {
			await new Promise(function(r) { setTimeout(r, 500); });
		}
		if (!await waitForCaptureReady() || !validateVideoDimensions()) return;
		setButtonLoading('btn_capture', true, '&#128248; Capturing...');
		try {
			drawCaptureFrame();
		} catch (e) {
			setButtonLoading('btn_capture', false);
			showToast("Failed to capture frame from webcam.", "error", 3000);
			return;
		}
		var filename = generateFilename();
		try {
			captureCanvas.toBlob(function(blob) {
				handleCaptureBlob(blob, filename);
			}, 'image/jpeg', 0.92);
		} catch (e) {
			setButtonLoading('btn_capture', false);
			showToast("Failed to process captured frame.", "error", 3000);
		}
	}

	// ─── Auto upload function ───────────────────────────────────────────
	function buildFormData(blob, filename) {
		var formData = new FormData();
		formData.append('image', blob, filename);
		return formData;
	}

	function handleUploadSuccess(statusEl, result) {
		if (result.indexOf("Error:") !== -1) {
			statusEl.textContent = 'Upload failed';
			statusEl.className = 'upload-status error';
			showToast("Upload failed: " + result.substring(0, 80), "error", 4000);
			return;
		}
		statusEl.textContent = '\u2713 Uploaded';
		statusEl.className = 'upload-status';
		if (typeof load_dynamic_content === 'function') {
			try { load_dynamic_content(); } catch (e) {}
		}
	}

	function handleUploadError(statusEl, err) {
		statusEl.textContent = 'Error';
		statusEl.className = 'upload-status error';
		showToast("Upload error: " + (err.message || "Network failure"), "error", 4000);
	}

	async function autoUpload(thumb, blob, filename) {
		var statusEl = thumb.querySelector('.upload-status');
		if (!statusEl) return;
		try {
			var response = await fetch('upload_image.php', {
				method: 'POST',
				body: buildFormData(blob, filename)
			});
			if (!response.ok) throw new Error("Server returned " + response.status);
			handleUploadSuccess(statusEl, await response.text());
		} catch (err) {
			handleUploadError(statusEl, err);
		}
	}

	// ─── Confidence slider display ──────────────────────────────────────
	function initConfSlider() {
		var confSlider = document.getElementById('webcam_conf_slider');
		if (!confSlider) return;
		confSlider.addEventListener('input', function() {
			var display = document.getElementById('webcam_conf_value');
			if (display) display.textContent = parseFloat(this.value).toFixed(2);
		});
	}

	// ─── Handle camera change while running ─────────────────────────────
	function stopCurrentStream() {
		if (webcamStream) {
			try { webcamStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
		}
		webcamStream = null;
		video.srcObject = null;
	}

	function initCameraSelect() {
		var cameraSelect = document.getElementById('camera_select');
		if (!cameraSelect) return;
		cameraSelect.addEventListener('change', async function() {
			if (isWebcamActive()) {
				var wasPredicting = isPredicting;
				var prevModelUuid = currentModelUuid;
				if (isPredicting) stopPredictionLoop();
				stopCurrentStream();
				showToast("Switching camera...", "info", 2000);
				var ok = await startWebcam();
				if (ok && wasPredicting && prevModelUuid) {
					await loadWebcamModel(prevModelUuid);
					activatePredictButton();
					startPredictionInterval();
				}
			}
			else if (getSelectedModelUuid() !== 'none') {
				await startWebcam();
				var modelUuid = getSelectedModelUuid();
				if (isWebcamActive() && await ensureVideoReady() && await loadWebcamModel(modelUuid)) {
					activatePredictButton();
					startPredictionInterval();
				}
			}
		});
	}

	// ─── Handle model change: auto-start webcam + predictions ───────────
	function initModelSelect() {
		var modelSelect = document.getElementById('webcam_model_select');
		if (!modelSelect) return;
		modelSelect.addEventListener('change', async function() {
			var modelUuid = this.value;

			if (modelUuid === 'none') {
				if (isPredicting) stopPredictionLoop();
				showToast("Predictions disabled", "info", 2000);
				return;
			}

			if (!isWebcamActive()) {
				showToast("Starting webcam & loading model...", "info", 2000);
				var ok = await startWebcam();
				if (!ok) return;
			}

			if (isPredicting) {
				stopPredictionLoop();
				await new Promise(function(r) { setTimeout(r, 100); });
			}

			setButtonLoading('btn_toggle_predict', true, '&#129302; Loading...');
			if (!await ensureVideoReady() || !await loadWebcamModel(modelUuid)) {
				setButtonLoading('btn_toggle_predict', false);
				resetPredictButton();
				return;
			}
			activatePredictButton();
			startPredictionInterval();
		});
	}

	// ─── Auto-select single model on page load ─────────────────────────
	function autoSelectSingleModel() {
		var modelSelect = document.getElementById('webcam_model_select');
		if (!modelSelect) return;
		var realOptions = Array.from(modelSelect.options).filter(function(o) {
			return o.value !== 'none';
		});
		if (realOptions.length === 1) {
			modelSelect.value = realOptions[0].value;
		}
	}

	// ─── FPS change: hot-swap without any toast spam ────────────────────
	function initFpsInput() {
		var fpsInput = document.getElementById('webcam_fps');
		if (!fpsInput) return;
		var fpsDebounce = null;
		fpsInput.addEventListener('input', function() {
			if (!isPredicting || !predictionLoop) return;
			clearTimeout(fpsDebounce);
			fpsDebounce = setTimeout(function() {
				clearInterval(predictionLoop);
				var fps = Math.max(1, Math.min(30, parseInt(fpsInput.value) || 5));
				predictionLoop = setInterval(runWebcamPrediction, Math.round(1000 / fps));
			}, 300);
		});
	}

	// ─── Resize overlay canvas when video resizes ───────────────────────
	function syncOverlayStyle() {
		if (video.clientWidth <= 0 || video.clientHeight <= 0) return;
		overlayCanvas.style.width = video.clientWidth + 'px';
		overlayCanvas.style.height = video.clientHeight + 'px';
	}

	function initResizeObserver() {
		try {
			var ro = new ResizeObserver(syncOverlayStyle);
			ro.observe(video);
		} catch (e) {
			window.addEventListener('resize', syncOverlayStyle);
		}
	}

	// ─── Cleanup on page unload ─────────────────────────────────────────
	function cleanupOnUnload() {
		if (isPredicting) stopPredictionLoop();
		if (webcamStream) {
			try { webcamStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
		}
		if (webcamModel) {
			try { webcamModel.dispose(); } catch (e) {}
		}
	}

	// ─── Initialize everything (all calls at the bottom) ────────────────
	initConfSlider();
	initCameraSelect();
	initModelSelect();
	initFpsInput();
	initResizeObserver();
	autoSelectSingleModel();

	// ─── Bind button click handlers (replaces inline onclick) ───────────
	document.getElementById('btn_stop_webcam').addEventListener('click', stopWebcam);
	document.getElementById('btn_toggle_predict').addEventListener('click', togglePrediction);
	document.getElementById('btn_capture').addEventListener('click', captureFrame);

	window.addEventListener('beforeunload', cleanupOnUnload);

})();
