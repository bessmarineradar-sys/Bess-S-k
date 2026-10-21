import { useMemo, useState, type FormEvent } from "react";
import type { Prospect, ProspectStatus, ProspectUpdate } from "../types/prospect";

const STATUS_LABELS: Record<ProspectStatus, string> = {
  new: "À qualifier",
  contacted: "Contacté",
  follow_up: "À relancer",
  qualified: "Qualifié",
  closed: "Converti",
  not_relevant: "Non pertinent",
};

const STATUS_STYLES: Record<ProspectStatus, string> = {
  new: "border-sky-300/20 bg-sky-300/10 text-sky-200",
  contacted: "border-violet-300/20 bg-violet-300/10 text-violet-200",
  follow_up: "border-amber-300/20 bg-amber-300/10 text-amber-200",
  qualified: "border-emerald-300/20 bg-emerald-300/10 text-emerald-200",
  closed: "border-[#45e0bd]/20 bg-[#45e0bd]/10 text-[#8df2d9]",
  not_relevant: "border-white/10 bg-white/5 text-[#9aabb7]",
};

interface ProspectsPageProps {
  prospects: Prospect[];
  isLoading: boolean;
  error: string | null;
  onUpdate: (id: string, updates: ProspectUpdate) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  onExport: () => void;
}

interface Draft {
  company: string;
  notes: string;
  status: ProspectStatus;
}

