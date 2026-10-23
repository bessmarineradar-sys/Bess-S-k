import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

export const TRACKING_REGION = {
  south: -6.5,
  north: 15.5,
  west: -19.5,
  east: 12.5,
};

const TICKET_LIFETIME_MS = 30_000;
const MAX_CLIENTS = 100;

/**
 * Types de messages AISStream réellement consommés par le relais. Les types
 * statiques (5 et 24) sont indispensables : ils portent le nom, le type de
 * navire et l'indicatif d'appel, absents des messages de position.
 */
export const SUBSCRIBED_MESSAGE_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
  "ShipStaticData",
  "StaticDataReport",
];

export function createAisSubscription(apiKey) {
  return {
    APIKey: apiKey,
    BoundingBoxes: [[
      [TRACKING_REGION.north, TRACKING_REGION.west],
      [TRACKING_REGION.south, TRACKING_REGION.east],
    ]],
    FiltersShipMMSI: [],
    FilterMessageTypes: [...SUBSCRIBED_MESSAGE_TYPES],
  };
}

export function isInTrackingRegion(latitude, longitude) {
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= TRACKING_REGION.south &&
    latitude <= TRACKING_REGION.north &&
    longitude >= TRACKING_REGION.west &&
    longitude <= TRACKING_REGION.east;
}

export const POSITION_MESSAGE_TYPES = new Set([
  "PositionReport",
  "ShipPosition",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
]);

export const STATIC_MESSAGE_TYPES = new Set(["ShipStaticData", "StaticDataReport"]);

/**
 * AISStream expose les MMSI sous forme numérique, ce qui supprime les zéros
 * initiaux (002442018 devient 2442018). On rétablit toujours les 9 chiffres.
 */
export function normalizeMmsi(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const padded = raw.padStart(9, "0");
  return padded.length === 9 ? padded : null;
}

export function describeShipType(code) {
  const value = Number(code);
  if (!Number.isFinite(value)) return null;
  const type = Math.trunc(value);
  if (type <= 0) return null;
  if (type >= 20 && type <= 29) return "Navire à foil (WIG)";
  if (type === 30) return "Navire de pêche";
  if (type >= 31 && type <= 32) return "Navire remorqueur";
  if (type === 33) return "Dragueur";
  if (type === 34) return "Navire de plongée";
  if (type === 35) return "Navire militaire";
  if (type === 36) return "Voilier";
  if (type === 37) return "Plaisancier";
  if (type === 38) return "Navire à grande vitesse";
  if (type === 43) return "Transport médical";
  if (type === 50) return "Navire pilote";
  if (type === 51) return "Navire de sauvetage";
  if (type === 52) return "Remorqueur";
  if (type === 53) return "Navette de port";
  if (type === 54) return "Navire anti-pollution";
  if (type === 55) return "Navire de police";
  if (type >= 56 && type <= 58) return "Navire local";
  if (type === 59) return "Transport médical";
  if (type >= 60 && type <= 69) return "Navire passager";
  if (type >= 70 && type <= 79) return "Navire de charge";
  if (type >= 80 && type <= 89) return "Pétrolier";
  if (type >= 90 && type <= 99) return "Autre type";
  return null;
}

/**
 * Les codes AIS de type de navire sont numériques. Le relais n'expose que des
 * libellés lisibles, mais accepte aussi un libellé déjà texte.
 */
export function resolveShipType(...candidates) {
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    if (typeof candidate === "number" || /^\d+$/.test(String(candidate).trim())) {
      const described = describeShipType(candidate);
      if (described) return described;
      continue;
    }
    const label = String(candidate).trim();
    if (label) return label;
  }
  return null;
}

/** Premier champ texte non vide, en ignorant les chaînes vides ou composées d'espaces. */
function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

/* Formate un ETA AISStream { Month, Day, Hour, Minute } en "MM-DD HH:mm". */
function formatAisEta(eta) {
  if (!eta || typeof eta !== "object") return null;
  const m = String(eta.Month ?? "").padStart(2, "0");
  const d = String(eta.Day ?? "").padStart(2, "0");
  const h = String(eta.Hour ?? "").padStart(2, "0");
  const min = String(eta.Minute ?? "").padStart(2, "0");
  if (!m || !d || !h || !min) return null;
  return `${m}-${d} ${h}:${min}`;
}

