import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Initialisation de la clé Mapbox
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// LES PORTS (icône ancre)
const ports = [
  { id: 1, name: "Port de Dakar", lng: -17.4676, lat: 14.7167, type: "Port" },
  { id: 2, name: "Port de Casablanca", lng: -7.6033, lat: 33.5731, type: "Port" },
  { id: 3, name: "Port du Cap", lng: 18.4241, lat: -33.9249, type: "Port" },
  { id: 4, name: "Port d'Abidjan", lng: -4.0083, lat: 5.3600, type: "Port" },
  { id: 5, name: "Port de Mombasa", lng: 39.6682, lat: -4.0435, type: "Port" },
  { id: 6, name: "Port de Tema (Ghana)", lng: -0.1870, lat: 5.6037, type: "Port" },
  { id: 7, name: "Port de Lagos (Nigeria)", lng: 3.3792, lat: 6.5244, type: "Port" },
  { id: 8, name: "Terminal - Pointe-Noire", lng: 11.8636, lat: -4.7692, type: "Port" }
];

// LES NAVIRES EN MER
const ships = [
  { id: 101, name: "MSC AURORA", lng: -8.5, lat: 10.2, type: "Porte-conteneurs", speed: "14 nœuds", destination: "Lagos" },
  { id: 102, name: "MAERSK SENEGAL", lng: -15.2, lat: 18.5, type: "Cargo", speed: "12 nœuds", destination: "Dakar" },
  { id: 103, name: "CMA CGM AFRIQUE", lng: 5.8, lat: 2.1, type: "Porte-conteneurs", speed: "16 nœuds", destination: "Pointe-Noire" },
  { id: 104, name: "TANKER NIGERIA", lng: 2.5, lat: 4.8, type: "Pétrolier", speed: "10 nœuds", destination: "Lagos" },
  { id: 105, name: "BULK CARRIER GHANA", lng: -2.3, lat: 4.2, type: "Vraquier", speed: "11 nœuds", destination: "Tema" }
];

// Fonction pour créer l'icône ancre (port)
function createAnchorIcon() {
  const el = document.createElement('div');
  el.className = 'custom-marker anchor-marker';
  el.innerHTML = '⚓';
  el.style.fontSize = '32px';
  el.style.filter = 'drop-shadow(0px 4px 6px rgba(0,0,0,0.6))';
  el.style.cursor = 'pointer';
  el.style.transform = 'translate(-50%, -100%)';
  return el;
}

