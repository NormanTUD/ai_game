<?php
    include("header.php");
    include_once("functions.php");
?>

<style>
    .batch-section {
        margin: 20px 0;
        padding: 15px;
        border: 1px solid #444;
        border-radius: 8px;
        background: #1a1a2e;
    }
    .batch-section h3 {
        margin-top: 0;
        color: #4caf50;
    }
    #batchProgressContainer {
        display: none;
        margin-top: 20px;
    }
    #batchProgressBar {
        width: 100%;
        background-color: #333;
        border-radius: 5px;
        overflow: hidden;
    }
    #batchProgressBarFill {
        height: 24px;
        width: 0%;
        background-color: #4caf50;
        text-align: center;
        color: white;
        line-height: 24px;
        transition: width 0.3s;
    }
    #batchProgressInfo {
        margin-top: 8px;
        font-size: 0.9em;
    }
    #batchLog {
        height: 400px;
        overflow-y: auto;
        margin-top: 20px;
        padding: 10px;
        background: #111;
        border: 1px solid #333;
        border-radius: 5px;
        font-family: monospace;
        font-size: 0.85em;
        white-space: pre-wrap;
    }
    .file-list {
        max-height: 200px;
        overflow-y: auto;
        background: #111;
        padding: 8px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85em;
        margin-top: 8px;
    }
    .file-count {
        font-weight: bold;
        color: #4caf50;
        margin-left: 10px;
    }
    .match-ok { color: #4caf50; }
    .match-warn { color: #ff9800; }
    .match-err { color: #f44336; }
    #yamlPreview {
        background: #111;
        padding: 10px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 0.85em;
        max-height: 300px;
        overflow-y: auto;
        margin-top: 8px;
        display: none;
    }
    .step-indicator {
        display: inline-block;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #333;
        color: #fff;
        text-align: center;
        line-height: 30px;
        margin-right: 10px;
        font-weight: bold;
    }
    .step-indicator.active {
        background: #4caf50;
    }
    .step-indicator.done {
        background: #2196f3;
    }
    #startBatchUpload {
        padding: 12px 30px;
        font-size: 1.1em;
        background: #4caf50;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        margin-top: 15px;
    }
    #startBatchUpload:disabled {
        background: #555;
        cursor: not-allowed;
    }
    #startBatchUpload:hover:not(:disabled) {
        background: #45a049;
    }
    .pair-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
    }
    .pair-table th, .pair-table td {
        padding: 4px 8px;
        border-bottom: 1px solid #333;
        text-align: left;
        font-size: 0.85em;
    }
    .pair-table th {
        color: #aaa;
    }
</style>

<h1>Batch Upload (YOLO Dataset Import)</h1>

<p>Import images with their YOLO-format annotation files. Select files in any order &mdash; they will be matched by filename stem.</p>

<!-- Step 1: YAML (optional) -->
<div class="batch-section">
    <h3><span class="step-indicator" id="step1ind">1</span> Dataset YAML (optional)</h3>
    <p>If you have a <code>dataset.yaml</code>, upload it to map class indices to names. Otherwise, class indices from your label files will be looked up against existing categories in the DB.</p>
    <input type="file" id="yamlFile" accept=".yaml,.yml" />
    <div id="yamlPreview"></div>
    <div id="yamlStatus"></div>
</div>

<!-- Step 2: Images -->
<div class="batch-section">
    <h3><span class="step-indicator" id="step2ind">2</span> Select Image Files</h3>
    <p>Select all image files (jpg, jpeg, png, bmp, webp). You can select from multiple folders.</p>
    <input type="file" id="imageFiles" multiple accept=".jpg,.jpeg,.png,.bmp,.webp" />
    <span class="file-count" id="imageCount">0 files</span>
    <div class="file-list" id="imageFileList" style="display:none;"></div>
</div>

<!-- Step 3: Labels -->
<div class="batch-section">
    <h3><span class="step-indicator" id="step3ind">3</span> Select Label Files</h3>
    <p>Select all <code>.txt</code> label files (YOLO format: <code>class_id x_center y_center width height</code> per line).</p>
    <input type="file" id="labelFiles" multiple accept=".txt" />
    <span class="file-count" id="labelCount">0 files</span>
    <div class="file-list" id="labelFileList" style="display:none;"></div>
</div>

<!-- Step 4: Matching preview -->
<div class="batch-section">
    <h3><span class="step-indicator" id="step4ind">4</span> Matching Preview</h3>
    <div id="matchPreview">Select images and labels above to see matching.</div>
</div>

<!-- Step 5: Upload -->
<div class="batch-section">
    <h3><span class="step-indicator" id="step5ind">5</span> Upload</h3>
    <button id="startBatchUpload" disabled>Start Batch Import</button>

    <div id="batchProgressContainer">
        <div id="batchProgressBar">
            <div id="batchProgressBarFill">0%</div>
        </div>
        <div id="batchProgressInfo"></div>
    </div>
</div>

<div id="batchLog"></div>

