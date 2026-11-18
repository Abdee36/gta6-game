// Actors of Solmarina: the player on foot and behind the wheel, traffic,
// pedestrians, rival gunmen, bullets and particles. Updates take the shared
// game object `g` so every system sees the same world.
import { CAR_MODELS, ECONOMY, PLAYER, SPOTS } from './config.js';
import { clamp, dist } from './random.js';
import { collideCircle, isOnRoad, nearestRoadPoint } from './world.js';
import { sfx } from './audio.js';

let nextCarId = 1;

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, health: PLAYER.health, money: ECONOMY.startMoney,
    inCar: null, fireCooldown: 0, hurtTimer: 0, walkPhase: 0, moving: false, running: false,
  };
}

export function createCar(modelKey, x, y, angle, kind, rng) {
  const model = CAR_MODELS[modelKey];
  return {
    id: nextCarId,
    model: modelKey, name: model.name, x, y, angle, speed: 0,
    color: rng ? rng.pick(model.colors) : model.colors[0],
    kind, health: model.health, maxHealth: model.health,
    dead: false, exploded: false, smoke: 0,
    roadAxis: 'x', roadLine: y, roadDir: 1, cruise: 0,
    brakeLight: false, sirenPhase: 0, targetCar: false,
  };
}

export function createPed(x, y, rng) {
  const shirts = ['#d94f4f', '#4f7ec9', '#e0b13e', '#5aa86a', '#8a5aa8', '#e8e8e8', '#d97a2b'];
  const skins = ['#f2c89b', '#e0ac69', '#c68642', '#8d5524', '#f7d7b0'];
  return {
    x, y, angle: rng.range(0, Math.PI * 2), speed: rng.range(55, 80),
    shirt: rng.pick(shirts), skin: rng.pick(skins),
    state: 'walk', tx: x, ty: y, fleeTimer: 0, downTimer: 0, reported: false,
  };
}

export function createEnemy(x, y) {
  return {
    x, y, angle: 0, health: 40, fireCooldown: 0.6 + Math.random() * 0.6,
    strafeDir: Math.random() < 0.5 ? -1 : 1, strafeTimer: 0, dead: false,
  };
}

export function spawnParticles(g, x, y, count, color, speed, life, size) {
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    g.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.7), maxLife: life,
      color, size: size * (0.7 + Math.random() * 0.6),
    });
  }
  if (g.particles.length > 500) g.particles.splice(0, g.particles.length - 500);
}

function pushEvent(g, event) {
  g.events.push(event);
}

// --- The player on foot -----------------------------------------------------

export function updatePlayerOnFoot(g, dt, moveX, moveY, running, aimAngle) {
  const p = g.player;
  const len = Math.hypot(moveX, moveY);
  p.moving = len > 0.01;
  p.running = running && p.moving;
  if (p.moving) {
    const speed = p.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const nx = p.x + (moveX / len) * speed * dt;
    const ny = p.y + (moveY / len) * speed * dt;
    const hit = collideCircle(g.world, nx, ny, PLAYER.radius);
    p.x = hit.x;
    p.y = hit.y;
    p.walkPhase += speed * dt;
    if (aimAngle === null) p.angle = Math.atan2(moveY, moveX);
  }
  if (aimAngle !== null) p.angle = aimAngle;
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);
  if (p.hurtTimer === 0 && p.health < PLAYER.health) {
    p.health = Math.min(PLAYER.health, p.health + PLAYER.regenRate * dt);
  }
}

