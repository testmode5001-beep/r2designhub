import type { VercelRequest, VercelResponse } from "@vercel/node";
import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:danilo@r2etiquetas.com.br",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subscriptions, title, body, url } = req.body;

  if (!subscriptions?.length) {
    return res.status(400).json({ error: "No subscriptions" });
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub: any) =>
      webpush.sendNotification(sub, JSON.stringify({ title, body, url }))
    )
  );

  return res.status(200).json({ sent: results.length });
}
