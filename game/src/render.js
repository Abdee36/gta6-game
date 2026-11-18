// All drawing for Solmarina: the sun-soaked city, its actors, the HUD with a
// minimap, and the menu screens. One canvas, one camera, no DOM UI, so every
// frame — including screenshots — is the game itself.
import { COLORS, ROAD_WIDTH, WORLD_SIZE, districtAt } from './config.js';
import { clamp } from './random.js';
import { currentObjective, taxiMarker } from './missions.js';

function blockIntervals(lines) {
  const edges = [0, ...lines.map((l) => l - ROAD_WIDTH / 2), WORLD_SIZE];
  const starts = [0, ...lines.map((l) => l + ROAD_WIDTH / 2)];
  const out = [];
  for (let i = 0; i < starts.length; i += 1) out.push([starts[i], edges[i + 1]]);
  return out;
}

function hash2(seed, i) {
  let h = (seed ^ Math.imul(i + 1, 2654435761)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  return (h ^ (h >>> 13)) / 4294967296;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, fill, align, weight) {
  ctx.font = `${weight || 700} ${size}px Verdana, sans-serif`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 5);
  ctx.strokeStyle = 'rgba(20,16,10,0.85)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let viewW = 1280;
  let viewH = 720;

  function resize() {
    viewW = window.innerWidth || 1280;
    viewH = window.innerHeight || 720;
    canvas.width = viewW;
    canvas.height = viewH;
  }
  resize();
  window.addEventListener('resize', resize);

  function drawGround(g, cam) {
    const w = g.world;
    const x0 = cam.x - viewW / 2 / cam.zoom - 60;
    const y0 = cam.y - viewH / 2 / cam.zoom - 60;
    const x1 = cam.x + viewW / 2 / cam.zoom + 60;
    const y1 = cam.y + viewH / 2 / cam.zoom + 60;
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Park lawn.
    ctx.fillStyle = COLORS.parkGrass;
    ctx.fillRect(w.park.x, w.park.y, w.park.w, w.park.h);
    // Beach sand.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(w.beach.x, w.beach.y, w.beach.w, w.beach.h);
    // Sidewalk blocks.
    const intervals = blockIntervals(w.lines);
    ctx.fillStyle = COLORS.sidewalk;
    for (const [bx0, bx1] of intervals) {
      for (const [by0, by1] of intervals) {
        if (bx1 < x0 || bx0 > x1 || by1 < y0 || by0 > y1) continue;
        ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
      }
    }
    // Water with drifting wave lines.
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(w.water.x, w.water.y, w.water.w, w.water.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    const waveOff = (g.time * 22) % 46;
    for (let y = Math.floor(y0 / 46) * 46; y < y1; y += 46) {
      ctx.beginPath();
      for (let x = w.water.x + 8; x < w.water.x + w.water.w - 4; x += 26) {
        ctx.lineTo(x, y + waveOff + Math.sin((x + g.time * 30) / 34) * 4);
      }
      ctx.stroke();
    }
    // Roads.
    ctx.fillStyle = COLORS.asphalt;
    for (const l of w.lines) {
      ctx.fillRect(l - ROAD_WIDTH / 2, y0, ROAD_WIDTH, y1 - y0);
      ctx.fillRect(x0, l - ROAD_WIDTH / 2, x1 - x0, ROAD_WIDTH);
    }
    // Lane dashes.
    ctx.fillStyle = COLORS.laneDash;
    const dash = 26;
    const gap = 30;
    for (const l of w.lines) {
      for (let p = Math.floor(y0 / (dash + gap)) * (dash + gap); p < y1; p += dash + gap) {
        if (w.lines.some((c) => Math.abs(p + dash / 2 - c) < ROAD_WIDTH / 2 + 4)) continue;
        ctx.fillRect(l - 2, p, 4, dash);
      }
      for (let p = Math.floor(x0 / (dash + gap)) * (dash + gap); p < x1; p += dash + gap) {
        if (w.lines.some((c) => Math.abs(p + dash / 2 - c) < ROAD_WIDTH / 2 + 4)) continue;
        ctx.fillRect(p, l - 2, dash, 4);
      }
    }
    // Crosswalks at intersections.
    ctx.fillStyle = COLORS.crosswalk;
    for (const lx of w.lines) {
      for (const ly of w.lines) {
        if (lx < x0 - 80 || lx > x1 + 80 || ly < y0 - 80 || ly > y1 + 80) continue;
        for (let i = -2; i <= 2; i += 1) {
          ctx.fillRect(lx - ROAD_WIDTH / 2 + 8, ly + i * 13 - 3, 16, 6);
          ctx.fillRect(lx + ROAD_WIDTH / 2 - 24, ly + i * 13 - 3, 16, 6);
          ctx.fillRect(lx + i * 13 - 3, ly - ROAD_WIDTH / 2 + 8, 6, 16);
          ctx.fillRect(lx + i * 13 - 3, ly + ROAD_WIDTH / 2 - 24, 6, 16);
        }
      }
    }
  }

  function drawBuildings(g, cam) {
    const x0 = cam.x - viewW / 2 / cam.zoom - 80;
    const y0 = cam.y - viewH / 2 / cam.zoom - 80;
    const x1 = cam.x + viewW / 2 / cam.zoom + 80;
    const y1 = cam.y + viewH / 2 / cam.zoom + 80;
    for (const b of g.world.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      const lift = b.tall ? 12 : 6;
      ctx.fillStyle = 'rgba(30,20,10,0.28)';
      ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y - lift, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y - lift + 6, b.w - 12, b.h - 12);
      // Rooftop details and window dots.
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const cols = Math.max(2, Math.floor(b.w / 34));
      const rows = Math.max(2, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          if (hash2(b.seed, cx * 31 + cy) < 0.55) {
            ctx.fillRect(b.x + 12 + cx * ((b.w - 24) / cols), b.y - lift + 12 + cy * ((b.h - 24) / rows), 9, 7);
          }
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + b.w - 22, b.y - lift + 10, 12, 10);
      // Rooftop structures: AC units and vents break up the flat roof.
      const units = 1 + Math.floor(hash2(b.seed, 7) * 3);
      for (let u = 0; u < units; u += 1) {
        const ux = b.x + 14 + hash2(b.seed, 100 + u) * Math.max(10, b.w - 42);
        const uy = b.y - lift + 14 + hash2(b.seed, 200 + u) * Math.max(10, b.h - 42);
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.fillRect(ux, uy, 15, 11);
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.fillRect(ux, uy, 15, 3);
      }
    }
    // Palms.
    for (const palm of g.world.palms) {
      if (palm.x < x0 || palm.x > x1 || palm.y < y0 || palm.y > y1) continue;
      ctx.fillStyle = 'rgba(30,20,10,0.2)';
      ctx.beginPath();
      ctx.ellipse(palm.x + 5, palm.y + 6, 12, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = COLORS.palmTrunk;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(palm.x, palm.y + 4);
      ctx.lineTo(palm.x + palm.lean * 14, palm.y - 10);
      ctx.stroke();
      ctx.strokeStyle = COLORS.palmLeaf;
      ctx.lineWidth = 3;
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + palm.lean;
        ctx.beginPath();
        ctx.moveTo(palm.x + palm.lean * 14, palm.y - 10);
        ctx.quadraticCurveTo(
          palm.x + palm.lean * 14 + Math.cos(a) * 12, palm.y - 10 + Math.sin(a) * 12 - 4,
          palm.x + palm.lean * 14 + Math.cos(a) * 20, palm.y - 10 + Math.sin(a) * 20 + 3,
        );
        ctx.stroke();
      }
    }
    // Street lamps.
    ctx.fillStyle = '#3a3a42';
    for (const lamp of g.world.lamps) {
      if (lamp.x < x0 || lamp.x > x1 || lamp.y < y0 || lamp.y > y1) continue;
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMarker(x, y, color, pulse, label) {
    const bob = Math.sin(pulse * 4) * 5;
    ctx.save();
    ctx.translate(x, y + bob - 26);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 14);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(pulse * 4);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y, 24, 10, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (label) text(ctx, label, x, y - 46, 13, '#ffffff', 'center');
  }

  function drawCar(car, time) {
    const model = { length: 46, width: 22 };
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(30,20,10,0.3)';
    roundRect(ctx, -model.length / 2 + 2, -model.width / 2 + 4, model.length, model.width, 7);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#1c1c22';
    const wl = 9;
    const ww = 5;
    ctx.fillRect(-model.length / 2 + 6, -model.width / 2 - 2, wl, ww);
    ctx.fillRect(-model.length / 2 + 6, model.width / 2 - 3, wl, ww);
    ctx.fillRect(model.length / 2 - 15, -model.width / 2 - 2, wl, ww);
    ctx.fillRect(model.length / 2 - 15, model.width / 2 - 3, wl, ww);
    // Body.
    ctx.fillStyle = car.dead ? '#3c3c40' : car.color;
    roundRect(ctx, -model.length / 2, -model.width / 2, model.length, model.width, 7);
    ctx.fill();
    if (car.kind === 'police') {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(-6, -model.width / 2, 16, model.width);
      ctx.fillStyle = '#20242c';
      ctx.fillRect(-6, -model.width / 2, 2, model.width);
      ctx.fillRect(8, -model.width / 2, 2, model.width);
    }
    if (car.model === 'taxi') {
      ctx.fillStyle = '#222222';
      ctx.fillRect(-4, -3, 8, 6);
    }
    // Windshield and roof.
    ctx.fillStyle = COLORS.glass;
    ctx.fillRect(6, -model.width / 2 + 4, 8, model.width - 8);
    ctx.fillStyle = car.dead ? '#2c2c30' : 'rgba(0,0,0,0.16)';
    ctx.fillRect(-10, -model.width / 2 + 4, 14, model.width - 8);
    // Lights.
    ctx.fillStyle = '#fff8c9';
    ctx.fillRect(model.length / 2 - 3, -model.width / 2 + 3, 3, 5);
    ctx.fillRect(model.length / 2 - 3, model.width / 2 - 8, 3, 5);
    ctx.fillStyle = car.brakeLight ? '#ff3b30' : '#a33';
    ctx.fillRect(-model.length / 2, -model.width / 2 + 3, 3, 5);
    ctx.fillRect(-model.length / 2, model.width / 2 - 8, 3, 5);
    // Police light bar.
    if (car.kind === 'police' && !car.dead) {
      const phase = Math.floor(time * 6 + car.sirenPhase) % 2 === 0;
      ctx.fillStyle = phase ? '#ff3b30' : '#3b82ff';
      ctx.fillRect(-4, -model.width / 2 + 1, 8, 6);
      ctx.fillStyle = phase ? '#3b82ff' : '#ff3b30';
      ctx.fillRect(-4, model.width / 2 - 7, 8, 6);
    }
    // Target car marker ring.
    if (car.targetCar && car.kind !== 'player') {
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 34 + Math.sin(time * 4) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPerson(x, y, angle, shirt, skin, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    if (o.down) {
      ctx.fillStyle = 'rgba(30,20,10,0.25)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 15, 7, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 7, angle, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * 13, Math.sin(angle) * 13, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const bob = o.bob || 0;
    ctx.fillStyle = 'rgba(30,20,10,0.25)';
    ctx.beginPath();
    ctx.ellipse(1, 3, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.arc(0, 0, 10 + bob, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(3, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    if (o.cap) {
      ctx.fillStyle = o.cap;
      ctx.beginPath();
      ctx.arc(1, 0, 6.5, -1.2, 1.2);
      ctx.lineTo(1, 0);
      ctx.fill();
    }
    if (o.gun) {
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(6, 3);
      ctx.lineTo(17, 3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld(g) {
    const cam = g.camera;
    const shakeX = (Math.random() - 0.5) * cam.shake;
    const shakeY = (Math.random() - 0.5) * cam.shake;
    ctx.save();
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
    drawGround(g, cam);
    drawBuildings(g, cam);
    // Skid marks.
    ctx.strokeStyle = 'rgba(20,20,24,0.4)';
    ctx.lineWidth = 3;
    for (const s of g.skids) {
      ctx.globalAlpha = clamp(s.life / 5, 0, 1) * 0.5;
      ctx.beginPath();
      ctx.moveTo(s.x - 4, s.y - 4);
      ctx.lineTo(s.x + 4, s.y + 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Pickups.
    for (const pk of g.pickups) {
      if (pk.taken) continue;
      if (pk.kind === 'cash') {
        ctx.fillStyle = '#3f8f4a';
        roundRect(ctx, pk.x - 9, pk.y - 7, 18, 14, 3);
        ctx.fill();
        text(ctx, '$', pk.x, pk.y + 1, 13, '#ffffff', 'center');
      } else {
        ctx.fillStyle = '#f2f2f2';
        roundRect(ctx, pk.x - 9, pk.y - 9, 18, 18, 3);
        ctx.fill();
        ctx.fillStyle = '#d94f4f';
        ctx.fillRect(pk.x - 2, pk.y - 6, 4, 12);
        ctx.fillRect(pk.x - 6, pk.y - 2, 12, 4);
      }
    }
    // Objective markers.
    const obj = currentObjective(g);
    if (obj) drawMarker(obj.x, obj.y, '#ffd76a', g.time, obj.title);
    const taxi = taxiMarker(g);
    if (taxi) drawMarker(taxi.x, taxi.y, '#5ad06a', g.time + 1, taxi.label);
    if (g.missions.active < 0) {
      const office = g.world.spots.irisOffice;
      drawMarker(office.x, office.y, '#ffd76a', g.time, 'Job');
    }
    const garage = g.world.spots.garage;
    drawMarker(garage.x, garage.y, '#6ab8ff', g.time + 2, 'Garage');
    // Cars, peds, enemies, player.
    for (const car of g.cars) drawCar(car, g.time);
    for (const ped of g.peds) {
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.skin, { down: ped.downTimer > 0, bob: ped.state === 'flee' ? 1 : 0 });
    }
    for (const e of g.enemies) {
      drawPerson(e.x, e.y, e.angle, '#7a2b2b', '#e0ac69', { down: e.dead, gun: !e.dead });
    }
    const p = g.player;
    if (!p.inCar) {
      const bob = p.moving ? Math.sin(p.walkPhase / 22) * 1.2 : 0;
      drawPerson(p.x, p.y, p.angle, '#e07a2b', '#f2c89b', { bob, cap: '#2b4f8a', gun: true });
    }
    // Bullets: a bright tracer streak with a hot core, so a firefight reads
    // even in a still frame.
    for (const b of g.bullets) {
      ctx.strokeStyle = b.fromEnemy ? 'rgba(255,120,90,0.85)' : 'rgba(255,243,176,0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Particles.
    for (const pt of g.particles) {
      ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawMinimap(g) {
    const size = 186;
    const mx = 16;
    const my = viewH - size - 16;
    const scale = size / WORLD_SIZE;
    ctx.save();
    ctx.fillStyle = 'rgba(12,14,18,0.78)';
    roundRect(ctx, mx - 6, my - 6, size + 12, size + 12, 10);
    ctx.fill();
    ctx.beginPath();
    ctx.rect(mx, my, size, size);
    ctx.clip();
    ctx.fillStyle = '#5d7a4a';
    ctx.fillRect(mx, my, size, size);
    ctx.fillStyle = '#2e8fa8';
    ctx.fillRect(mx + g.world.water.x * scale, my, g.world.water.w * scale, size);
    ctx.strokeStyle = '#3a3a42';
    ctx.lineWidth = 3;
    for (const l of g.world.lines) {
      ctx.beginPath();
      ctx.moveTo(mx + l * scale, my);
      ctx.lineTo(mx + l * scale, my + size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx, my + l * scale);
      ctx.lineTo(mx + size, my + l * scale);
      ctx.stroke();
    }
    function dot(x, y, color, r) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx + x * scale, my + y * scale, r || 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const obj = currentObjective(g);
    if (obj) dot(obj.x, obj.y, '#ffd76a', 5);
    const taxi = taxiMarker(g);
    if (taxi) dot(taxi.x, taxi.y, '#5ad06a', 4);
    dot(g.world.spots.garage.x, g.world.spots.garage.y, '#6ab8ff', 3);
    for (const e of g.enemies) if (!e.dead) dot(e.x, e.y, '#ff5a4f', 3);
    const flash = Math.floor(g.time * 4) % 2 === 0;
    for (const car of g.cars) {
      if (car.kind === 'police' && !car.dead) dot(car.x, car.y, flash ? '#ff3b30' : '#3b82ff', 4);
    }
    // Player arrow.
    const p = g.player;
    const angle = p.inCar ? p.inCar.angle : p.angle;
    ctx.save();
    ctx.translate(mx + p.x * scale, my + p.y * scale);
    ctx.rotate(angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.restore();
    text(ctx, districtAt(p.x, p.y), mx + size / 2, my - 16, 13, '#ffffff', 'center');
  }

  function drawHUD(g) {
    const p = g.player;
    // Objective panel.
    const obj = currentObjective(g);
    if (obj) {
      const d = Math.round(Math.hypot(obj.x - p.x, obj.y - p.y));
      ctx.fillStyle = 'rgba(12,14,18,0.72)';
      roundRect(ctx, 16, 16, 330, 56, 8);
      ctx.fill();
      text(ctx, obj.title, 28, 32, 14, '#ffd76a', 'left');
      text(ctx, obj.text, 28, 52, 13, '#ffffff', 'left');
      let right = `${d}m`;
      if (obj.timeLimit) right = `${Math.max(0, Math.ceil(obj.timeLimit - obj.timer))}s  •  ${d}m`;
      text(ctx, right, 334, 32, 14, '#ffffff', 'right');
    } else if (g.missions.active < 0) {
      ctx.fillStyle = 'rgba(12,14,18,0.72)';
      roundRect(ctx, 16, 16, 330, 40, 8);
      ctx.fill();
      text(ctx, 'Free roam — visit Iris for work', 28, 37, 13, '#ffffff', 'left');
    }
    // Money and wanted stars.
    text(ctx, `$${Math.round(p.money).toLocaleString('en-US')}`, viewW - 20, 32, 22, '#7be382', 'right');
    const stars = g.police.wanted;
    let starText = '';
    for (let i = 0; i < 5; i += 1) starText += i < stars ? '★' : '☆';
    text(ctx, starText, viewW - 20, 60, 20, stars > 0 ? '#ffd76a' : 'rgba(255,255,255,0.6)', 'right');
    if (g.police.bustProgress > 0) {
      ctx.fillStyle = 'rgba(12,14,18,0.72)';
      roundRect(ctx, viewW - 220, 78, 200, 20, 6);
      ctx.fill();
      ctx.fillStyle = '#ff5a4f';
      ctx.fillRect(viewW - 214, 84, 188 * clamp(g.police.bustProgress, 0, 1), 8);
      text(ctx, 'BUSTED?', viewW - 20, 88, 11, '#ffffff', 'right');
    }
    // Health and speed.
    const hx = viewW - 236;
    const hy = viewH - 46;
    const panelH = p.inCar ? 50 : 34;
    ctx.fillStyle = 'rgba(12,14,18,0.72)';
    roundRect(ctx, hx - 8, hy - 14, 220, panelH, 8);
    ctx.fill();
    text(ctx, 'HP', hx, hy + 3, 12, '#ffffff', 'left');
    ctx.fillStyle = '#333333';
    ctx.fillRect(hx + 30, hy - 4, 170, 12);
    ctx.fillStyle = p.health > 40 ? '#7be382' : '#ff5a4f';
    ctx.fillRect(hx + 30, hy - 4, 170 * clamp(p.health / 100, 0, 1), 12);
    if (p.inCar) {
      const mph = Math.round(Math.abs(p.inCar.speed) * 0.09);
      text(ctx, `${mph} mph  •  ${p.inCar.name}`, viewW - 20, viewH - 72, 15, '#ffffff', 'right');
      const car = p.inCar;
      ctx.fillStyle = '#333333';
      ctx.fillRect(hx + 30, hy + 14, 170, 6);
      ctx.fillStyle = car.health > 40 ? '#6ab8ff' : '#ff5a4f';
      ctx.fillRect(hx + 30, hy + 14, 170 * clamp(car.health / car.maxHealth, 0, 1), 6);
    }
    // Banners.
    let by = 96;
    for (const banner of g.banners) {
      const alpha = clamp(banner.life / 0.6, 0, 1);
      ctx.globalAlpha = alpha;
      text(ctx, banner.text, viewW / 2, by, 17, '#ffffff', 'center');
      ctx.globalAlpha = 1;
      by += 26;
    }
    // Mission briefing card.
    if (g.missions.briefTimer > 0 && g.missions.active >= 0) {
      const def = g.missionDefs[g.missions.active];
      const bw = 520;
      const bx = viewW / 2 - bw / 2;
      const bh = 108;
      ctx.fillStyle = 'rgba(12,14,18,0.85)';
      roundRect(ctx, bx, 130, bw, bh, 10);
      ctx.fill();
      text(ctx, `${def.title}  •  ${def.giver}`, viewW / 2, 152, 16, '#ffd76a', 'center');
      wrapText(def.briefing, viewW / 2, 178, bw - 40, 14, '#ffffff');
      text(ctx, `Reward: $${def.reward}`, viewW / 2, 222, 13, '#7be382', 'center');
    }
    // Controls hint, fading.
    if (g.hintTimer > 0 && g.mode === 'play') {
      ctx.globalAlpha = clamp(g.hintTimer / 2, 0, 1) * 0.9;
      text(ctx, 'WASD move/drive  •  E enter car / start job  •  Mouse aim, Click shoot  •  Shift run  •  P pause  •  M mute', viewW / 2, viewH - 20, 13, '#ffffff', 'center');
      ctx.globalAlpha = 1;
    }
    // Context prompt.
    if (g.prompt) {
      text(ctx, g.prompt, viewW / 2, viewH - 52, 15, '#ffd76a', 'center');
    }
    // Damage vignette. Staged scenes cap it low: a mid-fight photo should
    // read as a fight, not a red wash.
    if (p.hurtTimer > 0) {
      const cap = g.shotMode ? 0.18 : 0.45;
      const a = clamp(p.hurtTimer / 2, 0, cap);
      const grad = ctx.createRadialGradient(viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.35, viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.7);
      grad.addColorStop(0, 'rgba(200,30,20,0)');
      grad.addColorStop(1, `rgba(200,30,20,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);
    }
    // Crosshair when on foot.
    if (!p.inCar && g.mode === 'play') {
      const m = g.input.mouse;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(m.x - 13, m.y);
      ctx.lineTo(m.x - 5, m.y);
      ctx.moveTo(m.x + 5, m.y);
      ctx.lineTo(m.x + 13, m.y);
      ctx.moveTo(m.x, m.y - 13);
      ctx.lineTo(m.x, m.y - 5);
      ctx.moveTo(m.x, m.y + 5);
      ctx.lineTo(m.x, m.y + 13);
      ctx.stroke();
    }
    drawMinimap(g);
  }

  function wrapText(str, cx, y, maxWidth, size, fill) {
    ctx.font = `400 ${size}px Verdana, sans-serif`;
    const words = str.split(' ');
    const lines = [''];
    for (const word of words) {
      const trial = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
      if (ctx.measureText(trial).width > maxWidth && lines[lines.length - 1]) lines.push(word);
      else lines[lines.length - 1] = trial;
    }
    lines.slice(0, 3).forEach((line, i) => {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fill;
      ctx.fillText(line, cx, y + i * (size + 5));
    });
  }

  function overlay(alpha) {
    ctx.fillStyle = `rgba(10,10,16,${alpha})`;
    ctx.fillRect(0, 0, viewW, viewH);
  }

  function drawTitle(g) {
    overlay(0.45);
    // A soft panel behind the title so the city stays visible but the words
    // never fight a palm tree or a rooftop for contrast.
    ctx.fillStyle = 'rgba(8,10,16,0.42)';
    roundRect(ctx, viewW / 2 - 430, viewH * 0.3 - 84, 860, 300, 16);
    ctx.fill();
    const cy = viewH * 0.3;
    text(ctx, 'SOLMARINA', viewW / 2, cy, 64, '#ffd76a', 'center', 900);
    text(ctx, 'AN OPEN-WORLD CRIME STORY', viewW / 2, cy + 48, 17, '#ffffff', 'center');
    text(ctx, 'Marco Venn came to Solmarina with $120 and a fast car. Iris Kade has work — if he can handle the heat.', viewW / 2, cy + 84, 14, '#e8e2d2', 'center');
    const hasSave = !!g.saveData;
    const items = hasSave
      ? ['ENTER — Continue the story', 'N — New game', 'H — How to play']
      : ['ENTER — Start the story', 'H — How to play'];
    items.forEach((item, i) => {
      text(ctx, item, viewW / 2, cy + 128 + i * 32, 17, i === 0 ? '#7be382' : '#ffffff', 'center');
    });
    text(ctx, 'WASD move & drive  •  E steal / enter cars  •  Mouse + Click shoot  •  P pause  •  M sound', viewW / 2, viewH - 60, 13, '#cfc8b8', 'center');
    text(ctx, 'An original game: its city, people and story are invented. No real city, person or game is depicted.', viewW / 2, viewH - 34, 12, '#9a9484', 'center');
    if (g.showHelp) drawHelp();
  }

  function drawHelp() {
    const bw = 560;
    const bh = 330;
    const bx = viewW / 2 - bw / 2;
    const by = viewH / 2 - bh / 2;
    ctx.fillStyle = 'rgba(12,14,18,0.95)';
    roundRect(ctx, bx, by, bw, bh, 12);
    ctx.fill();
    text(ctx, 'HOW TO PLAY', viewW / 2, by + 30, 20, '#ffd76a', 'center');
    const lines = [
      ['Move / drive', 'W A S D or arrow keys'],
      ['Run', 'Hold Shift on foot'],
      ['Enter / steal a car', 'E near a car (drivers object)'],
      ['Shoot', 'Aim with the mouse, click to fire'],
      ['Start a job', 'E at the yellow marker by Iris\' office'],
      ['Respray (clear wanted)', 'Drive into Lucky Garage with $200'],
      ['Pause', 'P or Esc'],
      ['Sound', 'M to mute'],
      ['Taxi fares', 'Drive around — riders flag you down'],
      ['Hidden stashes', '12 cash stashes hide in the blocks'],
    ];
    lines.forEach(([a, b], i) => {
      text(ctx, a, bx + 30, by + 66 + i * 26, 14, '#ffffff', 'left');
      text(ctx, b, bx + bw - 30, by + 66 + i * 26, 14, '#ffd76a', 'right');
    });
    text(ctx, 'Press H to close', viewW / 2, by + bh - 22, 13, '#cfc8b8', 'center');
  }

  function drawPause(g) {
    overlay(0.55);
    text(ctx, 'PAUSED', viewW / 2, viewH / 2 - 60, 40, '#ffffff', 'center', 900);
    text(ctx, 'P / Esc — resume', viewW / 2, viewH / 2 - 8, 16, '#ffffff', 'center');
    text(ctx, 'H — how to play', viewW / 2, viewH / 2 + 24, 16, '#ffffff', 'center');
    text(ctx, 'R — restart from the title screen', viewW / 2, viewH / 2 + 56, 16, '#ffffff', 'center');
    if (g.showHelp) drawHelp();
  }

  function drawEnd(g, title, color, lines) {
    overlay(0.6);
    text(ctx, title, viewW / 2, viewH / 2 - 50, 52, color, 'center', 900);
    lines.forEach((line, i) => {
      text(ctx, line, viewW / 2, viewH / 2 + 4 + i * 28, 16, '#ffffff', 'center');
    });
    text(ctx, 'Press ENTER to get back on the street', viewW / 2, viewH / 2 + 100, 15, '#ffd76a', 'center');
  }

  function render(g) {
    ctx.clearRect(0, 0, viewW, viewH);
    drawWorld(g);
    if (g.mode === 'play' || g.mode === 'pause') drawHUD(g);
    if (g.mode === 'title') drawTitle(g);
    if (g.mode === 'pause') drawPause(g);
    if (g.mode === 'wasted') {
      drawHUD(g);
      drawEnd(g, 'WASTED', '#ff5a4f', ['Marco wakes up at General Hospital.', `$${g.endCost} hospital bill. Your job, if any, failed.`]);
    }
    if (g.mode === 'busted') {
      drawHUD(g);
      drawEnd(g, 'BUSTED', '#6ab8ff', ['The Solmarina PD let Marco go — for a price.', `$${g.endCost} fine. Your job, if any, failed.`]);
    }
  }

  return { resize, render, viewSize: () => ({ w: viewW, h: viewH }) };
}

// World coordinates of the mouse, for aiming.
export function mouseWorld(g, viewW, viewH) {
  const cam = g.camera;
  const m = g.input.mouse;
  return {
    x: cam.x + (m.x - viewW / 2) / cam.zoom,
    y: cam.y + (m.y - viewH / 2) / cam.zoom,
  };
}
