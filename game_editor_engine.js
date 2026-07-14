// ═══════════════════════════════════════════════════════════════════════════
// GAME ENGINE v2 — Refactored: every function ≤ ~5 lines, easily testable
// ═══════════════════════════════════════════════════════════════════════════

(function () {
	"use strict";

	// ─── State ──────────────────────────────────────────────────────────
	var gameRunning = false;
	var animFrameId = null;
	var lastEvalTime = 0;
	var webcamStream = null;
	var gameModel = null;
	var gameLabels = [];
	var currentModelUuid = null;
	var isLoadingModel = false;
	var persistentVars = {};
	var outputBuffer = [];
	var maxOutputLines = 200;
	var lastOverlayW = 0, lastOverlayH = 0;
	var lastOverlayClientW = 0, lastOverlayClientH = 0;
	var gameInterval = null;
	var cachedParsed = null;
	var lastCode = '';
	var gameStepRunning = false;
	var MAX_ITERATIONS = 10000;

	// ─── DOM refs ───────────────────────────────────────────────────────
	var video = document.getElementById('game_video');
	var overlayCanvas = document.getElementById('game_overlay_canvas');
	var overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
	var textOverlay = document.getElementById('game_text_overlay');
	var editor = document.getElementById('dsl_editor');
	var outputDiv = document.getElementById('game_output');
	var statusDiv = document.getElementById('game_status');
	var camPlaceholder = document.getElementById('cam_placeholder');

	// ═══════════════════════════════════════════════════════════════════════
	// OUTPUT HELPERS
	// ═══════════════════════════════════════════════════════════════════════

	function interpolateString(str, vars) {
		return str.replace(/\$([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)/g, function(match, varName) {
			if (vars.hasOwnProperty(varName)) {
				return String(vars[varName]);
			}
			// Variable nicht gefunden → $varname bleibt stehen (Debugging-Hilfe)
			return match;
		});
	}

	function parseSingleConditionWithParens(condStr) {
		condStr = condStr.trim();
		var parenOpenCount = 0;
		var parenCloseCount = 0;

		// Mehrere öffnende Klammern erkennen und entfernen
		while (condStr.startsWith('(')) {
			parenOpenCount++;
			condStr = condStr.substring(1).trim();
		}
		// Mehrere schließende Klammern erkennen und entfernen
		while (condStr.endsWith(')')) {
			parenCloseCount++;
			condStr = condStr.substring(0, condStr.length - 1).trim();
		}

		var result = parseSingleCondition(condStr);
		if (parenOpenCount > 0) result.parenOpen = parenOpenCount;
		if (parenCloseCount > 0) result.parenClose = parenCloseCount;
		return result;
	}

	// Hilfsfunktion: Finde die zugehörige schließende Klammer für die N-te öffnende bei startIdx
	// depthOffset = welche der mehreren öffnenden Klammern an startIdx gemeint ist (0 = äußerste)
	function findParenClosePairAtDepth(startIdx, depthOffset) {
		var depth = 0;
		for (var i = startIdx; i < groups.length; i++) {
			var openHere = groups[i].parenOpen || 0;
			var closeHere = groups[i].parenClose || 0;
			depth += openHere;
			// Beim Schließen: prüfe ob wir auf depth 1 kommen (= das Paar zur äußersten öffnenden)
			for (var c = 0; c < closeHere; c++) {
				depth--;
				if (depth === depthOffset && i >= startIdx) return i;
			}
		}
		return -1;
	}

	// Hilfsfunktion: Finde die zugehörige öffnende Klammer für die N-te schließende bei endIdx
	function findParenOpenPairAtDepth(endIdx, depthOffset) {
		var depth = 0;
		for (var i = endIdx; i >= 0; i--) {
			var closeHere = groups[i].parenClose || 0;
			var openHere = groups[i].parenOpen || 0;
			depth += closeHere;
			for (var o = 0; o < openHere; o++) {
				depth--;
				if (depth === depthOffset && i <= endIdx) return i;
			}
		}
		return -1;
	}

	// Alte Funktionen für Kompatibilität (werden intern noch gebraucht)
	function findParenClosePair(startIdx) {
		return findParenClosePairAtDepth(startIdx, 0);
	}

	function findParenOpenPair(endIdx) {
		return findParenOpenPairAtDepth(endIdx, 0);
	}

	// Validierung: Prüfe ob neue Klammern korrekt verschachtelt sind (keine Überlappung)
	function isValidParenPlacement(newStart, newEnd) {
		// Sammle alle bestehenden Klammer-Paare
		var existingPairs = [];
		for (var i = 0; i < groups.length; i++) {
			var openCount = groups[i].parenOpen || 0;
			// Für jede öffnende Klammer an Position i das zugehörige Ende finden
			var tempDepth = 0;
			for (var j = i; j < groups.length; j++) {
				tempDepth += (groups[j].parenOpen || 0);
				var closeHere = groups[j].parenClose || 0;
				for (var c = 0; c < closeHere; c++) {
					tempDepth--;
					if (tempDepth < openCount && j >= i) {
						// Gefundenes Paar
						existingPairs.push({ start: i, end: j });
						openCount--;
						if (openCount === 0) break;
					}
				}
				if (openCount === 0) break;
			}
		}

		// Prüfe ob das neue Paar mit bestehenden überlappt (aber Verschachtelung ist OK!)
		for (var p = 0; p < existingPairs.length; p++) {
			var existing = existingPairs[p];
			// Überlappung: neues Paar startet innerhalb eines bestehenden aber endet außerhalb (oder umgekehrt)
			var newStartInside = newStart > existing.start && newStart <= existing.end;
			var newEndInside = newEnd >= existing.start && newEnd < existing.end;

			if (newStartInside && !newEndInside) return false; // Überlappt links raus
			if (!newStartInside && newEndInside && newStart < existing.start) return false; // Überlappt rechts raus
		}

		return true;
	}

	function formatOutputLine(text) {
		return '[' + new Date().toLocaleTimeString() + '] ' + text;
	}

	function trimBuffer(buffer, max) {
		return buffer.length > max ? buffer.slice(-max) : buffer;
	}

	var outputDirty = false;

	function appendOutput(text) {
		outputBuffer.push(formatOutputLine(text));
		outputBuffer = trimBuffer(outputBuffer, maxOutputLines);
		if (!outputDirty) {
			outputDirty = true;
			requestAnimationFrame(renderOutput);
		}
	}

	function renderOutput() {
		outputDiv.textContent = outputBuffer.join('\n');
		outputDiv.scrollTop = outputDiv.scrollHeight;
		outputDirty = false;
	}

	function clearOutput() {
		outputBuffer = [];
		outputDiv.textContent = '';
	}

	function setStatus(text) {
		statusDiv.textContent = 'Status: ' + text;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// TEXT OVERLAY
	// ═══════════════════════════════════════════════════════════════════════

	function showTextOnVideo(message, style) {
		if (!textOverlay) return;
		textOverlay.textContent = message;
		textOverlay.className = 'text-overlay-visible';
		if (style && style !== 'normal') textOverlay.classList.add('style-' + style);
	}

	function clearTextOverlay() {
		if (!textOverlay) return;
		textOverlay.textContent = '';
		textOverlay.className = '';
	}

	// ═══════════════════════════════════════════════════════════════════════
	// CAMERA
	// ═══════════════════════════════════════════════════════════════════════

	function requestCameraPermission() {
		return navigator.mediaDevices.getUserMedia({ video: true });
	}

	function stopTempStream(stream) {
		if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
	}

	function createCameraOption(device, idx) {
		var option = document.createElement('option');
		option.value = device.deviceId;
		option.textContent = device.label || ('Kamera ' + (idx + 1));
		return option;
	}

	function filterVideoDevices(devices) {
		return devices.filter(function (d) { return d.kind === 'videoinput'; });
	}

	function populateCameraSelect(select, videoDevices) {
		select.innerHTML = '';
		videoDevices.forEach(function (device, idx) {
			select.appendChild(createCameraOption(device, idx));
		});
	}

	async function enumerateGameCameras() {
		var select = document.getElementById('game_camera_select');
		var wrapper = document.getElementById('camera_selector_wrapper');
		var topbar = document.querySelector('.topbar-controls');
		try {
			stopTempStream(await requestCameraPermission());
		} catch (e) {
			select.innerHTML = '<option value="">Kein Kamerazugriff</option>';
			if (wrapper) {
				wrapper.innerHTML = '<label>📷</label><span style="color:#e57373; font-size:0.9em;">⚠️ Keine Kamera gefunden!</span>';
				wrapper.style.display = 'inline-flex';
			}
			if (topbar) topbar.style.display = '';
			return;
		}
		try {
			var devices = await navigator.mediaDevices.enumerateDevices();
			var videoDevices = filterVideoDevices(devices);

			if (videoDevices.length === 0) {
				// 0 cameras: show topbar with a message
				select.innerHTML = '<option value="">Keine Kamera</option>';
				if (wrapper) {
					wrapper.innerHTML = '<label>📷</label><span style="color:#e57373; font-size:0.9em;">⚠️ Keine Kamera gefunden!</span>';
					wrapper.style.display = 'inline-flex';
				}
				if (topbar) topbar.style.display = '';
			} else if (videoDevices.length === 1) {
				// 1 camera: hide the ENTIRE topbar-controls
				populateCameraSelect(select, videoDevices);
				if (wrapper) wrapper.style.display = 'none';
				if (topbar) topbar.style.display = 'none';
			} else {
				// 2+ cameras: show topbar with camera selector
				populateCameraSelect(select, videoDevices);
				if (wrapper) wrapper.style.display = 'inline-flex';
				if (topbar) topbar.style.display = '';
			}
		} catch (e) {
			select.innerHTML = '<option value="">Kamera-Fehler</option>';
			if (wrapper) {
				wrapper.innerHTML = '<label>📷</label><span style="color:#e57373; font-size:0.9em;">⚠️ Kamera-Fehler</span>';
				wrapper.style.display = 'inline-flex';
			}
			if (topbar) topbar.style.display = '';
		}
	}
	enumerateGameCameras();

	function getCameraConstraints() {
		var deviceId = document.getElementById('game_camera_select').value;
		return { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };
	}

	function waitForVideoMetadata(vid) {
		return new Promise(function (resolve) {
			vid.onloadedmetadata = resolve;
			setTimeout(resolve, 3000);
		});
	}

	function waitForVideoReady(vid) {
		return new Promise(function (resolve) {
			if (vid.readyState >= 2) return resolve();
			vid.oncanplay = resolve;
			setTimeout(resolve, 2000);
		});
	}

	function showVideoElement() {
		if (camPlaceholder) camPlaceholder.style.display = 'none';
		video.style.display = 'block';
		video.style.transform = 'scaleX(-1)';
	}

	async function startGameWebcam() {
		if (webcamStream) return true;
		try {
			webcamStream = await navigator.mediaDevices.getUserMedia(getCameraConstraints());
			video.srcObject = webcamStream;
			await waitForVideoMetadata(video);
			await waitForVideoReady(video);
			syncOverlaySize();
			showVideoElement();
			return true;
		} catch (e) {
			return handleWebcamError(e);
		}
	}

	function handleWebcamError(e) {
		webcamStream = null;
		video.srcObject = null;
		appendOutput("FEHLER: Kamera - " + (e.message || "Unbekannt"));
		return false;
	}

	function overlayResolutionChanged(vw, vh) {
		return vw > 0 && vh > 0 && (vw !== lastOverlayW || vh !== lastOverlayH);
	}

	function overlayClientSizeChanged(cw, ch) {
		return cw !== lastOverlayClientW || ch !== lastOverlayClientH;
	}

	function syncOverlaySize() {
		if (!overlayCanvas || !video) return;
		var vw = video.videoWidth, vh = video.videoHeight;
		var cw = video.clientWidth, ch = video.clientHeight;
		if (overlayResolutionChanged(vw, vh)) {
			overlayCanvas.width = vw;
			overlayCanvas.height = vh;
			lastOverlayW = vw;
			lastOverlayH = vh;
		}
		if (overlayClientSizeChanged(cw, ch)) {
			overlayCanvas.style.width = cw + 'px';
			overlayCanvas.style.height = ch + 'px';
			lastOverlayClientW = cw;
			lastOverlayClientH = ch;
		}
	}

	function stopGameWebcam() {
		if (webcamStream) {
			try { webcamStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { }
			webcamStream = null;
		}
		video.srcObject = null;
		video.style.display = 'none';
		if (camPlaceholder) camPlaceholder.style.display = 'flex';
	}

	// ═══════════════════════════════════════════════════════════════════════
	// MODEL LOADING
	// ═══════════════════════════════════════════════════════════════════════

	async function fetchLabels(modelUuid) {
		var resp = await fetch('labels.php?model_uuid=' + encodeURIComponent(modelUuid));
		if (!resp.ok) return [];
		try { return JSON.parse(await resp.text()); }
		catch (e) { return []; }
	}

	function disposeOldModel() {
		if (gameModel) try { gameModel.dispose(); } catch (e) { }
	}

	function getModelUrl(modelUuid) {
		return "get_model_file.php?&uuid=" + encodeURIComponent(modelUuid) + "&filename=model.json";
	}

	async function loadTfModel(modelUuid) {
		if (typeof tf === 'undefined') throw new Error("TensorFlow.js nicht geladen");

		await tf.setBackend('webgl');

		await tf.ready();
		disposeOldModel();
		return await tf.loadGraphModel(getModelUrl(modelUuid));
	}

	async function loadGameModel(modelUuid) {
		if (gameModel && currentModelUuid === modelUuid) return true;
		if (isLoadingModel) return false;
		isLoadingModel = true;
		setStatus('Modell wird geladen...');

		gameLabels = await fetchLabels(modelUuid);
		showModelLabels(gameLabels);

		try {
			gameModel = await loadTfModel(modelUuid);
			currentModelUuid = modelUuid;
			isLoadingModel = false;
			setStatus('Modell geladen ✓');
			appendOutput("✅ Modell geladen. Kategorien: [" + gameLabels.join(", ") + "]");
			if (typeof window.updateBlockEditorLabels === 'function') window.updateBlockEditorLabels(gameLabels);
			return true;
		} catch (e) {
			return handleModelError(e);
		}
	}

	function handleModelError(e) {
		gameModel = null;
		currentModelUuid = null;
		isLoadingModel = false;
		appendOutput("FEHLER: Modell - " + (e.message || "Unbekannt"));
		setStatus('Modell-Fehler');
		return false;
	}

	function getLabelChipColor(idx) {
		var colors = ['#4fc3f7', '#ffb74d', '#ba68c8', '#66bb6a', '#e57373', '#ff8a65'];
		return colors[idx % colors.length];
	}

	function createLabelChip(label, idx) {
		var chip = document.createElement('span');
		chip.className = 'label-chip';
		chip.style.background = getLabelChipColor(idx);
		chip.textContent = label;
		return chip;
	}

	function showModelLabels(labels) {
		var container = document.getElementById('model_labels_chips');
		var wrapper = document.getElementById('model_labels_info');
		if (!container || !wrapper) return;
		if (!labels || labels.length === 0) { wrapper.style.display = 'none'; return; }
		wrapper.style.display = 'inline-flex';
		container.innerHTML = '';
		labels.forEach(function (label, idx) { container.appendChild(createLabelChip(label, idx)); });
	}

	// ═══════════════════════════════════════════════════════════════════════
	// DETECTION
	// ═══════════════════════════════════════════════════════════════════════

	function getModelInputShape() {
		try {
			if (gameModel.inputs && gameModel.inputs[0] && gameModel.inputs[0].shape)
				return gameModel.inputs[0].shape.slice(1, 3);
		} catch (e) { }
		return [640, 640];
	}

	function getGameConfThreshold() {
		return 0.3;
	}

	function computeIntersection(a, b) {
		var x1 = Math.max(a.xMin, b.xMin), y1 = Math.max(a.yMin, b.yMin);
		var x2 = Math.min(a.xMax, b.xMax), y2 = Math.min(a.yMax, b.yMax);
		return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
	}

	function computeArea(box) {
		return (box.xMax - box.xMin) * (box.yMax - box.yMin);
	}

	function computeIoU(a, b) {
		var inter = computeIntersection(a, b);
		var union = computeArea(a) + computeArea(b) - inter;
		return union <= 0 ? 0 : inter / union;
	}

	function isDominated(detection, kept, iouThresh) {
		for (var j = 0; j < kept.length; j++) {
			if (computeIoU(detection, kept[j]) > iouThresh) return true;
		}
		return false;
	}

	function simpleNMS(detections, iouThresh) {
		if (!detections || detections.length === 0) return [];
		detections.sort(function (a, b) { return b.score - a.score; });
		var kept = [];
		for (var i = 0; i < detections.length; i++) {
			if (!isDominated(detections[i], kept, iouThresh)) kept.push(detections[i]);
		}
		return kept;
	}

	async function createInputTensor(shape) {
		const pixels = await tf.browser.fromPixelsAsync(video);
		try {
			return tf.tidy(() => pixels.resizeBilinear([shape[0], shape[1]]).div(255).expandDims());
		} finally {
			pixels.dispose();
		}
	}

	function disposeOutput(output) {
		if (output instanceof tf.Tensor) {
			try { output.dispose(); } catch (x) { }
		} else if (Array.isArray(output)) {
			output.forEach(function (t) { try { t.dispose(); } catch (x) { } });
		}
	}

	async function extractOutputArray(output) {
		if (output instanceof tf.Tensor) {
			var res = await output.array();
			output.dispose();
			return res;
		}
		if (Array.isArray(output)) {
			var res = await output[0].array();
			output.forEach(function (t) { try { t.dispose(); } catch (x) { } });
			return res;
		}
		return output;
	}

	function isDetectionReady() {
		return gameModel && webcamStream && video.readyState >= 2;
	}

	async function runDetection() {
		if (!isDetectionReady()) return [];
		var shape = getModelInputShape();
		var confThreshold = getGameConfThreshold();
		var inputTensor = null, output = null;

		try { inputTensor = await createInputTensor(shape); }
		catch (e) { if (inputTensor) try { inputTensor.dispose(); } catch (x) { } return []; }

		try { output = gameModel.execute(inputTensor); }
		catch (e) { inputTensor.dispose(); return []; }

		inputTensor.dispose();

		var res;
		try { res = await extractOutputArray(output); }
		catch (e) { disposeOutput(output); return []; }

		try { return processOutput(res, shape[1], shape[0], confThreshold); }
		catch (e) { return []; }
	}

	// ─── Process output ─────────────────────────────────────────────────

	function transposeIfNeeded(rawTensor) {
		var s = rawTensor.shape;
		if (s[1] > s[2]) return { tensor: rawTensor.transpose([0, 2, 1]), features: s[2], candidates: s[1] };
		return { tensor: rawTensor, features: s[1], candidates: s[2] };
	}

	async function extractBoxesAndScores(res) {
		const { boxesTensor, scoresTensor, numClasses } = tf.tidy(() => {
			const raw = tf.tensor3d(res);
			const s = raw.shape;
			const transposed = s[1] > s[2] ? raw.transpose([0, 2, 1]) : raw;
			const nc = (s[1] > s[2] ? s[2] : s[1]) - 4;
			if (nc <= 0) return { boxesTensor: null, scoresTensor: null, numClasses: 0 };

			const pred = transposed.transpose([0, 2, 1]);
			const [b, sc] = tf.split(pred, [4, nc], 2);
			return {
				boxesTensor: b.squeeze(),
				scoresTensor: sc.squeeze(),
				numClasses: nc
			};
		});

		if (!boxesTensor) return null;

		// Single parallel download instead of sequential
		const [boxes, scores] = await Promise.all([
			boxesTensor.array(),
			scoresTensor.array()
		]);
		boxesTensor.dispose();
		scoresTensor.dispose();

		return { boxes, scores, numClasses };
	}

	function isValidOutput(res) {
		return res && Array.isArray(res) && Array.isArray(res[0]) && Array.isArray(res[0][0]);
	}

	function getBestClass(classScores) {
		var bestScore = 0, bestClass = -1;
		if (!Array.isArray(classScores)) return { score: classScores, classIdx: 0 };
		for (var c = 0; c < classScores.length; c++) {
			if (classScores[c] > bestScore) { bestScore = classScores[c]; bestClass = c; }
		}
		return { score: bestScore, classIdx: bestClass };
	}

	function boxToNormalized(cx, cy, w, h, modelWidth, modelHeight) {
		var isPixel = cx > 2.0 || cy > 2.0;
		if (isPixel) return {
			xMin: (cx - w / 2) / modelWidth, yMin: (cy - h / 2) / modelHeight,
			xMax: (cx + w / 2) / modelWidth, yMax: (cy + h / 2) / modelHeight
		};
		return { xMin: cx - w / 2, yMin: cy - h / 2, xMax: cx + w / 2, yMax: cy + h / 2 };
	}

	function clampBox(box) {
		return {
			xMin: Math.max(0, box.xMin), yMin: Math.max(0, box.yMin),
			xMax: Math.min(1, box.xMax), yMax: Math.min(1, box.yMax)
		};
	}

	function getLabelForClass(classIdx) {
		return (gameLabels && gameLabels[classIdx]) ? gameLabels[classIdx] : ('class_' + classIdx);
	}

	function buildDetection(boxArr, classScores, modelWidth, modelHeight, confThreshold, numClasses) {
		var scores = numClasses === 1 ? [classScores] : classScores;
		var best = getBestClass(scores);
		if (best.score < confThreshold) return null;
		var raw = boxToNormalized(boxArr[0], boxArr[1], boxArr[2], boxArr[3], modelWidth, modelHeight);
		var clamped = clampBox(raw);
		// Mirror x-coordinates horizontally
		var mirroredXMin = 1 - clamped.xMax;
		var mirroredXMax = 1 - clamped.xMin;
		return {
			xMin: mirroredXMin, yMin: clamped.yMin, xMax: mirroredXMax, yMax: clamped.yMax,
			score: best.score, label: getLabelForClass(best.classIdx)
		};
	}

	async function processOutput(res, modelWidth, modelHeight, confThreshold) {
		if (!isValidOutput(res)) return [];
		var extracted = await extractBoxesAndScores(res);
		if (!extracted) return [];
		var detections = [];
		for (var i = 0; i < extracted.boxes.length; i++) {
			var det = buildDetection(extracted.boxes[i], extracted.scores[i],
				modelWidth, modelHeight, confThreshold, extracted.numClasses);
			if (det) detections.push(det);
		}
		return simpleNMS(detections, 0.5);
	}

	// ═══════════════════════════════════════════════════════════════════════
	// DRAW DETECTIONS
	// ═══════════════════════════════════════════════════════════════════════

	function getDetectionColor(idx) {
		var colors = ['#00ff88', '#ff6b9d', '#4fc3f7', '#ffb74d', '#ba68c8', '#e57373'];
		return colors[idx % colors.length];
	}

	function drawBoundingBox(ctx, x, y, bw, bh, color) {
		ctx.strokeStyle = color;
		ctx.lineWidth = 3;
		ctx.strokeRect(x, y, bw, bh);
	}

	function drawDetectionLabel(ctx, text, x, y, color) {
		ctx.font = 'bold 14px sans-serif';
		var tw = ctx.measureText(text).width;
		ctx.fillStyle = color;
		ctx.fillRect(x, y - 22, tw + 10, 22);
		ctx.fillStyle = '#000';
		ctx.fillText(text, x + 5, y - 6);
	}

	function drawSingleDetection(ctx, det, w, h, idx) {
		var x = det.xMin * w, y = det.yMin * h;
		var bw = (det.xMax - det.xMin) * w, bh = (det.yMax - det.yMin) * h;
		var color = getDetectionColor(idx);
		drawBoundingBox(ctx, x, y, bw, bh, color);
		drawDetectionLabel(ctx, det.label + ' ' + (det.score * 100).toFixed(0) + '%', x, y, color);
	}

	function drawGameDetections(detections) {
		if (!overlayCtx || !overlayCanvas) return;
		syncOverlaySize();
		var w = overlayCanvas.width, h = overlayCanvas.height;
		overlayCtx.clearRect(0, 0, w, h);
		if (!detections || detections.length === 0) return;
		for (var i = 0; i < detections.length; i++) drawSingleDetection(overlayCtx, detections[i], w, h, i);
	}

	// ═══════════════════════════════════════════════════════════════════════
	// DSL INTERPRETER — TOKENIZER & PARSER
	// ═══════════════════════════════════════════════════════════════════════

	function findCommentIndex(line) {
		var inStr = false, strChar = '';
		for (var i = 0; i < line.length; i++) {
			if (!inStr && (line[i] === '"' || line[i] === "'")) { inStr = true; strChar = line[i]; }
			else if (inStr && line[i] === strChar) { inStr = false; }
			else if (!inStr && line[i] === '#') return i;
		}
		return -1;
	}

	function tokenizeLine(line) {
		var idx = findCommentIndex(line);
		if (idx !== -1) line = line.substring(0, idx);
		return line.trim();
	}

	function parseScript(code) {
		var lines = code.split('\n'), parsed = [];
		for (var i = 0; i < lines.length; i++) {
			var trimmed = tokenizeLine(lines[i]);
			if (trimmed !== '') parsed.push({ lineNum: i + 1, text: trimmed });
		}
		return parsed;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// EXPRESSION EVALUATOR
	// ═══════════════════════════════════════════════════════════════════════

	function isNumberLiteral(expr) {
		return /^-?\d+(\.\d+)?$/.test(expr);
	}

	function isStringLiteral(expr) {
		return (expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"));
	}

	function isIdentifier(expr) {
		return /^[a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*$/.test(expr);
	}

	function stripStringQuotes(expr) {
		return expr.substring(1, expr.length - 1);
	}

	function isWrappedInParens(expr) {
		return expr.startsWith('(') && findMatchingParen(expr, 0) === expr.length - 1;
	}

	function addValues(left, right) {
		if (typeof left === 'string' || typeof right === 'string') return String(left) + String(right);
		return (parseFloat(left) || 0) + (parseFloat(right) || 0);
	}

	function subtractValues(left, right) {
		return (parseFloat(left) || 0) - (parseFloat(right) || 0);
	}

	function applyMulDivMod(op, left, right) {
		var l = parseFloat(left) || 0, r = parseFloat(right) || 0;
		if (op === '*') return l * r;
		if (op === '/') return r !== 0 ? l / r : 0;
		return r !== 0 ? l % r : 0;
	}

	function evaluateExpression(expr, vars) {
		expr = expr.trim();
		if (expr === '') return '';
		if (isNumberLiteral(expr)) return parseFloat(expr);
		if (isWrappedInParens(expr)) return evaluateExpression(expr.substring(1, expr.length - 1), vars);

		var plusMinus = splitArithmetic(expr, ['+', '-']);
		if (plusMinus) return evaluatePlusMinus(plusMinus, vars);

		var mulDiv = splitArithmetic(expr, ['*', '/', '%']);
		if (mulDiv) return evaluateMulDiv(mulDiv, vars);

		if (isStringLiteral(expr)) return stripStringQuotes(expr);
		if (vars.hasOwnProperty(expr)) return vars[expr];
		if (isIdentifier(expr)) return 0;
		return expr;
	}

	function evaluatePlusMinus(split, vars) {
		var left = evaluateExpression(split.left, vars);
		var right = evaluateExpression(split.right, vars);
		return split.op === '+' ? addValues(left, right) : subtractValues(left, right);
	}

	function evaluateMulDiv(split, vars) {
		var left = evaluateExpression(split.left, vars);
		var right = evaluateExpression(split.right, vars);
		return applyMulDivMod(split.op, left, right);
	}

	function findMatchingParen(str, openIdx) {
		var depth = 0, inStr = false, strChar = '';
		for (var i = openIdx; i < str.length; i++) {
			var ch = str[i];
			if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
			else if (inStr && ch === strChar) { inStr = false; }
			else if (!inStr && ch === '(') { depth++; }
			else if (!inStr && ch === ')') { depth--; if (depth === 0) return i; }
		}
		return -1;
	}

	function isUnaryMinus(expr, i) {
		return i === 0 || /[+\-*/%=(]/.test(expr[i - 1]);
	}

	function splitArithmetic(expr, ops) {
		var inStr = false, strChar = '', depth = 0;
		var lastOpIdx = -1, lastOp = null;
		for (var i = 0; i < expr.length; i++) {
			var ch = expr[i];
			if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
			else if (inStr && ch === strChar) { inStr = false; }
			else if (!inStr && ch === '(') { depth++; }
			else if (!inStr && ch === ')') { depth--; }
			else if (!inStr && depth === 0) {
				for (var o = 0; o < ops.length; o++) {
					if (ch === ops[o]) {
						if (ch === '-' && isUnaryMinus(expr, i)) continue;
						lastOpIdx = i;
						lastOp = ops[o];
					}
				}
			}
		}
		if (lastOpIdx <= 0 || lastOpIdx >= expr.length - 1) return null;
		return { left: expr.substring(0, lastOpIdx).trim(), op: lastOp, right: expr.substring(lastOpIdx + 1).trim() };
	}

	// ═══════════════════════════════════════════════════════════════════════
	// CONDITION EVALUATOR
	// ═══════════════════════════════════════════════════════════════════════

	function replaceGermanOperators(condStr) {
		return condStr
			.replace(/\bist größer oder gleich\b/g, '>=')
			.replace(/\bist kleiner oder gleich\b/g, '<=')
			.replace(/\bist größer als\b/g, '>')
			.replace(/\bist kleiner als\b/g, '<')
			.replace(/\bist nicht gleich\b/g, '!=')
			.replace(/\bist gleich\b/g, '==')
			.replace(/\bist nicht\b/g, '!=');
	}

	function evaluateComparison(op, leftVal, rightVal) {
		switch (op) {
			case '==': return leftVal == rightVal;
			case '!=': return leftVal != rightVal;
			case '>=': return parseFloat(leftVal) >= parseFloat(rightVal);
			case '<=': return parseFloat(leftVal) <= parseFloat(rightVal);
			case '>': return parseFloat(leftVal) > parseFloat(rightVal);
			case '<': return parseFloat(leftVal) < parseFloat(rightVal);
		}
		return false;
	}

	function isTruthy(val) {
		return !!val && val !== "none" && val !== 0 && val !== "0" && val !== "";
	}

	function evaluateCondition(condStr, vars) {
		condStr = replaceGermanOperators(condStr.trim());

		// Support German logical operators
		condStr = condStr.replace(/\bund\b/g, 'and').replace(/\boder\b/g, 'or');

		var andParts = splitLogical(condStr, ' and ');
		if (andParts.length > 1) return evaluateAnd(andParts, vars);

		var orParts = splitLogical(condStr, ' or ');
		if (orParts.length > 1) return evaluateOr(orParts, vars);

		if (condStr.startsWith('not ')) return !evaluateCondition(condStr.substring(4), vars);

		return evaluateComparisonOrTruthy(condStr, vars);
	}

	function evaluateAnd(parts, vars) {
		for (var i = 0; i < parts.length; i++) {
			if (!evaluateCondition(parts[i], vars)) return false;
		}
		return true;
	}

	function evaluateOr(parts, vars) {
		for (var i = 0; i < parts.length; i++) {
			if (evaluateCondition(parts[i], vars)) return true;
		}
		return false;
	}

	function evaluateComparisonOrTruthy(condStr, vars) {
		var operators = ['==', '!=', '>=', '<=', '>', '<'];
		for (var i = 0; i < operators.length; i++) {
			var opIdx = findOperatorIndex(condStr, operators[i]);
			if (opIdx !== -1) return evaluateComparisonAt(condStr, operators[i], opIdx, vars);
		}
		return isTruthy(evaluateExpression(condStr, vars));
	}

	function evaluateComparisonAt(condStr, op, opIdx, vars) {
		var leftVal = evaluateExpression(condStr.substring(0, opIdx).trim(), vars);
		var rightVal = evaluateExpression(condStr.substring(opIdx + op.length).trim(), vars);
		return evaluateComparison(op, leftVal, rightVal);
	}

	function findOperatorIndex(str, op) {
		var inStr = false, strChar = '', depth = 0;
		for (var i = 0; i <= str.length - op.length; i++) {
			var ch = str[i];
			if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
			else if (inStr && ch === strChar) { inStr = false; }
			else if (!inStr && ch === '(') { depth++; }
			else if (!inStr && ch === ')') { depth--; }
			else if (!inStr && depth === 0 && str.substring(i, i + op.length) === op) {
				if (isAmbiguousOperator(str, op, i)) continue;
				return i;
			}
		}
		return -1;
	}

	function isAmbiguousOperator(str, op, i) {
		if (op === '>' && i + 1 < str.length && str[i + 1] === '=') return true;
		if (op === '<' && i + 1 < str.length && str[i + 1] === '=') return true;
		if (op === '=' && i > 0 && (str[i - 1] === '!' || str[i - 1] === '>' || str[i - 1] === '<')) return true;
		return false;
	}

	function splitLogical(str, separator) {
		var parts = [], current = '', inStr = false, strChar = '', depth = 0;
		var sepLen = separator.length;
		for (var i = 0; i < str.length; i++) {
			var ch = str[i];
			if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; current += ch; }
			else if (inStr && ch === strChar) { inStr = false; current += ch; }
			else if (!inStr && ch === '(') { depth++; current += ch; }
			else if (!inStr && ch === ')') { depth--; current += ch; }
			else if (!inStr && depth === 0 && str.substring(i, i + sepLen) === separator) {
				parts.push(current); current = ''; i += sepLen - 1;
			}
			else { current += ch; }
		}
		parts.push(current);
		return parts;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// DSL INTERPRETER — MAIN EXECUTION
	// ═══════════════════════════════════════════════════════════════════════

	function interpretScript(parsedLines, vars) {
		var state = { output: [], showTextCommands: [], iterations: 0 };
		execute(parsedLines, vars, state, 0, parsedLines.length);
		return { output: state.output, showTextCommands: state.showTextCommands };
	}

	function execute(parsedLines, vars, state, startIdx, endIdx) {
		var idx = startIdx;
		while (idx < endIdx) {
			if (++state.iterations > MAX_ITERATIONS) { state.output.push("⚠️ ABBRUCH: Zu viele Iterationen"); return endIdx; }
			idx = executeLine(parsedLines, vars, state, idx, endIdx);
		}
		return idx;
	}

	function executeLine(parsedLines, vars, state, idx, endIdx) {
		var line = parsedLines[idx].text;
		if (line.startsWith('while ')) return executeWhile(parsedLines, vars, state, idx, endIdx);
		if (line.startsWith('for ')) return executeFor(parsedLines, vars, state, idx, endIdx);
		if (line.startsWith('if ')) return executeIfBlock(parsedLines, vars, state, idx, endIdx);
		if (line.startsWith('elif ') || line === 'else') return idx;
		return executeSingleStatement(line, vars, state) ? idx + 1 : idx + 1;
	}

	function executeSingleStatement(line, vars, state) {
		if (tryShowText(line, vars, state)) return true;
		if (tryPrint(line, vars, state)) return true;
		if (tryCelebration(line, vars)) return true;
		if (tryAssignment(line, vars)) return true;
		if (tryCompoundAssignment(line, vars)) return true;
		return false;
	}

	// ─── Celebration commands ───────────────────────────────────────────

	function tryCelebration(line, vars) {
		// celebrate("type")
		var celebrateMatch = line.match(/^celebrate\s*\(\s*["'](\w+)["']\s*\)$/);
			if (celebrateMatch) {
				if (typeof window.celebrate === 'function') {
					window.celebrate(celebrateMatch[1]);
				}
				return true;
			}
			// celebrate_stop()
			if (line === 'celebrate_stop()' || line === 'stopCelebration()') {
				if (typeof window.stopCelebrationImmediate === 'function') {
					window.stopCelebrationImmediate();
				}
				return true;
			}
			return false;
		}

	// ─── Show Text ──────────────────────────────────────────────────────

	function tryShowText(line, vars, state) {
		if (!line.startsWith('show_text ')) return false;
		var showArgs = parseShowTextArgs(line);
		if (!showArgs) return false;
		var msg = evaluateShowTextMessage(showArgs.message, vars);
		state.showTextCommands.push({ message: String(msg), style: showArgs.style || 'normal' });
		return true;
	}

	// ─── Print ──────────────────────────────────────────────────────────

	function tryPrint(line, vars, state) {
		var printArg = parsePrintArgument(line);
		if (printArg === null) return false;
		var result = evaluatePrintExpression(printArg, vars);
		state.output.push(String(result));
		return true;
	}

	function evaluateShowTextMessage(message, vars) {
		if (isStringLiteral(message)) return stripStringQuotes(message);
		if (isNumberLiteral(message)) return parseFloat(message);
		// IMMER interpolieren - auch als Fallback
		return interpolateString(message, vars);
	}

	function evaluatePrintExpression(arg, vars) {
		if (isStringLiteral(arg)) return stripStringQuotes(arg);
		if (isNumberLiteral(arg)) return parseFloat(arg);
		// IMMER interpolieren - auch als Fallback
		return interpolateString(arg, vars);
	}

	function containsDollarVar(str) {
		return /\$[a-zA-Z_\u00C0-\u024F]/.test(str);
	}

	// ─── Assignment ─────────────────────────────────────────────────────

	function getAssignmentMatch(line) {
		return line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*=\s*(.+)$/);
	}

	function tryAssignment(line, vars) {
		var match = getAssignmentMatch(line);
		if (!match) return false;
		vars[match[1]] = evaluateExpression(match[2].trim(), vars);
		return true;
	}

	// ─── Compound Assignment ────────────────────────────────────────────

	function getCompoundMatch(line) {
		return line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
	}

	function applyCompoundOp(op, current, val) {
		if (op === '+=') return addValues(current, val);
		if (op === '-=') return (parseFloat(current) || 0) - (parseFloat(val) || 0);
		if (op === '*=') return (parseFloat(current) || 0) * (parseFloat(val) || 0);
		if (op === '/=') return (parseFloat(val) || 0) !== 0 ? (parseFloat(current) || 0) / (parseFloat(val) || 0) : 0;
		return (parseFloat(val) || 0) !== 0 ? (parseFloat(current) || 0) % (parseFloat(val) || 0) : 0;
	}

	function tryCompoundAssignment(line, vars) {
		var match = getCompoundMatch(line);
		if (!match) return false;
		var current = vars.hasOwnProperty(match[1]) ? vars[match[1]] : 0;
		var val = evaluateExpression(match[3].trim(), vars);
		vars[match[1]] = applyCompoundOp(match[2], current, val);
		return true;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// WHILE LOOP
	// ═══════════════════════════════════════════════════════════════════════

	function extractWhileCondition(line) {
		return line.substring(6).trim();
	}

	function executeWhile(parsedLines, vars, state, startIdx, endIdx) {
		var condStr = extractWhileCondition(parsedLines[startIdx].text);
		var bodyStart = startIdx + 1;
		var bodyEnd = findMatchingEnd(parsedLines, bodyStart, endIdx);
		runWhileBody(parsedLines, vars, state, condStr, bodyStart, bodyEnd);
		return bodyEnd + 1;
	}

	function runWhileBody(parsedLines, vars, state, condStr, bodyStart, bodyEnd) {
		while (evaluateCondition(condStr, vars)) {
			if (++state.iterations > MAX_ITERATIONS) { state.output.push("⚠️ ABBRUCH: Zu viele Iterationen"); break; }
			execute(parsedLines, vars, state, bodyStart, bodyEnd);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// FOR LOOP
	// ═══════════════════════════════════════════════════════════════════════

	function parseForHeader(line) {
		return line.match(/^for\s+([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s+in\s+range\((.+)\)$/);
	}

	function parseRangeArgs(argsStr, vars) {
		var args = argsStr.split(',').map(function (s) { return s.trim(); });
		var start = 0, end = 0, step = 1;
		if (args.length === 1) { end = Math.floor(parseFloat(evaluateExpression(args[0], vars)) || 0); }
		else if (args.length === 2) {
			start = Math.floor(parseFloat(evaluateExpression(args[0], vars)) || 0);
			end = Math.floor(parseFloat(evaluateExpression(args[1], vars)) || 0);
		} else {
			start = Math.floor(parseFloat(evaluateExpression(args[0], vars)) || 0);
			end = Math.floor(parseFloat(evaluateExpression(args[1], vars)) || 0);
			step = Math.floor(parseFloat(evaluateExpression(args[2], vars)) || 1);
			if (step === 0) step = 1;
		}
		return { start: start, end: end, step: step };
	}

	function executeFor(parsedLines, vars, state, startIdx, endIdx) {
		var match = parseForHeader(parsedLines[startIdx].text);
		if (!match) { state.output.push("⚠️ Syntax-Fehler: " + parsedLines[startIdx].text); return startIdx + 1; }
		var loopVar = match[1];
		var range = parseRangeArgs(match[2], vars);
		var bodyStart = startIdx + 1;
		var bodyEnd = findMatchingEnd(parsedLines, bodyStart, endIdx);
		runForBody(parsedLines, vars, state, loopVar, range, bodyStart, bodyEnd);
		return bodyEnd + 1;
	}

	function shouldContinueFor(i, range) {
		return range.step > 0 ? i < range.end : i > range.end;
	}

	function runForBody(parsedLines, vars, state, loopVar, range, bodyStart, bodyEnd) {
		for (var i = range.start; shouldContinueFor(i, range); i += range.step) {
			if (++state.iterations > MAX_ITERATIONS) { state.output.push("⚠️ ABBRUCH: Zu viele Iterationen"); break; }
			vars[loopVar] = i;
			execute(parsedLines, vars, state, bodyStart, bodyEnd);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// IF / ELIF / ELSE
	// ═══════════════════════════════════════════════════════════════════════

	function extractIfCondition(line) {
		return line.substring(3).trim();
	}

	function extractElifCondition(line) {
		return line.substring(5).trim();
	}

	function executeIfBlock(parsedLines, vars, state, startIdx, endIdx) {
		var conditionMet = false;
		var ifCond = extractIfCondition(parsedLines[startIdx].text);
		var idx = startIdx + 1;

		if (evaluateCondition(ifCond, vars)) {
			conditionMet = true;
			idx = executeBodyUntilBranch(parsedLines, vars, state, idx, endIdx);
		} else {
			idx = skipBodyUntilBranch(parsedLines, idx, endIdx);
		}

		return processRemainingBranches(parsedLines, vars, state, idx, endIdx, conditionMet);
	}

	function processRemainingBranches(parsedLines, vars, state, idx, endIdx, conditionMet) {
		while (idx < endIdx) {
			var line = parsedLines[idx].text;
			if (line.startsWith('elif ')) {
				idx = handleElif(parsedLines, vars, state, idx, endIdx, conditionMet);
				conditionMet = conditionMet || wasConditionMet(parsedLines, vars, line, conditionMet);
			} else if (line === 'else') {
				idx = handleElse(parsedLines, vars, state, idx, endIdx, conditionMet);
				break;
			} else { break; }
		}
		return idx;
	}

	function handleElif(parsedLines, vars, state, idx, endIdx, conditionMet) {
		var elifCond = extractElifCondition(parsedLines[idx].text);
		idx++;
		if (!conditionMet && evaluateCondition(elifCond, vars)) {
			return executeBodyUntilBranch(parsedLines, vars, state, idx, endIdx);
		}
		return skipBodyUntilBranch(parsedLines, idx, endIdx);
	}

	function wasConditionMet(parsedLines, vars, line, alreadyMet) {
		if (alreadyMet) return true;
		return evaluateCondition(extractElifCondition(line), vars);
	}

	function handleElse(parsedLines, vars, state, idx, endIdx, conditionMet) {
		idx++;
		if (!conditionMet) return executeBodyUntilBranch(parsedLines, vars, state, idx, endIdx);
		return skipBodyUntilBranch(parsedLines, idx, endIdx);
	}

	function executeBodyUntilBranch(parsedLines, vars, state, startIdx, endIdx) {
		var idx = startIdx;
		while (idx < endIdx) {
			var line = parsedLines[idx].text;
			if (line.startsWith('elif ') || line === 'else') return idx;
			if (line.startsWith('if ')) { idx = executeIfBlock(parsedLines, vars, state, idx, endIdx); continue; }
			if (line.startsWith('while ')) { idx = executeWhile(parsedLines, vars, state, idx, endIdx); continue; }
			if (line.startsWith('for ')) { idx = executeFor(parsedLines, vars, state, idx, endIdx); continue; }
			executeSingleStatement(line, vars, state);
			idx++;
		}
		return idx;
	}

	function skipBodyUntilBranch(parsedLines, startIdx, endIdx) {
		var idx = startIdx, depth = 0;
		while (idx < endIdx) {
			var line = parsedLines[idx].text;
			if (line.startsWith('if ') || line.startsWith('while ') || line.startsWith('for ')) { depth++; idx++; continue; }
			if ((line.startsWith('elif ') || line === 'else') && depth === 0) return idx;
			idx++;
		}
		return idx;
	}

	// ─── Find matching end ──────────────────────────────────────────────

	function findMatchingEnd(parsedLines, startIdx, endIdx) {
		var depth = 0;
		for (var i = startIdx; i < endIdx; i++) {
			var line = parsedLines[i].text;
			if (line.startsWith('if ') || line.startsWith('while ') || line.startsWith('for ')) depth++;
		}
		return endIdx;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// PARSE HELPERS
	// ═══════════════════════════════════════════════════════════════════════

	function parseShowTextArgs(line) {
		var afterCmd = line.substring('show_text '.length).trim();
		if (!afterCmd) return null;
		var styles = ['normal', 'winner', 'loser', 'draw'];
		var lastSpace = findLastUnquotedSpace(afterCmd);
		return extractStyleFromArgs(afterCmd, lastSpace, styles);
	}

	function findLastUnquotedSpace(str) {
		var inStr = false, strChar = '', lastSpace = -1;
		for (var i = 0; i < str.length; i++) {
			var ch = str[i];
			if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
			else if (inStr && ch === strChar) { inStr = false; }
			else if (!inStr && ch === ' ') { lastSpace = i; }
		}
		return lastSpace;
	}

	function extractStyleFromArgs(afterCmd, lastSpace, styles) {
		if (lastSpace === -1) return { message: afterCmd, style: 'normal' };
		var candidate = afterCmd.substring(lastSpace + 1);
		if (styles.indexOf(candidate) !== -1) return { message: afterCmd.substring(0, lastSpace).trim(), style: candidate };
		return { message: afterCmd, style: 'normal' };
	}

	function parsePrintArgument(line) {
		if (!line.startsWith('print')) return null;
		var afterKeyword = line.substring(5);
		if (afterKeyword.startsWith('(')) return extractParenContent(afterKeyword);
		if (afterKeyword.startsWith(' ') || afterKeyword.startsWith('\t')) return afterKeyword.trim();
		return null;
	}

	function extractParenContent(str) {
		var depth = 0, inStr = false, strChar = '';
		for (var i = 0; i < str.length; i++) {
			var ch = str[i];
			if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
			else if (inStr && ch === strChar) { inStr = false; }
			else if (!inStr && ch === '(') { depth++; }
			else if (!inStr && ch === ')') { depth--; if (depth === 0) return str.substring(1, i).trim(); }
		}
		return str.substring(1).trim();
	}

	// ═══════════════════════════════════════════════════════════════════════
	// BUILD DSL CONTEXT FROM DETECTIONS
	// ═══════════════════════════════════════════════════════════════════════

	function copyPersistentVars(vars) {
		for (var key in persistentVars) {
			if (persistentVars.hasOwnProperty(key)) vars[key] = persistentVars[key];
		}
	}

	function initDetectionVars(vars) {
		vars['detection_count'] = 0;
		var positions = ['leftmost', 'rightmost', 'topmost', 'bottommost', 'largest', 'smallest', 'highest_conf'];
		for (var i = 0; i < positions.length; i++) {
			vars[positions[i] + '_detection'] = 'none';
			vars[positions[i] + '_detection.probability'] = 0;
		}
	}

	function computeDetectionArea(d) {
		return (d.xMax - d.xMin) * (d.yMax - d.yMin);
	}

	function findExtremeDetections(detections) {
		var result = { leftmost: detections[0], rightmost: detections[0], topmost: detections[0], bottommost: detections[0], largest: detections[0], smallest: detections[0], highest_conf: detections[0] };
		for (var i = 1; i < detections.length; i++) {
			var d = detections[i];
			if (d.xMin < result.leftmost.xMin) result.leftmost = d;
			if (d.xMax > result.rightmost.xMax) result.rightmost = d;
			if (d.yMin < result.topmost.yMin) result.topmost = d;
			if (d.yMax > result.bottommost.yMax) result.bottommost = d;
			if (computeDetectionArea(d) > computeDetectionArea(result.largest)) result.largest = d;
			if (computeDetectionArea(d) < computeDetectionArea(result.smallest)) result.smallest = d;
			if (d.score > result.highest_conf.score) result.highest_conf = d;
		}
		return result;
	}

	function assignExtremeVars(vars, extremes) {
		var keys = ['leftmost', 'rightmost', 'topmost', 'bottommost', 'largest', 'smallest', 'highest_conf'];
		for (var i = 0; i < keys.length; i++) {
			vars[keys[i] + '_detection'] = extremes[keys[i]].label;
			vars[keys[i] + '_detection.probability'] = extremes[keys[i]].score;
		}
	}

	// Bestimmt ob eine Detection "links" oder "rechts" ist basierend auf
	// der Überlappung der Bounding Box mit der jeweiligen Bildhälfte
	function getDetectionSide(det) {
		var midX = 0.5; // Bildmitte (normalisiert 0-1)
		var boxCenterX = (det.xMin + det.xMax) / 2;

		// Berechne Überlappung mit linker Hälfte (0 bis 0.5)
		var overlapLeft = Math.max(0, Math.min(det.xMax, midX) - Math.max(det.xMin, 0));
		// Berechne Überlappung mit rechter Hälfte (0.5 bis 1)
		var overlapRight = Math.max(0, Math.min(det.xMax, 1) - Math.max(det.xMin, midX));

		// Boxbreite für Prozentberechnung
		var boxWidth = det.xMax - det.xMin;
		if (boxWidth <= 0) return 'none';

		var leftPercent = overlapLeft / boxWidth;
		var rightPercent = overlapRight / boxWidth;

		// Threshold: Mindestens 60% der Box muss auf einer Seite sein
		// um eindeutig zugeordnet zu werden
		if (leftPercent > rightPercent) return 'left';
		if (rightPercent > leftPercent) return 'right';
		return 'center'; // genau in der Mitte
	}

	function assignLeftRightDetections(vars, detections) {
		var leftDet = null;
		var rightDet = null;

		if (detections.length === 1) {
			// Nur eine Detection: Seite bestimmen über Überlappung
			var side = getDetectionSide(detections[0]);
			if (side === 'left') {
				leftDet = detections[0];
			} else if (side === 'right') {
				rightDet = detections[0];
			} else {
				// Genau in der Mitte - als "center" behandeln, keiner Seite zuordnen
				// oder alternativ: dem näheren zuordnen basierend auf centerX
				var cx = (detections[0].xMin + detections[0].xMax) / 2;
				if (cx < 0.5) leftDet = detections[0];
				else rightDet = detections[0];
			}
		} else if (detections.length >= 2) {
			// Zwei oder mehr Detections: die mit dem kleinsten xMin ist links,
			// die mit dem größten xMax ist rechts
			// Aber NUR wenn sie tatsächlich auf der jeweiligen Seite sind
			var sorted = detections.slice().sort(function(a, b) {
				return ((a.xMin + a.xMax) / 2) - ((b.xMin + b.xMax) / 2);
			});
			leftDet = sorted[0];
			rightDet = sorted[sorted.length - 1];

			// Sicherheitscheck: Wenn beide auf derselben Seite sind
			if (leftDet === rightDet) {
				rightDet = null;
			}
		}

		vars['leftmost_detection'] = leftDet ? leftDet.label : 'none';
		vars['leftmost_detection.probability'] = leftDet ? leftDet.score : 0;
		vars['rightmost_detection'] = rightDet ? rightDet.label : 'none';
		vars['rightmost_detection.probability'] = rightDet ? rightDet.score : 0;
	}

	function buildDSLContext(detections) {
		var vars = {};
		copyPersistentVars(vars);
		initDetectionVars(vars);
		if (!detections || detections.length === 0) return vars;
		vars['detection_count'] = detections.length;

		// Neue links/rechts Logik
		assignLeftRightDetections(vars, detections);

		// Restliche Extreme (top, bottom, largest, etc.) normal berechnen
		var extremes = findExtremeDetections(detections);
		vars['topmost_detection'] = extremes.topmost.label;
		vars['topmost_detection.probability'] = extremes.topmost.score;
		vars['bottommost_detection'] = extremes.bottommost.label;
		vars['bottommost_detection.probability'] = extremes.bottommost.score;
		vars['largest_detection'] = extremes.largest.label;
		vars['largest_detection.probability'] = extremes.largest.score;
		vars['smallest_detection'] = extremes.smallest.label;
		vars['smallest_detection.probability'] = extremes.smallest.score;
		vars['highest_conf_detection'] = extremes.highest_conf.label;
		vars['highest_conf_detection.probability'] = extremes.highest_conf.score;

		return vars;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// GAME LOOP
	// ═══════════════════════════════════════════════════════════════════════

	function getTargetDelay() {
		var fps = parseInt(document.getElementById('game_fps').value) || 3;
		return Math.round(1000 / fps);
	}

	function getEditorCode() {
		return editor ? (editor.value || '') : '';
	}

	function updateCachedParsed() {
		var code = getEditorCode();
		if (code !== lastCode || cachedParsed === null) {
			cachedParsed = parseScript(code);
			lastCode = code;
		}
	}

	function getBuiltinKeys() {
		return [
			'detection_count',
			'leftmost_detection', 'rightmost_detection',
			'topmost_detection', 'bottommost_detection',
			'largest_detection', 'smallest_detection',
			'highest_conf_detection',
			'leftmost_detection.probability', 'rightmost_detection.probability',
			'topmost_detection.probability', 'bottommost_detection.probability',
			'largest_detection.probability', 'smallest_detection.probability',
			'highest_conf_detection.probability'
		];
	}

	function persistUserVars(vars) {
		var builtinKeys = getBuiltinKeys();
		for (var key in vars) {
			if (vars.hasOwnProperty(key) && builtinKeys.indexOf(key) === -1) persistentVars[key] = vars[key];
		}
	}

	var lastOutputHash = '';

	function handleScriptResults(results) {
		if (results.output && results.output.length > 0) {
			// Nur ausgeben wenn sich etwas geändert hat
			var newHash = results.output.join('|');
			if (newHash !== lastOutputHash) {
				lastOutputHash = newHash;
				for (var i = 0; i < results.output.length; i++) appendOutput(results.output[i]);
			}
		}
		if (results.showTextCommands && results.showTextCommands.length > 0) {
			var lastCmd = results.showTextCommands[results.showTextCommands.length - 1];
			showTextOnVideo(lastCmd.message, lastCmd.style);
		} else { clearTextOverlay(); }
	}

	async function gameStep() {
		if (!gameRunning || gameStepRunning) return;
		gameStepRunning = true;

		var detections = await safeRunDetection();

		return new Promise(function(resolve) {
			requestAnimationFrame(function() {
				drawGameDetections(detections);
				updateCachedParsed();
				var vars = buildDSLContext(detections);
				try {
					var results = interpretScript(cachedParsed, vars);
					persistUserVars(vars);
					handleScriptResults(results);
				} catch (e) {
					appendOutput("FEHLER: " + (e.message || "Unbekannter Fehler"));
					clearTextOverlay();
				}
				setStatus('Läuft | Erkennungen: ' + detections.length);
				gameStepRunning = false;
				resolve();
			});
		});
	}

	async function safeRunDetection() {
		if (!gameModel || !webcamStream || video.readyState < 2) return [];
		try { return await runDetection(); }
		catch (e) { return []; }
	}

	// ═══════════════════════════════════════════════════════════════════════
	// AUTO-START & EVENT BINDINGS
	// ═══════════════════════════════════════════════════════════════════════

	function resetGameState() {
		document.getElementById('game_editor_page').classList.remove('game-running');
		gameRunning = false;
		if (gameInterval) { clearTimeout(gameInterval); gameInterval = null; }
		gameStepRunning = false;
		persistentVars = {};
		cachedParsed = null;
		lastCode = '';
	}

	function handleNoModel() {
		stopGameWebcam();
		if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
		clearTextOverlay();
		setStatus('Wähle ein Modell zum Starten');
	}

	async function startGameLoop() {
		document.getElementById('game_editor_page').classList.add('game-running');
		gameRunning = true;
		var fps = parseInt(document.getElementById('game_fps').value) || 3;
		setStatus('Spiel läuft mit ' + fps + ' Auswertungen/Sek');
		appendOutput("🎮 Spiel läuft!");
		scheduleNextStep();

		var workspace = document.getElementById('block_workspace');
		if (workspace) {
			workspace.style.display = 'block';
			workspace.style.visibility = 'visible';
			workspace.style.opacity = '1';
		}
	}

	async function scheduleNextStep() {
		if (!gameRunning) return;
		var start = performance.now();
		await gameStep();
		var elapsed = performance.now() - start;
		var wait = Math.max(0, getTargetDelay() - elapsed);
		if (gameRunning) gameInterval = setTimeout(scheduleNextStep, wait);
	}

	async function autoStart(modelUuid) {
		resetGameState();
		if (modelUuid === 'none') { handleNoModel(); return; }

		// Show fullscreen loading overlay
		showLoadingOverlay('🤖 KI wird geladen...');
		updateLoadingMessage('Kamera wird gestartet...');

		setStatus('Kamera wird gestartet...');
		if (!await startGameWebcam()) {
			hideLoadingOverlay();
			setStatus('Kamera-Fehler');
			return;
		}

		updateLoadingMessage('Modell wird vorbereitet... Das kann einen Moment dauern!');
		setStatus('Modell wird geladen...');
		if (!await loadGameModel(modelUuid)) {
			hideLoadingOverlay();
			setStatus('Modell-Fehler');
			return;
		}

		// Hide overlay and start game
		hideLoadingOverlay();
		startGameLoop();
	}

	// ─── Model select change ────────────────────────────────────────────

	function bindModelSelect() {
		var modelSelect = document.getElementById('game_model_select');
		if (modelSelect) modelSelect.addEventListener('change', function () { autoStart(this.value); });
	}
	bindModelSelect();

	// ─── Camera change ──────────────────────────────────────────────────

	function bindCameraSelect() {
		var cameraSelect = document.getElementById('game_camera_select');
		if (!cameraSelect) return;
		cameraSelect.addEventListener('change', function () {
			var modelUuid = document.getElementById('game_model_select').value;
			if (modelUuid === 'none') return;
			resetGameState();
			if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
			stopGameWebcam();
			autoStart(modelUuid);
		});
	}
	bindCameraSelect();

	// ─── FPS hot-swap ───────────────────────────────────────────────────

	function bindFpsInput() {
		var fpsInput = document.getElementById('game_fps');
		if (!fpsInput) return;
		fpsInput.addEventListener('input', function () {
			if (!gameRunning) return;
			var fps = Math.max(1, Math.min(10, parseInt(this.value) || 3));
			setStatus('Spiel läuft mit ' + fps + ' Auswertungen/Sek');
		});
	}
	bindFpsInput();

	// ─── Button bindings ────────────────────────────────────────────────

	function bindClearOutput() {
		var btn = document.getElementById('btn_clear_output');
		if (btn) btn.addEventListener('click', clearOutput);
	}
	bindClearOutput();

	function bindShowCode() {
		var btn = document.getElementById('btn_show_code');
		if (!btn) return;
		btn.addEventListener('click', function () {
			var code = editor.value || '(kein Programm)';
			var previewContent = document.getElementById('code_preview_content');
			var modal = document.getElementById('code_preview_modal');
			if (previewContent) previewContent.textContent = code;
			if (modal) modal.classList.add('visible');
		});
	}
	bindShowCode();

	// ═══════════════════════════════════════════════════════════════════════
	// EXAMPLE GALLERY
	// ═══════════════════════════════════════════════════════════════════════

	function getLabelsForExamples() {
		return {
			l1: (gameLabels && gameLabels.length >= 1) ? gameLabels[0] : 'ObjektA',
			l2: (gameLabels && gameLabels.length >= 2) ? gameLabels[1] : 'ObjektB',
			l3: (gameLabels && gameLabels.length >= 3) ? gameLabels[2] : 'ObjektC'
		};
	}

	function buildRPSExample(l) {
		return '# ╔═ SCHERE STEIN PAPIER ═╗\n' +
			'# Regeln: Schere schneidet Papier,\n' +
			'# Papier wickelt Stein ein,\n' +
			'# Stein macht Schere kaputt.\n' +
			'spieler1 = leftmost_detection\n' +
			'spieler2 = rightmost_detection\n' +
			'if detection_count != 2\n' +
			'  show_text Zeigt beide eure Hände! ✊✌️✋ normal\n' +
			'elif spieler1 == "none" or spieler2 == "none"\n' +
			'  show_text Zeigt beide eure Hände! ✊✌️✋ normal\n' +
			'elif spieler1 == spieler2\n' +
			'  show_text UNENTSCHIEDEN! 🤝 Beide: $spieler1 draw\n' +
			'elif spieler1 == "' + l.l1 + '" and spieler2 == "' + l.l3 + '"\n' +
			'  show_text 👈 SPIELER 1 GEWINNT! 🎉 $spieler1 schlägt $spieler2 winner\n' +
			'elif spieler1 == "' + l.l3 + '" and spieler2 == "' + l.l2 + '"\n' +
			'  show_text 👈 SPIELER 1 GEWINNT! 🎉 $spieler1 schlägt $spieler2 winner\n' +
			'elif spieler1 == "' + l.l2 + '" and spieler2 == "' + l.l1 + '"\n' +
			'  show_text 👈 SPIELER 1 GEWINNT! 🎉 $spieler1 schlägt $spieler2 winner\n' +
			'else\n' +
			'  show_text 👉 SPIELER 2 GEWINNT! 💪 $spieler2 schlägt $spieler1 loser\n';
	}

	function buildCounterExample() {
		return '# ═══ REKORD-JÄGER ═══\n' +
			'aktuell = detection_count\n' +
			'if aktuell > rekord\n' +
			'  rekord = aktuell\n' +
			'if aktuell > 0\n' +
			'  gesamt += aktuell\n' +
			'if aktuell == 0\n' +
			'  show_text 🔍 Zeige Objekte! Rekord: $rekord normal\n' +
			'elif aktuell == rekord\n' +
			'  show_text 🏆 NEUER REKORD! $rekord Objekte! winner\n' +
			'else\n' +
			'  show_text 👀 Erkannt: $aktuell | Rekord: $rekord normal\n';
	}

	function buildExampleMeta(l) {
		return [
			{ id: 'rps', name: '✊✌️✋ Schere Stein Papier', icon: '✊', difficulty: '⭐', description: 'Spiele gegen einen Freund! Haltet beide eure Hände in die Kamera.', preview: '👈 Spieler 1 | Spieler 2 👉', color: '#4fc3f7', code: buildRPSExample(l) },
			{ id: 'counter', name: '📊 Rekord-Jäger', icon: '🏆', difficulty: '⭐', description: 'Wie viele Objekte kannst du gleichzeitig zeigen? Jage den Rekord!', preview: '🏆 Zeige so viele Objekte wie möglich!', color: '#ffb74d', code: buildCounterExample() },
		];
	}

	function getExamplePrograms() {
		return buildExampleMeta(getLabelsForExamples());
	}

	// ─── Galerie rendern ────────────────────────────────────────────────

	function buildCardHTML(ex) {
		return '<div class="example-card-icon" style="background:' + ex.color + '22; color:' + ex.color + '">' +
			'<span class="example-big-icon">' + ex.icon + '</span>' +
			'</div>' +
			'<div class="example-card-body">' +
			'<h3>' + ex.name + '</h3>' +
			'<div class="example-difficulty">' + ex.difficulty + '</div>' +
			'<p>' + ex.description + '</p>' +
			'<div class="example-preview">' + ex.preview + '</div>' +
			'</div>';
	}

	function createExampleCard(ex) {
		var card = document.createElement('div');
		card.className = 'example-card';
		card.style.borderColor = ex.color;
		card.innerHTML = buildCardHTML(ex);
		card.addEventListener('click', function () { loadExample(ex); });
		return card;
	}

	function loadExample(ex) {
		if (typeof window.loadCodeToBlocks === 'function') {
			window.loadCodeToBlocks(ex.code);
		} else {
			editor.value = ex.code;
		}
		persistentVars = {};
		clearOutput();
		appendOutput("🎮 " + ex.name + " geladen!");
		appendOutput("   " + ex.description);
		closeGalleryModal();
		showConfetti();
	}

	function closeGalleryModal() {
		var modal = document.getElementById('example_gallery_modal');
		if (modal) {
			modal.classList.remove('visible');
			// Belt-and-suspenders: guarantee it cannot capture events
			modal.style.pointerEvents = 'none';
		}
	}

	function renderExampleGallery() {
		var container = document.getElementById('example_cards_container');
		if (!container) return;
		container.innerHTML = '';
		var examples = getExamplePrograms();
		for (var i = 0; i < examples.length; i++) container.appendChild(createExampleCard(examples[i]));
	}

	// ─── Confetti-Effekt beim Laden ─────────────────────────────────────

	function getRandomEmoji() {
		var emojis = ['🎉', '⭐', '🎮', '🚀', '✨', '💫'];
		return emojis[Math.floor(Math.random() * emojis.length)];
	}

	function createConfettiParticle() {
		var particle = document.createElement('div');
		particle.className = 'confetti-particle';
		particle.textContent = getRandomEmoji();
		particle.style.left = (Math.random() * 100) + '%';
		particle.style.animationDuration = (1 + Math.random() * 2) + 's';
		return particle;
	}

	function spawnConfettiParticle(delay) {
		setTimeout(function () {
			var particle = createConfettiParticle();
			document.getElementById('game_editor_page').appendChild(particle);
			setTimeout(function () { particle.remove(); }, 3000);
		}, delay * 80);
	}

	function showConfetti() {
		for (var i = 0; i < 12; i++) spawnConfettiParticle(i);
	}

	// ─── Button-Binding für Galerie ─────────────────────────────────────

	function openGallery() {
		renderExampleGallery();
		var modal = document.getElementById('example_gallery_modal');
		if (modal) {
			modal.style.pointerEvents = '';   // clear any inline override so CSS class takes over
			modal.style.zIndex = '';          // let CSS handle it
			modal.classList.add('visible');
		}
	}

	function bindGalleryButtons() {
		var btnShowExamples = document.getElementById('btn_show_examples');
		if (btnShowExamples) btnShowExamples.addEventListener('click', openGallery);
		var btnLoadExample = document.getElementById('btn_load_example');
		if (btnLoadExample) btnLoadExample.addEventListener('click', openGallery);
		// FIX #10: Also bind the small button in editor panel
		var btnSmall = document.getElementById('btn_show_examples_small');
		if (btnSmall) btnSmall.addEventListener('click', openGallery);
	}
	bindGalleryButtons();

	// ─── Cleanup on unload ──────────────────────────────────────────────

	function cleanup() {
		gameRunning = false;
		if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
		if (gameInterval) { clearTimeout(gameInterval); gameInterval = null; }
		stopGameWebcam();
		if (gameModel) try { gameModel.dispose(); } catch (e) { }
	}

	window.addEventListener('beforeunload', cleanup);
	window.openGallery = openGallery;

})();

			// ─── Confetti-Effekt beim Laden ─────────────────────────────────────

			function showConfetti() {
				if (typeof window.celebrate === 'function') {
					window.celebrate('confetti');
				}
			}

			// ─── Loading Overlay Helpers ────────────────────────────────────────

			function showLoadingOverlay(message) {
				var overlay = document.getElementById('loading_overlay');
				if (!overlay) return;
				var title = overlay.querySelector('.loading-title');
				if (title && message) title.textContent = message;
				overlay.classList.remove('hidden');
			}

			function updateLoadingMessage(message) {
				var overlay = document.getElementById('loading_overlay');
				if (!overlay) return;
				var subtitle = overlay.querySelector('.loading-subtitle');
				if (subtitle) subtitle.textContent = message;
			}

			function hideLoadingOverlay() {
				var overlay = document.getElementById('loading_overlay');
				if (!overlay) return;
				overlay.classList.add('hidden');
			}
