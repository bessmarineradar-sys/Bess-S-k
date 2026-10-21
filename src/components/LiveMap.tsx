import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const AIS_STREAM_API_KEY = import.meta.env.VITE_AIS_STREAM_API_KEY;

const ports = [
  { id: 1, name: "Port de Dakar", lng: -17.4676, lat: 14.7167, type: "Port" },
  { id: 2, name: "Port d'Abidjan", lng: -4.0083, lat: 5.3600, type: "Port" },
  { id: 3, name: "Port de Tema (Ghana)", lng: -0.1870, lat: 5.6037, type: "Port" },
  { id: 4, name: "Port de Lagos (Nigeria)", lng: 3.3792, lat: 6.5244, type: "Port" },
  { id: 5, name: "Terminal - Pointe-Noire", lng: 11.8636, lat: -4.7692, type: "Port" }
];

type LiveShip = {
  mmsi: string;
  name: string;
  lng: number;
  lat: number;
  speed: number;
  cog: number;
};

function createAnchorIcon() {
  const el = document.createElement('div');
  el.innerHTML = '';
  el.style.fontSize = '24px';
  el.style.filter = 'drop-shadow(0px 2px 3px rgba(0,0,0,0.5))';
  el.style.cursor = 'pointer';
  el.style.transform = 'translate(-50%, -100%)';
  return el;
}

function createShipIcon() {
  const el = document.createElement('div');
  el.innerHTML = `
    <svg viewBox="0 0 500 500" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur1"></feGaussianBlur>
          <feMerge><feMergeNode in="blur1"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
        </filter>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#005B82"></stop>
          <stop offset="100%" stop-color="#000D1A"></stop>
        </radialGradient>
        <linearGradient id="hullGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#70F3FF"></stop>
          <stop offset="100%" stop-color="#00557A"></stop>
        </linearGradient>
      </defs>
      <circle cx="250" cy="250" r="220" fill="url(#bgGrad)"></circle>
      <circle cx="250" cy="250" r="210" fill="none" stroke="#00F0FF" stroke-width="5" filter="url(#neonGlow)" opacity="0.8"></circle>
      <polygon points="250,235 145,300 182,410 250,410" fill="url(#hullGrad)"></polygon>
      <polygon points="250,235 355,300 318,410 250,410" fill="url(#hullGrad)"></polygon>
      <line x1="250" y1="232" x2="250" y2="412" stroke="#FFFFFF" stroke-width="4" filter="url(#neonGlow)"></line>
    </svg>
  `;
  el.style.width = '24px';
  el.style.height = '24px';
  el.style.overflow = 'hidden';
  el.style.cursor = 'pointer';
  el.style.transform = 'translate(-50%, -100%)';
  return el;
}

