import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket, WebSocketServer } from "ws";
import { createAisSubscription, createRelayServer, isInTrackingRegion, parseAisPosition, parseAisStaticData, mergeStaticData, normalizeMmsi, describeShipType } from "../index.js";

async function waitForEvent(emitter, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      emitter.removeListener(eventName, onEvent);
      emitter.removeListener("error", onError);
    };
    const onEvent = (...args) => {
      cleanup();
      resolve(args.length === 1 ? args[0] : args);
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    emitter.once(eventName, onEvent);
    emitter.once("error", onError);
  });
}

test("subscribes to the exact AISStream bounding box with the documented schema", () => {
  assert.deepEqual(createAisSubscription("server-only-test-key"), {
    APIKey: "server-only-test-key",
    BoundingBoxes: [[[15.5, -19.5], [-6.5, 12.5]]],
    FiltersShipMMSI: [],
    FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport", "ShipStaticData", "StaticDataReport"],
  });
});

test("limits vessel positions to the configured West African bounding box", () => {
  assert.equal(isInTrackingRegion(15.5, -19.5), true);
  assert.equal(isInTrackingRegion(-6.5, 12.5), true);
  assert.equal(isInTrackingRegion(14.7, -17.5), true);
  assert.equal(isInTrackingRegion(-4.8, 11.9), true);
  assert.equal(isInTrackingRegion(15.51, 0), false);
  assert.equal(isInTrackingRegion(-6.51, 0), false);
  assert.equal(isInTrackingRegion(0, -19.51), false);
  assert.equal(isInTrackingRegion(0, 12.51), false);
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
    callSign: null,
    imo: null,
    draught: null,
    lengthM: null,
    beamM: null,
    eta: null,
    receivedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(parseAisPosition("{malformed"), null);
  assert.equal(parseAisPosition(JSON.stringify({
    MessageType: "ShipPosition",
    MetaData: { MMSI: "123456789" },
    Content: { Position: { Latitude: 0, Longitude: 0 } },
  })), null);
});

test("parses AISStream PositionReport messages into real coordinates", () => {
  const message = {
    MessageType: "PositionReport",
    MetaData: { MMSI: 227123456, ShipName: "  ATLANTIC TEST  " },
    Message: {
      PositionReport: {
        UserID: 227123456,
        Latitude: -4.7692,
        Longitude: 11.8636,
        Sog: 12.4,
        Cog: 187.5,
      },
    },
  };
  const parsed = parseAisPosition(JSON.stringify(message), "2026-10-21T20:00:00.000Z");
  assert.deepEqual(parsed.ship, {
    mmsi: "227123456",
    name: "ATLANTIC TEST",
    latitude: -4.7692,
    longitude: 11.8636,
    speedKnots: 12.4,
    course: 187.5,
    shipType: null,
    destination: null,
    callSign: null,
    imo: null,
    draught: null,
    lengthM: null,
    beamM: null,
    eta: null,
    receivedAt: "2026-10-21T20:00:00.000Z",
  });
});

