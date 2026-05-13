<?php
include("header.php");
include_once("functions.php");

function h($str) {
	if($str) {
		return htmlspecialchars($str, ENT_QUOTES, 'UTF-8');
	}

	return $str;
}

function fetchAll($query) {
	$stmt = $GLOBALS['dbh']->prepare($query);
	$stmt->execute();
	return $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
}

function renderTable($title, $headers, $rows, $actions = []) {
	echo "<h2>" . h($title) . "</h2>";
	echo "<table><tr>";
	foreach ($headers as $h) {
		echo "<th>" . h($h) . "</th>";
	}
	if ($actions) {
		echo "<th>Actions</th>";
	}
	echo "</tr>";

	foreach ($rows as $row) {
		echo "<tr>";
		foreach ($headers as $key) {
			echo "<td>" . h($row[$key]) . "</td>";
		}

		if ($actions) {
			echo "<td>";
			foreach ($actions as $action) {
				echo "<form class='ajax-delete' method='post' action='" . h($action['target']) . "' data-confirm='" . h($action['confirm']) . "' style='display:inline'>
					<input type='hidden' name='id' value='" . h($row['id']) . "'>
					<button type='submit' class='btn'>" . h($action['label']) . "</button>
					</form> ";
			}
			echo "</td>";
		}

		echo "</tr>";
	}
	echo "</table>";
}

// Retrieve bounding box data and aspect ratios
$result = rquery("SELECT w, h FROM annotation WHERE deleted = 0");
$aspect_ratios = [];
$widths = [];
$heights = [];
while ($row = $result->fetch_assoc()) {
    if ($row["h"]) $aspect_ratios[] = $row["w"] / $row["h"];
    $widths[] = $row['w'];
    $heights[] = $row['h'];
}

// User annotation counts
$result = rquery("SELECT * FROM (SELECT user.name, COUNT(annotation.id) AS count
                    FROM user
                    LEFT JOIN annotation ON user.id = annotation.user_id
                    GROUP BY user.id) a ORDER BY a.count");
$user_names = [];
$annotation_counts = [];
while($row = $result->fetch_assoc()) {
    $user_names[] = $row["name"];
    $annotation_counts[] = $row["count"];
}

