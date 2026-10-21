export interface Document {
  id: string;
  name: string;
  category: "identity" | "vehicle" | "insurance" | "subscription" | "other";
  expirationDate: string;
  notes?: string;
  createdAt: string;
}

export type DocumentCategory = Document["category"];

export const CATEGORIES: {
  value: DocumentCategory;
  label: string;
  color: string;
}[] = [
  { value: "identity", label: "Identité", color: "bg-blue-500" },
  { value: "vehicle", label: "Véhicule", color: "bg-green-500" },
  { value: "insurance", label: "Assurance", color: "bg-purple-500" },
  { value: "subscription", label: "Abonnement", color: "bg-orange-500" },
  { value: "other", label: "Autre", color: "bg-gray-500" },
];

export type NewDocument = Omit<Document, "id" | "createdAt">;
