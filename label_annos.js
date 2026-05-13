function rect_bbox_from_element(el) {
	let x = parseFloat(el.getAttribute('x')) || 0;
	let y = parseFloat(el.getAttribute('y')) || 0;
	let w = parseFloat(el.getAttribute('width')) || 0;
	let h = parseFloat(el.getAttribute('height')) || 0;
	return { x, y, width: w, height: h };
}

function rect_bbox_from_element(el) {
	let x = parseFloat(el.getAttribute('x')) || 0;
	let y = parseFloat(el.getAttribute('y')) || 0;
	let w = parseFloat(el.getAttribute('width')) || 0;
	let h = parseFloat(el.getAttribute('height')) || 0;
	return { x, y, width: w, height: h };
}

function boxes_intersect(a, b) {
	return a.x < b.x + b.width && a.x + a.width > b.x &&
		a.y < b.y + b.height && a.y + a.height > b.y;
}

function color_from_string(str) {
	let h = 0;
	for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
	let hue = h % 360;
	return `hsl(${hue},70%,50%)`;
}

function precompute_svg_image_transform(img, svg) {
	if (!img || !svg) return null;

	let imgRect = img.getBoundingClientRect();
	let svgRect = svg.getBoundingClientRect();
	let scaleX = img.naturalWidth ? imgRect.width / img.naturalWidth : imgRect.width / img.width;
	let scaleY = img.naturalHeight ? imgRect.height / img.naturalHeight : imgRect.height / img.height;

	let invCTM = svg.getScreenCTM().inverse();
	return { imgRect, scaleX, scaleY, invCTM };
}

function fast_image_pixels_to_svg_box(px, py, pw, ph, transform) {
	if (!transform) return null;

	let { imgRect, scaleX, scaleY, invCTM } = transform;

	let c1x = imgRect.left + px * scaleX;
	let c1y = imgRect.top  + py * scaleY;
	let c2x = imgRect.left + (px + pw) * scaleX;
	let c2y = imgRect.top  + (py + ph) * scaleY;

	let p = { x: c1x, y: c1y };
	let a = svg_point_matrix_transform(p, invCTM);
	p = { x: c2x, y: c2y };
	let b = svg_point_matrix_transform(p, invCTM);

	return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function svg_point_matrix_transform(p, matrix) {
	return {
		x: matrix.a * p.x + matrix.c * p.y + matrix.e,
		y: matrix.b * p.x + matrix.d * p.y + matrix.f
	};
}

function precompute_svg_image_transform(img, svg) {
	if (!img || !svg) return null;

	let imgRect = img.getBoundingClientRect();
	let svgRect = svg.getBoundingClientRect();
	let scaleX = img.naturalWidth ? imgRect.width / img.naturalWidth : imgRect.width / img.width;
	let scaleY = img.naturalHeight ? imgRect.height / img.naturalHeight : imgRect.height / img.height;

	let invCTM = svg.getScreenCTM().inverse();
	return { imgRect, scaleX, scaleY, invCTM };
}

function fast_image_pixels_to_svg_box(px, py, pw, ph, transform) {
	if (!transform) return null;

	let { imgRect, scaleX, scaleY, invCTM } = transform;

	let c1x = imgRect.left + px * scaleX;
	let c1y = imgRect.top  + py * scaleY;
	let c2x = imgRect.left + (px + pw) * scaleX;
	let c2y = imgRect.top  + (py + ph) * scaleY;

	let p = { x: c1x, y: c1y };
	let a = svg_point_matrix_transform(p, invCTM);
	p = { x: c2x, y: c2y };
	let b = svg_point_matrix_transform(p, invCTM);

	return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) };
}

function svg_point_matrix_transform(p, matrix) {
	return {
		x: matrix.a * p.x + matrix.c * p.y + matrix.e,
		y: matrix.b * p.x + matrix.d * p.y + matrix.f
	};
}

