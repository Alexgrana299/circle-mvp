import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

export async function POST(request: Request) {
  if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
    return NextResponse.json({ ok: false, error: "Push no está completamente configurado en Vercel." }, { status: 503 });
  }

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", authData.user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!subscriptions?.length) {
    return NextResponse.json({ ok: false, error: "No encontramos una suscripción push guardada para este dispositivo." }, { status: 409 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const payload = JSON.stringify({
    title: "Circle",
    body: "Notificaciones activadas correctamente.",
    url: "/",
    tag: `circle-test-${Date.now()}`,
  });

  let sent = 0;
  const staleIds: number[] = [];
  const errors: string[] = [];

  await Promise.all(subscriptions.map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 300, urgency: "high" });
      sent += 1;
    } catch (pushError: any) {
      const status = pushError?.statusCode;
      if (status === 404 || status === 410) staleIds.push(subscription.id);
      errors.push(status ? `Push ${status}` : (pushError?.message || "Push error"));
    }
  }));

  if (staleIds.length) await admin.from("push_subscriptions").delete().in("id", staleIds);
  if (!sent) {
    return NextResponse.json({ ok: false, error: errors[0] || "El proveedor push rechazó la prueba." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, sent });
}
