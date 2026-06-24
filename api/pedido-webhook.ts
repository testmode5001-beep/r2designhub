import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

webpush.setVapidDetails(
  "mailto:danilo@r2etiquetas.com.br",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STATUS_LABELS: Record<string, string> = {
  nova: "Nova",
  criacao: "Em criação",
  aguardando: "Aguardando aprovação",
  revisao: "Revisão solicitada",
  aprovada: "Arte aprovada",
  cliche: "Clichê solicitado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Valida que a chamada veio do nosso trigger no Supabase, não de qualquer um na internet
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.PEDIDO_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { type, record, old_record } = req.body as {
    type: "INSERT" | "UPDATE";
    record: any;
    old_record: any | null;
  };

  if (!record) return res.status(400).json({ error: "Missing record" });

  let title = "";
  let body = "";

  if (type === "INSERT") {
    title = "Nova solicitação";
    body = `${record.cliente} — ${record.materia} ${record.largura}×${record.altura}mm`;
  } else if (type === "UPDATE") {
    // Só notifica se o status realmente mudou (evita push em toda edição de campo)
    if (old_record && old_record.status === record.status) {
      return res.status(200).json({ skipped: "status unchanged" });
    }
    title = "Pedido atualizado";
    body = `${record.cliente} → ${STATUS_LABELS[record.status] ?? record.status}`;
  } else {
    return res.status(200).json({ skipped: "event type ignored" });
  }

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("subscription");

  if (error) return res.status(500).json({ error: error.message });
  if (!subs?.length) return res.status(200).json({ sent: 0 });

  const results = await Promise.allSettled(
    subs.map((s: any) =>
      webpush.sendNotification(s.subscription, JSON.stringify({ title, body, url: "/app" }))
    )
  );

  return res.status(200).json({ sent: results.length });
}
