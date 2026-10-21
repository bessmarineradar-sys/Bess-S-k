import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { supabase } from "../lib/supabase";
import type { VesselForProspect } from "../hooks/useProspects";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN ?? "";

const TRACKING_REGION = {
  south: -7,
  north: 22,
  west: -20,
  east: 15,
};

const ports = [
  { name: "Port de Dakar", longitude: -17.4676, latitude: 14.7167 },
  { name: "Port d'Abidjan", longitude: -4.0083, latitude: 5.36 },
  { name: "Port de Tema", longitude: -0.187, latitude: 5.6037 },
  { name: "Port de Lagos", longitude: 3.3792, latitude: 6.5244 },
  { name: "Port de Pointe-Noire", longitude: 11.8636, latitude: -4.7692 },
];

interface LiveShip extends VesselForProspect {
  latitude: number;
  longitude: number;
  speedKnots: number | null;
  course: number | null;
  receivedAt: string;
}

interface PositionMessage {
  type: "position";
  ship: LiveShip;
}

interface StatusMessage {
  type: "status";
  status: "connecting" | "live" | "error" | "unavailable";
  message: string;
}

type ConnectionStatus = StatusMessage["status"];

interface LiveMapProps {
  session: Session;
  trackedMmsis: ReadonlySet<string>;
  onSaveVessel: (ship: VesselForProspect) => Promise<unknown>;
  onOpenProspects: () => void;
}

function isPositionMessage(value: unknown): value is PositionMessage {
  if (typeof value !== "object" || value === null || !("ship" in value)) return false;
  const ship = value.ship;
  return typeof ship === "object" && ship !== null &&
    "mmsi" in ship && typeof ship.mmsi === "string" &&
    "name" in ship && typeof ship.name === "string" &&
    "latitude" in ship && typeof ship.latitude === "number" &&
    "longitude" in ship && typeof ship.longitude === "number" &&
    "receivedAt" in ship && typeof ship.receivedAt === "string";
}

function isStatusMessage(value: unknown): value is StatusMessage {
  return typeof value === "object" && value !== null &&
    "type" in value && value.type === "status" &&
    "status" in value &&
    ["connecting", "live", "error", "unavailable"].includes(String(value.status)) &&
    "message" in value && typeof value.message === "string";
}

function getRelayEndpoints(configuredUrl: string) {
  const base = new URL(configuredUrl);
  const httpUrl = new URL(base);
  httpUrl.protocol = base.protocol === "wss:" ? "https:" : "http:";
  httpUrl.pathname = "/";
  httpUrl.search = "";
  httpUrl.hash = "";
  const wsUrl = new URL("/ws", base);
  wsUrl.protocol = base.protocol === "https:" || base.protocol === "http:"
    ? (base.protocol === "https:" ? "wss:" : "ws:")
    : base.protocol;
  wsUrl.search = "";
  wsUrl.hash = "";
  return { sessionUrl: new URL("/session", httpUrl).toString(), wsUrl };
}

function createPortElement(name: string) {
  const element = document.createElement("div");
  element.style.cssText = "min-width:150px;padding:8px;color:#132b39;font:600 12px sans-serif";
  element.textContent = `⚓ ${name}`;
  return element;
}

function createVesselPopup(ship: LiveShip) {
  const content = document.createElement("div");
  content.style.cssText = "min-width:180px;padding:12px;color:#e8eef4;font:12px sans-serif";
  const title = document.createElement("h3");
  title.style.cssText = "margin:0 0 8px;font-size:14px";
  title.textContent = ship.name;
  const details = document.createElement("p");
  details.style.cssText = "margin:0;line-height:1.7;color:#bdcbd3";
  details.textContent = `MMSI ${ship.mmsi} · ${ship.speedKnots === null ? "Vitesse inconnue" : `${ship.speedKnots.toFixed(1)} nd`} · cap ${ship.course === null ? "inconnu" : `${Math.round(ship.course)}°`}`;
  content.append(title, details);
  if (ship.destination) {
    const destination = document.createElement("p");
    destination.style.cssText = "margin:5px 0 0;color:#9aabb7";
    destination.textContent = `Destination déclarée : ${ship.destination}`;
    content.append(destination);
  }
  return content;
}

function StatusBadge({ status, message }: { status: ConnectionStatus; message: string }) {
  const color = status === "live"
    ? "bg-emerald-400"
    : status === "connecting"
      ? "bg-amber-400"
      : "bg-rose-400";
  return (
    <div aria-live="polite" className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0b1926] px-3 py-1.5 text-xs text-[#c3cfd6]">
      <span className={`h-2 w-2 rounded-full ${color} ${status === "live" ? "animate-pulse" : ""}`} />
      {message}
    </div>
  );
}

