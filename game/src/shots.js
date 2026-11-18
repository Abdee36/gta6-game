// Staged screenshot scenes behind ?shot=start|drive|chase|mission. Each scene
// sets up a real game state — a seeded city, real actors, real rules — then a
// small autopilot keeps it alive, so the captured frame is genuine gameplay.
import { SPOTS } from './config.js';
import { clamp } from './random.js';
import { createCar, createEnemy } from './entities.js';
import { addWanted } from './police.js';
import { nearestRoadPoint, collideCircle } from './world.js';

function respawnActorsNear(g, x, y) {
  for (const car of g.cars) {
    if (car.kind !== 'traffic') continue;
    const spot = nearestRoadPoint(g.world, x + (Math.random() - 0.5) * 1400, y + (Math.random() - 0.5) * 1400);
    car.x = spot.x;
    car.y = spot.y;
    car.roadAxis = Math.abs(spot.x - x) > Math.abs(spot.y - y) ? 'y' : 'x';
    car.roadLine = car.roadAxis === 'x' ? spot.y : spot.x;
    car.roadDir = Math.random() < 0.5 ? 1 : -1;
    car.speed = 180;
  }
  for (const ped of g.peds) {
    const spot = nearestRoadPoint(g.world, x + (Math.random() - 0.5) * 1200, y + (Math.random() - 0.5) * 1200);
    // Peds belong on sidewalks, offset perpendicular to the road, not on it.
    const onVertical = g.world.lines.includes(spot.x);
    const off = (62 + Math.random() * 28) * (Math.random() < 0.5 ? 1 : -1);
    ped.x = spot.x + (onVertical ? off : (Math.random() - 0.5) * 60);
    ped.y = spot.y + (onVertical ? (Math.random() - 0.5) * 60 : off);
    ped.tx = ped.x;
    ped.ty = ped.y;
  }
}

export function stageShot(name, g) {
  g.shotMode = name;
  g.hintTimer = 0;
  g.banners = [];
  g.time = 3;
  const p = g.player;

  if (name === 'start') {
    g.mode = 'title';
    g.camera.x = 1575;
    g.camera.y = 1575;
    g.saveData = null;
    return;
  }

  g.mode = 'play';
  if (name === 'drive') {
    const car = createCar('muscle', 1575, 900, Math.PI / 2, 'player', g.rng);
    car.color = '#8a2f2f';
    car.speed = 380;
    g.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.money = 420;
    respawnActorsNear(g, 1575, 1100);
    g.camera.x = car.x;
    g.camera.y = car.y;
    g.shotWaypoint = { x: 1575, y: 1575 };
    return;
  }

  if (name === 'chase') {
    const car = createCar('coupe', 1575, 1200, Math.PI / 2, 'player', g.rng);
    car.color = '#4f7ec9';
    car.speed = 430;
    car.targetCar = true;
    // Armored for the photo: three ramming cruisers must not wreck the
    // staged car (and fail the staged job) before the frame is taken.
    car.health = 400;
    car.maxHealth = 400;
    g.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.money = 650;
    // A repo-job in progress: the objective marker shows on the HUD.
    g.missions.active = 1;
    g.missions.step = 2;
    g.missions.targetCar = car;
    addWanted(g, 3, 3, 'staged chase');
    g.events = [];
    for (let i = 0; i < 2; i += 1) {
      const cop = createCar('police', 1575 + (i % 2 === 0 ? -30 : 30), 1200 - 200 - i * 120, Math.PI / 2, 'police', g.rng);
      cop.speed = 420;
      g.cars.push(cop);
    }
    respawnActorsNear(g, 1575, 1400);
    g.camera.x = car.x;
    g.camera.y = car.y;
    g.shotWaypoint = { x: 1575, y: 2025 };
    return;
  }

  // mission: on foot at the docks, mid-firefight.
  p.inCar = null;
  p.x = 3120;
  p.y = 2870;
  p.health = 100;
  g.shotAnchor = { x: p.x, y: p.y };
  p.money = 780;
  p.angle = Math.PI;
  g.missions.active = 2;
  g.missions.step = 1;
  g.missions.kills = 1;
  g.missions.killsNeeded = 4;
  const spots = [
    [2980, 2760], [3260, 2800], [3050, 3010], [3180, 2700],
  ];
  for (const [ex, ey] of spots) {
    const clear = collideCircle(g.world, ex, ey, 14);
    const e = createEnemy(clear.x, clear.y);
    e.fireCooldown = 0.4;
    // Tough enough to survive the staged firefight until the photo is taken.
    e.health = 200;
    g.enemies.push(e);
  }
  addWanted(g, 1, 1, 'staged mission');
  g.events = [];
  respawnActorsNear(g, 3120, 2870);
  g.camera.x = p.x;
  g.camera.y = p.y;
}

