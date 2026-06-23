import webpush from "web-push";

webpush.setVapidDetails(
  "mailto:danilo@r2etiquetas.com.br",
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const { subscriptions, title, body, url } = await req.json();

  const results = await Promise.allSettled(
    subscriptions.map((sub: any) =>
      webpush.sendNotification(sub, JSON.stringify({ title, body, url }))
    )
  );

  return new Response(JSON.stringify({ sent: results.length }), {
    headers: { "Content-Type": "application/json" },
  });
}
