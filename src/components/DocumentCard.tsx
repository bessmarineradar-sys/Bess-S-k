import { CATEGORIES, type Document } from "../types/document";

interface DocumentCardProps {
  document: Document;
  onDelete: (id: string) => void;
}

function getExpirationStatus(expirationDate: string) {
  const [year, month, day] = expirationDate.split("-").map(Number);
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const expirationUtc = Date.UTC(year, month - 1, day);
  const daysRemaining = Math.round((expirationUtc - todayUtc) / 86_400_000);

  if (daysRemaining < 0) return { label: "Expiré", className: "expired" };
  if (daysRemaining === 0) return { label: "Expire aujourd’hui", className: "expiring" };
  if (daysRemaining <= 30) {
    return { label: `Expire dans ${daysRemaining} jours`, className: "expiring" };
  }
  return { label: `${daysRemaining} jours restants`, className: "current" };
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" })
    .format(new Date(year, month - 1, day));
}

export default function DocumentCard({
  document,
  onDelete,
}: DocumentCardProps) {
  const expirationStatus = getExpirationStatus(document.expirationDate);
  const category = CATEGORIES.find((item) => item.value === document.category);

  return (
    <article className="document-card">
      <div className="document-card-topline">
        <span className={`document-category ${category?.color ?? "bg-gray-500"}`}>
          {category?.label ?? "Autre"}
        </span>
        <span className={`document-expiration ${expirationStatus.className}`}>
          <span className="expiration-dot" />
          {expirationStatus.label}
        </span>
      </div>
      <div className="document-card-main">
        <span className="document-file-icon" aria-hidden="true">▤</span>
        <div className="document-card-copy">
          <h3>{document.name}</h3>
          <span>Ajouté le {formatDate(document.createdAt.slice(0, 10))}</span>
        </div>
      </div>
      {document.notes && <p className="document-notes">{document.notes}</p>}
      <div className="document-card-footer">
        <span>Échéance · {formatDate(document.expirationDate)}</span>
        <button
          className="document-delete-button"
          onClick={() => onDelete(document.id)}
          type="button"
          aria-label={`Supprimer ${document.name}`}
        >
          Supprimer
        </button>
      </div>
    </article>
  );
}
