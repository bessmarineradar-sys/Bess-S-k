import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

export const TRACKING_REGION = {
  south: -7,
  north: 22,
  west: -20,
  east: 15,
};

const TICKET_LIFETIME_MS = 30_000;
const MAX_CLIENTS = 100;

export function isInTrackingRegion(latitude, longitude) {
  return Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= TRACKING_REGION.south &&
    latitude <= TRACKING_REGION.north &&
    longitude >= TRACKING_REGION.west &&
    longitude <= TRACKING_REGION.east;
}

export function parseAisPosition(raw, receivedAt = new Date().toISOString()) {
  let message;
  try {
    message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
  } catch {
    return null;
  }

  if (message?.MessageType !== "ShipPosition") return null;

  const metadata = message.MetaData;
  const content = message.Content;
  const position = content?.Position;
  const latitude = Number(position?.Latitude ?? content?.Latitude);
  const longitude = Number(position?.Longitude ?? content?.Longitude);
  const mmsi = String(metadata?.MMSI ?? "");

  if (
    !/^\d{9}$/.test(mmsi) ||
    (latitude === 0 && longitude === 0) ||
    !isInTrackingRegion(latitude, longitude)
  ) return null;

  const speedKnots = Number(content?.SOG);
  const course = Number(content?.COG);
  const shipType = content?.ShipType ?? metadata?.ShipType;
  const destination = content?.Destination ?? metadata?.Destination;

  return {
    type: "position",
    ship: {
      mmsi,
      name: String(metadata?.ShipName ?? "").trim() || "Nom inconnu",
      latitude,
      longitude,
      speedKnots: Number.isFinite(speedKnots) ? speedKnots : null,
      course: Number.isFinite(course) ? course : null,
      shipType: shipType === undefined || shipType === null ? null : String(shipType),
      destination: destination === undefined || destination === null
        ? null
        : String(destination).trim() || null,
      receivedAt,
    },
  };
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
      connection.send(JSON.stringify({
        APIKey: env.AISSTREAM_API_KEY,
        FilterRegion: {
          StartLatitude: TRACKING_REGION.south,
          EndLatitude: TRACKING_REGION.north,
          StartLongitude: TRACKING_REGION.west,
          EndLongitude: TRACKING_REGION.east,
        },
        FiltersShipMMSI: [],
        FiltersShipType: [],
      }));
      broadcastStatus("live", "Flux AIS connecté.");
    });

    connection.on("message", (raw) => {
      const event = parseAisPosition(raw);
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