test("relays AISStream PositionReport coordinates to authenticated clients", async () => {
  const upstreamServer = new WebSocketServer({ port: 0, host: "127.0.0.1" });
  await waitForEvent(upstreamServer, "listening");
  const upstreamAddress = upstreamServer.address();
  assert(upstreamAddress && typeof upstreamAddress !== "string");

  let upstreamSubscription;
  upstreamServer.on("connection", (upstreamClient) => {
    upstreamClient.on("message", (raw) => {
      upstreamSubscription = JSON.parse(raw.toString());
      upstreamClient.send(JSON.stringify({
        MessageType: "PositionReport",
        MetaData: { MMSI: 227123456, ShipName: "ONNE STAR" },
        Message: {
          PositionReport: {
            UserID: 227123456,
            Latitude: 4.72,
            Longitude: 7.15,
            Sog: 9.4,
            Cog: 218,
          },
        },
      }));
    });
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    if (String(input).startsWith("https://supabase.example.test/")) {
      return Response.json({ id: "authenticated-test-user" });
    }
    return originalFetch(input, init);
  };
  const relay = createRelayServer({
    AISSTREAM_API_KEY: "server-only-test-key",
    AISSTREAM_URL: `ws://127.0.0.1:${upstreamAddress.port}`,
    FRONTEND_ORIGINS: "https://app.example.test",
    SUPABASE_URL: "https://supabase.example.test",
    SUPABASE_ANON_KEY: "test-anon-key",
  });
  const downstreamClients = new Set();

  try {
    relay.server.listen(0, "127.0.0.1");
    await waitForEvent(relay.server, "listening");
    const relayAddress = relay.server.address();
    assert(relayAddress && typeof relayAddress !== "string");
    const baseUrl = `http://127.0.0.1:${relayAddress.port}`;
    const ticketResponse = await fetch(`${baseUrl}/session`, {
      method: "POST",
      headers: {
        origin: "https://app.example.test",
        authorization: "Bearer valid-test-token",
      },
    });
    assert.equal(ticketResponse.status, 201);
    const { ticket } = await ticketResponse.json();
    const client = new WebSocket(`ws://127.0.0.1:${relayAddress.port}/ws?ticket=${ticket}`, {
      origin: "https://app.example.test",
    });
    downstreamClients.add(client);
    await waitForEvent(client, "open");

    const position = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for AIS position")), 3000);
      client.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "position") {
          clearTimeout(timer);
          resolve(message);
        }
      });
    });

    assert.deepEqual(upstreamSubscription, {
      APIKey: "server-only-test-key",
      BoundingBoxes: [[[15.5, -19.5], [-6.5, 12.5]]],
      FiltersShipMMSI: [],
      FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport", "ShipStaticData", "StaticDataReport"],
    });
    assert.deepEqual(position.ship, {
      mmsi: "227123456",
      name: "ONNE STAR",
      latitude: 4.72,
      longitude: 7.15,
      speedKnots: 9.4,
      course: 218,
      shipType: null,
      destination: null,
      callSign: null,
      imo: null,
      draught: null,
      lengthM: null,
      beamM: null,
      eta: null,
      receivedAt: position.ship.receivedAt,
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const client of downstreamClients) client.terminate();
    const relayClosed = waitForEvent(relay.server, "close");
    relay.close();
    await relayClosed;
    for (const client of upstreamServer.clients) client.terminate();
    await new Promise((resolve) => upstreamServer.close(resolve));
  }
});

test("parses ShipStaticData static message (type 5)", () => {
  const message = {
    MessageType: "ShipStaticData",
    MetaData: { MMSI: 227123456 },
    Message: {
      ShipStaticData: {
        MessageID: 5,
        RepeatIndicator: 0,
        UserID: 227123456,
        Valid: true,
        Name: "TEST VESSEL",
        CallSign: "FTEST",
        Type: 70,
        Dimension: { A: 10, B: 10, C: 5, D: 5 },
        MaximumStaticDraught: "8.5",
        Destination: "POINTE-NOIRE",
        Eta: { Month: 10, Day: 23, Hour: 18, Minute: 30 },
      },
    },
  };
  const parsed = parseAisStaticData(JSON.stringify(message));
  assert.deepEqual(parsed, {
    mmsi: "227123456",
    name: "TEST VESSEL",
    callSign: "FTEST",
    shipType: "Navire de charge",
    destination: "POINTE-NOIRE",
    imo: null,
    draught: "8.5",
    lengthM: 20,
    beamM: 10,
    eta: "10-23 18:30",
  });
});

test("parses StaticDataReport (type 24) ReportA + ReportB", () => {
  const message = {
    MessageType: "StaticDataReport",
    MetaData: { MMSI: 227123456 },
    Message: {
      StaticDataReport: {
        MessageID: 24,
        RepeatIndicator: 0,
        UserID: 227123456,
        Valid: true,
        ReportA: { Valid: true, Name: "REPORT VESSEL" },
        ReportB: { Valid: true, ShipType: 80, CallSign: "FREP" },
      },
    },
  };
  const parsed = parseAisStaticData(JSON.stringify(message));
  assert.deepEqual(parsed, {
    mmsi: "227123456",
    name: "REPORT VESSEL",
    callSign: "FREP",
    shipType: "Pétrolier",
    destination: null,
  });
});