<script>
$(document).ready(function() {
    let imageFiles = {};   // stem -> File
    let labelFiles = {};   // stem -> File
    let yamlMapping = {};  // index -> name
    let yamlFilename = null;

    function getStem(filename) {
        // Remove extension, normalize: the image might be .jpg and label .txt
        // Handle complex names like "image_name.rf.hash.jpg" -> "image_name.rf.hash"
        return filename.replace(/\.(jpg|jpeg|png|bmp|webp|txt)$/i, '');
    }

    function logMsg(msg, cls) {
        const el = document.getElementById('batchLog');
        const span = document.createElement('span');
        if (cls) span.className = cls;
        span.textContent = msg + "\n";
        el.appendChild(span);
        el.scrollTop = el.scrollHeight;
    }

    function clearLog() {
        document.getElementById('batchLog').innerHTML = '';
    }

    // --- YAML parsing ---
    function parseYaml(text) {
	    const lines = text.split(/\r?\n/);
	    const names = {};

	    // --- Format 1: Inline list ---
	    // names: ['cat', 'dog'] or names: ["cat", "dog"]
	    const inlineMatch = text.match(/^names\s*:\s*\[([^\]]*)\]/m);
	    if (inlineMatch) {
		    const items = inlineMatch[1].split(',');
		    items.forEach((item, idx) => {
		    const cleaned = item.trim().replace(/^['"]|['"]$/g, '');
		    if (cleaned.length > 0) {
			    names[idx] = cleaned;
		    }
		    });
		    return names;
	    }

	    // --- Format 2 & 3: Block styles (list or map) ---
	    let insideNames = false;

	    for (const line of lines) {
		    const trim = line.trim();
		    if (trim === '' || trim.startsWith('#')) continue;

		    if (!insideNames) {
			    if (/^names\s*:/.test(trim)) {
				    insideNames = true;
			    }
			    continue;
		    }

		    // Format 2: YAML list with dashes
		    // - cat
		    const listMatch = line.match(/^\s+-\s+(.+)$/);
		    if (listMatch) {
			    const idx = Object.keys(names).length;
			    names[idx] = listMatch[1].trim().replace(/^['"]|['"]$/g, '');
			    continue;
		    }

		    // Format 3: Map with index keys
		    // 0: cat
		    const mapMatch = line.match(/^\s+(\d+)\s*:\s*(.+)$/);
		    if (mapMatch) {
			    names[parseInt(mapMatch[1])] = mapMatch[2].trim().replace(/^['"]|['"]$/g, '');
			    continue;
		    }

		    // If we hit a new top-level key, stop
		    if (/^\S/.test(line)) {
			    break;
		    }
	    }

	    return names;
    }


    $('#yamlFile').on('change', function() {
        const file = this.files[0];
        if (!file) return;

        yamlFilename = file.name;
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            yamlMapping = parseYaml(text);
            const count = Object.keys(yamlMapping).length;

            const preview = $('#yamlPreview');
            preview.show();
            let html = `<b>${count} classes found:</b>\n`;
            for (const [idx, name] of Object.entries(yamlMapping)) {
                html += `  ${idx}: ${name}\n`;
            }
            preview.text(html);

            $('#yamlStatus').html(`<span class="match-ok">✓ Loaded ${count} class mappings from ${file.name}</span>`);
            $('#step1ind').addClass('done');
            updateMatchPreview();
        };
        reader.readAsText(file);
    });

    // --- Image files ---
    $('#imageFiles').on('change', function() {
        imageFiles = {};
        const files = this.files;
        const listEl = $('#imageFileList');
        listEl.empty().show();

        for (let i = 0; i < files.length; i++) {
            const stem = getStem(files[i].name);
            imageFiles[stem] = files[i];
            listEl.append(document.createTextNode(files[i].name + "\n"));
        }

        $('#imageCount').text(files.length + ' files');
        $('#step2ind').addClass('done');
        updateMatchPreview();
    });

    // --- Label files ---
    $('#labelFiles').on('change', function() {
        labelFiles = {};
        const files = this.files;
        const listEl = $('#labelFileList');
        listEl.empty().show();

        for (let i = 0; i < files.length; i++) {
            const stem = getStem(files[i].name);
            labelFiles[stem] = files[i];
            listEl.append(document.createTextNode(files[i].name + "\n"));
        }

        $('#labelCount').text(files.length + ' files');
        $('#step3ind').addClass('done');
        updateMatchPreview();
    });

    // --- Matching preview ---
    function updateMatchPreview() {
        const preview = $('#matchPreview');
        const imgStems = Object.keys(imageFiles);
        const lblStems = Object.keys(labelFiles);

        if (imgStems.length === 0 && lblStems.length === 0) {
            preview.html('Select images and labels above to see matching.');
            $('#startBatchUpload').prop('disabled', true);
            return;
        }

        const allStems = new Set([...imgStems, ...lblStems]);
        let matched = 0, imgOnly = 0, lblOnly = 0;
        let html = '<table class="pair-table"><tr><th>Status</th><th>Image</th><th>Label</th></tr>';

        const sorted = Array.from(allStems).sort();
        // Show max 100 rows in preview
        const showMax = 100;
        let shown = 0;

        for (const stem of sorted) {
            const hasImg = stem in imageFiles;
            const hasLbl = stem in labelFiles;

            if (hasImg && hasLbl) {
                matched++;
                if (shown < showMax) {
                    html += `<tr><td class="match-ok">✓ Paired</td><td>${imageFiles[stem].name}</td><td>${labelFiles[stem].name}</td></tr>`;
                    shown++;
                }
            } else if (hasImg) {
                imgOnly++;
                if (shown < showMax) {
                    html += `<tr><td class="match-warn">⚠ Image only</td><td>${imageFiles[stem].name}</td><td>—</td></tr>`;
                    shown++;
                }
            } else {
                lblOnly++;
                if (shown < showMax) {
                    html += `<tr><td class="match-err">✗ Label only</td><td>—</td><td>${labelFiles[stem].name}</td></tr>`;
                    shown++;
                }
            }
        }

        if (sorted.length > showMax) {
            html += `<tr><td colspan="3">... and ${sorted.length - showMax} more</td></tr>`;
        }

        html += '</table>';
        html += `<p><b>Summary:</b> <span class="match-ok">${matched} paired</span>, `;
        html += `<span class="match-warn">${imgOnly} images without labels</span>, `;
        html += `<span class="match-err">${lblOnly} labels without images</span></p>`;

        if (imgOnly > 0) {
            html += `<p class="match-warn">⚠ Images without labels will be uploaded but will have no annotations.</p>`;
        }

        preview.html(html);
        $('#step4ind').addClass('done');

        // Enable upload if we have at least one image
        $('#startBatchUpload').prop('disabled', imgStems.length === 0);
    }

    // --- Upload logic ---
    $('#startBatchUpload').on('click', async function() {
        const btn = $(this);
        btn.prop('disabled', true);
        clearLog();

        $('#batchProgressContainer').show();

        const imgStems = Object.keys(imageFiles);
        const total = imgStems.length;
        let processed = 0;
        let successCount = 0;
        let errorCount = 0;
        const startTime = Date.now();

        // Generate a batch UUID
        const batchUuid = 'batch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        logMsg(`Batch UUID: ${batchUuid}`);
        logMsg(`Starting import of ${total} images...`);
        logMsg('');

        for (const stem of imgStems) {
            const imgFile = imageFiles[stem];
            const lblFile = labelFiles[stem] || null;

            processed++;
            const pct = Math.round((processed / total) * 100);
            const elapsed = (Date.now() - startTime) / 1000;
            const eta = Math.ceil((elapsed / processed) * (total - processed));

            $('#batchProgressBarFill').css('width', pct + '%').text(pct + '%');
            $('#batchProgressInfo').html(
                `Processing: <b>${imgFile.name}</b><br>` +
                `Progress: ${processed} / ${total}<br>` +
                `ETA: ~${eta}s`
            );

            try {
                // Read label content if available
                let labelContent = null;
                let labelFilename = null;
                if (lblFile) {
                    labelContent = await readFileAsText(lblFile);
                    labelFilename = lblFile.name;
                }

                // Build FormData
                const fd = new FormData();
                fd.append('image', imgFile);
                fd.append('batch_uuid', batchUuid);
                fd.append('original_image_filename', imgFile.name);

                if (labelContent !== null) {
                    fd.append('label_content', labelContent);
                    fd.append('original_label_filename', labelFilename);
                }

                if (yamlFilename) {
                    fd.append('yaml_source', yamlFilename);
                }

                // Send YAML mapping as JSON
                if (Object.keys(yamlMapping).length > 0) {
                    fd.append('yaml_mapping', JSON.stringify(yamlMapping));
                }

                const response = await $.ajax({
                    url: 'batch_upload_process.php',
                    type: 'POST',
                    data: fd,
                    contentType: false,
                    processData: false,
                    dataType: 'json'
                });

                if (response.ok) {
                    logMsg(`✓ ${imgFile.name}: ${response.message}`, 'match-ok');
                    successCount++;
                } else {
                    logMsg(`✗ ${imgFile.name}: ${response.error}`, 'match-err');
                    errorCount++;
                }

            } catch (err) {
                logMsg(`✗ ${imgFile.name}: AJAX error: ${err.statusText || err}`, 'match-err');
                errorCount++;
            }
        }

        logMsg('');
        logMsg(`=== Import complete ===`);
        logMsg(`Success: ${successCount}, Errors: ${errorCount}, Total: ${total}`);

        $('#batchProgressBarFill').css('width', '100%').text('Done');
        $('#batchProgressInfo').html(`Import complete. ${successCount} succeeded, ${errorCount} failed.`);

        btn.prop('disabled', false);
    });

    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = e => reject(e);
            reader.readAsText(file);
        });
    }
});
</script>

<?php include_once("footer.php"); ?>
