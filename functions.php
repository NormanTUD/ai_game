<?php
	$GLOBALS["imgsz"] = 800;

	// alle warnings als fatal errors ausgeben
	function exception_error_handler($errno, $errstr, $errfile, $errline ) {
	    throw new ErrorException($errstr, $errno, 0, $errfile, $errline);
	}
	set_error_handler("exception_error_handler");
	ini_set('display_errors', '1');

	$GLOBALS["get_current_tags_cache"] = array();
	$GLOBALS["queries"] = array();
	$GLOBALS["db_name"] = "annotate";
	$GLOBALS['db_host'] = 'localhost';

	if (file_exists("/etc/dbhost")) {
		$line = trim(explode("\n", file_get_contents("/etc/dbhost"), 2)[0]);
		if ($line !== "") {
			$GLOBALS["db_host"] = $line;
		}
	}

	$GLOBALS["db_port"] = 3306;
	$GLOBALS['db_username'] = "root";

	if(file_exists("/etc/dbuser")) {
		$GLOBALS["db_username"] = trim(fgets(fopen("/etc/dbuser", 'r')));
	}

	if(file_exists("/etc/dbhost")) {
		$GLOBALS["db_host"] = trim(fgets(fopen("/etc/dbhost", 'r')));
	}

	if(file_exists("/etc/dbport")) {
		$GLOBALS["db_port"] = trim(fgets(fopen("/etc/dbport", 'r')));
	}

	if(file_exists("/etc/dbpw")) {
		$GLOBALS["db_password"] = trim(fgets(fopen("/etc/dbpw", 'r')));
	} else {
		die("<tt>/etc/dbpw</tt> not found! Cannot connect to database without.");
	}

	if(!$GLOBALS["db_port"]) {
		die("db_port could not be determined");
	}

	if(!$GLOBALS["db_password"]) {
		die("db_password could not be determined");
	}

	if(!$GLOBALS["db_name"]) {
		die("db_name could not be determined");
	}

	if(!$GLOBALS["db_username"]) {
		die("db_username could not be determined");
	}

	if(!$GLOBALS["db_host"]) {
		die("db_host could not be determined");
	}

	function create_tables() {
		$handle = fopen("sql.txt", "r");
		if ($handle) {
			while (($line = fgets($handle)) !== false) {
				if(!preg_match("/^\s*$/", $line)) {
					rquery($line);
				}
			}

			fclose($handle);
		}
	}

	function safe_mysqli_connect($host, $user, $pass, $db = null, $port = 3306) {
		set_error_handler(function($errno, $errstr) {
			throw new Exception($errstr, $errno);
		});

		try {
			try {
				// Normal connection attempt (with DB)
				$conn = mysqli_connect($host, $user, $pass, $db, $port);
				if (!$conn) {
					throw new Exception(mysqli_connect_error(), mysqli_connect_errno());
				}
				return $conn;

			} catch (Throwable $e) {

				// If no DB name -> nothing to create -> rethrow
				if (!$db) {
					throw $e;
				}

				// Only create DB if the problem is "Unknown database"
				$msg = $e->getMessage();
				if (stripos($msg, 'Unknown database') === false) {
					throw $e;
				}

				// Connect without database to create it
				$tmp = mysqli_connect($host, $user, $pass, "", $port);
				if (!$tmp) {
					throw new Exception("Cannot connect without DB: ".mysqli_connect_error(), mysqli_connect_errno());
				}

				// Create database
				$sql = "CREATE DATABASE IF NOT EXISTS `" . $db . "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";
				if (!mysqli_query($tmp, $sql)) {
					throw new Exception("Failed to create database `$db`: ".mysqli_error($tmp));
				}

				mysqli_close($tmp);

				// Try again WITH the database
				$conn2 = mysqli_connect($host, $user, $pass, $db, $port);
				if (!$conn2) {
					throw new Exception("Database `$db` created but reconnect failed: ".mysqli_connect_error(), mysqli_connect_errno());
				}

				return $conn2;
			}

		} finally {
			restore_error_handler();
		}
	}

	function ping_db($host, $port, $timeout = 5, $retries = 5, $delay_sec = 1) {
		for ($i = 0; $i < $retries; $i++) {
			$prev_handler = set_error_handler(function($errno, $errstr, $errfile, $errline) {
				// swallow warnings while we probe the socket
				return true;
			});

			$fp = @fsockopen($host, $port, $errno, $errstr, $timeout);

			restore_error_handler(); // stellt den vorherigen Handler wieder her

			if ($fp) {
				fclose($fp);
				return true;
			}

			error_log(sprintf(
				"Connection attempt %d to %s:%s failed: %s (%s)",
				$i + 1, $host, $port, $errstr ?? 'n/a', $errno ?? 'n/a'
			));
			sleep($delay_sec);
		}

		error_log("Could not connect to $host:$port after $retries attempts");
		return false;
	}

	function verify_mysqli_connection($conn) {
		if (!$conn instanceof mysqli) return false;
		if ($conn->connect_errno) return false;

		try {
			// Minimaler Check, der ping ersetzt
			$result = $conn->query("SELECT 1");
			return $result !== false;
		} catch (Throwable $e) {
			return false;
		}
	}

	function verify_pdo_connection($pdo) {
		if (!$pdo instanceof PDO) return false;

		try {
			$stmt = $pdo->query("SELECT 1");
			return $stmt !== false;
		} catch (Throwable $e) {
			return false;
		}
	}

	function create_pdo($host, $db, $user, $pass) {
		$dsn = "mysql:host={$host};dbname={$db}";
		return new PDO($dsn, $user, $pass, [
			PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
			PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
			PDO::ATTR_PERSISTENT => false,
		]);
	}

	function safe_connect_attempt($with_db = true) {
		$host = $GLOBALS['db_host'];
		$user = $GLOBALS['db_username'];
		$pass = $GLOBALS['db_password'];
		$db   = $GLOBALS['db_name'];
		$port = $GLOBALS['db_port'];

		$db_for_mysqli = $with_db ? $db : null;

		$mysqli = safe_mysqli_connect($host, $user, $pass, $db_for_mysqli, $port);
		$pdo    = null;

		if ($with_db) {
			$pdo = create_pdo($host, $db, $user, $pass);
		} else {
			// DB existiert evtl. nicht → ohne db verbinden
			$pdo = new PDO(
				"mysql:host={$host}",
				$user,
				$pass,
				[PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
			);
		}

		// Verifikation
		if (!verify_mysqli_connection($mysqli)) {
			throw new RuntimeException("MySQLi connection invalid after connect.");
		}
		if (!verify_pdo_connection($pdo)) {
			throw new RuntimeException("PDO connection invalid after connect.");
		}

		$GLOBALS['dbh'] = $mysqli;
		$GLOBALS['pdo'] = $pdo;
		return true;
	}

	function try_connect($retries = 5) {
		for ($i = 0; $i < $retries; $i++) {
			try {
				safe_connect_attempt(true);
				return true;
			} catch (Throwable $e) {
				error_log("Connect attempt $i failed: ".$e->getMessage());
				sleep(2);
			}
		}

		sleep(3);

		try {
			safe_connect_attempt(false);
			create_tables();

			if (!verify_pdo_connection($GLOBALS['pdo']) || !verify_mysqli_connection($GLOBALS['dbh'])) {
				throw new RuntimeException("Connections became invalid after table creation.");
			}

			return true;
		} catch (Throwable $e) {
			echo "Final attempt failed.<br>";

			$pingable = ping_db($GLOBALS['db_host'], $GLOBALS['db_port']) ? "Yes" : "No";
			echo "Host pingable? <tt>$pingable</tt><br>";

			echo "Error:<pre>".$e->getMessage()."</pre>";
			return false;
		}
	}

	function force_reconnect() {
		if ($GLOBALS['pdo']) { $GLOBALS['pdo'] = null; }
		if ($GLOBALS['dbh']) { @$GLOBALS['dbh']->close(); }

		try_connect();
	}

	if (!try_connect()) {
		die("Failed to connect to MySQL after retries.");
	}

	create_tables();

	function generateRandomString($length = 10) {
		$characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
		$charactersLength = strlen($characters);
		$randomString = '';
		for ($i = 0; $i < $length; $i++) {
			$randomString .= $characters[rand(0, $charactersLength - 1)];
		}
		return $randomString;
	}

	$user_id = hash("sha256", $_SERVER['REMOTE_ADDR'] ?? generateRandomString(100));
	if(array_key_exists("annotate_userid", $_COOKIE) && preg_match("/^([a-f0-9]{64})$/", $_COOKIE["annotate_userid"])) {
		$user_id = $_COOKIE["annotate_userid"];
	} else {
		setcookie("annotate_userid", $user_id);
	}

	function dier($msg) {
		print "<pre>";
		print_r($msg);
		print "</pre>";

		print "<pre>";
		debug_print_backtrace();
		print "</pre>";

		exit(1);
	}

	function shuffle_assoc($my_array) {
		$keys = array_keys($my_array);

		shuffle($keys);

		foreach($keys as $key) {
			$new[$key] = $my_array[$key];
		}

		$my_array = $new;

		return $my_array;
	}

	function get_number_of_not_completetly_imported () {
		$q = "select count(*) from image i left join image_data id on id.filename = i.filename where id.filename is null";
		$r = rquery($q);

		$res = null;

		while ($row = mysqli_fetch_row($r)) {
			$res = $row[0];
		}

		return $res;
	}

	function get_number_of_unidentifiable_imgs() {
		$q = "select count(*) from image where unidentifiable = 1";
		$r = rquery($q);

		$res = null;

		while ($row = mysqli_fetch_row($r)) {
			$res = $row[0];
		}

		return $res;
	}

	function get_number_of_offtopic_imgs () {
		$q = "select count(*) from image where offtopic = 1";
		$r = rquery($q);

		$res = null;

		while ($row = mysqli_fetch_row($r)) {
			$res = $row[0];
		}

		return $res;
	}

	function get_number_of_curated_imgs () {
		$q = "select count(*) from (select id from image where id in (select image_id from annotation where deleted = 0 and curated = 1) and deleted = 0) a";
		$r = rquery($q);

		$res = null;

		while ($row = mysqli_fetch_row($r)) {
			$res = $row[0];
		}

		return $res;
	}

	function get_number_of_unannotated_imgs() {
		$q = "select count(*) from image i left join annotation a on i.id = a.image_id where a.id is null and i.perception_hash is not null and i.deleted = 0 and i.offtopic = 0 and i.unidentifiable = 0";

		$r = rquery($q);

		$res = null;

		while ($row = mysqli_fetch_row($r)) {
			$res = $row[0];
		}

		return $res;
	}

	function get_number_of_annotated_imgs() {
		$q = 'select count(*) from (select image_id from annotation where image_id in (select id from image where deleted = "0" and offtopic = "0" and perception_hash is not null) group by image_id) a';
		$r = rquery($q);

		$res = null;

		while ($row = mysqli_fetch_row($r)) {
			$res = $row[0];
		}

		return $res;
	}

	function get_home_string () {
		if(isset($GLOBALS["no_home"])) {
			return;
		}
		$annotated_imgs = get_number_of_annotated_imgs();
		$unannotated_imgs = get_number_of_unannotated_imgs();
		$curated_imgs = get_number_of_curated_imgs();
		$offtopic_imgs = get_number_of_offtopic_imgs();
		$unidentifiable_imgs = get_number_of_unidentifiable_imgs();
		$not_completely_imported = get_number_of_not_completetly_imported();

		$annotation_stat_str = number_format($annotated_imgs, 0, ',', '.');
		$unannotated_imgs_str = number_format($unannotated_imgs, 0, ',', '.');
		$curated_imgs_str = number_format($curated_imgs, 0, ',', '.');
		$offtopic_imgs_str = number_format($offtopic_imgs, 0, ',', '.');
		$not_completely_imported_str = number_format($not_completely_imported, 0, ',', '.');
		$unidentifiable_imgs_str = number_format($unidentifiable_imgs, 0, ',', '.');

		$str = "Annotated: ".htmlentities($annotation_stat_str ?? "");
		if($not_completely_imported != 0) {
			$str .= ", not yet completely imported: ".htmlentities($not_completely_imported_str ?? "");
		}

		if($curated_imgs) {
			$str .= ", curated: ".htmlentities($curated_imgs_str ?? "");
		}

		if($unannotated_imgs) {
			$str .= ", unannotated: ".htmlentities($unannotated_imgs_str ?? "");
		}

		if($offtopic_imgs) {
			$str .= ", offtopic: ".htmlentities($offtopic_imgs_str ?? "");
		}

		if($unidentifiable_imgs) {
			$str .= ", not identifiable: ".htmlentities($unidentifiable_imgs_str ?? "");
		}

		$curated_percent = 0;
		if($annotated_imgs) {
			$curated_percent = ($curated_imgs / $annotated_imgs) * 100;
		}
		if($curated_percent) {
			$curated_percent = number_format($curated_percent, 3, ',', '.');
		}

		if($unannotated_imgs != 0) {
			$annotated_nr = $annotated_imgs / ($annotated_imgs + $unannotated_imgs) * 100;
			$annotated_str = $annotated_nr;
			if($annotated_nr) {
				$annotated_str = sprintf("%.2f", $annotated_nr);
			}
		
			if($curated_percent) {
				$str .= " (".htmlentities($annotated_str)."% annotated, of which $curated_percent% are curated)";
			} else {
				$str .= " (".htmlentities($annotated_str)."% annotated)";
			}
		}

		$export_gui = "";
		$overview = "";

		$total = $annotated_imgs + $unannotated_imgs;
		$percent = $total > 0 ? ($annotated_imgs / $total) * 100 : 0;

		$str .= "<div style='margin:4px 0'>
			<progress value='$annotated_imgs' max='$total' style='width:300px;height:20px'></progress>
			<span>" . sprintf("%.1f", $percent) . "%</span>
			</div>";

		if(get_number_of_annotated_imgs() > 0) {
			$export_gui = '<a href="export_annotations_gui.php">Export annotations</a>';
			$overview = "<a href='overview.php'>Overview</a>";
		}

		$str .= "
		    <nav class='main-nav'>
			<a href='index.php'>Home</a>
			<a href='webcam.php'>Webcam</a>
			<a href='models.php'>Models</a>
			<a href='upload.php'>Upload Images</a>
			<a href='batch_upload.php'>Batch Import</a>
			$overview	
			$export_gui
		    </nav>
		";

		return $str;
	}


	function get_current_tags ($only_uncurated=0, $group_by_perception_hash=0) {
		$annos = [];

		$query = "select name, cnt from (select c.name, count(*) as cnt from annotation a left join category c on c.id = a.category_id left join image i on a.image_id = i.id where i.deleted = 0 and a.deleted = 0 ";
		if($only_uncurated) {
			$query .= " and a.curated is null ";
		}
		$query .= " group by c.id order by cnt desc, c.name asc) a";
		$res = rquery($query);

		while ($row = mysqli_fetch_row($res)) {
			$annos[$row[0]] = $row[1];
		}

		return $annos;
	}

	function get_json_cached ($path) {
		$tmp_dir = "tmp/__json_cache__/";
		$mtime = filemtime($path);

		$cache_file = md5($path.$mtime);

		$cache_path = "$tmp_dir$cache_file";

		$cache_key = hash("sha256", $cache_path);

		$data = json_decode(file_get_contents($path), true);
		return $data;


		/*
		if(!is_dir($tmp_dir)) {
			mkdir($tmp_dir);
		}

		$data = array();


		if(file_exists($cache_path)) {
			$data = unserialize(file_get_contents($cache_path));
		} else {
			$data = json_decode(file_get_contents($path), true);
			file_put_contents($cache_path, serialize($data));
		}

		return $data;
		 */
	}

	function mywarn ($msg) {
		file_put_contents('php://stderr', $msg);
	}

	function get_get ($name, $default = null) {
		if(isset($_GET[$name])) {
			return $_GET[$name];
		}
		return $default;
	}

	function rquery($query) {
		$start = start_query_timer();
		$result = execute_query($query);
		$duration = end_query_timer($start);
		log_query_execution($query, $duration);
		return $result;
	}

	function start_query_timer() {
		return microtime(true);
	}

	function end_query_timer($start) {
		return microtime(true) - $start;
	}

	function execute_query($query) {
		try {
			$res = mysqli_query($GLOBALS['dbh'], $query);

			if (!$res) {
				handle_query_error($query);
			}
			return $res;
		} catch (\Exception $e) {
			dier("Failed executing query >".htmlentities(trim($query))."<");
		}
	}

	function handle_query_error($query) {
		dier(array(
			"query" => $query,
			"error" => mysqli_error($GLOBALS['dbh'])
		));
	}

	function log_query_execution($query, $duration) {
		$GLOBALS["queries"][] = array(
			"query" => $query,
			"time"  => $duration
		);
	}

	function my_mysqli_real_escape_string ($arg) {
		return mysqli_real_escape_string($GLOBALS['dbh'], $arg ?? "");
	}

	function esc ($parameter) { 
		if(!is_array($parameter)) { // Kein array
			if(isset($parameter) && strlen($parameter)) {
				return '"'.mysqli_real_escape_string($GLOBALS['dbh'], $parameter).'"';
			} else {
				return 'NULL';
			}
		} else { // Array
			$str = join(', ', array_map("esc", array_map('my_mysqli_real_escape_string', $parameter)));
			return $str;
		}
	}


	function get_or_create_category_id ($category) {
		$category = ltrim(rtrim($category));
		$select_query = "select id from category where name = ".esc($category);		
		$select_res = rquery($select_query);

		$res = null;

		while ($row = mysqli_fetch_row($select_res)) {
			$res = $row[0];
		}

		if(is_null($res)) {
			$insert_query = "insert into category (name) values (".esc($category).") on duplicate key update name = values(name)";
			rquery($insert_query);
			return get_or_create_category_id($category);
		} else {
			return $res;
		}
	}

	function parse_simple_yaml_names($yaml_content) {
		$lines = preg_split('/\R/', $yaml_content);
		$inside_names = false;
		$names = [];

		foreach ($lines as $line) {
			$trim = ltrim($line);

			if ($trim === '' || str_starts_with($trim, '#')) {
				continue;
			}

			if (!$inside_names) {
				if (preg_match('/^names\s*:/', $trim)) {
					$inside_names = true;
				}
				continue;
			}

			if (!preg_match('/^\s+(\d+)\s*:\s*(.+)$/u', $line, $m)) {
				// names-block endet, falls neue Section
				if (preg_match('/^\S/', $line)) {
					break;
				}
				continue;
			}

			$index = intval($m[1]);
			$label = trim($m[2]);
			$names[$index] = $label;
		}

		return ['names' => $names];
	}

	function insert_model_labels_from_yaml($yaml_path, $model_uuid) {
		echo "Loading YAML: $yaml_path\n";
		$yaml_content = file_get_contents($yaml_path);
		if ($yaml_content === false) {
			echo "ERROR: Could not read YAML file.\n";
			throw new Exception("File read error");
		}

		echo "Parsing YAML...\n";
		$data = parse_simple_yaml_names($yaml_content);
		if (!isset($data['names']) || !is_array($data['names'])) {
			echo "ERROR: No 'names' array found in YAML.\n";
			throw new Exception("No 'names' block");
		}

		// Resolve uuid to model_id + model_name
		$res = rquery("SELECT id, model_name FROM models WHERE uuid=" . esc($model_uuid) . " LIMIT 1");
		if (!$res || mysqli_num_rows($res) === 0) {
			throw new Exception("Model UUID not found in models table");
		}
		$row = mysqli_fetch_assoc($res);
		$model_id = intval($row['id']);
		$model_name = $row['model_name'];

		echo "Found ".count($data['names'])." labels in YAML.\n";

		// Build ordered labels array from the YAML names block
		$ordered_labels = [];

		foreach ($data['names'] as $index => $label_name) {
			$label_name = trim($label_name);
			$ordered_labels[intval($index)] = $label_name;

			$check_query = "SELECT id FROM model_labels 
				WHERE model_id=" . $model_id . " 
				AND label_index=" . intval($index);

			$res = rquery($check_query);
			if (!$res) {
				echo "ERROR: Query failed.\n";
			}

			if (mysqli_num_rows($res) === 0) {
				echo " → Inserting label '$label_name'\n";
				$insert_query = "INSERT INTO model_labels (model_id, label_index, label_name) VALUES (" .
					$model_id . ", " .
					intval($index) . ", " .
					esc($label_name) . ")";
				rquery($insert_query);
			} else {
				echo " → Already exists. Skipping.\n";
			}
		}

		// Generate labels.json from the YAML names and insert into DB
		ksort($ordered_labels);
		$labels_json = json_encode(array_values($ordered_labels), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

		$check = rquery("SELECT id FROM models WHERE uuid=" . esc($model_uuid) . " AND filename='labels.json'");
		if (mysqli_num_rows($check) === 0) {
			$labels_tmp = tempnam(sys_get_temp_dir(), 'labels_') . '.json';
			file_put_contents($labels_tmp, $labels_json);
			insert_file_into_db($model_name, $labels_tmp, $model_uuid, 'labels.json');
			unlink($labels_tmp);
			echo "→ Generated labels.json from metadata.yaml (" . count($ordered_labels) . " labels)\n";
		}

		echo "✅ Done importing model\n";
	}

	function get_or_create_user_id ($user) {
		$select_query = "select id from user where name = ".esc($user);		
		$select_res = rquery($select_query);

		$res = null;

		while ($row = mysqli_fetch_row($select_res)) {
			$res = $row[0];
		}

		#die($select_query);

		if(is_null($res)) {
			$insert_query = "insert into user (name) values (".esc($user).") on duplicate key update name = values(name)";
			rquery($insert_query);
			return get_or_create_user_id($user);
		} else {
			return $res;
		}
	}

	function get_image_width_and_height_from_file ($path) {
		$width = null;
		$height = null;
		try {
			$imgsz = getimagesize($path);

			$width = $imgsz[0];
			$height = $imgsz[1];

			try {
				$exif = @exif_read_data("images/$file");
			} catch (\Throwable $e) {
				//;
			}

			if(isset($exif["Orientation"]) && $exif['Orientation'] == 6) {
				list($width, $height) = array($width, $height);
			}
		} catch (\Throwable $e) {
			mywarn("$e for file $path inside get_image_width_and_height_from_file");
		}
		return array($width, $height);
	}

	function get_image_id ($image) {
		$select_query = "select id from image where filename = ".esc($image);		
		$select_res = rquery($select_query);

		$res = null;

		while ($row = mysqli_fetch_row($select_res)) {
			$res = $row[0];
		}

		return $res;
	}

	function get_perception_hash_from_db ($filename) {
		$query = "select perception_hash from image where filename = ".esc($filename);
		$res = rquery($query);

		while ($row = mysqli_fetch_row($res)) {
			return $row[0];
		}

		return "";
	}

	function get_or_create_perception_hash_from_db ($path, $filename) {
		$old_perception_hash = get_perception_hash_from_db($filename);

		$new_perception_hash = $old_perception_hash;

		if($old_perception_hash == "") {
			$new_perception_hash = get_perception_hash($path);
		}

		$query = "update image set perception_hash = ".esc($new_perception_hash)." where filename = ".esc($filename);
		$res = rquery($query);

		if(!$res) {
			dier("Error setting perception hash");
			return "";
		}

		return $new_perception_hash;
	}

	function get_perception_hash ($path) {
		$command = 'bash get_hash '.$path;

		ob_start();
		system($command);
		$hash = ob_get_clean();
		try {
			ob_flush();
		} catch (\Throwable $e) {
			
		}

		$hash = trim($hash);

		return $hash;
	}

	function get_or_create_image_id ($path, $filename, $perception_hash=null, $width=null, $height=null, $rec=0) {
		if($rec >= 10) {
			return;
		}
		$select_query = "select id from image where filename = ".esc($filename);		
		$select_res = rquery($select_query);

		$res = null;

		while ($row = mysqli_fetch_row($select_res)) {
			$res = $row[0];
		}

		#die($select_query);

		if(is_null($res)) {
			$width_and_height = get_image_width_and_height_from_file($path);
			if(!$width) {
				$width = $width_and_height[0];
			}

			if(!$height) {
				$height = $width_and_height[1];
			}

			if($width && $height) {
				$hash = $perception_hash;

				if(!$perception_hash) {
					$hash = get_or_create_perception_hash_from_db($path, $filename);
				}

				$insert_query = "insert into image (filename, width, height, perception_hash) values (".esc(array($filename, $width, $height, $hash)).") on duplicate key update filename = values(filename), width = values(width), height = values(height), deleted = 0, offtopic = 0";
				rquery($insert_query);
				return get_or_create_image_id($path, $filename, $perception_hash, $width, $height, $rec + 1);
			} else {
				return null;
			}
		} else {
			return $res;
		}
	}

	function get_image_height ($id) {
		$query = "select height from image where id = ".esc($id);
		$res = rquery($query);
		$r = "";

		while ($row = mysqli_fetch_row($res)) {
			$r = $row[0];
		}

		return $r;
	}

	function get_image_width ($id) {
		$query = "select width from image where id = ".esc($id);
		$res = rquery($query);
		$r = "";

		while ($row = mysqli_fetch_row($res)) {
			$r = $row[0];
		}

		return $r;
	}

	function parse_position ($str, $wimg, $himg) {
		if(preg_match("/xywh=pixel:(-?\d+)(?:\.\d+)?,(-?\d+)(?:\.\d+)?,(-?\d+)(?:\.\d+)?,(-?\d+)(?:\.\d+)?/", $str, $matches)) {
			$x = $matches[1] < 0 ? 0 : $matches[1];
			$y = $matches[2] < 0 ? 0 : $matches[2];
			$w = $matches[3] > $wimg ? $wimg : $matches[3];
			$h = $matches[4] > $himg ? $himg : $matches[4];

			return array(
				$x,
				$y,
				$w,
				$h
			);
		} else {
			return null;
		}
	}

	function create_annotation ($image_id, $user_id, $category_id, $x_start, $y_start, $w, $h, $json, $annotarius_id, $used_model) {
		/*
		create table annotation (id int unsigned primary key auto_increment, user_id int unsigned, category_id int unsigned, x_start int unsigned, y_start int unsigned, w int unsigned, h int unsigned, json MEDIUMBLOB, foreign key (category_id) references category(id) on delete cascade, foreign key (user_id) references user(id) on delete cascade);
		 */

		$query = "insert into annotation (image_id, user_id, category_id, x_start, y_start, w, h, json, annotarius_id, model_uuid) values (".
			esc(array($image_id, $user_id, $category_id, $x_start, $y_start, $w, $h, $json, $annotarius_id, $used_model ? $used_model : null)).
			") on duplicate key update image_id = values(image_id), category_id = values(category_id), x_start = values(x_start), y_start = values(y_start), w = values(w), h = values(h), json = values(json), annotarius_id = values(annotarius_id), deleted = 0";

		rquery($query);

		return $GLOBALS["dbh"]->insert_id;
	}

	function mark_as_curated ($image_id) {
		$query = "update annotation set curated = 1 where image_id = ".esc($image_id);

		rquery($query);
	}

	function delete_all_annos_from_image ($image_id) {
		$query = "delete from annotation where image_id = ".esc($image_id);

		rquery($query);
	}

	function delete_image_by_fn ($fn) {
		$query = "delete from image where filename = ".esc($fn);

		rquery($query);
	}

	function delete_model ($model_uuid) {
		$query = "delete from models where uuid = ".esc($model_uuid).' or model_name = '.esc($model_uuid);

		rquery($query);
	}

	function flag_deleted ($annotarius_id) {
		$query = "delete from annotation where annotarius_id = ".esc($annotarius_id);

		rquery($query);
	}

	function get_next_random_unannotated_image ($fn = "", $skip_list = []) {
		$query = 'select * from (select i.filename from image i 
			left join image_data id on id.filename = i.filename 
			left join annotation a on i.id = a.image_id 
			where a.id is null and i.perception_hash is not null';

		if ($fn) {
			$query .= " and i.filename like " . esc("%$fn%");
		}

		// Übersprungene Bilder ausschließen
		if (!empty($skip_list)) {
			$escaped = array_map(function($f) { return esc($f); }, $skip_list);
			$query .= " and i.filename not in (" . implode(",", $escaped) . ")";
		}

		$query .= " and id.filename is not null ";
		$query .= " and i.offtopic = '0' ";
		$query .= " and i.unidentifiable = '0' ";
		$query .= ' order by rand()) a';

		$res = rquery($query);
		while ($row = mysqli_fetch_row($res)) {
			return $row[0];
		}
		return null;
	}

	function get_image_data_id ($file) {
		$query = "select id from image_data where filename = ".esc($file);

		$res = rquery($query);

		while ($row = mysqli_fetch_row($res)) {
			return $row[0];
		}

		return null;
	}

	function move_to_offtopic ($fn) {
		if(!preg_match("/\.\./", $fn) && preg_match("/\.jpg/", $fn)) {
			rquery("update image set offtopic = '1' where filename = ".esc($fn));
			rquery("update image set deleted = '1' where filename = ".esc($fn));
			print "Moved to offtopic";
		}
	}

	function move_to_unidentifiable ($fn) {
		if(!preg_match("/\.\./", $fn) && preg_match("/\.jpg/", $fn)) {
			rquery("update image set unidentifiable = '1' where filename = ".esc($fn));
			rquery("update image set deleted = '1' where filename = ".esc($fn));
			print "Moved from unidentifiable";
		}
	}

	function move_from_offtopic ($fn) {
		if(!preg_match("/\.\./", $fn) && preg_match("/\.jpg/", $fn)) {
			rquery("update image set offtopic = '0' where filename = ".esc($fn));
			rquery("update image set deleted = '0' where filename = ".esc($fn));
			print "Moved from offtopic";
		}
	}

	function api_set_rotation($fn, $rotation) {
		$out = [
			"ok" => false,
			"error" => null,
			"filename" => null,
			"rotation" => null
		];

		try {
			$out["filename"] = $fn;
			$out["rotation"] = $rotation;

			if (!$fn || !$rotation && $rotation !== "0") {
				$out["error"] = "missing_parameter";
				return json_encode($out);
			}

			if (!is_numeric($rotation) || $rotation < 0 || $rotation > 360) {
				$out["error"] = "invalid_rotation";
				return json_encode($out);
			}

			if (preg_match("/\.\./", $fn) || !preg_match("/\.jpg$/i", $fn)) {
				$out["error"] = "invalid_filename";
				return json_encode($out);
			}

			set_rotation_for_image($fn, $rotation);

			$out["ok"] = true;
			$out["rotation"] = intval($rotation);

		} catch (Throwable $e) {
			$out["error"] = "exception";
			$out["exception"] = $e->getMessage();
		}

		return json_encode($out);
	}

	function set_rotation_for_image ($fn, $rotation) {
		if (!preg_match("/\.\./", $fn) && preg_match("/\.jpg$/i", $fn) && is_numeric($rotation) && $rotation >= 0 && $rotation <= 360) {
			rquery(
				"update image set rotation = ".intval($rotation)." where filename = ".esc($fn)
			);
		}
	}

	function api_get_rotation($fn) {
		$out = [
			"ok" => false,
			"error" => null,
			"filename" => $fn,
			"rotation" => null
		];

		try {
			if (!$fn) {
				$out["error"] = "missing_filename";
				return json_encode($out);
			}

			if (preg_match("/\.\./", $fn) || !preg_match("/\.jpg$/i", $fn)) {
				$out["error"] = "invalid_filename";
				return json_encode($out);
			}

			$res = rquery(
				"select rotation from image where filename = ".esc($fn)." limit 1"
			);

			if (!$res || mysqli_num_rows($res) === 0) {
				$out["error"] = "image_not_found";
				return json_encode($out);
			}

			$row = mysqli_fetch_row($res);

			$out["ok"] = true;
			$out["rotation"] = intval($row[0]);

		} catch (Throwable $e) {
			$out["error"] = "exception";
			$out["exception"] = $e->getMessage();
		}

		return json_encode($out);
	}

	function get_base_url () {
		if(!$_SERVER["REQUEST_SCHEME"]) {
			die("REQUEST_SCHEME not in request");
		}

		if(!$_SERVER["SERVER_NAME"]) {
			die("SERVER_NAME not in request");
		}

		if(!$_SERVER["SERVER_PORT"]) {
			die("SERVER_PORT not in request");
		}

		if(!$_SERVER["PHP_SELF"]) {
			die("PHP_SELF not in request");
		}

		$scheme = $_SERVER["REQUEST_SCHEME"];
		$server_name = $_SERVER["SERVER_NAME"];
		$server_port = $_SERVER["SERVER_PORT"];
		$php_self = $_SERVER["PHP_SELF"];

		if(($scheme == "https" && $server_port == 443) || ($scheme == "http" && $server_port == 80)) {
			$b = $scheme."://".$server_name."/".$php_self;
		} else {
			$b = $scheme."://".$server_name.":".$server_port."/".$php_self;
		}
		$b = preg_replace("/\/[^\/]*?$/", "/", $b);
		$b = preg_replace("/([^:])\/\//", "$1/", $b);

		return $b;
	}

	function insert_image_into_db_from_data($data, $filename) {
		if (!is_string($data) || empty($data)) {
			error_log("Invalid image data provided");
			dier("Error: Invalid image data.");
		}

		if (!is_string($filename) || trim($filename) === '') {
			error_log("Invalid filename provided");
			dier("Error: Filename must be a non-empty string.");
		}

		$tmpfname = tempnam(sys_get_temp_dir(), 'img_');
		if ($tmpfname === false) {
			error_log("Failed to create temporary file");
			dier("Error: Could not create temporary file.");
		}

		if (file_put_contents($tmpfname, $data) === false) {
			error_log("Failed to write image data to temporary file: $tmpfname");
			unlink($tmpfname);
			dier("Error: Could not write image data to temporary file.");
		}

		insert_image_into_db($tmpfname, $filename);

		if (file_exists($tmpfname)) {
			unlink($tmpfname);
		}
	}

	function generate_uuid_v4() {
		return sprintf(
			'%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
			mt_rand(0, 0xffff), mt_rand(0, 0xffff),
			mt_rand(0, 0xffff),
			mt_rand(0, 0x0fff) | 0x4000,
			mt_rand(0, 0x3fff) | 0x8000,
			mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
		);
	}

	function convert_to_tfjs(string $modelPath): string {
		$model_uuid = generate_uuid_v4();

		$base_path = "/tmp/$model_uuid";
		$final_path = "$base_path/";

		$command = "bash convert_to_tfjs " . escapeshellarg($modelPath) . " $base_path";

		// Buffers ausschalten
		ob_implicit_flush(true);
		while (ob_get_level() > 0) ob_end_flush();

		$descriptorspec = [
			1 => ["pipe", "w"], // stdout
			2 => ["pipe", "w"]  // stderr
		];

		$process = proc_open($command, $descriptorspec, $pipes);

		if (!is_resource($process)) {
			throw new RuntimeException("Error: could not start process.");
		}

		// stdout + stderr parallel lesen
		$stdout = $pipes[1];
		$stderr = $pipes[2];

		stream_set_blocking($stdout, false);
		stream_set_blocking($stderr, false);

		while (true) {
			$read = [$stdout, $stderr];
			$write = null;
			$except = null;
			$num_changed_streams = stream_select($read, $write, $except, 0, 200000); // 0,2s

			if ($num_changed_streams === false) break;

			foreach ($read as $r) {
				$line = fgets($r);
				if ($line === false) continue;

				if ($r === $stdout) {
					echo htmlspecialchars($line) . "<br>";
					flush();
				} else {
					echo "<b>ERROR:</b> " . htmlspecialchars($line) . "<br>";
					flush();
				}
			}

			$status = proc_get_status($process);
			if (!$status['running']) break;
		}

		fclose($stdout);
		fclose($stderr);

		$returnValue = proc_close($process);
		if ($returnValue !== 0) {
			throw new RuntimeException("Error: the script exited with $returnValue.");
		}

		$final_path = current(array_filter(glob($final_path . '/*_web_model'), 'is_dir'));

		$modelFile = $final_path . "/model.json";

		if (!file_exists($modelFile)) {
			if($final_path) {
				$available = array_diff(scandir($final_path), ['.', '..']);
				$availableList = implode(", ", $available);
				throw new RuntimeException(
					"Error: Model File '$modelFile' does not exist. Available in dir: $availableList"
				);
			}
		}

		return $final_path;
	}


	function insert_image_into_db($file_tmp, $filename) {
		if (!file_exists($file_tmp)) {
			error_log("Temporary file does not exist: $file_tmp");
			dier("Error: Image file not found.");
		}

		if (!is_readable($file_tmp)) {
			error_log("Temporary file is not readable: $file_tmp");
			dier("Error: Cannot read temporary file.");
		}

		if (!is_string($filename) || trim($filename) === '') {
			error_log("Invalid filename in insert_image_into_db");
			dier("Error: Invalid filename.");
		}

		try {
			$existing_id = get_image_data_id($filename);
			$existing_hash = get_perception_hash_from_db($filename);
			$new_hash = get_perception_hash($file_tmp);

			// Prüfen, ob schon ein identisches Bild existiert
			if (!is_null($existing_id) && $existing_hash === $new_hash) {
				return $existing_id;
			}

			$db_host = $GLOBALS["db_host"] ?? null;
			$db_name = $GLOBALS["db_name"] ?? null;
			$db_user = $GLOBALS["db_username"] ?? null;
			$db_pass = $GLOBALS["db_password"] ?? null;

			if (!$db_host || !$db_name || !$db_user || $db_pass === null) {
				error_log("Database credentials are not properly set");
				dier("Error: Database configuration missing.");
			}

			$GLOBALS["pdo"]->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

			$unique_filename = $filename;
			$file_contents = file_get_contents($file_tmp);
			if ($file_contents === false) {
				error_log("Failed to read contents of temporary file: $file_tmp");
				dier("Error: Could not read image data.");
			}

			$counter = 1;
			while (true) {
				try {
					$stmt = $GLOBALS["pdo"]->prepare("INSERT INTO image_data (filename, image_content) VALUES (:filename, :image_content)");
					$stmt->bindParam(':filename', $unique_filename);
					$stmt->bindParam(':image_content', $file_contents, PDO::PARAM_LOB);
					$stmt->execute();
					break; // Einfügen erfolgreich
				} catch (PDOException $e) {
					// Duplicate Key Error
					if ($e->getCode() == 23000) {
						// Prüfen, ob Daten identisch sind
						$check_stmt = $GLOBALS["pdo"]->prepare("SELECT image_content FROM image_data WHERE filename = :filename LIMIT 1");
						$check_stmt->bindParam(':filename', $unique_filename);
						$check_stmt->execute();
						$existing_contents = $check_stmt->fetchColumn();

						if ($existing_contents === $file_contents) {
							// Bild schon vorhanden, ID zurückgeben
							return get_image_id($unique_filename);
						}

						// Sonst neuen Dateinamen generieren
						$path_info = pathinfo($filename);
						$unique_filename = $path_info['filename'] . "_$counter." . $path_info['extension'];
						$counter++;
						continue;
					} else {
						throw $e;
					}
				}
			}


			$image_id = get_or_create_image_id($file_tmp, $unique_filename);
			if (!$image_id) {
				error_log("get_or_create_image_id() returned null for: $unique_filename");
				dier("Error: Could not create or retrieve image ID.");
			}

			return $image_id;

		} catch (PDOException $e) {
			dier("Database error: Failed to insert image: " . $e->getMessage());
		} catch (Throwable $e) {
			error_log("General error in insert_image_into_db: ");
			dier("Unexpected error: Could not insert image: " . $e->getMessage());
		}
	}

	function generate_unique_filename($filename) {
		$base_name = pathinfo($filename, PATHINFO_FILENAME);
		$extension = pathinfo($filename, PATHINFO_EXTENSION);
		$unique_filename = $base_name . '_' . uniqid() . '.' . $extension;

		// Check if the generated filename already exists in the database
		$stmt = $GLOBALS["pdo"]->prepare("SELECT filename FROM image_data WHERE filename = :filename");
		$stmt->bindParam(':filename', $unique_filename);
		$stmt->execute();

		if ($stmt->rowCount() > 0) {
			// If it exists, recursively generate a new unique filename
			return generate_unique_filename($filename);
		}

		return $unique_filename;
	}

	function print_image($fn, $override_rotation = null) {
		$query = "
			SELECT d.image_content, i.rotation
			FROM image_data d
			LEFT JOIN image i ON i.filename = d.filename
			WHERE d.filename = ".esc($fn)."
			LIMIT 1
		";

		$res = rquery($query);

		if (!($row = mysqli_fetch_row($res))) {
			print "Image <b>".htmlentities($fn)."</b> not found";
			exit(0);
		}

		$img_blob = $row[0];
		$db_rotation = $row[1];

		$rotation = ($override_rotation !== null) ? $override_rotation : $db_rotation;

		if (empty($rotation) || intval($rotation) === 0) {
			header('Content-Type: image/jpeg');
			print $img_blob;
			exit(0);
		}

		$src = imagecreatefromstring($img_blob);
		if (!$src) {
			header('Content-Type: image/jpeg');
			print $img_blob;
			exit(0);
		}

		$bg = imagecolorallocate($src, 128, 128, 128);
		$rotated = imagerotate($src, -intval($rotation), $bg);

		header('Content-Type: image/jpeg');
		imagejpeg($rotated, null, 95);

		imagedestroy($src);
		imagedestroy($rotated);
		exit(0);
	}

	function get_param ($name, $default = 0) {
		$res = $default;
		if(get_get($name)) {
			$res = intval(get_get($name));
		}
		return $res;
	}

	function get_list_of_models () {
		$query = 'select if(model_name is null or model_name = "", uuid, model_name) as model_name, uuid from models group by uuid order by upload_time desc';

		$res = rquery($query);

		$models = [];
		while ($row = mysqli_fetch_row($res)) {
			$models[] = $row;
		}

		return $models;
	}

	function get_model_file ($uuid, $filename) {
		$filename = preg_replace("/\?$/", "", $filename);
		$query = "select file_contents from models where uuid = ".esc($uuid)." and filename = ".esc($filename)."";

		$res = rquery($query);

		$models = [];
		while ($row = mysqli_fetch_row($res)) {
			return $row[0];
		}
		
		return "uuid <b>>$uuid<</b>, filename <b>>$filename<</b> not found.<br>";
	}

	function print_model_file ($uuid, $filename) {
		$filename = preg_replace("/\?$/", "", $filename);
		$query = "select file_contents from models where uuid = ".esc($uuid)." and filename = ".esc($filename)."";

		$res = rquery($query);

		$models = [];
		while ($row = mysqli_fetch_row($res)) {
			print $row[0];
			exit(0);
		}
		
		print "uuid <b>>$uuid<</b>, filename <b>>$filename<</b> not found.<br>";
		exit(1);
	}

	function process_is_running ($process) {
		$res = proc_get_status($process);

		return $res["running"];
	}

	function insert_file_into_db($model_name, $file_path, $uuid, $overwrite_filename = null) {
		if (!is_file($file_path)) return null;

		$file_contents = file_get_contents($file_path);
		$filename = basename($file_path);

		$fn = $filename;
		if($overwrite_filename != null) {
			$fn = $overwrite_filename;
		}

		$stmt = $GLOBALS["pdo"]->prepare("
			INSERT INTO models (model_name, upload_time, filename, file_contents, uuid)
			VALUES (:model_name, now(), :filename, :file_contents, :uuid)
			");
		$stmt->bindParam(':model_name', $model_name);
		$stmt->bindParam(':filename', $fn);
		$stmt->bindParam(':file_contents', $file_contents, PDO::PARAM_LOB);
		$stmt->bindParam(':uuid', $uuid);
		$stmt->execute();

		if ($filename === "metadata.yaml") {
			insert_model_labels_from_yaml($file_path, $uuid);
		}

		return $GLOBALS["pdo"]->lastInsertId();
	}

	function insert_directory_into_db($model_name, $dir_path, $uuid) {
		$inserted_ids = [];
		if (!is_dir($dir_path)) {
			if($path) {
				echo "Path is not a folder: $dir_path<br>";
			}

			exit(1);
		}

		foreach (scandir($dir_path) as $file) {
			if ($file === '.' || $file === '..') continue;
			$full_path = $dir_path . DIRECTORY_SEPARATOR . $file;
			if (is_file($full_path)) {
				$inserted_id = insert_file_into_db($model_name, $full_path, $uuid);
				if ($inserted_id) $inserted_ids[] = $inserted_id;
			}
		}

		return $inserted_ids;
	}

	function get_all_filenames($dir) {
		$files = [];
		if (!is_dir($dir)) return $files;

		$items = scandir($dir);
		foreach ($items as $item) {
			if ($item === '.' || $item === '..') continue;
			$path = $dir . '/' . $item;
			if (is_file($path)) {
				$files[] = $item; // nur der Dateiname, kein Pfad
			} elseif (is_dir($path)) {
				// optional: rekursiv Unterordner durchsuchen
				$files = array_merge($files, get_all_filenames($path));
			}
		}
		return $files;
	}

	function insert_model_into_db($model_name, $files_array, $pt_file_path, $pt_file, $is_tfjs = false) {
		force_reconnect();

		try {
			$uuid = uniqid("model_");
			$all_inserted_ids = [];

			if ($is_tfjs) {
				// Files are already converted TFJS files — insert directly
				foreach ($files_array as $path) {
					$filename = basename($path);
					$check = rquery("SELECT id FROM models WHERE filename=" . esc($filename) . " AND uuid=" . esc($uuid));
					if (mysqli_num_rows($check) === 0) {
						$all_inserted_ids[] = insert_file_into_db($model_name, $path, $uuid, $filename);
					} else {
						echo " → Skipping duplicate file '$filename' for model '$model_name'\n";
					}
				}
			} else {
				// .pt files — need conversion
				foreach ($files_array as $path) {
					$converted_path = convert_to_tfjs($path);
					$filenames_in_path = get_all_filenames($converted_path);

					foreach ($filenames_in_path as $filename) {
						$check = rquery("SELECT id FROM models WHERE filename=" . esc($filename) . " AND uuid=" . esc($uuid));
						if (mysqli_num_rows($check) === 0) {
							$all_inserted_ids[] = insert_file_into_db($model_name, $converted_path . '/' . $filename, $uuid, $filename);
						} else {
							echo " → Skipping duplicate file '$filename' for model '$model_name'\n";
						}
					}
				}
			}

			if ($pt_file && $pt_file_path && is_file($pt_file_path)) {
				$pt_filename = basename($pt_file_path);
				$check = rquery("SELECT id FROM models WHERE filename=" . esc($pt_filename) . " AND uuid=" . esc($uuid));
				if (mysqli_num_rows($check) === 0) {
					$pt_inserted_id = insert_file_into_db($model_name, $pt_file_path, $uuid, "model.pt");
					if ($pt_inserted_id) $all_inserted_ids[] = $pt_inserted_id;
				} else {
					echo " → Skipping duplicate PT file '$pt_filename'\n";
				}
			}

			return $all_inserted_ids;

		} catch (\Throwable $e) {
			error_log("Database error: " . $e->getMessage());
			die("Error: Unable to insert models into the database.<br>\nError:<br>" . $e->getMessage() . "<br>Error End<br>\n");
		}
	}

	function get_annotated_images () {
		$valid_formats = array(
			"ultralytics_yolov5", "html"
		);

		$format = "ultralytics_yolov5";
		if(isset($_GET["format"]) && in_array($_GET["format"], $valid_formats)) {
			$format = $_GET["format"];
		}

		$max_files = get_get("max_files", 0);
		$test_split = get_get("test_split", 0);
		$only_uncurated = get_param("only_uncurated");
		$only_curated = get_param("only_curated");
		$max_truncation = get_param("max_truncation", 100);
		$page = get_param("page");
		$items_per_page = get_param("items_per_page", 500);
		$offset = get_param("offset", $page * $items_per_page);
		$limit = get_param("limit");
		$show_categories = isset($_GET["show_categories"]) ? $_GET["show_categories"] : [];
		$show_files = isset($_GET["show_files"]) ? $_GET["show_files"] : [];  // NEU

		$res = _get_annotated_images($max_truncation, $show_categories, $only_uncurated, $format, $limit, $items_per_page, $offset, $only_curated, $max_files, $show_files);

		return $res;
	}

	function _get_annotated_images ($max_truncation, $show_categories, $only_uncurated, $format, $limit, $items_per_page, $offset, $only_curated, $max_files, $show_files = []) {
		$annotated_image_ids_query = get_annotated_image_ids_query($max_truncation, $show_categories, $only_uncurated, $format, $limit, $items_per_page, $offset, $only_curated, $show_files);
		$res = rquery($annotated_image_ids_query);

		$number_of_rows = get_number_of_rows();

		$max_page = ceil($number_of_rows / $items_per_page);

		$images = [];
		$categories = [];

		$j = 0;

		$perception_hash_to_image = [];

		// geht einzelne annotationen durch, appendiert die einzelannotationen an die dateinamen
		while ($row = mysqli_fetch_row($res)) {
			if($max_files && $j >= $max_files) {
				continue;
			}

			$filename = $row[0];

			$width = $row[1];
			$height = $row[2];
			$category = $row[3];
			$x_start = $row[4];
			$y_start = $row[5];

			$w = $row[6];
			$h = $row[7];
			$id = $row[8];

			$image_perception_hash = $row[9];

			$category = strtolower($category);
			if(!isset($images[$filename])) {
				$images[$filename] = array();
			}

			$this_annotation = array(
				"width" => $width,
				"height" => $height,
				"category" => $category,
				"x_start" => $x_start,
				"y_start" => $y_start,
				"w" => $w,
				"h" => $h,
				"id" => $id,
				"image_perception_hash" => $image_perception_hash
			);

			if(get_get("group_by_perception_hash")) {
				$perception_hash_to_image[$this_annotation["image_perception_hash"]] = $filename;
			}

			if(!in_array($category, $categories)) {
				$categories[] = $category;
			}

			$yolo = parse_position_yolo(
				$this_annotation["x_start"],
				$this_annotation["y_start"],
				$this_annotation["w"],
				$this_annotation["h"],
				$this_annotation["width"],
				$this_annotation["height"]
			);

			$this_annotation["x_center"] = $yolo["x_center"];
			$this_annotation["y_center"] = $yolo["y_center"];
			$this_annotation["w_rel"] = $yolo["w_rel"];
			$this_annotation["h_rel"] = $yolo["h_rel"];

			$images[$filename][] = $this_annotation;

			$j++;
		}

		if(get_get("group_by_perception_hash")) {
			if(count($perception_hash_to_image)) {
				$new_images = [];

				foreach ($perception_hash_to_image as $hash => $fn) {
					$new_images[$fn] = $images[$fn];
				}

				$images = $new_images;
			}
		}

		return [$images, $number_of_rows, $format, $categories];
	}

	function asset($path) {
		// Prüft, ob die Datei existiert, um Fehler zu vermeiden
		if (file_exists($path)) {
			return $path . "?v=" . filemtime($path);
		}
		return $path;
	}

	$GLOBALS["base_url"] = get_base_url();

	rquery("SET GLOBAL max_allowed_packet=1024*1024*1024");
?>