// Fonction pour créer l'icône navire néon (SVG)
function createShipIcon() {
  const el = document.createElement('div');
  el.className = 'custom-marker ship-marker';
  el.innerHTML = `
    <svg viewBox="0 0 500 500" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" result="blur1"></feGaussianBlur>
          <feGaussianBlur stdDeviation="18" result="blur2"></feGaussianBlur>
          <feMerge>
            <feMergeNode in="blur2"></feMergeNode>
            <feMergeNode in="blur1"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
        <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="blur"></feGaussianBlur>
          <feMerge>
            <feMergeNode in="blur"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
        <radialGradient id="bgGrad" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stop-color="#005B82"></stop>
          <stop offset="50%" stop-color="#00243A"></stop>
          <stop offset="100%" stop-color="#000D1A"></stop>
        </radialGradient>
        <radialGradient id="sunGlow" cx="50%" cy="45%" r="40%">
          <stop offset="0%" stop-color="#80F5FF" stop-opacity="0.9"></stop>
          <stop offset="40%" stop-color="#00E5FF" stop-opacity="0.4"></stop>
          <stop offset="100%" stop-color="#001220" stop-opacity="0"></stop>
        </radialGradient>
        <linearGradient id="hullLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#00B4D8"></stop>
          <stop offset="100%" stop-color="#00405C"></stop>
        </linearGradient>
        <linearGradient id="hullRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#70F3FF"></stop>
          <stop offset="60%" stop-color="#00B4D8"></stop>
          <stop offset="100%" stop-color="#00557A"></stop>
        </linearGradient>
        <linearGradient id="cabinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#B2F8FF"></stop>
          <stop offset="100%" stop-color="#00A3C4"></stop>
        </linearGradient>
        <linearGradient id="waveFrontGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#00F0FF"></stop>
          <stop offset="50%" stop-color="#00A3C4"></stop>
          <stop offset="100%" stop-color="#003B5C"></stop>
        </linearGradient>
        <linearGradient id="waveBackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#005B82"></stop>
          <stop offset="100%" stop-color="#00192B"></stop>
        </linearGradient>
        <linearGradient id="lightBeam" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"></stop>
          <stop offset="100%" stop-color="#00E5FF" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <circle cx="250" cy="250" r="220" fill="url(#bgGrad)"></circle>
      <circle id="glowSphere" cx="250" cy="220" r="130" fill="url(#sunGlow)" filter="url(#neonGlow)"></circle>
      <polygon points="250,90 220,250 280,250" fill="url(#lightBeam)" opacity="0.25"></polygon>
      <circle cx="250" cy="250" r="220" fill="none" stroke="#00E5FF" stroke-width="3" opacity="0.4"></circle>
      <circle id="outerRing" cx="250" cy="250" r="210" fill="none" stroke="#00F0FF" stroke-width="5" filter="url(#softGlow)" opacity="0.8"></circle>
      <circle cx="250" cy="250" r="198" fill="none" stroke="#005B82" stroke-width="1.5" opacity="0.6"></circle>
      <path d="M 30 290 Q 140 255, 250 290 T 470 290 L 470 450 L 30 450 Z" fill="url(#waveBackGrad)" opacity="0.9"></path>
      <rect x="246" y="85" width="8" height="50" fill="#E0FFFF" filter="url(#softGlow)" rx="2"></rect>
      <rect x="225" y="110" width="50" height="6" fill="#70F3FF" filter="url(#softGlow)" rx="2"></rect>
      <circle cx="250" cy="85" r="7" fill="#FFFFFF" filter="url(#neonGlow)"></circle>
      <polygon points="215,150 285,150 280,180 220,180" fill="url(#cabinGrad)"></polygon>
      <line x1="215" y1="150" x2="285" y2="150" stroke="#FFFFFF" stroke-width="3" filter="url(#softGlow)"></line>
      <polygon points="198,185 302,185 294,230 206,230" fill="url(#cabinGrad)"></polygon>
      <polygon points="206,196 294,196 292,208 208,208" fill="#001B2E"></polygon>
      <line x1="208" y1="202" x2="292" y2="202" stroke="#60F5FF" stroke-width="4" filter="url(#softGlow)"></line>
      <polygon points="250,235 145,300 182,410 250,410" fill="url(#hullLeftGrad)"></polygon>
      <polygon points="250,235 355,300 318,410 250,410" fill="url(#hullRightGrad)"></polygon>
      <line x1="250" y1="232" x2="250" y2="412" stroke="#FFFFFF" stroke-width="4" filter="url(#neonGlow)"></line>
      <polygon points="250,235 355,300 335,340 250,285" fill="#FFFFFF" opacity="0.25"></polygon>
      <polygon points="250,235 145,300 170,335 250,280" fill="#00E5FF" opacity="0.2"></polygon>
      <path d="M 30 375 Q 150 320, 270 375 T 470 345 L 470 470 L 30 470 Z" fill="url(#waveFrontGrad)"></path>
      <path id="waveGlow" d="M 30 375 Q 150 320, 270 375 T 470 345" fill="none" stroke="#E0FFFF" stroke-width="5" filter="url(#neonGlow)"></path>
      <path d="M 30 405 Q 120 370, 220 410 T 470 390 L 470 470 L 30 470 Z" fill="#00E5FF" opacity="0.4"></path>
      <path d="M 30 425 Q 180 385, 290 435 T 470 415 L 470 470 L 30 470 Z" fill="#000D1A"></path>
    </svg>
  `;
  el.style.width = '24px';
  el.style.height = '24px';
  el.style.overflow = 'hidden';
  el.style.filter = 'drop-shadow(0px 6px 8px rgba(0, 229, 255, 0.4))'; // Lueur bleue autour du marqueur
  el.style.cursor = 'pointer';
  el.style.transform = 'translate(-50%, -100%)'; // Ancre le bas du SVG à la coordonnée
  return el;
}

