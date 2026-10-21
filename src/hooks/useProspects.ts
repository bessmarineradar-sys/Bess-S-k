import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  toProspect,
  type Prospect,
  type ProspectInsert,
  type ProspectUpdate,
} from "../types/prospect";

export interface VesselForProspect {
  mmsi: string;
  name: string;
  shipType: string | null;
  destination: string | null;
}

export function useProspects(session: Session | null) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(session));
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!supabase || !userId) {
      setProspects([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    void supabase
      .from("prospects")
      .select("*")
      .order("updated_at", { ascending: false })
      .then(({ data, error: queryError }) => {
        if (cancelled) return;
        if (queryError) {
          setError(`Impossible de charger vos prospects : ${queryError.message}`);
          setProspects([]);
        } else {
          setProspects((data ?? []).map(toProspect));
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const saveVessel = useCallback(async (vessel: VesselForProspect) => {
    if (!supabase || !userId) throw new Error("Connectez-vous pour enregistrer un prospect.");
    const record: ProspectInsert = {
      user_id: userId,
      mmsi: vessel.mmsi,
      vessel_name: vessel.name,
      vessel_type: vessel.shipType,
      destination: vessel.destination,
      company: null,
      notes: "",
      status: "new",
    };
    const { data, error: insertError } = await supabase
      .from("prospects")
      .insert(record)
      .select("*")
      .single();
    if (insertError) throw new Error(`Impossible d’enregistrer le prospect : ${insertError.message}`);
    const prospect = toProspect(data);
    setProspects((current) => [prospect, ...current]);
    return prospect;
  }, [userId]);

  const updateProspect = useCallback(async (id: string, updates: ProspectUpdate) => {
    if (!supabase || !userId) throw new Error("Connectez-vous pour modifier un prospect.");
    const { data, error: updateError } = await supabase
      .from("prospects")
      .update(updates)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (updateError) throw new Error(`Impossible de modifier le prospect : ${updateError.message}`);
    const prospect = toProspect(data);
    setProspects((current) =>
      current.map((item) => item.id === prospect.id ? prospect : item)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
    return prospect;
  }, [userId]);

  const deleteProspect = useCallback(async (id: string) => {
    if (!supabase || !userId) throw new Error("Connectez-vous pour supprimer un prospect.");
    const { error: deleteError } = await supabase
      .from("prospects")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (deleteError) throw new Error(`Impossible de supprimer le prospect : ${deleteError.message}`);
    setProspects((current) => current.filter((item) => item.id !== id));
  }, [userId]);

  return { prospects, isLoading, error, setError, saveVessel, updateProspect, deleteProspect };
}
