async function run_additional_tests() {
    console.log("\n=== RUNNING ADDITIONAL TESTS ===");

    let passed = 0;
    let failed = 0;

    function assert(condition, msg) {
        if (condition) {
            console.log("✓ PASS:", msg);
            passed++;
        } else {
            console.error("✖ FAIL:", msg);
            failed++;
        }
    }

    // Predefined boxes for IOU tests
    const boxA = [0, 0, 10, 10];
    const boxB = [5, 5, 15, 15];

    // --- uuidv4 additional ---
    console.log("\n--- uuidv4 additional ---");
    const id = uuidv4();
    assert(id.split('-').length === 5, "uuidv4 has 5 segments separated by '-'");
    assert(id.toLowerCase() === id, "uuidv4 is lowercase");

    // --- getNewURL additional ---
    console.log("\n--- getNewURL additional ---");
    assert(getNewURL("http://example.com?x=1&y=2", "z", null).includes("z=null"), "getNewURL handles null value");
    assert(getNewURL("http://example.com?x=1", "x", undefined).includes("x=undefined"), "getNewURL handles undefined value");
    assert(getNewURL("http://example.com?x=1", "x", "").includes("x="), "getNewURL handles empty string value");

    // --- iou additional ---
    console.log("\n--- iou additional ---");
    const boxZero = [0,0,0,0];
    assert(iou(boxZero, boxA) === 0, "iou with zero-size box = 0");
    assert(iou(boxA, boxZero) === 0, "iou commutes with zero-size box");
    assert(iou([0,0,1,1], [1,1,2,2]) === 0, "iou boxes touching at corner = 0");

    // --- getShape additional ---
    console.log("\n--- getShape additional ---");
    assert(JSON.stringify(getShape([[[1],[2]], [[3],[4]]])) === JSON.stringify([2,2,1]), "getShape non-uniform but rectangular 3D array");
    assert(JSON.stringify(getShape([[[1,2], [3,4]], [[5,6], [7,8]]])) === JSON.stringify([2,2,2]), "getShape 3D uniform array");

    // --- get_names_from_ki_anno additional ---
    console.log("\n--- get_names_from_ki_anno additional ---");
    const sampleAnno6 = [{body:[{value:null}, {value:""}]}];
    const names6 = get_names_from_ki_anno(sampleAnno6);
    assert(names6[null] === 1 && names6[""] === 1, "get_names_from_ki_anno handles null and empty string");

    // --- get_annotate_element additional ---
    console.log("\n--- get_annotate_element additional ---");
    if ($("#image").length > 0) {
        const a = get_annotate_element("test", 0, 0, 1, 1);
        assert(a.id.length > 1, "annotation ID exists");
        assert(a.body[0].value === "test", "annotation label correct");
        const a2 = get_annotate_element("test", 0, 0, 1, 1, "extra");
        assert(a2 !== null, "annotation accepts extra parameters gracefully");
    }

    console.log(`\n=== ADDITIONAL TESTS DONE: ${passed} passed, ${failed} failed ===`);

	async function run_edge_case_tests() {
		console.log("\n=== RUNNING EDGE CASE TESTS ===");

		let passed = 0;
		let failed = 0;

		function assert(condition, msg) {
			if (condition) {
				console.log("✓ PASS:", msg);
				passed++;
			} else {
				console.error("✖ FAIL:", msg);
				failed++;
			}
		}

		// --- uuidv4 format stricter checks ---
		console.log("\n--- uuidv4 stricter format ---");
		const id = uuidv4();
		assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id), "uuidv4 matches RFC4122 v4 format");

		// --- getNewURL edge cases ---
		console.log("\n--- getNewURL edge cases ---");
		const urlHash = getNewURL("http://example.com#section", "param", "value");
		assert(urlHash.includes("param=value") && urlHash.includes("#section"), "getNewURL preserves fragment (#) part");

		// --- iou edge cases ---
		console.log("\n--- iou edge cases ---");
		assert(iou([0,0,10,10], [10,10,0,0]) === 0, "iou handles inverted box coords gracefully");
		assert(iou([-5,-5,0,0], [0,0,5,5]) === 0, "iou handles negative coordinates without crash");
		assert(iou([0,0,1,1], [0,0,1,1]) === 1, "iou identical minimal box = 1");

		// --- get_names_from_ki_anno with weird values ---
		console.log("\n--- get_names_from_ki_anno weird values ---");
		const sampleAnnoWeird = [
			{ body: [{ value: 0 }, { value: false }, { value: null }] },
			{ body: [{ value: undefined }, { value: "" }] }
		];
		const namesWeird = get_names_from_ki_anno(sampleAnnoWeird);
		assert(namesWeird[0] === 1, "numeric 0 counted");
		assert(namesWeird[false] === 1, "boolean false counted");
		assert(namesWeird[null] === 1, "null counted");
		assert(namesWeird[undefined] === 1, "undefined counted");
		assert(namesWeird[""] === 1, "empty string counted");

		// --- get_annotate_element optional params ---
		console.log("\n--- get_annotate_element optional params ---");
		if ($("#image").length > 0) {
			const a = get_annotate_element("test", 0, 0, 1, 1, "extra1", "extra2");
			assert(a !== null && a.body[0].value === "test", "get_annotate_element accepts multiple extra params gracefully");
		}

		console.log(`\n=== EDGE CASE TESTS DONE: ${passed} passed, ${failed} failed ===`);
		return failed;
	}

	// Run it at the end of your main test suite
	assert(await run_edge_case_tests() === 0, "edge case tests failed");

    return failed;
}

async function test_load_model_and_predict() {
	const $chosen_model = $("#chosen_model");
	if($chosen_model.children().length <= 0) {
		console.error(`#chosen_model does not have more than 0 inputs`);
		return false;
	}

	const load_this_model = $($chosen_model.children()[1]).val()

	console.log(`Loading ${load_this_model}`);

	$chosen_model.val(load_this_model);

	await load_model_and_predict();

	console.debug("Waiting 2 seconds");
	await sleep(2000);

	if($(".ki_select_box").children().length <= 0) {
		console.error(`.ki_select_box does not have more than 0 children`);
		return false;
	}

	if($(".ki_select_box").children().eq(0).val() != "cat") {
		console.error(`Detected category is not 'cat'`);
		return false;
	}

	return true;
}

