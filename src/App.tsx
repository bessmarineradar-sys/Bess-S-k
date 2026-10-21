import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DocumentForm } from "./components/DocumentForm";
import { DocumentList } from "./components/DocumentList";
import LiveMap from "./components/LiveMap";
import ProspectsPage from "./components/ProspectsPage";
import AuthScreen from "./components/AuthScreen";
import shipLogo from "./components/ShipLogo.svg";
import { useDocuments } from "./hooks/useDocuments";
import { useProspects } from "./hooks/useProspects";
import { supabase } from "./lib/supabase";
import type { Prospect } from "./types/prospect";

type Page = "map" | "prospects" | "documents";

const pageLabels: Record<Page, string> = {
  map: "Carte & navires",
  prospects: "Mes prospects",
  documents: "Mes documents",
};

function quoteCsv(value: string | null | undefined) {
  const safeValue = value ?? "";
  const protectedValue = /^[\s]*[=+\-@]/.test(safeValue)
    ? `'${safeValue}`
    : safeValue;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

function exportProspects(prospects: Prospect[]) {
  const rows = [
    ["Nom du navire", "MMSI", "Type AIS", "Destination déclarée", "Compagnie / contact", "Statut", "Notes", "Créé le", "Modifié le"],
    ...prospects.map((prospect) => [
      prospect.vesselName,
      prospect.mmsi,
      prospect.vesselType ?? "",
      prospect.destination ?? "",
      prospect.company,
      prospect.status,
      prospect.notes,
      prospect.createdAt,
      prospect.updatedAt,
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map((cell) => quoteCsv(String(cell))).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `bess-sok-prospects-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function LoadingScreen() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07131f] text-sm text-[#b3c1ca]">
      Vérification de votre session…
    </main>
  );
}

type LiveConnection = {
  status: "connecting" | "live" | "error" | "unavailable";
  message: string;
};

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(supabase));
  const [activePage, setActivePage] = useState<Page>("map");
  const [authError, setAuthError] = useState<string | null>(null);
  const [liveConnection, setLiveConnection] = useState<LiveConnection>({
    status: "connecting",
    message: "Initialisation du flux AIS…",
  });
  const documents = useDocuments();
  const prospectState = useProspects(session);
  const trackedMmsis = useMemo(
    () => new Set(prospectState.prospects.map((prospect) => prospect.mmsi)),
    [prospectState.prospects],
  );

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(`Vérification de session impossible : ${error.message}`);
      setSession(data.session);
      setIsCheckingSession(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsCheckingSession(false);
      setAuthError(null);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isCheckingSession) return <LoadingScreen />;
  if (!supabase || !session) return <AuthScreen />;

  async function signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(`Déconnexion impossible : ${error.message}`);
  }

  const pageButtons: { page: Page; icon: string }[] = [
    { page: "map", icon: "⌖" },
    { page: "prospects", icon: "◉" },
    { page: "documents", icon: "▤" },
  ];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a aria-label="Bess Sök, accueil" className="brand" href="#" onClick={(event) => {
          event.preventDefault();
          setActivePage("map");
        }}>
          <img src={shipLogo} alt="" aria-hidden="true" />
          <span className="brand-name">Bess <span>Sök</span></span>
        </a>
        <p className="sidebar-caption">ESPACE DE TRAVAIL</p>
        <nav aria-label="Navigation principale" className="side-nav">
          {pageButtons.map(({ page, icon }) => (
            <button
              aria-current={activePage === page ? "page" : undefined}
              className={`nav-link ${activePage === page ? "active" : ""}`}
              key={page}
              onClick={() => setActivePage(page)}
              type="button"
            >
              <span aria-hidden="true" className="nav-icon">{icon}</span>
              <span>{pageLabels[page]}</span>
              {page === "prospects" && prospectState.prospects.length > 0 && (
                <span className="nav-count">{prospectState.prospects.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span aria-hidden="true" className="demo-note-icon">i</span>
            <p><strong>Données AIS réelles</strong><br />Seules les positions reçues du relais sont affichées. Aucun navire simulé.</p>
          </div>
          <button className="profile-button" onClick={() => void signOut()} type="button" title="Se déconnecter">
            <span aria-hidden="true" className="avatar">{(session.user.email ?? "B").slice(0, 1).toUpperCase()}</span>
            <span className="profile-copy">
              <strong>{session.user.email}</strong>
              <small>Déconnexion</small>
            </span>
            <span aria-hidden="true" className="profile-more">···</span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>BESS SÖK</span>
            <span aria-hidden="true" className="breadcrumb-divider">/</span>
            <strong>{pageLabels[activePage]}</strong>
            {authError && <span role="alert" className="topbar-error">{authError}</span>}
          </div>
          <div className="topbar-actions">
            {activePage === "map" && (
              <div
                aria-live="polite"
                className={`live-status ${liveConnection.status === "live" ? "" : "offline"}`}
                title={liveConnection.message}
              >
                <span aria-hidden="true" className="status-dot" />
                {liveConnection.status === "live" ? "FLUX AIS ACTIF" : liveConnection.status === "connecting" ? "CONNEXION AIS" : "AIS INDISPONIBLE"}
              </div>
            )}
            {activePage === "map" && (
              <a
                className="external-map-link"
                href="https://www.marinetraffic.com/en/ais/embed/zoom:5/centery:5/centerx:0/maptype:1/shownames:true/mmsi:0/shipid:0/fleet:0/ship_type:0/flag:0/destination:0/eta:0/width:100%/height:600"
                rel="noopener noreferrer"
                target="_blank"
                title="Ouvrir MarineTraffic dans un nouvel onglet"
              >
                MarineTraffic ↗
              </a>
            )}
            <span aria-label={`Connecté en tant que ${session.user.email}`} className="account-email">{session.user.email}</span>
          </div>
        </header>
        {activePage === "map" && (
          <LiveMap
            onConnectionChange={setLiveConnection}
            onOpenProspects={() => setActivePage("prospects")}
            onSaveVessel={prospectState.saveVessel}
            session={session}
            trackedMmsis={trackedMmsis}
          />
        )}
        {activePage === "prospects" && (
          <div className="workspace-content">
            <ProspectsPage
              error={prospectState.error}
              isLoading={prospectState.isLoading}
              onDelete={prospectState.deleteProspect}
              onExport={() => exportProspects(prospectState.prospects)}
              onUpdate={prospectState.updateProspect}
              prospects={prospectState.prospects}
            />
          </div>
        )}
        {activePage === "documents" && (
          <section className="documents-page !block !min-h-0 !overflow-visible !bg-transparent !p-0">
            <header className="documents-heading">
              <div>
                <span className="eyebrow">ESPACE PERSONNEL</span>
                <h1>Mes documents</h1>
                <p>Les documents restent enregistrés dans le stockage local de ce navigateur.</p>
              </div>
              <span className="documents-total">{documents.documents.length} document{documents.documents.length === 1 ? "" : "s"}</span>
            </header>
            {documents.storageError && <p role="alert" className="storage-error">{documents.storageError}</p>}
            <div className="documents-layout">
              <DocumentList documents={documents.documents} onDelete={documents.deleteDocument} />
              <DocumentForm onSubmit={documents.addDocument} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
