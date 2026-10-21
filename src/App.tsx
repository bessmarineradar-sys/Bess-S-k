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

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(Boolean(supabase));
  const [activePage, setActivePage] = useState<Page>("map");
  const [authError, setAuthError] = useState<string | null>(null);
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
    <div className="min-h-screen bg-[#07131f] text-[#e8eef4]">
      <header className="border-b border-white/10 bg-[#091622]">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <img src={shipLogo} alt="" aria-hidden="true" className="h-11 w-11 shrink-0" />
            <div>
              <p className="font-['Manrope'] text-lg font-bold text-white">Bess Sök</p>
              <p className="text-xs text-[#91a2ae]">Prospection maritime</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="max-w-[220px] truncate text-xs text-[#aebdc7]">{session.user.email}</span>
            <button
              className="rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-[#c3cfd6] hover:border-white/30 hover:text-white"
              onClick={() => void signOut()}
              type="button"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <nav aria-label="Navigation principale" className="border-b border-white/10 bg-[#091622]">
        <div className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 sm:px-6">
          {pageButtons.map(({ page, icon }) => (
            <button
              aria-current={activePage === page ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm transition ${
                activePage === page
                  ? "border-[#45e0bd] text-white"
                  : "border-transparent text-[#91a2ae] hover:text-white"
              }`}
              key={page}
              onClick={() => setActivePage(page)}
              type="button"
            >
              <span aria-hidden="true">{icon}</span>
              {pageLabels[page]}
              {page === "prospects" && prospectState.prospects.length > 0 && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px]">
                  {prospectState.prospects.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
        {authError && (
          <p role="alert" className="mb-4 rounded-lg border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">
            {authError}
          </p>
        )}
        {activePage === "map" && (
          <LiveMap
            onOpenProspects={() => setActivePage("prospects")}
            onSaveVessel={prospectState.saveVessel}
            session={session}
            trackedMmsis={trackedMmsis}
          />
        )}
        {activePage === "prospects" && (
          <ProspectsPage
            error={prospectState.error}
            isLoading={prospectState.isLoading}
            onDelete={prospectState.deleteProspect}
            onExport={() => exportProspects(prospectState.prospects)}
            onUpdate={prospectState.updateProspect}
            prospects={prospectState.prospects}
          />
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