export function LiveMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  const [ships, setShips] = useState<Record<string, LiveShip>>({});
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);

  useEffect(() => {
    if (map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style: 'mapbox://styles/mapbox/streets-v12', 
      center: [0, 5], 
      zoom: 5 
    });
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    ports.forEach((port) => {
      new mapboxgl.Marker({ element: createAnchorIcon() })
        .setLngLat([port.lng, port.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<h3 style="color:#333;">🏭 ${port.name}</h3>`))
        .addTo(map.current!);
    });
  }, []);

  useEffect(() => {
    if (!AIS_STREAM_API_KEY) {
      setConnectionStatus('error');
      return;
    }

    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

    ws.onopen = () => {
      setConnectionStatus('live');
      ws.send(JSON.stringify({
        APIKey: AIS_STREAM_API_KEY,
        FilterRegion: { StartLatitude: -10, EndLatitude: 20, StartLongitude: -25, EndLongitude: 20 },
        FiltersShipMMSI: [],
        FiltersShipType: []
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.MessageType === 'ShipPosition') {
        const meta = data.MetaData;
        const content = data.Content;
        
        const ship: LiveShip = {
          mmsi: meta.MMSI,
          name: meta.ShipName || 'INCONNU',
          lng: content.Position.Longitude,
          lat: content.Position.Latitude,
          speed: Math.round(content.SOG * 1.852),
          cog: content.COG || 0
        };

        // ✅ FILTRE ANTI-DÉSERT & FANTÔMES
        // Ignore les coordonnées 0,0 (milieu de l'océan Atlantique, souvent des erreurs)
        if (Math.abs(ship.lat) < 0.1 && Math.abs(ship.lng) < 0.1) return;
        // Ignore les navires clairement au milieu des terres (Sahara/Afrique centrale)
        if (ship.lat > 12 && ship.lng > -10 && ship.lng < 15) return;

        setShips(prev => {
          const newShips = { ...prev, [ship.mmsi]: ship };
          updateMapMarkers(newShips);
          return newShips;
        });
      }
    };

    ws.onerror = () => setConnectionStatus('error');
    ws.onclose = () => setConnectionStatus('error');
    return () => ws.close();
  }, []);

  const updateMapMarkers = (currentShips: Record<string, LiveShip>) => {
    if (!map.current) return;
    const currentMMSIs = new Set(Object.keys(currentShips));
    const oldMMSIs = new Set(Object.keys(markersRef.current));

    oldMMSIs.forEach(mmsi => {
      if (!currentMMSIs.has(mmsi)) {
        markersRef.current[mmsi].remove();
        delete markersRef.current[mmsi];
      }
    });

    currentMMSIs.forEach(mmsi => {
      const ship = currentShips[mmsi];
      if (markersRef.current[mmsi]) {
        markersRef.current[mmsi].setLngLat([ship.lng, ship.lat]);
        markersRef.current[mmsi].setRotation(ship.cog);
      } else {
        const marker = new mapboxgl.Marker({ 
          element: createShipIcon(),
          rotationAlignment: 'map',
          pitchAlignment: 'map'
        })
          .setLngLat([ship.lng, ship.lat])
          .setRotation(ship.cog)
          .setPopup(
            new mapboxgl.Popup({ offset: 10 }).setHTML(`
              <div style="min-width: 120px;">
                <h3 style="margin:0; color:#005B82; font-weight:bold; font-size:13px;">⚓ ${ship.name}</h3>
                <p style="margin:3px 0 0 0; color:#333; font-size:11px;">Vitesse: ${ship.speed} km/h | Cap: ${Math.round(ship.cog)}°</p>
              </div>
            `)
          )
          .addTo(map.current!);
        markersRef.current[mmsi] = marker;
      }
    });
  };

  const focusOnShip = (mmsi: string) => {
    const ship = ships[mmsi];
    if (ship && map.current) {
      setSelectedMmsi(mmsi);
      map.current.flyTo({ center: [ship.lng, ship.lat], zoom: 10, duration: 1500 });
      markersRef.current[mmsi]?.getPopup()?.addTo(map.current);
    }
  };

  const sortedShips = Object.values(ships).sort((a, b) => a.name.localeCompare(b.name));
  const filteredShips = sortedShips.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">📡 Suivi AIS en temps réel</h2>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-sm font-medium">
          <span className={`w-2 h-2 rounded-full ${connectionStatus === 'live' ? 'bg-green-500 animate-pulse' : connectionStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
          {connectionStatus === 'live' ? 'Connecté (Live)' : connectionStatus === 'connecting' ? 'Connexion...' : 'Erreur API'}
        </div>
      </div>

      <div className="flex gap-4 h-[600px]">
        <div className="flex-1 relative">
          <div ref={mapContainer} className="w-full h-full rounded-xl shadow-lg overflow-hidden border border-gray-200" />
        </div>

        <div className="w-[320px] bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden">
          <div className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center">
            <h3 className="font-semibold text-sm">🚢 Navires en vue</h3>
            <span className="bg-blue-700 text-xs px-2 py-0.5 rounded-full">{filteredShips.length}</span>
          </div>
          
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              placeholder="Rechercher un navire..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {filteredShips.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                {searchQuery ? 'Aucun navire ne correspond.' : 'En attente de données...'}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredShips.map((ship) => (
                  <button
                    key={ship.mmsi}
                    onClick={() => focusOnShip(ship.mmsi)}
                    className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors group ${selectedMmsi === ship.mmsi ? 'bg-blue-100 border-l-4 border-blue-600' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${selectedMmsi === ship.mmsi ? 'text-blue-800' : 'text-gray-900'}`}>{ship.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">MMSI: {ship.mmsi}</p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-xs font-semibold text-blue-600">{ship.speed} km/h</p>
                        <p className="text-[10px] text-gray-400">Cap: {Math.round(ship.cog)}°</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}