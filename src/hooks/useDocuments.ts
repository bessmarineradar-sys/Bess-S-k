import { useCallback, useEffect, useState } from "react";
import {
  CATEGORIES,
  type Document,
  type DocumentCategory,
  type NewDocument,
} from "../types/document";

const STORAGE_KEY = "maree.documents.v2";

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);
  return parsedDate.getFullYear() === year &&
    parsedDate.getMonth() === month - 1 &&
    parsedDate.getDate() === day;
}

function dateToUtcDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function todayUtcDay(): number {
  const today = new Date();
  return Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
}

function isDocument(value: unknown): value is Document {
  if (typeof value !== "object" || value === null) return false;

  const document = value as Record<string, unknown>;
  return typeof document.id === "string" &&
    typeof document.name === "string" &&
    typeof document.category === "string" &&
    CATEGORIES.some((category) => category.value === document.category) &&
    isDateOnly(document.expirationDate) &&
    (document.notes === undefined || typeof document.notes === "string") &&
    typeof document.createdAt === "string";
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [canPersist, setCanPersist] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const storedValue = window.localStorage.getItem(STORAGE_KEY);
      if (storedValue !== null) {
        const parsedValue: unknown = JSON.parse(storedValue);
        if (!Array.isArray(parsedValue)) {
          throw new Error("Le contenu enregistré ne correspond pas au format attendu.");
        }
        const validatedDocuments = parsedValue.filter(isDocument);
        if (validatedDocuments.length !== parsedValue.length) {
          throw new Error("Un ou plusieurs documents enregistrés sont invalides.");
        }
        setDocuments(validatedDocuments);
      }
      setCanPersist(true);
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? `Impossible de lire vos documents enregistrés : ${error.message}`
          : "Impossible de lire vos documents enregistrés.",
      );
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !canPersist) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? `Impossible d’enregistrer vos documents : ${error.message}`
          : "Impossible d’enregistrer vos documents.",
      );
    }
  }, [documents, isLoaded, canPersist]);

  const addDocument = useCallback((newDocument: NewDocument) => {
    const id = globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    setDocuments((currentDocuments) => [
      { ...newDocument, id, createdAt: new Date().toISOString() },
      ...currentDocuments,
    ]);
    setCanPersist(true);
    setStorageError(null);
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setDocuments((currentDocuments) =>
      currentDocuments.filter((document) => document.id !== id),
    );
    setCanPersist(true);
    setStorageError(null);
  }, []);

  const updateDocument = useCallback((
    id: string,
    updates: Partial<Omit<Document, "id" | "createdAt">>,
  ) => {
    setDocuments((currentDocuments) =>
      currentDocuments.map((document) =>
        document.id === id ? { ...document, ...updates } : document,
      ),
    );
    setCanPersist(true);
    setStorageError(null);
  }, []);

  const getDocumentsByCategory = useCallback(
    (category: DocumentCategory) =>
      documents.filter((document) => document.category === category),
    [documents],
  );

  const getExpiringDocuments = useCallback((days = 30) => {
    if (!Number.isFinite(days) || days < 0) return [];
    const today = todayUtcDay();
    const deadline = today + days * 86_400_000;
    return documents.filter((document) => {
      const expiration = dateToUtcDay(document.expirationDate);
      return expiration >= today && expiration <= deadline;
    });
  }, [documents]);

  const getExpiredDocuments = useCallback(() => {
    const today = todayUtcDay();
    return documents.filter((document) => dateToUtcDay(document.expirationDate) < today);
  }, [documents]);

  return {
    documents,
    addDocument,
    updateDocument,
    deleteDocument,
    getDocumentsByCategory,
    getExpiringDocuments,
    getExpiredDocuments,
    storageError,
  };
}