async function run_multi_label_tests() {
    console.log("\n=== RUNNING MULTI-LABEL TESTS ===");

    let passed = 0;
    let failed = 0;

    function assert(condition, msg) {
        if (condition) {
            console.log("✓ PASS:", msg);
            passed++;
        } else {
            console.error("✖ FAIL:", msg);
            failed++;
        }
    }

    // =========================================================================
    // TEST GROUP 1: filterByConfidence with RELATIVE multi-label threshold
    // =========================================================================
    console.log("\n--- filterByConfidence: relative threshold logic ---");

    // Helper: create mock tensors for filterByConfidence
    function makeFilterInputs(boxesArr, scoresArr) {
        return {
            boxes: tf.tensor2d(boxesArr),
            scores: tf.tensor2d(scoresArr)
        };
    }

    // Save and mock slider values
    const origGetMultiLabel = window.getMultiLabelThreshold;
    const origGetConf = window.getConfThreshold;
    const origGetIou = window.getIouThreshold;

    // Test 1.1: With relative threshold 0.8, bestScore=0.9 → relativeThreshold=0.72
    // Class scores: [0.9, 0.75, 0.5] → classes 0 and 1 should pass (0.75 >= 0.72), class 2 should not (0.5 < 0.72)
    {
        window.getMultiLabelThreshold = () => 0.8;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.5, 0.5]],
            [[0.9, 0.75, 0.5]]
        );
        const result = filterByConfidence(boxes, scores, 0.3);
        assert(result.classes.length === 1, "1.1: One box kept");
        assert(result.classes[0].includes(0), "1.1: Best class 0 included");
        assert(result.classes[0].includes(1), "1.1: Class 1 (0.75 >= 0.72) included");
        assert(!result.classes[0].includes(2), "1.1: Class 2 (0.5 < 0.72) excluded");
        assert(result.classes[0].length === 2, "1.1: Exactly 2 classes matched");
        boxes.dispose(); scores.dispose();
    }

    // Test 1.2: With relative threshold 0.5, bestScore=0.9 → relativeThreshold=0.45
    // Class scores: [0.9, 0.75, 0.5] → ALL classes should pass
    {
        window.getMultiLabelThreshold = () => 0.5;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.5, 0.5]],
            [[0.9, 0.75, 0.5]]
        );
        const result = filterByConfidence(boxes, scores, 0.3);
        assert(result.classes[0].length === 3, "1.2: All 3 classes pass with low relative threshold");
        boxes.dispose(); scores.dispose();
    }

    // Test 1.3: With relative threshold 1.0, only the best class should pass
    {
        window.getMultiLabelThreshold = () => 1.0;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.5, 0.5]],
            [[0.9, 0.75, 0.5]]
        );
        const result = filterByConfidence(boxes, scores, 0.3);
        assert(result.classes[0].length === 1, "1.3: Only best class passes with threshold=1.0");
        assert(result.classes[0][0] === 0, "1.3: Best class is 0");
        boxes.dispose(); scores.dispose();
    }

    // Test 1.4: Box below confidence threshold should be filtered out entirely
    {
        window.getMultiLabelThreshold = () => 0.8;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.5, 0.5]],
            [[0.2, 0.15, 0.1]]
        );
        const result = filterByConfidence(boxes, scores, 0.3);
        assert(result.boxes.length === 0, "1.4: Box with bestScore=0.2 filtered out (conf=0.3)");
        boxes.dispose(); scores.dispose();
    }

    // Test 1.5: Multiple boxes, some pass, some don't
    {
        window.getMultiLabelThreshold = () => 0.8;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.3, 0.3], [0.5, 0.5, 0.8, 0.8], [0.2, 0.2, 0.4, 0.4]],
            [[0.9, 0.8, 0.1], [0.1, 0.05, 0.02], [0.5, 0.45, 0.3]]
        );
        const result = filterByConfidence(boxes, scores, 0.3);
        assert(result.boxes.length === 2, "1.5: 2 of 3 boxes pass confidence threshold");
        // First box: bestScore=0.9, relThresh=0.9*0.8=0.72 → classes 0 (0.9 ✓), 1 (0.8 ✓), 2 (0.1 ✗)
        assert(result.classes[0].length === 2, "1.5: First box has 2 classes");
        // Third box: bestScore=0.5, relThresh=0.5*0.8=0.40 → classes 0 (0.5 ✓), 1 (0.45 ✓), 2 (0.3 ✗)
        assert(result.classes[1].length === 2, "1.5: Third box has 2 classes (0.5 and 0.45 >= 0.4, but 0.3 < 0.4)");
        assert(result.classes[1].includes(0), "1.5: Third box includes class 0 (0.5 >= 0.4)");
        assert(result.classes[1].includes(1), "1.5: Third box includes class 1 (0.45 >= 0.4)");
        assert(!result.classes[1].includes(2), "1.5: Third box excludes class 2 (0.3 < 0.4)");
        boxes.dispose(); scores.dispose();
    }

    // Test 1.6: Empty input
    {
        window.getMultiLabelThreshold = () => 0.8;
        const boxes = tf.tensor2d([[0, 0, 0, 0]]).slice([0, 0], [0, 4]); // empty 2D tensor
        const scores = tf.tensor2d([[0]]).slice([0, 0], [0, 1]); // empty 2D tensor
        // filterByConfidence should handle empty gracefully
        try {
            const result = filterByConfidence(boxes, scores, 0.3);
            assert(result.boxes.length === 0, "1.6: Empty input returns empty result");
        } catch (e) {
            // If it throws on empty, that's also acceptable to note
            assert(false, "1.6: filterByConfidence threw on empty input: " + e.message);
        }
        boxes.dispose(); scores.dispose();
    }

    // Test 1.7: Two classes with identical scores
    {
        window.getMultiLabelThreshold = () => 0.8;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.5, 0.5]],
            [[0.85, 0.85, 0.1]]
        );
        const result = filterByConfidence(boxes, scores, 0.3);
        assert(result.classes[0].includes(0) && result.classes[0].includes(1),
            "1.7: Two classes with identical scores both included");
        assert(result.classes[0].length === 2, "1.7: Exactly 2 classes");
        boxes.dispose(); scores.dispose();
    }

    // =========================================================================
    // TEST GROUP 2: applyNMS with label merging
    // =========================================================================
    console.log("\n--- applyNMS: label merging from suppressed boxes ---");

    // Test 2.1: Two overlapping boxes with different labels → labels should merge
    {
        const filtered = {
            boxes: [
                [0.1, 0.1, 0.5, 0.5],  // box A
                [0.12, 0.12, 0.52, 0.52] // box B (heavily overlaps A)
            ],
            scores: [0.9, 0.8],
            classes: [[0], [1]]  // A has class 0, B has class 1
        };
        const result = applyNMS(filtered, 0.5);
        assert(result.boxes.length === 1, "2.1: NMS keeps 1 box");
        assert(result.classes[0].includes(0), "2.1: Kept box has class 0");
        assert(result.classes[0].includes(1), "2.1: Kept box merged class 1 from suppressed box");
    }

    // Test 2.2: Two non-overlapping boxes → no merging
    {
        const filtered = {
            boxes: [
                [0.0, 0.0, 0.2, 0.2],
                [0.8, 0.8, 1.0, 1.0]
            ],
            scores: [0.9, 0.85],
            classes: [[0], [1]]
        };
        const result = applyNMS(filtered, 0.5);
        assert(result.boxes.length === 2, "2.2: Both non-overlapping boxes kept");
        assert(result.classes[0].length === 1 && result.classes[0][0] === 0, "2.2: First box only has class 0");
        assert(result.classes[1].length === 1 && result.classes[1][0] === 1, "2.2: Second box only has class 1");
    }

    // Test 2.3: Three overlapping boxes, labels should all merge into the best one
    {
        const filtered = {
            boxes: [
                [0.1, 0.1, 0.5, 0.5],
                [0.11, 0.11, 0.51, 0.51],
                [0.12, 0.12, 0.52, 0.52]
            ],
            scores: [0.95, 0.85, 0.80],
            classes: [[0], [1, 2], [3]]
        };
        const result = applyNMS(filtered, 0.5);
        assert(result.boxes.length === 1, "2.3: NMS keeps 1 box from 3 overlapping");
        assert(result.classes[0].includes(0), "2.3: Has class 0 from best box");
        assert(result.classes[0].includes(1), "2.3: Merged class 1");
        assert(result.classes[0].includes(2), "2.3: Merged class 2");
        assert(result.classes[0].includes(3), "2.3: Merged class 3");
    }

    // Test 2.4: Empty input
    {
        const result = applyNMS({ boxes: [], scores: [], classes: [] }, 0.5);
        assert(result.boxes.length === 0, "2.4: Empty input returns empty");
    }

    // Test 2.5: Single box passes through unchanged
    {
        const filtered = {
            boxes: [[0.1, 0.1, 0.5, 0.5]],
            scores: [0.9],
            classes: [[0, 2, 5]]
        };
        const result = applyNMS(filtered, 0.5);
        assert(result.boxes.length === 1, "2.5: Single box kept");
        assert(JSON.stringify(result.classes[0].sort()) === JSON.stringify([0, 2, 5]),
            "2.5: Single box classes unchanged");
    }

    // Test 2.6: Duplicate classes from merge are deduplicated
    {
        const filtered = {
            boxes: [
                [0.1, 0.1, 0.5, 0.5],
                [0.11, 0.11, 0.51, 0.51]
            ],
            scores: [0.9, 0.8],
            classes: [[0, 1], [1, 2]]  // class 1 appears in both
        };
        const result = applyNMS(filtered, 0.5);
        assert(result.boxes.length === 1, "2.6: NMS keeps 1 box");
        const uniqueClasses = [...new Set(result.classes[0])];
        assert(uniqueClasses.length === result.classes[0].length,
            "2.6: No duplicate classes after merge (Set-based dedup works)");
        assert(result.classes[0].includes(0) && result.classes[0].includes(1) && result.classes[0].includes(2),
            "2.6: All unique classes present: 0, 1, 2");
    }

    // =========================================================================
    // TEST GROUP 3: handleAnnotations with multi-label classes
    // =========================================================================
    console.log("\n--- handleAnnotations: multi-label annotation creation ---");

    // Test 3.1: get_annotate_element with multiple labels
    if ($("#image").length > 0) {
        {
            const elem = get_annotate_element(["cat", "animal"], 10, 20, 100, 200);
            assert(elem !== null, "3.1: get_annotate_element accepts array of labels");
            assert(elem.body.length === 2, "3.1: Body has 2 entries for 2 labels");
            assert(elem.body[0].value === "cat", "3.1: First body value is 'cat'");
            assert(elem.body[1].value === "animal", "3.1: Second body value is 'animal'");
            assert(elem.body[0].purpose === "tagging", "3.1: First body purpose is 'tagging'");
            assert(elem.body[1].purpose === "tagging", "3.1: Second body purpose is 'tagging'");
        }

        // Test 3.2: get_annotate_element with single label (string) still works
        {
            const elem = get_annotate_element("dog", 10, 20, 100, 200);
            assert(elem !== null, "3.2: get_annotate_element accepts single string label");
            assert(elem.body.length === 1, "3.2: Body has 1 entry for single label");
            assert(elem.body[0].value === "dog", "3.2: Body value is 'dog'");
        }

        // Test 3.3: get_annotate_element with single label in array
        {
            const elem = get_annotate_element(["bird"], 10, 20, 100, 200);
            assert(elem !== null, "3.3: get_annotate_element accepts single-element array");
            assert(elem.body.length === 1, "3.3: Body has 1 entry");
            assert(elem.body[0].value === "bird", "3.3: Body value is 'bird'");
        }

        // Test 3.4: get_annotate_element with many labels
        {
            const many_labels = ["cat", "animal", "pet", "mammal", "feline"];
            const elem = get_annotate_element(many_labels, 5, 5, 50, 50);
            assert(elem !== null, "3.4: get_annotate_element accepts 5 labels");
            assert(elem.body.length === 5, "3.4: Body has 5 entries");
            for (let i = 0; i < many_labels.length; i++) {
                assert(elem.body[i].value === many_labels[i],
                    `3.4: Body[${i}] value is '${many_labels[i]}'`);
            }
        }

        // Test 3.5: get_annotate_element with empty array should still produce valid structure
        {
            const elem = get_annotate_element([], 10, 20, 100, 200);
            assert(elem !== null, "3.5: get_annotate_element accepts empty array");
            assert(elem.body.length === 0, "3.5: Body is empty array for empty labels");
        }
    }

    // =========================================================================
    // TEST GROUP 4: processModelOutput slider integration
    // =========================================================================
    console.log("\n--- processModelOutput: slider integration ---");

    // CRITICAL FIX: Restore original slider functions before testing them.
    // Tests in Groups 1-3 override these with mocks. We must restore them
    // so that Group 4 actually tests the real DOM-reading functions.
    window.getMultiLabelThreshold = origGetMultiLabel;
    window.getConfThreshold = origGetConf;
    window.getIouThreshold = origGetIou;

    // Test 4.1: Verify getConfThreshold reads from slider
    {
        // Create a mock slider if not present
        let slider = document.getElementById('conf_slider');
        const created = !slider;
        if (!slider) {
            slider = document.createElement('input');
            slider.type = 'range';
            slider.id = 'conf_slider';
            slider.min = 0;
            slider.max = 1;
            slider.step = 0.01;
            slider.value = 0.55;
            document.body.appendChild(slider);
        } else {
            var oldVal = slider.value;
            slider.value = 0.55;
        }

        const confVal = getConfThreshold();
        assert(Math.abs(confVal - 0.55) < 0.001, "4.1: getConfThreshold reads slider value 0.55");

        if (created) {
            slider.remove();
        } else {
            slider.value = oldVal;
        }
    }

    // Test 4.2: Verify getIouThreshold reads from slider
    {
        let slider = document.getElementById('iou_slider');
        const created = !slider;
        if (!slider) {
            slider = document.createElement('input');
            slider.type = 'range';
            slider.id = 'iou_slider';
            slider.min = 0;
            slider.max = 1;
            slider.step = 0.01;
            slider.value = 0.65;
            document.body.appendChild(slider);
        } else {
            var oldVal = slider.value;
            slider.value = 0.65;
        }

        const iouVal = getIouThreshold();
        assert(Math.abs(iouVal - 0.65) < 0.001, "4.2: getIouThreshold reads slider value 0.65");

        if (created) {
            slider.remove();
        } else {
            slider.value = oldVal;
        }
    }

    // Test 4.3: Verify getMultiLabelThreshold reads from slider
    {
        let slider = document.getElementById('multilabel_slider');
        const created = !slider;
        if (!slider) {
            slider = document.createElement('input');
            slider.type = 'range';
            slider.id = 'multilabel_slider';
            slider.min = 0;
            slider.max = 1;
            slider.step = 0.01;
            slider.value = 0.75;
            document.body.appendChild(slider);
        } else {
            var oldVal = slider.value;
            slider.value = 0.75;
        }

        const mlVal = getMultiLabelThreshold();
        assert(Math.abs(mlVal - 0.75) < 0.001, "4.3: getMultiLabelThreshold reads slider value 0.75");

        if (created) {
            slider.remove();
        } else {
            slider.value = oldVal;
        }
    }

    // Test 4.4: Verify defaults when sliders don't exist
    {
        // Temporarily remove sliders
        const confSlider = document.getElementById('conf_slider');
        const iouSlider = document.getElementById('iou_slider');
        const mlSlider = document.getElementById('multilabel_slider');

        if (confSlider) confSlider.id = 'conf_slider_backup';
        if (iouSlider) iouSlider.id = 'iou_slider_backup';
        if (mlSlider) mlSlider.id = 'multilabel_slider_backup';

        assert(getConfThreshold() === 0.3, "4.4a: getConfThreshold defaults to 0.3 without slider");
        assert(getIouThreshold() === 0.5, "4.4b: getIouThreshold defaults to 0.5 without slider");
        assert(getMultiLabelThreshold() === 0.8, "4.4c: getMultiLabelThreshold defaults to 0.8 without slider");

        if (confSlider) confSlider.id = 'conf_slider';
        if (iouSlider) iouSlider.id = 'iou_slider';
        if (mlSlider) mlSlider.id = 'multilabel_slider';
    }

    // =========================================================================
    // TEST GROUP 5: End-to-end filterByConfidence + applyNMS pipeline
    // =========================================================================
    console.log("\n--- End-to-end: filterByConfidence → applyNMS pipeline ---");

    // Test 5.1: Full pipeline with multi-label detection
    {
        window.getMultiLabelThreshold = () => 0.7;
        const { boxes, scores } = makeFilterInputs(
            [
                [0.1, 0.1, 0.4, 0.4],   // box 0
                [0.5, 0.5, 0.9, 0.9],   // box 1 (no overlap with box 0)
                [0.11, 0.11, 0.41, 0.41] // box 2 (overlaps heavily with box 0)
            ],
            [
                [0.9, 0.7, 0.1],  // box 0: classes 0,1 should pass (0.7 >= 0.9*0.7=0.63)
                [0.3, 0.1, 0.85], // box 1: class 2 best, class 0 at 0.3 < 0.85*0.7=0.595
                [0.8, 0.1, 0.6]   // box 2: class 0 best, class 2 at 0.6 >= 0.8*0.7=0.56
            ]
        );

        const filtered = filterByConfidence(boxes, scores, 0.25);
        assert(filtered.boxes.length === 3, "5.1a: All 3 boxes pass confidence threshold 0.25");

        // Box 0: bestScore=0.9, relThresh=0.63 → classes 0 (0.9), 1 (0.7) pass
        assert(filtered.classes[0].includes(0) && filtered.classes[0].includes(1),
            "5.1b: Box 0 has classes 0 and 1");
        assert(!filtered.classes[0].includes(2), "5.1c: Box 0 excludes class 2 (0.1 < 0.63)");

        // Box 1: bestScore=0.85, relThresh=0.595 → only class 2 passes
        assert(filtered.classes[1].includes(2), "5.1d: Box 1 has class 2");
        assert(filtered.classes[1].length === 1, "5.1e: Box 1 has only 1 class");

        // Box 2: bestScore=0.8, relThresh=0.56 → classes 0 (0.8), 2 (0.6) pass
        assert(filtered.classes[2].includes(0) && filtered.classes[2].includes(2),
            "5.1f: Box 2 has classes 0 and 2");

        // Now apply NMS — boxes 0 and 2 overlap, box 0 has higher score
        const nmsResult = applyNMS(filtered, 0.5);

        // Box 0 should be kept, box 2 suppressed (and its labels merged into box 0)
        // Box 1 should be kept (no overlap)
        assert(nmsResult.boxes.length === 2, "5.1g: NMS keeps 2 boxes (0 and 1)");

        // The kept box that was originally box 0 should now also have class 2 merged from box 2
        const keptBox0 = nmsResult.boxes.findIndex(b =>
            Math.abs(b[0] - 0.1) < 0.01 && Math.abs(b[1] - 0.1) < 0.01
        );
        assert(keptBox0 !== -1, "5.1h: Box 0 is in the NMS result");
        if (keptBox0 !== -1) {
            assert(nmsResult.classes[keptBox0].includes(0), "5.1i: Merged box has class 0");
            assert(nmsResult.classes[keptBox0].includes(1), "5.1j: Merged box has class 1 (from original box 0)");
            assert(nmsResult.classes[keptBox0].includes(2), "5.1k: Merged box has class 2 (merged from suppressed box 2)");
        }

        boxes.dispose(); scores.dispose();
    }

    // Test 5.2: Pipeline with all boxes below confidence → empty result
    {
        window.getMultiLabelThreshold = () => 0.8;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.5, 0.5], [0.6, 0.6, 0.9, 0.9]],
            [[0.1, 0.05], [0.15, 0.08]]
        );
        const filtered = filterByConfidence(boxes, scores, 0.3);
        assert(filtered.boxes.length === 0, "5.2a: No boxes pass confidence 0.3");
        const nmsResult = applyNMS(filtered, 0.5);
        assert(nmsResult.boxes.length === 0, "5.2b: NMS on empty input returns empty");
        boxes.dispose(); scores.dispose();
    }

    // Test 5.3: Pipeline with single box, single class
    {
        window.getMultiLabelThreshold = () => 0.8;
        const { boxes, scores } = makeFilterInputs(
            [[0.2, 0.2, 0.6, 0.6]],
            [[0.95, 0.1, 0.05]]
        );
        const filtered = filterByConfidence(boxes, scores, 0.3);
        assert(filtered.boxes.length === 1, "5.3a: Single box passes");
        assert(filtered.classes[0].length === 1, "5.3b: Only best class passes (0.1 < 0.95*0.8=0.76)");
        assert(filtered.classes[0][0] === 0, "5.3c: Best class is 0");
        const nmsResult = applyNMS(filtered, 0.5);
        assert(nmsResult.boxes.length === 1, "5.3d: Single box survives NMS");
        assert(nmsResult.classes[0].length === 1, "5.3e: Still single class after NMS");
        boxes.dispose(); scores.dispose();
    }

    // =========================================================================
    // TEST GROUP 6: iou helper function edge cases for NMS merging
    // =========================================================================
    console.log("\n--- iou: edge cases for NMS merging ---");

    // Test 6.1: Perfectly overlapping boxes
    {
        const overlap = iou([0.1, 0.1, 0.5, 0.5], [0.1, 0.1, 0.5, 0.5]);
        assert(overlap === 1.0, "6.1: Identical boxes have IoU = 1.0");
    }

    // Test 6.2: Slightly shifted boxes (high overlap)
    {
        const overlap = iou([0.1, 0.1, 0.5, 0.5], [0.12, 0.12, 0.52, 0.52]);
        assert(overlap > 0.8, "6.2: Slightly shifted boxes have IoU > 0.8");
    }

    // Test 6.3: Non-overlapping boxes
    {
        const overlap = iou([0.0, 0.0, 0.2, 0.2], [0.8, 0.8, 1.0, 1.0]);
        assert(overlap === 0, "6.3: Non-overlapping boxes have IoU = 0");
    }

    // Test 6.4: Partial overlap
    {
        const overlap = iou([0.0, 0.0, 0.5, 0.5], [0.25, 0.25, 0.75, 0.75]);
        assert(overlap > 0 && overlap < 0.5, "6.4: Partial overlap IoU is between 0 and 0.5");
    }

    // =========================================================================
    // TEST GROUP 7: Relative vs Absolute threshold comparison
    // =========================================================================
    console.log("\n--- Relative vs Absolute threshold behavior ---");

    // Test 7.1: Demonstrate the old bug — absolute threshold 0.8 misses valid secondary classes
    {
        // Simulate OLD behavior: absolute threshold
        function filterAbsolute(scoresArr, confThreshold, absThreshold) {
            const results = [];
            for (let i = 0; i < scoresArr.length; i++) {
                const classScores = scoresArr[i];
                let bestScore = 0, bestClass = -1;
                for (let c = 0; c < classScores.length; c++) {
                    if (classScores[c] > bestScore) { bestScore = classScores[c]; bestClass = c; }
                }
                if (bestScore < confThreshold) continue;
                const matched = [];
                for (let c = 0; c < classScores.length; c++) {
                    if (classScores[c] >= absThreshold) matched.push(c);
                }
                if (matched.length === 0) matched.push(bestClass);
                results.push(matched);
            }
            return results;
        }

        // Simulate NEW behavior: relative threshold
        function filterRelative(scoresArr, confThreshold, relThreshold) {
            const results = [];
            for (let i = 0; i < scoresArr.length; i++) {
                const classScores = scoresArr[i];
                let bestScore = 0, bestClass = -1;
                for (let c = 0; c < classScores.length; c++) {
                    if (classScores[c] > bestScore) { bestScore = classScores[c]; bestClass = c; }
                }
                if (bestScore < confThreshold) continue;
                const relativeBar = bestScore * relThreshold;
                const matched = [];
                for (let c = 0; c < classScores.length; c++) {
                    if (classScores[c] >= relativeBar) matched.push(c);
                }
                if (matched.length === 0) matched.push(bestClass);
                results.push(matched);
            }
            return results;
        }

        // Scenario: bestScore=0.75, secondary=0.65. Absolute threshold=0.8 misses BOTH.
        const scores = [[0.75, 0.65, 0.1]];

        const absResult = filterAbsolute(scores, 0.3, 0.8);
        assert(absResult[0].length === 1, "7.1a: OLD absolute threshold=0.8 only keeps best class (fallback)");

        const relResult = filterRelative(scores, 0.3, 0.8);
        // relativeBar = 0.75 * 0.8 = 0.6 → both 0.75 and 0.65 pass
        assert(relResult[0].length === 2, "7.1b: NEW relative threshold=0.8 keeps 2 classes (0.75 and 0.65 >= 0.6)");
        assert(relResult[0].includes(0) && relResult[0].includes(1),
            "7.1c: NEW relative threshold correctly includes classes 0 and 1");
    }

    // Test 7.2: When bestScore is very high, relative threshold is more permissive
    {
        window.getMultiLabelThreshold = () => 0.8;
        const { boxes, scores } = makeFilterInputs(
            [[0.1, 0.1, 0.5, 0.5]],
            [[0.95, 0.78, 0.76, 0.5]]
        );
        // relativeBar = 0.95 * 0.8 = 0.76
        // Classes: 0 (0.95 ✓), 1 (0.78 ✓), 2 (0.76 ✓), 3 (0.5 ✗)
        const result = filterByConfidence(boxes, scores, 0.3);
        assert(result.classes[0].length === 3, "7.2: With bestScore=0.95, 3 classes pass relative threshold 0.76");
        assert(result.classes[0].includes(0), "7.2a: Class 0 included");
        assert(result.classes[0].includes(1), "7.2b: Class 1 included");
        assert(result.classes[0].includes(2), "7.2c: Class 2 included");
        assert(!result.classes[0].includes(3), "7.2d: Class 3 excluded (0.5 < 0.76)");
        boxes.dispose(); scores.dispose();
    }

    // =========================================================================
    // TEST GROUP 8: get_names_from_ki_anno with multi-label annotations
    // =========================================================================
    console.log("\n--- get_names_from_ki_anno: multi-label annotations ---");

    // Test 8.1: Multi-label annotation bodies are counted correctly
    {
        const multiAnno = [
            { body: [{ value: "cat" }, { value: "animal" }] },
            { body: [{ value: "dog" }, { value: "animal" }] },
            { body: [{ value: "cat" }] }
        ];
        const names = get_names_from_ki_anno(multiAnno);
        assert(names["cat"] === 2, "8.1a: 'cat' appears 2 times");
        assert(names["animal"] === 2, "8.1b: 'animal' appears 2 times");
        assert(names["dog"] === 1, "8.1c: 'dog' appears 1 time");
    }

    // Test 8.2: Single-label annotations still work
    {
        const singleAnno = [
            { body: [{ value: "bird" }] },
            { body: [{ value: "bird" }] },
            { body: [{ value: "fish" }] }
        ];
        const names = get_names_from_ki_anno(singleAnno);
        assert(names["bird"] === 2, "8.2a: 'bird' counted correctly");
        assert(names["fish"] === 1, "8.2b: 'fish' counted correctly");
    }

    // =========================================================================
    // TEST GROUP 9: Stress tests
    // =========================================================================
    console.log("\n--- Stress tests ---");

    // Test 9.1: Many boxes through filterByConfidence
    {
        window.getMultiLabelThreshold = () => 0.7;
        const numBoxes = 500;
        const numClasses = 10;
        const boxesArr = [];
        const scoresArr = [];
        for (let i = 0; i < numBoxes; i++) {
            boxesArr.push([Math.random() * 0.5, Math.random() * 0.5,
                           Math.random() * 0.5 + 0.5, Math.random() * 0.5 + 0.5]);
            const classScores = [];
            for (let c = 0; c < numClasses; c++) {
                classScores.push(Math.random());
            }
            scoresArr.push(classScores);
        }
        const { boxes, scores } = makeFilterInputs(boxesArr, scoresArr);
        const startTime = performance.now();
        const result = filterByConfidence(boxes, scores, 0.3);
        const elapsed = performance.now() - startTime;
        assert(elapsed < 1000, `9.1: filterByConfidence on 500 boxes completes in ${elapsed.toFixed(1)}ms (< 1000ms)`);
        assert(result.boxes.length >= 0, "9.1: Returns valid result");
        // Verify all kept boxes have at least one class
        for (let i = 0; i < result.classes.length; i++) {
            assert(result.classes[i].length >= 1,
                `9.1: Box ${i} has at least 1 class`);
        }
        boxes.dispose(); scores.dispose();
    }

    // Test 9.2: Many boxes through full pipeline
    {
        window.getMultiLabelThreshold = () => 0.8;
        const numBoxes = 200;
        const boxesArr = [];
        const scoresArr = [];
        for (let i = 0; i < numBoxes; i++) {
            const x = Math.random() * 0.8;
            const y = Math.random() * 0.8;
            boxesArr.push([x, y, x + 0.1 + Math.random() * 0.1, y + 0.1 + Math.random() * 0.1]);
            scoresArr.push([Math.random(), Math.random(), Math.random()]);
        }
        const { boxes, scores } = makeFilterInputs(boxesArr, scoresArr);
        const filtered = filterByConfidence(boxes, scores, 0.3);
        const startTime = performance.now();
        const nmsResult = applyNMS(filtered, 0.5);
        const elapsed = performance.now() - startTime;
        assert(elapsed < 2000, `9.2: Full pipeline on 200 boxes completes in ${elapsed.toFixed(1)}ms (< 2000ms)`);
        assert(nmsResult.boxes.length <= filtered.boxes.length,
            "9.2: NMS reduces or maintains box count");
        // Verify all NMS results have valid classes
        for (let i = 0; i < nmsResult.classes.length; i++) {
            assert(Array.isArray(nmsResult.classes[i]) && nmsResult.classes[i].length >= 1,
                `9.2: NMS result box ${i} has valid classes array`);
        }
        boxes.dispose(); scores.dispose();
    }

    // =========================================================================
    // Restore original slider functions
    // =========================================================================
    window.getMultiLabelThreshold = origGetMultiLabel;
    window.getConfThreshold = origGetConf;
    window.getIouThreshold = origGetIou;

    // =========================================================================
    // Summary
    // =========================================================================
    console.log(`\n=== MULTI-LABEL TESTS DONE: ${passed} passed, ${failed} failed ===`);
    return failed;
}

