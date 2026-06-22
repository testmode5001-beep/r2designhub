import { useEffect, useMemo, useState, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Pedidos — Vendas x Design" }] }),
  component: AppPage,
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

const MATERIAS = ["Papel couché", "Polietileno", "Cartão couché", "Térmico", "BOPP térmico", "BOPP metalizado", "BOPP Matte", "BOPP brilho", "Nylon resinado"];
const FORMAS = ["Retangular", "Quadrada", "Oval/Elipse", "Recorte especial", "Redonda", "GAP"];
const CORES_OPTS = ["1", "2", "3", "4", "4+PANTONE", "CMYK"];

function AppPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pedidos" | "novo">("pedidos");
  const [profile, setProfile] = useState<{ id: string; nome: string; role: Role } | null>(null);
  const [filtro, setFiltro] = useState<Status | "todos">("todos");
  const [editando, setEditando] = useState<any | null>(null);
  const [deletando, setDeletando] = useState<any | null>(null);
  const [busca, setBusca] = useState("");

  // Load current user profile + role
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

  // Pedidos query
  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ["pedidos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id,numero,cliente,materia,largura,altura,cores,status,vendedor_id,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  // Realtime
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel("pedidos-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, (payload) => {
        qc.invalidateQueries({ queryKey: ["pedidos"] });
        if (profile.role === "designer" && payload.eventType === "INSERT") {
          const p = payload.new as any;
          toast(`Nova solicitação: ${p.cliente}`, {
            description: `${p.materia} · ${p.largura}×${p.altura}mm`,
            icon: "🔔",
            duration: 6000,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, qc]);

  async function doLogout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const stats = useMemo(() => {
    const total = pedidos.length;
    const ativos = pedidos.filter((p: any) => !["concluido", "cancelado"].includes(p.status)).length;
    const concl = pedidos.filter((p: any) => p.status === "concluido").length;
    return { total, ativos, concl };
  }, [pedidos]);

  const filtered = useMemo(() => {
    let list = filtro === "todos" ? pedidos : pedidos.filter((p: any) => p.status === filtro);
    if (busca?.trim()) {
      const q = busca.toLowerCase();
      list = list.filter((p: any) =>
        p.cliente?.toLowerCase().includes(q) ||
        p.materia?.toLowerCase().includes(q) ||
        p.largura?.toString().includes(q) ||
        p.altura?.toString().includes(q) ||
        p.cores?.toString().includes(q) ||
        p.numero?.toString().includes(q)
      );
    }
    return list;
  }, [pedidos, filtro, busca]);

  if (!profile) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  const canCreate = profile.role === "vendedora" || profile.role === "gestor";

  async function deletePedido(id: string) {
    await supabase.from("pedido_anexos").delete().eq("pedido_id", id);
    await supabase.from("pedido_historico").delete().eq("pedido_id", id);
    await supabase.from("pedidos").delete().eq("id", id);
    setDeletando(null);
    qc.invalidateQueries({ queryKey: ["pedidos"] });
    toast.success("Pedido apagado.");
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="max-w-[680px] w-full mx-auto flex items-center justify-between px-[18px] pt-[18px]">
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-muted-foreground">Vendas x Design</div>
          <div className="font-display text-[18px] font-extrabold tracking-[-0.4px] leading-[1.1] truncate">
            {tab === "pedidos" ? "Pedidos" : "Nova solicitação"}
          </div>
        </div>
        <div className="flex items-center gap-[6px] bg-card rounded-[20px] py-1 pl-[6px] pr-[10px] shrink-0" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.09)" }}>
          <div className="w-[22px] h-[22px] rounded-full bg-foreground text-yellow flex items-center justify-center text-[10px] font-extrabold">
            {profile.nome[0]?.toUpperCase()}
          </div>
          <span className="text-xs font-semibold hidden sm:inline">{profile.nome.split(" ")[0]}</span>
          <button onClick={doLogout} className="text-xs font-semibold text-muted-foreground hover:text-foreground pl-2 border-l border-border">Sair</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-[680px] w-full mx-auto flex px-[18px] pt-[10px] gap-[2px] overflow-x-auto">
        <button onClick={() => setTab("pedidos")} className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-[2.5px] transition ${tab === "pedidos" ? "text-foreground border-foreground" : "text-muted-foreground border-transparent"}`}>Pedidos</button>
        {canCreate && (
          <button onClick={() => setTab("novo")} className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-[2.5px] transition ${tab === "novo" ? "text-foreground border-foreground" : "text-muted-foreground border-transparent"}`}>+ Nova</button>
        )}
        {profile.role === "gestor" && (
          <button onClick={() => navigate({ to: "/usuarios" })} className="px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-[2.5px] border-transparent text-muted-foreground hover:text-foreground transition">Usuários</button>
        )}
      </div>

      {/* Content */}
      <div className="px-[18px] py-[14px] flex-1 max-w-[680px] w-full mx-auto pb-8">
        {tab === "pedidos" && (
          <PedidosList
            isLoading={isLoading}
            pedidos={filtered}
            stats={stats}
            filtro={filtro}
            setFiltro={setFiltro}
            busca={busca}
            setBusca={setBusca}
            isGestor={profile.role === "gestor"}
            onEdit={(p: any) => setEditando(p)}
            onDelete={(p: any) => setDeletando(p)}
            onOpen={(id: string) => navigate({ to: "/pedido/$id", params: { id } })}
          />
        )}
        {tab === "novo" && canCreate && (
          <NovoForm
            userId={profile.id}
            onDone={() => { setTab("pedidos"); qc.invalidateQueries({ queryKey: ["pedidos"] }); }}
          />
        )}
      </div>

      {/* Modal confirmar apagar */}
      {deletando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-card rounded-[18px] p-6 w-full max-w-[320px]" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center mb-3 mx-auto">
              <i className="ti ti-trash text-destructive text-xl"></i>
            </div>
            <h2 className="font-display text-[17px] font-extrabold text-center mb-1">Apagar pedido?</h2>
            <p className="text-[12px] text-muted-foreground text-center mb-5">
              Pedido <strong>#{deletando.numero} — {deletando.cliente}</strong> será removido permanentemente.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setDeletando(null)} className="flex-1 rounded-[10px] py-2 px-3 text-[13px] font-bold bg-background border-[1.5px] border-border">
                Cancelar
              </button>
              <button onClick={() => deletePedido(deletando.id)} className="flex-1 rounded-[10px] py-2 px-3 text-[13px] font-bold bg-destructive text-white">
                Apagar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar pedido */}
      {editando && (
        <EditModal pedido={editando} onClose={() => setEditando(null)} onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ["pedidos"] }); }} />
      )}

    </div>
  );
}

