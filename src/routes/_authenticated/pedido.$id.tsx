import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/_authenticated/pedido/$id")({
  head: () => ({ meta: [{ title: "Pedido — Vendas x Design" }] }),
  component: PedidoDetail,
});

type Role = "gestor" | "vendedora" | "designer";
type Status = "nova" | "criacao" | "aguardando" | "revisao" | "aprovada" | "cliche" | "concluido" | "cancelado";

const STATUS_LIST: { key: Status; label: string; cls: string }[] = [
  { key: "nova", label: "Nova", cls: "s-nova" },
  { key: "criacao", label: "Em criação", cls: "s-criacao" },
  { key: "aguardando", label: "Aguardando aprovação", cls: "s-aguardando" },
  { key: "revisao", label: "Revisão solicitada", cls: "s-revisao" },
  { key: "aprovada", label: "Arte aprovada", cls: "s-aprovada" },
  { key: "cliche", label: "Clichê solicitado", cls: "s-cliche" },
  { key: "concluido", label: "Concluído", cls: "s-concluido" },
  { key: "cancelado", label: "Cancelado", cls: "s-cancelado" },
];
const sInfo = (k: Status) => STATUS_LIST.find((s) => s.key === k) ?? STATUS_LIST[0];

function fmtDate(s: string) {
  return new Date(s).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function PedidoDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [profile, setProfile] = useState<{ id: string; nome: string; role: Role } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id,nome").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id).limit(1).maybeSingle(),
      ]);
      setProfile({ id: u.user.id, nome: p?.nome ?? u.user.email ?? "Usuário", role: (r?.role as Role) ?? "vendedora" });
    })();
  }, []);

  const { data: pedido } = useQuery({
    queryKey: ["pedido", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("pedidos").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!profile,
  });

  const { data: historico = [] } = useQuery({
    queryKey: ["pedido-historico", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_historico")
        .select("id,status,observacao,created_at,user_id")
        .eq("pedido_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: anexos = [] } = useQuery({
    queryKey: ["pedido-anexos", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_anexos")
        .select("id,nome,tipo,url,created_at,user_id")
        .eq("pedido_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  // Realtime
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`pedido-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pedidos", filter: `id=eq.${id}` }, (payload) => {
        qc.invalidateQueries({ queryKey: ["pedido", id] });
        if (profile?.role === "vendedora") {
          const novo = payload.new as any;
          const statusLabels: Record<string, string> = {
            nova: "Nova", criacao: "Em criação", aguardando: "Aguardando aprovação",
            revisao: "Revisão solicitada", aprovada: "Arte aprovada",
            cliche: "Clichê solicitado", concluido: "Concluído", cancelado: "Cancelado",
          };
          toast (`Pedido atualizado`, {
            description: `Status alterado para: ${statusLabels[novo.status] ?? novo.status}`,
            icon: "🔄",
            duration: 6000,          
          }); 

         // dentro do .on UPDATE:
sendLocalNotification(
  "Pedido atualizado",
  `${pedido?.cliente} → ${statusLabels[novo.status] ?? novo.status}`,
  `/pedido/${id}`
);
          
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_historico", filter: `pedido_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["pedido-historico", id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_anexos", filter: `pedido_id=eq.${id}` }, () => {
        qc.invalidateQueries({ queryKey: ["pedido-anexos", id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, id, qc]);

  async function changeStatus(newStatus: Status, observacao: string) {
    if (!profile || !pedido) return;
    const patch: any = { status: newStatus };
    if (newStatus === "criacao" && !pedido.designer_id) patch.designer_id = profile.id;
    if (newStatus === "cliche") patch.cliche_solicitado_em = new Date().toISOString();
    if (newStatus === "concluido") patch.cliche_concluido_em = new Date().toISOString();
    const { error } = await supabase.from("pedidos").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("pedido_historico").insert({
      pedido_id: id, user_id: profile.id, status: newStatus, observacao: observacao || null,
    });
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["pedido", id] });
    qc.invalidateQueries({ queryKey: ["pedido-historico", id] });
    qc.invalidateQueries({ queryKey: ["pedidos"] });
  }

  async function uploadArte(file: File) {
    if (!profile) return;
    const path = `${id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("pedido-anexos").upload(path, file);
    if (upErr) { toast.error(upErr.message); return; }
    const { error } = await supabase.from("pedido_anexos").insert({
      pedido_id: id, user_id: profile.id, nome: file.name, tipo: "arte", url: path,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Arte enviada");
    qc.invalidateQueries({ queryKey: ["pedido-anexos", id] });
  }

 async function openAnexo(url: string) {
  const { data } = supabase.storage.from("pedido-anexos").getPublicUrl(url);
  if (data?.publicUrl) {
    window.open(data.publicUrl, "_blank");
  } else {
    toast.error("Não foi possível abrir o arquivo.");
  }
}

async function downloadAnexo(url: string, nome: string) {
  const { data } = supabase.storage.from("pedido-anexos").getPublicUrl(url);
  if (!data?.publicUrl) { toast.error("Erro ao baixar arquivo."); return; }
  const a = document.createElement("a");
  a.href = data.publicUrl;
  a.download = nome;
  a.click();
}
  
  if (!profile || !pedido) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const isDesigner = profile.role === "designer" || profile.role === "gestor";
  const isVendedor = profile.role === "vendedora" || profile.role === "gestor";
  const status = pedido.status as Status;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-[680px] w-full mx-auto flex items-center justify-between px-[18px] pt-[18px]">
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-muted-foreground">Pedido #{pedido.numero}</div>
          <div className="font-display text-[18px] font-extrabold tracking-[-0.4px] leading-[1.1] truncate">{pedido.cliente}</div>
        </div>
        <button onClick={() => navigate({ to: "/app" })} className="text-xs font-semibold bg-card rounded-full px-3 py-[6px]" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.09)" }}>
          <i className="ti ti-arrow-left mr-1"></i>Voltar
        </button>
      </div>

      <div className="px-[18px] py-[14px] flex-1 max-w-[680px] w-full mx-auto pb-8">
        <div className="mb-3 flex items-center gap-2">
          <span className={`inline-block px-2 py-[3px] rounded-[12px] text-[10px] font-extrabold tracking-[0.03em] ${sInfo(status).cls}`}>{sInfo(status).label}</span>
          <span className="text-[11px] text-muted-foreground">Criado em {fmtDate(pedido.created_at)}</span>
        </div>

        {/* Specs */}
        <div className="bg-card rounded-[14px] p-4 mb-[10px]" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
          <div className="font-display text-[15px] font-extrabold mb-3 flex items-center gap-[7px]"><i className="ti ti-clipboard-list"></i>Especificações</div>
          <div className="grid grid-cols-2 gap-y-2 gap-x-3 text-[13px]">
            <Info l="Matéria-prima" v={pedido.materia} />
            <Info l="Largura MP" v={`${pedido.larg_materia} mm`} />
            <Info l="Medidas" v={`${pedido.largura} × ${pedido.altura} mm`} />
            <Info l="Formato" v={pedido.forma} />
            <Info l="Cores" v={pedido.cores} />
            {pedido.cores_desc && <Info l="Especificação" v={pedido.cores_desc} />}
          </div>
          <div className="mt-3">
            <Label>Briefing</Label>
            <div className="text-[13px] whitespace-pre-wrap">{pedido.descricao}</div>
          </div>
          {pedido.link_ref && (
            <div className="mt-2">
              <Label>Referência</Label>
              <a href={pedido.link_ref} target="_blank" rel="noreferrer" className="text-[13px] underline break-all">{pedido.link_ref}</a>
            </div>
          )}
        </div>

        {/* Anexos */}
        <div className="bg-card rounded-[14px] p-4 mb-[10px]" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
          <div className="font-display text-[15px] font-extrabold mb-3 flex items-center gap-[7px]"><i className="ti ti-paperclip"></i>Anexos</div>

          {pedido.faca_url && (
            <button onClick={() => openAnexo(pedido.faca_url!)} className="w-full flex items-center gap-2 bg-background border border-border rounded-[10px] px-3 py-2 mb-2 text-left hover:border-foreground">
              <i className="ti ti-file-type-pdf text-lg"></i>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold truncate">Faca</div>
                <div className="text-[10px] text-muted-foreground truncate">{pedido.faca_nome}</div>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
  <button onClick={() => openAnexo(pedido.faca_url!)} className="p-1 text-muted-foreground hover:text-foreground"><i className="ti ti-external-link text-base"></i></button>
  <button onClick={() => downloadAnexo(pedido.faca_url!, pedido.faca_nome ?? "faca")} className="p-1 text-muted-foreground hover:text-foreground"><i className="ti ti-download text-base"></i></button>
</div>
            </button>
          )}

          {anexos.map((a: any) => (
            <button key={a.id} onClick={() => openAnexo(a.url)} className="w-full flex items-center gap-2 bg-background border border-border rounded-[10px] px-3 py-2 mb-2 text-left hover:border-foreground">
              <i className="ti ti-file text-lg"></i>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-bold truncate">{a.tipo === "arte" ? "Arte" : a.tipo}</div>
                <div className="text-[10px] text-muted-foreground truncate">{a.nome} · {fmtDate(a.created_at)}</div>
              </div>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
  <button onClick={() => openAnexo(a.url)} className="p-1 text-muted-foreground hover:text-foreground"><i className="ti ti-external-link text-base"></i></button>
  <button onClick={() => downloadAnexo(a.url, a.nome)} className="p-1 text-muted-foreground hover:text-foreground"><i className="ti ti-download text-base"></i></button>
</div>
            </button>
          ))}

          {isDesigner && (
            <label className="block border-2 border-dashed border-border rounded-[10px] p-3 text-center cursor-pointer hover:border-foreground relative mt-2">
              <input type="file" accept=".pdf,image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadArte(f); e.currentTarget.value = ""; }} className="absolute inset-0 opacity-0 cursor-pointer" />
              <i className="ti ti-upload text-lg text-muted-foreground"></i>
              <p className="text-[11px] text-muted-foreground mt-1">Enviar arte / arquivo</p>
            </label>
          )}
        </div>

        {/* Ações */}
        <div className="bg-card rounded-[14px] p-4 mb-[10px]" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
          <div className="font-display text-[15px] font-extrabold mb-3 flex items-center gap-[7px]"><i className="ti ti-bolt"></i>Ações</div>
          <ActionPanel
            status={status}
            isDesigner={isDesigner}
            isVendedor={isVendedor}
            onChange={changeStatus}
          />
        </div>

        {/* Timeline */}
        <div className="bg-card rounded-[14px] p-4 mb-[10px]" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
          <div className="font-display text-[15px] font-extrabold mb-3 flex items-center gap-[7px]"><i className="ti ti-history"></i>Histórico</div>
          {historico.length === 0 ? (
            <div className="text-[12px] text-muted-foreground">Sem eventos.</div>
          ) : (
            <ol className="relative border-l-2 border-border pl-4 space-y-3">
              {historico.map((h: any) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[22px] top-1 w-3 h-3 rounded-full bg-yellow border-2 border-foreground"></span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-block px-2 py-[2px] rounded-[10px] text-[10px] font-extrabold ${sInfo(h.status).cls}`}>{sInfo(h.status).label}</span>
                    <span className="text-[10px] text-muted-foreground">{fmtDate(h.created_at)}</span>
                  </div>
                  {h.observacao && <div className="text-[12px] mt-1">{h.observacao}</div>}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionPanel({ status, isDesigner, isVendedor, onChange }: {
  status: Status; isDesigner: boolean; isVendedor: boolean;
  onChange: (s: Status, obs: string) => void;
}) {
  const [obs, setObs] = useState("");
  const [confirm, setConfirm] = useState<{ s: Status; label: string } | null>(null);

  function act(s: Status, label: string) {
    setConfirm({ s, label });
  }

  function confirmAct() {
    if (!confirm) return;
    onChange(confirm.s, obs);
    setObs("");
    setConfirm(null);
  }

  const designerActions: { s: Status; label: string; icon: string; show: boolean }[] = [
    { s: "criacao", label: "Iniciar criação", icon: "ti-player-play", show: status === "nova" },
    { s: "aguardando", label: "Enviar para aprovação", icon: "ti-send", show: status === "criacao" || status === "revisao" },
    { s: "cliche", label: "Solicitar clichê", icon: "ti-printer", show: status === "aprovada" },
    { s: "concluido", label: "Concluir pedido", icon: "ti-check", show: status === "cliche" || status === "aprovada" },
  ];
  const vendedorActions: { s: Status; label: string; icon: string; show: boolean }[] = [
    { s: "aprovada", label: "Aprovar arte", icon: "ti-thumb-up", show: status === "aguardando" },
    { s: "revisao", label: "Solicitar revisão", icon: "ti-refresh", show: status === "aguardando" },
    { s: "cancelado", label: "Cancelar pedido", icon: "ti-x", show: !["concluido", "cancelado"].includes(status) },
  ];

  const actions = [
    ...(isDesigner ? designerActions : []),
    ...(isVendedor ? vendedorActions : []),
  ].filter((a) => a.show);

  if (actions.length === 0) {
    return <div className="text-[12px] text-muted-foreground">Sem ações disponíveis neste momento.</div>;
  }

  return (
    <>
      <textarea
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        placeholder="Observação (opcional)"
        className="w-full bg-background border-[1.5px] border-border rounded-[10px] px-3 py-2 text-[13px] mb-2 min-h-[60px] resize-y outline-none focus:border-foreground"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.s}
            onClick={() => act(a.s, a.label)}
            className={`rounded-[10px] py-2 px-3 text-[12px] font-bold flex items-center justify-center gap-2 ${
              a.s === "cancelado" ? "bg-destructive text-white" :
              a.s === "revisao" ? "bg-background border-[1.5px] border-destructive text-destructive" :
              "bg-yellow text-foreground"
            }`}
          >
            <i className={`ti ${a.icon}`}></i>{a.label}
          </button>
        ))}
      </div>

      {/* Modal de confirmação universal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card rounded-[18px] p-6 w-full max-w-[320px]" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 mx-auto ${confirm.s === "cancelado" ? "bg-destructive/10" : "bg-foreground/10"}`}>
              <i className={`ti text-xl ${
                confirm.s === "cancelado" ? "ti-alert-triangle text-destructive" :
                confirm.s === "aprovada" ? "ti-thumb-up text-foreground" :
                confirm.s === "concluido" ? "ti-check text-foreground" :
                confirm.s === "revisao" ? "ti-refresh text-destructive" :
                "ti-help text-foreground"
              }`}></i>
            </div>
            <h2 className="font-display text-[17px] font-extrabold text-center mb-1">{confirm.label}?</h2>
            <p className="text-[12px] text-muted-foreground text-center mb-5">
              Tem certeza que deseja executar esta ação?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 rounded-[10px] py-2 px-3 text-[13px] font-bold bg-background border-[1.5px] border-border"
              >
                Não, voltar
              </button>
              <button
                onClick={confirmAct}
                className={`flex-1 rounded-[10px] py-2 px-3 text-[13px] font-bold ${confirm.s === "cancelado" || confirm.s === "revisao" ? "bg-destructive text-white" : "bg-foreground text-yellow"}`}
              >
                Sim, confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Info({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.06em]">{l}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}
function Label({ children }: any) {
  return <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.06em] mb-1">{children}</div>;
}

// Link import to keep namespace usage even if not used directly
void Link;