async function run_untested_function_tests() {
    console.log("\n=== RUNNING UNTESTED FUNCTION TESTS ===");

    let passed = 0;
    let failed = 0;

    function assert(condition, msg) {
        if (condition) {
            console.log("✓ PASS:", msg);
            passed++;
        } else {
            console.error("✖ FAIL:", msg);
            failed++;
        }
    }

    // =========================================================================
    // 1. clamp()
    // =========================================================================
    console.log("\n--- clamp ---");
    assert(clamp(5, 0, 10) === 5, "clamp: value within range returns value");
    assert(clamp(-3, 0, 10) === 0, "clamp: value below min returns min");
    assert(clamp(15, 0, 10) === 10, "clamp: value above max returns max");
    assert(clamp(0, 0, 10) === 0, "clamp: value equal to min returns min");
    assert(clamp(10, 0, 10) === 10, "clamp: value equal to max returns max");
    assert(clamp(NaN, 0, 10) === 0, "clamp: NaN returns min (a)");
    assert(clamp(-Infinity, 0, 10) === 0, "clamp: -Infinity returns min");
    assert(clamp(Infinity, 0, 10) === 10, "clamp: Infinity returns max");
    assert(clamp(0.5, 0, 1) === 0.5, "clamp: works with floats in range");
    assert(clamp(-0.1, 0, 1) === 0, "clamp: works with negative float below min");
    assert(clamp(1.1, 0, 1) === 1, "clamp: works with float above max");

    // =========================================================================
    // 2. slider_to_zoom()
    // =========================================================================
    console.log("\n--- slider_to_zoom ---");
    assert(slider_to_zoom(0) === 1.0, "slider_to_zoom: 0 maps to 1.0 (100%)");
    assert(slider_to_zoom(5) > 1.0, "slider_to_zoom: +5 maps to > 1.0");
    assert(slider_to_zoom(-5) < 1.0, "slider_to_zoom: -5 maps to < 1.0");
    assert(slider_to_zoom(-5) >= 0.1, "slider_to_zoom: -5 maps to >= 0.1 (min_zoom)");
    assert(slider_to_zoom(5) <= 5.0, "slider_to_zoom: +5 maps to <= 5.0 (max_zoom)");
    // Monotonicity: higher slider value → higher zoom
    assert(slider_to_zoom(1) > slider_to_zoom(0), "slider_to_zoom: monotonically increasing (1 > 0)");
    assert(slider_to_zoom(3) > slider_to_zoom(2), "slider_to_zoom: monotonically increasing (3 > 2)");
    assert(slider_to_zoom(-1) < slider_to_zoom(0), "slider_to_zoom: monotonically increasing (-1 < 0)");
    assert(slider_to_zoom(-3) < slider_to_zoom(-2), "slider_to_zoom: monotonically increasing (-3 < -2)");

    // =========================================================================
    // 3. render_status / info / success / warn / error (status bar rendering)
    // =========================================================================
    console.log("\n--- render_status / info / success / warn / error ---");
    if ($("#status_bar_msg").length > 0) {
        render_status("red", "TestTitle", "TestMsg");
        const html = $("#status_bar_msg").html();
        assert(html.includes("red"), "render_status: sets color to red");
        assert(html.includes("TestTitle"), "render_status: includes title");
        assert(html.includes("TestMsg"), "render_status: includes message");

        render_status("blue", "OnlyTitle");
        const html2 = $("#status_bar_msg").html();
        assert(html2.includes("OnlyTitle"), "render_status: works with title only (no msg)");
        assert(!html2.includes("undefined"), "render_status: no 'undefined' when msg is omitted");
    } else {
        console.log("  (skipped: #status_bar_msg not in DOM)");
    }

    // =========================================================================
    // 4. show_spinner / hide_spinner
    // =========================================================================
    console.log("\n--- show_spinner / hide_spinner ---");
    // Make sure disable_spinner is off for this test
    const orig_disable_spinner = disable_spinner;
    disable_spinner = false;

    show_spinner("Test spinner message");
    let overlay = document.getElementById("ai_spinner_overlay");
    assert(overlay !== null, "show_spinner: creates overlay element");
    let msgElem = document.getElementById("ai_spinner_msg");
    assert(msgElem !== null && msgElem.textContent === "Test spinner message", "show_spinner: sets message text");

    // Update message
    show_spinner("Updated message");
    msgElem = document.getElementById("ai_spinner_msg");
    assert(msgElem.textContent === "Updated message", "show_spinner: updates message on second call");

    hide_spinner();
    overlay = document.getElementById("ai_spinner_overlay");
    assert(overlay === null, "hide_spinner: removes overlay element");

    // hide_spinner when nothing is shown should not throw
    hide_spinner();
    assert(true, "hide_spinner: no error when called with no spinner present");

    // Test disable_spinner flag
    disable_spinner = true;
    show_spinner("Should not appear");
    overlay = document.getElementById("ai_spinner_overlay");
    assert(overlay === null, "show_spinner: does nothing when disable_spinner is true");
    disable_spinner = orig_disable_spinner;

    // =========================================================================
    // 5. getCachedAnnotations / invalidateAnnoCache
    // =========================================================================
    console.log("\n--- getCachedAnnotations / invalidateAnnoCache ---");
    // Test cache invalidation
    invalidateAnnoCache();
    assert(_anno_cache === null, "invalidateAnnoCache: sets _anno_cache to null");
    assert(_anno_cache_time === 0, "invalidateAnnoCache: sets _anno_cache_time to 0");

    // If anno object exists, test caching behavior
    if (typeof anno === "object" && anno) {
        const annos1 = await getCachedAnnotations(true); // force fresh
        assert(Array.isArray(annos1), "getCachedAnnotations: returns array (force_fresh)");
        assert(_anno_cache !== null, "getCachedAnnotations: populates cache after fresh fetch");
        assert(_anno_cache_time > 0, "getCachedAnnotations: sets cache time");

        const cachedTime = _anno_cache_time;
        const annos2 = await getCachedAnnotations(false); // should use cache
        assert(_anno_cache_time === cachedTime, "getCachedAnnotations: uses cache (time unchanged)");
        assert(annos2 === _anno_cache, "getCachedAnnotations: returns cached reference");

        invalidateAnnoCache();
        assert(_anno_cache === null, "invalidateAnnoCache: clears cache after use");
    } else {
        // When anno is not an object, should return empty array
        const result = await getCachedAnnotations();
        assert(Array.isArray(result) && result.length === 0, "getCachedAnnotations: returns [] when anno is not an object");
    }

    // =========================================================================
    // 6. get_labels() — simple getter
    // =========================================================================
    console.log("\n--- get_labels ---");
    // get_labels just returns the global `labels` variable
    if (typeof labels !== 'undefined') {
        const result = get_labels();
        assert(result === labels, "get_labels: returns the global labels variable");
        assert(Array.isArray(result), "get_labels: returns an array");
    }

    // =========================================================================
    // 7. toDataURL — fetch + blob + FileReader pipeline
    // =========================================================================
    console.log("\n--- toDataURL ---");
    // Test with a data URI or small known resource
    if ($("#image").length > 0 && $("#image")[0].src) {
        try {
            const b64 = await toDataURL($("#image")[0].src);
            assert(typeof b64 === "string", "toDataURL: returns a string");
            assert(b64.length > 0, "toDataURL: returns non-empty base64 data");
            // Base64 should only contain valid chars
            assert(/^[A-Za-z0-9+/=]+$/.test(b64), "toDataURL: output is valid base64");
        } catch (e) {
            console.log("  (toDataURL test skipped due to fetch error:", e.message, ")");
        }
    } else {
        console.log("  (skipped: no #image element)");
    }

    // =========================================================================
    // 8. queue_annotation_event / flush_annotation_queue — queue mechanics
    // =========================================================================
    console.log("\n--- queue_annotation_event queue mechanics ---");
    // Test that items are added to the queue
    const origQueue = _annotation_save_queue.splice(0); // save and clear
    const origTimeout = _annotation_save_timeout;
    if (_annotation_save_timeout) {
        clearTimeout(_annotation_save_timeout);
        _annotation_save_timeout = null;
    }

    const mockAnnotation = {
        target: {
            selector: { value: "xywh=pixel:0,0,10,10" },
            source: "http://test/filename.jpg"
        },
        body: [{ value: "test", purpose: "tagging" }],
        id: "#test-id-123"
    };

    queue_annotation_event('create', mockAnnotation);
    assert(_annotation_save_queue.length === 1, "queue_annotation_event: adds item to queue");
    assert(_annotation_save_queue[0]._action === 'create', "queue_annotation_event: sets correct action");
    assert(_annotation_save_queue[0].id === "#test-id-123", "queue_annotation_event: preserves annotation id");
    assert(_annotation_save_timeout !== null, "queue_annotation_event: sets flush timeout");

    queue_annotation_event('delete', mockAnnotation);
    assert(_annotation_save_queue.length === 2, "queue_annotation_event: second item added");
    assert(_annotation_save_queue[1]._action === 'delete', "queue_annotation_event: second item has delete action");

    // Clean up: clear the queue and timeout so we don't trigger actual AJAX
    _annotation_save_queue.splice(0);
    if (_annotation_save_timeout) {
        clearTimeout(_annotation_save_timeout);
        _annotation_save_timeout = null;
    }
    // Restore original queue
    _annotation_save_queue.push(...origQueue);

    // =========================================================================
    // 9. get_image_element
    // =========================================================================
    console.log("\n--- get_image_element ---");
    if ($("#image").length > 0) {
        const elem = get_image_element();
        assert(elem !== null, "get_image_element: returns element when #image exists");
        assert(elem.tagName === "IMG", "get_image_element: returns an IMG element");
        assert(elem.id === "image", "get_image_element: returns the correct element");
    } else {
        const elem = get_image_element();
        assert(elem === null, "get_image_element: returns null when #image doesn't exist");
    }

    // =========================================================================
    // 10. get_chosen_model_uuid
    // =========================================================================
    console.log("\n--- get_chosen_model_uuid ---");
    if ($("#chosen_model").length > 0) {
        const uuid = get_chosen_model_uuid();
        assert(typeof uuid === "string" || uuid === undefined || uuid === null,
            "get_chosen_model_uuid: returns string/null/undefined");
    }

    // =========================================================================
    // 12. create_selects_from_annotation_debounced — debounce mechanics
    // =========================================================================
    console.log("\n--- create_selects_from_annotation_debounced ---");
    {
        // Clear any existing timeout
        if (_selects_timeout) {
            clearTimeout(_selects_timeout);
            _selects_timeout = null;
        }

        create_selects_from_annotation_debounced(0);
        assert(_selects_timeout !== null, "create_selects_from_annotation_debounced: sets timeout");

        const firstTimeout = _selects_timeout;
        create_selects_from_annotation_debounced(0);
        assert(_selects_timeout !== firstTimeout, "create_selects_from_annotation_debounced: resets timeout on second call");

        // Clean up
        if (_selects_timeout) {
            clearTimeout(_selects_timeout);
            _selects_timeout = null;
        }
    }

    // =========================================================================
    // 13. watch_svg_auto_throttled — throttle mechanics
    // =========================================================================
    console.log("\n--- watch_svg_auto_throttled ---");
    {
        if (_watch_svg_timeout) {
            clearTimeout(_watch_svg_timeout);
            _watch_svg_timeout = null;
        }

        watch_svg_auto_throttled();
        assert(_watch_svg_timeout !== null, "watch_svg_auto_throttled: sets timeout on first call");

        const firstTimeout = _watch_svg_timeout;
        watch_svg_auto_throttled();
        assert(_watch_svg_timeout === firstTimeout, "watch_svg_auto_throttled: does NOT reset timeout (throttle, not debounce)");

        // Clean up
        if (_watch_svg_timeout) {
            clearTimeout(_watch_svg_timeout);
            _watch_svg_timeout = null;
        }
    }

    // =========================================================================
    // 14. getModelInputShape — when model is null/undefined
    // =========================================================================
    console.log("\n--- getModelInputShape ---");
    {
        const origModel = model;

        model = null;
        assert(getModelInputShape() === undefined, "getModelInputShape: returns undefined when model is null");

        model = undefined;
        assert(getModelInputShape() === undefined, "getModelInputShape: returns undefined when model is undefined");

        // Mock a model with known shape
        model = { inputs: [{ shape: [1, 640, 640, 3] }] };
        const shape = getModelInputShape();
        assert(JSON.stringify(shape) === JSON.stringify([640, 640]), "getModelInputShape: extracts [640,640] from [1,640,640,3]");

        model = { inputs: [{ shape: [1, 320, 320, 3] }] };
        const shape2 = getModelInputShape();
        assert(JSON.stringify(shape2) === JSON.stringify([320, 320]), "getModelInputShape: extracts [320,320] from [1,320,320,3]");

        model = origModel;
    }

    // =========================================================================
    // 15. AI animation CSS classes
    // =========================================================================
    console.log("\n--- start_ai_animation / stop_ai_animation / show_nothing_found_animation ---");
    {
        const wrapper = document.querySelector('div[style*="position: relative"]');
        if (wrapper) {
            start_ai_animation();
            assert(wrapper.classList.contains('ai-analyzing'), "start_ai_animation: adds 'ai-analyzing' class");

            stop_ai_animation();
            assert(!wrapper.classList.contains('ai-analyzing'), "stop_ai_animation: removes 'ai-analyzing' class");

            show_nothing_found_animation();
            assert(wrapper.classList.contains('nothing-found'), "show_nothing_found_animation: adds 'nothing-found' class");

            // Wait for the animation to auto-remove (1000ms timeout in the code)
            await sleep(1100);
            assert(!wrapper.classList.contains('nothing-found'), "show_nothing_found_animation: class auto-removed after ~1s");
        } else {
            console.log("  (skipped: no wrapper div with position:relative found)");
        }
    }

    // =========================================================================
    // 16. load_dynamic_content_debounced — debounce mechanics
    // =========================================================================
    console.log("\n--- load_dynamic_content_debounced ---");
    {
        if (_load_dynamic_content_debounce_timeout) {
            clearTimeout(_load_dynamic_content_debounce_timeout);
            _load_dynamic_content_debounce_timeout = null;
        }

        load_dynamic_content_debounced();
        assert(_load_dynamic_content_debounce_timeout !== null, "load_dynamic_content_debounced: sets timeout");

        const first = _load_dynamic_content_debounce_timeout;
        load_dynamic_content_debounced();
        assert(_load_dynamic_content_debounce_timeout !== first, "load_dynamic_content_debounced: resets timeout on re-call (debounce)");

        // Clean up
        if (_load_dynamic_content_debounce_timeout) {
            clearTimeout(_load_dynamic_content_debounce_timeout);
            _load_dynamic_content_debounce_timeout = null;
        }
    }

    // =========================================================================
    // Summary
    // =========================================================================
    console.log(`\n=== UNTESTED FUNCTION TESTS DONE: ${passed} passed, ${failed} failed ===`);
    return failed;
}

