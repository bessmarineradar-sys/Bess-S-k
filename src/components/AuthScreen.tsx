import { useState, type FormEvent } from "react";
import shipLogo from "./ShipLogo.svg";
import { supabase } from "../lib/supabase";

export default function AuthScreen() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setMessage("Consultez votre boîte mail pour confirmer votre adresse avant de vous connecter.");
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : "La connexion a échoué. Réessayez.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07131f] px-4 py-10 text-[#e8eef4]">
      <section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0b1926] p-7 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <img src={shipLogo} alt="" className="h-14 w-14" />
          <div>
            <h1 className="font-['Manrope'] text-2xl font-bold">Bess Sök</h1>
            <p className="mt-1 text-sm text-[#91a2ae]">Prospection maritime</p>
          </div>
        </div>
        {!supabase ? (
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm leading-6 text-amber-100">
            <h2 className="font-semibold">Configuration Supabase requise</h2>
            <p className="mt-2 text-amber-100/80">
              Les comptes et la synchronisation ne sont pas encore configurés.
              Ajoutez <code>VITE_SUPABASE_URL</code> et
              <code> VITE_SUPABASE_ANON_KEY</code> aux variables de build
              GitHub Actions, puis relancez le déploiement.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold">
              {mode === "sign-in" ? "Connexion à votre espace" : "Créer votre compte"}
            </h2>
            <p className="mt-1 text-sm text-[#91a2ae]">
              Vos fiches commerciales sont privées et synchronisées sur vos appareils.
            </p>
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <label className="block text-sm text-[#c4d0d7]">
                Adresse e-mail
                <input
                  autoComplete="email"
                  className="mt-2 w-full rounded-lg border border-white/15 bg-[#07131f] px-3 py-2.5 text-white outline-none focus:border-[#45e0bd]"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="block text-sm text-[#c4d0d7]">
                Mot de passe
                <input
                  autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                  className="mt-2 w-full rounded-lg border border-white/15 bg-[#07131f] px-3 py-2.5 text-white outline-none focus:border-[#45e0bd]"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              {error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
              {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
              <button
                className="w-full rounded-lg bg-[#45e0bd] px-4 py-3 font-semibold text-[#05201e] transition hover:bg-[#6aebcf] disabled:cursor-wait disabled:opacity-60"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? "Veuillez patienter…" : mode === "sign-in" ? "Se connecter" : "Créer le compte"}
              </button>
            </form>
            <button
              className="mt-5 w-full text-sm text-[#a8bac5] hover:text-white"
              onClick={() => {
                setMode((current) => current === "sign-in" ? "sign-up" : "sign-in");
                setError(null);
                setMessage(null);
              }}
              type="button"
            >
              {mode === "sign-in" ? "Créer un compte" : "J’ai déjà un compte"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
