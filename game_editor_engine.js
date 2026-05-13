// ═══════════════════════════════════════════════════════════════════════════
// GAME ENGINE v2 — Turing-complete, performant, non-blocking
// ═══════════════════════════════════════════════════════════════════════════

(function() {
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

    // Persistent user variables (survive across frames)
    var persistentVars = {};

    var video = document.getElementById('game_video');
    var overlayCanvas = document.getElementById('game_overlay_canvas');
    var overlayCtx = overlayCanvas ? overlayCanvas.getContext('2d') : null;
    var textOverlay = document.getElementById('game_text_overlay');
    var editor = document.getElementById('dsl_editor');
    var outputDiv = document.getElementById('game_output');
    var statusDiv = document.getElementById('game_status');
    var camPlaceholder = document.getElementById('cam_placeholder');

    // ─── Output helpers ─────────────────────────────────────────────────
    var outputBuffer = [];
    var maxOutputLines = 200;

    function appendOutput(text) {
        var timestamp = new Date().toLocaleTimeString();
        outputBuffer.push('[' + timestamp + '] ' + text);
        if (outputBuffer.length > maxOutputLines) {
            outputBuffer = outputBuffer.slice(-maxOutputLines);
        }
        outputDiv.textContent = outputBuffer.join('\n');
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }

    function clearOutput() {
        outputBuffer = [];
        outputDiv.textContent = '';
    }

    function setStatus(text) {
        statusDiv.textContent = 'Status: ' + text;
    }

    // ─── Text overlay on video ──────────────────────────────────────────
    function showTextOnVideo(message, style) {
        if (!textOverlay) return;
        textOverlay.textContent = message;
        textOverlay.className = 'text-overlay-visible';
        if (style && style !== 'normal') {
            textOverlay.classList.add('style-' + style);
        }
    }

    function clearTextOverlay() {
        if (textOverlay) {
            textOverlay.textContent = '';
            textOverlay.className = '';
        }
    }

    // ─── Camera ─────────────────────────────────────────────────────────
    async function enumerateGameCameras() {
        var select = document.getElementById('game_camera_select');
        try {
            var tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            if (tempStream) tempStream.getTracks().forEach(function(t) { t.stop(); });
        } catch (e) {
            select.innerHTML = '<option value="">Kein Kamerazugriff</option>';
            return;
        }
        try {
            var devices = await navigator.mediaDevices.enumerateDevices();
            var videoDevices = devices.filter(function(d) { return d.kind === 'videoinput'; });
            select.innerHTML = '';
            videoDevices.forEach(function(device, idx) {
                var option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || ('Kamera ' + (idx + 1));
                select.appendChild(option);
            });
        } catch (e) {
            select.innerHTML = '<option value="">Kamera-Fehler</option>';
        }
    }
    enumerateGameCameras();

    async function startGameWebcam() {
        if (webcamStream) return true;
        var deviceId = document.getElementById('game_camera_select').value;
        var constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };
        try {
            webcamStream = await navigator.mediaDevices.getUserMedia(constraints);
            video.srcObject = webcamStream;
            await new Promise(function(resolve) {
                video.onloadedmetadata = resolve;
                setTimeout(resolve, 3000);
            });
            await new Promise(function(resolve) {
                if (video.readyState >= 2) return resolve();
                video.oncanplay = resolve;
                setTimeout(resolve, 2000);
            });
            syncOverlaySize();
            if (camPlaceholder) camPlaceholder.style.display = 'none';
            video.style.display = 'block';
            return true;
        } catch (e) {
            webcamStream = null;
            video.srcObject = null;
            appendOutput("FEHLER: Kamera - " + (e.message || "Unbekannt"));
            return false;
        }
    }

    function syncOverlaySize() {
        if (!overlayCanvas || !video) return;
        var vw = video.videoWidth, vh = video.videoHeight;
        if (vw > 0 && vh > 0) {
            overlayCanvas.width = vw;
            overlayCanvas.height = vh;
        }
        overlayCanvas.style.width = video.clientWidth + 'px';
        overlayCanvas.style.height = video.clientHeight + 'px';
    }

    function stopGameWebcam() {
        if (webcamStream) {
            try { webcamStream.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {}
            webcamStream = null;
        }
        video.srcObject = null;
        video.style.display = 'none';
        if (camPlaceholder) camPlaceholder.style.display = 'flex';
    }

    // ─── Model loading ──────────────────────────────────────────────────
    async function loadGameModel(modelUuid) {
        if (gameModel && currentModelUuid === modelUuid) return true;
        if (isLoadingModel) return false;
        isLoadingModel = true;
        setStatus('Modell wird geladen...');

        try {
            var resp = await fetch('labels.php?model_uuid=' + encodeURIComponent(modelUuid));
            if (resp.ok) gameLabels = await resp.json();
            else gameLabels = [];
        } catch (e) { gameLabels = []; }

        showModelLabels(gameLabels);

        try {
            if (typeof tf === 'undefined') throw new Error("TensorFlow.js nicht geladen");
            await tf.ready();
            if (gameModel) try { gameModel.dispose(); } catch (e) {}
            gameModel = await tf.loadGraphModel(
                "get_model_file.php?&uuid=" + encodeURIComponent(modelUuid) + "&filename=model.json"
            );
            currentModelUuid = modelUuid;
            isLoadingModel = false;
            setStatus('Modell geladen ✓');
            appendOutput("✅ Modell geladen. Kategorien: [" + gameLabels.join(", ") + "]");
            // Update block editor labels
            if (typeof window.updateBlockEditorLabels === 'function') {
                window.updateBlockEditorLabels(gameLabels);
            }
            return true;
        } catch (e) {
            gameModel = null;
            currentModelUuid = null;
            isLoadingModel = false;
            appendOutput("FEHLER: Modell - " + (e.message || "Unbekannt"));
            setStatus('Modell-Fehler');
            return false;
        }
    }

    function showModelLabels(labels) {
        var container = document.getElementById('model_labels_chips');
        var wrapper = document.getElementById('model_labels_info');
        if (!container || !wrapper) return;
        if (!labels || labels.length === 0) { wrapper.style.display = 'none'; return; }
        wrapper.style.display = 'inline-flex';
        container.innerHTML = '';
        var colors = ['#4fc3f7', '#ffb74d', '#ba68c8', '#66bb6a', '#e57373', '#ff8a65'];
        labels.forEach(function(label, idx) {
            var chip = document.createElement('span');
            chip.className = 'label-chip';
            chip.style.background = colors[idx % colors.length];
            chip.textContent = label;
            container.appendChild(chip);
        });
    }

    // ─── Detection (same as before, abbreviated) ────────────────────────
    function getModelInputShape() {
        try {
            if (gameModel.inputs && gameModel.inputs[0] && gameModel.inputs[0].shape)
                return gameModel.inputs[0].shape.slice(1, 3);
        } catch (e) {}
        return [640, 640];
    }

    function getGameConfThreshold() {
        return parseFloat(document.getElementById('game_conf_slider').value) || 0.3;
    }

    function computeIoU(a, b) {
        var x1 = Math.max(a.xMin, b.xMin), y1 = Math.max(a.yMin, b.yMin);
        var x2 = Math.min(a.xMax, b.xMax), y2 = Math.min(a.yMax, b.yMax);
        var inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
        var areaA = (a.xMax - a.xMin) * (a.yMax - a.yMin);
        var areaB = (b.xMax - b.xMin) * (b.yMax - b.yMin);
        var union = areaA + areaB - inter;
        return union <= 0 ? 0 : inter / union;
    }

    function simpleNMS(detections, iouThresh) {
        if (!detections || detections.length === 0) return [];
        detections.sort(function(a, b) { return b.score - a.score; });
        var kept = [];
        for (var i = 0; i < detections.length; i++) {
            var dominated = false;
            for (var j = 0; j < kept.length; j++) {
                if (computeIoU(detections[i], kept[j]) > iouThresh) { dominated = true; break; }
            }
            if (!dominated) kept.push(detections[i]);
        }
        return kept;
    }

	async function runDetection() {
		if (!gameModel || !webcamStream || video.readyState < 2) return [];
		var shape = getModelInputShape();
		var confThreshold = getGameConfThreshold();
		var inputTensor = null, output = null;

		var numTensorsBefore = tf.memory().numTensors;

		try {
			inputTensor = tf.tidy(function() {
				return tf.browser.fromPixels(video)
					.resizeBilinear([shape[0], shape[1]])
					.div(255)
					.expandDims();
			});
		} catch (e) {
			if (inputTensor) try { inputTensor.dispose(); } catch (x) {}
			return [];
		}

		try {
			output = gameModel.execute(inputTensor);
		} catch (e) {
			if (inputTensor) try { inputTensor.dispose(); } catch (x) {}
			return [];
		}

		// Dispose input immediately — no longer needed
		if (inputTensor) try { inputTensor.dispose(); } catch (x) {}

		var res;
		try {
			if (output instanceof tf.Tensor) {
				res = output.arraySync();
				output.dispose();
			} else if (Array.isArray(output)) {
				res = output[0].arraySync();
				output.forEach(function(t) { try { t.dispose(); } catch (x) {} });
			} else {
				res = output;
			}
		} catch (e) {
			// Ensure output tensors are disposed on error
			if (output instanceof tf.Tensor) {
				try { output.dispose(); } catch (x) {}
			} else if (Array.isArray(output)) {
				output.forEach(function(t) { try { t.dispose(); } catch (x) {} });
			}
			return [];
		}

		var detections;
		try {
			detections = processOutput(res, shape[1], shape[0], confThreshold);
		} catch (e) {
			detections = [];
		}

		// Safety net: if tensors leaked, log a warning (dev mode)
		var numTensorsAfter = tf.memory().numTensors;
		if (numTensorsAfter > numTensorsBefore + 2) {
			console.warn('[TF Leak] Tensors before: ' + numTensorsBefore + ', after: ' + numTensorsAfter + ' (leaked ' + (numTensorsAfter - numTensorsBefore) + ')');
		}

		return detections;
	}

	function processOutput(res, modelWidth, modelHeight, confThreshold) {
		if (!res || !Array.isArray(res) || !Array.isArray(res[0]) || !Array.isArray(res[0][0])) return [];

		var tensorsToDispose = [];

		try {
			var rawTensor = tf.tensor3d(res);
			tensorsToDispose.push(rawTensor);

			var s = rawTensor.shape;
			var FEATURES = s[1], CANDIDATES = s[2];

			if (FEATURES > CANDIDATES) {
				var transposed = rawTensor.transpose([0, 2, 1]);
				tensorsToDispose.push(transposed);
				rawTensor = transposed;
				FEATURES = s[2]; CANDIDATES = s[1];
			}

			var numClasses = FEATURES - 4;
			if (numClasses <= 0) {
				tensorsToDispose.forEach(function(t) { try { t.dispose(); } catch (x) {} });
				return [];
			}

			var predTensor = rawTensor.transpose([0, 2, 1]);
			tensorsToDispose.push(predTensor);

			var splits = tf.split(predTensor, [4, numClasses], 2);
			tensorsToDispose.push(splits[0]);
			tensorsToDispose.push(splits[1]);

			var squeezedBoxes = splits[0].squeeze();
			tensorsToDispose.push(squeezedBoxes);

			var squeezedScores = splits[1].squeeze();
			tensorsToDispose.push(squeezedScores);

			var boxesArr = squeezedBoxes.arraySync();
			var scoresArr = squeezedScores.arraySync();

			// Dispose ALL tensors now that we have the JS arrays
			tensorsToDispose.forEach(function(t) {
				if (t && !t.isDisposed) {
					try { t.dispose(); } catch (x) {}
				}
			});
			tensorsToDispose = [];

			var detections = [];
			for (var i = 0; i < boxesArr.length; i++) {
				var classScores = numClasses === 1 ? [scoresArr[i]] : scoresArr[i];
				var bestScore = 0, bestClass = -1;
				if (Array.isArray(classScores)) {
					for (var c = 0; c < classScores.length; c++) {
						if (classScores[c] > bestScore) { bestScore = classScores[c]; bestClass = c; }
					}
				} else { bestScore = classScores; bestClass = 0; }
				if (bestScore < confThreshold) continue;

				var cx = boxesArr[i][0], cy = boxesArr[i][1], w = boxesArr[i][2], h = boxesArr[i][3];
				var isPixel = cx > 2.0 || cy > 2.0;
				var xMin, yMin, xMax, yMax;
				if (isPixel) {
					xMin = (cx - w / 2) / modelWidth; yMin = (cy - h / 2) / modelHeight;
					xMax = (cx + w / 2) / modelWidth; yMax = (cy + h / 2) / modelHeight;
				} else {
					xMin = cx - w / 2; yMin = cy - h / 2; xMax = cx + w / 2; yMax = cy + h / 2;
				}
				xMin = Math.max(0, xMin); yMin = Math.max(0, yMin);
				xMax = Math.min(1, xMax); yMax = Math.min(1, yMax);

				var label = (gameLabels && gameLabels[bestClass]) ? gameLabels[bestClass] : ('class_' + bestClass);
				detections.push({ xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax, score: bestScore, label: label });
			}
			return simpleNMS(detections, 0.5);

		} catch (e) {
			// Dispose anything we tracked on error
			tensorsToDispose.forEach(function(t) {
				if (t && !t.isDisposed) {
					try { t.dispose(); } catch (x) {}
				}
			});
			return [];
		}
	}

    // ─── Draw detections ────────────────────────────────────────────────
    function drawGameDetections(detections) {
        if (!overlayCtx || !overlayCanvas) return;
        syncOverlaySize();
        var w = overlayCanvas.width, h = overlayCanvas.height;
        overlayCtx.clearRect(0, 0, w, h);
        if (!detections || detections.length === 0) return;

        var colors = ['#00ff88', '#ff6b9d', '#4fc3f7', '#ffb74d', '#ba68c8', '#e57373'];
        for (var i = 0; i < detections.length; i++) {
            var det = detections[i];
            var x = det.xMin * w, y = det.yMin * h;
            var bw = (det.xMax - det.xMin) * w;
            var bh = (det.yMax - det.yMin) * h;
            var color = colors[i % colors.length];

            overlayCtx.strokeStyle = color;
            overlayCtx.lineWidth = 3;
            overlayCtx.strokeRect(x, y, bw, bh);

            var text = det.label + ' ' + (det.score * 100).toFixed(0) + '%';
            overlayCtx.font = 'bold 14px sans-serif';
            var tw = overlayCtx.measureText(text).width;
            overlayCtx.fillStyle = color;
            overlayCtx.fillRect(x, y - 22, tw + 10, 22);
            overlayCtx.fillStyle = '#000';
            overlayCtx.fillText(text, x + 5, y - 6);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TURING-COMPLETE DSL INTERPRETER
    // Supports: variables, arithmetic, while loops, if/elif/else, 
    //           string concat, comparisons, and/or/not, print, show_text
    // ═══════════════════════════════════════════════════════════════════════

    var MAX_ITERATIONS = 10000; // prevent infinite loops

    function tokenizeLine(line) {
        var commentIdx = -1;
        var inStr = false, strChar = '';
        for (var i = 0; i < line.length; i++) {
            if (!inStr && (line[i] === '"' || line[i] === "'")) { inStr = true; strChar = line[i]; }
            else if (inStr && line[i] === strChar) { inStr = false; }
            else if (!inStr && line[i] === '#') { commentIdx = i; break; }
        }
        if (commentIdx !== -1) line = line.substring(0, commentIdx);
        return line.trim();
    }

    function parseScript(code) {
        var lines = code.split('\n');
        var parsed = [];
        for (var i = 0; i < lines.length; i++) {
            var trimmed = tokenizeLine(lines[i]);
            if (trimmed === '') continue;
            parsed.push({ lineNum: i + 1, text: trimmed });
        }
        return parsed;
    }

    // ─── Expression evaluator with arithmetic ───────────────────────────
	function evaluateExpression(expr, vars) {
		expr = expr.trim();
		if (expr === '') return '';

		// Number literal (check early, no ambiguity)
		if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);

		// Parenthesized expression
		if (expr.startsWith('(') && findMatchingParen(expr, 0) === expr.length - 1) {
			return evaluateExpression(expr.substring(1, expr.length - 1), vars);
		}

		// String concatenation / Addition — check BEFORE string literal!
		var plusMinusResult = splitArithmetic(expr, ['+', '-']);
		if (plusMinusResult) {
			var left = evaluateExpression(plusMinusResult.left, vars);
			var right = evaluateExpression(plusMinusResult.right, vars);
			if (plusMinusResult.op === '+') {
				if (typeof left === 'string' || typeof right === 'string') {
					return String(left) + String(right);
				}
				return (parseFloat(left) || 0) + (parseFloat(right) || 0);
			} else {
				return (parseFloat(left) || 0) - (parseFloat(right) || 0);
			}
		}

		// Multiplication / Division / Modulo
		var mulDivResult = splitArithmetic(expr, ['*', '/', '%']);
		if (mulDivResult) {
			var left = evaluateExpression(mulDivResult.left, vars);
			var right = evaluateExpression(mulDivResult.right, vars);
			var l = parseFloat(left) || 0;
			var r = parseFloat(right) || 0;
			if (mulDivResult.op === '*') return l * r;
			if (mulDivResult.op === '/') return r !== 0 ? l / r : 0;
			if (mulDivResult.op === '%') return r !== 0 ? l % r : 0;
		}

		// String literal (only AFTER we've confirmed no + operator outside strings)
		if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) {
			return expr.substring(1, expr.length - 1);
		}

		// Variable lookup
		if (vars.hasOwnProperty(expr)) return vars[expr];

		// ═══ FIX: Check if it LOOKS like a variable name ═══
		// If it matches a valid identifier pattern but isn't in vars,
		// return 0 instead of the variable name as string.
		// This prevents "rekord" showing up as text instead of 0.
		if (/^[a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*$/.test(expr)) {
			return 0;
		}

		// Unknown → return as string
		return expr;
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

    function splitArithmetic(expr, ops) {
        // Find the LAST occurrence of op (for left-to-right evaluation)
        // that is not inside a string or parentheses
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
                        // For '-', skip if it's a unary minus (at start or after operator)
                        if (ch === '-' && (i === 0 || /[+\-*/%=(]/.test(expr[i-1]))) continue;
                        lastOpIdx = i;
                        lastOp = ops[o];
                    }
                }
            }
        }

        if (lastOpIdx <= 0 || lastOpIdx >= expr.length - 1) return null;
        return {
            left: expr.substring(0, lastOpIdx).trim(),
            op: lastOp,
            right: expr.substring(lastOpIdx + 1).trim()
        };
    }

	// ─── Condition evaluator ────────────────────────────────────────────
	function evaluateCondition(condStr, vars) {
		condStr = condStr.trim();

		// ═══ Deutsche Operatoren in Symbole umwandeln ═══
		condStr = condStr.replace(/\bist größer oder gleich\b/g, '>=');
		condStr = condStr.replace(/\bist kleiner oder gleich\b/g, '<=');
		condStr = condStr.replace(/\bist größer als\b/g, '>');
		condStr = condStr.replace(/\bist kleiner als\b/g, '<');
		condStr = condStr.replace(/\bist gleich\b/g, '==');
		condStr = condStr.replace(/\bist nicht\b/g, '!=');

		// AND
		var andParts = splitLogical(condStr, ' and ');
		if (andParts.length > 1) {
			for (var i = 0; i < andParts.length; i++) {
				if (!evaluateCondition(andParts[i], vars)) return false;
			}
			return true;
		}

		// OR
		var orParts = splitLogical(condStr, ' or ');
		if (orParts.length > 1) {
			for (var i = 0; i < orParts.length; i++) {
				if (evaluateCondition(orParts[i], vars)) return true;
			}
			return false;
		}

		// NOT
		if (condStr.startsWith('not ')) {
			return !evaluateCondition(condStr.substring(4), vars);
		}

		// Comparison operators
		var operators = ['==', '!=', '>=', '<=', '>', '<'];
		for (var i = 0; i < operators.length; i++) {
			var op = operators[i];
			var opIdx = findOperatorIndex(condStr, op);
			if (opIdx !== -1) {
				var leftVal = evaluateExpression(condStr.substring(0, opIdx).trim(), vars);
				var rightVal = evaluateExpression(condStr.substring(opIdx + op.length).trim(), vars);
				switch (op) {
					case '==': return leftVal == rightVal;
					case '!=': return leftVal != rightVal;
					case '>=': return parseFloat(leftVal) >= parseFloat(rightVal);
					case '<=': return parseFloat(leftVal) <= parseFloat(rightVal);
					case '>':  return parseFloat(leftVal) > parseFloat(rightVal);
					case '<':  return parseFloat(leftVal) < parseFloat(rightVal);
				}
			}
		}

		// Truthy
		var val = evaluateExpression(condStr, vars);
		return !!val && val !== "none" && val !== 0 && val !== "0" && val !== "";
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
                if (op === '>' && i + 1 < str.length && str[i + 1] === '=') continue;
                if (op === '<' && i + 1 < str.length && str[i + 1] === '=') continue;
                if (op === '=' && i > 0 && (str[i-1] === '!' || str[i-1] === '>' || str[i-1] === '<')) continue;
                return i;
            }
        }
        return -1;
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

    // ─── Interpreter with WHILE loops ───────────────────────────────────
    function interpretScript(parsedLines, vars) {
        var output = [];
        var showTextCommands = [];
        var iterations = 0;

        function execute(startIdx, endIdx) {
            var idx = startIdx;
            while (idx < endIdx) {
                if (++iterations > MAX_ITERATIONS) {
                    output.push("⚠️ ABBRUCH: Zu viele Iterationen (Endlosschleife?)");
                    return endIdx;
                }

                var line = parsedLines[idx].text;

                // ─── WHILE loop ─────────────────────────────────
                if (line.startsWith('while ')) {
                    idx = executeWhile(idx, endIdx);
                    continue;
                }

                // ─── FOR loop: for i in range(n) ────────────────
                if (line.startsWith('for ')) {
                    idx = executeFor(idx, endIdx);
                    continue;
                }

                // ─── IF / ELIF / ELSE / END ─────────────────────
                if (line.startsWith('if ')) {
                    idx = executeIfBlock(idx, endIdx);
                    continue;
                }

                if (line.startsWith('elif ') || line === 'else') { return idx; }

                // ─── SHOW_TEXT ───────────────────────────────────
                if (line.startsWith('show_text ')) {
                    var showArgs = parseShowTextArgs(line);
                    if (showArgs) {
                        var msg = evaluateExpression(showArgs.message, vars);
                        showTextCommands.push({ message: String(msg), style: showArgs.style || 'normal' });
                    }
                    idx++;
                    continue;
                }

                // ─── PRINT ──────────────────────────────────────
                var printArg = parsePrintArgument(line);
                if (printArg !== null) {
                    var printVal = evaluateExpression(printArg, vars);
                    output.push(String(printVal));
                    idx++;
                    continue;
                }

                // ─── VARIABLE ASSIGNMENT (with arithmetic) ──────
                var assignMatch = line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*=\s*(.+)$/);
                if (assignMatch) {
                    vars[assignMatch[1]] = evaluateExpression(assignMatch[2].trim(), vars);
                    idx++;
                    continue;
                }

                // ─── COMPOUND ASSIGNMENT: +=, -=, *=, /= ───────
                var compoundMatch = line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
                if (compoundMatch) {
                    var cVarName = compoundMatch[1];
                    var cOp = compoundMatch[2];
                    var cVal = evaluateExpression(compoundMatch[3].trim(), vars);
                    var cCurrent = vars.hasOwnProperty(cVarName) ? vars[cVarName] : 0;
                    switch (cOp) {
                        case '+=':
                            if (typeof cCurrent === 'string' || typeof cVal === 'string') {
                                vars[cVarName] = String(cCurrent) + String(cVal);
                            } else {
                                vars[cVarName] = (parseFloat(cCurrent) || 0) + (parseFloat(cVal) || 0);
                            }
                            break;
                        case '-=': vars[cVarName] = (parseFloat(cCurrent) || 0) - (parseFloat(cVal) || 0); break;
                        case '*=': vars[cVarName] = (parseFloat(cCurrent) || 0) * (parseFloat(cVal) || 0); break;
                        case '/=':
                            var divisor = parseFloat(cVal) || 0;
                            vars[cVarName] = divisor !== 0 ? (parseFloat(cCurrent) || 0) / divisor : 0;
                            break;
                        case '%=':
                            var mod = parseFloat(cVal) || 0;
                            vars[cVarName] = mod !== 0 ? (parseFloat(cCurrent) || 0) % mod : 0;
                            break;
                    }
                    idx++;
                    continue;
                }

                // Unknown line — skip
                idx++;
            }
            return idx;
        }

        // ─── WHILE execution ────────────────────────────────────
        function executeWhile(startIdx, endIdx) {
            var line = parsedLines[startIdx].text;
            var condStr = line.substring(6).trim(); // after 'while '

            // Find the matching 'end'
            var bodyStart = startIdx + 1;
            var bodyEnd = findMatchingEnd(bodyStart, endIdx);

            while (evaluateCondition(condStr, vars)) {
                if (++iterations > MAX_ITERATIONS) {
                    output.push("⚠️ ABBRUCH: Zu viele Iterationen (Endlosschleife?)");
                    break;
                }
                execute(bodyStart, bodyEnd);
            }

            // Skip past the 'end'
            return bodyEnd + 1;
        }

        // ─── FOR execution: for i in range(n) ──────────────────
        function executeFor(startIdx, endIdx) {
            var line = parsedLines[startIdx].text;
            // Parse: for <var> in range(<start>, <stop>) or range(<stop>)
            var forMatch = line.match(/^for\s+([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s+in\s+range\((.+)\)$/);
            if (!forMatch) {
                output.push("⚠️ Syntax-Fehler: " + line);
                return startIdx + 1;
            }

            var loopVar = forMatch[1];
            var rangeArgs = forMatch[2].split(',').map(function(s) { return s.trim(); });

            var rangeStart = 0, rangeEnd = 0, rangeStep = 1;
            if (rangeArgs.length === 1) {
                rangeEnd = Math.floor(parseFloat(evaluateExpression(rangeArgs[0], vars)) || 0);
            } else if (rangeArgs.length === 2) {
                rangeStart = Math.floor(parseFloat(evaluateExpression(rangeArgs[0], vars)) || 0);
                rangeEnd = Math.floor(parseFloat(evaluateExpression(rangeArgs[1], vars)) || 0);
            } else if (rangeArgs.length >= 3) {
                rangeStart = Math.floor(parseFloat(evaluateExpression(rangeArgs[0], vars)) || 0);
                rangeEnd = Math.floor(parseFloat(evaluateExpression(rangeArgs[1], vars)) || 0);
                rangeStep = Math.floor(parseFloat(evaluateExpression(rangeArgs[2], vars)) || 1);
                if (rangeStep === 0) rangeStep = 1;
            }

            var bodyStart = startIdx + 1;
            var bodyEnd = findMatchingEnd(bodyStart, endIdx);

            if (rangeStep > 0) {
                for (var i = rangeStart; i < rangeEnd; i += rangeStep) {
                    if (++iterations > MAX_ITERATIONS) {
                        output.push("⚠️ ABBRUCH: Zu viele Iterationen (Endlosschleife?)");
                        break;
                    }
                    vars[loopVar] = i;
                    execute(bodyStart, bodyEnd);
                }
            } else {
                for (var i = rangeStart; i > rangeEnd; i += rangeStep) {
                    if (++iterations > MAX_ITERATIONS) {
                        output.push("⚠️ ABBRUCH: Zu viele Iterationen (Endlosschleife?)");
                        break;
                    }
                    vars[loopVar] = i;
                    execute(bodyStart, bodyEnd);
                }
            }

            return bodyEnd + 1;
        }

        // ─── IF/ELIF/ELSE execution ────────────────────────────
        function executeIfBlock(startIdx, endIdx) {
            var idx = startIdx;
            var conditionMet = false;

            var ifLine = parsedLines[idx].text;
            var ifCond = ifLine.substring(3).trim();
            idx++;

            if (evaluateCondition(ifCond, vars)) {
                conditionMet = true;
                idx = executeBodyUntilElifElseEnd(idx, endIdx);
            } else {
                idx = skipBodyUntilElifElseEnd(idx, endIdx);
            }

            while (idx < endIdx) {
                var currentLine = parsedLines[idx].text;

                if (currentLine.startsWith('elif ')) {
                    if (!conditionMet) {
                        var elifCond = currentLine.substring(5).trim();
                        idx++;
                        if (evaluateCondition(elifCond, vars)) {
                            conditionMet = true;
                            idx = executeBodyUntilElifElseEnd(idx, endIdx);
                        } else {
                            idx = skipBodyUntilElifElseEnd(idx, endIdx);
                        }
                    } else {
                        idx++;
                        idx = skipBodyUntilElifElseEnd(idx, endIdx);
                    }
                } else if (currentLine === 'else') {
                    idx++;
                    if (!conditionMet) {
                        conditionMet = true;
                        idx = executeBodyUntilElifElseEnd(idx, endIdx);
                    } else {
                        idx = skipBodyUntilElifElseEnd(idx, endIdx);
                    }
                } else {
                    break;
                }
            }
            return idx;
        }

        function executeBodyUntilElifElseEnd(startIdx, endIdx) {
            var idx = startIdx;
            while (idx < endIdx) {
                var line = parsedLines[idx].text;

                if (line.startsWith('if ')) { idx = executeIfBlock(idx, endIdx); continue; }
                if (line.startsWith('while ')) { idx = executeWhile(idx, endIdx); continue; }
                if (line.startsWith('for ')) { idx = executeFor(idx, endIdx); continue; }

                if (line.startsWith('elif ') || line === 'else') return idx;

                // Execute single statement (reuse logic from execute())
                if (line.startsWith('show_text ')) {
                    var showArgs = parseShowTextArgs(line);
                    if (showArgs) {
                        var msg = evaluateExpression(showArgs.message, vars);
                        showTextCommands.push({ message: String(msg), style: showArgs.style || 'normal' });
                    }
                    idx++; continue;
                }

                var printArg = parsePrintArgument(line);
                if (printArg !== null) {
                    var printVal = evaluateExpression(printArg, vars);
                    output.push(String(printVal));
                    idx++; continue;
                }

                var assignMatch = line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*=\s*(.+)$/);
                if (assignMatch) {
                    vars[assignMatch[1]] = evaluateExpression(assignMatch[2].trim(), vars);
                    idx++; continue;
                }

                var compoundMatch = line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
                if (compoundMatch) {
                    var cVarName = compoundMatch[1];
                    var cOp = compoundMatch[2];
                    var cVal = evaluateExpression(compoundMatch[3].trim(), vars);
                    var cCurrent = vars.hasOwnProperty(cVarName) ? vars[cVarName] : 0;
                    switch (cOp) {
                        case '+=':
                            if (typeof cCurrent === 'string' || typeof cVal === 'string') {
                                vars[cVarName] = String(cCurrent) + String(cVal);
                            } else {
                                vars[cVarName] = (parseFloat(cCurrent) || 0) + (parseFloat(cVal) || 0);
                            }
                            break;
                        case '-=': vars[cVarName] = (parseFloat(cCurrent) || 0) - (parseFloat(cVal) || 0); break;
                        case '*=': vars[cVarName] = (parseFloat(cCurrent) || 0) * (parseFloat(cVal) || 0); break;
                        case '/=':
                            var d = parseFloat(cVal) || 0;
                            vars[cVarName] = d !== 0 ? (parseFloat(cCurrent) || 0) / d : 0;
                            break;
                        case '%=':
                            var m = parseFloat(cVal) || 0;
                            vars[cVarName] = m !== 0 ? (parseFloat(cCurrent) || 0) % m : 0;
                            break;
                    }
                    idx++; continue;
                }

                idx++;
            }
            return idx;
        }

        function skipBodyUntilElifElseEnd(startIdx, endIdx) {
            var idx = startIdx;
            var depth = 0;
            while (idx < endIdx) {
                var line = parsedLines[idx].text;
                if (line.startsWith('if ') || line.startsWith('while ') || line.startsWith('for ')) { depth++; idx++; continue; }
                if ((line.startsWith('elif ') || line === 'else') && depth === 0) {
                    return idx;
                }
                idx++;
            }
            return idx;
        }

        // ─── Find matching 'end' for while/for ─────────────────
        function findMatchingEnd(startIdx, endIdx) {
            var depth = 0;
            for (var i = startIdx; i < endIdx; i++) {
                var line = parsedLines[i].text;
                if (line.startsWith('if ') || line.startsWith('while ') || line.startsWith('for ')) {
                    depth++;
                }
            }
            return endIdx; // no matching end found
        }

        execute(0, parsedLines.length);
        return { output: output, showTextCommands: showTextCommands };
    }

    // ─── Parse show_text arguments ──────────────────────────────────────
    function parseShowTextArgs(line) {
        var afterCmd = line.substring('show_text '.length).trim();
        if (!afterCmd) return null;

        var message = '';
        var style = 'normal';
        var styles = ['normal', 'winner', 'loser', 'draw'];

        var lastSpace = -1;
        var inStr = false, strChar = '';
        for (var i = 0; i < afterCmd.length; i++) {
            var ch = afterCmd[i];
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
            else if (inStr && ch === strChar) { inStr = false; }
            else if (!inStr && ch === ' ') { lastSpace = i; }
        }

        if (!inStr && lastSpace !== -1) {
            var candidate = afterCmd.substring(lastSpace + 1);
            if (styles.indexOf(candidate) !== -1) {
                style = candidate;
                message = afterCmd.substring(0, lastSpace).trim();
            } else {
                message = afterCmd;
            }
        } else {
            message = afterCmd;
        }

        return { message: message, style: style };
    }

    function parsePrintArgument(line) {
        if (!line.startsWith('print') && !line.startsWith('show_text')) return null;
        var keyword = line.startsWith('show_text') ? 'show_text' : 'print';
        var afterKeyword = line.substring(keyword.length);
        if (afterKeyword.startsWith('(')) {
            var depth = 0, inStr = false, strChar = '';
            for (var i = 0; i < afterKeyword.length; i++) {
                var ch = afterKeyword[i];
                if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
                else if (inStr && ch === strChar) { inStr = false; }
                else if (!inStr && ch === '(') { depth++; }
                else if (!inStr && ch === ')') { depth--; if (depth === 0) return afterKeyword.substring(1, i).trim(); }
            }
            return afterKeyword.substring(1).trim();
        }
        if (afterKeyword.startsWith(' ') || afterKeyword.startsWith('\t')) {
            return afterKeyword.trim();
        }
        return null;
    }

    // ─── Build context from detections ──────────────────────────────────
    function buildDSLContext(detections) {
        // Start with persistent vars (survive across frames)
        var vars = {};
        for (var key in persistentVars) {
            if (persistentVars.hasOwnProperty(key)) {
                vars[key] = persistentVars[key];
            }
        }

        // Detection builtins
        vars['detection_count'] = 0;
        vars['leftmost_detection'] = 'none';
        vars['rightmost_detection'] = 'none';
        vars['topmost_detection'] = 'none';
        vars['bottommost_detection'] = 'none';
        vars['largest_detection'] = 'none';
        vars['smallest_detection'] = 'none';
        vars['highest_conf_detection'] = 'none';
        vars['leftmost_detection.probability'] = 0;
        vars['rightmost_detection.probability'] = 0;
        vars['topmost_detection.probability'] = 0;
        vars['bottommost_detection.probability'] = 0;
        vars['largest_detection.probability'] = 0;
        vars['smallest_detection.probability'] = 0;
        vars['highest_conf_detection.probability'] = 0;

        if (!detections || detections.length === 0) return vars;

        vars['detection_count'] = detections.length;

        var leftmost = detections[0], rightmost = detections[0];
        var topmost = detections[0], bottommost = detections[0];
        var largest = detections[0], smallest = detections[0];
        var highestConf = detections[0];

        for (var i = 1; i < detections.length; i++) {
            var d = detections[i];
            if (d.xMin < leftmost.xMin) leftmost = d;
            if (d.xMax > rightmost.xMax) rightmost = d;
            if (d.yMin < topmost.yMin) topmost = d;
            if (d.yMax > bottommost.yMax) bottommost = d;
            var area = (d.xMax - d.xMin) * (d.yMax - d.yMin);
            var largestArea = (largest.xMax - largest.xMin) * (largest.yMax - largest.yMin);
            var smallestArea = (smallest.xMax - smallest.xMin) * (smallest.yMax - smallest.yMin);
            if (area > largestArea) largest = d;
            if (area < smallestArea) smallest = d;
            if (d.score > highestConf.score) highestConf = d;
        }

        vars['leftmost_detection'] = leftmost.label;
        vars['leftmost_detection.probability'] = leftmost.score;
        vars['rightmost_detection'] = rightmost.label;
        vars['rightmost_detection.probability'] = rightmost.score;
        vars['topmost_detection'] = topmost.label;
        vars['topmost_detection.probability'] = topmost.score;
        vars['bottommost_detection'] = bottommost.label;
        vars['bottommost_detection.probability'] = bottommost.score;
        vars['largest_detection'] = largest.label;
        vars['largest_detection.probability'] = largest.score;
        vars['smallest_detection'] = smallest.label;
        vars['smallest_detection.probability'] = smallest.score;
        vars['highest_conf_detection'] = highestConf.label;
        vars['highest_conf_detection.probability'] = highestConf.score;

        return vars;
    }

    // ─── Game loop (requestAnimationFrame based) ────────────────────────
    var evalInterval = 333; // ~3 fps default

	// ─── Game loop (smooth fixed interval) ────────────────────────────────
	var gameInterval = null;
	var cachedParsed = null;
	var lastCode = '';

	async function gameStep() {
		if (!gameRunning) return;

		var detections = [];

		if (gameModel && webcamStream && video.readyState >= 2) {
			try {
				detections = await runDetection();
			} catch (e) {
				detections = [];
			}
		}

		drawGameDetections(detections);

		// Nur neu parsen wenn sich der Code geändert hat (großer Performance-Gewinn!)
		var code = editor ? (editor.value || '') : '';
		if (code !== lastCode || cachedParsed === null) {
			cachedParsed = parseScript(code);
			lastCode = code;
		}

		var vars = buildDSLContext(detections);

		try {
			var results = interpretScript(cachedParsed, vars);

			// Persistente Variablen speichern
			var builtinKeys = [
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
			for (var key in vars) {
				if (vars.hasOwnProperty(key) && builtinKeys.indexOf(key) === -1) {
					persistentVars[key] = vars[key];
				}
			}

			if (results.output && results.output.length > 0) {
				for (var i = 0; i < results.output.length; i++) {
					appendOutput(results.output[i]);
				}
			}

			if (results.showTextCommands && results.showTextCommands.length > 0) {
				var lastCmd = results.showTextCommands[results.showTextCommands.length - 1];
				showTextOnVideo(lastCmd.message, lastCmd.style);
			} else {
				clearTextOverlay();
			}
		} catch (e) {
			appendOutput("FEHLER: " + (e.message || "Unbekannter Fehler"));
			clearTextOverlay();
		}

		setStatus('Läuft | Erkennungen: ' + detections.length);
	}


    // ─── Auto-start: triggered by model selection ───────────────────────
	async function autoStart(modelUuid) {
		// ═══ CRITICAL: Always clear existing interval first ═══
		if (gameInterval) {
			clearInterval(gameInterval);
			gameInterval = null;
		}
		gameRunning = false;
		persistentVars = {};
		cachedParsed = null;
		lastCode = '';

		if (modelUuid === 'none') {
			stopGameWebcam();
			if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
			clearTextOverlay();
			setStatus('Wähle ein Modell zum Starten');
			return;
		}

		setStatus('Kamera wird gestartet...');
		var webcamOk = await startGameWebcam();
		if (!webcamOk) {
			setStatus('Kamera-Fehler');
			return;
		}

		setStatus('Modell wird geladen...');
		var modelOk = await loadGameModel(modelUuid);
		if (!modelOk) {
			setStatus('Modell-Fehler');
			return;
		}

		gameRunning = true;
		var fps = parseInt(document.getElementById('game_fps').value) || 3;
		gameInterval = setInterval(gameStep, Math.round(1000 / fps));
		setStatus('Spiel läuft mit ' + fps + ' Auswertungen/Sek');
		appendOutput("🎮 Spiel läuft!");
	}

    // ─── Model select change ────────────────────────────────────────────
    var modelSelect = document.getElementById('game_model_select');
    if (modelSelect) {
        modelSelect.addEventListener('change', function() {
            autoStart(this.value);
        });
    }

    // ─── Camera change ──────────────────────────────────────────────────
    var cameraSelect = document.getElementById('game_camera_select');
    if (cameraSelect) {
	    cameraSelect.addEventListener('change', function() {
		    var modelUuid = document.getElementById('game_model_select').value;
		    if (modelUuid === 'none') return;

		    // ═══ Stop everything cleanly ═══
		    gameRunning = false;

		    // Clear the game interval (this was the bug — it wasn't cleared here)
		    if (gameInterval) {
			    clearInterval(gameInterval);
			    gameInterval = null;
		    }

		    // Clear legacy animFrameId if it somehow exists
		    if (animFrameId) {
			    cancelAnimationFrame(animFrameId);
			    animFrameId = null;
		    }

		    // Stop webcam so it can restart with new device
		    stopGameWebcam();

		    // Restart with new camera
		    autoStart(modelUuid);
	    });

    }

    // ─── Confidence slider ──────────────────────────────────────────────
    var gameConfSlider = document.getElementById('game_conf_slider');
    if (gameConfSlider) {
        gameConfSlider.addEventListener('input', function() {
            var display = document.getElementById('game_conf_value');
            if (display) display.textContent = parseFloat(this.value).toFixed(2);
        });
    }

    // ─── FPS hot-swap ───────────────────────────────────────────────────
    var gameFpsInput = document.getElementById('game_fps');
	if (gameFpsInput) {
		gameFpsInput.addEventListener('input', function() {
			if (!gameRunning || !gameInterval) return;
			clearInterval(gameInterval);
			var fps = Math.max(1, Math.min(10, parseInt(this.value) || 3));
			gameInterval = setInterval(gameStep, Math.round(1000 / fps));
			setStatus('Spiel läuft mit ' + fps + ' Auswertungen/Sek');
		});
	}

    // ─── Button bindings ────────────────────────────────────────────────
    var btnClearOutput = document.getElementById('btn_clear_output');
    if (btnClearOutput) btnClearOutput.addEventListener('click', clearOutput);

    var btnShowCode = document.getElementById('btn_show_code');
    if (btnShowCode) {
        btnShowCode.addEventListener('click', function() {
            var code = editor.value || '(kein Programm)';
            var previewContent = document.getElementById('code_preview_content');
            var modal = document.getElementById('code_preview_modal');
            if (previewContent) previewContent.textContent = code;
            if (modal) modal.classList.add('visible');
        });
    }

	// ═══════════════════════════════════════════════════════════════
	// BEISPIEL-GALERIE — Ersetzt den alten rotierenden Button
	// ═══════════════════════════════════════════════════════════════

	function getExamplePrograms() {
		var l1 = (gameLabels && gameLabels.length >= 1) ? gameLabels[0] : 'ObjektA';
		var l2 = (gameLabels && gameLabels.length >= 2) ? gameLabels[1] : 'ObjektB';
		var l3 = (gameLabels && gameLabels.length >= 3) ? gameLabels[2] : 'ObjektC';

		return [
			{
				id: 'rps',
				name: '✊✌️✋ Schere Stein Papier',
				icon: '✊',
				difficulty: '⭐',
				description: 'Spiele gegen einen Freund! Haltet beide eure Hände in die Kamera.',
				preview: '👈 Spieler 1 | Spieler 2 👉',
				color: '#4fc3f7',
				code:
				'# ══ SCHERE STEIN PAPIER ══\n' +
				'# Regeln: Schere schneidet Papier,\n' +
				'# Papier wickelt Stein ein,\n' +
				'# Stein macht Schere kaputt.\n' +
				'spieler = leftmost_detection\n' +
				'gegner = rightmost_detection\n' +
				'if detection_count ist kleiner als 2\n' +
				'  show_text "Zeigt beide eure Hände! ✊✌️✋" normal\n' +
				'elif spieler ist gleich gegner\n' +
				'  show_text "UNENTSCHIEDEN! 🤝 Beide: " + spieler draw\n' +
				'elif spieler ist gleich "' + l1 + '" and gegner ist gleich "' + l3 + '"\n' +
				'  siege += 1\n' +
				'  show_text "👈 SPIELER 1 GEWINNT! 🎉 " + spieler + " schlägt " + gegner winner\n' +
				'elif spieler ist gleich "' + l3 + '" and gegner ist gleich "' + l2 + '"\n' +
				'  siege += 1\n' +
				'  show_text "👈 SPIELER 1 GEWINNT! 🎉 " + spieler + " schlägt " + gegner winner\n' +
				'elif spieler ist gleich "' + l2 + '" and gegner ist gleich "' + l1 + '"\n' +
				'  siege += 1\n' +
				'  show_text "👈 SPIELER 1 GEWINNT! 🎉 " + spieler + " schlägt " + gegner winner\n' +
				'else\n' +
				'  niederlagen += 1\n' +
				'  show_text "👉 SPIELER 2 GEWINNT! 💪 " + gegner + " schlägt " + spieler loser\n'
			},
			{
				id: 'counter',
				name: '📊 Rekord-Jäger',
				icon: '🏆',
				difficulty: '⭐',
				description: 'Wie viele Objekte kannst du gleichzeitig zeigen? Jage den Rekord!',
				preview: '🏆 Zeige so viele Objekte wie möglich!',
				color: '#ffb74d',
				code:
				'# ══ REKORD-JÄGER ══\n' +
				'aktuell = detection_count\n' +
				'if aktuell > rekord\n' +
				'  rekord = aktuell\n' +
				'if aktuell > 0\n' +
				'  gesamt += aktuell\n' +
				'if aktuell == 0\n' +
				'  show_text "🔍 Zeige Objekte! Rekord: " + rekord normal\n' +
				'elif aktuell == rekord\n' +
				'  show_text "🏆 NEUER REKORD! " + rekord + " Objekte!" winner\n' +
				'else\n' +
				'  show_text "👀 Erkannt: " + aktuell + " | Rekord: " + rekord normal\n'
			},
			{
				id: 'collect',
				name: '🎯 Sammel-Challenge',
				icon: '🎯',
				difficulty: '⭐⭐',
				description: 'Zeige verschiedene Objekte nacheinander! Gleiches Objekt zweimal = keine Punkte!',
				preview: '🔄 Immer wechseln für Punkte!',
				color: '#66bb6a',
				code:
				'# ══ SAMMEL-CHALLENGE ══\n' +
				'aktuell = highest_conf_detection\n' +
				'if aktuell == "none"\n' +
				'  show_text "🎯 Zeige ein Objekt! Punkte: " + punkte normal\n' +
				'elif aktuell != letztes\n' +
				'  punkte += 10\n' +
				'  streak += 1\n' +
				'  bonus = streak * 5\n' +
				'  punkte += bonus\n' +
				'  letztes = aktuell\n' +
				'  show_text "✅ " + aktuell + "! +" + (10 + bonus) + " Pkt | Streak: " + streak + "x" winner\n' +
				'else\n' +
				'  streak = 0\n' +
				'  show_text "🔄 Schon gezeigt! Wechsle! Punkte: " + punkte draw\n'
			}
		];
	}

	// ─── Galerie rendern ────────────────────────────────────────────────
	function renderExampleGallery() {
	    var container = document.getElementById('example_cards_container');
	    if (!container) return;
	    container.innerHTML = '';

	    var examples = getExamplePrograms();

	    for (var i = 0; i < examples.length; i++) {
		(function(ex, index) {
		    var card = document.createElement('div');
		    card.className = 'example-card';
		    card.style.borderColor = ex.color;

		    card.innerHTML =
			'<div class="example-card-icon" style="background:' + ex.color + '22; color:' + ex.color + '">' +
			    '<span class="example-big-icon">' + ex.icon + '</span>' +
			'</div>' +
			'<div class="example-card-body">' +
			    '<h3>' + ex.name + '</h3>' +
			    '<div class="example-difficulty">' + ex.difficulty + '</div>' +
			    '<p>' + ex.description + '</p>' +
			    '<div class="example-preview">' + ex.preview + '</div>' +
			'</div>';

		    card.addEventListener('click', function() {
			if (typeof window.loadCodeToBlocks === 'function') {
			    window.loadCodeToBlocks(ex.code);
			} else {
			    editor.value = ex.code;
			}
			persistentVars = {}; // Reset variables
			clearOutput();
			appendOutput("🎮 " + ex.name + " geladen!");
			appendOutput("   " + ex.description);
			document.getElementById('example_gallery_modal').classList.remove('visible');

			// Confetti effect
			showConfetti();
		    });

		    container.appendChild(card);
		})(examples[i], i);
	    }
	}

	// ─── Confetti-Effekt beim Laden ─────────────────────────────────────
	function showConfetti() {
	    var emojis = ['🎉', '⭐', '🎮', '🚀', '✨', '💫'];
	    for (var i = 0; i < 12; i++) {
		(function(delay) {
		    setTimeout(function() {
			var particle = document.createElement('div');
			particle.className = 'confetti-particle';
			particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];
			particle.style.left = (Math.random() * 100) + '%';
			particle.style.animationDuration = (1 + Math.random() * 2) + 's';
			document.getElementById('game_editor_page').appendChild(particle);
			setTimeout(function() { particle.remove(); }, 3000);
		    }, delay * 80);
		})(i);
	    }
	}

	// ─── Button-Binding für Galerie ─────────────────────────────────────
	var btnShowExamples = document.getElementById('btn_show_examples');
	if (btnShowExamples) {
	    btnShowExamples.addEventListener('click', function() {
		renderExampleGallery();
		document.getElementById('example_gallery_modal').classList.add('visible');
	    });
	}

	// KEEP the old btn_load_example as fallback, but also make it open gallery:
	var btnLoadExample = document.getElementById('btn_load_example');
	if (btnLoadExample) {
	    btnLoadExample.addEventListener('click', function() {
		renderExampleGallery();
		document.getElementById('example_gallery_modal').classList.add('visible');
	    });
	}



    // ─── Cleanup on unload ──────────────────────────────────────────────
    window.addEventListener('beforeunload', function() {
        gameRunning = false;
        if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
        stopGameWebcam();
        if (gameModel) try { gameModel.dispose(); } catch (e) {}
    });

})();
