<?php
	include_once("functions.php");

	function write_visualization_script($tmp_dir) {
		$train_visualization = '#!/bin/bash

# ══════════════════════════════════════════════════════════
#  YOLO Training Dashboard
#  Usage:  ./plot_results.sh [path/to/results.csv] [--save]
# ══════════════════════════════════════════════════════════

FILE=${1:-runs/detect/train/results.csv}
SAVE_PNG=false
for arg in "$@"; do
  [[ "$arg" == "--save" ]] && SAVE_PNG=true
done

# ── Validate file ──
if [ ! -f "$FILE" ]; then
  echo "❌ Error: File \'$FILE\' not found."
  echo "   Provide a CSV path as first argument or place it at runs/detect/train/results.csv"
  exit 1
fi

# ── Validate gnuplot ──
if ! command -v gnuplot >/dev/null 2>&1; then
  echo "❌ Error: gnuplot is not installed."
  echo "   Install with: sudo apt update && sudo apt install gnuplot"
  exit 1
fi

# ── Extract stats ──
max_epoch=$(tail -n +2 "$FILE" | awk -F\',\' \'{print $1}\' | tr -d \' \' | sort -nr | head -n1)

# Best epoch by mAP50-95 (column 9)
best_line=$(tail -n +2 "$FILE" | awk -F\',\' \'{gsub(/ /,"",$1); gsub(/ /,"",$9); print $1, $9}\' | sort -t\' \' -k2 -g -r | head -n1)
best_epoch=$(echo "$best_line" | awk \'{print $1}\')
best_map=$(echo "$best_line" | awk \'{printf "%.4f", $2}\')

# Final values (last row)
final_precision=$(tail -1 "$FILE" | awk -F\',\' \'{gsub(/ /,"",$6); printf "%.4f", $6}\')
final_recall=$(tail -1 "$FILE" | awk -F\',\' \'{gsub(/ /,"",$7); printf "%.4f", $7}\')
final_map50=$(tail -1 "$FILE" | awk -F\',\' \'{gsub(/ /,"",$8); printf "%.4f", $8}\')
final_map5095=$(tail -1 "$FILE" | awk -F\',\' \'{gsub(/ /,"",$9); printf "%.4f", $9}\')
final_box_train=$(tail -1 "$FILE" | awk -F\',\' \'{gsub(/ /,"",$3); printf "%.4f", $3}\')
final_box_val=$(tail -1 "$FILE" | awk -F\',\' \'{gsub(/ /,"",$10); printf "%.4f", $10}\')

# ── Dynamic x-tick step ──
if (( max_epoch <= 20 )); then
  step=2
elif (( max_epoch <= 50 )); then
  step=5
elif (( max_epoch <= 100 )); then
  step=10
elif (( max_epoch <= 300 )); then
  step=25
else
  step=50
fi

# ── Terminal selection ──
if $SAVE_PNG; then
  OUT_FILE="${FILE%.csv}_dashboard.png"
  TERM_LINE="set terminal pngcairo size 1800,1200 font \'Arial,11\' enhanced"
  OUT_LINE="set output \'${OUT_FILE}\'"
else
  TERM_LINE="set terminal qt size 1800,1200 font \'Arial,11\' enhanced"
  OUT_LINE=""
fi

# ── Build gnuplot script ──
GNUPLOT_SCRIPT=$(mktemp)

cat > "$GNUPLOT_SCRIPT" <<EOF
${TERM_LINE}
${OUT_LINE}

set datafile separator ","

# ── Global styling ──
set style line 100 lt 1 lc rgb "#e0e0e0" lw 0.5
set grid ls 100
set border 3
set tics nomirror
line_width = 2
raw_alpha = 0.3

# ── Multiplot 3×2 ──
set multiplot layout 3,2 \
    title "YOLO Training Dashboard    (${max_epoch} Epochs)\n" font "Arial,15" \
    margins 0.07, 0.96, 0.05, 0.93 \
    spacing 0.10, 0.10

set xtics ${step} rotate by -35 font ",9"
set ytics font ",9"
set xlabel "Epoch" font ",10"
set key top right inside font ",9" samplen 2 spacing 1.1 box lw 0.4

# ═════════════════════════════════════════════
# Plot 1: Training Losses  (smooth + raw)
# ═════════════════════════════════════════════
set title "Training Losses  (↓ lower is better)" font ",12"
set ylabel "Loss" font ",10"
plot \
  "$FILE" using 1:3 with lines lw 0.6 lc rgb "#e74c3c80" notitle, \
  "$FILE" using 1:3 smooth bezier lw line_width lc rgb "#e74c3c" title " box", \
  "$FILE" using 1:4 with lines lw 0.6 lc rgb "#e67e2280" notitle, \
  "$FILE" using 1:4 smooth bezier lw line_width lc rgb "#e67e22" title " cls", \
  "$FILE" using 1:5 with lines lw 0.6 lc rgb "#f1c40f80" notitle, \
  "$FILE" using 1:5 smooth bezier lw line_width lc rgb "#f1c40f" title " dfl"

# ═════════════════════════════════════════════
# Plot 2: Validation Losses  (smooth + raw)
# ═════════════════════════════════════════════
set title "Validation Losses  (↓ lower is better)" font ",12"
set ylabel "Loss" font ",10"
plot \
  "$FILE" using 1:10 with lines lw 0.6 lc rgb "#2980b980" notitle, \
  "$FILE" using 1:10 smooth bezier lw line_width lc rgb "#2980b9" title " box", \
  "$FILE" using 1:11 with lines lw 0.6 lc rgb "#1abc9c80" notitle, \
  "$FILE" using 1:11 smooth bezier lw line_width lc rgb "#1abc9c" title " cls", \
  "$FILE" using 1:12 with lines lw 0.6 lc rgb "#27ae6080" notitle, \
  "$FILE" using 1:12 smooth bezier lw line_width lc rgb "#27ae60" title " dfl"

# ═════════════════════════════════════════════
# Plot 3: Overfitting Check  (Train vs Val)
# ═════════════════════════════════════════════
set title "Overfitting Check  (Train vs Val Loss)" font ",12"
set ylabel "Loss" font ",10"
set key top right inside font ",9" samplen 2 spacing 1.1 box lw 0.4
plot \
  "$FILE" using 1:3 with lines lw 0.6 lc rgb "#e74c3c60" notitle, \
  "$FILE" using 1:3 smooth bezier lw line_width lc rgb "#e74c3c" title " train/box", \
  "$FILE" using 1:10 with lines lw 0.6 lc rgb "#2980b960" notitle, \
  "$FILE" using 1:10 smooth bezier lw line_width lc rgb "#2980b9" title " val/box", \
  "$FILE" using 1:4 with lines lw 0.6 lc rgb "#e67e2260" notitle, \
  "$FILE" using 1:4 smooth bezier lw line_width lc rgb "#e67e22" title " train/cls", \
  "$FILE" using 1:11 with lines lw 0.6 lc rgb "#1abc9c60" notitle, \
  "$FILE" using 1:11 smooth bezier lw line_width lc rgb "#1abc9c" title " val/cls"

# ═════════════════════════════════════════════
# Plot 4: Metrics  (with best-epoch marker)
# ═════════════════════════════════════════════
set title "Metrics  (↑ higher is better)" font ",12"
set ylabel "Value" font ",10"
set yrange [0:1]

# Best epoch vertical line + label
set arrow 1 from ${best_epoch}, graph 0 to ${best_epoch}, graph 1 nohead lw 1.5 dt 3 lc rgb "#e74c3c"
set label 1 sprintf("★ Best Ep ${best_epoch}\nmAP50-95 = ${best_map}") \
    at ${best_epoch}, graph 0.97 right font ",8" tc rgb "#e74c3c" offset -1,0

plot \
  "$FILE" using 1:6 with lines lw 0.6 lc rgb "#8e44ad60" notitle, \
  "$FILE" using 1:6 smooth bezier lw line_width lc rgb "#8e44ad" title " precision", \
  "$FILE" using 1:7 with lines lw 0.6 lc rgb "#c0392b60" notitle, \
  "$FILE" using 1:7 smooth bezier lw line_width lc rgb "#c0392b" title " recall", \
  "$FILE" using 1:8 with lines lw 0.6 lc rgb "#2c3e5060" notitle, \
  "$FILE" using 1:8 smooth bezier lw line_width lc rgb "#2c3e50" title " mAP50", \
  "$FILE" using 1:9 with lines lw 0.6 lc rgb "#16a08560" notitle, \
  "$FILE" using 1:9 smooth bezier lw line_width lc rgb "#16a085" title " mAP50-95"

# Clean up arrow/label so they don\'t leak into other plots
unset arrow 1
unset label 1
set yrange [*:*]

# ═════════════════════════════════════════════
# Plot 5: Learning Rates
# ═════════════════════════════════════════════
set title "Learning Rates" font ",12"
set ylabel "LR" font ",10"
set format y "%.1e"
plot \
  "$FILE" using 1:13 with lines lw line_width lc rgb "#d35400" title " pg0", \
  "$FILE" using 1:14 with lines lw line_width lc rgb "#c0392b" title " pg1", \
  "$FILE" using 1:15 with lines lw line_width lc rgb "#7f8c8d" title " pg2"
set format y "%g"

# ═════════════════════════════════════════════
# Plot 6: Summary Stats Panel
# ═════════════════════════════════════════════
set title "Summary" font ",12"
unset xlabel
unset ylabel
unset xtics
unset ytics
unset grid
unset border
set xrange [0:10]
set yrange [0:10]

set label 10 "{/Arial:Bold=13 Final Results (Epoch ${max_epoch})}" \
    at 5, 9.2 center tc rgb "#2c3e50"

set label 11 sprintf("Precision:       %s", "${final_precision}") \
    at 2, 7.8 left font "Courier,11" tc rgb "#2c3e50"
set label 12 sprintf("Recall:          %s", "${final_recall}") \
    at 2, 7.0 left font "Courier,11" tc rgb "#2c3e50"
set label 13 sprintf("mAP50:           %s", "${final_map50}") \
    at 2, 6.2 left font "Courier,11" tc rgb "#2c3e50"
set label 14 sprintf("mAP50-95:        %s", "${final_map5095}") \
    at 2, 5.4 left font "Courier,11" tc rgb "#2c3e50"

set label 20 "─────────────────────────" \
    at 2, 4.4 left font "Courier,10" tc rgb "#bdc3c7"

set label 15 "{/Arial:Bold=11 Best Epoch}" \
    at 5, 3.4 center tc rgb "#e74c3c"
set label 16 sprintf("Epoch:           %s", "${best_epoch}") \
    at 2, 2.6 left font "Courier,11" tc rgb "#e74c3c"
set label 17 sprintf("mAP50-95:        %s", "${best_map}") \
    at 2, 1.8 left font "Courier,11" tc rgb "#e74c3c"

set label 21 sprintf("Train box-loss:  %s", "${final_box_train}") \
    at 6, 7.8 left font "Courier,11" tc rgb "#7f8c8d"
set label 22 sprintf("Val   box-loss:  %s", "${final_box_val}") \
    at 6, 7.0 left font "Courier,11" tc rgb "#7f8c8d"

plot NaN notitle

# Clean up summary labels
unset label 10; unset label 11; unset label 12; unset label 13; unset label 14
unset label 15; unset label 16; unset label 17; unset label 20; unset label 21; unset label 22

unset multiplot
EOF

# ── Run gnuplot ──
gnuplot -persist "$GNUPLOT_SCRIPT" 2>/dev/null
rm -f "$GNUPLOT_SCRIPT"

# ── Terminal Summary ──
echo ""
echo "══════════════════════════════════════════════"
echo "  📊 YOLO Training Summary"
echo "══════════════════════════════════════════════"
echo "  Source:          $FILE"
echo "  Total Epochs:    $max_epoch"
echo "──────────────────────────────────────────────"
echo "  Final Metrics (Epoch $max_epoch):"
echo "    Precision:     $final_precision"
echo "    Recall:        $final_recall"
echo "    mAP50:         $final_map50"
echo "    mAP50-95:      $final_map5095"
echo "──────────────────────────────────────────────"
echo "  ★ Best mAP50-95: $best_map  (Epoch $best_epoch)"
echo "──────────────────────────────────────────────"
echo "  Train box-loss:  $final_box_train"
echo "  Val   box-loss:  $final_box_val"
echo "══════════════════════════════════════════════"

if $SAVE_PNG; then
  echo ""
  echo "  💾 Dashboard saved to: $OUT_FILE"
  echo ""
fi
';

		file_put_contents("$tmp_dir/visualize", $train_visualization);
	}


	function write_train_bash ($tmp_dir, $epochs, $model_name) {
		$train_bash = '#!/usr/bin/env bash
set -euo pipefail

exit_after_download=0
DEFAULT_EPOCHS='.$epochs.'
DEFAULT_BATCH=16
DEFAULT_IMGSZ='.$GLOBALS['imgsz'].'
DEFAULT_DEVICE=""
DEFAULT_LR0=0.01
DEFAULT_LRF=0.01
DEFAULT_MOMENTUM=0.937
DEFAULT_WEIGHT_DECAY=0.0005
DEFAULT_WARMUP_EPOCHS=3.0
DEFAULT_WARMUP_MOMENTUM=0.8
DEFAULT_WARMUP_BIAS_LR=0.1
# Augmentations
DEFAULT_HSV_H=0.015
DEFAULT_HSV_S=0.7
DEFAULT_HSV_V=0.4
DEFAULT_DEGREES=0.0
DEFAULT_TRANSLATE=0.1
DEFAULT_SCALE=0.5
DEFAULT_SHEAR=0.0
DEFAULT_PERSPECTIVE=0.0
DEFAULT_FLIPLR=0.5
DEFAULT_MOSAIC=1.0
DEFAULT_MIXUP=0.0
DEFAULT_COPY_PASTE=0.0

VENV_PATH="${HOME}/.yolov11_venv"

if [[ ! -d $VENV_PATH ]]; then
  echo "Creating virtualenv at $VENV_PATH"
  python3 -m venv "$VENV_PATH"
  source "$VENV_PATH/bin/activate"
  pip install ultralytics onnx2tf tf_keras onnx_graphsurgeon sng4onnx
else
  echo "Using existing virtualenv at $VENV_PATH"
  source "$VENV_PATH/bin/activate"
fi

DATA=""
MODEL="'.$model_name.'"
epochs="$DEFAULT_EPOCHS"
batch="$DEFAULT_BATCH"
imgsz="$DEFAULT_IMGSZ"
device="$DEFAULT_DEVICE"
lr0="$DEFAULT_LR0"
lrf="$DEFAULT_LRF"
momentum="$DEFAULT_MOMENTUM"
weight_decay="$DEFAULT_WEIGHT_DECAY"
warmup_epochs="$DEFAULT_WARMUP_EPOCHS"
warmup_momentum="$DEFAULT_WARMUP_MOMENTUM"
warmup_bias_lr="$DEFAULT_WARMUP_BIAS_LR"
hsv_h="$DEFAULT_HSV_H"
hsv_s="$DEFAULT_HSV_S"
hsv_v="$DEFAULT_HSV_V"
degrees="$DEFAULT_DEGREES"
translate="$DEFAULT_TRANSLATE"
scale="$DEFAULT_SCALE"
shear="$DEFAULT_SHEAR"
perspective="$DEFAULT_PERSPECTIVE"
fliplr="$DEFAULT_FLIPLR"
mosaic="$DEFAULT_MOSAIC"
mixup="$DEFAULT_MIXUP"
copy_paste="$DEFAULT_COPY_PASTE"

print_usage() {
  echo "Usage: $0 --data=dataset.yaml --model=yolo11s.yaml [--epochs=N] [--batch=N] [--imgsz=N] ..."
  echo "You can set any YOLO train argument as --arg=value"
}

# Parse CLI args
for arg in "$@"; do
  case $arg in
    --data=*) DATA="${arg#*=}" ;;
    --model=*) MODEL="${arg#*=}" ;;
    --epochs=*) epochs="${arg#*=}" ;;
    --batch=*) batch="${arg#*=}" ;;
    --imgsz=*) imgsz="${arg#*=}" ;;
    --device=*) device="${arg#*=}" ;;
    --lr0=*) lr0="${arg#*=}" ;;
    --lrf=*) lrf="${arg#*=}" ;;
    --momentum=*) momentum="${arg#*=}" ;;
    --weight_decay=*) weight_decay="${arg#*=}" ;;
    --exit_after_download) exit_after_download=1 ;;
    --warmup_epochs=*) warmup_epochs="${arg#*=}" ;;
    --warmup_momentum=*) warmup_momentum="${arg#*=}" ;;
    --warmup_bias_lr=*) warmup_bias_lr="${arg#*=}" ;;
    --hsv_h=*) hsv_h="${arg#*=}" ;;
    --hsv_s=*) hsv_s="${arg#*=}" ;;
    --hsv_v=*) hsv_v="${arg#*=}" ;;
    --degrees=*) degrees="${arg#*=}" ;;
    --translate=*) translate="${arg#*=}" ;;
    --scale=*) scale="${arg#*=}" ;;
    --shear=*) shear="${arg#*=}" ;;
    --perspective=*) perspective="${arg#*=}" ;;
    --fliplr=*) fliplr="${arg#*=}" ;;
    --mosaic=*) mosaic="${arg#*=}" ;;
    --mixup=*) mixup="${arg#*=}" ;;
    --copy_paste=*) copy_paste="${arg#*=}" ;;
    --help) print_usage; exit 0 ;;
    *) echo "Unknown argument: $arg"; print_usage; exit 1 ;;
  esac
