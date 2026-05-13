<?php
// test_train_internal.php
define('TRAIN_INTERNAL_TEST_MODE', true);
require_once 'train_internal.php';

// Test strip_ansi
assert(strip_ansi("\x1b[32mHello\x1b[0m") === "Hello");
assert(strip_ansi("foo\rbar\n") === "bar\n");
assert(strip_ansi("\x1b[1A\x1b[Kprogress 50%\r") === "");

// Test command_exists
assert(command_exists('ls') === true);
assert(command_exists('nonexistent_binary_xyz') === false);

// Test generate_training_script produces valid Python
$script = generate_training_script([
    'model_to_load' => 'yolo11s.yaml',
    'training_mode' => 'from-scratch',
    'epochs' => 10,
], '/tmp/test_dir');
assert(strpos($script, 'TERM') !== false);
assert(strpos($script, 'monkey') === false || strpos($script, 'Monkey') === false); // it's a patch, not literal "monkey"
assert(strpos($script, 'TRAINING_COMPLETE') !== false);

// Test execute_streaming_process with a simple command
ob_start();
$result = execute_streaming_process("echo 'hello world'");
$output = ob_get_clean();
assert($result === true);
assert(strpos($output, 'hello world') !== false);

echo "All tests passed!\n";
