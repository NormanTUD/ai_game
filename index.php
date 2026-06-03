<?php
    $GLOBALS["no_home"] = 1;
    include("header.php");
    include_once("functions.php");
    $available_models = get_list_of_models();
?>

<link rel="stylesheet" href="game_editor.css">

<div id="game_editor_page">

<!-- 🌟 MASCOT & WELCOME -->
<div id="welcome_hero">
    <div class="mascot-container">
        <div id="mascot">🤖</div>
        <div class="speech-bubble" id="mascot_speech">
            <strong>Hi! Ich bin Robi!</strong><br>
            Lass uns zusammen ein Spiel bauen! 🎮✨
        </div>
    </div>
</div>

<!-- 🎯 STEP-BY-STEP WIZARD (shows only on first visit) -->
<div id="setup_wizard" class="wizard-visible">
    <div class="wizard-steps">
        <div class="wizard-step active" data-step="1">
            <div class="step-number">1</div>
            <div class="step-icon">🤖</div>
            <div class="step-label">KI wählen</div>
        </div>
        <div class="wizard-connector"></div>
        <div class="wizard-step" data-step="2">
            <div class="step-number">2</div>
            <div class="step-icon">🎮</div>
            <div class="step-label">Spiel wählen oder bauen</div>
        </div>
        <div class="wizard-connector"></div>
        <div class="wizard-step" data-step="3">
            <div class="step-number">3</div>
            <div class="step-icon">🚀</div>
            <div class="step-label">Spielen!</div>
        </div>
    </div>
</div>

<!-- ⚡ SIMPLIFIED TOP BAR — Only essentials visible -->
<div class="topbar-controls">
    <div class="topbar-item topbar-model">
        <label>🤖 Meine KI:</label>
        <select id="game_model_select" class="big-select">
            <option value="none">👆 Wähle deine KI!</option>
            <?php foreach ($available_models as $_model): ?>
                <option value="<?php echo htmlspecialchars($_model[1]); ?>">
                    <?php echo htmlspecialchars($_model[0]); ?>
                </option>
            <?php endforeach; ?>
        </select>
    </div>
    <div class="topbar-item topbar-camera" style="display:none;" id="camera_selector_wrapper">
        <label>📷</label>
        <select id="game_camera_select">
            <option value="">Kameras werden geladen...</option>
        </select>
    </div>
    <div class="topbar-item" style="display:none;">
        <input type="number" id="game_fps" min="1" max="10" value="3">
    </div>
    <div class="topbar-item" id="model_labels_info" style="display:none;">
        <span id="model_labels_chips"></span>
    </div>
</div>

<!-- Main layout -->
<div id="game_editor_container" class="always-visible">

    <!-- Left: Block Editor -->
    <div id="editor_panel">
        <div class="panel-header">
            <h3>🧩 Mein Programm</h3>
            <div class="editor-actions">
                <button id="btn_show_examples_small" title="Beispiele">🎮 Spiele-Galerie</button>
                <button id="btn_undo" title="Rückgängig">↩️</button>
                <button id="btn_clear_workspace" title="Alles löschen">🗑</button>
            </div>
        </div>
        <div id="visual_editor_wrapper">
            <!-- Palette: generated entirely by JS now (compact tabs) -->
            <div id="block_palette"></div>

            <!-- Workspace -->
            <div id="block_workspace">
                <div id="workspace_placeholder">
                    <span class="big-arrow">🎮</span>
                    <strong>Hier baust du dein Programm!</strong><br><br>
                    <span class="placeholder-hint">
                        ⬅️ Ziehe Blöcke von links hierher<br>
                        oder klicke auf <strong>🎮 Spiele-Galerie</strong>
                    </span>
                </div>
            </div>

            <!-- Trash zone -->
            <div id="trash_zone">🗑️</div>
        </div>
    </div>

    <!-- Right: Camera + Output -->
    <div id="preview_panel">
        <div class="preview-card cam-card">
            <div id="game_webcam_container">
                <video id="game_video" autoplay playsinline muted></video>
                <canvas id="game_overlay_canvas"></canvas>
                <div id="game_text_overlay"></div>
                <div id="cam_placeholder">
                    <span>📷</span>
                    <p>Wähle oben eine KI – dann geht's los!</p>
                    <div class="cam-placeholder-animation">
                        <span>👆</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 🏆 SCORE DISPLAY (always visible during game) -->
        <div id="score_display" style="display:none;">
            <div class="score-item">
                <span class="score-label">⭐ Punkte</span>
                <span class="score-value" id="score_points">0</span>
            </div>
            <div class="score-item">
                <span class="score-label">🏆 Rekord</span>
                <span class="score-value" id="score_record">0</span>
            </div>
        </div>

        <div class="preview-card output-card">
            <h3>📋 Was passiert?</h3>
            <div id="game_output">🎮 Willkommen auf deinem KI-Spielplatz!

