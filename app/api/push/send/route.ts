import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

function configured() {
  return Boolean(url && serviceKey && vapidPublic && vapidPrivate);
}

export async function POST(request: Request) {
  if (!configured()) return NextResponse.json({ ok: false, error: "Push no configurado" }, { status: 503 });

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const admin = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const actor = authData.user;
  if (authError || !actor) return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });

  const input = await request.json().catch(() => ({}));
  const recipientId = String(input.recipientId || "");
  const kind = input.kind === "accepted" ? "accepted" : input.kind === "request" ? "request" : "";
  const requestId = Number(input.requestId || 0);
  if (!recipientId || !kind) return NextResponse.json({ ok: false, error: "Solicitud inválida" }, { status: 400 });

  // Poka-yoke anti-spam: a client cannot use this endpoint as an arbitrary push relay.
  // The database must prove that the social action really exists.
  let relationQuery = admin.from("social_requests").select("id,status");
  if (requestId > 0) relationQuery = relationQuery.eq("id", requestId);
  if (kind === "request") {
    relationQuery = relationQuery.eq("sender_id", actor.id).eq("receiver_id", recipientId).eq("status", "pending");
  } else {
    relationQuery = relationQuery.eq("receiver_id", actor.id).eq("sender_id", recipientId).eq("status", "accepted");
  }
  const { data: relation, error: relationError } = await relationQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (relationError || !relation) return NextResponse.json({ ok: false, error: "La acción social no existe o ya no es válida" }, { status: 409 });

  const { data: profile } = await admin.from("profiles").select("display_name").eq("id", actor.id).maybeSingle();
  const actorName = profile?.display_name || "Alguien";
  const body = kind === "request"
    ? `${actorName} quiere saludarte.`
    : `${actorName} aceptó tu saludo. Ya pueden encontrarse.`;

  webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!);
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", recipientId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const payload = JSON.stringify({
    title: "Circle",
    body,
    url: "/",
    tag: kind === "request" ? `circle-request-${relation.id}` : `circle-accepted-${relation.id}`,
  });

  let sent = 0;
  const staleIds: number[] = [];
  await Promise.all((subscriptions || []).map(async subscription => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: 3600, urgency: "high" });
      sent += 1;
    } catch (pushError: any) {
      if (pushError?.statusCode === 404 || pushError?.statusCode === 410) staleIds.push(subscription.id);
    }
  }));

  if (staleIds.length) await admin.from("push_subscriptions").delete().in("id", staleIds);
  return NextResponse.json({ ok: true, sent });
}
