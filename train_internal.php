<?php
/**
 * train_internal.php — Local YOLO training with robust live streaming output.
 *
 * Supports three training modes:
 * - from_scratch: Train from a YOLO .yaml architecture definition
 * - fine_tune_pretrained: Download and fine-tune from pretrained COCO weights
 * - continue_training: Continue training from an existing .pt model (file or DB)
 *
 * Optional hyperparameters are passed through from the form.
 */

// ============================================================
// CONFIGURATION
// ============================================================

define('TRAINING_TIMEOUT_SECONDS', 600);
define('PROCESS_READ_CHUNK_SIZE', 8192);
define('PROCESS_POLL_INTERVAL_US', 50000); // 50ms
define('BROWSER_FLUSH_PADDING_BYTES', 4096);
define('MIN_PRETRAINED_MODEL_SIZE', 100000); // bytes
define('PRETRAINED_DOWNLOAD_BASE_URL', 'https://github.com/ultralytics/assets/releases/download/v8.4.0/');

// ============================================================
// BOOTSTRAP (only when not in test mode)
// ============================================================

if (!defined('TRAIN_INTERNAL_TEST_MODE')) {
    bootstrap_training();
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

function bootstrap_training(): void {
    if (!file_exists("allow_local_training")) {
        print("Local training not enabled");
        exit(0);
    }

    configure_php_for_streaming();
    send_streaming_headers();
    send_browser_flush_padding();

    include_once("functions.php");
    include_once("export_helper.php");

    ob_implicit_flush(true);

    run_training_pipeline($_POST, $_SERVER['REQUEST_METHOD']);
}

// ============================================================
// PHP / HTTP STREAMING CONFIGURATION
// ============================================================

function configure_php_for_streaming(): void {
    ini_set('output_buffering', '0');
    ini_set('implicit_flush', '1');
    ini_set('memory_limit', '-1');
    ini_set('max_execution_time', '0');
    set_time_limit(0);
    ini_set('zlib.output_compression', 'Off');

    while (ob_get_level() > 0) {
        ob_end_flush();
    }

    if (function_exists('apache_setenv')) {
        apache_setenv('no-gzip', '1');
    }
}

function send_streaming_headers(): void {
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    header('Pragma: no-cache');
    header('X-Accel-Buffering: no');
    header('Content-Encoding: none');
}

function send_browser_flush_padding(): void {
    echo str_repeat(" ", BROWSER_FLUSH_PADDING_BYTES) . "\n";
    flush();
}

// ============================================================
// OUTPUT HELPERS
// ============================================================

function strip_ansi(string $text): string {
    $text = preg_replace('/\x1b\[K/', '', $text);
    $text = preg_replace('/\x1b\[\d*[ABCDEFGHJKSTfn]/', '', $text);
    $text = preg_replace('/\x1b\[su/', '', $text);
    $text = preg_replace('/\x1b[78]/', '', $text);
    $text = preg_replace('/^.*\r(?!\n)/m', '', $text);
    $text = preg_replace('/\x1b\[[0-9;]*[A-Za-z]/', '', $text);
    $text = preg_replace('/\[([0-9;]*)[mKHJGsu]/', '', $text);
    $text = preg_replace('/\x1b\].*?(\x07|\x1b\\\\)/', '', $text);
    $text = preg_replace('/\n{3,}/', "\n\n", $text);
    return $text;
}

function output(string $text): void {
    $cleaned = strip_ansi($text);
    if ($cleaned === '') {
        return;
    }
    echo $cleaned;
    flush();
}

// ============================================================
// TRAINING PIPELINE
// ============================================================

function run_training_pipeline(array $post_data, string $request_method): void {
    if ($request_method !== 'POST') {
        output("❌ Error: Use the form button to start training.\n");
        exit;
    }

    $params = validate_and_extract_params($post_data);
    if ($params === null) {
        exit;
    }

    output("✔ Parameters: model={$params['model_to_load']}, epochs={$params['epochs']}, name={$params['model_name']}, mode={$params['training_mode']}\n");
    if ($params['training_mode'] === 'fine_tune_pretrained') {
        output("   🏋️ Fine-tuning from pretrained COCO weights\n");
    } elseif ($params['training_mode'] === 'continue_training') {
        output("   🔄 Continuing training from existing model\n");
    }

    // Show hyperparams if any were set
    if (!empty($params['hyperparams'])) {
        $hp_str = [];
        foreach ($params['hyperparams'] as $k => $v) {
            $hp_str[] = "$k=$v";
        }
        output("   Hyperparams: " . implode(', ', $hp_str) . "\n");
    }

    // --- Step 1: Generate the export ---
    output("\n📦 Step 1: Generating training data...\n");
    $dataset = prepare_dataset($params);
    if ($dataset === null) {
        exit;
    }

    // --- Step 2: Extract images from DB ---
    output("\n🖼️ Step 2: Extracting images from database...\n");
    $img_count = extract_images_to_disk($dataset['images'], $dataset['tmp_dir']);
    output("   ✔ Extracted $img_count images total.\n");

    // --- Step 3: Run YOLO training ---
    output("\n🏃 Step 3: Starting YOLO training ({$params['epochs']} epochs, model: {$params['model_to_load']}, mode: {$params['training_mode']})...\n");

    $training_success = run_yolo_training($params, $dataset);
    if (!$training_success) {
        output("Training failed.\n");
        exit;
    }

    output("\n✔ Training completed successfully!\n");

    // --- Step 4: Find best.pt and upload model ---
    output("\n💾 Step 4: Uploading trained model...\n");
    $upload_success = find_and_upload_model($params['model_name'], $dataset['tmp_dir']);
    if (!$upload_success) {
        exit;
    }

    // --- Cleanup ---
    output("\n🧹 Cleaning up temporary files...\n");
    system("rm -rf " . escapeshellarg($dataset['tmp_dir']));
    output("   Done.\n");

    output("\n🎂 All done! Model '{$params['model_name']}' is now available in the models list.\n");
}

// ============================================================
// PARAMETER VALIDATION
// ============================================================

function validate_and_extract_params(array $post_data): ?array {
    $epochs = intval($post_data['epochs'] ?? 50);
    $model_yaml = $post_data['model'] ?? 'yolo11s.yaml';
    $model_name = trim($post_data['model_name'] ?? 'auto_trained');
    $training_mode = $post_data['training_mode'] ?? 'from_scratch';
    $base_model = $post_data['base_model'] ?? '';

    // Determine the model to load based on training mode
    $model_to_load = '';

    switch ($training_mode) {
        case 'fine_tune_pretrained':
            // Download pretrained .pt from ultralytics
            $pt_filename = preg_replace('/\.yaml$/', '.pt', $model_yaml);
            $model_to_load = "/tmp/$pt_filename";
            if (!ensure_pretrained_model($model_to_load, $pt_filename)) {
                return null;
            }
            break;

        case 'continue_training':
            // Load from file system or DB
            if (empty($base_model)) {
                output("❌ Error: No base model selected for continue training.\n");
                return null;
            }
            $model_to_load = resolve_base_model($base_model);
            if ($model_to_load === null) {
                return null;
            }
            break;

        case 'from_scratch':
        default:
            $model_to_load = $model_yaml;
            $training_mode = 'from_scratch';
            break;
    }

    if (empty($model_name) || strtolower($model_name) === 'none') {
        output("❌ Error: Please provide a valid model name.\n");
        return null;
    }

    if (!get_number_of_annotated_imgs()) {
        output("❌ Error: No annotated images available for training.\n");
        return null;
    }

    // Extract optional hyperparameters (only include if non-empty)
    $hyperparams = [];
    $hyperparam_keys = [
        'batch', 'imgsz', 'lr0', 'lrf', 'momentum', 'weight_decay',
        'warmup_epochs', 'patience', 'hsv_h', 'hsv_s', 'hsv_v',
        'degrees', 'translate', 'scale', 'fliplr', 'mosaic', 'mixup', 'copy_paste'
    ];

    foreach ($hyperparam_keys as $key) {
        if (isset($post_data[$key]) && $post_data[$key] !== '') {
            $hyperparams[$key] = floatval($post_data[$key]);
        }
    }

    // Checkboxes (present = 1, absent = not set)
    if (isset($post_data['cos_lr'])) {
        $hyperparams['cos_lr'] = true;
    }
    if (isset($post_data['val'])) {
        $hyperparams['val'] = true;
    }

    return [
        'epochs' => $epochs,
        'model_yaml' => $model_yaml,
        'model_name' => $model_name,
        'model_to_load' => $model_to_load,
        'training_mode' => $training_mode,
        'base_model' => $base_model,
        'hyperparams' => $hyperparams,
    ];
}

/**
 * Resolve a base_model value (from the form) to an actual .pt file path.
 * Supports:
 *   - "file:models/something.pt" -> direct filesystem path
 *   - "db:<uuid>" -> extract model.pt from DB to a temp file
 */
function resolve_base_model(string $base_model): ?string {
    if (strpos($base_model, 'file:') === 0) {
        $path = substr($base_model, 5);
        if (!file_exists($path)) {
            output("❌ Error: Base model file not found: $path\n");
            return null;
        }
        output("   ✔ Using filesystem model: $path\n");
        return $path;
    }

    if (strpos($base_model, 'db:') === 0) {
        $uuid = substr($base_model, 3);
        // Extract model.pt from DB
        $query = "SELECT file_contents FROM models WHERE uuid = " . esc($uuid) . " AND filename = 'model.pt' LIMIT 1";
        $res = rquery($query);
        $row = mysqli_fetch_row($res);

        if (!$row || !$row[0]) {
            output("❌ Error: Could not find model.pt in database for UUID: $uuid\n");
            return null;
        }

        $tmp_pt = "/tmp/base_model_" . md5($uuid) . ".pt";
        file_put_contents($tmp_pt, $row[0]);

        if (!file_exists($tmp_pt) || filesize($tmp_pt) < MIN_PRETRAINED_MODEL_SIZE) {
            output("❌ Error: Extracted model file is too small or missing.\n");
            return null;
        }

        output("   ✔ Extracted model from DB (" . round(filesize($tmp_pt) / 1024 / 1024, 2) . " MB)\n");
        return $tmp_pt;
    }

    output("❌ Error: Unknown base model format: $base_model\n");
    return null;
}

function ensure_pretrained_model(string $model_path, string $pt_filename): bool {
    if (file_exists($model_path) && filesize($model_path) >= MIN_PRETRAINED_MODEL_SIZE) {
        output("   ✔ Pretrained model already cached at $model_path (" . round(filesize($model_path) / 1024 / 1024, 2) . " MB)\n");
        return true;
    }

    output("   ⬇️ Downloading pretrained model ($pt_filename) to $model_path...\n");
    $download_url = PRETRAINED_DOWNLOAD_BASE_URL . $pt_filename;
    $dl_cmd = "curl -L -o " . escapeshellarg($model_path) . " " . escapeshellarg($download_url) . " 2>&1";
    $dl_output = shell_exec($dl_cmd);

    if (!file_exists($model_path) || filesize($model_path) < MIN_PRETRAINED_MODEL_SIZE) {
        output("   ❌ Failed to download pretrained model.\n");
        output("   $dl_output\n");
        output("   You can manually download it and place it at $model_path\n");
        return false;
    }

    output("   ✔ Downloaded pretrained model (" . round(filesize($model_path) / 1024 / 1024, 2) . " MB)\n");
    return true;
}

// ============================================================
// DATASET PREPARATION
// ============================================================

function prepare_dataset(array $params): ?array {
    $_GET['epochs'] = $params['epochs'];
    $_GET['model'] = $params['model_to_load'];
    $_GET['validation_split'] = 0;
    $_GET['max_files'] = 0;
    $_GET['empty'] = 0;
    $_GET['group_by_perception_hash'] = 0;
    $_GET['only_curated'] = 0;
    $_GET['only_uncurated'] = 0;
    $_GET['max_truncation'] = 100;

    $images_and_data = get_annotated_images();
    $images = $images_and_data[0];
    $categories = $images_and_data[3];

    if (empty($images)) {
        output("❌ Error: No annotated images found.\n");
        return null;
    }

    output("   Found " . count($images) . " annotated images.\n");

    $tmp_dir = create_tmp_dir();
    output("   Working directory: $tmp_dir\n");

    // Build category mapping
    $category_numbers = [];
    $_labels = [];

    $cat_query = "SELECT id - 1, name FROM category ORDER BY id ASC";
    $cat_res = rquery($cat_query);
    while ($row = mysqli_fetch_row($cat_res)) {
        $db_id = intval($row[0]);
        $cat_name = strtolower($row[1]);
        $category_numbers[$cat_name] = $db_id;
    }

    // Build dataset.yaml
    $dataset_yaml = "path: $tmp_dir\n";
    $dataset_yaml .= "train: images/\n";
    $dataset_yaml .= "val: images/\n";
    $dataset_yaml .= "names:\n";

    foreach ($category_numbers as $cat => $db_id) {
        $dataset_yaml .= "  $db_id: $cat\n";
        $_labels[$db_id] = $cat;
    }

    mkdir("$tmp_dir/labels/", 0777, true);
    mkdir("$tmp_dir/images/", 0777, true);

    file_put_contents("$tmp_dir/dataset.yaml", $dataset_yaml);
    file_put_contents("$tmp_dir/labels.json", json_encode($_labels));

    output("   Created dataset.yaml with " . count($category_numbers) . " categories.\n");

    // Write label files
    foreach ($images as $fn => $img) {
        $fn_txt = preg_replace("/\.\w+$/", ".txt", $fn);
        $str_arr = [];
        foreach ($img as $single_anno) {
            $category_number = $category_numbers[$single_anno["category"]];
            $x_center = $single_anno["x_center"];
            $y_center = $single_anno["y_center"];
            $width_relative = $single_anno["w_rel"];
            $height_relative = $single_anno["h_rel"];
            $str_arr[] = "$category_number $x_center $y_center $width_relative $height_relative";
        }
        file_put_contents("$tmp_dir/labels/$fn_txt", join("\n", array_unique($str_arr)) . "\n");
    }

    output("   Written " . count($images) . " label files.\n");

    return [
        'images' => $images,
        'categories' => $categories,
        'category_numbers' => $category_numbers,
        'tmp_dir' => $tmp_dir,
    ];
}

// ============================================================
// IMAGE EXTRACTION
// ============================================================

function extract_images_to_disk(array $images, string $tmp_dir): int {
    $img_count = 0;
    foreach ($images as $fn => $img) {
        $query = "SELECT image_content FROM image_data WHERE filename = " . esc($fn) . " LIMIT 1";
        $res = rquery($query);
        $row = mysqli_fetch_row($res);
        if ($row && $row[0]) {
            file_put_contents("$tmp_dir/images/$fn", $row[0]);
            $img_count++;
            if ($img_count % 50 == 0) {
                output("   Extracted $img_count images...\n");
            }
        }
    }
    return $img_count;
}

// ============================================================
// YOLO TRAINING EXECUTION
// ============================================================

function verify_ultralytics(): bool {
    $check_output = [];
    exec("python3 -c \"from ultralytics import YOLO; print('ok')\" 2>&1", $check_output, $check_exit);
    if ($check_exit !== 0) {
        output("   ❌ ultralytics not importable: " . implode("\n", $check_output) . "\n");
        output("Training aborted.\n");
        return false;
    }
    output("   ✔ ultralytics available.\n");
    return true;
}

function generate_training_script(array $params, string $tmp_dir): string {
    $model_to_load = $params['model_to_load'];
    $training_mode = $params['training_mode'];
    $epochs = $params['epochs'];
    $imgsz = $GLOBALS["imgsz"] ?? 800;
    $hyperparams = $params['hyperparams'] ?? [];

    // Build hyperparameter overrides for the train() call
    $hp_batch = isset($hyperparams['batch']) ? intval($hyperparams['batch']) : 4;
    $hp_imgsz = isset($hyperparams['imgsz']) ? intval($hyperparams['imgsz']) : $imgsz;
    $hp_lr0 = isset($hyperparams['lr0']) ? $hyperparams['lr0'] : 0.01;
    $hp_lrf = isset($hyperparams['lrf']) ? $hyperparams['lrf'] : 0.01;
    $hp_momentum = isset($hyperparams['momentum']) ? $hyperparams['momentum'] : 0.937;
    $hp_weight_decay = isset($hyperparams['weight_decay']) ? $hyperparams['weight_decay'] : 0.0005;
    $hp_warmup_epochs = isset($hyperparams['warmup_epochs']) ? $hyperparams['warmup_epochs'] : 0;
    $hp_patience = isset($hyperparams['patience']) ? intval($hyperparams['patience']) : 0;
    $hp_cos_lr = isset($hyperparams['cos_lr']) ? 'True' : 'False';
    $hp_val = isset($hyperparams['val']) ? 'True' : 'False';

    // Augmentation
    $hp_hsv_h = isset($hyperparams['hsv_h']) ? $hyperparams['hsv_h'] : 0.0;
    $hp_hsv_s = isset($hyperparams['hsv_s']) ? $hyperparams['hsv_s'] : 0.0;
    $hp_hsv_v = isset($hyperparams['hsv_v']) ? $hyperparams['hsv_v'] : 0.0;
    $hp_degrees = isset($hyperparams['degrees']) ? $hyperparams['degrees'] : 0.0;
    $hp_translate = isset($hyperparams['translate']) ? $hyperparams['translate'] : 0.0;
    $hp_scale = isset($hyperparams['scale']) ? $hyperparams['scale'] : 0.0;
    $hp_fliplr = isset($hyperparams['fliplr']) ? $hyperparams['fliplr'] : 0.0;
    $hp_mosaic = isset($hyperparams['mosaic']) ? $hyperparams['mosaic'] : 0.0;
    $hp_mixup = isset($hyperparams['mixup']) ? $hyperparams['mixup'] : 0.0;
    $hp_copy_paste = isset($hyperparams['copy_paste']) ? $hyperparams['copy_paste'] : 0.0;

    return <<<PYTHON
import os, sys

sys.stdout.reconfigure(line_buffering=True)
sys.stderr.reconfigure(line_buffering=True)

os.environ["TERM"] = "dumb"
os.environ["NO_COLOR"] = "1"
os.environ["COLUMNS"] = "300"
os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["MPLCONFIGDIR"] = "/tmp/matplotlib_config"
os.environ["YOLO_CONFIG_DIR"] = "/tmp/Ultralytics"
os.environ["HOME"] = "/tmp"

os.makedirs("/tmp/matplotlib_config", exist_ok=True)

try:
    import rich.console
    import rich.progress
    import rich.status

    class _PlainConsole(rich.console.Console):
        def __init__(self, *args, **kwargs):
            kwargs["no_color"] = True
            kwargs["highlight"] = False
            kwargs["force_terminal"] = False
            kwargs["force_jupyter"] = False
            super().__init__(*args, **kwargs)

        def print(self, *args, **kwargs):
            import builtins
            parts = []
            for a in args:
                parts.append(str(a))
            builtins.print(" ".join(parts), flush=True)

        def log(self, *args, **kwargs):
            self.print(*args)

        def status(self, *args, **kwargs):
            class _FakeStatus:
                def __enter__(self): return self
                def __exit__(self, *a): pass
                def update(self, *a): pass
                def start(self): pass
                def stop(self): pass
            return _FakeStatus()

    rich.console.Console = _PlainConsole

    class _FakeProgress:
        def __init__(self, *args, **kwargs): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def add_task(self, *a, **kw): return 0
        def update(self, *a, **kw): pass
        def start(self): pass
        def stop(self): pass

    rich.progress.Progress = _FakeProgress

except ImportError:
    pass

from ultralytics import YOLO

print("Loading model: $model_to_load (mode: $training_mode)", flush=True)
model = YOLO("$model_to_load")

print("Image size: $hp_imgsz", flush=True)
print("Starting training...", flush=True)

results = model.train(
    data="$tmp_dir/dataset.yaml",
    epochs=$epochs,
    batch=$hp_batch,
    imgsz=$hp_imgsz,
    project="$tmp_dir/runs",
    name="train",
    device="cpu",
    workers=2,
    verbose=True,
    lr0=$hp_lr0,
    lrf=$hp_lrf,
    momentum=$hp_momentum,
    weight_decay=$hp_weight_decay,
    warmup_epochs=$hp_warmup_epochs,
    patience=$hp_patience,
    cos_lr=$hp_cos_lr,
    val=$hp_val,
    augment=False,
    hsv_h=$hp_hsv_h,
    hsv_s=$hp_hsv_s,
    hsv_v=$hp_hsv_v,
    degrees=$hp_degrees,
    translate=$hp_translate,
    scale=$hp_scale,
    fliplr=$hp_fliplr,
    flipud=0.0,
    mosaic=$hp_mosaic,
    mixup=$hp_mixup,
    copy_paste=$hp_copy_paste,
    conf=0.1,
    freeze=None,
)

print("TRAINING_COMPLETE", flush=True)
PYTHON;
}

function build_training_command(string $train_script_path): string {
    $env_vars = implode(' ', [
        'PYTHONUNBUFFERED=1',
        'TERM=dumb',
        'NO_COLOR=1',
        'COLUMNS=300',
        'MPLCONFIGDIR=/tmp/matplotlib_config',
        'HOME=/tmp',
        'YOLO_CONFIG_DIR=/tmp/Ultralytics',
    ]);

    $python_cmd = "env $env_vars python3 " . escapeshellarg($train_script_path);

    if (command_exists('script')) {
        $inner_cmd = "stdbuf -oL -eL $python_cmd";
        $cmd = "script -qefc " . escapeshellarg($inner_cmd) . " /dev/null 2>&1";
    } elseif (command_exists('stdbuf')) {
        $cmd = "stdbuf -oL -eL $python_cmd 2>&1";
    } else {
        $cmd = "$python_cmd 2>&1";
    }

    return $cmd;
}

function command_exists(string $command): bool {
    $result = shell_exec("which " . escapeshellarg($command) . " 2>/dev/null");
    return !empty(trim($result ?? ''));
}

function run_yolo_training(array $params, array $dataset): bool {
    if (!verify_ultralytics()) {
        return false;
    }

    $tmp_dir = $dataset['tmp_dir'];
    $imgsz = $params['hyperparams']['imgsz'] ?? $GLOBALS["imgsz"] ?? 800;

    output("   Image size: $imgsz\n");

    $train_script = generate_training_script($params, $tmp_dir);
    $train_script_path = "$tmp_dir/train.py";
    file_put_contents($train_script_path, $train_script);

    $train_cmd = build_training_command($train_script_path);
    output("   Command: $train_cmd\n\n");

    return execute_streaming_process($train_cmd);
}

function execute_streaming_process(string $command): bool {
    $descriptorspec = [
        0 => ["pipe", "r"],
        1 => ["pipe", "w"],
        2 => ["pipe", "w"],
    ];

    $process = proc_open($command, $descriptorspec, $pipes);

    if (!is_resource($process)) {
        output("❌ Error: Could not start training process.\n");
        return false;
    }

    fclose($pipes[0]);

    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $last_output_time = time();

    while (true) {
        $status = proc_get_status($process);

        $stdout_chunk = fread($pipes[1], PROCESS_READ_CHUNK_SIZE);
        $stderr_chunk = fread($pipes[2], PROCESS_READ_CHUNK_SIZE);

        if ($stdout_chunk !== false && $stdout_chunk !== "") {
            output($stdout_chunk);
            $last_output_time = time();
        }

        if ($stderr_chunk !== false && $stderr_chunk !== "") {
            output($stderr_chunk);
            $last_output_time = time();
        }

        if (!$status['running']) {
            do {
                $r1 = fread($pipes[1], PROCESS_READ_CHUNK_SIZE);
                $r2 = fread($pipes[2], PROCESS_READ_CHUNK_SIZE);
                if ($r1) output($r1);
                if ($r2) output($r2);
            } while ($r1 || $r2);
            flush();
            break;
        }

        if ((time() - $last_output_time) > TRAINING_TIMEOUT_SECONDS) {
            output("\n⚠️ No output for " . TRAINING_TIMEOUT_SECONDS . "s, killing process...\n");
            proc_terminate($process);
            break;
        }

        usleep(PROCESS_POLL_INTERVAL_US);
    }

    fclose($pipes[1]);
    fclose($pipes[2]);
    $exit_code = proc_close($process);

    if ($exit_code !== 0) {
        output("\n❌ Training failed with exit code $exit_code\n");
        return false;
    }

    return true;
}

// ============================================================
// MODEL UPLOAD
// ============================================================

function find_and_upload_model(string $model_name, string $tmp_dir): bool {
    $best_pt = find_best_pt($tmp_dir);

    if (!$best_pt) {
        output("   ❌ Could not find best.pt in training output.\n");
        system("find " . escapeshellarg("$tmp_dir/runs") . " -type f 2>&1");
        output("\nTraining output missing.\n");
        return false;
    }

    output("   Found model: $best_pt (" . round(filesize($best_pt) / 1024 / 1024, 2) . " MB)\n");

    try {
        $files_array = [$best_pt];
        $pt_file_path = $best_pt;
        $pt_file = "best.pt";

        output("   Converting to TFJS and inserting into database...\n");

        insert_model_into_db($model_name, $files_array, $pt_file_path, $pt_file, false);

        output("\n✅ Model '$model_name' successfully trained and uploaded!\n");
        return true;
    } catch (\Throwable $e) {
        output("\n❌ Error uploading model: " . $e->getMessage() . "\n");
        return false;
    }
}

function find_best_pt(string $tmp_dir): ?string {
    $search_paths = [
        "$tmp_dir/runs/train/weights/best.pt",
        "$tmp_dir/runs/detect/train/weights/best.pt",
    ];

    foreach ($search_paths as $path) {
        if (file_exists($path)) {
            return $path;
        }
    }

    $find_result = trim(shell_exec("find " . escapeshellarg($tmp_dir) . " -name 'best.pt' -type f 2>/dev/null | head -1") ?? '');
    if ($find_result && file_exists($find_result)) {
        return $find_result;
    }

    return null;
}
?>