export default function LiveMap({ session, trackedMmsis, onSaveVessel, onOpenProspects }: LiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const [ships, setShips] = useState<Record<string, LiveShip>>({});
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("Initialisation du flux AIS…");
  const [mapError, setMapError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [savingMmsi, setSavingMmsi] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastPositionAt, setLastPositionAt] = useState<number | null>(null);
  const [staleCheckAt, setStaleCheckAt] = useState(Date.now());
  const relayUrl = import.meta.env.VITE_AIS_RELAY_URL?.trim();
  const mapToken = import.meta.env.VITE_MAPBOX_TOKEN?.trim();

  useEffect(() => {
    if (!mapContainer.current) return;
    if (!mapToken) {
      setMapError("Carte indisponible : configurez VITE_MAPBOX_TOKEN dans les secrets de build.");
      return;
    }

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/light-v11",
        center: [-3, 8],
        zoom: 4.1,
        maxBounds: [
          [TRACKING_REGION.west - 3, TRACKING_REGION.south - 2],
          [TRACKING_REGION.east + 3, TRACKING_REGION.north + 2],
        ],
      });
      map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
      map.current.on("error", () => {
        setMapError("Le fond de carte n’a pas pu être chargé. Vérifiez le jeton et ses permissions Mapbox.");
      });

      ports.forEach((port) => {
        new mapboxgl.Marker({ color: "#0b756b" })
          .setLngLat([port.longitude, port.latitude])
          .setPopup(new mapboxgl.Popup({ offset: 18 }).setDOMContent(createPortElement(port.name)))
          .addTo(map.current!);
      });
    } catch (error) {
      setMapError(error instanceof Error ? `Impossible d’initialiser la carte : ${error.message}` : "Impossible d’initialiser la carte.");
    }

    return () => {
      Object.values(markersRef.current).forEach((marker) => marker.remove());
      markersRef.current = {};
      map.current?.remove();
      map.current = null;
    };
  }, [mapToken]);

  useEffect(() => {
    if (!supabase) {
      setConnectionStatus("unavailable");
      setConnectionMessage("Connexion Supabase non configurée");
      return;
    }
    if (!relayUrl) {
      setConnectionStatus("unavailable");
      setConnectionMessage("Relais AIS non configuré");
      return;
    }
    const client = supabase;
    const configuredRelayUrl = relayUrl;

    let stopped = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    async function connect() {
      setConnectionStatus("connecting");
      setConnectionMessage("Connexion sécurisée au flux AIS…");
      try {
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        const accessToken = data.session?.access_token ?? session.access_token;
        const { sessionUrl, wsUrl } = getRelayEndpoints(configuredRelayUrl);
        const ticketResponse = await fetch(sessionUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!ticketResponse.ok) {
          const result: unknown = await ticketResponse.json().catch(() => null);
          const message = typeof result === "object" && result !== null &&
            "error" in result && typeof result.error === "string"
            ? result.error
            : `Le relais AIS a refusé la connexion (${ticketResponse.status}).`;
          throw new Error(message);
        }
        const ticketBody: unknown = await ticketResponse.json();
        if (typeof ticketBody !== "object" || ticketBody === null ||
          !("ticket" in ticketBody) || typeof ticketBody.ticket !== "string") {
          throw new Error("Le relais AIS a renvoyé une réponse de session invalide.");
        }
        if (stopped) return;
        wsUrl.searchParams.set("ticket", ticketBody.ticket);
        socket = new WebSocket(wsUrl);
        socket.onopen = () => {
          retryDelay = 1000;
          setConnectionStatus("connecting");
          setConnectionMessage("Flux AIS connecté, en attente des positions…");
        };
        socket.onmessage = (event) => {
          let message: unknown;
          try {
            message = JSON.parse(String(event.data));
          } catch {
            setConnectionStatus("error");
            setConnectionMessage("Message AIS invalide reçu du relais.");
            return;
          }
          if (isStatusMessage(message)) {
            setConnectionStatus(message.status);
            setConnectionMessage(message.message);
            return;
          }
          if (!isPositionMessage(message)) return;
          const ship = message.ship;
          setLastPositionAt(Date.now());
          setShips((current) => {
            const updated = { ...current, [ship.mmsi]: ship };
            const entries = Object.entries(updated);
            if (entries.length > 1500) {
              entries.sort(([, first], [, second]) =>
                Date.parse(first.receivedAt) - Date.parse(second.receivedAt),
              );
              for (const [mmsi] of entries.slice(0, entries.length - 1500)) delete updated[mmsi];
            }
            return updated;
          });
        };
        socket.onerror = () => {
          setConnectionStatus("error");
          setConnectionMessage("Erreur de connexion au relais AIS.");
        };
        socket.onclose = () => {
          if (stopped) return;
          setConnectionStatus("error");
          setConnectionMessage("Flux interrompu; nouvelle tentative automatique…");
          reconnectTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30_000);
            void connect();
          }, retryDelay);
        };
      } catch (error) {
        if (stopped) return;
        setConnectionStatus("error");
        setConnectionMessage(error instanceof Error ? error.message : "Connexion AIS impossible.");
        reconnectTimer = setTimeout(() => {
          retryDelay = Math.min(retryDelay * 2, 30_000);
          void connect();
        }, retryDelay);
      }
    }

    void connect();
    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [relayUrl, session.access_token]);

  useEffect(() => {
    if (connectionStatus !== "live" || lastPositionAt === null) return;
    const timer = setInterval(() => setStaleCheckAt(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [connectionStatus, lastPositionAt]);

  useEffect(() => {
    if (!map.current) return;
    const activeMmsis = new Set(Object.keys(ships));
    for (const [mmsi, marker] of Object.entries(markersRef.current)) {
      if (!activeMmsis.has(mmsi)) {
        marker.remove();
        delete markersRef.current[mmsi];
      }
    }
    for (const ship of Object.values(ships)) {
      const coordinates: [number, number] = [ship.longitude, ship.latitude];
      const existing = markersRef.current[ship.mmsi];
      if (existing) {
        existing.setLngLat(coordinates).setRotation(ship.course ?? 0);
        continue;
      }
      const element = document.createElement("div");
      element.className = "live-vessel-marker";
      element.style.cssText = "width:24px;height:24px;overflow:hidden;border:1px solid #126b6b;border-radius:50%;background:#082434;display:grid;place-items:center;color:#68e9df;font-size:14px;cursor:pointer";
      element.setAttribute("aria-label", `Navire ${ship.name}, MMSI ${ship.mmsi}`);
      element.textContent = "▲";
      markersRef.current[ship.mmsi] = new mapboxgl.Marker({
        element,
        rotationAlignment: "map",
      })
        .setLngLat(coordinates)
        .setRotation(ship.course ?? 0)
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setDOMContent(createVesselPopup(ship)))
        .addTo(map.current);
    }
  }, [ships]);

  const shipTypes = useMemo(() =>
    Array.from(new Set(Object.values(ships).map((ship) => ship.shipType).filter(
      (value): value is string => Boolean(value),
    ))).sort(),
  [ships]);

  const filteredShips = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("fr");
    return Object.values(ships)
      .filter((ship) => typeFilter === "all" || ship.shipType === typeFilter)
      .filter((ship) => !query ||
        [ship.name, ship.mmsi, ship.destination ?? ""]
          .some((value) => value.toLocaleLowerCase("fr").includes(query)))
      .sort((first, second) => first.name.localeCompare(second.name));
  }, [ships, searchQuery, typeFilter]);

  const focusOnShip = useCallback((ship: LiveShip) => {
    setSelectedMmsi(ship.mmsi);
    map.current?.flyTo({ center: [ship.longitude, ship.latitude], zoom: 9, duration: 900 });
    markersRef.current[ship.mmsi]?.togglePopup();
  }, []);

  const saveVessel = useCallback(async (ship: LiveShip) => {
    setSavingMmsi(ship.mmsi);
    setSaveError(null);
    try {
      await onSaveVessel({
        mmsi: ship.mmsi,
        name: ship.name,
        shipType: ship.shipType,
        destination: ship.destination,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Impossible d’enregistrer ce navire.");
    } finally {
      setSavingMmsi(null);
    }
  }, [onSaveVessel]);

  const isStale = connectionStatus === "live" && lastPositionAt !== null &&
    staleCheckAt - lastPositionAt > 120_000;
  const status = isStale ? "error" : connectionStatus;
  const statusMessage = isStale
    ? "Aucune position reçue depuis plus de 2 min"
    : connectionMessage;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-[#45e0bd]">SUIVI MARITIME · AIS</p>
          <h1 className="mt-2 font-['Manrope'] text-2xl font-bold text-[#eef4f6]">Prospection en mer</h1>
          <p className="mt-1 text-sm text-[#91a2ae]">
            Côte ouest-africaine jusqu’à Pointe-Noire · Données AIS pouvant être incomplètes ou retardées.
          </p>
        </div>
        <StatusBadge status={status} message={statusMessage} />
      </header>

      {mapError && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{mapError}</p>}
      {saveError && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{saveError}</p>}

      <div className="grid min-h-[620px] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="relative min-h-[430px] overflow-hidden rounded-xl border border-white/10 bg-[#0b2533]">
          <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-white/10 bg-[#091622]/90 px-3 py-2 text-xs text-[#d4dfe5]">
            <strong>{Object.keys(ships).length}</strong> navire{Object.keys(ships).length === 1 ? "" : "s"} reçu{Object.keys(ships).length === 1 ? "" : "s"} dans la zone
          </div>
          <div aria-label="Carte des navires AIS entre le Sénégal et Pointe-Noire" className="absolute inset-0" ref={mapContainer} />
        </div>

        <aside className="flex min-h-[430px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0b1926]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h2 className="font-semibold text-white">Navires détectés</h2>
            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-[#b6c5ce]">{filteredShips.length}</span>
          </div>
          <div className="space-y-2 border-b border-white/10 p-3">
            <label className="sr-only" htmlFor="vessel-search">Rechercher un navire</label>
            <input
              className="w-full rounded-lg border border-white/10 bg-[#07131f] px-3 py-2 text-sm text-white outline-none placeholder:text-[#71838f] focus:border-[#45e0bd]/50"
              id="vessel-search"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Nom, MMSI, destination…"
              type="search"
              value={searchQuery}
            />
            <label className="sr-only" htmlFor="vessel-type-filter">Filtrer par type de navire</label>
            <select
              className="w-full rounded-lg border border-white/10 bg-[#07131f] px-3 py-2 text-sm text-white outline-none focus:border-[#45e0bd]/50"
              id="vessel-type-filter"
              onChange={(event) => setTypeFilter(event.target.value)}
              value={typeFilter}
            >
              <option value="all">Tous les types</option>
              {shipTypes.map((shipType) => <option key={shipType} value={shipType}>{shipType}</option>)}
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredShips.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm leading-6 text-[#91a2ae]">
                {searchQuery || typeFilter !== "all"
                  ? "Aucun navire ne correspond aux filtres."
                  : connectionStatus === "live"
                    ? "Flux actif. Aucune position reçue dans la zone pour le moment."
                    : "Les navires apparaîtront ici lorsque le flux AIS sera connecté."}
              </p>
            ) : filteredShips.map((ship) => {
              const alreadyTracked = trackedMmsis.has(ship.mmsi);
              const lastSeen = new Date(ship.receivedAt).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <article
                  className={`border-b border-white/5 px-4 py-3 ${selectedMmsi === ship.mmsi ? "bg-[#142736]" : ""}`}
                  key={ship.mmsi}
                >
                  <button className="w-full text-left" onClick={() => focusOnShip(ship)} type="button">
                    <span className="block truncate text-sm font-semibold text-white">{ship.name}</span>
                    <span className="mt-1 block text-xs text-[#91a2ae]">
                      MMSI {ship.mmsi}
                      {ship.shipType && ` · ${ship.shipType}`}
                    </span>
                    <span className="mt-1 block text-xs text-[#71838f]">
                      {ship.speedKnots === null ? "Vitesse indisponible" : `${ship.speedKnots.toFixed(1)} nd`}
                      {ship.course !== null && ` · cap ${Math.round(ship.course)}°`}
                      {` · reçu à ${lastSeen}`}
                    </span>
                    {ship.destination && (
                      <span className="mt-1 block truncate text-xs text-[#71838f]">
                        Destination déclarée : {ship.destination}
                      </span>
                    )}
                  </button>
                  <div className="mt-2 flex justify-end">
                    {alreadyTracked ? (
                      <button
                        className="text-xs font-medium text-[#45e0bd] hover:text-[#8df2d9]"
                        onClick={onOpenProspects}
                        type="button"
                      >
                        Voir dans mes prospects
                      </button>
                    ) : (
                      <button
                        className="rounded-md border border-[#45e0bd]/30 px-2.5 py-1.5 text-xs font-semibold text-[#8df2d9] hover:bg-[#45e0bd]/10 disabled:opacity-50"
                        disabled={savingMmsi === ship.mmsi}
                        onClick={() => void saveVessel(ship)}
                        type="button"
                      >
                        {savingMmsi === ship.mmsi ? "Enregistrement…" : "＋ Ajouter aux prospects"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
