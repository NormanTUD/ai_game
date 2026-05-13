// ═══════════════════════════════════════════════════════════════════════════
// 🌟 KID HELPERS — Onboarding, Sound, Mascot, Achievements, Accessibility
// ═══════════════════════════════════════════════════════════════════════════

(function() {
    "use strict";

    // ─── Sound System ───────────────────────────────────────────────────
    var soundEnabled = true;
    var audioCtx = null;

    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    window.playSound = function(type) {
        if (!soundEnabled) return;
        try {
            var ctx = getAudioContext();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            switch (type) {
                case 'pop':
                    osc.frequency.setValueAtTime(600, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.1);
                    break;

                case 'success':
                    osc.frequency.setValueAtTime(523, ctx.currentTime);
                    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
                    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
                    gain.gain.setValueAtTime(0.3, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.4);
                    break;

                case 'win':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(440, ctx.currentTime);
                    osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
                    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
                    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
                    gain.gain.setValueAtTime(0.2, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.5);
                    break;

                case 'drop':
                    osc.frequency.setValueAtTime(300, ctx.currentTime);
                    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.2, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.15);
                    break;

                case 'click':
                    osc.frequency.setValueAtTime(800, ctx.currentTime);
                    gain.gain.setValueAtTime(0.15, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.05);
                    break;

                case 'error':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(200, ctx.currentTime);
                    osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
                    gain.gain.setValueAtTime(0.2, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
                    osc.start(ctx.currentTime);
                    osc.stop(ctx.currentTime + 0.2);
                    break;
            }
        } catch (e) {
            // Audio not supported, silently fail
        }
    };

    // Sound toggle button
    var btnSound = document.getElementById('btn_sound_toggle');
    if (btnSound) {
        btnSound.addEventListener('click', function() {
            soundEnabled = !soundEnabled;
            this.textContent = soundEnabled ? '🔊' : '🔇';
            this.title = soundEnabled ? 'Töne aus' : 'Töne an';
            playSound('click');
        });
    }

    // ─── Mascot System ──────────────────────────────────────────────────
    var mascotMessages = {
        welcome: [
            "Hi! Ich bin Robi! 🤖 Lass uns spielen!",
            "Willkommen zurück! 🎉 Was bauen wir heute?",
            "Hey! Bereit für ein Abenteuer? 🚀"
        ],
        modelSelected: [
            "Super! 🎉 Deine KI ist bereit!",
            "Toll! Jetzt wähle ein Spiel! 🎮",
            "Perfekt! Die Kamera startet gleich! 📷"
        ],
        gameLoaded: [
            "Los geht's! Halte Dinge vor die Kamera! 🎯",
            "Spiel geladen! Viel Spaß! 🎮✨",
            "Bereit? Zeige der Kamera was du hast! 💪"
        ],
        blockAdded: [
            "Gut gemacht! 👏",
            "Super Block! Weiter so! ⭐",
            "Du bist ein Programmier-Profi! 🧑‍💻"
        ],
        error: [
            "Ups! Kein Problem, versuch's nochmal! 💪",
            "Hmm, das hat nicht geklappt. Probier was anderes! 🤔",
            "Fehler passieren! Du schaffst das! 🌟"
        ],
        idle: [
            "Brauchst du Hilfe? Klick auf 🎮 Spiele-Galerie!",
            "Tipp: Ziehe Blöcke von links in die Mitte! ⬅️",
            "Probier mal ein Beispiel-Spiel aus! 🎲"
        ]
    };

    var mascotEl = document.getElementById('mascot');
    var speechEl = document.getElementById('mascot_speech');
    var mascotIdleTimer = null;

    function showMascotMessage(category) {
        if (!speechEl) return;
        var messages = mascotMessages[category] || mascotMessages.welcome;
        var msg = messages[Math.floor(Math.random() * messages.length)];
        speechEl.innerHTML = msg;
        speechEl.classList.add('visible');

        // Animate mascot
        if (mascotEl) {
            mascotEl.classList.add('bounce');
            setTimeout(function() { mascotEl.classList.remove('bounce'); }, 600);
        }

        // Reset idle timer
        resetIdleTimer();
    }

    function resetIdleTimer() {
        if (mascotIdleTimer) clearTimeout(mascotIdleTimer);
        mascotIdleTimer = setTimeout(function() {
            showMascotMessage('idle');
        }, 30000); // Show idle tip after 30 seconds of inactivity
    }

    window.showMascotMessage = showMascotMessage;

    // ─── Achievement System ─────────────────────────────────────────────
    var achievements = {
        first_model: { icon: '🤖', text: 'Erste KI geladen!', earned: false },
        first_game: { icon: '🎮', text: 'Erstes Spiel gestartet!', earned: false },
        first_block: { icon: '🧩', text: 'Erster Block platziert!', earned: false },
        five_blocks: { icon: '🏗️', text: '5 Blöcke gebaut!', earned: false },
        first_detection: { icon: '👁️', text: 'Erstes Objekt erkannt!', earned: false },
        high_score: { icon: '🏆', text: 'Neuer Rekord!', earned: false }
    };

    // Load saved achievements
    try {
        var saved = localStorage.getItem('ki_spielplatz_achievements');
        if (saved) {
            var parsed = JSON.parse(saved);
            for (var key in parsed) {
                if (achievements[key]) achievements[key].earned = parsed[key];
            }
        }
    } catch (e) {}

    window.earnAchievement = function(id) {
        if (!achievements[id] || achievements[id].earned) return;
        achievements[id].earned = true;

        // Save
        try {
            var toSave = {};
            for (var key in achievements) toSave[key] = achievements[key].earned;
            localStorage.setItem('ki_spielplatz_achievements', JSON.stringify(toSave));
        } catch (e) {}

        // Show popup
        var popup = document.getElementById('achievement_popup');
        if (popup) {
            popup.querySelector('.achievement-icon').textContent = achievements[id].icon;
            popup.querySelector('.achievement-text').textContent = achievements[id].text;
            popup.classList.remove('hidden');
            popup.classList.add('visible');
            playSound('win');

            setTimeout(function() {
                popup.classList.remove('visible');
                popup.classList.add('hidden');
            }, 3000);
        }
    };

    // ─── Wizard / Onboarding ────────────────────────────────────────────
    var wizardEl = document.getElementById('setup_wizard');
    var quickPlayBar = document.getElementById('quick_play_bar');

    function advanceWizard(step) {
        if (!wizardEl) return;
        var steps = wizardEl.querySelectorAll('.wizard-step');
        for (var i = 0; i < steps.length; i++) {
            var stepNum = parseInt(steps[i].getAttribute('data-step'));
            steps[i].classList.toggle('active', stepNum === step);
            steps[i].classList.toggle('completed', stepNum < step);
        }
    }

    window.advanceWizard = advanceWizard;

    // ─── Model select enhancement ──────────────────────────────────────
    var modelSelect = document.getElementById('game_model_select');
    if (modelSelect) {
        modelSelect.addEventListener('change', function() {
            if (this.value !== 'none') {
                advanceWizard(2);
                showMascotMessage('modelSelected');
                earnAchievement('first_model');
                playSound('success');

                // Show quick play bar
                if (quickPlayBar) quickPlayBar.style.display = 'flex';

                // Show advanced controls
                var camWrapper = document.getElementById('camera_selector_wrapper');
                var confWrapper = document.getElementById('confidence_wrapper');
                if (camWrapper) camWrapper.style.display = 'flex';
                if (confWrapper) confWrapper.style.display = 'flex';
            } else {
                advanceWizard(1);
                if (quickPlayBar) quickPlayBar.style.display = 'none';
            }
        });
    }

    // ─── Quick Play Button ──────────────────────────────────────────────
    var btnQuickPlay = document.getElementById('btn_quick_play');
    if (btnQuickPlay) {
        btnQuickPlay.addEventListener('click', function() {
            advanceWizard(3);
            showMascotMessage('gameLoaded');
            earnAchievement('first_game');
            playSound('success');

            // If no code loaded, load the first example
            var dslEditor = document.getElementById('dsl_editor');
            if (!dslEditor.value || dslEditor.value.trim() === '') {
                // Trigger example gallery
                var btnExamples = document.getElementById('btn_show_examples');
                if (btnExamples) btnExamples.click();
            }
        });
    }

    // ─── Placeholder button ─────────────────────────────────────────────
    var btnPlaceholderExamples = document.getElementById('btn_placeholder_examples');
    if (btnPlaceholderExamples) {
        btnPlaceholderExamples.addEventListener('click', function() {
            var btnExamples = document.getElementById('btn_show_examples');
            if (btnExamples) btnExamples.click();
            playSound('click');
        });
    }

    // ─── Undo System (simple) ───────────────────────────────────────────
    var undoStack = [];
    var maxUndo = 20;

    window.pushUndo = function() {
        var dslEditor = document.getElementById('dsl_editor');
        if (dslEditor) {
            undoStack.push(dslEditor.value);
            if (undoStack.length > maxUndo) undoStack.shift();
        }
    };

    var btnUndo = document.getElementById('btn_undo');
    if (btnUndo) {
        btnUndo.addEventListener('click', function() {
            if (undoStack.length === 0) {
                playSound('error');
                return;
            }
            var prev = undoStack.pop();
            if (typeof window.loadCodeToBlocks === 'function') {
                window.loadCodeToBlocks(prev);
            }
            playSound('pop');
        });
    }

    // ─── Clear workspace button ─────────────────────────────────────────
    var btnClearWorkspace = document.getElementById('btn_clear_workspace');
    if (btnClearWorkspace) {
        btnClearWorkspace.addEventListener('click', function() {
            if (confirm('🗑️ Wirklich alles löschen?')) {
                window.pushUndo();
                if (typeof window.loadCodeToBlocks === 'function') {
                    window.loadCodeToBlocks('');
                }
                playSound('drop');
            }
        });
    }

    // ─── Track block additions for achievements ─────────────────────────
    var blockObserver = new MutationObserver(function(mutations) {
        for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes.length > 0) {
                var workspace = document.getElementById('block_workspace');
                if (workspace) {
                    var blocks = workspace.querySelectorAll('.workspace-block');
                    if (blocks.length >= 1) earnAchievement('first_block');
                    if (blocks.length >= 5) earnAchievement('five_blocks');
                }
                playSound('pop');
                showMascotMessage('blockAdded');
                window.pushUndo();
                resetIdleTimer();
            }
        }
    });

    var workspace = document.getElementById('block_workspace');
    if (workspace) {
        blockObserver.observe(workspace, { childList: true });
    }

    // ─── Keyboard shortcuts ─────────────────────────────────────────────
    document.addEventListener('keydown', function(e) {
        // Ctrl+Z = Undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
            e.preventDefault();
            if (btnUndo) btnUndo.click();
        }
    });

    // ─── Touch support improvements ─────────────────────────────────────
    // Make palette blocks work with touch (tap to add)
    var palette = document.getElementById('block_palette');
    if (palette) {
        palette.addEventListener('touchend', function(e) {
            var block = e.target.closest('.palette-block');
            if (block) {
                e.preventDefault();
                // Simulate double-click (add to workspace)
                var dblClick = new MouseEvent('dblclick', { bubbles: true });
                block.dispatchEvent(dblClick);
                playSound('pop');
            }
        });
    }

    // ─── Auto-hide wizard after game starts ─────────────────────────────
    window.addEventListener('gameStarted', function() {
        if (wizardEl) {
            wizardEl.style.opacity = '0';
            setTimeout(function() { wizardEl.style.display = 'none'; }, 500);
        }
    });

    // ─── Initial mascot greeting ────────────────────────────────────────
    setTimeout(function() {
        showMascotMessage('welcome');
    }, 500);

    // Start idle timer
    resetIdleTimer();

    // Track user activity
    document.addEventListener('click', resetIdleTimer);
    document.addEventListener('touchstart', resetIdleTimer);

})();
