import test from "node:test";
import assert from "node:assert/strict";
import { isInTrackingRegion, parseAisPosition } from "../index.js";

test("limits vessel positions to the configured West African corridor", () => {
  assert.equal(isInTrackingRegion(14.7, -17.5), true);
  assert.equal(isInTrackingRegion(-4.8, 11.9), true);
  assert.equal(isInTrackingRegion(40, -17.5), false);
  assert.equal(isInTrackingRegion(-4.8, 30), false);
});

test("parses a valid AIS position without accepting malformed or out-of-region data", () => {
  const message = {
    MessageType: "ShipPosition",
    MetaData: { MMSI: 227123456, ShipName: "  BESS TEST  " },
    Content: {
      Position: { Latitude: 14.7, Longitude: -17.5 },
      SOG: 10,
      COG: 225,
      Destination: "Pointe-Noire",
    },
  };
  const parsed = parseAisPosition(JSON.stringify(message), "2026-01-01T00:00:00.000Z");
  assert.deepEqual(parsed.ship, {
    mmsi: "227123456",
    name: "BESS TEST",
    latitude: 14.7,
    longitude: -17.5,
    speedKnots: 10,
    course: 225,
    shipType: null,
    destination: "Pointe-Noire",
    receivedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(parseAisPosition("{malformed"), null);
  assert.equal(parseAisPosition(JSON.stringify({
    MessageType: "ShipPosition",
    MetaData: { MMSI: "123456789" },
    Content: { Position: { Latitude: 0, Longitude: 0 } },
  })), null);
});
