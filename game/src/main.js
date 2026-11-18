// Solmarina: boot, game loop and wiring. A fixed-step simulation (60 Hz) keeps
// the game fair at any frame rate; the renderer draws every animation frame.
import { STEP, ECONOMY, PLAYER, SPOTS, CAR_MODELS, WANTED } from './config.js';
import { makeRng, dist } from './random.js';
import { generateWorld, nearestRoadPoint } from './world.js';
import { createInput } from './input.js';
import {
  createPlayer, createCar, createPed, updatePlayerOnFoot, playerShoot,
  nearestCar, enterCar, exitCar, driveCar, collideCars, updateTraffic,
  updatePeds, updateEnemies, updateBullets, updateParticles, updatePickups,
  scatterNoise, spawnParticles,
} from './entities.js';
import {
  createPoliceState, addWanted, clearWanted, updatePolice, tryRespray,
} from './police.js';
import {
  MISSIONS, createMissionState, updateMissions, failMission,
  createTaxiState, updateTaxi,
} from './missions.js';
import { loadSave, storeSave, clearSave, snapshotSave } from './save.js';
import {
  unlockAudio, setMuted, isMuted, sfx, engineSound, stopEngineSound,
  stopSirenSound, startMusic, stopMusic,
} from './audio.js';
import { createRenderer, mouseWorld } from './render.js';
import { stageShot, shotAutopilot } from './shots.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seedParam = params.get('seed');
const SEED = seedParam === null ? 7 : Number(seedParam) || 7;

