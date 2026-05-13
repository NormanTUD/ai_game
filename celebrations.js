// ═══════════════════════════════════════════════════════════════════════════
// CELEBRATIONS ENGINE — Performance-Optimized Full-Page Overlay Animations
// ═══════════════════════════════════════════════════════════════════════════

(function() {
	"use strict";

	// ─── Celebration Overlay Container ──────────────────────────────────
	var overlay = document.createElement('div');
	overlay.id = 'celebration_overlay';
	document.body.appendChild(overlay);

	// Canvas for particle-based effects
	var canvas = document.createElement('canvas');
	canvas.id = 'celebration_canvas';
	overlay.appendChild(canvas);
	var ctx = canvas.getContext('2d');

	// DOM container for CSS-animated elements
	var domLayer = document.createElement('div');
	domLayer.id = 'celebration_dom_layer';
	overlay.appendChild(domLayer);

	var animationFrame = null;
	var particles = [];
	var isActive = false;
	var currentEffect = null;
	var startTime = 0;
	var duration = 3000;
	var lastCelebrateTime = 0;
	var CELEBRATE_COOLDOWN = 3000; // prevent re-triggering within 3s

	// ─── Resize canvas to full page ─────────────────────────────────────
	function resizeCanvas() {
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
	}
	window.addEventListener('resize', resizeCanvas);
	resizeCanvas();

	// ─── Utility ────────────────────────────────────────────────────────
	function rand(min, max) { return Math.random() * (max - min) + min; }
	function randInt(min, max) { return Math.floor(rand(min, max)); }
	function randColor() {
		var colors = ['#ff6b9d', '#c44dff', '#4fc3f7', '#ffb74d', '#66bb6a', '#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#ea80fc'];
		return colors[randInt(0, colors.length)];
	}
	function hsl(h, s, l) { return 'hsl(' + h + ',' + s + '%,' + l + '%)'; }

	// ═══════════════════════════════════════════════════════════════════════
	// PARTICLE CLASSES (PERFORMANCE-OPTIMIZED)
	// ═══════════════════════════════════════════════════════════════════════

	// ─── Confetti Particle ──────────────────────────────────────────────
	function ConfettiParticle(x, y) {
		this.x = x;
		this.y = y;
		this.vx = rand(-8, 8);
		this.vy = rand(-18, -5);
		this.gravity = rand(0.3, 0.6);
		this.drag = rand(0.97, 0.99);
		this.rotation = rand(0, 360);
		this.rotationSpeed = rand(-10, 10);
		this.width = rand(6, 14);
		this.height = rand(4, 10);
		this.color = randColor();
		this.opacity = 1;
		this.fadeSpeed = rand(0.005, 0.015);
		this.wobble = rand(0, Math.PI * 2);
		this.wobbleSpeed = rand(0.05, 0.15);
	}

	ConfettiParticle.prototype.update = function() {
		this.vy += this.gravity;
		this.vx *= this.drag;
		this.x += this.vx + Math.sin(this.wobble) * 2;
		this.y += this.vy;
		this.rotation += this.rotationSpeed;
		this.wobble += this.wobbleSpeed;
		this.opacity -= this.fadeSpeed;
		return this.opacity > 0 && this.y < canvas.height + 50;
	};

	ConfettiParticle.prototype.draw = function(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(this.rotation * Math.PI / 180);
		ctx.globalAlpha = this.opacity;
		ctx.fillStyle = this.color;
		ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);
		ctx.restore();
	};

	// ─── Firework Spark (OPTIMIZED: no trail, no glow) ──────────────────
	function FireworkSpark(x, y, hue) {
		var angle = rand(0, Math.PI * 2);
		var speed = rand(2, 10);
		this.x = x;
		this.y = y;
		this.vx = Math.cos(angle) * speed;
		this.vy = Math.sin(angle) * speed;
		this.gravity = 0.12;
		this.friction = 0.98;
		this.hue = hue;
		this.brightness = rand(50, 80);
		this.opacity = 1;
		this.fadeSpeed = rand(0.015, 0.04);
		this.size = rand(1.5, 3.5);
	}

	FireworkSpark.prototype.update = function() {
		this.vy += this.gravity;
		this.vx *= this.friction;
		this.vy *= this.friction;
		this.x += this.vx;
		this.y += this.vy;
		this.opacity -= this.fadeSpeed;
		return this.opacity > 0;
	};

	FireworkSpark.prototype.draw = function(ctx) {
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
		ctx.fillStyle = hsl(this.hue, 100, this.brightness);
		ctx.globalAlpha = this.opacity;
		ctx.fill();
	};

	// ─── Firework Rocket (OPTIMIZED: reduced spark count) ───────────────
	function FireworkRocket(x) {
		this.x = x;
		this.y = canvas.height;
		this.targetY = rand(canvas.height * 0.1, canvas.height * 0.4);
		this.vy = rand(-12, -8);
		this.hue = randInt(0, 360);
		this.exploded = false;
	}

	FireworkRocket.prototype.update = function() {
		this.y += this.vy;
		this.vy += 0.05;
		if (this.y <= this.targetY || this.vy >= 0) {
			this.exploded = true;
			// Reduced spark count: 20-40 instead of 40-80
			var sparkCount = randInt(20, 40);
			for (var i = 0; i < sparkCount; i++) {
				particles.push(new FireworkSpark(this.x, this.y, this.hue));
			}
		}
		return !this.exploded;
	};

	FireworkRocket.prototype.draw = function(ctx) {
		ctx.beginPath();
		ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
		ctx.fillStyle = hsl(this.hue, 100, 90);
		ctx.globalAlpha = 1;
		ctx.fill();
	};

	// ─── Star Particle (OPTIMIZED: no pulse recalc per frame) ───────────
	function StarParticle(x, y) {
		this.x = x;
		this.y = y;
		this.size = rand(10, 30);
		this.rotation = rand(0, 360);
		this.rotationSpeed = rand(-5, 5);
		this.vx = rand(-4, 4);
		this.vy = rand(-8, -2);
		this.gravity = 0.2;
		this.opacity = 1;
		this.fadeSpeed = rand(0.008, 0.02);
		this.color = randColor();
	}

	StarParticle.prototype.update = function() {
		this.vy += this.gravity;
		this.x += this.vx;
		this.y += this.vy;
		this.rotation += this.rotationSpeed;
		this.opacity -= this.fadeSpeed;
		return this.opacity > 0 && this.y < canvas.height + 50;
	};

	StarParticle.prototype.draw = function(ctx) {
		ctx.save();
		ctx.translate(this.x, this.y);
		ctx.rotate(this.rotation * Math.PI / 180);
		ctx.globalAlpha = this.opacity;
		drawStar(ctx, 0, 0, 5, this.size, this.size * 0.4, this.color);
		ctx.restore();
	};

	function drawStar(ctx, cx, cy, spikes, outerR, innerR, color) {
		var rot = Math.PI / 2 * 3;
		var step = Math.PI / spikes;
		ctx.beginPath();
		ctx.moveTo(cx, cy - outerR);
		for (var i = 0; i < spikes; i++) {
			ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
			rot += step;
			ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
			rot += step;
		}
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
	}

	// ─── Bubble Particle (OPTIMIZED: no radialGradient per frame) ───────
	function BubbleParticle() {
		this.x = rand(0, canvas.width);
		this.y = canvas.height + rand(10, 100);
		this.size = rand(10, 50);
		this.speed = rand(1, 4);
		this.wobbleAmp = rand(20, 60);
		this.wobbleSpeed = rand(0.02, 0.06);
		this.wobbleOffset = rand(0, Math.PI * 2);
		this.opacity = rand(0.3, 0.7);
		this.hue = randInt(180, 280);
		this.time = 0;
		this.fillColor = hsl(this.hue, 60, 70);
	}

	BubbleParticle.prototype.update = function() {
		this.time += this.wobbleSpeed;
		this.y -= this.speed;
		this.x += Math.sin(this.time + this.wobbleOffset) * 1.5;
		return this.y > -this.size * 2;
	};

	BubbleParticle.prototype.draw = function(ctx) {
		ctx.save();
		ctx.globalAlpha = this.opacity;
		// Simple filled circle instead of radialGradient
		ctx.beginPath();
		ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
		ctx.fillStyle = this.fillColor;
		ctx.fill();
		// Simple highlight dot
		ctx.beginPath();
		ctx.arc(this.x - this.size * 0.25, this.y - this.size * 0.25, this.size * 0.2, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(255,255,255,0.5)';
		ctx.fill();
		ctx.restore();
	};

	// ─── Sparkle Particle (OPTIMIZED: no shadowBlur) ────────────────────
	function SparkleParticle() {
		this.x = rand(0, canvas.width);
		this.y = rand(0, canvas.height);
		this.size = rand(2, 6);
		this.maxSize = this.size;
		this.opacity = 0;
		this.speed = rand(0.02, 0.06);
		this.color = randColor();
		this.lifetime = rand(40, 100);
		this.age = 0;
	}

	SparkleParticle.prototype.update = function() {
		this.age++;
		if (this.age < this.lifetime * 0.3) {
			this.opacity = Math.min(1, this.opacity + this.speed * 3);
		} else {
			this.opacity -= this.speed;
		}
		this.size = this.maxSize * (0.5 + Math.sin(this.age * 0.2) * 0.5);
		return this.opacity > 0 && this.age < this.lifetime;
	};

	SparkleParticle.prototype.draw = function(ctx) {
		ctx.save();
		ctx.globalAlpha = this.opacity;
		ctx.fillStyle = this.color;
		// 4-pointed star sparkle — single fill, no shadowBlur
		ctx.beginPath();
		ctx.moveTo(this.x, this.y - this.size);
		ctx.quadraticCurveTo(this.x + 1, this.y, this.x + this.size, this.y);
		ctx.quadraticCurveTo(this.x, this.y + 1, this.x, this.y + this.size);
		ctx.quadraticCurveTo(this.x - 1, this.y, this.x - this.size, this.y);
		ctx.quadraticCurveTo(this.x, this.y - 1, this.x, this.y - this.size);
		ctx.fill();
		ctx.restore();
	};

	// ─── Rain/Snow Particle ─────────────────────────────────────────────
	function RainbowRainParticle() {
		this.x = rand(0, canvas.width);
		this.y = rand(-50, -10);
		this.length = rand(15, 35);
		this.speed = rand(8, 16);
		this.hue = rand(0, 360);
		this.opacity = rand(0.4, 0.8);
		this.thickness = rand(1.5, 3);
	}

	RainbowRainParticle.prototype.update = function() {
		this.y += this.speed;
		this.hue = (this.hue + 2) % 360;
		return this.y < canvas.height + 50;
	};

	RainbowRainParticle.prototype.draw = function(ctx) {
		ctx.save();
		ctx.globalAlpha = this.opacity;
		ctx.strokeStyle = hsl(this.hue, 100, 60);
		ctx.lineWidth = this.thickness;
		ctx.lineCap = 'round';
		ctx.beginPath();
		ctx.moveTo(this.x, this.y);
		ctx.lineTo(this.x, this.y + this.length);
		ctx.stroke();
		ctx.restore();
	};

	// ═══════════════════════════════════════════════════════════════════════
	// EFFECT LAUNCHERS (REDUCED PARTICLE COUNTS)
	// ═══════════════════════════════════════════════════════════════════════

	function launchConfetti(opts) {
		var count = (opts && opts.count) || 80; // was 200
		var sources = (opts && opts.sources) || 3;
		for (var s = 0; s < sources; s++) {
			var sx = canvas.width * (s + 1) / (sources + 1);
			for (var i = 0; i < count / sources; i++) {
				particles.push(new ConfettiParticle(sx + rand(-50, 50), canvas.height * 0.6));
			}
		}
	}

	function launchFireworks(opts) {
		var count = (opts && opts.count) || 3; // was 5
		var delay = (opts && opts.delay) || 500;
		for (var i = 0; i < count; i++) {
			(function(idx) {
				setTimeout(function() {
					if (!isActive) return;
					var x = rand(canvas.width * 0.15, canvas.width * 0.85);
					particles.push(new FireworkRocket(x));
				}, idx * delay);
			})(i);
		}
	}

	function launchStarBurst(opts) {
		var count = (opts && opts.count) || 20; // was 50
		var cx = canvas.width / 2;
		var cy = canvas.height / 2;
		for (var i = 0; i < count; i++) {
			var x = cx + rand(-200, 200);
			var y = cy + rand(-100, 100);
			particles.push(new StarParticle(x, y));
		}
	}

	function launchBubbles(opts) {
		var count = (opts && opts.count) || 20; // was 40
		var delay = (opts && opts.delay) || 150;
		for (var i = 0; i < count; i++) {
			(function(idx) {
				setTimeout(function() {
					if (!isActive) return;
					particles.push(new BubbleParticle());
				}, idx * delay);
			})(i);
		}
	}

	function launchSparkles(opts) {
		var count = (opts && opts.count) || 30; // was 80
		var delay = (opts && opts.delay) || 80;
		for (var i = 0; i < count; i++) {
			(function(idx) {
				setTimeout(function() {
					if (!isActive) return;
					particles.push(new SparkleParticle());
				}, idx * delay);
			})(i);
		}
	}

	function launchRainbowRain(opts) {
		var count = (opts && opts.count) || 60; // was 150
		var delay = (opts && opts.delay) || 50;
		for (var i = 0; i < count; i++) {
			(function(idx) {
				setTimeout(function() {
					if (!isActive) return;
					particles.push(new RainbowRainParticle());
				}, idx * delay);
			})(i);
		}
	}

	// ─── Combined spectacular effect (OPTIMIZED) ────────────────────────
	function launchSpectacular() {
		launchConfetti({ count: 50 });
		setTimeout(function() { launchFireworks({ count: 2, delay: 600 }); }, 300);
		setTimeout(function() { launchStarBurst({ count: 12 }); }, 800);
		launchSparkles({ count: 20, delay: 100 });
	}

	// ═══════════════════════════════════════════════════════════════════════
	// ANIMATION LOOP (OPTIMIZED: in-place array filtering)
	// ═══════════════════════════════════════════════════════════════════════

	function animate() {
		if (!isActive && particles.length === 0) {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			overlay.classList.remove('active');
			animationFrame = null;
			return;
		}

		ctx.clearRect(0, 0, canvas.width, canvas.height);

		// Update & draw particles — in-place filtering (no new array allocation)
		var writeIdx = 0;
		for (var i = 0; i < particles.length; i++) {
			if (particles[i].update()) {
				particles[i].draw(ctx);
				particles[writeIdx++] = particles[i];
			}
		}
		particles.length = writeIdx;

		// Auto-stop after duration
		if (isActive && Date.now() - startTime > duration) {
			isActive = false;
		}

		animationFrame = requestAnimationFrame(animate);
	}

	// ═══════════════════════════════════════════════════════════════════════
	// PUBLIC API (with cooldown to prevent spam-triggering)
	// ═══════════════════════════════════════════════════════════════════════

	function startCelebration(type, opts) {
		// Cooldown: prevent re-triggering celebrations every game frame
		var now = Date.now();
		if (now - lastCelebrateTime < CELEBRATE_COOLDOWN) return;
		lastCelebrateTime = now;

		opts = opts || {};
		duration = opts.duration || 4000;
		isActive = true;
		startTime = now;
		overlay.classList.add('active');
		resizeCanvas();

		switch (type) {
			case 'confetti':
				launchConfetti(opts);
				break;
			case 'fireworks':
				duration = opts.duration || 5000;
				launchFireworks(opts);
				break;
			case 'stars':
				launchStarBurst(opts);
				break;
			case 'bubbles':
				duration = opts.duration || 4000;
				launchBubbles(opts);
				break;
			case 'sparkles':
				launchSparkles(opts);
				break;
			case 'rainbow':
				duration = opts.duration || 4000;
				launchRainbowRain(opts);
				break;
			case 'spectacular':
				duration = opts.duration || 5000;
				launchSpectacular();
				break;
			default:
				launchConfetti(opts);
		}

		if (!animationFrame) {
			animationFrame = requestAnimationFrame(animate);
		}
	}

	function stopCelebration() {
		isActive = false;
		// Let remaining particles fade out naturally
	}

	function stopCelebrationImmediate() {
		isActive = false;
		particles.length = 0;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		overlay.classList.remove('active');
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
			animationFrame = null;
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// EXPOSE GLOBALLY
	// ═══════════════════════════════════════════════════════════════════════

	window.celebrate = startCelebration;
	window.stopCelebration = stopCelebration;
	window.stopCelebrationImmediate = stopCelebrationImmediate;

	// Convenience shortcuts
	window.showConfetti = function() { startCelebration('confetti'); };
	window.showFireworks = function() { startCelebration('fireworks'); };
	window.showStars = function() { startCelebration('stars'); };
	window.showBubbles = function() { startCelebration('bubbles'); };
	window.showSparkles = function() { startCelebration('sparkles'); };
	window.showRainbow = function() { startCelebration('rainbow'); };
	window.showSpectacular = function() { startCelebration('spectacular'); };

})();