function StatusBadge({ s }: { s: Status }) {
  const info = sInfo(s);
  return <span className={`inline-block px-2 py-[3px] rounded-[12px] text-[10px] font-extrabold tracking-[0.03em] ${info.cls}`}>{info.label}</span>;
}

function PedidosList({ isLoading, pedidos, stats, filtro, setFiltro, busca, setBusca, isGestor, onEdit, onDelete, onOpen }: any) {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 mb-[14px]">
        {[
          { n: stats.total, l: "Total" },
          { n: stats.ativos, l: "Ativos" },
          { n: stats.concl, l: "Concluídos" },
        ].map((s, i) => (
          <div key={i} className="bg-card rounded-[10px] py-3 px-[10px] text-center" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
            <div className="font-display text-[24px] font-extrabold leading-none">{s.n}</div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.06em] mt-[2px]">{s.l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-[6px] overflow-x-auto pb-1 mb-3">
        {["todos", ...STATUS_LIST.map((s) => s.key)].map((k) => (
          <button
            key={k}
            onClick={() => setFiltro(k)}
            className={`px-[11px] py-[5px] rounded-[20px] border-[1.5px] text-[11px] font-bold whitespace-nowrap shrink-0 ${filtro === k ? "bg-foreground text-yellow border-foreground" : "bg-card border-border text-foreground"}`}
          >
            {k === "todos" ? "Todos" : sInfo(k as Status).label}
          </button>
        ))}
      </div>

      <div className="relative mb-3">
        <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[14px]"></i>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, material, medidas..."
          className="w-full bg-card rounded-[10px] pl-8 pr-3 py-[9px] text-[13px] border border-border focus:outline-none focus:border-foreground"
          style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04)" }}
        />
        {busca && (
          <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <i className="ti ti-x text-[13px]"></i>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-9 text-muted-foreground">
          <i className="ti ti-inbox text-[34px] block mb-2"></i>
          Nenhum pedido por aqui ainda.
        </div>
      ) : (
        <div className="space-y-2">
          {pedidos.map((p: any) => (
            <div key={p.id} onClick={() => onOpen(p.id)} className={`bg-card rounded-[14px] py-[13px] px-[15px] cursor-pointer hover:opacity-80 border-l-[3px] ${
              p.status === "revisao" ? "border-l-destructive" :
              p.status === "aprovada" ? "border-l-[color:var(--success)]" :
              p.status === "cliche" ? "border-l-[color:var(--warning)]" :
              p.status === "cancelado" ? "border-l-[#999] opacity-70" : "border-l-transparent"
            }`} style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
              <div className="flex justify-between items-start mb-1">
                <div className="text-sm font-bold">{p.cliente}</div>
                <div className="flex items-center gap-1">
                  <StatusBadge s={p.status} />
                  {isGestor && (
                    <div className="flex gap-1 ml-1" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => onEdit(p)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground hover:text-foreground">
                        <i className="ti ti-pencil text-[12px]"></i>
                      </button>
                      <button onClick={() => onDelete(p)} className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <i className="ti ti-trash text-[12px]"></i>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2 mt-1">
                <span>#{p.numero}</span>
                <span>{p.materia}</span>
                <span>{p.largura}×{p.altura}mm</span>
                <span>{p.cores} cor(es)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function EditModal({ pedido, onClose, onSaved }: { pedido: any; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    cliente: pedido.cliente ?? "",
    materia: pedido.materia ?? "",
    larg_materia: pedido.larg_materia ?? "",
    largura: pedido.largura ?? "",
    altura: pedido.altura ?? "",
    forma: pedido.forma ?? "GAP",
    cores: pedido.cores ?? "",
    cores_desc: pedido.cores_desc ?? "",
    descricao: pedido.descricao ?? "",
    link_ref: pedido.link_ref ?? "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("pedidos").update({ ...f }).eq("id", pedido.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido atualizado.");
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-card w-full sm:max-w-[500px] rounded-t-[24px] sm:rounded-[18px] p-5 max-h-[90vh] overflow-y-auto" style={{ boxShadow: "0 -4px 40px rgba(0,0,0,0.18)" }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-[17px] font-extrabold">Editar #{pedido.numero}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><i className="ti ti-x text-lg"></i></button>
        </div>
        <div className="space-y-3">
          {[
            { k: "cliente", label: "Cliente" },
            { k: "larg_materia", label: "Largura MP (mm)" },
            { k: "largura", label: "Largura etiqueta (mm)" },
            { k: "altura", label: "Altura etiqueta (mm)" },
            { k: "cores_desc", label: "Descrição das cores" },
            { k: "descricao", label: "Briefing" },
            { k: "link_ref", label: "Link referência" },
          ].map(({ k, label }) => (
            <div key={k}>
              <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
              <input value={(f as any)[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} className="w-full bg-background border border-border rounded-[10px] px-3 py-2 text-[13px] focus:outline-none focus:border-foreground" />
            </div>
          ))}
          <div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Material</div>
            <Chips options={MATERIAS} value={f.materia} onChange={(v) => setF((s) => ({ ...s, materia: v }))} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Formato</div>
            <Chips options={FORMAS} value={f.forma} onChange={(v) => setF((s) => ({ ...s, forma: v }))} />
          </div>
          <div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Cores</div>
            <Chips options={CORES_OPTS} value={f.cores} onChange={(v) => setF((s) => ({ ...s, cores: v }))} />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 rounded-[10px] py-2 text-[13px] font-bold bg-background border border-border">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-[10px] py-2 text-[13px] font-bold bg-foreground text-yellow">
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NovoForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [f, setF] = useState({
    cliente: "", materia: "", larg_materia: "", largura: "", altura: "",
    forma: "GAP", cores: "", cores_desc: "", descricao: "", link_ref: "", carreiras: ""
  });
  const [anexos, setAnexos] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fields = [
    ["cliente", f.cliente], ["materia", f.materia], ["larg_materia", f.larg_materia],
    ["largura", f.largura], ["altura", f.altura], ["forma", f.forma],
    ["cores", f.cores], ["descricao", f.descricao], ["carreiras", f.carreiras], ["anexos", anexos.length ? "ok" : ""],
  ];
  const completed = fields.filter(([_, v]) => v).length;
  const progress = Math.round((completed / fields.length) * 100);
  const valid = fields.every(([_, v]) => v);

  function setF1<K extends keyof typeof f>(k: K, v: string) { setF((s) => ({ ...s, [k]: v })); }

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    setAnexos((prev) => [...prev, ...files]);
  }

  function removeFile(i: number) { setAnexos((p) => p.filter((_, idx) => idx !== i)); }

  async function submit() {
    if (!valid) { toast.error("Preencha todos os campos obrigatórios"); return; }
    setSending(true);
    try {
      const { data: ped, error } = await supabase.from("pedidos").insert({
        vendedor_id: userId,
        cliente: f.cliente,
        materia: f.materia,
        larg_materia: f.larg_materia,
        largura: f.largura,
        altura: f.altura,
        forma: f.forma,
        cores: f.cores,
        cores_desc: f.cores_desc || null,
        descricao: f.descricao,
        carreiras: f.carreiras,
        link_ref: f.link_ref || null,
        status: "nova",
      }).select("id").single();
      if (error) throw error;

      for (const file of anexos) {
        const path = `${ped.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("pedido-anexos").upload(path, file);
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("pedido_anexos").insert({
          pedido_id: ped.id, user_id: userId, nome: file.name, tipo: "anexo", url: path,
        });
        if (insErr) throw insErr;
      }

      await supabase.from("pedido_historico").insert({ pedido_id: ped.id, user_id: userId, status: "nova", observacao: "Pedido criado" });
      toast.success("Solicitação enviada!");
      setF({ cliente: "", materia: "", larg_materia: "", largura: "", altura: "", forma: "GAP", cores: "", cores_desc: "", descricao: "", link_ref: "", carreiras: ""  });
      setAnexos([]);
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar");
    } finally { setSending(false); }
  }

  return (
    <>
      <Card title="Dados do cliente" icon="ti-building-store">
        <Field label="Nome do cliente" required>
          <input value={f.cliente} onChange={(e) => setF1("cliente", e.target.value)} placeholder="Ex.: Biscoitos Vitória" className="inp" />
        </Field>
      </Card>

      <Card title="Matéria-prima" icon="ti-layers">
        <Label>Material *</Label>
        <Chips options={MATERIAS} value={f.materia} onChange={(v) => setF1("materia", v)} />
        <div className="mt-3">
          <Field label="Largura da matéria-prima (mm)" required>
            <input value={f.larg_materia} onChange={(e) => setF1("larg_materia", e.target.value)} placeholder="Ex.: 620" className="inp" />
          </Field>
        </div>
      </Card>

      <Card title="Medidas da etiqueta" icon="ti-ruler-measure">
        <div className="grid grid-cols-2 gap-[10px]">
          <Field label="Largura (mm)" required>
            <input value={f.largura} onChange={(e) => setF1("largura", e.target.value)} placeholder="80" className="inp" />
          </Field>
          <Field label="Altura (mm)" required>
            <input value={f.altura} onChange={(e) => setF1("altura", e.target.value)} placeholder="60" className="inp" />
          </Field>
        </div>
        <Label>Formato *</Label>
      <Chips options={FORMAS} value={f.forma} onChange={(v) => setF1("forma", v)} />
        <div className="mt-3">
          <Field label="Quantidade de carreiras" required>
            <input value={f.carreiras} onChange={(e) => setF1("carreiras", e.target.value)} placeholder="Ex.: 2" className="inp" />
          </Field>
        </div>
      </Card>
      
      <Card title="Cores de impressão" icon="ti-droplet">
        <Label>Número de cores *</Label>
        <div className="grid grid-cols-3 gap-[6px] mb-2">
          {CORES_OPTS.map((c) => (
            <button key={c} type="button" onClick={() => setF1("cores", c)}
              className={`py-2 px-1 rounded-[10px] border-[1.5px] text-[13px] font-semibold ${f.cores === c ? "bg-foreground text-yellow border-foreground" : "bg-background border-border"}`}>
              {c}
            </button>
          ))}
        </div>
        <Field label="Especificação (opcional)">
          <input value={f.cores_desc} onChange={(e) => setF1("cores_desc", e.target.value)} placeholder="Ex.: Pantone 185 C, preto" className="inp" />
        </Field>
      </Card>

      <Card title="Briefing da arte" icon="ti-message">
        <Field label="Descrição / instruções" required>
          <textarea value={f.descricao} onChange={(e) => setF1("descricao", e.target.value)} placeholder="Descreva a arte: logo, textos, referências..." className="inp min-h-[80px] resize-y" />
        </Field>
        <Field label="Link de referência (opcional)">
          <input value={f.link_ref} onChange={(e) => setF1("link_ref", e.target.value)} placeholder="https://..." className="inp" />
        </Field>
      </Card>

      <Card title="Anexos" icon="ti-paperclip">
        <Label>Arquivos (PDF, imagens) *</Label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,image/*"
          multiple
          onChange={(e) => {
            addFiles(e.target.files);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full block border-2 border-dashed border-border rounded-[10px] p-4 text-center cursor-pointer hover:border-foreground bg-transparent"
        >
          <i className="ti ti-cloud-upload text-2xl text-muted-foreground block mb-1"></i>
          <p className="text-xs text-muted-foreground">Clique para anexar arquivos (faca, referências, fotos...)</p>
        </button>
        {anexos.length > 0 && (
          <ul className="mt-2 space-y-1">
            {anexos.map((file, i) => (
              <li key={i} className="flex items-center gap-2 bg-background border border-border rounded-[8px] px-2 py-1 text-[12px]">
                <i className="ti ti-file"></i>
                <span className="flex-1 truncate">{file.name}</span>
                <button type="button" onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                  <i className="ti ti-x"></i>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="mt-3">
        <div className="h-[3px] bg-border rounded-sm mb-3 overflow-hidden">
          <div className="h-full bg-yellow rounded-sm transition-all" style={{ width: `${progress}%` }} />
        </div>
        <button onClick={submit} disabled={!valid || sending}
          className="w-full bg-yellow text-foreground rounded-[10px] py-3 font-bold text-sm flex items-center justify-center gap-[6px] hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed">
          <i className="ti ti-send"></i> {sending ? "Enviando..." : "Enviar solicitação"}
        </button>
      </div>

      <style>{`.inp{width:100%;background:var(--background);border:1.5px solid var(--border);border-radius:10px;padding:10px 12px;font-family:'Inter',sans-serif;font-size:14px;color:var(--foreground);outline:none}.inp:focus{border-color:var(--foreground)}`}</style>
    </>
  );
}

function Card({ title, icon, children }: any) {
  return (
    <div className="bg-card rounded-[14px] p-4 mb-[10px]" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.04),0 16px 32px -24px rgba(0,0,0,0.22)" }}>
      <div className="font-display text-[15px] font-extrabold mb-3 flex items-center gap-[7px]"><i className={`ti ${icon}`}></i>{title}</div>
      {children}
    </div>
  );
}
function Label({ children }: any) {
  return <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.06em] mb-[5px] block">{children}</label>;
}
function Field({ label, required, children }: any) {
  return (
    <div className="mb-3">
      <Label>{label}{required && <span className="text-destructive ml-[2px]">*</span>}</Label>
      {children}
    </div>
  );
}
function Chips({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-[6px] mt-[3px]">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`py-[6px] px-[11px] rounded-[20px] border-[1.5px] text-xs font-medium whitespace-nowrap ${value === o ? "bg-foreground text-yellow border-foreground" : "bg-background border-border"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}
