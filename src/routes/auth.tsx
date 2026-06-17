import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { LogoR2 } from "@/components/Logo";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar — Vendas x Design" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        toast.success("Bem-vinda(o)!");
        navigate({ to: "/app" });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: { emailRedirectTo: `${window.location.origin}/app`, data: { nome } },
        });
        if (error) throw error;
        toast.success("Conta criada! Entrando...");
        navigate({ to: "/app" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao autenticar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="px-[18px] max-w-[440px] mx-auto w-full">
        <div className="mb-7 pt-3">
          <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-muted-foreground">Vendas x Design</div>
          <div className="font-display text-[18px] font-extrabold tracking-[-0.4px] leading-[1.1]">R2 Design Hub</div>
        </div>
      </div>
      <div className="flex-1 flex flex-col justify-center px-[18px] py-6 max-w-[440px] mx-auto w-full">
        <div className="bg-card rounded-[14px] p-[26px_22px]" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
          <h2 className="font-display text-[21px] font-extrabold mb-1">{mode === "signin" ? "Bem-vinda 👋" : "Criar conta"}</h2>
          <p className="text-muted-foreground text-[13px] mb-[18px]">
            {mode === "signin" ? "Acesse com seu email para continuar." : "Cadastre-se para começar."}
          </p>
          <form onSubmit={handle} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.06em] mb-[5px] block">Nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Seu nome" className="w-full bg-background border-[1.5px] border-border rounded-[10px] px-3 py-[10px] text-sm outline-none focus:border-foreground" />
              </div>
            )}
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.06em] mb-[5px] block">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@empresa.com" className="w-full bg-background border-[1.5px] border-border rounded-[10px] px-3 py-[10px] text-sm outline-none focus:border-foreground" />
            </div>
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.06em] mb-[5px] block">Senha</label>
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={6} placeholder="••••••••" className="w-full bg-background border-[1.5px] border-border rounded-[10px] px-3 py-[10px] text-sm outline-none focus:border-foreground" />
            </div>
            <button type="submit" disabled={loading} className="w-full mt-2 bg-yellow text-foreground rounded-[10px] py-3 font-bold text-sm flex items-center justify-center gap-[6px] hover:opacity-85 disabled:opacity-40">
              <i className={`ti ${mode === "signin" ? "ti-login" : "ti-user-plus"}`}></i>
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="w-full mt-4 text-xs text-muted-foreground hover:text-foreground">
            {mode === "signin" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