function resolveCoordinates(candidates) {
  for (const [latitude, longitude] of candidates) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat === 0 && lng === 0) continue;
    if (isInTrackingRegion(lat, lng)) return [lat, lng];
  }
  return null;
}

function decodeEnvelope(raw) {
  let message;
  try {
    message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch {
    return null;
  }
  if (!message || typeof message !== "object") return null;
  return message;
}

export function parseAisPosition(raw, receivedAt = new Date().toISOString(), staticByMmsi = new Map()) {
  const message = decodeEnvelope(raw);
  if (!message) return null;

  const messageType = message.MessageType;
  if (!POSITION_MESSAGE_TYPES.has(messageType)) return null;

  const metadata = message.MetaData ?? {};
  const content = message.Content ?? {};
  const payload = message.Message?.[messageType] ?? {};

  if (payload.Valid === false) return null;

  const coordinates = resolveCoordinates([
    [metadata.Latitude ?? metadata.latitude, metadata.Longitude ?? metadata.longitude],
    [payload.Latitude, payload.Longitude],
    [content.Position?.Latitude ?? content.Latitude ?? content.latitude, content.Position?.Longitude ?? content.Longitude ?? content.longitude],
  ]);
  if (!coordinates) return null;
  const [latitude, longitude] = coordinates;

  const mmsi = normalizeMmsi(metadata.MMSI ?? payload.UserID);
  if (!mmsi) return null;

  const speedKnots = Number(content.SOG ?? content.Sog ?? payload.Sog);
  const course = Number(content.COG ?? content.Cog ?? payload.Cog);
  const staticData = staticByMmsi.get(mmsi) ?? {};

  return {
    type: "position",
    ship: {
      mmsi,
      name: firstNonEmpty(metadata.ShipName, staticData.name) ?? "Nom inconnu",
      latitude,
      longitude,
      speedKnots: Number.isFinite(speedKnots) ? speedKnots : null,
      course: Number.isFinite(course) ? course : null,
      shipType: resolveShipType(staticData.shipType, content.ShipType, metadata.ShipType),
      destination: firstNonEmpty(staticData.destination, content.Destination, metadata.Destination),
      callSign: firstNonEmpty(staticData.callSign, metadata.CallSign, content.CallSign),
      imo: firstNonEmpty(staticData.imo, content.ImoNumber, content.imo),
      draught: firstNonEmpty(staticData.draught, content.MaximumStaticDraught, content.draught),
      lengthM: staticData.lengthM ?? null,
      beamM: staticData.beamM ?? null,
      eta: firstNonEmpty(staticData.eta, content.Eta, content.eta),
      receivedAt,
    },
  };
}

/**
 * Les données statiques AIS (type 5 et type 24) arrivent dans des messages
 * distincts des positions et peuvent être émises avant ou après celles-ci.
 * Le relais les mémorise par MMSI et les fusionne ensuite dans les positions.
 */
export function parseAisStaticData(raw) {
  const message = decodeEnvelope(raw);
  if (!message) return null;

  const messageType = message.MessageType;
  if (!STATIC_MESSAGE_TYPES.has(messageType)) return null;

  const payload = message.Message?.[messageType];
  if (!payload || payload.Valid === false) return null;

  const mmsi = normalizeMmsi(payload.UserID ?? message.MetaData?.MMSI);
  if (!mmsi) return null;

  if (messageType === "ShipStaticData") {
    const dimension = payload.Dimension ?? {};
    return {
      mmsi,
      name: firstNonEmpty(payload.Name),
      callSign: firstNonEmpty(payload.CallSign),
      shipType: describeShipType(payload.Type),
      destination: firstNonEmpty(payload.Destination),
      imo: String(payload.ImoNumber ?? "").trim() || null,
      draught: firstNonEmpty(payload.MaximumStaticDraught),
      lengthM: dimension.A !== undefined && dimension.B !== undefined
        ? dimension.A + dimension.B
        : null,
      beamM: dimension.C !== undefined && dimension.D !== undefined
        ? dimension.C + dimension.D
        : null,
      eta: formatAisEta(payload.Eta),
    };
  }

  // StaticDataReport : les informations sont normalement réparties entre
  // ReportA (nom) et ReportB (type, indicatif). Chaque rapport porte son propre
  // indicateur de validité, on ignore donc un rapport invalide sans perdre l'autre.
  const reportA = payload.ReportA ?? {};
  const reportB = payload.ReportB ?? {};
  const name = reportA.Valid === false ? null : firstNonEmpty(reportA.Name);
  const callSign = reportB.Valid === false ? null : firstNonEmpty(reportB.CallSign);
  const shipType = reportB.Valid === false ? null : describeShipType(reportB.ShipType);

  if (!name && !callSign && !shipType) return null;

  return {
    mmsi,
    name,
    callSign,
    shipType,
    destination: null,
  };
}

/**
 * Fusionne des informations statiques dans le cache MMSI. Les valeurs déjà
 * connues ne sont jamais écrasées par une valeur vide.
 */
export function mergeStaticData(cache, incoming) {
  if (!incoming) return cache;
  const current = cache.get(incoming.mmsi) ?? {};
  const merged = { mmsi: incoming.mmsi, ...current };
  for (const key of ["name", "callSign", "shipType", "destination", "imo", "draught", "lengthM", "beamM", "eta"]) {
    const value = incoming[key];
    if (value !== null && value !== undefined && value !== "") merged[key] = value;
  }
  cache.set(incoming.mmsi, merged);
  return cache;
}

function responseJson(response, status, body, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...(origin ? {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "authorization",
      "access-control-allow-methods": "POST, OPTIONS",
      vary: "Origin",
    } : {}),
  });
  response.end(JSON.stringify(body));
}