// Annotations over time
$annotation_count_result = rquery("SELECT COUNT(id) as count, DATE(modified) as date
                                   FROM annotation
                                   WHERE deleted = 0
                                   AND image_id NOT IN (SELECT id FROM image WHERE deleted = 1)
                                   GROUP BY DATE(modified)");

$data = [];
$i = 0;
while($row = mysqli_fetch_assoc($annotation_count_result)) {
    if($i != 0) $data[] = ['date' => $row['date'], 'count' => $row['count']];
    $i++;
}

// Annotations per image/date
$annotation_count_result = rquery("SELECT COUNT(id) as count, DATE_FORMAT(modified, '%Y-%m-%d') datehour
                                   FROM annotation
                                   WHERE deleted = 0
                                   AND image_id NOT IN (SELECT id FROM image WHERE deleted = 1)
                                   GROUP BY image_id, datehour
                                   ORDER BY datehour");

$data_images = [];
$i = 0;
while($row = mysqli_fetch_assoc($annotation_count_result)) {
    if($i != 0) $data_images[] = ['date' => $row['datehour'], 'count' => $row['count']];
    $i++;
}

// Category counts
$category_count_result = rquery("SELECT category.name, COUNT(*) as count
                                 FROM category
                                 INNER JOIN annotation ON category.id = annotation.category_id
                                 GROUP BY category.id");
$category_data = [];
while ($row = mysqli_fetch_assoc($category_count_result)) {
    $category_data[] = [
        "x" => [$row['name']],
        "y" => [$row['count']],
        "type" => "bar",
        "name" => $row['name'],
        "marker" => [
            "color" => "rgba(0,200,255,0.7)",
            "line" => ["color" => "rgba(0,200,255,1)", "width" => 2]
        ]
    ];
}

?>
<body>
<div id="category_chart"></div>
<div id="annotation_chart"></div>
<div id="width_histogram"></div>
<div id="height_histogram"></div>
<div id="user_plot"></div>
<div id="aspect_ratio_plot"></div>

<script>
var dark_layout = {
    plot_bgcolor: '#1e1e1e',
    paper_bgcolor: '#1e1e1e',
    font: { color: '#ffffff' },
    xaxis: { gridcolor: '#444', zerolinecolor: '#666' },
    yaxis: { gridcolor: '#444', zerolinecolor: '#666' },
    title: { font: { color: '#ffffff' } }
};

// Category chart
Plotly.newPlot('category_chart', <?php echo json_encode($category_data); ?>,
               Object.assign({}, dark_layout, {title: 'Annotations per Category'}));

// Annotations over time
var x = [], y = [];
<?php foreach($data as $point) { ?>
    x.push("<?php echo $point['date']; ?>");
    y.push(<?php echo $point['count']; ?>);
<?php } ?>
Plotly.newPlot('annotation_chart', [{x:x, y:y, type:'scatter', line:{color:'#00ff88'}}],
               Object.assign({}, dark_layout, {title:'Annotations Created Over Time'}));

// Bounding box histograms
var width_data = <?php echo json_encode($widths); ?>;
var height_data = <?php echo json_encode($heights); ?>;
Plotly.newPlot('width_histogram', [{x:width_data, type:'histogram', marker:{color:'#ff7f0e'}}],
               Object.assign({}, dark_layout, {title:'Bounding Box Width Distribution'}));
Plotly.newPlot('height_histogram', [{x:height_data, type:'histogram', marker:{color:'#d62728'}}],
               Object.assign({}, dark_layout, {title:'Bounding Box Height Distribution'}));

// User annotation stats
Plotly.newPlot('user_plot', [{
    x: <?php echo json_encode($user_names); ?>,
    y: <?php echo json_encode($annotation_counts); ?>,
    type: 'bar',
    marker: { color:'#9467bd' }
}], Object.assign({}, dark_layout, {title:'User Annotation Statistics'}));

// Aspect ratios
Plotly.newPlot('aspect_ratio_plot', [{
    x: <?php echo json_encode($aspect_ratios); ?>,
    type:'histogram',
    nbinsx: 1000,
    marker: { color:'#1f77b4' }
}], Object.assign({}, dark_layout, {title:'Aspect Ratio Statistics'}));
</script>

<?php
$sql = "SELECT id, name FROM category";
$result = rquery($sql);
$categories = [];
while($row = $result->fetch_assoc()) $categories[$row["id"]] = $row["name"];

include("footer.php");
?>
<script>
load_dynamic_content();
</script>

<?php
	/*
	$models = fetchAll("SELECT * FROM models ORDER BY upload_time DESC");
	renderTable("Models", ['id', 'model_name', 'upload_time', 'filename', 'uuid'], $models);

	$images = fetchAll("SELECT id, filename, width, height, deleted, offtopic, unidentifiable, perception_hash FROM image ORDER BY id DESC LIMIT 100");
	foreach ($images as &$img) {
		$img['size'] = $img['width'] . "×" . $img['height'];
	}
	renderTable("Images", ['id', 'filename', 'size', 'deleted', 'offtopic', 'unidentifiable', 'perception_hash'], $images);
	 */

	/*
	$annots = fetchAll("
	    SELECT a.id, i.filename, u.name as user, c.name as category,
		   CONCAT('(', a.x_start, ',', a.y_start, ') ', a.w, '×', a.h) AS box,
		   a.modified, a.deleted
	    FROM annotation a
	    JOIN image i ON a.image_id = i.id
	    JOIN user u ON a.user_id = u.id
	    JOIN category c ON a.category_id = c.id
	    ORDER BY a.modified DESC LIMIT 100
	");
	renderTable("Annotations", ['id', 'filename', 'user', 'category', 'box', 'modified', 'deleted'], $annots);
	 */

	/*
	$annots_bare = fetchAll("
		select
			id,
			image_id,
			user_id,
			category_id,
			x_start,
			y_start,
			w,
			h,
			json,
			annotarius_id,
			modified,
			deleted
		from annotation
	");

	renderTable("Annotations (bare)", [
		"id",
		"image_id",
		"user_id",
		"category_id",
		"x_start",
		"y_start",
		"w",
		"h",
		"json",
		"annotarius_id",
		"modified",
		"deleted"
	], $annots_bare);
	 */

	$cats = fetchAll("SELECT * FROM category ORDER BY id");
	renderTable("Categories", ['id', 'name'], $cats, [
	    ['target' => 'delete_category.php', 'label' => 'Delete', 'confirm' => 'Delete this category?']
	]);

	$users = fetchAll("SELECT * FROM user ORDER BY id");
	renderTable("Users", ['id', 'name'], $users);

	include_once("footer.php");
?>
<!-- Confirmation Modal -->
<div id="confirmModal" class="modal" style="display:none;">
  <div class="modal-content">
    <p id="confirmMessage"></p>
    <button id="confirmYes">Yes</button>
    <button id="confirmNo">No</button>
  </div>
</div>

<!-- Info Modal -->
<div id="infoModal" class="modal" style="display:none;">
  <div class="modal-content">
    <p id="infoMessage"></p>
    <button id="infoOk">OK</button>
  </div>
</div>

<style>
.modal {
  position: fixed;
  top:0; left:0; right:0; bottom:0;
  background: rgba(0,0,0,0.5);
  display: flex; justify-content: center; align-items: center;
  z-index: 9999;
}
.modal-content {
  background: black;
  color: white;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}
.modal-content button {
  margin: 5px;
  padding: 5px 15px;
}
</style>

<script>
document.addEventListener('DOMContentLoaded', () => {
    const deleteForms = document.querySelectorAll('form.ajax-delete');

    const confirmModal = document.getElementById('confirmModal');
    const confirmMessage = document.getElementById('confirmMessage');
    const confirmYes = document.getElementById('confirmYes');
    const confirmNo = document.getElementById('confirmNo');

    const infoModal = document.getElementById('infoModal');
    const infoMessage = document.getElementById('infoMessage');
    const infoOk = document.getElementById('infoOk');

    let currentForm = null;

    deleteForms.forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault(); // **Abfangen!**
            currentForm = form;

            confirmMessage.textContent = form.dataset.confirm;
            confirmModal.style.display = 'flex';
        });
    });

    confirmYes.addEventListener('click', async () => {
        if (!currentForm) return;
        confirmModal.style.display = 'none';

        const formData = new FormData(currentForm);

        try {
            const response = await fetch(currentForm.action, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            infoMessage.textContent = result.message;
            infoModal.style.display = 'flex';

            infoOk.onclick = () => {
                infoModal.style.display = 'none';
                if(result.success) window.location.reload();
            };
        } catch (err) {
            console.error(err);
            infoMessage.textContent = "AJAX request failed.";
            infoModal.style.display = 'flex';
            infoOk.onclick = () => infoModal.style.display = 'none';
        }
    });

    confirmNo.addEventListener('click', () => {
        confirmModal.style.display = 'none';
    });
});
</script>
