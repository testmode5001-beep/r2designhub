import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/usuarios")({
  head: () => ({ meta: [{ title: "Usuários — Vendas x Design" }] }),
  component: UsuariosPage,
});

type Role = "gestor" | "vendedora" | "designer";

function UsuariosPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [me, setMe] = useState<{ id: string; role: Role | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).limit(1).maybeSingle();
      setMe({ id: u.user.id, role: (r?.role as Role) ?? null });
    })();
  }, []);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["usuarios"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id,nome,ativo,created_at").order("created_at", { ascending: true }),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      const map = new Map<string, Role>();
      (roles ?? []).forEach((r: any) => map.set(r.user_id, r.role));
      return (profiles ?? []).map((p: any) => ({ ...p, role: map.get(p.id) ?? "vendedora" }));
    },
    enabled: !!me,
  });

  async function changeRole(userId: string, newRole: Role) {
    const { error: del } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (del) return toast.error(del.message);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) return toast.error(error.message);
    toast.success("Papel atualizado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  async function toggleAtivo(userId: string, ativo: boolean) {
    const { error } = await supabase.from("profiles").update({ ativo: !ativo }).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success(!ativo ? "Usuário ativado" : "Usuário desativado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  }

  if (!me) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (me.role !== "gestor") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <i className="ti ti-lock text-4xl text-muted-foreground"></i>
        <div className="font-display text-xl font-extrabold">Acesso restrito</div>
        <div className="text-sm text-muted-foreground">Apenas gestores podem gerenciar usuários.</div>
        <Link to="/app" className="mt-2 bg-foreground text-yellow px-4 py-2 rounded-[10px] text-sm font-bold">Voltar</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-between px-[18px] pt-[18px]">
        <div className="flex items-center gap-[10px] min-w-0">
          <button onClick={() => navigate({ to: "/app" })} className="p-1.5 rounded-lg hover:bg-card -ml-1.5" aria-label="Voltar">
            <i className="ti ti-arrow-left text-xl"></i>
          </button>
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-muted-foreground">Equipe</div>
            <div className="font-display text-[18px] font-extrabold tracking-[-0.4px] leading-[1.1] truncate">Usuários</div>
          </div>
        </div>
      </div>

      <div className="px-[18px] py-[14px] max-w-[680px] w-full mx-auto pb-8 flex-1">
        <div className="bg-yellow/30 border border-yellow rounded-[12px] p-3 mb-3 text-xs">
          <div className="font-bold mb-1 flex items-center gap-1"><i className="ti ti-info-circle"></i> Como cadastrar</div>
          Peça para o novo usuário se cadastrar em <code className="bg-card px-1 rounded">/auth</code> com email e senha. Ele aparecerá aqui como <b>vendedora</b> por padrão — você pode mudar o papel abaixo.
        </div>

        {isLoading ? (
          <div className="text-center text-muted-foreground py-12">Carregando...</div>
        ) : (
          <div className="space-y-2">
            {users.map((u: any) => (
              <div key={u.id} className={`bg-card rounded-[12px] p-3 flex items-center gap-3 ${!u.ativo ? "opacity-60" : ""}`} style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
                <div className="w-9 h-9 rounded-full bg-foreground text-yellow flex items-center justify-center text-sm font-extrabold shrink-0">
                  {u.nome?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate">{u.nome} {u.id === me.id && <span className="text-[10px] text-muted-foreground font-normal">(você)</span>}</div>
                  <div className="text-[11px] text-muted-foreground">{u.ativo ? "Ativo" : "Inativo"}</div>
                </div>
                <select
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value as Role)}
                  disabled={u.id === me.id}
                  className="text-xs font-semibold bg-background border border-border rounded-[8px] px-2 py-1.5"
                >
                  <option value="vendedora">Vendedora</option>
                  <option value="designer">Designer</option>
                  <option value="gestor">Gestor</option>
                </select>
                <button
                  onClick={() => toggleAtivo(u.id, u.ativo)}
                  disabled={u.id === me.id}
                  className="text-[11px] font-bold px-2 py-1.5 rounded-[8px] border border-border hover:bg-background disabled:opacity-40"
                  title={u.ativo ? "Desativar" : "Ativar"}
                >
                  {u.ativo ? "Desativar" : "Ativar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
