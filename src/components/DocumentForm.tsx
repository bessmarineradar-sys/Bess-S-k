import { useState, type FormEvent } from "react";
import {
  CATEGORIES,
  type DocumentCategory,
  type NewDocument,
} from "../types/document";

interface DocumentFormProps {
  onSubmit: (document: NewDocument) => void;
}

export function DocumentForm({ onSubmit }: DocumentFormProps) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<DocumentCategory>(CATEGORIES[0].value);
  const [expirationDate, setExpirationDate] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName || !expirationDate) return;

    onSubmit({
      name: normalizedName,
      category,
      expirationDate,
      notes: notes.trim(),
    });
    setName("");
    setCategory(CATEGORIES[0].value);
    setExpirationDate("");
    setNotes("");
  }

  return (
    <form className="document-form" onSubmit={handleSubmit}>
      <div className="document-form-heading">
        <span className="eyebrow">NOUVEAU DOCUMENT</span>
        <h2>Ajouter un document</h2>
        <p>Conservez vos documents importants au même endroit.</p>
      </div>

      <label className="document-field">
        <span>Nom du document <i>*</i></span>
        <input
          autoComplete="off"
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex. Assurance bateau"
          required
          value={name}
        />
      </label>

      <label className="document-field">
        <span>Catégorie</span>
        <select
          onChange={(event) => {
            const selectedCategory = CATEGORIES.find(
              (item) => item.value === event.target.value,
            );
            if (selectedCategory) setCategory(selectedCategory.value);
          }}
          value={category}
        >
          {CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>{item.label}</option>
          ))}
        </select>
      </label>

      <label className="document-field">
        <span>Date d’expiration <i>*</i></span>
        <input
          onChange={(event) => setExpirationDate(event.target.value)}
          required
          type="date"
          value={expirationDate}
        />
      </label>

      <label className="document-field">
        <span>Notes <small>Facultatives</small></span>
        <textarea
          maxLength={500}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Ajoutez une référence ou un rappel…"
          rows={3}
          value={notes}
        />
      </label>

      <button className="document-submit-button" type="submit">
        <span aria-hidden="true">＋</span> Ajouter
      </button>
      <p className="document-form-note">Les informations sont enregistrées dans ce navigateur.</p>
    </form>
  );
}