export function playerShoot(g, targetX, targetY) {
  const p = g.player;
  if (p.fireCooldown > 0) return;
  p.fireCooldown = PLAYER.fireInterval;
  const angle = Math.atan2(targetY - p.y, targetX - p.x);
  const spread = (Math.random() - 0.5) * 0.06;
  const a = angle + spread;
  g.bullets.push({
    x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
    vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
    life: 0.9, from: 'player', damage: PLAYER.bulletDamage,
  });
  spawnParticles(g, p.x + Math.cos(a) * 24, p.y + Math.sin(a) * 24, 3, '#ffd76a', 120, 0.12, 3);
  sfx('shot');
  pushEvent(g, { type: 'noise', x: p.x, y: p.y, radius: 420 });
  pushEvent(g, { type: 'wanted', amount: 0, min: 1, reason: 'gunfire' });
  g.camera.shake = Math.max(g.camera.shake, 2);
}

// --- Cars -------------------------------------------------------------------

export function nearestCar(g, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of g.cars) {
    if (car.dead) continue;
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(g, car) {
  const p = g.player;
  if (car.kind === 'traffic' || car.kind === 'parked') {
    // Stealing an occupied car spooks its driver out.
    if (car.kind === 'traffic') {
      const ped = createPed(car.x + 26, car.y + 26, g.rng);
      ped.state = 'flee';
      ped.fleeTimer = 4;
      g.peds.push(ped);
      pushEvent(g, { type: 'wanted', amount: 1, reason: 'car theft' });
      pushEvent(g, { type: 'banner', text: 'Car stolen — the owner called the cops!' });
    }
  }
  if (car.kind === 'police') {
    pushEvent(g, { type: 'wanted', amount: 2, reason: 'stolen police car' });
    pushEvent(g, { type: 'banner', text: 'You stole a police car!' });
  }
  car.kind = 'player';
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  sfx('door');
}

export function exitCar(g) {
  const p = g.player;
  const car = p.inCar;
  if (!car) return;
  const side = car.angle + Math.PI / 2;
  const spot = collideCircle(g.world, car.x + Math.cos(side) * 30, car.y + Math.sin(side) * 30, PLAYER.radius);
  p.x = spot.x;
  p.y = spot.y;
  p.angle = car.angle;
  p.inCar = null;
  sfx('door');
}

export function driveCar(g, car, throttle, steer, dt) {
  const model = CAR_MODELS[car.model];
  if (car.dead) {
    car.speed *= Math.max(0, 1 - 2.5 * dt);
  } else if (throttle > 0) {
    car.speed += model.accel * throttle * dt;
  } else if (throttle < 0) {
    if (car.speed > 5) car.speed -= model.brake * dt;
    else car.speed += model.accel * 0.6 * throttle * dt;
  } else {
    car.speed -= car.speed * 0.5 * dt;
  }
  car.speed -= car.speed * 0.18 * dt;
  car.speed = clamp(car.speed, -190, model.maxSpeed);
  car.brakeLight = throttle < 0 && car.speed > 5;
  const grip = clamp(Math.abs(car.speed) / 170, 0, 1);
  car.angle += steer * model.turn * grip * dt * (car.speed >= 0 ? 1 : -1);
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const nx = car.x + fx * car.speed * dt;
  const ny = car.y + fy * car.speed * dt;
  const front = collideCircle(g.world, nx + fx * 16, ny + fy * 16, 15);
  const back = collideCircle(g.world, nx - fx * 16, ny - fy * 16, 15);
  const hitWall = front.hit || back.hit;
  if (hitWall) {
    const impact = Math.abs(car.speed);
    car.x = (front.x + back.x) / 2;
    car.y = (front.y + back.y) / 2;
    if (impact > 130) {
      car.speed *= -0.28;
      damageCar(g, car, impact / 16, 'crash');
      spawnParticles(g, car.x + fx * 20, car.y + fy * 20, 10, '#ffb347', 200, 0.4, 3);
      sfx('crash');
      if (car === g.player.inCar) g.camera.shake = Math.max(g.camera.shake, 7);
    } else {
      car.speed *= 0.4;
    }
  } else {
    car.x = nx;
    car.y = ny;
  }
  // Skid marks and tyre smoke when cornering hard at speed.
  if (Math.abs(steer) > 0.7 && Math.abs(car.speed) > 300) {
    const rx = car.x - fx * 16;
    const ry = car.y - fy * 16;
    g.skids.push({ x: rx, y: ry, life: 5 });
    if (g.skids.length > 400) g.skids.splice(0, g.skids.length - 400);
    if (Math.random() < 0.3) spawnParticles(g, rx, ry, 1, '#cccccc', 40, 0.5, 4);
  }
  // Smoke when damaged.
  if (car.health < 45 && !car.dead && Math.random() < 0.35) {
    spawnParticles(g, car.x + fx * 18, car.y + fy * 18, 1, '#555555', 30, 0.9, 5);
  }
  return hitWall;
}

export function damageCar(g, car, amount, cause) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    explodeCar(g, car);
    if (car.targetCar) pushEvent(g, { type: 'targetDestroyed' });
    if (car === g.player.inCar) {
      pushEvent(g, { type: 'banner', text: 'Your car is wrecked!' });
      exitCar(g);
    }
  }
}