function createGame(seed) {
  const world = generateWorld(seed);
  const rng = makeRng(`play-${seed}`);
  const player = createPlayer(SPOTS.playerStart.x, SPOTS.playerStart.y);
  const cars = [];
  const peds = [];

  // Parked cars along road edges.
  const parkedModels = ['sedan', 'coupe', 'van', 'sedan', 'muscle', 'sedan', 'coupe', 'van'];
  for (let i = 0; i < 10; i += 1) {
    const line = world.lines[Math.floor(rng.next() * world.lines.length)];
    const along = rng.range(200, world.size - 200);
    const vertical = rng.chance(0.5);
    const edge = rng.chance(0.5) ? 34 : -34;
    const x = vertical ? line + edge : along;
    const y = vertical ? along : line + edge;
    const angle = vertical ? (edge > 0 ? Math.PI / 2 : -Math.PI / 2) : (edge > 0 ? 0 : Math.PI);
    const car = createCar(parkedModels[i % parkedModels.length], x, y, angle, 'parked', rng);
    cars.push(car);
  }
  // Traffic near the start.
  const trafficModels = ['sedan', 'sedan', 'coupe', 'van', 'taxi', 'sedan'];
  for (let i = 0; i < 14; i += 1) {
    const spot = nearestRoadPoint(world, player.x + (rng.next() - 0.5) * 1800, player.y + (rng.next() - 0.5) * 1800);
    const vertical = Math.abs(spot.x - player.x) > Math.abs(spot.y - player.y);
    const car = createCar(trafficModels[i % trafficModels.length], spot.x, spot.y, 0, 'traffic', rng);
    car.roadAxis = vertical ? 'y' : 'x';
    car.roadLine = vertical ? spot.x : spot.y;
    car.roadDir = rng.chance(0.5) ? 1 : -1;
    car.angle = car.roadAxis === 'x' ? (car.roadDir > 0 ? 0 : Math.PI) : (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.speed = 200;
    cars.push(car);
  }
  for (let i = 0; i < 26; i += 1) {
    const spot = nearestRoadPoint(world, player.x + (rng.next() - 0.5) * 1600, player.y + (rng.next() - 0.5) * 1600);
    peds.push(createPed(spot.x + (rng.next() - 0.5) * 80, spot.y + (rng.next() - 0.5) * 80, rng));
  }

  const pickups = world.stashes.map((s) => ({ x: s.x, y: s.y, kind: 'cash', taken: false, respawn: 0 }));
  pickups.push({ x: SPOTS.hospital.x + 40, y: SPOTS.hospital.y, kind: 'health', taken: false, respawn: 0 });
  pickups.push({ x: SPOTS.garage.x - 60, y: SPOTS.garage.y, kind: 'health', taken: false, respawn: 0 });
  pickups.push({ x: 2475, y: 675, kind: 'health', taken: false, respawn: 0 });

  return {
    world, rng, seed, time: 0,
    player, cars, peds, enemies: [], bullets: [], particles: [], skids: [], pickups,
    events: [], banners: [],
    camera: { x: player.x, y: player.y, zoom: 1, shake: 0 },
    police: createPoliceState(),
    missions: createMissionState(),
    missionDefs: MISSIONS,
    taxi: createTaxiState(),
    mode: 'title', saveData: loadSave(), showHelp: false,
    hintTimer: 0, prompt: '', endCost: 0,
    nearJobStart: false, consumedE: false,
    shotMode: null, shotWaypoint: null, resprayCooldown: 0,
    input: null,
  };
}

const input = createInput(canvas);
const renderer = createRenderer(canvas);
let g = createGame(SEED);
g.input = input;
window.__solmarina = g;

function applySave(data) {
  if (!data) return;
  if (typeof data.money === 'number') g.player.money = data.money;
  if (Array.isArray(data.missionsDone)) {
    g.missions.done = data.missionsDone.filter((id) => MISSIONS.some((m) => m.id === id));
  }
}

function beginPlay(fromSave) {
  if (fromSave) applySave(g.saveData);
  g.mode = 'play';
  g.hintTimer = 14;
  g.showHelp = false;
  unlockAudio();
  startMusic();
  sfx('click');
}

function drainEvents() {
  const events = g.events;
  g.events = [];
  for (const e of events) {
    if (e.type === 'wanted') {
      addWanted(g, e.amount || 0, e.min || 0, e.reason);
    } else if (e.type === 'noise') {
      scatterNoise(g, e.x, e.y, e.radius);
    } else if (e.type === 'banner') {
      const existing = g.banners.find((b) => b.text === e.text);
      if (existing) existing.life = 3.6;
      else {
        g.banners.push({ text: e.text, life: 3.6 });
        if (g.banners.length > 4) g.banners.shift();
      }
    } else if (e.type === 'enemyDown') {
      g.missions.kills += 1;
    } else if (e.type === 'targetDestroyed') {
      failMission(g, 'the car was destroyed');
    } else if (e.type === 'missionDone') {
      spawnParticles(g, g.player.x, g.player.y, 24, '#ffd76a', 200, 0.8, 4);
    } else if (e.type === 'wasted' || e.type === 'busted') {
      if (g.shotMode) {
        g.player.health = Math.max(g.player.health, 25);
        continue;
      }
      const wasted = e.type === 'wasted';
      g.endCost = wasted ? ECONOMY.wastedBill : ECONOMY.bustedFine;
      g.mode = wasted ? 'wasted' : 'busted';
      failMission(g, wasted ? 'Marco was wasted' : 'Marco was busted');
      clearWanted(g, true);
      stopEngineSound();
      stopSirenSound();
      sfx('busted');
    }
  }
}

function respawn() {
  const p = g.player;
  const wasted = g.mode === 'wasted';
  if (p.inCar) {
    p.inCar.kind = 'parked';
    p.inCar = null;
  }
  const spot = wasted ? SPOTS.hospital : SPOTS.policeStation;
  p.x = spot.x;
  p.y = spot.y;
  p.health = PLAYER.health;
  p.money = Math.max(0, p.money - g.endCost);
  g.enemies = [];
  g.bullets = [];
  g.camera.x = p.x;
  g.camera.y = p.y;
  g.mode = 'play';
  g.hintTimer = 4;
  storeSave(snapshotSave(g));
  sfx('click');
}

function updateTitle(dt) {
  g.time += dt;
  updateTraffic(g, dt);
  updatePeds(g, dt);
  updateParticles(g, dt);
  collideCars(g);
  // Slow cinematic pan around downtown.
  const a = g.time * 0.06;
  g.camera.x += ((1800 + Math.cos(a) * 520) - g.camera.x) * Math.min(1, dt * 0.6);
  g.camera.y += ((1800 + Math.sin(a) * 520) - g.camera.y) * Math.min(1, dt * 0.6);
  g.camera.zoom += (0.9 - g.camera.zoom) * Math.min(1, dt);
  if (input.wasPressed('KeyH')) {
    g.showHelp = !g.showHelp;
    input.pressed.delete('KeyH');
  }
  if (input.wasPressed('Enter')) {
    input.pressed.delete('Enter');
    beginPlay(!!g.saveData);
  } else if (input.wasPressed('KeyN') && g.saveData) {
    input.pressed.delete('KeyN');
    clearSave();
    const fresh = createGame(SEED);
    fresh.input = input;
    fresh.saveData = null;
    g = fresh;
    window.__solmarina = g;
    beginPlay(false);
  }
}

function updatePlay(dt) {
  g.time += dt;
  const p = g.player;
  const auto = g.shotMode ? shotAutopilot(g) : null;

  // E: job start (missions), car enter/exit, respray is automatic below.
  const ePressed = input.wasPressed('KeyE');
  updateMissions(g, dt);
  if (ePressed && !g.consumedE && !auto) {
    if (p.inCar) exitCar(g);
    else {
      const car = nearestCar(g, p.x, p.y, 52);
      if (car) enterCar(g, car);
    }
  }
  g.consumedE = false;
  if (ePressed) input.pressed.delete('KeyE');

  // Movement and driving.
  if (p.inCar) {
    const car = p.inCar;
    let throttle;
    let steer;
    if (auto) {
      throttle = auto.throttle;
      steer = auto.steer;
    } else {
      throttle = input.axis('KeyS', 'KeyW') + input.axis('ArrowDown', 'ArrowUp');
      steer = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
      throttle = Math.max(-1, Math.min(1, throttle));
      steer = Math.max(-1, Math.min(1, steer));
    }
    driveCar(g, car, throttle, steer, dt);
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    engineSound(Math.abs(car.speed) / CAR_MODELS[car.model].maxSpeed, true);
  } else {
    engineSound(0, false);
    const view = renderer.viewSize();
    const mw = mouseWorld(g, view.w, view.h);
    let moveX = 0;
    let moveY = 0;
    let running = false;
    let firing = false;
    let aimX = mw.x;
    let aimY = mw.y;
    if (auto) {
      moveX = auto.moveX;
      moveY = auto.moveY;
      running = auto.running;
      firing = auto.firing;
      aimX = auto.aimX;
      aimY = auto.aimY;
    } else {
      moveX = input.axis('KeyA', 'KeyD') + input.axis('ArrowLeft', 'ArrowRight');
      moveY = input.axis('KeyW', 'KeyS') + input.axis('ArrowUp', 'ArrowDown');
      running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      firing = input.mouse.down;
    }
    const aiming = firing || (auto !== null);
    updatePlayerOnFoot(g, dt, moveX, moveY, running, aiming ? Math.atan2(aimY - p.y, aimX - p.x) : null);
    if (firing) playerShoot(g, aimX, aimY);
  }

  updateTraffic(g, dt);
  updatePeds(g, dt);
  updateEnemies(g, dt);
  updatePolice(g, dt);
  updateTaxi(g, dt);
  updateBullets(g, dt);
  updateParticles(g, dt);
  updatePickups(g, dt);
  collideCars(g);

  // Respray: drive into Lucky Garage with heat and cash.
  g.resprayCooldown = Math.max(0, g.resprayCooldown - dt);
  if (p.inCar && g.police.wanted > 0 && g.resprayCooldown === 0) {
    if (dist(p.x, p.y, SPOTS.garage.x, SPOTS.garage.y) < 70) {
      if (tryRespray(g)) g.resprayCooldown = 6;
      else g.resprayCooldown = 2;
    }
  }

  // Context prompt.
  g.prompt = '';
  if (!p.inCar) {
    if (g.nearJobStart) g.prompt = 'E — Talk to Iris about work';
    else {
      const car = nearestCar(g, p.x, p.y, 52);
      if (car) g.prompt = `E — Steal the ${car.name}`;
    }
  } else if (g.police.wanted > 0 && dist(p.x, p.y, SPOTS.garage.x, SPOTS.garage.y) < 220) {
    g.prompt = `Drive into Lucky Garage — respray $${WANTED.resprayCost} clears your wanted level`;
  }

  // Shot mode never lets the star die mid-capture.
  if (g.shotMode && p.health < 25) p.health = 25;

  drainEvents();

  // Camera follows the player, easing out a little at speed.
  const targetZoom = p.inCar ? 0.93 : 1;
  g.camera.zoom += (targetZoom - g.camera.zoom) * Math.min(1, dt * 2);
  g.camera.x += (p.x - g.camera.x) * Math.min(1, dt * 5);
  g.camera.y += (p.y - g.camera.y) * Math.min(1, dt * 5);
  g.camera.x = Math.max(0, Math.min(g.world.size, g.camera.x));
  g.camera.y = Math.max(0, Math.min(g.world.size, g.camera.y));
  g.camera.shake = Math.max(0, g.camera.shake - 26 * dt);

  for (const b of g.banners) b.life -= dt;
  g.banners = g.banners.filter((b) => b.life > 0);
  g.hintTimer = Math.max(0, g.hintTimer - dt);
}

function updatePause() {
  if (input.wasPressed('KeyH')) {
    g.showHelp = !g.showHelp;
    input.pressed.delete('KeyH');
  }
  if (input.wasPressed('KeyR')) {
    input.pressed.delete('KeyR');
    stopEngineSound();
    stopSirenSound();
    stopMusic();
    const fresh = createGame(SEED);
    fresh.input = input;
    g = fresh;
    window.__solmarina = g;
  }
}

function updateEnd() {
  g.time += 0;
  if (input.wasPressed('Enter')) {
    input.pressed.delete('Enter');
    respawn();
  }
}

function step(dt) {
  if (g.mode === 'title') updateTitle(dt);
  else if (g.mode === 'play') updatePlay(dt);
  else if (g.mode === 'pause') updatePause();
  else updateEnd();
}

// Mode-switch keys are read once per animation frame, outside the fixed steps.
function frameKeys() {
  if (input.wasPressed('KeyM')) {
    input.pressed.delete('KeyM');
    const nowMuted = setMuted(!isMuted());
    if (!nowMuted) {
      unlockAudio();
      if (g.mode === 'play') startMusic();
    }
  }
  if (g.mode === 'play' && (input.wasPressed('KeyP') || input.wasPressed('Escape'))) {
    input.pressed.delete('KeyP');
    input.pressed.delete('Escape');
    g.mode = 'pause';
    stopEngineSound();
    stopSirenSound();
    sfx('click');
  } else if (g.mode === 'pause' && (input.wasPressed('KeyP') || input.wasPressed('Escape'))) {
    input.pressed.delete('KeyP');
    input.pressed.delete('Escape');
    g.mode = 'play';
    sfx('click');
  }
  if (input.hadGesture()) unlockAudio();
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frameKeys();
  acc += frameDt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    step(STEP);
    acc -= STEP;
    steps += 1;
  }
  if (steps === 5) acc = 0;
  renderer.render(g);
  // Clear just-pressed input only on frames that actually simulated: on a
  // high-refresh display most frames run zero steps, and clearing every
  // frame would eat key presses before the game ever sees them.
  if (steps > 0) input.endFrame();
}

if (shotName) {
  stageShot(shotName, g);
  // Pre-roll the staged scene so the captured frame is mid-action. The chase
  // gets a short pre-roll: cruisers box the car in within a few seconds, so
  // the photo is taken while the pursuit is still a pursuit.
  const preRoll = shotName === 'chase' ? 60 : 150;
  for (let i = 0; i < preRoll; i += 1) step(STEP);
  g.camera.shake = 0;
}

requestAnimationFrame(frame);