test("parseAisStaticData rejects invalid payloads", () => {
  assert.equal(
    parseAisStaticData(
      JSON.stringify({
        MessageType: "ShipStaticData",
        Message: { ShipStaticData: { Valid: false } },
      })
    ),
    null
  );
  assert.equal(
    parseAisStaticData(
      JSON.stringify({
        MessageType: "ShipStaticData",
        Message: { ShipStaticData: { UserID: 12345678901, Valid: true } },
      })
    ),
    null
  );
  assert.equal(parseAisStaticData("{malformed"), null);
});

test("mergeStaticData does not overwrite existing values with empty strings", () => {
  const cache = new Map();
  mergeStaticData(cache, { mmsi: "227123456", name: "FIRST", callSign: null });
  mergeStaticData(cache, { mmsi: "227123456", name: "", callSign: "FCALL" });
  assert.deepEqual(cache.get("227123456"), {
    mmsi: "227123456",
    name: "FIRST",
    callSign: "FCALL",
  });
});

test("normalizeMmsi pads short numeric MMSIs to 9 digits", () => {
  assert.equal(normalizeMmsi("227123456"), "227123456");
  assert.equal(normalizeMmsi(227123456), "227123456");
  assert.equal(normalizeMmsi("12345"), "000012345");
  assert.equal(normalizeMmsi("abc"), null);
  assert.equal(normalizeMmsi(null), null);
});

test("describeShipType code boundaries", () => {
  assert.equal(describeShipType(0), null);
  assert.equal(describeShipType(30), "Navire de pêche");
  assert.equal(describeShipType(37), "Plaisancier");
  assert.equal(describeShipType(55), "Navire de police");
  assert.equal(describeShipType(70), "Navire de charge");
  assert.equal(describeShipType(89), "Pétrolier");
  assert.equal(describeShipType(99), "Autre type");
  assert.equal(describeShipType(100), null);
  assert.equal(describeShipType("abc"), null);
});

test("position merge: static data enriches position when static arrives first", () => {
  const cache = new Map();
  mergeStaticData(cache, {
    mmsi: "227123456",
    name: "STATIC NAME",
    shipType: "Pétrolier",
    callSign: "FCALL",
    destination: "STATIC DEST",
  });
  const position = parseAisPosition(
    JSON.stringify({
      MessageType: "PositionReport",
      MetaData: { MMSI: 227123456, ShipName: "" },
      Message: {
        PositionReport: {
          UserID: 227123456,
          Latitude: 4.72,
          Longitude: 7.15,
          Sog: 9.4,
          Cog: 218,
        },
      },
    }),
    undefined,
    cache
  );
  assert.deepEqual(position.ship, {
    mmsi: "227123456",
    name: "STATIC NAME",
    latitude: 4.72,
    longitude: 7.15,
    speedKnots: 9.4,
    course: 218,
    shipType: "Pétrolier",
    destination: "STATIC DEST",
    callSign: "FCALL",
    imo: null,
    draught: null,
    lengthM: null,
    beamM: null,
    eta: null,
    receivedAt: position.ship.receivedAt,
  });
});

test("position merge: metadata name wins over cached static name", () => {
  const cache = new Map();
  mergeStaticData(cache, { mmsi: "227123456", name: "CACHED NAME" });
  const position = parseAisPosition(
    JSON.stringify({
      MessageType: "PositionReport",
      MetaData: { MMSI: 227123456, ShipName: "META NAME" },
      Message: {
        PositionReport: {
          UserID: 227123456,
          Latitude: 1.0,
          Longitude: 2.0,
        },
      },
    }),
    undefined,
    cache
  );
  assert.equal(position.ship.name, "META NAME");
});

test("parseAisStaticData returns null for position messages (not static)", () => {
  assert.equal(
    parseAisStaticData(
      JSON.stringify({
        MessageType: "PositionReport",
        MetaData: { MMSI: 227123456 },
        Message: { PositionReport: { UserID: 227123456, Latitude: 1.0, Longitude: 2.0 } },
      })
    ),
    null
  );
});