function parse_annos_from_anno(anno_input, img, svg) {
    let list = Array.isArray(anno_input) ? anno_input : (typeof anno_input === 'string' ? JSON.parse(anno_input) : []);
    let out = [];
    let transform = precompute_svg_image_transform(img, svg);

    for (let a of list) {
        try {
            // MULTI-LABEL: Alle Labels sammeln statt nur das erste
            let labels = [];
            if (a.body && Array.isArray(a.body)) {
                for (let b of a.body) {
                    if (b.type === 'TextualBody' && b.value) {
                        labels.push(b.value);
                    }
                }
            }
            if (labels.length === 0) labels.push('unknown');

            let label = labels.join(', '); // "1pol, lss, Hersteller"

            let selector = a.target && a.target.selector;
            if (!selector) selector = (a.target && a.target.selector) || null;
            let value = selector && selector.value;
            if (!value && a.target && a.target.selector && Array.isArray(a.target.selector)) {
                for (let s of a.target.selector) if (s.value) { value = s.value; break; }
            }
            if (!value) continue;
            let m = value.match(/xywh=pixel:(\d+),(\d+),(\d+),(\d+)/);
            if (!m) continue;
            let px = parseInt(m[1],10), py = parseInt(m[2],10), pw = parseInt(m[3],10), ph = parseInt(m[4],10);

            let box = fast_image_pixels_to_svg_box(px, py, pw, ph, transform);
            if (box) out.push({ label, box, labels }); // labels-Array auch mitgeben
        } catch (e) {}
    }
    return out;
}

function compute_overlap_score(annot_box, p_box, opts) {
	let ax = annot_box.x, ay = annot_box.y, aw = annot_box.width, ah = annot_box.height;
	let bx = p_box.x, by = p_box.y, bw = p_box.width, bh = p_box.height;

	let x_overlap = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
	let y_overlap = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
	let area_overlap = x_overlap * y_overlap;

	let annot_area = Math.max(1, aw * ah);
	let area_ratio = area_overlap / annot_area;

	let acx = ax + aw/2, acy = ay + ah/2;
	let bcx = bx + bw/2, bcy = by + bh/2;
	let d = Math.hypot(acx - bcx, acy - bcy);

	let max_d = Math.hypot(aw/2 + bw/2, ah/2 + bh/2) || 1;
	let proximity = 1 - Math.min(1, d / max_d);

	let w_area = opts.w_area, w_pos = opts.w_pos;
	let score = w_area * area_ratio + w_pos * proximity;

	return { score, area_overlap, area_ratio, proximity, distance: d };
}

function get_category_for_annotation(rect, svg, img) {
	if (!rect || !svg) {
		console.log("Neither rect nor svg are defined");
		return 'unknown';
	}
	let annot_box = rect_bbox_from_element(rect);

	let opts = { w_area: 0.75, w_pos: 0.25, min_score: 0.03 };

	// --- precompute text boxes once ---
	let text_boxes = [];
	let texts = svg.querySelectorAll('text');
	for (let t of texts) {
		try {
			let tb = t.getBBox();
			let txt = (t.textContent || '').trim();
			if (txt) text_boxes.push({ node: t, box: { x: tb.x, y: tb.y, width: tb.width, height: tb.height }, txt });
		} catch (e) {}
	}

	// --- precompute r6o-editor boxes if img is provided ---
	let div_boxes = [];
	if (img) {
		let divs = document.querySelectorAll('.r6o-editor');
		if (divs.length) {
			let imgRect = img.getBoundingClientRect();
			let svgRect = svg.getBoundingClientRect();
			let scaleX = 1, scaleY = 1;
			try {
				let vb = svg.viewBox.baseVal;
				scaleX = vb.width / svgRect.width;
				scaleY = vb.height / svgRect.height;
			} catch (e) {}
			for (let div of divs) {
				try {
					let d = div.getBoundingClientRect();
					let relX = (d.left - imgRect.left) * scaleX;
					let relY = (d.top - imgRect.top) * scaleY;
					let relW = d.width * scaleX;
					let relH = d.height * scaleY;
					div_boxes.push({ node: div, box: { x: relX, y: relY, width: relW, height: relH } });
				} catch (e) {}
			}
		}
	}

	// --- 1) try annotations if available ---
	try {
		let raw_annos = (typeof anno !== 'undefined' && typeof anno.getAnnotations === 'function')
			? anno.getAnnotations()
			: window.__anno_json__;
		if (raw_annos) {
			let parsed = parse_annos_from_anno(raw_annos, img, svg);
			let best = { score: 0, label: 'unknown', debug: null };
			for (let p of parsed) {
				let res = compute_overlap_score(annot_box, p.box, opts);
				if (res.score > best.score) {
					best.score = res.score;
					best.label = (p.label || 'unknown').trim();
					best.debug = { box: p.box, res };
				}
			}
			if (best.score >= opts.min_score) {
				if (window.__anno_debug) console.log('anno-match', best);
				return best.label;
			}
			if (window.__anno_debug) console.log('no anno passed threshold', parsed.map(p => ({label:p.label, box:p.box})));
		}
	} catch (e) {
		if (window.__anno_debug) console.error('anno-parse-error', e);
	}

	// --- 2) exact text overlap ---
	for (let t of text_boxes) {
		if (boxes_intersect(annot_box, t.box)) return t.txt;
	}

	// --- 3) nearest-above heuristic ---
	if (text_boxes.length) {
		let best_txt = 'unknown';
		let best_score = Infinity;
		for (let t of text_boxes) {
			let dx = Math.abs((t.box.x + t.box.width / 2) - (annot_box.x + annot_box.width / 2));
			let dy = (t.box.y + t.box.height) - annot_box.y;
			let score = dx + Math.max(0, dy);
			if (score < best_score) {
				best_score = score;
				best_txt = t.txt;
			}
		}
		if (best_txt !== 'unknown') return best_txt;
	}

	// --- 4) r6o-editor fallback ---
	if (div_boxes.length) {
		for (let d of div_boxes) {
			if (boxes_intersect(annot_box, d.box)) {
				let labelSpan = d.node.querySelector('.r6o-label');
				if (labelSpan) return labelSpan.textContent.trim();
			}
		}
	}

	return 'unknown';
}

