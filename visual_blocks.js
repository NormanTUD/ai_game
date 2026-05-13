// ═══════════════════════════════════════════════════════════════════════════
// VISUAL BLOCK EDITOR v2 — Compact palette, while/for loops, event delegation
// ═══════════════════════════════════════════════════════════════════════════

(function() {
    "use strict";

    var workspace = document.getElementById('block_workspace');
    var palette = document.getElementById('block_palette');
    var placeholder = document.getElementById('workspace_placeholder');
    var trashZone = document.getElementById('trash_zone');
    var dslEditor = document.getElementById('dsl_editor');

    var draggedBlock = null;
    var draggedFromWorkspace = false;

    // ─── Variables/values for dropdowns ──────────────────────────────────
    var sensorVars = [
        { value: 'links', label: '📦 links' },
        { value: 'rechts', label: '📦 rechts' },
        { value: 'oben', label: '📦 oben' },
        { value: 'unten', label: '📦 unten' },
        { value: 'groesstes', label: '📦 größtes' },
        { value: 'kleinstes', label: '📦 kleinstes' },
        { value: 'bestes', label: '📦 bestes' },
        { value: 'detection_count', label: '🔢 anzahl' }
    ];

	var operators = [
		{ value: '==', label: 'ist gleich' },
		{ value: '!=', label: 'ist nicht' },
		{ value: '>=', label: 'ist größer oder gleich' },
		{ value: '<=', label: 'ist kleiner oder gleich' },
		{ value: '>', label: 'ist größer als' },
		{ value: '<', label: 'ist kleiner als' }
	];

    var modelLabels = [];
    var activeCategory = 'sensing'; // default open category

	// ─── Category definitions (SUPER KID-FRIENDLY) ─────────────────────────
	var categories = {
		sensing: {
			label: '👀 Gucken',
			color: '#4fc3f7',
			blocks: [
				{ type: 'get_best',    icon: '⭐', text: 'Was sehe ich am besten?' },
				{ type: 'get_count',   icon: '🔢', text: 'Wie viele Dinge sehe ich?' },
				{ type: 'get_left',    icon: '👈', text: 'Was ist links im Bild?' },
				{ type: 'get_right',   icon: '👉', text: 'Was ist rechts im Bild?' },
			],
			help: '🎓 Diese Blöcke schauen, was die Kamera sieht!'
		},
		control: {
			label: '🤔 Entscheiden',
			color: '#ffb74d',
			blocks: [
				{ type: 'if',    icon: '❓', text: 'Wenn ... dann ...' },
				{ type: 'elif',  icon: '🤔', text: 'Oder wenn ...' },
				{ type: 'else',  icon: '🤷', text: 'Ansonsten ...' },
				{ type: 'end',   icon: '🏁', text: 'Ende der Entscheidung' },
			],
			help: '🎓 Hier entscheidet dein Programm, was es tun soll!'
		},
		output: {
			label: '📢 Zeigen',
			color: '#ba68c8',
			blocks: [
				{ type: 'show_text', icon: '🖥️', text: 'Text auf dem Bild zeigen' },
				{ type: 'print',     icon: '💬', text: 'Text ins Protokoll schreiben' },
			],
			help: '🎓 Zeige Nachrichten auf dem Bildschirm!'
		},
		variables: {
			label: '🎒 Merken',
			color: '#e57373',
			blocks: [
				{ type: 'set_var',    icon: '📝', text: 'Merke: Name = Wert' },
				{ type: 'change_var', icon: '🔼', text: 'Zähle hoch / runter' },
			],
			help: '🎓 Speichere Punkte, Ergebnisse und mehr!'
		}
	};



    // ─── Build compact palette with tabs ────────────────────────────────
    function buildPalette() {
        palette.innerHTML = '';

        // Tab bar
        var tabBar = document.createElement('div');
        tabBar.className = 'palette-tabs';

        var catKeys = Object.keys(categories);
        for (var k = 0; k < catKeys.length; k++) {
            (function(key) {
                var cat = categories[key];
                var tab = document.createElement('button');
                tab.className = 'palette-tab' + (key === activeCategory ? ' active' : '');
                tab.style.borderBottomColor = key === activeCategory ? cat.color : 'transparent';
                tab.textContent = cat.label.split(' ')[0]; // just the emoji
                tab.title = cat.label;
                tab.addEventListener('click', function() {
                    activeCategory = key;
                    buildPalette();
                });
                tabBar.appendChild(tab);
            })(catKeys[k]);
        }
        palette.appendChild(tabBar);

        // Active category blocks
        var cat = categories[activeCategory];
        var blockList = document.createElement('div');
        blockList.className = 'palette-block-list';

        for (var i = 0; i < cat.blocks.length; i++) {
            var bDef = cat.blocks[i];
            var block = document.createElement('div');
            block.className = 'palette-block cat-' + activeCategory;
            block.setAttribute('data-block-type', bDef.type);
            block.setAttribute('draggable', 'true');
            block.innerHTML = '<span class="pb-icon">' + bDef.icon + '</span> ' + bDef.text;
            blockList.appendChild(block);
        }

	    if (cat.help) {
		    var helpDiv = document.createElement('div');
		    helpDiv.className = 'palette-help-hint';
		    helpDiv.textContent = cat.help;
		    blockList.appendChild(helpDiv);
	    }

	    // ✅ ADD THIS instead:
	    if (activeCategory === 'sensing' && modelLabels.length > 0) {
		    var hint = document.createElement('div');
		    hint.className = 'palette-sublabel';
		    hint.style.marginTop = '12px';
		    hint.style.fontSize = '0.68rem';
		    hint.style.color = '#a6adc8';
		    hint.style.lineHeight = '1.4';
		    hint.innerHTML = '💡 Dein Modell kennt: <strong>' + modelLabels.join(', ') + '</strong>';
		    blockList.appendChild(hint);
	    }


        palette.appendChild(blockList);
    }

    buildPalette();

    // ─── Event delegation for palette drag (fixes runtime drag issue) ───
    // Instead of attaching to each block, we use delegation on the palette
    palette.addEventListener('dragstart', function(e) {
        var block = e.target.closest('.palette-block');
        if (!block) return;
        draggedBlock = block;
        draggedFromWorkspace = false;
        if (trashZone) trashZone.classList.remove('visible');
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', block.getAttribute('data-block-type'));
    });

    palette.addEventListener('dragend', function(e) {
        draggedBlock = null;
        draggedFromWorkspace = false;
        workspace.classList.remove('drag-over');
    });

    // Double-click delegation on palette
    palette.addEventListener('dblclick', function(e) {
        var block = e.target.closest('.palette-block');
        if (!block) return;
        var type = block.getAttribute('data-block-type');

        // Validate placement
        var blocks = workspace.querySelectorAll('.workspace-block');
        if (blocks.length === 0 && (type === 'elif' || type === 'else' || type === 'end')) return;

        var newBlock = createWorkspaceBlock(type, {
            label: block.getAttribute('data-label')
        });
        workspace.appendChild(newBlock);
        syncBlocksToDSL();
        scrollWorkspaceToBottom();
    });

    // ─── Expose label update function ───────────────────────────────────
    window.updateBlockEditorLabels = function(labels) {
        modelLabels = labels || [];
        // Rebuild palette to show/hide labels
        buildPalette();
        // Refresh condition dropdowns in workspace
        var blocks = workspace.querySelectorAll('.workspace-block');
        for (var i = 0; i < blocks.length; i++) {
            var type = blocks[i].getAttribute('data-block-type');
            if (type === 'if' || type === 'elif' || type === 'while') {
                refreshConditionSelects(blocks[i]);
            }
        }
    };

    function getCompareValues() {
        var values = [
            { value: '"none"', label: '❌ nichts' },
            { value: '0', label: '0' },
            { value: '1', label: '1' },
            { value: '2', label: '2' }
        ];
        for (var i = 0; i < modelLabels.length; i++) {
            values.push({ value: '"' + modelLabels[i] + '"', label: '🏷️ ' + modelLabels[i] });
        }
        for (var i = 0; i < sensorVars.length; i++) {
            values.push(sensorVars[i]);
        }
        return values;
    }

    function refreshConditionSelects(block) {
        var selects = block.querySelectorAll('select.cond-value');
        var values = getCompareValues();
        for (var i = 0; i < selects.length; i++) {
            var currentVal = selects[i].value;
            selects[i].innerHTML = '';
            for (var j = 0; j < values.length; j++) {
                var opt = document.createElement('option');
                opt.value = values[j].value;
                opt.textContent = values[j].label;
                if (values[j].value === currentVal) opt.selected = true;
                selects[i].appendChild(opt);
            }
        }
    }

    // ─── Indentation calculation ────────────────────────────────────────
	function recalcIndentation() {
		var blocks = workspace.querySelectorAll('.workspace-block');
		var indent = 0;
		for (var i = 0; i < blocks.length; i++) {
			var type = blocks[i].getAttribute('data-block-type');

			if (type === 'elif' || type === 'else') {
				indent = Math.max(0, indent - 1);
			}

			blocks[i].setAttribute('data-indent', indent);
			blocks[i].style.marginLeft = (indent * 28) + 'px';

			if (type === 'if' || type === 'elif' || type === 'else' || type === 'while' || type === 'for') {
				indent++;
			}
		}
	}

    // ─── Snap validation ────────────────────────────────────────────────
	function canSnap(blockType, targetBlock, position) {
		if (!targetBlock) return true;

		var blocks = Array.from(workspace.querySelectorAll('.workspace-block'));
		var targetIdx = blocks.indexOf(targetBlock);

		if (blockType === 'elif' || blockType === 'else') {
			var aboveIdx = position === 'above' ? targetIdx - 1 : targetIdx;
			if (aboveIdx < 0) return false;
			var depth = 0;
			for (var i = aboveIdx; i >= 0; i--) {
				var t = blocks[i].getAttribute('data-block-type');
				if (t === 'if' && depth === 0) return true;
				if (t === 'elif' && depth === 0) return true;
				if (t === 'else' && depth === 0) return false;
				if (t === 'if') depth--;
			}
			return false;
		}

		return true;
	}

    // ─── Sync blocks to DSL code ────────────────────────────────────────
	function syncBlocksToDSL() {
		recalcIndentation();
		var blocks = workspace.querySelectorAll('.workspace-block');
		var lines = [];
		var indentStack = []; // track indent levels

		for (var i = 0; i < blocks.length; i++) {
			var code = getBlockCode(blocks[i]);
			if (code === null) continue;

			var currentIndent = parseInt(blocks[i].getAttribute('data-indent')) || 0;

			// Wenn die Einrückung sinkt, "end" einfügen
			while (indentStack.length > 0 && indentStack[indentStack.length - 1] >= currentIndent) {
				// Aber nicht vor elif/else — die gehören zum selben if-Block
				var type = blocks[i].getAttribute('data-block-type');
				if (type === 'elif' || type === 'else') break;
				lines.push('end');
				indentStack.pop();
			}

			lines.push(code);

			var type = blocks[i].getAttribute('data-block-type');
			if (type === 'if' || type === 'elif' || type === 'else' || type === 'while' || type === 'for') {
				indentStack.push(currentIndent);
			}
		}

		// Alle offenen Blöcke am Ende schließen
		while (indentStack.length > 0) {
			lines.push('end');
			indentStack.pop();
		}

		dslEditor.value = lines.join('\n');

		if (placeholder) {
			placeholder.style.display = blocks.length === 0 ? 'block' : 'none';
		}
	}

    function getBlockCode(block) {
        var type = block.getAttribute('data-block-type');
        var selects = block.querySelectorAll('select');
        var inputs = block.querySelectorAll('input.block-input');

        switch (type) {
            case 'get_left':     return 'links = leftmost_detection';
            case 'get_right':    return 'rechts = rightmost_detection';
            case 'get_count':    return 'anzahl = detection_count';
            case 'get_top':      return 'oben = topmost_detection';
            case 'get_bottom':   return 'unten = bottommost_detection';
            case 'get_largest':  return 'groesstes = largest_detection';
            case 'get_smallest': return 'kleinstes = smallest_detection';
            case 'get_best':     return 'bestes = highest_conf_detection';

            case 'if':
            case 'elif':
                var keyword = type === 'if' ? 'if' : 'elif';
                var condLeft = getSelectValue(selects, 0) || 'links';
                var condOp = getSelectValue(selects, 1) || '==';
                var condRight = getSelectValue(selects, 2) || '"none"';
                return keyword + ' ' + condLeft + ' ' + condOp + ' ' + condRight;

            case 'while':
                var wLeft = getSelectValue(selects, 0) || 'links';
                var wOp = getSelectValue(selects, 1) || '!=';
                var wRight = getSelectValue(selects, 2) || '"none"';
                return 'while ' + wLeft + ' ' + wOp + ' ' + wRight;

            case 'for':
                var forVar = getInputValue(inputs, 0) || 'i';
                var forEnd = getInputValue(inputs, 1) || '10';
                return 'for ' + forVar + ' in range(' + forEnd + ')';

            case 'else': return 'else';

            case 'print':
                return 'print ' + (getInputValue(inputs, 0) || '"Hallo!"');

            case 'show_text':
                var msg = getInputValue(inputs, 0) || '"Hallo!"';
                var style = getSelectByClass(block, 'style-select') || 'normal';
                return 'show_text ' + msg + ' ' + style;

            case 'set_var':
                var vname = getInputValue(inputs, 0) || 'x';
                var vval = getInputValue(inputs, 1) || '0';
                return vname + ' = ' + vval;

            case 'change_var':
                var cvname = getInputValue(inputs, 0) || 'punkte';
                var cvval = getInputValue(inputs, 1) || '1';
                return cvname + ' += ' + cvval;

            case 'label_value':
                return null; // label blocks are just for reference, not code

            default:
                return '# unknown: ' + type;
        }
    }

    function getSelectValue(selects, index) {
        return (selects && selects.length > index) ? selects[index].value : null;
    }

    function getInputValue(inputs, index) {
        return (inputs && inputs.length > index) ? inputs[index].value : null;
    }

    function getSelectByClass(block, className) {
        var el = block.querySelector('select.' + className);
        return el ? el.value : null;
    }

    // ─── Build select helper ────────────────────────────────────────────
    function buildSelect(options, selectedValue, className) {
        var select = document.createElement('select');
        select.className = 'block-select ' + (className || '');
        for (var i = 0; i < options.length; i++) {
            var opt = document.createElement('option');
            opt.value = options[i].value;
            opt.textContent = options[i].label;
            if (options[i].value === selectedValue) opt.selected = true;
            select.appendChild(opt);
        }
        return select;
    }

    // ─── Create workspace block ─────────────────────────────────────────
    function createWorkspaceBlock(type, data) {
        var block = document.createElement('div');
        block.className = 'workspace-block';
        block.setAttribute('data-block-type', type);
        block.setAttribute('draggable', 'true');

        var cat = getCategoryClass(type);
        if (cat) block.classList.add(cat);

        buildBlockDOM(block, type, data);

        // Delete button
        var delBtn = document.createElement('button');
        delBtn.className = 'block-delete';
        delBtn.textContent = '✕';
        delBtn.title = 'Block löschen';
        delBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            block.remove();
            syncBlocksToDSL();
        });
        block.appendChild(delBtn);

        // Input/select change listeners
        var elements = block.querySelectorAll('input, select');
        for (var i = 0; i < elements.length; i++) {
            elements[i].addEventListener('input', syncBlocksToDSL);
            elements[i].addEventListener('change', syncBlocksToDSL);
        }

        // Drag events for reordering within workspace
        block.addEventListener('dragstart', function(e) {
            draggedBlock = this;
            draggedFromWorkspace = true;
            this.classList.add('dragging');
            if (trashZone) trashZone.classList.add('visible');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', '');
        });

        block.addEventListener('dragend', function() {
            this.classList.remove('dragging');
            if (trashZone) trashZone.classList.remove('visible');
            clearDropIndicators();
            draggedBlock = null;
            draggedFromWorkspace = false;
        });

        block.addEventListener('dragover', function(e) {
            e.preventDefault();
            if (!draggedBlock || draggedBlock === this) return;

            var dragType = draggedBlock.getAttribute('data-block-type');
            var rect = this.getBoundingClientRect();
            var midY = rect.top + rect.height / 2;
            var position = e.clientY < midY ? 'above' : 'below';

            clearDropIndicators();

            if (canSnap(dragType, this, position)) {
                this.classList.add(position === 'above' ? 'drop-above' : 'drop-below');
            } else {
                this.classList.add('drop-invalid');
            }
        });

        block.addEventListener('dragleave', function() {
            this.classList.remove('drop-above', 'drop-below', 'drop-invalid');
        });

        block.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (!draggedBlock || draggedBlock === this) {
                clearDropIndicators();
                return;
            }

            var dragType = draggedBlock.getAttribute('data-block-type');
            var rect = this.getBoundingClientRect();
            var midY = rect.top + rect.height / 2;
            var position = e.clientY < midY ? 'above' : 'below';

            if (!canSnap(dragType, this, position)) {
                clearDropIndicators();
                shakeBlock(this);
                return;
            }

            var insertBlock;
            if (draggedFromWorkspace) {
                insertBlock = draggedBlock;
            } else {
                insertBlock = createWorkspaceBlock(
                    draggedBlock.getAttribute('data-block-type'),
                    { label: draggedBlock.getAttribute('data-label') }
                );
            }

            if (position === 'above') {
                workspace.insertBefore(insertBlock, this);
            } else {
                workspace.insertBefore(insertBlock, this.nextSibling);
            }

            clearDropIndicators();
            syncBlocksToDSL();
        });

        return block;
    }

    function shakeBlock(block) {
        block.classList.add('shake');
        setTimeout(function() { block.classList.remove('shake'); }, 400);
    }

	function getCategoryClass(type) {
		var map = {
			'get_left': 'cat-sensing', 'get_right': 'cat-sensing',
			'get_count': 'cat-sensing', 'get_top': 'cat-sensing',
			'get_bottom': 'cat-sensing', 'get_largest': 'cat-sensing',
			'get_smallest': 'cat-sensing', 'get_best': 'cat-sensing',
			'if': 'cat-control', 'elif': 'cat-control',
			'else': 'cat-control',
			'while': 'cat-control', 'for': 'cat-control',
			'print': 'cat-output', 'show_text': 'cat-display',
			'set_var': 'cat-variables', 'change_var': 'cat-variables',
			'label_value': 'cat-labels'
		};
		return map[type] || '';
	}


    // ─── Build block DOM ────────────────────────────────────────────────
    function buildBlockDOM(block, type, data) {
        var content = document.createElement('div');
        content.className = 'block-content';

        switch (type) {
            case 'get_left':
                content.innerHTML = '<span class="bi">🎯</span> <strong>links</strong> = was links ist';
                break;
            case 'get_right':
                content.innerHTML = '<span class="bi">🎯</span> <strong>rechts</strong> = was rechts ist';
                break;
            case 'get_count':
                content.innerHTML = '<span class="bi">🔢</span> <strong>anzahl</strong> = wie viele?';
                break;
            case 'get_top':
                content.innerHTML = '<span class="bi">🎯</span> <strong>oben</strong> = was oben ist';
                break;
            case 'get_bottom':
                content.innerHTML = '<span class="bi">🎯</span> <strong>unten</strong> = was unten ist';
                break;
            case 'get_largest':
                content.innerHTML = '<span class="bi">🎯</span> <strong>größtes</strong> = größte Erkennung';
                break;
            case 'get_smallest':
                content.innerHTML = '<span class="bi">🎯</span> <strong>kleinstes</strong> = kleinste';
                break;
            case 'get_best':
                content.innerHTML = '<span class="bi">🎯</span> <strong>bestes</strong> = sicherste';
                break;

		case 'if':
		case 'elif':
		    var keyword = type === 'if' ? 'wenn' : 'sonst wenn';
		    var icon = type === 'if' ? '🔶' : '🔷';
		    var condData = (data && data.condition) || {};

		    content.innerHTML = '<span class="bi">' + icon + '</span> <span class="bk">' + keyword + '</span> ';

		    // LEFT side: combo of select + free input
		    var leftVal = condData.left || 'links';
		    var leftOpts = sensorVars.slice();
		    var leftIsCustom = !leftOpts.some(function(o) { return o.value === leftVal; });
		    if (leftIsCustom) {
			leftOpts.unshift({ value: leftVal, label: '📝 ' + leftVal });
		    }
		    var leftSelect = buildSelect(leftOpts, leftVal, 'cond-left');
		    content.appendChild(leftSelect);

		    var opSelect = buildSelect(operators, condData.op || '==', 'cond-op');
		    content.appendChild(opSelect);

		    // RIGHT side: combo of select + free input
		    var rightVal = condData.right || '"none"';
		    var rightOpts = getCompareValues();
		    var rightIsCustom = !rightOpts.some(function(o) { return o.value === rightVal; });
		    if (rightIsCustom) {
			rightOpts.unshift({ value: rightVal, label: '📝 ' + rightVal });
		    }
		    var rightSelect = buildSelect(rightOpts, rightVal, 'cond-value');
		    content.appendChild(rightSelect);

		    var thenSpan = document.createElement('span');
		    thenSpan.className = 'bk';
		    thenSpan.textContent = ' dann';
		    content.appendChild(thenSpan);
		    break;

		case 'while':
		    var wCondData = (data && data.condition) || {};
		    content.innerHTML = '<span class="bi">🔁</span> <span class="bk">solange</span> ';

		    var wLeftVal = wCondData.left || 'links';
		    var wLeftOpts = sensorVars.slice();
		    var wLeftIsCustom = !wLeftOpts.some(function(o) { return o.value === wLeftVal; });
		    if (wLeftIsCustom) {
			wLeftOpts.unshift({ value: wLeftVal, label: '📝 ' + wLeftVal });
		    }
		    var wLeftSelect = buildSelect(wLeftOpts, wLeftVal, 'cond-left');
		    content.appendChild(wLeftSelect);

		    var wOpSelect = buildSelect(operators, wCondData.op || '!=', 'cond-op');
		    content.appendChild(wOpSelect);

		    var wRightVal = wCondData.right || '"none"';
		    var wRightOpts = getCompareValues();
		    var wRightIsCustom = !wRightOpts.some(function(o) { return o.value === wRightVal; });
		    if (wRightIsCustom) {
			wRightOpts.unshift({ value: wRightVal, label: '📝 ' + wRightVal });
		    }
		    var wRightSelect = buildSelect(wRightOpts, wRightVal, 'cond-value');
		    content.appendChild(wRightSelect);

		    var repeatSpan = document.createElement('span');
		    repeatSpan.className = 'bk';
		    repeatSpan.textContent = ' wiederhole';
		    content.appendChild(repeatSpan);
		    break;


            case 'for':
                content.innerHTML = '<span class="bi">🔄</span> <span class="bk">für</span> ';

                var forVarInput = document.createElement('input');
                forVarInput.type = 'text';
                forVarInput.className = 'block-input block-input-sm';
                forVarInput.value = (data && data.inputs && data.inputs[0]) || 'i';
                forVarInput.style.width = '30px';
                content.appendChild(forVarInput);

                var inSpan = document.createElement('span');
                inSpan.className = 'bk';
                inSpan.textContent = ' von 0 bis ';
                content.appendChild(inSpan);

                var forEndInput = document.createElement('input');
                forEndInput.type = 'text';
                forEndInput.className = 'block-input block-input-sm';
                forEndInput.value = (data && data.inputs && data.inputs[1]) || '10';
                forEndInput.style.width = '40px';
                content.appendChild(forEndInput);
                break;

            case 'else':
                content.innerHTML = '<span class="bi">⬜</span> <span class="bk">sonst</span>';
                break;

            case 'print':
                content.innerHTML = '<span class="bi">💬</span> <span class="bk">sag</span> ';
                var printInput = document.createElement('input');
                printInput.type = 'text';
                printInput.className = 'block-input';
                printInput.value = (data && data.inputs && data.inputs[0]) || '"Hallo!"';
                printInput.placeholder = 'Text oder Variable';
                printInput.style.width = '160px';
                content.appendChild(printInput);
                break;

            case 'show_text':
                content.innerHTML = '<span class="bi">📺</span> <span class="bk">zeige</span> ';
                var showInput = document.createElement('input');
                showInput.type = 'text';
                showInput.className = 'block-input';
                showInput.value = (data && data.inputs && data.inputs[0]) || '"Hallo!"';
                showInput.placeholder = 'Text oder Variable';
                showInput.style.width = '120px';
                content.appendChild(showInput);

                var styleOpts = [
                    { value: 'normal', label: '😐' },
                    { value: 'winner', label: '🎉' },
                    { value: 'loser', label: '😢' },
                    { value: 'draw', label: '🤝' }
                ];
                var styleSelect = buildSelect(styleOpts, (data && data.inputs && data.inputs[1]) || 'normal', 'style-select');
                content.appendChild(styleSelect);
                break;

            case 'set_var':
                content.innerHTML = '<span class="bi">📦</span> <span class="bk">setze</span> ';
                var vnameInput = document.createElement('input');
                vnameInput.type = 'text';
                vnameInput.className = 'block-input block-input-sm';
                vnameInput.value = (data && data.inputs && data.inputs[0]) || 'x';
                vnameInput.style.width = '60px';
                vnameInput.placeholder = 'Name';
                content.appendChild(vnameInput);

                var eqSpan = document.createElement('span');
                eqSpan.className = 'bk';
                eqSpan.textContent = ' = ';
                content.appendChild(eqSpan);

                var valInput = document.createElement('input');
                valInput.type = 'text';
                valInput.className = 'block-input';
                valInput.value = (data && data.inputs && data.inputs[1]) || '0';
                valInput.style.width = '80px';
                valInput.placeholder = 'Wert';
                content.appendChild(valInput);
                break;

             case 'change_var':
                content.innerHTML = '<span class="bi">➕</span> <span class="bk">ändere</span> ';
                var cvnameInput = document.createElement('input');
                cvnameInput.type = 'text';
                cvnameInput.className = 'block-input block-input-sm';
                cvnameInput.value = (data && data.inputs && data.inputs[0]) || 'punkte';
                cvnameInput.style.width = '60px';
                cvnameInput.placeholder = 'Name';
                content.appendChild(cvnameInput);

                var umSpan = document.createElement('span');
                umSpan.className = 'bk';
                umSpan.textContent = ' um ';
                content.appendChild(umSpan);

                var cvvalInput = document.createElement('input');
                cvvalInput.type = 'text';
                cvvalInput.className = 'block-input block-input-sm';
                cvvalInput.value = (data && data.inputs && data.inputs[1]) || '1';
                cvvalInput.style.width = '40px';
                cvvalInput.placeholder = '±';
                content.appendChild(cvvalInput);
                break;

            case 'label_value':
                var labelText = (data && data.label) || '???';
                content.innerHTML = '<span class="bi">🏷️</span> <strong>"' + labelText + '"</strong>';
                break;

            default:
                content.innerHTML = '<span class="bi">❓</span> Unbekannt';
        }

        block.appendChild(content);
    }

    // ─── Workspace drop zone (event delegation) ────────────────────────
    workspace.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (draggedBlock) {
            var dragType = draggedBlock.getAttribute('data-block-type');
            var blocks = workspace.querySelectorAll('.workspace-block');
            if (blocks.length === 0 || canSnap(dragType, null, 'below')) {
                workspace.classList.add('drag-over');
            }
        }
    });

    workspace.addEventListener('dragleave', function(e) {
        if (!workspace.contains(e.relatedTarget)) {
            workspace.classList.remove('drag-over');
        }
    });

    workspace.addEventListener('drop', function(e) {
        e.preventDefault();
        workspace.classList.remove('drag-over');

        if (!draggedBlock) return;

        var dragType = draggedBlock.getAttribute('data-block-type');

        // If dropped on empty space at bottom from workspace
        if (draggedFromWorkspace) {
            workspace.appendChild(draggedBlock);
            syncBlocksToDSL();
            scrollWorkspaceToBottom();
            return;
        }

        // Validate: elif/else/end can't be first block
        var blocks = workspace.querySelectorAll('.workspace-block');
        if (blocks.length === 0 && (dragType === 'elif' || dragType === 'else' || dragType === 'end')) {
            return;
        }

        // New block from palette
        var newBlock = createWorkspaceBlock(dragType, {
            label: draggedBlock.getAttribute('data-label')
        });
        workspace.appendChild(newBlock);
        syncBlocksToDSL();
        scrollWorkspaceToBottom();
    });

    // ─── Trash zone ─────────────────────────────────────────────────────
    if (trashZone) {
        trashZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            trashZone.classList.add('drag-over');
        });

        trashZone.addEventListener('dragleave', function() {
            trashZone.classList.remove('drag-over');
        });

        trashZone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            trashZone.classList.remove('drag-over');

            if (draggedBlock && draggedFromWorkspace) {
                draggedBlock.remove();
                syncBlocksToDSL();
            }

            draggedBlock = null;
            draggedFromWorkspace = false;
        });
    }

    // ─── Helpers ────────────────────────────────────────────────────────
    function clearDropIndicators() {
        var blocks = workspace.querySelectorAll('.workspace-block');
        for (var i = 0; i < blocks.length; i++) {
            blocks[i].classList.remove('drop-above', 'drop-below', 'drop-invalid');
        }
    }

    function scrollWorkspaceToBottom() {
        workspace.scrollTop = workspace.scrollHeight;
    }

    // ─── Load code string into visual blocks ────────────────────────────
    function loadCodeToBlocks(code) {
        // Clear workspace
        var existingBlocks = workspace.querySelectorAll('.workspace-block');
        for (var i = 0; i < existingBlocks.length; i++) {
            existingBlocks[i].remove();
        }

        var lines = code.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line === '' || line.startsWith('#')) continue;

            var blockInfo = lineToBlock(line);
            if (blockInfo) {
                var newBlock = createWorkspaceBlock(blockInfo.type, blockInfo.data);
                workspace.appendChild(newBlock);
            }
        }

        syncBlocksToDSL();
    }

    function lineToBlock(line) {
        // Sensing blocks
        if (line === 'links = leftmost_detection') return { type: 'get_left', data: {} };
        if (line === 'rechts = rightmost_detection') return { type: 'get_right', data: {} };
        if (line === 'anzahl = detection_count') return { type: 'get_count', data: {} };
        if (line === 'oben = topmost_detection') return { type: 'get_top', data: {} };
        if (line === 'unten = bottommost_detection') return { type: 'get_bottom', data: {} };
        if (line === 'groesstes = largest_detection') return { type: 'get_largest', data: {} };
        if (line === 'kleinstes = smallest_detection') return { type: 'get_smallest', data: {} };
        if (line === 'bestes = highest_conf_detection') return { type: 'get_best', data: {} };

        // Control flow
        if (line.startsWith('if ')) {
            var cond = parseConditionString(line.substring(3).trim());
            return { type: 'if', data: { condition: cond } };
        }
        if (line.startsWith('elif ')) {
            var cond = parseConditionString(line.substring(5).trim());
            return { type: 'elif', data: { condition: cond } };
        }
        if (line === 'else') return { type: 'else', data: {} };
	if (line === 'end') return null; // wird ignoriert, Einrückung reicht

        // While loop
        if (line.startsWith('while ')) {
            var cond = parseConditionString(line.substring(6).trim());
            return { type: 'while', data: { condition: cond } };
        }

        // For loop: for i in range(10)
        var forMatch = line.match(/^for\s+([a-zA-Z_]\w*)\s+in\s+range\((.+)\)$/);
        if (forMatch) {
            var rangeArgs = forMatch[2].split(',');
            var endVal = rangeArgs.length === 1 ? rangeArgs[0].trim() : rangeArgs[1].trim();
            return { type: 'for', data: { inputs: [forMatch[1], endVal] } };
        }

        // Show text
        if (line.startsWith('show_text ')) {
            var afterCmd = line.substring('show_text '.length).trim();
            var styles = ['normal', 'winner', 'loser', 'draw'];
            var style = 'normal';
            var message = afterCmd;

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
                }
            }
            return { type: 'show_text', data: { inputs: [message, style] } };
        }

        // Print
        if (line.startsWith('print ') || line.startsWith('print(')) {
            var arg = '';
            if (line.startsWith('print(')) {
                var depth = 0;
                for (var i = 5; i < line.length; i++) {
                    if (line[i] === '(') depth++;
                    else if (line[i] === ')') { depth--; if (depth === 0) { arg = line.substring(6, i); break; } }
                }
            } else {
                arg = line.substring(6).trim();
            }
            return { type: 'print', data: { inputs: [arg] } };
        }

        // Compound assignment: punkte += 1
        var compoundMatch = line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*(\+=|-=|\*=|\/=|%=)\s*(.+)$/);
        if (compoundMatch) {
            return { type: 'change_var', data: { inputs: [compoundMatch[1], compoundMatch[3].trim()] } };
        }

        // Variable assignment: x = 0
        var assignMatch = line.match(/^([a-zA-Z_\u00C0-\u024F][a-zA-Z0-9_\u00C0-\u024F]*)\s*=\s*(.+)$/);
        if (assignMatch) {
            return { type: 'set_var', data: { inputs: [assignMatch[1], assignMatch[2].trim()] } };
        }

        return null;
    }

    function parseConditionString(condStr) {
        condStr = condStr.trim();
        var ops = ['==', '!=', '>=', '<=', '>', '<'];
        for (var i = 0; i < ops.length; i++) {
            var op = ops[i];
            var idx = findOpInCondition(condStr, op);
            if (idx !== -1) {
                return {
                    left: condStr.substring(0, idx).trim(),
                    op: op,
                    right: condStr.substring(idx + op.length).trim()
                };
            }
        }
        return { left: condStr, op: '==', right: '"none"' };
    }

    function findOpInCondition(str, op) {
        var inStr = false, strChar = '';
        for (var i = 0; i <= str.length - op.length; i++) {
            var ch = str[i];
            if (!inStr && (ch === '"' || ch === "'")) { inStr = true; strChar = ch; }
            else if (inStr && ch === strChar) { inStr = false; }
            else if (!inStr && str.substring(i, i + op.length) === op) {
                if (op === '>' && i + 1 < str.length && str[i + 1] === '=') continue;
                if (op === '<' && i + 1 < str.length && str[i + 1] === '=') continue;
                if ((op === '=' || op === '==') && i > 0 && (str[i - 1] === '!' || str[i - 1] === '>' || str[i - 1] === '<')) continue;
                return i;
            }
        }
        return -1;
    }

    // ─── Expose globally ────────────────────────────────────────────────
    window.loadCodeToBlocks = loadCodeToBlocks;

    // ─── Initial sync ───────────────────────────────────────────────────
    syncBlocksToDSL();

})();
