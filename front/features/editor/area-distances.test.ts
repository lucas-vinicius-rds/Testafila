import assert from "node:assert/strict";
import test from "node:test";
import { calculateAreaDistances, isAxisAlignedRectangle } from "./area-distances.ts";

const room = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 8 }, { x: 0, z: 8 }];
const area = [{ x: 2, z: 1 }, { x: 4, z: 1 }, { x: 4, z: 3 }, { x: 2, z: 3 }];

test("mede as quatro paredes em planta retangular", () => {
  assert.deepEqual(calculateAreaDistances(area, room), { north: 5, south: 1, east: 6, west: 2 });
});

test("aceita canto intermediário sobre a mesma parede", () => {
  assert.equal(isAxisAlignedRectangle([{ x: 0, z: 0 }, { x: 5, z: 0 }, ...room.slice(1)]), true);
});

test("planta em L ortogonal fica indisponível", () => {
  const lShape = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 4 }, { x: 5, z: 4 }, { x: 5, z: 8 }, { x: 0, z: 8 }];
  assert.equal(calculateAreaDistances(area, lShape), null);
});

test("quadrilátero inclinado fica indisponível", () => {
  assert.equal(calculateAreaDistances(area, [{ x: 0, z: 0 }, { x: 10, z: 1 }, { x: 10, z: 8 }, { x: 0, z: 8 }]), null);
});