done

if [[ -z "$DATA" ]]; then
  DATA="dataset.yaml"
fi

if [[ -z "$MODEL" ]]; then
  MODEL="yolo11s.yaml"
fi

mkdir -p images
IFS=$\'\n\'
files=($(ls labels | sed -e "s#\.txt#.jpg#"))
total=${#files[@]}

draw_bar() {
  local progress=$1
  local width=40
  local filled=$((progress * width / 100))
  local empty=$((width - filled))
  printf "["
  printf "%0.s=" $(seq 1 $filled)
  printf "%0.s " $(seq 1 $empty)
  printf "] %3d%%" "$progress"
}

for idx in "${!files[@]}"; do
  file="${files[$idx]}"
  if [[ -e "images/$file" ]]; then
    echo -e "\e[1;33m[$((idx+1))/$total] $file exists, skipping\e[0m"
    continue
  fi

  echo -e "\e[1;34m[$((idx+1))/$total] Downloading $file\e[0m"
  tmp_file=$(mktemp)
  wget -q --show-progress "'.$GLOBALS['base_url'].'//print_image.php?filename=$file" -O "$tmp_file" 2>&1 | while read -r line; do
    if [[ $line =~ ([0-9]{1,3})% ]]; then
      percent="${BASH_REMATCH[1]}"
      printf "\r"
      draw_bar "$percent"
    fi
  done
  mv "$tmp_file" "images/$file"
done

if [[ $exit_after_download == 1 ]]; then
  exit 0
fi

cmd="yolo detect train data=$DATA model=$MODEL epochs=$epochs batch=$batch imgsz=$imgsz"

cmd+=" lr0=$lr0 lrf=$lrf momentum=$momentum weight_decay=$weight_decay"
cmd+=" warmup_epochs=$warmup_epochs warmup_momentum=$warmup_momentum warmup_bias_lr=$warmup_bias_lr"
cmd+=" hsv_h=$hsv_h hsv_s=$hsv_s hsv_v=$hsv_v"
cmd+=" degrees=$degrees translate=$translate scale=$scale shear=$shear perspective=$perspective"
cmd+=" fliplr=$fliplr mosaic=$mosaic mixup=$mixup copy_paste=$copy_paste"

if [[ -n "$device" ]]; then
  cmd+=" device=$device"
fi

echo "Running: $cmd"
eval "$cmd"
exit_code=$?

if [[ $exit_code -ne 0 ]]; then
  echo "yolo failed with exit-code $exit_code"
  exit $exit_code
fi

run_dir="runs/detect/train/weights/"
if [[ -d $run_dir ]]; then
  echo "Training done, weights in $run_dir"
  exit 0
else
  echo "Error: $run_dir could not be found"
  exit 1
fi';

		file_put_contents("$tmp_dir/train", $train_bash);
	}

	function get_rand_between_0_and_1 () {
		return mt_rand() / mt_getrandmax();
	}

	function parse_position_yolo ($x, $y, $w, $h, $imgw, $imgh) {
		if(0 > $x) { $x = 0; }
		if(0 > $y) { $y = 0; }
		if(0 > $w) { $w = 0; }
		if(0 > $h) { $h = 0; }

		$res["x_center"] = (((2 * $x) + $w) / 2) / $imgw;
		$res["y_center"] = (((2 * $y) + $h) / 2) / $imgh;

		$res["w_rel"] = $w / $imgw;
		$res["h_rel"] = $h / $imgh;

		return $res;
	}

	function _create_internal_html ($number_of_rows = 0, $items_per_page = 0, $images = [], $html = "") {
	    if($html == "") {
		$html = file_get_contents("export_base.html");
	    }

	    // <object-class> <x> <y> <width> <height>
	    if(count($images)) {
		$base_structs = [];

		foreach ($images as $fn => $img_data) {
		    $w = $img_data[0]["width"];
		    $h = $img_data[0]["height"];

		    $base_structs[] = '<div class="container_div" style="position: relative; display: inline-block;">';
		    $base_structs[] = '  <img class="images" src="print_image.php?filename='.$fn.'" style="display: block;">';

		    // ein einziges svg für alle Annotations
		    $annotations = [];
		    foreach ($img_data as $this_anno_data) {
			$id = isset($this_anno_data["id"]) ? (string)$this_anno_data["id"] : '';
			$cat = isset($this_anno_data["category"]) ? (string)$this_anno_data["category"] : "";
			$x = isset($this_anno_data["x_start"]) ? floatval($this_anno_data["x_start"]) : 0.0;
			$y = isset($this_anno_data["y_start"]) ? floatval($this_anno_data["y_start"]) : 0.0;
			$width  = isset($this_anno_data["w"]) ? floatval($this_anno_data["w"]) : 0.0;
			$height = isset($this_anno_data["h"]) ? floatval($this_anno_data["h"]) : 0.0;

			if ($width < 0) $width = 0;
			if ($height < 0) $height = 0;

			$esc_label = htmlspecialchars($cat, ENT_QUOTES, 'UTF-8');
			$esc_id = htmlspecialchars($id, ENT_QUOTES, 'UTF-8');

			$text_x = $x + ($width / 2.0);
			$text_y = max(4, $y - 4);

			$annotations[] = '<g class="a9s-annotation" data-id="'.$esc_id.'" data-label="'.$esc_label.'">'
			    . '<rect class="a9s-inner" x="'.$x.'" y="'.$y.'" width="'.$width.'" height="'.$height.'"></rect>'
			    . '<text style="display: none" class="a9s-label" x="'.$text_x.'" y="'.$text_y.'" text-anchor="middle" alignment-baseline="baseline" font-size="12" style="pointer-events:auto;">'.$esc_label.'</text>'
			    . '</g>';
		    }

		    $annotations_string = implode("\n", $annotations);

		    $base_structs[] = '<svg class="a9s-annotationlayer" width="'.$w.'" height="'.$h.'" viewBox="0 0 '.$w.' '.$h.'" style="position:absolute;left:0;top:0;pointer-events:none;" preserveAspectRatio="xMinYMin meet">'
			. '<g>'
			. $annotations_string
			. '</g>'
			. '</svg>';

		    $base_structs[] = '</div>';
		}

		$new_html = join("\n", $base_structs);
		$html = preg_replace("/REPLACEME/", $new_html, $html);
	    } else {
		$html = "No images for the chosen category";
	    }

	    return $html;
	}

	function print_export_html_and_exit ($number_of_rows, $items_per_page, $images) {
		$html = _create_internal_html($number_of_rows, $items_per_page, $images);

		// Inject all categories for the label filter bar
		$all_cats_for_js = [];
		$cat_query = "SELECT id, name FROM category ORDER BY name";
		$cat_res = rquery($cat_query);
		while ($row = mysqli_fetch_assoc($cat_res)) {
			$all_cats_for_js[] = ['id' => intval($row['id']), 'name' => $row['name']];
		}
		$all_categories_json = json_encode($all_cats_for_js);
		$html = str_replace('</body>',
			'<script>window.__ALL_CATEGORIES = ' . $all_categories_json . ';</script></body>',
			$html);

		print($html);
		include("footer.php");
		exit(0);
	}

	function write_bash_files ($tmp_dir, $epochs, $model_name) {
		write_train_bash($tmp_dir, $epochs, $model_name);
		write_visualization_script($tmp_dir);
	}

	function get_number_of_rows () {
		$number_of_rows_query = "SELECT FOUND_ROWS()";
		$number_of_rows_res = rquery($number_of_rows_query);
		$number_of_rows = 0;

		while ($row = mysqli_fetch_row($number_of_rows_res)) {
			$number_of_rows = $row[0];
		}

		return $number_of_rows;
	}

	function get_annotated_image_ids_query ($max_truncation=100, $show_categories=0, $only_uncurated=0, $format="ultralytics_yolov5", $limit=0, $items_per_page=0, $offset=0, $only_curated=0, $show_files=[]) {
		$annotated_image_ids_query = "select SQL_CALC_FOUND_ROWS i.filename, i.width, i.height, c.name, a.x_start, a.y_start, a.w, a.h, a.id, left(i.perception_hash, $max_truncation) as truncated_perception_hash from annotation a left join image i on i.id = a.image_id left join category c on c.id = a.category_id where i.id in (select id from image where id in (select image_id from annotation where deleted = '0' group by image_id)) and i.deleted = 0 ";

		if($show_categories && count($show_categories)) {
			$annotated_image_ids_query .= " and c.name in (".esc($show_categories).") ";
		}

		if($show_files && count($show_files)) {
			$annotated_image_ids_query .= " and i.filename in (".esc($show_files).") ";
		}

		if($only_uncurated) {
			$annotated_image_ids_query .= " and (a.curated is null or a.curated = 0 or a.curated = '0') ";
		}

		if($only_curated) {
			$annotated_image_ids_query .= " and (a.curated = 1 or a.curated = '1') "; 
		}

		if ($format == "html") {
			// Build a subquery that paginates by DISTINCT image id
			$image_page_subquery = "SELECT DISTINCT a2.image_id FROM annotation a2"
				. " LEFT JOIN image i2 ON i2.id = a2.image_id"
				. " LEFT JOIN category c2 ON c2.id = a2.category_id"
				. " WHERE a2.deleted = '0' AND i2.deleted = 0";

			// Re-apply the same filters to the subquery
			if ($show_categories && count($show_categories)) {
				$image_page_subquery .= " AND c2.name IN (" . esc($show_categories) . ")";
			}

			if ($show_files && count($show_files)) {
				$image_page_subquery .= " AND i2.filename IN (" . esc($show_files) . ")";
			}

			if ($only_uncurated) {
				$image_page_subquery .= " AND (a2.curated IS NULL OR a2.curated = 0 OR a2.curated = '0')";
			}

			if ($only_curated) {
				$image_page_subquery .= " AND (a2.curated = 1 OR a2.curated = '1')";
			}

			$image_page_subquery .= " ORDER BY i2.filename"
				. " LIMIT " . intval($offset) . ", " . intval($items_per_page);

			// Wrap in a derived table — MySQL requires this for ORDER BY + LIMIT inside IN()
			$annotated_image_ids_query .= " AND i.id IN (SELECT sub.image_id FROM (" . $image_page_subquery . ") AS sub)";
			$annotated_image_ids_query .= " ORDER BY i.filename, a.modified";
		} else if($limit) {
			$annotated_image_ids_query .= " order by rand()";
			$annotated_image_ids_query .= " limit ".intval(get_get("limit"));
		} else {
			$annotated_image_ids_query .= " order by rand()";
		}

		return $annotated_image_ids_query;
	}

	function create_tmp_dir () {
		$tmp_name = generateRandomString(20);
		$tmp_dir = "/tmp/$tmp_name";
		while (is_dir($tmp_dir)) {
			$tmp_name = generateRandomString(20);
			$tmp_dir = "tmp/$tmp_name";
		}

		ob_start();
		system("mkdir -p $tmp_dir");
		ob_clean();

		return $tmp_dir;
	}
?>