export default function ProspectsPage({
  prospects,
  isLoading,
  error,
  onUpdate,
  onDelete,
  onExport,
}: ProspectsPageProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProspectStatus | "all">("all");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return prospects.filter((prospect) => {
      const matchesQuery = !normalizedQuery ||
        [prospect.vesselName, prospect.mmsi, prospect.company, prospect.destination ?? ""]
          .some((value) => value.toLocaleLowerCase("fr").includes(normalizedQuery));
      return matchesQuery && (statusFilter === "all" || prospect.status === statusFilter);
    });
  }, [prospects, query, statusFilter]);

  function getDraft(prospect: Prospect): Draft {
    return drafts[prospect.id] ?? {
      company: prospect.company,
      notes: prospect.notes,
      status: prospect.status,
    };
  }

  function changeDraft(prospect: Prospect, changes: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [prospect.id]: {
        ...(current[prospect.id] ?? {
          company: prospect.company,
          notes: prospect.notes,
          status: prospect.status,
        }),
        ...changes,
      },
    }));
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>, prospect: Prospect) {
    event.preventDefault();
    const draft = getDraft(prospect);
    setSavingId(prospect.id);
    setActionError(null);
    try {
      await onUpdate(prospect.id, {
        company: draft.company.trim() || null,
        notes: draft.notes.trim(),
        status: draft.status,
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[prospect.id];
        return next;
      });
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : "Enregistrement impossible.");
    } finally {
      setSavingId(null);
    }
  }

  async function removeProspect(prospect: Prospect) {
    if (!window.confirm(`Supprimer le prospect ${prospect.vesselName} (${prospect.mmsi}) ?`)) return;
    setActionError(null);
    try {
      await onDelete(prospect.id);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Suppression impossible.");
    }
  }

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-[#45e0bd]">DÉVELOPPEMENT COMMERCIAL</p>
          <h1 className="mt-2 font-['Manrope'] text-2xl font-bold text-[#eef4f6]">Mes prospects navires</h1>
          <p className="mt-1 text-sm text-[#91a2ae]">
            Vos fiches sont privées, liées à votre compte et synchronisées entre appareils.
          </p>
        </div>
        <button
          className="rounded-lg border border-white/15 px-4 py-2.5 text-sm font-medium text-[#d4dfe5] transition hover:border-[#45e0bd]/50 hover:text-white disabled:opacity-50"
          disabled={prospects.length === 0}
          onClick={onExport}
          type="button"
        >
          Exporter en CSV
        </button>
      </header>

      {error && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{error}</p>}
      {actionError && <p role="alert" className="rounded-lg border border-rose-300/20 bg-rose-300/5 p-3 text-sm text-rose-200">{actionError}</p>}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="sr-only" htmlFor="prospect-search">Rechercher les prospects</label>
        <input
          className="rounded-lg border border-white/10 bg-[#0b1926] px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#71838f] focus:border-[#45e0bd]/60"
          id="prospect-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Navire, MMSI, compagnie, destination…"
          type="search"
          value={query}
        />
        <label className="sr-only" htmlFor="prospect-status">Filtrer par statut</label>
        <select
          className="rounded-lg border border-white/10 bg-[#0b1926] px-3 py-2.5 text-sm text-white outline-none focus:border-[#45e0bd]/60"
          id="prospect-status"
          onChange={(event) => setStatusFilter(event.target.value as ProspectStatus | "all")}
          value={statusFilter}
        >
          <option value="all">Tous les statuts</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-[#91a2ae]">Chargement des prospects…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-[#0b1926] px-6 py-14 text-center">
          <span aria-hidden="true" className="text-3xl">⚓</span>
          <h2 className="mt-3 font-semibold text-white">
            {prospects.length ? "Aucun résultat" : "Votre portefeuille est prêt"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#91a2ae]">
            {prospects.length
              ? "Modifiez la recherche ou le filtre de statut."
              : "Depuis la carte, enregistrez un navire pour commencer une fiche commerciale. La société et l’intérêt commercial sont à renseigner par vous."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {filtered.map((prospect) => {
            const draft = getDraft(prospect);
            return (
              <article className="rounded-xl border border-white/10 bg-[#0b1926] p-4" key={prospect.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-['Manrope'] text-lg font-semibold text-white">{prospect.vesselName}</h2>
                    <p className="mt-1 text-xs text-[#91a2ae]">
                      MMSI {prospect.mmsi}
                      {prospect.vesselType && ` · Type ${prospect.vesselType}`}
                      {prospect.destination && ` · Destination ${prospect.destination}`}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${STATUS_STYLES[prospect.status]}`}>
                    {STATUS_LABELS[prospect.status]}
                  </span>
                </div>

                <form className="mt-4 space-y-3" onSubmit={(event) => void saveDraft(event, prospect)}>
                  <label className="block text-xs text-[#aebdc7]">
                    Compagnie / contact commercial
                    <input
                      className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#07131f] px-3 py-2 text-sm text-white outline-none focus:border-[#45e0bd]/50"
                      maxLength={160}
                      onChange={(event) => changeDraft(prospect, { company: event.target.value })}
                      placeholder="À compléter manuellement"
                      value={draft.company}
                    />
                  </label>
                  <label className="block text-xs text-[#aebdc7]">
                    Notes de prospection
                    <textarea
                      className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-[#07131f] px-3 py-2 text-sm text-white outline-none focus:border-[#45e0bd]/50"
                      maxLength={5000}
                      onChange={(event) => changeDraft(prospect, { notes: event.target.value })}
                      placeholder="Besoin potentiel, prochaine action, contexte…"
                      rows={3}
                      value={draft.notes}
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-[#aebdc7]">
                      Statut
                      <select
                        className="rounded-lg border border-white/10 bg-[#07131f] px-2 py-1.5 text-xs text-white"
                        onChange={(event) => changeDraft(prospect, { status: event.target.value as ProspectStatus })}
                        value={draft.status}
                      >
                        {Object.entries(STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        className="text-xs text-rose-300 hover:text-rose-200"
                        onClick={() => void removeProspect(prospect)}
                        type="button"
                      >
                        Supprimer
                      </button>
                      <button
                        className="rounded-lg bg-[#45e0bd] px-3 py-2 text-xs font-semibold text-[#05201e] hover:bg-[#6aebcf] disabled:opacity-50"
                        disabled={savingId === prospect.id}
                        type="submit"
                      >
                        {savingId === prospect.id ? "Enregistrement…" : "Enregistrer"}
                      </button>
                    </div>
                  </div>
                </form>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