function clear_previous_labels(svg) {
	if (!svg) return;
	let annotated = svg.querySelectorAll('[data-annotated="1"]');
	for (let n of annotated) n.remove();
}

function annotate_svg(svg, img) {
    if (!svg) return;
    clear_previous_labels(svg);

    const category_counts = {};
    var cnt = 0;

    svg.querySelectorAll('g.a9s-annotation').forEach((g) => {
        let rect = g.querySelector('rect.a9s-inner');
        if (!rect) return;

        let category = g.getAttribute('data-label') || get_category_for_annotation(rect, svg, img);

        if (!category_counts[category]) category_counts[category] = 0;

        let box = rect_bbox_from_element(rect);

        // Für Multi-Label: Farbe vom ersten Label nehmen
        let first_label = category.split(',')[0].trim();
        let color = color_from_string(first_label);

        let label_height = 20;
        // Breite an den gesamten Text anpassen
        let label_width = Math.max(30, Math.min(box.width, category.length * 8 + 8));
        let label_x = box.x;
        let label_y = box.y - label_height;
        if (label_y < 0) label_y = box.y;

        if (category_counts[category] < 30) {
            let bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            bg.setAttribute("x", label_x);
            bg.setAttribute("y", label_y);
            bg.setAttribute("width", label_width);
            bg.setAttribute("height", label_height);
            bg.setAttribute("fill", color);
            bg.setAttribute("opacity", 0.7);
            bg.setAttribute("data-annotated", "1");

            let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", label_x + 4);
            text.setAttribute("y", label_y + 14);
            text.setAttribute("fill", "#fff");
            text.setAttribute("font-size", "14");
            text.setAttribute("font-family", "Arial, sans-serif");
            text.textContent = category;  // zeigt jetzt "aaa, bbb, ccc"
            text.setAttribute("data-annotated", "1");

            svg.appendChild(bg);
            svg.appendChild(text);

            category_counts[category]++;
        }

        cnt++;
    });

    if(cnt) {
        stop_ai_animation();
    }
}

function throttle(func, limit) {
	let lastCall = 0;
	return function() {
		const now = Date.now();
		if (now - lastCall >= limit) {
			lastCall = now;
			func.apply(this, arguments);
		}
	};
}

function watch_svg_auto() {
	const img = Array.from(document.images).find(i => i.src.includes('print_image.php?filename='));
	const svg = document.querySelector('svg.a9s-annotationlayer');

	if (!img || !svg) {
		setTimeout(watch_svg_auto, 500);
		return;
	}

	const throttledUpdate = throttle(() => annotate_svg(svg, img), 200); // max 5x/sec

	const observer = new MutationObserver(throttledUpdate);
	observer.observe(svg, { childList: true, subtree: true, attributes: true });

	annotate_svg(svg, img);
}

watch_svg_auto();
