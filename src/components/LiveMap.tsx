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
  { name: "Port de Douala", longitude: 9.692, latitude: 4.0511 },
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
  onConnectionChange: (connection: { status: ConnectionStatus; message: string }) => void;
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
  content.className = "vessel-popup";
  const title = document.createElement("h3");
  title.textContent = ship.name;
  const details = document.createElement("dl");
  const rows = [
    ["MMSI", ship.mmsi],
    ["Vitesse", ship.speedKnots === null ? "Indisponible" : `${ship.speedKnots.toFixed(1)} nd`],
    ["Cap", ship.course === null ? "Indisponible" : `${Math.round(ship.course)}°`],
  ];
  for (const [label, value] of rows) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = value;
    row.append(term, description);
    details.append(row);
  }
  content.append(title, details);
  if (ship.destination) {
    const destination = document.createElement("p");
    destination.style.cssText = "margin:8px 0 0;color:#9aabb7;font-size:10px";
    destination.textContent = `Destination AIS : ${ship.destination}`;
    content.append(destination);
  }
  return content;
}

function vesselColor(shipType: string | null) {
  const type = shipType?.toLocaleLowerCase("fr") ?? "";
  if (type.includes("tanker") || type.includes("oil") || type.includes("lng")) return "#ffb768";
  if (type.includes("passenger") || type.includes("passager")) return "#d0a3ff";
  if (type.includes("cargo") || type.includes("container") || type.includes("bulk")) return "#61b8ff";
  return "#45e0bd";
}

function createVesselMarker(ship: LiveShip, selected: boolean) {
  const element = document.createElement("div");
  element.className = `live-vessel-marker ship-marker${selected ? " selected" : ""}`;
  element.style.cssText = `width:24px;height:24px;overflow:hidden;display:grid;place-items:center;border:1px solid ${selected ? "#e8fff8" : "#0b1926"};border-radius:50%;background:#0b1926;color:${vesselColor(ship.shipType)};box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer`;
  element.setAttribute("aria-label", `Navire ${ship.name}, MMSI ${ship.mmsi}`);
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("width", "16");
  icon.setAttribute("height", "16");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  icon.style.cssText = "width:16px;height:16px;overflow:hidden;fill:currentColor";
  const hull = document.createElementNS("http://www.w3.org/2000/svg", "path");
  hull.setAttribute("d", "M12 2 20 20 12 17 4 20 12 2Z");
  hull.setAttribute("fill", "currentColor");
  icon.append(hull);
  element.append(icon);
  return element;
}

interface SpeedSample {
  at: number;
  speed: number;
}