async function run_tests() {
	console.log("=== RUNNING TESTS ===");

	let passed = 0;
	let failed = 0;

	function assert(condition, msg) {
		if (condition) {
			console.log("✓ PASS:", msg);
			passed++;
		} else {
			console.error("✖ FAIL:", msg);
			failed++;
		}
	}

	// --- uuidv4 ---
	console.log("\n--- Testing uuidv4 ---");
	const id1 = uuidv4();
	const id2 = uuidv4();
	assert(typeof id1 === "string", "uuidv4 returns a string");
	assert(id1.length === 36, "uuidv4 returns correct length (36 chars)");
	assert(id1 !== id2, "uuidv4 produces unique values");
	assert(/^[0-9a-f-]+$/.test(id1), "uuidv4 contains only valid hex chars and dashes");

	// --- getNewURL ---
	console.log("\n--- Testing getNewURL ---");
	const url1 = getNewURL("http://example.com?a=1", "a", "2");
	assert(url1 === "http://example.com?a=2", "getNewURL updates existing parameter");

	const url2 = getNewURL("http://example.com", "b", "5");
	assert(url2 === "http://example.com?b=5", "getNewURL adds new parameter to URL without params");

	const url3 = getNewURL("http://example.com?x=1&y=2", "y", "99");
	assert(url3.includes("y=99") && url3.includes("x=1"), "getNewURL updates param while keeping others");

	const url4 = getNewURL("http://example.com?a=1&b=2&c=3", "b", "new");
	assert(url4.includes("a=1") && url4.includes("b=new") && url4.includes("c=3"), "getNewURL handles multiple params");

	const url5 = getNewURL("http://example.com?test=hello%20world", "test", "goodbye");
	assert(url5.includes("test=goodbye"), "getNewURL handles encoded values");

	// --- iou (Intersection over Union) ---
	console.log("\n--- Testing iou ---");
	const boxA = [0, 0, 10, 10];
	const boxB = [5, 5, 15, 15];
	const boxC = [20, 20, 30, 30];
	const boxD = [0, 0, 10, 10]; // identical to boxA
	const boxE = [0, 0, 5, 5]; // contained in boxA

	assert(iou(boxA, boxB) > 0 && iou(boxA, boxB) < 1, "iou overlapping boxes between 0 and 1");
	assert(iou(boxA, boxC) === 0, "iou non-overlapping boxes = 0");
	assert(iou(boxA, boxD) === 1, "iou identical boxes = 1");
	assert(Math.abs(iou(boxA, boxB) - 0.142857) < 0.001, "iou calculates correct value for partial overlap");
	assert(iou(boxA, boxE) < 1 && iou(boxA, boxE) > 0, "iou handles contained boxes");
	assert(iou(boxB, boxA) === iou(boxA, boxB), "iou is commutative");

	// Edge cases
	const boxTiny = [0, 0, 0.1, 0.1];
	const boxHuge = [0, 0, 1000, 1000];
	assert(iou(boxTiny, boxHuge) >= 0 && iou(boxTiny, boxHuge) <= 1, "iou handles very different sizes");

	// --- getShape ---
	console.log("\n--- Testing getShape ---");
	const arr1 = [[1,2],[3,4]];
	const arr2 = [[[1,2],[3,4]],[[5,6],[7,8]]];
	const arr3 = [1,2,3,4];
	const arr4 = [];
	const arr5 = [[[[[1]]]]];

	assert(JSON.stringify(getShape(arr1)) === JSON.stringify([2,2]), "getShape works for 2D array");
	assert(JSON.stringify(getShape(arr2)) === JSON.stringify([2,2,2]), "getShape works for 3D array");
	assert(JSON.stringify(getShape(arr3)) === JSON.stringify([4]), "getShape works for 1D array");
	assert(JSON.stringify(getShape(arr4)) === JSON.stringify([0]), "getShape handles empty array");
	assert(JSON.stringify(getShape(arr5)) === JSON.stringify([1,1,1,1,1]), "getShape handles deeply nested arrays");

	// --- get_names_from_ki_anno ---
	console.log("\n--- Testing get_names_from_ki_anno ---");
	const sampleAnno1 = [
		{ body: [{ value: "Alice" }, { value: "Bob" }] },
		{ body: [{ value: "Alice" }] }
	];
	const names1 = get_names_from_ki_anno(sampleAnno1);
	assert(names1["Alice"] === 2 && names1["Bob"] === 1, "get_names_from_ki_anno counts correctly");

	const sampleAnno2 = [];
	const names2 = get_names_from_ki_anno(sampleAnno2);
	assert(Object.keys(names2).length === 0, "get_names_from_ki_anno handles empty array");

	const sampleAnno3 = [
		{ body: [{ value: "Cat" }, { value: "Cat" }, { value: "Dog" }] }
	];
	const names3 = get_names_from_ki_anno(sampleAnno3);
	assert(names3["Cat"] === 2 && names3["Dog"] === 1, "get_names_from_ki_anno counts duplicates in same annotation");

	const sampleAnno4 = [
		{ body: [{ value: "A" }] },
		{ body: [{ value: "B" }] },
		{ body: [{ value: "C" }] },
		{ body: [{ value: "A" }] },
		{ body: [{ value: "B" }] },
		{ body: [{ value: "A" }] }
	];
	const names4 = get_names_from_ki_anno(sampleAnno4);
	assert(names4["A"] === 3 && names4["B"] === 2 && names4["C"] === 1, "get_names_from_ki_anno handles multiple different counts");

	// Edge cases
	const sampleAnno5 = [{ body: [] }];
	const names5 = get_names_from_ki_anno(sampleAnno5);
	assert(Object.keys(names5).length === 0, "get_names_from_ki_anno handles empty body");

	// --- getUrlParam ---
	console.log("\n--- Testing getUrlParam ---");
	const defaultVal = getUrlParam('nonexistent_param', 42);
	assert(defaultVal === 42, "getUrlParam returns default for non-existent param");

	const nanVal = getUrlParam('string_param', 100);
	assert(nanVal === 100, "getUrlParam returns default for non-numeric param");

	// --- sleep ---
	console.log("\n--- Testing sleep ---");
	const startTime = Date.now();
	await sleep(100);
	const elapsed = Date.now() - startTime;
	assert(elapsed >= 100 && elapsed < 150, "sleep waits approximately correct time");

	const startTime2 = Date.now();
	await sleep(0);
	const elapsed2 = Date.now() - startTime2;
	assert(elapsed2 < 50, "sleep(0) returns quickly");

	// --- get_annotate_element (validation) ---
	console.log("\n--- Testing get_annotate_element validation ---");
	const badAnno1 = get_annotate_element("dog", -1, 0, 10, 10);
	assert(badAnno1 === null, "get_annotate_element rejects negative x_start");

	const badAnno2 = get_annotate_element("dog", 0, -5, 10, 10);
	assert(badAnno2 === null, "get_annotate_element rejects negative y_start");

	const badAnno3 = get_annotate_element("dog", 0, 0, 0, 10);
	assert(badAnno3 === null, "get_annotate_element rejects zero width");

	const badAnno4 = get_annotate_element("dog", 0, 0, 10, -10);
	assert(badAnno4 === null, "get_annotate_element rejects negative height");

	const badAnno5 = get_annotate_element("dog", 1.5, 0, 10, 10);
	assert(badAnno5 === null, "get_annotate_element rejects float x_start");

	const badAnno6 = get_annotate_element("dog", 0, 1.5, 10, 10);
	assert(badAnno6 === null, "get_annotate_element rejects float y_start");

	const badAnno7 = get_annotate_element("dog", 0, 0, 10.5, 10);
	assert(badAnno7 === null, "get_annotate_element rejects float width");

	const badAnno8 = get_annotate_element("dog", 0, 0, 10, 10.5);
	assert(badAnno8 === null, "get_annotate_element rejects float height");

	// Valid call (needs DOM element to be present)
	if ($("#image").length > 0) {
		const goodAnno = get_annotate_element("cat", 10, 20, 100, 200);
		assert(goodAnno !== null && goodAnno.type === "Annotation", "get_annotate_element returns valid annotation object");
		assert(goodAnno.body[0].value === "cat", "get_annotate_element sets correct label");
		assert(goodAnno.target.selector.value === "xywh=pixel:10,20,100,200", "get_annotate_element formats coordinates correctly");
		assert(goodAnno.id.startsWith("#"), "get_annotate_element generates ID with # prefix");
		assert(goodAnno["@context"] === "http://www.w3.org/ns/anno.jsonld", "get_annotate_element sets correct context");

		const goodAnno2 = get_annotate_element("bird", 0, 0, 1, 1);
		assert(goodAnno2 !== null, "get_annotate_element accepts minimal valid box (1x1)");
	}

	// --- processModelOutput ---
	/*
	console.log("\n--- Testing processModelOutput ---");
	if (typeof imgsz !== 'undefined') {
		// Test 1: Basic filtering by confidence
		const mockOutput1 = [
			[
				[400, 200],      // x values for 2 predictions
				[400, 200],      // y values
				[100, 50],       // w values
				[100, 50],       // h values
				[0.1, 0.2],      // class 0 scores
				[0.9, 0.1]       // class 1 scores
			]
		];

		const result1 = processModelOutput(mockOutput1, 0.5, 0.5);
		assert(result1.boxes.length === 1, "processModelOutput filters low confidence predictions");
		assert(result1.classes[0] === 1, "processModelOutput selects correct class");
		assert(result1.scores[0] === 0.9, "processModelOutput returns correct score");

		// Test 2: Multiple high confidence predictions
		const mockOutput2 = [
			[
				[400, 500, 600],    // x
				[400, 500, 600],    // y
				[100, 100, 100],    // w
				[100, 100, 100],    // h
				[0.8, 0.7, 0.9],    // class 0
				[0.1, 0.2, 0.05]    // class 1
			]
		];

		const result2 = processModelOutput(mockOutput2, 0.5, 0.5);
		assert(result2.boxes.length === 3, "processModelOutput keeps all high confidence predictions");
		assert(result2.classes.every(c => c === 0), "processModelOutput selects class 0 for all");

		// Test 3: NMS - overlapping boxes
		const mockOutput3 = [
			[
				[400, 405],         // Nearly same position
				[400, 405],
				[100, 100],
				[100, 100],
				[0.9, 0.8],         // Both high confidence
				[0.1, 0.1]
			]
		];

		const result3 = processModelOutput(mockOutput3, 0.5, 0.5);
		assert(result3.boxes.length === 1, "processModelOutput applies NMS to remove overlapping boxes");
		assert(result3.scores[0] === 0.9, "processModelOutput keeps highest scoring box after NMS");

		// Test 4: Empty result (all below threshold)
		const mockOutput4 = [
			[
				[400],
				[400],
				[100],
				[100],
				[0.1],
				[0.2]
			]
		];

		const result4 = processModelOutput(mockOutput4, 0.5, 0.5);
		assert(result4.boxes.length === 0, "processModelOutput returns empty when all below threshold");

		// Test 5: Box coordinates conversion
		const mockOutput5 = [
			[
				[400],     // center x at 400 (imgsz=800 -> 0.5)
				[400],     // center y at 400 (imgsz=800 -> 0.5)
				[200],     // width 200 (imgsz=800 -> 0.25)
				[200],     // height 200 (imgsz=800 -> 0.25)
				[0.8],
				[0.1]
			]
		];

		const result5 = processModelOutput(mockOutput5, 0.5, 0.5);
		assert(result5.boxes.length === 1, "processModelOutput processes coordinates");
		const [cx, cy, bw, bh] = result5.boxes[0];
		assert(cx === 0.5 && cy === 0.5, "processModelOutput converts to relative center coordinates");
		assert(bw === 0.25 && bh === 0.25, "processModelOutput converts to relative dimensions");

		// Test 6: Different confidence thresholds
		const mockOutput6 = [
			[
				[400, 400, 400],
				[400, 400, 400],
				[100, 100, 100],
				[100, 100, 100],
				[0.3, 0.5, 0.7],
				[0.1, 0.1, 0.1]
			]
		];

		const result6b = processModelOutput(mockOutput6, 0.6, 0.5);
		assert(result6b.boxes.length === 1, "processModelOutput with conf=0.6 keeps 1 box");

		// Test 7: Multiple classes
		const mockOutput7 = [
			[
				[400, 500],
				[400, 500],
				[100, 100],
				[100, 100],
				[0.1, 0.2],    // class 0
				[0.3, 0.8],    // class 1
				[0.7, 0.1]     // class 2
			]
		];

		const result7 = processModelOutput(mockOutput7, 0.5, 0.5);
		assert(result7.boxes.length === 2, "processModelOutput handles multiple classes");
	}
	*/

	// --- Coordinate transformations (inline tests) ---
	console.log("\n--- Testing coordinate transformations ---");

	// Test conversion from [x1,y1,x2,y2] to [cx,cy,w,h]
	function testXYXYtoCXCYWH(x1, y1, x2, y2, expected_cx, expected_cy, expected_w, expected_h) {
		const cx = (x1 + x2) / 2;
		const cy = (y1 + y2) / 2;
		const w = x2 - x1;
		const h = y2 - y1;
		return cx === expected_cx && cy === expected_cy && w === expected_w && h === expected_h;
	}

	assert(testXYXYtoCXCYWH(0, 0, 10, 10, 5, 5, 10, 10), "converts [0,0,10,10] to [5,5,10,10]");
	assert(testXYXYtoCXCYWH(5, 5, 15, 15, 10, 10, 10, 10), "converts [5,5,15,15] to [10,10,10,10]");
	assert(testXYXYtoCXCYWH(0, 0, 100, 50, 50, 25, 100, 50), "converts [0,0,100,50] to [50,25,100,50]");

	// Test conversion from [cx,cy,w,h] to [x,y,w,h] (top-left format)
	function testCXCYWHtoXYWH(cx, cy, w, h, expected_x, expected_y) {
		const x = cx - w / 2;
		const y = cy - h / 2;
		return x === expected_x && y === expected_y;
	}

	assert(testCXCYWHtoXYWH(5, 5, 10, 10, 0, 0), "converts [5,5,10,10] to [0,0]");
	assert(testCXCYWHtoXYWH(10, 10, 10, 10, 5, 5), "converts [10,10,10,10] to [5,5]");
	assert(testCXCYWHtoXYWH(0.5, 0.5, 0.2, 0.2, 0.4, 0.4), "converts relative coords [0.5,0.5,0.2,0.2] to [0.4,0.4]");

	// --- Best class selection ---
	console.log("\n--- Testing best class selection logic ---");

	function getBestClass(classScores) {
		let bestScore = -Infinity;
		let bestClass = -1;
		for (let c = 0; c < classScores.length; c++) {
			if (classScores[c] > bestScore) {
				bestScore = classScores[c];
				bestClass = c;
			}
		}
		return { bestClass, bestScore };
	}

	const bc1 = getBestClass([0.1, 0.9, 0.3]);
	assert(bc1.bestClass === 1 && bc1.bestScore === 0.9, "getBestClass selects middle class");

	const bc2 = getBestClass([0.9, 0.1, 0.1]);
	assert(bc2.bestClass === 0 && bc2.bestScore === 0.9, "getBestClass selects first class");

	const bc3 = getBestClass([0.1, 0.1, 0.9]);
	assert(bc3.bestClass === 2 && bc3.bestScore === 0.9, "getBestClass selects last class");

	const bc4 = getBestClass([0.5, 0.5, 0.5]);
	assert(bc4.bestClass === 0 && bc4.bestScore === 0.5, "getBestClass selects first when all equal");

	const bc5 = getBestClass([-0.1, -0.2, -0.05]);
	assert(bc5.bestClass === 2 && bc5.bestScore === -0.05, "getBestClass handles negative scores");

	const bc6 = getBestClass([0.5]);
	assert(bc6.bestClass === 0 && bc6.bestScore === 0.5, "getBestClass handles single class");

	const bc7 = getBestClass([]);
	assert(bc7.bestClass === -1 && bc7.bestScore === -Infinity, "getBestClass handles empty array");

	console.log(`\n=== TESTS DONE: ${passed} passed, ${failed} failed ===`);

	assert(await run_additional_tests() == 0, "additional tests failed");

	assert(await test_load_model_and_predict(), "test_load_model_and_predict tests failed");

	const multiLabelFailed = await run_multi_label_tests();
	assert(multiLabelFailed === 0, "multi-label tests all passed");

	const untestedFailed = await run_untested_function_tests();
	assert(untestedFailed === 0, "untested function tests all passed");

	return failed;
}
