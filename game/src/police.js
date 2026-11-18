// The Solmarina police: wanted stars, pursuit cars, busting and evading.
// Crimes push events; this module turns them into stars and chases.
import { WANTED } from './config.js';
import { clamp, dist } from './random.js';
import { createCar, driveCar } from './entities.js';
import { roadSpawnPoint, nearestRoadPoint } from './world.js';
import { sfx, sirenSound } from './audio.js';

export function createPoliceState() {
  return { wanted: 0, unseenTimer: 0, bustProgress: 0, lastCrime: '' };
}

export function addWanted(g, amount, min, reason) {
  const pol = g.police;
  const before = pol.wanted;
  pol.wanted = clamp(Math.max(pol.wanted + amount, min || 0), 0, WANTED.maxStars);
  if (reason) pol.lastCrime = reason;
  if (pol.wanted > before) {
    pol.unseenTimer = 0;
    if (pol.wanted >= 1) {
      g.events.push({ type: 'banner', text: `Wanted level ${pol.wanted} — police alerted!` });
      sfx('busted');
    }
  }
}

export function clearWanted(g, silent) {
  g.police.wanted = 0;
  g.police.unseenTimer = 0;
  g.police.bustProgress = 0;
  g.cars = g.cars.filter((car) => car.kind !== 'police');
  sirenSound(false);
  if (!silent) g.events.push({ type: 'banner', text: 'You lost the cops.' });
}

function copCountFor(wanted) {
  return WANTED.copCount[clamp(wanted, 0, WANTED.maxStars)];
}

function steerToward(car, tx, ty, dt) {
  const want = Math.atan2(ty - car.y, tx - car.x);
  let delta = want - car.angle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return clamp(delta * 2.4, -1, 1);
}

export function updatePolice(g, dt) {
  const pol = g.police;
  const p = g.player;
  const cops = g.cars.filter((car) => car.kind === 'police' && !car.dead);

  // Spawn up to the wanted level's count, away from the player.
  if (pol.wanted > 0) {
    const want = copCountFor(pol.wanted);
    let alive = cops.length;
    let guard = 0;
    while (alive < want && guard < 6) {
      guard += 1;
      const spot = roadSpawnPoint(g.world, p.x, p.y, 520, g.rng);
      const cop = createCar('police', spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), 'police', g.rng);
      g.cars.push(cop);
      alive += 1;
    }
  }
  sirenSound(pol.wanted > 0 && cops.length > 0);

  let anyNear = false;
  for (let idx = 0; idx < cops.length; idx += 1) {
    const cop = cops[idx];
    cop.sirenPhase += dt;
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (d < WANTED.sightRange) anyNear = true;
    // Pursuit: aim slightly ahead of a moving player, ram when close. From far
    // away, head for the road nearest the player so cops stay on streets
    // instead of wedging against buildings; close in, seek directly.
    const lead = p.inCar ? 0.35 : 0.1;
    const px = p.inCar ? p.inCar.x + Math.cos(p.inCar.angle) * p.inCar.speed * lead : p.x;
    const py = p.inCar ? p.inCar.y + Math.sin(p.inCar.angle) * p.inCar.speed * lead : p.y;
    const seek = d > 320 ? nearestRoadPoint(g.world, px, py) : { x: px, y: py };
    // Spread the pack: each cop aims at a point offset sideways from the
    // line to the player, so they arrive side by side instead of stacked.
    const spread = (idx - (cops.length - 1) / 2) * 52;
    const toPlayer = Math.atan2(py - cop.y, px - cop.x);
    seek.x += -Math.sin(toPlayer) * spread;
    seek.y += Math.cos(toPlayer) * spread;
    const steer = steerToward(cop, seek.x, seek.y, dt);
    const aggression = 0.7 + pol.wanted * 0.08;
    let throttle = aggression;
    if (d < 60 && p.inCar) throttle = 1;
    if (d < 40 && !p.inCar) throttle = 0.25;
    driveCar(g, cop, throttle, steer, dt);
    // A cop ramming the player's car damages both.
    if (p.inCar && d < 36 && Math.abs(cop.speed) > 150) {
      cop.speed *= 0.5;
    }
  }

  // Busted: a cop reaches the player on foot while the player is slow.
  if (pol.wanted > 0 && !p.inCar && p.health > 0) {
    const close = cops.some((cop) => dist(cop.x, cop.y, p.x, p.y) < WANTED.bustRange && Math.abs(cop.speed) < 120);
    const playerSlow = true;
    if (close && playerSlow) {
      pol.bustProgress += dt / WANTED.bustTime;
      if (pol.bustProgress >= 1) {
        pol.bustProgress = 0;
        g.events.push({ type: 'busted' });
      }
    } else {
      pol.bustProgress = Math.max(0, pol.bustProgress - dt * 1.5);
    }
  } else {
    pol.bustProgress = Math.max(0, pol.bustProgress - dt * 1.5);
  }

  // Evade: unseen for long enough and one star drops. Staged screenshot
  // scenes hold their wanted level so the photo shows the intended heat.
  if (pol.wanted > 0 && !g.shotMode) {
    if (!anyNear) {
      pol.unseenTimer += dt;
      if (pol.unseenTimer >= WANTED.evadeTime[pol.wanted]) {
        pol.wanted -= 1;
        pol.unseenTimer = 0;
        if (pol.wanted === 0) {
          clearWanted(g, true);
          g.events.push({ type: 'banner', text: 'You lost the cops.' });
        } else {
          g.events.push({ type: 'banner', text: `Heat cooling down: ${pol.wanted} star${pol.wanted === 1 ? '' : 's'}` });
        }
      }
    } else {
      pol.unseenTimer = 0;
    }
  }
}

// The respray garage: drive in with heat and cash, drive out clean.
export function tryRespray(g) {
  const pol = g.police;
  const p = g.player;
  if (!p.inCar || pol.wanted === 0) return false;
  const garage = g.world.spots.garage;
  if (dist(p.x, p.y, garage.x, garage.y) > 70) return false;
  if (p.money < WANTED.resprayCost) {
    g.events.push({ type: 'banner', text: `Respray costs $${WANTED.resprayCost} — not enough cash` });
    return false;
  }
  p.money -= WANTED.resprayCost;
  clearWanted(g, true);
  p.inCar.color = '#3a3f4a';
  g.events.push({ type: 'banner', text: `Resprayed for $${WANTED.resprayCost} — wanted level cleared` });
  sfx('cash');
  return true;
}