👋 So einfach geht's:
1️⃣ Wähle oben eine KI aus
3️⃣ Halte Dinge vor die Kamera – und spiele!

💡 Tipp: Probiere die Spiele-Galerie aus!
</div>
            <button id="btn_clear_output" class="small-btn" title="Löschen">🗑 Leeren</button>
        </div>

        <div id="game_status">Status: Wähle oben eine KI zum Starten 👆</div>
    </div>
</div>

<!-- Hidden textarea for interpreter -->
<textarea id="dsl_editor" style="display:none;"></textarea>

<!-- 🎮 EXAMPLE GALLERY MODAL (redesigned) -->
<div id="example_gallery_modal">
    <div id="example_gallery_box">
        <div class="gallery-header">
            <h2>🎮 Wähle ein Spiel!</h2>
            <p class="gallery-subtitle">Tippe auf ein Spiel um es zu laden. Du kannst es danach verändern!</p>
        </div>
        <div id="example_cards_container"></div>
        <button class="gallery-close" onclick="document.getElementById('example_gallery_modal').classList.remove('visible'); playSound('pop');">
            ✕ Schließen
        </button>
    </div>
</div>

<!-- Code preview modal -->
<div id="code_preview_modal">
    <div id="code_preview_box">
        <h3>📝 Dein Programm-Code</h3>
        <pre id="code_preview_content"></pre>
        <button onclick="document.getElementById('code_preview_modal').classList.remove('visible');">Schließen ✕</button>
    </div>
</div>

<!-- 🎉 ACHIEVEMENT POPUP -->
<div id="achievement_popup" class="hidden">
    <div class="achievement-content">
        <span class="achievement-icon">🏆</span>
        <span class="achievement-text">Super gemacht!</span>
    </div>
</div>

<!-- 💡 TOOLTIP SYSTEM -->
<div id="floating_tooltip" class="hidden"></div>

<!-- 🔄 FULLSCREEN LOADING OVERLAY -->
<div id="loading_overlay" class="loading-overlay hidden">
    <div class="loading-content">
        <div class="loading-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-icon">🤖</div>
        </div>
        <h2 class="loading-title">KI wird geladen...</h2>
        <p class="loading-subtitle">Einen Moment bitte! Dein Modell wird vorbereitet.</p>
        <div class="loading-progress">
            <div class="loading-bar"></div>
        </div>
    </div>
</div>

</div>

<!-- Audio elements for sound effects -->
<audio id="sfx_success" preload="auto">
    <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==" type="audio/wav">
</audio>

<script src="celebrations.js"></script>
<script src="kid_helpers.js"></script>
<script src="visual_blocks.js"></script>
<script src="game_editor_engine.js"></script>

<script>
$(document).ready(function() {
    setTimeout(function() {
        var $select = $('#game_model_select');
        var $validOptions = $select.find('option:not([value="none"])');

        // Fall A: Es existiert EXAKT ein Modell
        if ($validOptions.length === 1) {
            var exactValue = $validOptions.val();
            
            // Modell auswählen und Event nativ feuern
            $select.val(exactValue);
            var nativeSelectElement = $select[0];
            if (nativeSelectElement) {
                nativeSelectElement.dispatchEvent(new Event('change', { bubbles: true }));
            }
            
            // UI Controls anpassen
            $("#camera_selector_wrapper, #confidence_wrapper").show();
            $(".topbar-model").hide();

            // ─── WIZARD ANPASSUNG FÜR 1 MODELL ───
            // 1. Verstecke Schritt 1 und den ersten Connector
            var $step1 = $('.wizard-step[data-step="1"]');
            $step1.hide();
            $step1.next('.wizard-connector').hide();
            
            // 2. Entferne altes "active" und nummeriere sichtbare Schritte neu
            $('.wizard-step').removeClass('active');
            
            $('.wizard-step:visible').each(function(index) {
                // Setze die neue Nummer (1, 2, etc.)
                $(this).find('.step-number').text(index + 1);
                
                // Der neue erste sichtbare Schritt wird aktiv
                if (index === 0) {
                    $(this).addClass('active');
                }
            });
        } 
        // Fall B: Es gibt MULTIPLE Modelle (oder keines)
        else {
            $(".topbar-model").show();
            $select.val("none");
            
            var nativeSelectElement = $select[0];
            if (nativeSelectElement) {
                nativeSelectElement.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // ─── WIZARD BACKUP (Sicherheits-Reset für mehrere Modelle) ───
            var $step1 = $('.wizard-step[data-step="1"]');
            $step1.show();
            $step1.next('.wizard-connector').show();
            
            $('.wizard-step').each(function() {
                var originalStep = $(this).attr('data-step');
                $(this).find('.step-number').text(originalStep);
                if(originalStep === "1") {
                    $(this).addClass('active');
                } else {
                    $(this).removeClass('active');
                }
            });
        }
    }, 50);
});
</script>

<?php include_once("footer.php"); ?>