export function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Initialisation de la carte (une seule fois)
  useEffect(() => {
    if (map.current) return;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current!,
      style: 'mapbox://styles/mapbox/streets-v12', 
      center: [0, 5], 
      zoom: 5 
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
  }, []);

  // Mise à jour des marqueurs à chaque changement de recherche
  useEffect(() => {
    if (!map.current) return;

    // Supprimer les anciens marqueurs
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    const query = searchTerm.toLowerCase();

    // Filtrer les données
    const filteredPorts = ports.filter(p => p.name.toLowerCase().includes(query));
    const filteredShips = ships.filter(s => s.name.toLowerCase().includes(query));

    // Ajouter les ports avec icône ancre ⚓
    filteredPorts.forEach((port) => {
      const marker = new mapboxgl.Marker({ element: createAnchorIcon() })
        .setLngLat([port.lng, port.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 25, className: 'custom-popup' }).setHTML(
            `<h3 style="margin:0; color: #333; font-size: 16px;">🏭 ${port.name}</h3><p style="margin:5px 0 0 0; color: #666;">Type: ${port.type}</p>`
          )
        )
        .addTo(map.current!);
      markersRef.current.push(marker);
    });

    // Ajouter les navires avec icône SVG néon 🚢
    filteredShips.forEach((ship) => {
      const marker = new mapboxgl.Marker({ element: createShipIcon() })
        .setLngLat([ship.lng, ship.lat])
        .setPopup(
          new mapboxgl.Popup({ offset: 30, className: 'custom-popup' }).setHTML(
            `<h3 style="margin:0; color: #005B82; font-size: 16px; font-weight: bold;">⚓ ${ship.name}</h3>
             <p style="margin:5px 0 0 0; color: #333;"><strong>Type:</strong> ${ship.type}</p>
             <p style="margin:3px 0 0 0; color: #333;"><strong>Vitesse:</strong> ${ship.speed}</p>
             <p style="margin:3px 0 0 0; color: #333;"><strong>Destination:</strong> ${ship.destination}</p>`
          )
        )
        .addTo(map.current!);
      markersRef.current.push(marker);
    });

  }, [searchTerm]);

  const totalResults = ports.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).length + 
                       ships.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase())).length;

  return (
    <div className="mt-12">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">🚢 Suivi des navires et ports</h2>
      
      {/* Barre de recherche */}
      <div className="mb-4 relative">
        <input
          type="text"
          placeholder="Rechercher un port ou un navire (ex: Pointe-Noire, MSC)..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
        />
        {searchTerm && (
          <p className="text-sm text-gray-500 mt-1">
            {totalResults} résultat(s) trouvé(s)
          </p>
        )}
      </div>

      {/* Carte */}
      <div ref={mapContainer} className="h-[500px] rounded-xl shadow-lg overflow-hidden border border-gray-200" />
      
      {/* Légende */}
      <div className="flex gap-6 mt-3 text-sm text-gray-600 items-center">
        <span className="flex items-center gap-2">
          <div style={{ width: '24px', height: '24px' }}>🚢</div> Navires en mer
        </span>
        <span className="flex items-center gap-2">
          <span style={{ fontSize: '24px' }}>⚓</span> Ports
        </span>
      </div>
    </div>
  );
}