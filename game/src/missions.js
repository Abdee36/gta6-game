// Story missions and side work for Solmarina. Missions are small state
// machines: each step names a goal, and the update loop advances it when the
// player does the job. Rewards pay in cash and are saved on completion.
import { ECONOMY } from './config.js';
import { dist } from './random.js';
import { createCar, createEnemy, spawnParticles } from './entities.js';
import { addWanted } from './police.js';
import { sfx } from './audio.js';
import { storeSave, snapshotSave } from './save.js';

export const MISSIONS = [
  {
    id: 'delivery',
    title: 'Hot Delivery',
    giver: 'Iris Kade',
    briefing: 'A package is waiting at Sunset Warehouse. Collect it and run it to Hotel Miramar — the client does not like to wait.',
    reward: 300,
    steps: [
      { type: 'goto', spot: 'warehouse', text: 'Pick up the package at Sunset Warehouse' },
      { type: 'carry', spot: 'hotel', text: 'Deliver the package to Hotel Miramar', timeLimit: 75 },
    ],
  },
  {
    id: 'repo',
    title: 'Repo Man',
    giver: 'Iris Kade',
    briefing: 'A Falco GT with unpaid debts is parked near Palm Court. Take it — quietly if you can — and bring it to Lucky Garage.',
    reward: 500,
    steps: [
      { type: 'goto', spot: 'repoCar', text: 'Find the marked Falco GT near Palm Court' },
      { type: 'steal', spot: 'repoCar', text: 'Steal the Falco GT' },
      { type: 'bringCar', spot: 'garage', text: 'Deliver the Falco GT to Lucky Garage' },
    ],
  },
  {
    id: 'docks',
    title: 'Dockside Deal',
    giver: 'Iris Kade',
    briefing: 'The Harbor Boys moved in on our dock deal. Clear them out, grab the briefcase, and bring it home. Expect heat.',
    reward: 900,
    steps: [
      { type: 'goto', spot: 'docks', text: 'Reach the East Docks' },
      { type: 'fight', spot: 'docks', text: 'Clear out the Harbor Boys', enemies: 4 },
      { type: 'carry', spot: 'irisOffice', text: 'Bring the briefcase back to Iris', wanted: 3 },
    ],
  },
];

export function createMissionState() {
  return { active: -1, step: 0, done: [], timer: 0, cargo: false, kills: 0, killsNeeded: 0, targetCar: null, briefTimer: 0 };
}

export function missionAvailable(g) {
  for (let i = 0; i < MISSIONS.length; i += 1) {
    if (!g.missions.done.includes(MISSIONS[i].id)) return i;
  }
  return -1;
}

function spotOf(g, name) {
  return g.world.spots[name];
}

export function startMission(g, index) {
  const def = MISSIONS[index];
  const m = g.missions;
  m.active = index;
  m.step = 0;
  m.timer = 0;
  m.cargo = false;
  m.kills = 0;
  m.killsNeeded = 0;
  m.targetCar = null;
  m.briefTimer = 6;
  g.events.push({ type: 'banner', text: `New job: ${def.title}` });
  sfx('mission');
  // Mission 2 needs its marked car parked and waiting.
  if (def.id === 'repo') {
    const spot = spotOf(g, 'repoCar');
    const car = createCar('coupe', spot.x, spot.y, Math.PI / 2, 'parked', g.rng);
    car.color = '#d94f2b';
    car.targetCar = true;
    g.cars.push(car);
    m.targetCar = car;
  }
}

export function currentObjective(g) {
  const m = g.missions;
  if (m.active < 0) return null;
  const def = MISSIONS[m.active];
  const step = def.steps[m.step];
  if (!step) return null;
  const spot = spotOf(g, step.spot);
  return { text: step.text, x: spot.x, y: spot.y, title: def.title, timer: m.timer, timeLimit: step.timeLimit || 0 };
}

function completeMission(g) {
  const m = g.missions;
  const def = MISSIONS[m.active];
  g.player.money += def.reward;
  m.done.push(def.id);
  m.active = -1;
  m.step = 0;
  m.cargo = false;
  g.events.push({ type: 'banner', text: `Job complete: ${def.title} — +$${def.reward}` });
  g.events.push({ type: 'missionDone', title: def.title, reward: def.reward });
  sfx('cash');
  storeSave(snapshotSave(g));
  if (m.done.length >= MISSIONS.length) {
    g.events.push({ type: 'banner', text: 'All of Iris\'s jobs are done — Solmarina is yours. Free roam!' });
  }
}

export function failMission(g, reason) {
  const m = g.missions;
  if (m.active < 0) return;
  const def = MISSIONS[m.active];
  m.active = -1;
  m.step = 0;
  m.cargo = false;
  g.enemies = [];
  g.events.push({ type: 'banner', text: `Job failed: ${def.title} — ${reason}` });
  sfx('fail');
}