// The autopilot that keeps a staged scene framed while the screenshot is
// taken. Returns the input the game loop should use this frame.
export function shotAutopilot(g) {
  const p = g.player;
  if (g.shotMode === 'mission') {
    let best = null;
    let bestD = Infinity;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    // Strafe around the anchor point: a moving target takes far fewer hits,
    // and the gunfight reads as motion instead of a red damage flash.
    const anchor = g.shotAnchor || { x: p.x, y: p.y };
    const ax = p.x - anchor.x;
    const ay = p.y - anchor.y;
    const ad = Math.hypot(ax, ay) || 1;
    const flip = Math.floor(g.time / 1.3) % 2 === 0 ? 1 : -1;
    let moveX;
    let moveY;
    if (ad > 120) {
      moveX = -ax / ad;
      moveY = -ay / ad;
    } else {
      moveX = (-ay / ad) * flip;
      moveY = (ax / ad) * flip;
    }
    const firing = best !== null && (g.time % 1.2) < 0.6;
    return {
      moveX, moveY, running: false, throttle: 0, steer: 0,
      firing, aimX: best ? best.x : p.x + 100, aimY: best ? best.y : p.y,
    };
  }
  if (g.shotMode === 'drive' || g.shotMode === 'chase') {
    const car = p.inCar;
    if (!car) return null;
    // Lane-follow like a traffic car: hold the current road's lane, slow for
    // turns, and sometimes turn at an intersection, so the car never wedges
    // itself against a building mid-chase.
    const lines = g.world.lines;
    if (!g.shotAxis) {
      let bestD = Infinity;
      let axis = 'x';
      let line = lines[0];
      for (const l of lines) {
        if (Math.abs(car.x - l) < bestD) { bestD = Math.abs(car.x - l); axis = 'y'; line = l; }
        if (Math.abs(car.y - l) < bestD) { bestD = Math.abs(car.y - l); axis = 'x'; line = l; }
      }
      g.shotAxis = axis;
      g.shotLine = line;
      g.shotDir = axis === 'x' ? (Math.cos(car.angle) >= 0 ? 1 : -1) : (Math.sin(car.angle) >= 0 ? 1 : -1);
    }
    const axis = g.shotAxis;
    const line = g.shotLine;
    const dir = g.shotDir;
    const lane = 22;
    // Dodge: steer around any car dead ahead (cruisers included) instead of
    // ramming it and getting boxed in.
    let dodge = 0;
    let closeAhead = false;
    for (const other of g.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = -dx * Math.sin(car.angle) + dy * Math.cos(car.angle);
      if (ahead > 0 && ahead < 130 && Math.abs(side) < 36) {
        dodge = side >= 0 ? -52 : 52;
        if (ahead < 55) closeAhead = true;
        break;
      }
    }
    // Aim down the lane. A fast wide arc clips building corners, so sharp
    // turns get a short lookahead and a near-stop: the car turns tightly and
    // stays on the road.
    const aim = (look) => {
      const tx = (axis === 'x' ? car.x + dir * look : line - lane * dir) - Math.sin(car.angle) * dodge;
      const ty = (axis === 'x' ? line + lane * dir : car.y + dir * look) + Math.cos(car.angle) * dodge;
      let d = Math.atan2(ty - car.y, tx - car.x) - car.angle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    };
    let delta = aim(150);
    if (Math.abs(delta) > 0.45) delta = aim(70);
    const steer = clamp(delta * 2.2, -1, 1);
    let throttle = 0.75;
    // The chase never brakes for turns — slowing down lets the cruisers box
    // the car in; the drive scene brakes because it never turns anyway.
    const turnThrottle = g.shotMode === 'chase' ? 0.5 : 0.2;
    const hardThrottle = g.shotMode === 'chase' ? 0.45 : -0.4;
    if (Math.abs(delta) > 1.0) throttle = hardThrottle;
    else if (Math.abs(delta) > 0.45) throttle = turnThrottle;
    if (closeAhead) throttle = Math.min(throttle, 0.3);
    const along = axis === 'x' ? car.x : car.y;
    let crossLine = null;
    for (const l of lines) {
      if (Math.abs(along - l) < 10) { crossLine = l; break; }
    }
    // Decide once per intersection, not once per frame. Driving scenes run
    // straight for the photo — a turn lets pursuing cruisers cut the corner
    // and intercept, which ends the chase in a pile-up instead of a pursuit.
    // The edge guard below still turns the car back near the map border.
    const turnP = 0;
    if (crossLine !== null && !g.shotWasNearCross) {
      if (Math.random() < turnP) {
        g.shotAxis = axis === 'x' ? 'y' : 'x';
        g.shotLine = crossLine;
        g.shotDir = Math.random() < 0.5 ? 1 : -1;
        // Center the car in the intersection before the turn.
        if (g.shotAxis === 'x') car.y = crossLine;
        else car.x = crossLine;
      }
    }
    g.shotWasNearCross = crossLine !== null;
    // Belt and braces: near the map edge, head back toward the middle.
    const nearEdge = car.x < 300 || car.x > 3300 || car.y < 300 || car.y > 3300;
    if (nearEdge && !g.shotWasNearEdge) {
      const cx = 1800 - car.x;
      const cy = 1800 - car.y;
      let best = lines[0];
      if (Math.abs(cx) > Math.abs(cy)) {
        for (const l of lines) if (Math.abs(l - car.y) < Math.abs(best - car.y)) best = l;
        g.shotAxis = 'x';
        g.shotLine = best;
        g.shotDir = Math.sign(cx) || 1;
      } else {
        for (const l of lines) if (Math.abs(l - car.x) < Math.abs(best - car.x)) best = l;
        g.shotAxis = 'y';
        g.shotLine = best;
        g.shotDir = Math.sign(cy) || 1;
      }
    }
    g.shotWasNearEdge = nearEdge;
    // If wedged anyway (a jam, a bad turn), back up briefly and re-snap to
    // the road instead of sitting still for the camera.
    if (g.shotReverse > 0) {
      g.shotReverse -= 1 / 60;
      return { moveX: 0, moveY: 0, running: false, throttle: -0.7, steer: -steer, firing: false, aimX: 0, aimY: 0 };
    }
    g.shotStuck = Math.abs(car.speed) < 12 ? (g.shotStuck || 0) + 1 / 60 : 0;
    if (g.shotStuck > 2) {
      g.shotAxis = null;
      g.shotStuck = 0;
      g.shotReverse = 0.7;
    }
    return { moveX: 0, moveY: 0, running: false, throttle, steer, firing: false, aimX: 0, aimY: 0 };
  }
  return null;
}

export { SPOTS };
