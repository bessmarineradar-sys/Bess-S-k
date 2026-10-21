import DocumentCard from "./DocumentCard";
import type { Document } from "../types/document";

interface DocumentListProps {
  documents: Document[];
  onDelete: (id: string) => void;
}

export function DocumentList({
  documents,
  onDelete,
}: DocumentListProps) {
  if (documents.length === 0) {
    return (
      <div className="documents-empty-state">
        <span className="documents-empty-icon" aria-hidden="true">▤</span>
        <h3>Aucun document pour le moment</h3>
        <p>Ajoutez votre premier document ci-dessus</p>
      </div>
    );
  }

  return (
    <div className="documents-grid">
      {documents.map((document) => (
        <DocumentCard
          document={document}
          key={document.id}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