function advanceStep(g) {
  const m = g.missions;
  const def = MISSIONS[m.active];
  m.step += 1;
  m.timer = 0;
  if (m.step >= def.steps.length) {
    completeMission(g);
    return;
  }
  const step = def.steps[m.step];
  if (step.type === 'fight') {
    const spot = spotOf(g, step.spot);
    m.kills = 0;
    m.killsNeeded = step.enemies || 3;
    for (let i = 0; i < m.killsNeeded; i += 1) {
      const angle = (i / m.killsNeeded) * Math.PI * 2;
      g.enemies.push(createEnemy(
        spot.x + Math.cos(angle) * 130,
        spot.y + Math.sin(angle) * 130,
      ));
    }
    g.events.push({ type: 'banner', text: 'Harbor Boys! Take cover and return fire.' });
  }
  if (step.type === 'carry' && step.wanted) {
    addWanted(g, step.wanted, step.wanted, 'dockside deal');
  }
  sfx('pickup');
}

export function updateMissions(g, dt) {
  const m = g.missions;
  const p = g.player;
  m.briefTimer = Math.max(0, m.briefTimer - dt);

  // Starting a job: stand at Iris' office and press E.
  if (m.active < 0) {
    const next = missionAvailable(g);
    if (next >= 0) {
      const office = spotOf(g, 'irisOffice');
      if (!p.inCar && dist(p.x, p.y, office.x, office.y) < 60) {
        g.nearJobStart = true;
        if (g.input.wasPressed('KeyE')) {
          startMission(g, next);
          g.consumedE = true;
        }
      } else {
        g.nearJobStart = false;
      }
    }
    return;
  }
  g.nearJobStart = false;

  const def = MISSIONS[m.active];
  const step = def.steps[m.step];
  if (!step) return;
  const spot = spotOf(g, step.spot);
  const d = dist(p.x, p.y, spot.x, spot.y);

  if (step.timeLimit) {
    m.timer += dt;
    if (m.timer > step.timeLimit) {
      failMission(g, 'too slow');
      return;
    }
  }

  switch (step.type) {
    case 'goto':
      if (d < 55) advanceStep(g);
      break;
    case 'carry':
      if (m.step === 0 || !m.cargo) {
        // First carry step of a mission picks the cargo up.
        if (d < 55 && !m.cargo) {
          m.cargo = true;
          advanceStep(g);
        }
      } else if (d < 55) {
        advanceStep(g);
      }
      break;
    case 'steal':
      if (p.inCar && p.inCar.targetCar) {
        addWanted(g, 2, 2, 'stolen Falco GT');
        advanceStep(g);
      }
      break;
    case 'bringCar':
      if (p.inCar && p.inCar.targetCar && d < 70) {
        spawnParticles(g, spot.x, spot.y, 16, '#ffd76a', 160, 0.6, 4);
        advanceStep(g);
      }
      break;
    case 'fight':
      if (m.kills >= m.killsNeeded) {
        m.cargo = true;
        g.events.push({ type: 'banner', text: 'Briefcase secured. Run!' });
        advanceStep(g);
      }
      break;
    default:
      break;
  }
}

// --- Taxi side work ---------------------------------------------------------

export function createTaxiState() {
  return { active: false, stage: 'idle', px: 0, py: 0, dx: 0, dy: 0, fare: 0, timer: 0, waitTimer: 8 };
}

export function updateTaxi(g, dt) {
  const t = g.taxi;
  const p = g.player;
  if (!t.active) {
    t.waitTimer -= dt;
    if (t.waitTimer <= 0 && p.inCar && g.missions.active < 0) {
      const stands = g.world.spots.taxiStands;
      const from = stands[Math.floor(Math.random() * stands.length)];
      let to = stands[Math.floor(Math.random() * stands.length)];
      if (to === from) to = stands[(stands.indexOf(from) + 1) % stands.length];
      t.active = true;
      t.stage = 'pickup';
      t.px = from.x;
      t.py = from.y;
      t.dx = to.x;
      t.dy = to.y;
      t.fare = ECONOMY.taxiFareMin + Math.floor(Math.random() * (ECONOMY.taxiFareMax - ECONOMY.taxiFareMin));
      t.timer = 0;
      g.events.push({ type: 'banner', text: `Taxi fare: pick up a rider ($${t.fare})` });
    }
    return;
  }
  t.timer += dt;
  if (t.stage === 'pickup') {
    if (p.inCar && dist(p.x, p.y, t.px, t.py) < 60) {
      t.stage = 'dropoff';
      t.timer = 0;
      g.events.push({ type: 'banner', text: 'Rider aboard — drive to the destination' });
      sfx('pickup');
    } else if (t.timer > 60) {
      t.active = false;
      t.waitTimer = 20;
      g.events.push({ type: 'banner', text: 'The rider gave up waiting.' });
    }
  } else if (t.stage === 'dropoff') {
    if (p.inCar && dist(p.x, p.y, t.dx, t.dy) < 60) {
      const tip = t.timer < 45 ? 25 : 0;
      p.money += t.fare + tip;
      g.events.push({ type: 'banner', text: `Fare paid: $${t.fare}${tip ? ` + $${tip} tip` : ''}` });
      sfx('cash');
      t.active = false;
      t.waitTimer = 25;
    } else if (!p.inCar || t.timer > 120) {
      t.active = false;
      t.waitTimer = 25;
      g.events.push({ type: 'banner', text: 'Taxi fare cancelled.' });
    }
  }
}

export function taxiMarker(g) {
  const t = g.taxi;
  if (!t.active) return null;
  if (t.stage === 'pickup') return { x: t.px, y: t.py, label: 'Rider' };
  return { x: t.dx, y: t.dy, label: 'Drop-off' };
}