export default function LiveMap({
  session,
  trackedMmsis,
  onSaveVessel,
  onOpenProspects,
  onConnectionChange,
}: LiveMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const speedHistoryRef = useRef<Record<string, SpeedSample[]>>({});
  const [ships, setShips] = useState<Record<string, LiveShip>>({});
  const [speedHistory, setSpeedHistory] = useState<Record<string, SpeedSample[]>>({});
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
        style: "mapbox://styles/mapbox/dark-v11",
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
        new mapboxgl.Marker({ color: "#45e0bd" })
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
      speedHistoryRef.current = {};
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
          if (ship.speedKnots !== null && Number.isFinite(ship.speedKnots)) {
            const sample = { at: Date.parse(ship.receivedAt), speed: ship.speedKnots };
            const history = [...(speedHistoryRef.current[ship.mmsi] ?? []), sample].slice(-24);
            speedHistoryRef.current[ship.mmsi] = history;
            setSpeedHistory((current) => ({ ...current, [ship.mmsi]: history }));
          }
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
        existing.getElement().classList.toggle("selected", ship.mmsi === selectedMmsi);
        existing.getElement().style.borderColor = ship.mmsi === selectedMmsi ? "#e8fff8" : "#0b1926";
        existing.getElement().style.color = vesselColor(ship.shipType);
        existing.setPopup(new mapboxgl.Popup({ offset: 14 }).setDOMContent(createVesselPopup(ship)));
        continue;
      }
      const element = createVesselMarker(ship, ship.mmsi === selectedMmsi);
      markersRef.current[ship.mmsi] = new mapboxgl.Marker({
        element,
        rotationAlignment: "map",
      })
        .setLngLat(coordinates)
        .setRotation(ship.course ?? 0)
        .setPopup(new mapboxgl.Popup({ offset: 14 }).setDOMContent(createVesselPopup(ship)))
        .addTo(map.current);
    }
  }, [ships, selectedMmsi]);

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

  const selectedShip = selectedMmsi ? ships[selectedMmsi] ?? null : null;
  const selectedHistory = selectedShip ? speedHistory[selectedShip.mmsi] ?? [] : [];
  const radarShips = useMemo(() => Object.values(ships), [ships]);

  const focusOnShip = useCallback((ship: LiveShip) => {
    setSelectedMmsi(ship.mmsi);
    map.current?.flyTo({ center: [ship.longitude, ship.latitude], zoom: 9, duration: 900 });
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

  useEffect(() => {
    onConnectionChange({ status, message: statusMessage });
  }, [onConnectionChange, status, statusMessage]);

  useEffect(() => {
    const visible = new Set(filteredShips.map((ship) => ship.mmsi));
    for (const [mmsi, marker] of Object.entries(markersRef.current)) {
      marker.getElement().classList.toggle("filtered-out", !visible.has(mmsi));
    }
  }, [filteredShips]);

  return (
    <>
      <section aria-label="Carte AIS de la côte ouest-africaine" className="map-stage">
        <div aria-label="Carte des navires AIS entre Dakar et Pointe-Noire" id="map" ref={mapContainer} />
        <div className="map-heading">
          <span className="eyebrow">SUIVI MARITIME · AIS</span>
          <h1>Prospection en mer</h1>
          <p>Côte ouest-africaine · jusqu’à Pointe-Noire</p>
        </div>
        <label className="search-wrap">
          <span aria-hidden="true" className="search-icon">⌕</span>
          <span className="sr-only">Rechercher un navire</span>
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Nom, MMSI, destination…"
            type="search"
            value={searchQuery}
          />
        </label>
        <div aria-label="Filtrer par type de navire" className="map-toolbar">
          <button
            aria-pressed={typeFilter === "all"}
            className={`filter-chip ${typeFilter === "all" ? "selected" : ""}`}
            onClick={() => setTypeFilter("all")}
            type="button"
          >
            <span aria-hidden="true" className="chip-dot all-dot" /> Tous
            <span>{Object.keys(ships).length}</span>
          </button>
          {shipTypes.map((shipType) => (
            <button
              aria-pressed={typeFilter === shipType}
              className={`filter-chip ${typeFilter === shipType ? "selected" : ""}`}
              key={shipType}
              onClick={() => setTypeFilter(shipType)}
              type="button"
            >
              <span aria-hidden="true" className="chip-dot cargo-dot" />
              {shipType}
              <span>{Object.values(ships).filter((ship) => ship.shipType === shipType).length}</span>
            </button>
          ))}
        </div>
        {mapError && <p role="alert" className="map-error-note">{mapError}</p>}
        {saveError && <p role="alert" className="map-error-note">{saveError}</p>}
        <div className="map-attribution-note">
          <span aria-hidden="true" className="map-locate-dot" />
          <strong>{Object.keys(ships).length}</strong>
          <span>contacts AIS reçus dans la zone</span>
        </div>
        <section
          aria-label={`Radar schématique : ${radarShips.length} dernières positions AIS reçues`}
          className="radar-card"
          role="img"
        >
          <div className="radar-header">
            <div>
              <span className="radar-kicker"><span aria-hidden="true" className="radar-live-dot" /> CONTACTS AIS</span>
              <strong>Vue de zone</strong>
            </div>
          </div>
          <div className="radar">
            <div className="radar-range range-outer" />
            <div className="radar-range range-middle" />
            <div className="radar-range range-inner" />
            <span aria-hidden="true" className="radar-crosshair crosshair-x" />
            <span aria-hidden="true" className="radar-crosshair crosshair-y" />
            <span aria-hidden="true" className="radar-sweep" />
            {radarShips.map((ship) => {
              const left = ((ship.longitude - TRACKING_REGION.west) / (TRACKING_REGION.east - TRACKING_REGION.west)) * 100;
              const top = ((TRACKING_REGION.north - ship.latitude) / (TRACKING_REGION.north - TRACKING_REGION.south)) * 100;
              return (
                <span
                  aria-hidden="true"
                  className="radar-contact"
                  key={ship.mmsi}
                  style={{ left: `${left}%`, top: `${top}%` }}
                  title={`${ship.name} · MMSI ${ship.mmsi}`}
                />
              );
            })}
            <span aria-hidden="true" className="radar-center" />
          </div>
          <div className="radar-footer">
            <span>Contacts affichés</span>
            <strong>{radarShips.length}</strong>
          </div>
          <p className="radar-disclaimer">Positions AIS reçues · vue schématique, pas un radar côtier</p>
        </section>
        <div className="map-legend">
          <span className="legend-title">LÉGENDE</span>
          <span><i className="legend-dot moving" />Position AIS</span>
          <span><i className="legend-dot anchored" />Port</span>
        </div>
      </section>

      <aside aria-label="Contacts et détails AIS" className="details-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">SURVEILLANCE</span>
            <h2>Trafic maritime</h2>
          </div>
          <button
            aria-label="Réinitialiser les filtres"
            className="panel-menu"
            onClick={() => {
              setSearchQuery("");
              setTypeFilter("all");
              setSelectedMmsi(null);
            }}
            type="button"
          >↺</button>
        </div>
        <div className="zone-summary">
          <span aria-hidden="true" className="zone-icon">⌖</span>
          <span className="zone-copy">
            <strong>Golfe de Guinée → Pointe-Noire</strong>
            <span>Dernières positions du relais AIS</span>
          </span>
        </div>
        <div className="traffic-summary">
          <div><strong>{radarShips.length}</strong><span>CONTACTS REÇUS</span></div>
          <div><strong>{radarShips.filter((ship) => ship.speedKnots !== null && ship.speedKnots > 0.5).length}</strong><span>EN MOUVEMENT</span></div>
          <div><strong>{radarShips.filter((ship) => trackedMmsis.has(ship.mmsi)).length}</strong><span>EN PROSPECT</span></div>
        </div>
        <div className="vessel-list-header">
          <span>NAVIRES REÇUS <span className="list-count">{filteredShips.length}</span></span>
          <button onClick={() => setTypeFilter("all")} type="button">TOUS LES TYPES</button>
        </div>
        <div aria-live="polite" className="vessel-list">
          {filteredShips.length === 0 ? (
            <p className="empty-state">
              {searchQuery || typeFilter !== "all"
                ? "Aucun navire ne correspond aux filtres."
                : connectionStatus === "live"
                  ? "Flux connecté. Aucune position AIS reçue dans la zone pour le moment."
                  : "Les navires apparaîtront ici dès réception de positions AIS réelles."}
            </p>
          ) : filteredShips.map((ship) => {
            const selected = selectedMmsi === ship.mmsi;
            const lastSeenAt = Date.parse(ship.receivedAt);
            const lastSeen = Number.isFinite(lastSeenAt)
              ? new Date(lastSeenAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
              : "inconnue";
            const statusClass = ship.speedKnots !== null && ship.speedKnots <= 0.5 ? "anchored" : "moving";
            const iconClass = ship.speedKnots !== null && ship.speedKnots <= 0.5
              ? "anchored"
              : ship.shipType?.toLocaleLowerCase("fr").includes("tanker")
                ? "tanker"
                : ship.shipType?.toLocaleLowerCase("fr").includes("passenger")
                  ? "passenger"
                  : "cargo";
            return (
              <button
                aria-pressed={selected}
                className={`vessel-row ${selected ? "active" : ""}`}
                key={ship.mmsi}
                onClick={() => focusOnShip(ship)}
                type="button"
              >
                <span aria-hidden="true" className={`vessel-type-icon ${iconClass}`}>
                  <svg viewBox="0 0 24 24"><path d="M12 2 20 20 12 17 4 20 12 2Z" fill="currentColor" /></svg>
                </span>
                <span className="vessel-copy">
                  <strong>{ship.name}</strong>
                  <span><i className={`vessel-status ${statusClass}`} />{ship.shipType || `MMSI ${ship.mmsi}`}</span>
                </span>
                <span className="vessel-distance">
                  {ship.speedKnots === null ? "—" : `${ship.speedKnots.toFixed(1)} nd`}
                  <small>{lastSeen}</small>
                </span>
              </button>
            );
          })}
        </div>
        {selectedShip && (
          <section aria-label={`Détails AIS de ${selectedShip.name}`} className="selected-vessel">
            <div className="selected-topline">
              <span>DÉTAILS · POSITION REÇUE</span>
              <button aria-label="Fermer les détails" onClick={() => setSelectedMmsi(null)} type="button">×</button>
            </div>
            <div className="selected-identity">
              <span aria-hidden="true" className="selected-ship-icon">⌖</span>
              <div>
                <h3>{selectedShip.name}</h3>
                <span>{selectedShip.shipType || "Type AIS non renseigné"} · MMSI {selectedShip.mmsi}</span>
              </div>
            </div>
            <div className="selected-data">
              <div><span>VITESSE</span><strong>{selectedShip.speedKnots === null ? "—" : `${selectedShip.speedKnots.toFixed(1)} nd`}</strong></div>
              <div><span>CAP</span><strong>{selectedShip.course === null ? "—" : `${Math.round(selectedShip.course)}°`}</strong></div>
              <div><span>POSITIONS</span><strong>{selectedHistory.length}</strong></div>
            </div>
            <div className="selected-destination">
              <span>DESTINATION AIS</span>
              <strong>{selectedShip.destination || "Non renseignée"}</strong>
            </div>
            <div className="selected-destination">
              <span>COORDONNÉES</span>
              <strong>{selectedShip.latitude.toFixed(3)}°, {selectedShip.longitude.toFixed(3)}°</strong>
            </div>
            <div className="telemetry">
              <div className="telemetry-heading">
                <span>HISTORIQUE DE VITESSE</span>
                <small>Session en cours</small>
              </div>
              {selectedHistory.length > 1 ? (
                <svg aria-label="Historique réel des vitesses reçues depuis cette session" className="telemetry-chart" role="img" viewBox="0 0 160 48" preserveAspectRatio="none">
                  <polyline
                    fill="none"
                    points={selectedHistory.map((sample, index) => {
                      const x = (index / (selectedHistory.length - 1)) * 156 + 2;
                      const maximum = Math.max(1, ...selectedHistory.map((item) => item.speed));
                      const y = 44 - (sample.speed / maximum) * 38;
                      return `${x},${y}`;
                    }).join(" ")}
                    stroke="#45e0bd"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : (
                <p className="telemetry-empty">L’historique se construit à mesure que de nouvelles positions AIS arrivent.</p>
              )}
            </div>
            <button
              className="track-button"
              disabled={savingMmsi === selectedShip.mmsi}
              onClick={() => {
                if (trackedMmsis.has(selectedShip.mmsi)) onOpenProspects();
                else void saveVessel(selectedShip);
              }}
              type="button"
            >
              <span aria-hidden="true">{trackedMmsis.has(selectedShip.mmsi) ? "✓" : "+"}</span>
              <span>{trackedMmsis.has(selectedShip.mmsi)
                ? "Consulter la fiche prospect"
                : savingMmsi === selectedShip.mmsi ? "Enregistrement…" : "Ajouter aux prospects"}</span>
              <span aria-hidden="true">→</span>
            </button>
          </section>
        )}
        <p className="panel-footnote"><span aria-hidden="true" className="footnote-info">i</span>Positions déclarées par AIS, susceptibles d’être retardées ou incomplètes.</p>
      </aside>
    </>
  );
}
