// Solmarina — tuning, palette and fixed places. One file holds every number the
// other modules share, so balance and look can be tuned without touching logic.
export const STEP = 1 / 60;
export const WORLD_SIZE = 3600;
export const ROAD_EVERY = 450;
export const ROAD_WIDTH = 96;
export const ROAD_FIRST = 225;

// Sun-soaked coastal palette: warm concrete, terracotta roofs, teal water.
export const COLORS = {
  ground: '#c9b489',
  grass: '#7fae5a',
  parkGrass: '#6da34e',
  sidewalk: '#d8cfba',
  asphalt: '#4a4a52',
  asphaltEdge: '#3a3a42',
  laneDash: '#e8d98a',
  crosswalk: '#e9e6da',
  water: '#2e8fa8',
  waterDeep: '#20708a',
  sand: '#e6d3a3',
  building: ['#e8dcc4', '#dfc9a8', '#e6c9a3', '#d9b48f', '#cfe0e4', '#e9d9b8', '#d8c2b2'],
  roof: ['#b4634a', '#a8563e', '#8f7a63', '#7d8a96', '#c07a4e', '#96705a'],
  glass: '#9fc6d4',
  palmTrunk: '#7a5a3c',
  palmLeaf: '#3f8f4a',
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 195,
  runSpeed: 305,
  health: 100,
  fireInterval: 0.19,
  bulletSpeed: 920,
  bulletDamage: 26,
  regenDelay: 4,
  regenRate: 6,
};

export const CAR_MODELS = {
  sedan: { name: 'Sedano', length: 46, width: 22, maxSpeed: 520, accel: 430, brake: 760, turn: 2.6, health: 100, colors: ['#c94f4f', '#4f7ec9', '#c9c9c9', '#e0b13e', '#5a5a66'] },
  coupe: { name: 'Falco GT', length: 44, width: 21, maxSpeed: 610, accel: 520, brake: 820, turn: 2.9, health: 90, colors: ['#d94f2b', '#2b8fd9', '#e8e8e8', '#f2c230'] },
  muscle: { name: 'Barracuda', length: 48, width: 23, maxSpeed: 640, accel: 560, brake: 780, turn: 2.4, health: 110, colors: ['#8a2f2f', '#2f4f8a', '#222222', '#d98a2b'] },
  van: { name: 'Caravan', length: 52, width: 24, maxSpeed: 440, accel: 340, brake: 640, turn: 2.1, health: 140, colors: ['#e8e4da', '#7a8a99', '#b8b09a'] },
  taxi: { name: 'Cab', length: 46, width: 22, maxSpeed: 520, accel: 430, brake: 760, turn: 2.6, health: 100, colors: ['#f2c230'] },
  police: { name: 'Interceptor', length: 47, width: 22, maxSpeed: 600, accel: 540, brake: 840, turn: 2.8, health: 160, colors: ['#20242c'] },
};

export const WANTED = {
  maxStars: 5,
  // Cops on the street per star level (index = stars).
  copCount: [0, 1, 2, 3, 4, 5],
  // Seconds unseen before one star drops.
  evadeTime: [0, 5, 7, 9, 11, 13],
  sightRange: 470,
  bustRange: 30,
  bustTime: 1.1,
  resprayCost: 200,
};

export const ECONOMY = {
  startMoney: 120,
  bustedFine: 150,
  wastedBill: 100,
  stashValue: 50,
  taxiFareMin: 60,
  taxiFareMax: 120,
};

// Fixed story places, all on or beside roads so markers are reachable.
export const SPOTS = {
  playerStart: { x: 700, y: 780 },
  irisOffice: { x: 700, y: 690, label: "Iris' Office" },
  warehouse: { x: 2450, y: 1150, label: 'Sunset Warehouse' },
  hotel: { x: 1150, y: 2450, label: 'Hotel Miramar' },
  repoCar: { x: 2925, y: 700, label: 'Marked Car' },
  garage: { x: 700, y: 2900, label: 'Lucky Garage' },
  docks: { x: 3150, y: 2900, label: 'East Docks' },
  hospital: { x: 1600, y: 2050, label: 'General Hospital' },
  policeStation: { x: 2050, y: 700, label: 'Police HQ' },
  taxiStands: [
    { x: 1125, y: 675 }, { x: 2475, y: 2025 }, { x: 675, y: 2475 }, { x: 2925, y: 1575 },
  ],
};

export function roadLines() {
  const lines = [];
  for (let p = ROAD_FIRST; p < WORLD_SIZE; p += ROAD_EVERY) lines.push(p);
  return lines;
}

export function districtAt(x, y) {
  if (x > 3300) return 'Marina Bay';
  if (y > 3300) return 'South Beach';
  if (x > 2700 && y > 2250) return 'East Docks';
  if (x < 1350 && y < 1350) return 'Old Town';
  if (x >= 1350 && y < 1350) return 'Palm Court';
  if (x < 1350 && y < 2475) return 'Market District';
  if (x >= 1350 && y < 2475) return 'Downtown';
  if (x < 1800) return 'Westside';
  return 'Harbor Hills';
}