export function explodeCar(g, car) {
  if (car.exploded) return;
  car.exploded = true;
  spawnParticles(g, car.x, car.y, 26, '#ff8c2b', 260, 0.7, 5);
  spawnParticles(g, car.x, car.y, 18, '#444444', 120, 1.4, 7);
  spawnParticles(g, car.x, car.y, 10, '#ffd76a', 320, 0.35, 4);
  sfx('crash');
  const p = g.player;
  if (!p.inCar && dist(p.x, p.y, car.x, car.y) < 90) hurtPlayer(g, 25);
  if (dist(p.x, p.y, car.x, car.y) < 500) g.camera.shake = Math.max(g.camera.shake, 9);
}

export function hurtPlayer(g, amount) {
  const p = g.player;
  if (p.health <= 0) return;
  p.health -= amount;
  p.hurtTimer = PLAYER.regenDelay;
  g.camera.shake = Math.max(g.camera.shake, 4);
  if (p.health <= 0) {
    p.health = 0;
    pushEvent(g, { type: 'wasted' });
  }
}

function collideCarPair(g, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = 34;
  if (d === 0 || d >= min) return;
  const push = (min - d) / 2;
  const nx = dx / d;
  const ny = dy / d;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const rel = Math.abs(a.speed - b.speed);
  if (rel > 110) {
    // Momentum exchange, not glue: a rear-end shunt pushes the car ahead
    // forward, so chases stay fluid instead of collapsing into a standstill.
    const av = a.speed;
    const bv = b.speed;
    a.speed = av * 0.65 + bv * 0.35;
    b.speed = bv * 0.65 + av * 0.35;
    damageCar(g, a, rel / 26, 'crash');
    damageCar(g, b, rel / 26, 'crash');
    spawnParticles(g, (a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#ffb347', 180, 0.35, 3);
    sfx('crash');
    if (a === g.player.inCar || b === g.player.inCar) g.camera.shake = Math.max(g.camera.shake, 6);
  }
}

export function collideCars(g) {
  for (let i = 0; i < g.cars.length; i += 1) {
    for (let j = i + 1; j < g.cars.length; j += 1) {
      collideCarPair(g, g.cars[i], g.cars[j]);
    }
  }
}

// --- Traffic ------------------------------------------------------------------

function trafficTarget(car, world) {
  const lane = 22;
  if (car.roadAxis === 'x') return { x: car.x + car.roadDir * 120, y: car.roadLine + lane * car.roadDir };
  return { x: car.roadLine - lane * car.roadDir, y: car.y + car.roadDir * 120 };
}

export function updateTraffic(g, dt) {
  const p = g.player;
  for (const car of g.cars) {
    if (car.kind !== 'traffic' || car.dead) continue;
    // Recycle far-away cars to roads near the player so streets stay alive.
    if (dist(car.x, car.y, p.x, p.y) > 1150) {
      const spot = nearestRoadPoint(g.world, p.x + (Math.random() - 0.5) * 1600, p.y + (Math.random() - 0.5) * 1600);
      const vertical = Math.abs(spot.x - p.x) > Math.abs(spot.y - p.y);
      car.roadAxis = vertical ? 'y' : 'x';
      car.roadLine = vertical ? spot.x : spot.y;
      car.roadDir = Math.random() < 0.5 ? 1 : -1;
      car.x = spot.x;
      car.y = spot.y;
      car.speed = 0;
      continue;
    }
    // Bounce off the map edges instead of driving into the boundary.
    if (car.roadAxis === 'x' && ((car.roadDir > 0 && car.x > 3300) || (car.roadDir < 0 && car.x < 300))) car.roadDir *= -1;
    if (car.roadAxis === 'y' && ((car.roadDir > 0 && car.y > 3300) || (car.roadDir < 0 && car.y < 300))) car.roadDir *= -1;
    const target = trafficTarget(car, g.world);
    const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
    let delta = wantAngle - car.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const steer = clamp(delta * 2.2, -1, 1);
    // Slow for the car ahead.
    let throttle = 0.55;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    for (const other of g.cars) {
      if (other === car) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * fx + dy * fy;
      const side = Math.abs(-dx * fy + dy * fx);
      if (ahead > 0 && ahead < 78 && side < 26) { throttle = -0.7; break; }
    }
    // Gentle chance to turn at an intersection.
    const nearCross = g.world.lines.some((l) => Math.abs((car.roadAxis === 'x' ? car.x : car.y) - l) < 7);
    if (nearCross && Math.random() < dt * 0.5) {
      const cross = g.world.lines.reduce((best, l) => (
        Math.abs((car.roadAxis === 'x' ? car.x : car.y) - l) < Math.abs((car.roadAxis === 'x' ? car.x : car.y) - best) ? l : best
      ));
      const oldAxis = car.roadAxis;
      car.roadAxis = oldAxis === 'x' ? 'y' : 'x';
      car.roadLine = cross;
      car.roadDir = Math.random() < 0.5 ? 1 : -1;
      if (car.roadAxis === 'x') car.y = car.roadLine;
      else car.x = car.roadLine;
    }
    // If stuck behind a jam for a while, turn around instead of deadlocking.
    car.blocked = Math.abs(car.speed) < 15 ? (car.blocked || 0) + dt : 0;
    if (car.blocked > 2.5) {
      car.roadDir *= -1;
      car.blocked = 0;
    }
    car.cruise = 235;
    const capped = car.speed > car.cruise ? 0 : throttle;
    driveCar(g, car, capped, steer, dt);
    car.speed = clamp(car.speed, -60, car.cruise + 40);
  }
}

// --- Pedestrians ------------------------------------------------------------

// A point on the sidewalk beside a road point: offset perpendicular to the
// road, past the carriageway, so pedestrians walk beside traffic, not in it.
function sidewalkNear(world, spot) {
  const onVertical = world.lines.includes(spot.x);
  const off = (62 + Math.random() * 28) * (Math.random() < 0.5 ? 1 : -1);
  return {
    x: spot.x + (onVertical ? off : (Math.random() - 0.5) * 120),
    y: spot.y + (onVertical ? (Math.random() - 0.5) * 120 : off),
  };
}

export function updatePeds(g, dt) {
  const p = g.player;
  for (const ped of g.peds) {
    if (ped.downTimer > 0) {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) {
        ped.state = 'flee';
        ped.fleeTimer = 3;
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      const away = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.angle = away;
      const hit = collideCircle(g.world, ped.x + Math.cos(away) * 150 * dt, ped.y + Math.sin(away) * 150 * dt, 11);
      ped.x = hit.x;
      ped.y = hit.y;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
      continue;
    }
    if (dist(ped.x, ped.y, ped.tx, ped.ty) < 18) {
      const spot = nearestRoadPoint(g.world, ped.x + (Math.random() - 0.5) * 700, ped.y + (Math.random() - 0.5) * 700);
      const target = sidewalkNear(g.world, spot);
      ped.tx = target.x;
      ped.ty = target.y;
    }
    const want = Math.atan2(ped.ty - ped.y, ped.tx - ped.x);
    ped.angle = want;
    const hit = collideCircle(g.world, ped.x + Math.cos(want) * ped.speed * dt, ped.y + Math.sin(want) * ped.speed * dt, 11);
    ped.x = hit.x;
    ped.y = hit.y;
    // Recycle peds that wandered far away.
    if (dist(ped.x, ped.y, p.x, p.y) > 1200) {
      const spot = nearestRoadPoint(g.world, p.x + (Math.random() - 0.5) * 1500, p.y + (Math.random() - 0.5) * 1500);
      const sidewalk = sidewalkNear(g.world, spot);
      ped.x = sidewalk.x;
      ped.y = sidewalk.y;
      ped.tx = sidewalk.x;
      ped.ty = sidewalk.y;
    }
  }
  // Cars hitting pedestrians.
  for (const car of g.cars) {
    if (Math.abs(car.speed) < 60) continue;
    for (const ped of g.peds) {
      if (ped.downTimer > 0) continue;
      if (dist(car.x, car.y, ped.x, ped.y) < 30) {
        ped.downTimer = 2.5;
        ped.state = 'down';
        spawnParticles(g, ped.x, ped.y, 6, '#c9c9c9', 120, 0.4, 3);
        sfx('crash');
        if (!ped.reported) {
          ped.reported = true;
          // Only the player's own car earns heat: a traffic or police car
          // hitting a pedestrian is the city's problem, not Marco's. Staged
          // screenshot scenes keep their intended wanted level either way.
          if (car === g.player.inCar && !g.shotMode) {
            pushEvent(g, { type: 'wanted', amount: 1, reason: 'hit a pedestrian' });
            pushEvent(g, { type: 'banner', text: 'You hit a pedestrian!' });
          }
        }
        if (car === g.player.inCar) g.camera.shake = Math.max(g.camera.shake, 5);
      }
    }
  }
}

// --- Enemies ------------------------------------------------------------------

export function updateEnemies(g, dt) {
  const p = g.player;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    const want = Math.atan2(p.y - e.y, p.x - e.x);
    e.strafeTimer -= dt;
    if (e.strafeTimer <= 0) {
      e.strafeTimer = 0.8 + Math.random() * 0.9;
      e.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    if (d > 240) {
      const hit = collideCircle(g.world, e.x + Math.cos(want) * 130 * dt, e.y + Math.sin(want) * 130 * dt, 12);
      e.x = hit.x;
      e.y = hit.y;
    } else if (d > 90) {
      const strafe = want + (Math.PI / 2) * e.strafeDir;
      const hit = collideCircle(g.world, e.x + Math.cos(strafe) * 70 * dt, e.y + Math.sin(strafe) * 70 * dt, 12);
      e.x = hit.x;
      e.y = hit.y;
    }
    e.angle = want;
    e.fireCooldown -= dt;
    if (e.fireCooldown <= 0 && d < 430) {
      e.fireCooldown = 0.85 + Math.random() * 0.6;
      const spread = (Math.random() - 0.5) * 0.24;
      const a = want + spread;
      g.bullets.push({
        x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20,
        vx: Math.cos(a) * 780, vy: Math.sin(a) * 780,
        life: 0.8, from: 'enemy', damage: 7,
      });
      spawnParticles(g, e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, 2, '#ffd76a', 100, 0.1, 3);
      sfx('shot');
    }
  }
  g.enemies = g.enemies.filter((e) => !e.dead || e.deathTimer > 0);
  for (const e of g.enemies) {
    if (e.dead) e.deathTimer -= dt;
  }
}

// --- Bullets ------------------------------------------------------------------

function pointInBuilding(world, x, y) {
  for (const b of world.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

export function updateBullets(g, dt) {
  const p = g.player;
  for (const b of g.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    if (pointInBuilding(g.world, b.x, b.y) || b.x < 0 || b.y < 0 || b.x > g.world.size || b.y > g.world.size) {
      b.life = 0;
      spawnParticles(g, b.x, b.y, 3, '#d8cfba', 90, 0.25, 2);
      continue;
    }
    if (b.from === 'player') {
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (dist(b.x, b.y, e.x, e.y) < 15) {
          b.life = 0;
          e.health -= b.damage;
          spawnParticles(g, b.x, b.y, 5, '#d94f4f', 130, 0.3, 3);
          if (e.health <= 0) {
            e.dead = true;
            e.deathTimer = 4;
            spawnParticles(g, e.x, e.y, 12, '#d94f4f', 170, 0.5, 3);
            pushEvent(g, { type: 'enemyDown' });
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const ped of g.peds) {
        if (ped.downTimer > 0) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 14) {
          b.life = 0;
          ped.downTimer = 3;
          ped.state = 'down';
          spawnParticles(g, b.x, b.y, 5, '#d94f4f', 130, 0.3, 3);
          if (!ped.reported) {
            ped.reported = true;
            pushEvent(g, { type: 'wanted', amount: 1, reason: 'shot a civilian' });
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const car of g.cars) {
        if (car === p.inCar || car.dead) continue;
        if (dist(b.x, b.y, car.x, car.y) < 26) {
          b.life = 0;
          damageCar(g, car, 9, 'shot');
          spawnParticles(g, b.x, b.y, 4, '#ffb347', 140, 0.25, 2);
          break;
        }
      }
    } else {
      if (p.inCar) {
        if (dist(b.x, b.y, p.inCar.x, p.inCar.y) < 26) {
          b.life = 0;
          damageCar(g, p.inCar, 5, 'shot');
          spawnParticles(g, b.x, b.y, 4, '#ffb347', 140, 0.25, 2);
        }
      } else if (dist(b.x, b.y, p.x, p.y) < 14) {
        b.life = 0;
        hurtPlayer(g, b.damage);
        spawnParticles(g, b.x, b.y, 5, '#d94f4f', 130, 0.3, 3);
      }
    }
  }
  g.bullets = g.bullets.filter((b) => b.life > 0);
}

// --- Particles, skids, pickups -----------------------------------------------

export function updateParticles(g, dt) {
  for (const pt of g.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= Math.max(0, 1 - 2.2 * dt);
    pt.vy *= Math.max(0, 1 - 2.2 * dt);
    pt.life -= dt;
  }
  g.particles = g.particles.filter((pt) => pt.life > 0);
  for (const s of g.skids) s.life -= dt;
  g.skids = g.skids.filter((s) => s.life > 0);
}

export function updatePickups(g, dt) {
  const p = g.player;
  if (p.inCar) return;
  for (const pk of g.pickups) {
    if (pk.taken) {
      if (pk.respawn > 0) {
        pk.respawn -= dt;
        if (pk.respawn <= 0) pk.taken = false;
      }
      continue;
    }
    if (dist(p.x, p.y, pk.x, pk.y) < 26) {
      pk.taken = true;
      if (pk.kind === 'cash') {
        p.money += ECONOMY.stashValue;
        pushEvent(g, { type: 'banner', text: `Hidden stash found: +$${ECONOMY.stashValue}` });
        sfx('cash');
      } else {
        p.health = Math.min(PLAYER.health, p.health + 45);
        pushEvent(g, { type: 'banner', text: 'First aid: health restored' });
        sfx('heal');
        pk.respawn = 45;
      }
    }
  }
}

export function scatterNoise(g, x, y, radius) {
  for (const ped of g.peds) {
    if (dist(ped.x, ped.y, x, y) < radius && ped.state === 'walk') {
      ped.state = 'flee';
      ped.fleeTimer = 3.5;
    }
  }
}
