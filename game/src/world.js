// The city of Solmarina: a seeded grid of roads and blocks, a marina bay on the
// east edge, a beach on the south edge, a park, and the story locations. The
// generator is deterministic: one seed always builds the same city.
import {
  COLORS, ROAD_EVERY, ROAD_FIRST, ROAD_WIDTH, WORLD_SIZE, SPOTS, roadLines,
} from './config.js';
import { makeRng } from './random.js';

const BLOCK_PAD = 14;

function blockRects(lines) {
  const rects = [];
  const edges = [0, ...lines.map((l) => l - ROAD_WIDTH / 2), WORLD_SIZE];
  const starts = [0, ...lines.map((l) => l + ROAD_WIDTH / 2)];
  for (let ix = 0; ix < starts.length; ix += 1) {
    for (let iy = 0; iy < starts.length; iy += 1) {
      const x0 = starts[ix];
      const y0 = starts[iy];
      const x1 = edges[ix + 1] === undefined ? WORLD_SIZE : edges[ix + 1];
      const y1 = edges[iy + 1] === undefined ? WORLD_SIZE : edges[iy + 1];
      if (x1 - x0 > 60 && y1 - y0 > 60) rects.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return rects;
}

export function generateWorld(seed) {
  const rng = makeRng(seed);
  const lines = roadLines();
  const water = { x: 3390, y: 0, w: WORLD_SIZE - 3390, h: WORLD_SIZE };
  const beach = { x: 0, y: 3420, w: 3390, h: WORLD_SIZE - 3420 };
  const park = { x: 1425, y: 1425, w: 300, h: 300 };
  const buildings = [];
  const palms = [];
  const lamps = [];

  const blocks = blockRects(lines);
  for (const block of blocks) {
    const cx = block.x + block.w / 2;
    const cy = block.y + block.h / 2;
    const inWater = block.x + block.w > water.x;
    const inBeach = block.y + block.h > beach.y;
    const inPark = cx > park.x && cx < park.x + park.w && cy > park.y && cy < park.y + park.h;
    if (inWater || inBeach) {
      // Palms along the shore instead of buildings — on dry land only, so
      // the blocks past the last road (which sit in the marina) stay empty.
      const dryRight = Math.min(block.x + block.w - 30, water.x - 24);
      if (dryRight > block.x + 30) {
        const count = rng.int(2, 4);
        for (let i = 0; i < count; i += 1) {
          palms.push({
            x: rng.range(block.x + 30, dryRight),
            y: rng.range(block.y + 30, block.y + block.h - 30),
            lean: rng.range(-0.3, 0.3),
          });
        }
      }
      continue;
    }
    if (inPark) {
      for (let i = 0; i < 9; i += 1) {
        palms.push({
          x: rng.range(block.x + 24, block.x + block.w - 24),
          y: rng.range(block.y + 24, block.y + block.h - 24),
          lean: rng.range(-0.3, 0.3),
        });
      }
      continue;
    }
    // One or two buildings per block, with a sidewalk margin.
    const split = rng.chance(0.45);
    const lots = split
      ? [
        { x: block.x + BLOCK_PAD, y: block.y + BLOCK_PAD, w: block.w / 2 - BLOCK_PAD - 8, h: block.h - BLOCK_PAD * 2 },
        { x: block.x + block.w / 2 + 8, y: block.y + BLOCK_PAD, w: block.w / 2 - BLOCK_PAD - 8, h: block.h - BLOCK_PAD * 2 },
      ]
      : [{ x: block.x + BLOCK_PAD, y: block.y + BLOCK_PAD, w: block.w - BLOCK_PAD * 2, h: block.h - BLOCK_PAD * 2 }];
    for (const lot of lots) {
      if (lot.w < 50 || lot.h < 50) continue;
      const inset = rng.range(4, 18);
      buildings.push({
        x: lot.x + inset,
        y: lot.y + inset,
        w: lot.w - inset * 2,
        h: lot.h - inset * 2,
        color: rng.pick(COLORS.building),
        roof: rng.pick(COLORS.roof),
        tall: rng.chance(0.22),
        seed: rng.int(0, 9999),
      });
    }
    // A palm or two on the block corners.
    if (rng.chance(0.6)) {
      palms.push({ x: block.x + 16, y: block.y + 16, lean: rng.range(-0.25, 0.25) });
    }
    if (rng.chance(0.4)) {
      palms.push({ x: block.x + block.w - 16, y: block.y + block.h - 16, lean: rng.range(-0.25, 0.25) });
    }
  }

  // Street lamps at every intersection corner.
  for (const lx of lines) {
    for (const ly of lines) {
      lamps.push({ x: lx + ROAD_WIDTH / 2 + 8, y: ly + ROAD_WIDTH / 2 + 8 });
    }
  }

  // Cash stashes hidden in block corners and alleys.
  const stashes = [];
  const stashSpots = blocks.filter((b) => b.x < water.x && b.y < beach.y);
  for (let i = 0; i < 12; i += 1) {
    const b = stashSpots[Math.floor(rng.next() * stashSpots.length)];
    stashes.push({
      x: rng.range(b.x + 20, b.x + b.w - 20),
      y: rng.range(b.y + 20, b.y + b.h - 20),
      taken: false,
    });
  }

  return {
    seed,
    size: WORLD_SIZE,
    lines,
    buildings,
    palms,
    lamps,
    water,
    beach,
    park,
    stashes,
    spots: SPOTS,
  };
}

export function isOnRoad(world, x, y) {
  const half = ROAD_WIDTH / 2;
  for (const l of world.lines) {
    if (Math.abs(x - l) <= half || Math.abs(y - l) <= half) return true;
  }
  return false;
}

export function isInWater(world, x, y) {
  const w = world.water;
  return x >= w.x && y >= w.y && x < w.x + w.w && y < w.y + w.h;
}

function rectHit(rect, x, y, r) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

// Slide a circle out of buildings, water and the world edge, axis by axis, so
// movement along a wall feels smooth instead of sticky.
export function collideCircle(world, x, y, r) {
  let hit = false;
  const size = world.size;
  if (x < r) { x = r; hit = true; }
  if (y < r) { y = r; hit = true; }
  if (x > size - r) { x = size - r; hit = true; }
  if (y > size - r) { y = size - r; hit = true; }
  if (isInWater(world, x, y)) {
    x = world.water.x - r;
    hit = true;
  }
  for (const b of world.buildings) {
    if (!rectHit(b, x, y, r)) continue;
    hit = true;
    const prevX = x;
    const prevY = y;
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (Math.abs(dx) > Math.abs(dy)) {
      x = dx > 0 ? b.x + b.w + r : b.x - r;
      if (rectHit(b, x, y, r)) x = prevX;
    } else {
      y = dy > 0 ? b.y + b.h + r : b.y - r;
      if (rectHit(b, x, y, r)) y = prevY;
    }
    if (rectHit(b, x, y, r)) {
      // Corner case: push out along the smaller overlap.
      const overlapX = Math.min(x + r - b.x, b.x + b.w - (x - r));
      const overlapY = Math.min(y + r - b.y, b.y + b.h - (y - r));
      if (overlapX < overlapY) x = x < b.x + b.w / 2 ? b.x - r : b.x + b.w + r;
      else y = y < b.y + b.h / 2 ? b.y - r : b.y + b.h + r;
    }
  }
  return { x, y, hit };
}

export function nearestRoadPoint(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const l of world.lines) {
    const dX = Math.abs(x - l);
    if (dX < bestD) { bestD = dX; best = { x: l, y }; }
    const dY = Math.abs(y - l);
    if (dY < bestD) { bestD = dY; best = { x, y: l }; }
  }
  return best;
}

// A point on a road at least `minDist` away from (x, y), for spawning police.
export function roadSpawnPoint(world, x, y, minDist, rng) {
  for (let tries = 0; tries < 24; tries += 1) {
    const vertical = rng.chance(0.5);
    const line = world.lines[Math.floor(rng.next() * world.lines.length)];
    const along = rng.range(100, world.size - 100);
    const px = vertical ? line : along;
    const py = vertical ? along : line;
    if (Math.hypot(px - x, py - y) >= minDist && !isInWater(world, px, py)) return { x: px, y: py };
  }
  return nearestRoadPoint(world, x + minDist, y);
}
