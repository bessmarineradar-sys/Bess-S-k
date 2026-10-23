import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const ports = [
  { id: 1, name: "Port de Dakar", lng: -17.4676, lat: 14.7167 },
  { id: 2, name: "Port d'Abidjan", lng: -4.0083, lat: 5.3600 },
  { id: 3, name: "Port de Tema", lng: -0.1870, lat: 5.6037 },
  { id: 4, name: "Port de Lagos", lng: 3.3792, lat: 6.5244 },
  { id: 5, name: "Pointe-Noire", lng: 11.8636, lat: -4.7692 }
];

// 🟦 Navires de simulation (Golfe de Guinée)
const mockShips = [
  { mmsi: "636019825", name: "MSC AURORA", lng: -8.5, lat: 10.2, speed: 26, cog: 145 },
  { mmsi: "219018000", name: "MAERSK SENEGAL", lng: -15.2, lat: 12.5, speed: 22, cog: 90 },
  { mmsi: "228339600", name: "CMA CGM AFRIQUE", lng: 2.8, lat: 4.1, speed: 30, cog: 210 },
  { mmsi: "538005956", name: "TANKER NIGERIA", lng: 4.5, lat: 5.8, speed: 18, cog: 45 },
  { mmsi: "477553000", name: "BULK CARRIER GHANA", lng: -1.3, lat: 4.5, speed: 20, cog: 270 },
  { mmsi: "353136000", name: "BESS SÖK I", lng: -10.0, lat: 6.0, speed: 24, cog: 110 } // Ton propre navire !
];

type LiveShip = { mmsi: string; name: string; lng: number; lat: number; speed: number; cog: number; };

function createAnchorIcon() {
  const el = document.createElement('div');
  el.innerHTML = '⚓';
  el.style.fontSize = '24px';
  el.style.filter = 'drop-shadow(0px 0px 4px rgba(255,255,255,0.8))';
  el.style.cursor = 'pointer';
  el.style.transform = 'translate(-50%, -100%)';
  return el;
}

function createShipIcon() {
  const el = document.createElement('div');
  el.style.width = '24px';
  el.style.height = '24px';
  el.style.overflow = 'hidden';
  el.style.transform = 'translate(-50%, -100%)';
  el.innerHTML = `
    <svg viewBox="0 0 500 500" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur1"></feGaussianBlur>
          <feMerge><feMergeNode in="blur1"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
        </filter>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#005B82"></stop><stop offset="100%" stop-color="#000D1A"></stop>
        </radialGradient>
        <linearGradient id="hullGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#70F3FF"></stop><stop offset="100%" stop-color="#00557A"></stop>
        </linearGradient>
      </defs>
      <circle cx="250" cy="250" r="220" fill="url(#bgGrad)"></circle>
      <circle cx="250" cy="250" r="210" fill="none" stroke="#00F0FF" stroke-width="5" filter="url(#neonGlow)" opacity="0.8"></circle>
      <polygon points="250,235 145,300 182,410 250,410" fill="url(#hullGrad)"></polygon>
      <polygon points="250,235 355,300 318,410 250,410" fill="url(#hullGrad)"></polygon>
      <line x1="250" y1="232" x2="250" y2="412" stroke="#FFFFFF" stroke-width="4" filter="url(#neonGlow)"></line>
    </svg>
  `;
  return el;
}
export function LiveMapDemo() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Record<string, mapboxgl.Marker>>({});
  
  const [ships, setShips] = useState<Record<string, LiveShip>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);

  useEffect(() => {
    if (map.current) return;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [0, 5],
      zoom: 5
    });
    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

    ports.forEach((port) => {
      new mapboxgl.Marker({ element: createAnchorIcon() })
        .setLngLat([port.lng, port.lat])
        .setPopup(new mapboxgl.Popup().setHTML(`<h3 style="color:#fff; margin:0;">🏭 ${port.name}</h3>`))
        .addTo(map.current!);
    });

    // Charger les navires de simulation
    const initialShips: Record<string, LiveShip> = {};
    mockShips.forEach(ship => {
      initialShips[ship.mmsi] = ship;
      const marker = new mapboxgl.Marker({ element: createShipIcon(), rotationAlignment: 'map', pitchAlignment: 'map' })
        .setLngLat([ship.lng, ship.lat])
        .setRotation(ship.cog)
        .setPopup(
          new mapboxgl.Popup({ offset: 10 }).setHTML(`
            <div style="min-width: 120px; color: #fff; background: #111; padding: 8px; border-radius: 6px; border: 1px solid #333;">
              <h3 style="margin:0; color:#70F3FF; font-weight:bold; font-size:13px;">⚓ ${ship.name}</h3>
              <p style="margin:4px 0 0 0; font-size:11px; color: #ccc;">Vitesse: ${ship.speed} km/h</p>
              <p style="margin:2px 0 0 0; font-size:11px; color: #ccc;">Cap: ${ship.cog}°</p>
            </div>
          `)
        )
        .addTo(map.current!);
      markersRef.current[ship.mmsi] = marker;
    });
    setShips(initialShips);

  }, []);

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
        <h2 className="text-2xl font-bold text-gray-800">📡 Suivi Radar Bess Sök (Simulation)</h2>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          Mode Démo (6 navires)
        </div>
      </div>

      <div className="flex gap-4 h-[600px]">
        <div className="flex-1 relative">
          <div ref={mapContainer} className="w-full h-full rounded-xl shadow-lg overflow-hidden border border-gray-700" />
        </div>

        <div className="w-[320px] bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col overflow-hidden">
          <div className="bg-blue-900 text-white px-4 py-3 flex justify-between items-center">
            <h3 className="font-semibold text-sm"> Navires en vue</h3>
            <span className="bg-blue-700 text-xs px-2 py-0.5 rounded-full">{filteredShips.length}</span>
          </div>
          <div className="p-3 border-b border-gray-100">
            <input type="text" placeholder="Rechercher un navire..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredShips.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Aucun navire ne correspond.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredShips.map((ship) => (
                  <button key={ship.mmsi} onClick={() => focusOnShip(ship.mmsi)} className={`w-full px-4 py-3 text-left hover:bg-blue-50 transition-colors group ${selectedMmsi === ship.mmsi ? 'bg-blue-100 border-l-4 border-blue-600' : ''}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium text-sm truncate ${selectedMmsi === ship.mmsi ? 'text-blue-800' : 'text-gray-900'}`}>{ship.name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">MMSI: {ship.mmsi}</p>
                      </div>
                      <div className="text-right ml-2">
                        <p className="text-xs font-semibold text-blue-600">{ship.speed} km/h</p>
                        <p className="text-[10px] text-gray-400">Cap: {ship.cog}°</p>
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