function parseAllowedOrigins(value = "") {
  return new Set(value.split(",").map((origin) => origin.trim()).filter(Boolean));
}

export function createRelayServer(env = process.env) {
  const allowedOrigins = parseAllowedOrigins(env.FRONTEND_ORIGINS);
  const tickets = new Map();
  const clients = new Set();
  const pagesUrl = env.SUPABASE_URL?.replace(/\/+$/, "");
  const hasSupabaseConfig = Boolean(pagesUrl && env.SUPABASE_ANON_KEY);
  const hasAisKey = Boolean(env.AISSTREAM_API_KEY);
  const relayUrl = env.AISSTREAM_URL || "wss://stream.aisstream.io/v0/stream";
  let upstream = null;
  let upstreamState = hasAisKey ? "idle" : "unavailable";
  let upstreamRetryTimer = null;
  let retryDelayMs = 1000;
  let lastPositionAt = null;
  const staticByMmsi = new Map();

  function sendStatus(client, status, message) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "status", status, message }));
    }
  }

  function broadcastStatus(status, message) {
    for (const client of clients) sendStatus(client, status, message);
  }

  function scheduleReconnect() {
    if (upstreamRetryTimer || clients.size === 0 || !hasAisKey) return;
    upstreamRetryTimer = setTimeout(() => {
      upstreamRetryTimer = null;
      connectUpstream();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, 30_000);
  }

  function closeUpstream() {
    if (upstreamRetryTimer) clearTimeout(upstreamRetryTimer);
    upstreamRetryTimer = null;
    const activeUpstream = upstream;
    upstream = null;
    if (activeUpstream && activeUpstream.readyState < WebSocket.CLOSING) {
      activeUpstream.close();
    }
    upstreamState = hasAisKey ? "idle" : "unavailable";
  }

  function connectUpstream() {
    if (!hasAisKey) {
      upstreamState = "unavailable";
      broadcastStatus("unavailable", "Le service AIS doit être configuré sur le serveur.");
      return;
    }
    if (clients.size === 0 || upstream) return;

    upstreamState = "connecting";
    broadcastStatus("connecting", "Connexion à la source AIS…");
    const connection = new WebSocket(relayUrl, { handshakeTimeout: 15_000 });
    upstream = connection;

    connection.on("open", () => {
      retryDelayMs = 1000;
      upstreamState = "live";
      connection.send(JSON.stringify(createAisSubscription(env.AISSTREAM_API_KEY)));
      broadcastStatus("live", "Flux AIS connecté.");
    });

    connection.on("message", (raw) => {
      const staticInfo = parseAisStaticData(raw);
      if (staticInfo) {
        mergeStaticData(staticByMmsi, staticInfo);
        if (staticByMmsi.size > 5000) {
          staticByMmsi.delete(staticByMmsi.keys().next().value);
        }
        return;
      }
      const event = parseAisPosition(raw, undefined, staticByMmsi);
      if (!event) return;
      lastPositionAt = event.ship.receivedAt;
      const payload = JSON.stringify(event);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
      }
    });

    connection.on("error", () => {
      upstreamState = "error";
      broadcastStatus("error", "La connexion à la source AIS a échoué; nouvelle tentative en cours.");
    });

    connection.on("close", () => {
      if (upstream !== connection) return;
      upstream = null;
      upstreamState = "error";
      broadcastStatus("error", "Le flux AIS est interrompu; nouvelle tentative en cours.");
      scheduleReconnect();
    });
  }

  async function validateSupabaseToken(token) {
    if (!hasSupabaseConfig || !token) return null;
    const response = await fetch(`${pagesUrl}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const user = await response.json();
    return typeof user.id === "string" ? user.id : null;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    const origin = request.headers.origin || "";
    const allowedOrigin = allowedOrigins.has(origin) ? origin : "";

    if (url.pathname === "/health" && request.method === "GET") {
      responseJson(response, 200, {
        status: "ok",
        aisConfigured: hasAisKey,
        aisStatus: upstreamState,
        clients: clients.size,
        lastPositionAt,
      });
      return;
    }

    if (url.pathname !== "/session") {
      responseJson(response, 404, { error: "Not found." });
      return;
    }

    if (!allowedOrigin) {
      responseJson(response, 403, { error: "Origin non autorisée." });
      return;
    }

    if (request.method === "OPTIONS") {
      responseJson(response, 204, {});
      return;
    }
    if (request.method !== "POST") {
      responseJson(response, 405, { error: "Méthode non autorisée." }, allowedOrigin);
      return;
    }

    const authorization = request.headers.authorization || "";
    const token = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    try {
      const userId = await validateSupabaseToken(token);
      if (!userId) {
        responseJson(response, 401, { error: "Session utilisateur invalide." }, allowedOrigin);
        return;
      }
      const ticket = randomBytes(32).toString("base64url");
      const now = Date.now();
      for (const [key, value] of tickets) {
        if (value.expiresAt <= now) tickets.delete(key);
      }
      tickets.set(ticket, { userId, expiresAt: now + TICKET_LIFETIME_MS });
      responseJson(response, 201, { ticket, expiresInSeconds: TICKET_LIFETIME_MS / 1000 }, allowedOrigin);
    } catch {
      responseJson(response, 503, { error: "Validation de session temporairement indisponible." }, allowedOrigin);
    }
  });

  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on("upgrade", (request, socket, head) => {
    const origin = request.headers.origin || "";
    const url = new URL(request.url || "/", "http://localhost");
    const ticket = tickets.get(url.searchParams.get("ticket") || "");
    const ticketKey = url.searchParams.get("ticket") || "";
    if (
      url.pathname !== "/ws" ||
      !allowedOrigins.has(origin) ||
      !ticket ||
      ticket.expiresAt <= Date.now()
    ) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    tickets.delete(ticketKey);
    if (clients.size >= MAX_CLIENTS) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (client) => {
      client.userId = ticket.userId;
      webSocketServer.emit("connection", client, request);
    });
  });

  webSocketServer.on("connection", (client) => {
    clients.add(client);
    if (hasAisKey) {
      sendStatus(client, upstreamState, "Connexion à la source AIS…");
      connectUpstream();
    } else {
      sendStatus(client, "unavailable", "Le service AIS doit être configuré sur le serveur.");
      client.close(1011, "AIS source not configured");
    }

    client.on("close", () => {
      clients.delete(client);
      if (clients.size === 0) closeUpstream();
    });
    client.on("error", () => clients.delete(client));
  });

  return { server, close: () => {
    closeUpstream();
    for (const client of clients) client.close(1001, "Server shutting down");
    webSocketServer.close();
    server.close();
  } };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { server } = createRelayServer();
  const port = Number(process.env.PORT || 10000);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Bess Sök AIS relay listening on ${port}`);
  });
}
