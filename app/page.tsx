"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowLeft,
  Bell,
  Camera,
  Check,
  Eye,
  EyeOff,
  Hand,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { hasSupabase, supabase } from "@/lib/supabase";

type Person = {
  id: string;
  name: string;
  initials: string;
  bio: string;
  intent: string;
  interests: string[];
  avatar: string;
  socialStatus: "available" | "busy";
  simulated?: boolean;
};

type View = "landing" | "auth" | "radar" | "profile" | "myProfile" | "requests" | "success";
type AuthMode = "login" | "signup";
type RequestTab = "incoming" | "outgoing";
type LocationIssue = "permission-denied" | "unavailable" | "timeout" | "unsupported";
type LocationAction = "search" | "update" | "save";
type PushState = "idle" | "unsupported" | "needs-install" | "prompt" | "enabled" | "blocked" | "error";

type CropOffset = { x: number; y: number };
type ActiveConversation = {
  id: number;
  otherId: string;
  name: string;
  avatar: string;
  intent: string;
  whereIAm: string;
  whatImWearing: string;
  startedAt: string;
};

type SocialRequest = {
  id: number;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "declined" | "cancelled";
  otherId: string;
  name: string;
  bio: string;
  avatar: string;
  interests: string[];
  intent: string;
  whereIAm: string;
  whatImWearing: string;
  createdAt: string;
};


const moodOptions = ["Socializar", "Entrenar", "Trabajar", "Comer", "Fiesta", "Networking"];
const interestOptions = ["Viajes", "Libros", "Café", "Startups", "Running", "Tecnología", "Música", "Arte", "Negocios", "Cine", "Fotografía", "Deportes", "Mascotas"];

const demoPeople: Person[] = [
  { id: "demo-sofia", name: "Sofía", initials: "S", bio: "Arquitectura. Me gusta leer, viajar y descubrir cafés.", intent: "Socializar", interests: ["Viajes", "Libros", "Café"], avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-diego", name: "Diego", initials: "D", bio: "Emprendimiento, tecnología y running.", intent: "Trabajar", interests: ["Startups", "Tecnología", "Running"], avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-andrea", name: "Andrea", initials: "A", bio: "Diseño, música y conocer gente nueva.", intent: "Socializar", interests: ["Arte", "Música", "Viajes"], avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-carlos", name: "Carlos", initials: "C", bio: "Negocios, fitness y café.", intent: "Entrenar", interests: ["Negocios", "Running", "Café"], avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-fer", name: "Fernanda", initials: "F", bio: "Libros, cine y nuevas experiencias.", intent: "Socializar", interests: ["Libros", "Arte", "Viajes"], avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
];

const CLOUD_RING_GAP = 150;
const CLOUD_FIRST_RING = 165;
const CLOUD_MIN_CHORD = 140;
const CLOUD_EDGE_PADDING = 125;

function seededJitter(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function densityScaleForCount(count: number) {
  if (count <= 12) return 1;
  if (count <= 24) return 0.92;
  if (count <= 40) return 0.84;
  if (count <= 60) return 0.76;
  if (count <= 80) return 0.70;
  return 0.64;
}

function makeCloudLayout(count: number, radarRadius: number) {
  const width = 700;
  const height = 700;
  const centerX = width / 2;
  const centerY = height / 2;

  // Dejamos un margen real dentro de la circunferencia para que ninguna
  // burbuja quede visualmente montada sobre el límite de los 75 m.
  const usableRadius = Math.max(60, radarRadius * 0.78);
  const minCenterRadius = Math.min(54, usableRadius * 0.34);
  const people: Array<{ x: number; y: number }> = [];

  function candidate(seed: number) {
    const angleUnit = (seededJitter(seed) + 1) / 2;
    const radiusUnit = (seededJitter(seed + 17) + 1) / 2;
    const angle = angleUnit * Math.PI * 2;

    // sqrt distribuye uniformemente por área, no en anillos.
    const radius = minCenterRadius + Math.sqrt(radiusUnit) * (usableRadius - minCenterRadius);
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    };
  }

  // Best-candidate sampling: se ve orgánico/desordenado, pero evita
  // aglomeraciones y patrones simétricos. Funciona bien hasta 100 personas.
  for (let i = 0; i < count; i++) {
    let best = candidate((i + 1) * 1009);
    let bestNearest = -1;

    const attempts = count > 60 ? 110 : 150;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const point = candidate((i + 1) * 1009 + attempt * 97);
      const nearest = people.length
        ? Math.min(...people.map(person => Math.hypot(point.x - person.x, point.y - person.y)))
        : Infinity;

      if (nearest > bestNearest) {
        best = point;
        bestNearest = nearest;
      }
    }

    people.push(best);
  }

  return { width, height, centerX, centerY, people };
}

function mapEmbedUrl(coords: { lat: number; lng: number } | null) {
  if (!coords) return "";
  const latSpan = 0.00135;
  const lngSpan = 0.00185;
  const left = coords.lng - lngSpan;
  const right = coords.lng + lngSpan;
  const bottom = coords.lat - latSpan;
  const top = coords.lat + latSpan;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${left},${bottom},${right},${top}`)}&layer=mapnik`;
}

function isProfileComplete(profile: { name: string; bio: string; avatar: string; interests: string[]; mood: string; whereIAm: string; whatImWearing: string }) {
  return Boolean(
    profile.name.trim() &&
    profile.bio.trim() &&
    profile.avatar &&
    profile.interests.length > 0 &&
    profile.mood &&
    profile.whereIAm.trim() &&
    profile.whatImWearing.trim()
  );
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [selected, setSelected] = useState<Person | null>(null);
  const [status, setStatus] = useState("Toca buscar para descubrir quién está disponible.");
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationIssue, setLocationIssue] = useState<LocationIssue | null>(null);
  const [locationAction, setLocationAction] = useState<LocationAction>("search");
  const [locationRetrying, setLocationRetrying] = useState(false);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [whereIAm, setWhereIAm] = useState("");
  const [whatImWearing, setWhatImWearing] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [mood, setMood] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileUpdating, setProfileUpdating] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profilePrompt, setProfilePrompt] = useState("");
  const [pendingPerson, setPendingPerson] = useState<Person | null>(null);
  const [requests, setRequests] = useState<SocialRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestActionId, setRequestActionId] = useState<number | null>(null);
  const [requestNotice, setRequestNotice] = useState("");
  const [requestTab, setRequestTab] = useState<RequestTab>("incoming");
  const [activeConversation, setActiveConversation] = useState<ActiveConversation | null>(null);
  const [conversationEnding, setConversationEnding] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState<ActiveConversation | null>(null);
  const [connectionNoticeRequestId, setConnectionNoticeRequestId] = useState<number | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [pwaHelpOpen, setPwaHelpOpen] = useState(false);
  const [pwaInstallDismissed, setPwaInstallDismissed] = useState(false);
  const [pushState, setPushState] = useState<PushState>("idle");
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState("");

  const [cropSource, setCropSource] = useState("");
  const [cropZoom, setCropZoom] = useState(1);
  const [cropOffset, setCropOffset] = useState<CropOffset>({ x: 0, y: 0 });
  const [cropImageSize, setCropImageSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const cropImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastPresenceCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const requestsRef = useRef<SocialRequest[]>([]);
  const notifiedAcceptedRequestIdsRef = useRef<Set<number>>(new Set());
  const peopleCanvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [radarScanKey, setRadarScanKey] = useState(0);
  const canvasZoomRef = useRef(1);
  const canvasPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const canvasGestureRef = useRef<{
    mode: "idle" | "pan" | "pinch";
    lastX: number;
    lastY: number;
    lastDistance: number;
  }>({ mode: "idle", lastX: 0, lastY: 0, lastDistance: 0 });
  const suppressCanvasClickRef = useRef(false);

  function connectionAckKey(requestId: number) { return `circle_connection_ack_${requestId}`; }
  function isConnectionAcknowledged(requestId: number) {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(connectionAckKey(requestId)) === "1";
  }
  function acknowledgeConnection(requestId: number | null) {
    if (requestId == null || typeof window === "undefined") return;
    window.localStorage.setItem(connectionAckKey(requestId), "1");
    notifiedAcceptedRequestIdsRef.current.add(requestId);
  }

  const radius = Number(process.env.NEXT_PUBLIC_NEARBY_RADIUS_METERS || 75);
  const profileComplete = useMemo(() => isProfileComplete({ name, bio, avatar: avatarUrl, interests, mood, whereIAm, whatImWearing }), [name, bio, avatarUrl, interests, mood, whereIAm, whatImWearing]);
  const nearbyCount = useMemo(() => people.length, [people]);
  const pendingIncomingCount = useMemo(() => requests.filter(r => r.direction === "incoming" && r.status === "pending").length, [requests]);
  const availableNearbyCount = useMemo(() => people.filter(p => p.socialStatus === "available").length, [people]);
  const incomingRequests = useMemo(() => requests.filter(r => r.direction === "incoming"), [requests]);
  const outgoingRequests = useMemo(() => requests.filter(r => r.direction === "outgoing"), [requests]);
  const visibleRequests = requestTab === "incoming" ? incomingRequests : outgoingRequests;

  const locationRadiusPx = useMemo(() => {
    if (!coords) return 158;
    const worldSize = 700;
    const metersPerDegreeLat = 111_320;
    const metersPerDegreeLng = 111_320 * Math.cos((coords.lat * Math.PI) / 180);
    const totalLatMeters = 0.0027 * metersPerDegreeLat;
    const totalLngMeters = 0.0037 * metersPerDegreeLng;
    const pxPerMeterY = worldSize / totalLatMeters;
    const pxPerMeterX = worldSize / Math.max(totalLngMeters, 1);
    return 75 * ((pxPerMeterX + pxPerMeterY) / 2);
  }, [coords?.lat]);

  const cloudLayout = useMemo(
    () => makeCloudLayout(people.length, locationRadiusPx),
    [people.length, locationRadiusPx]
  );
  const peopleDensityScale = useMemo(() => densityScaleForCount(people.length), [people.length]);

  function triggerRadarScan() {
    setRadarScanKey(current => current + 1);
  }

  function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const toRad = (v: number) => v * Math.PI / 180;
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function loadOwnProfile() {
    if (!supabase) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) return;

    const [{ data: profile }, { data: presence }] = await Promise.all([
      supabase.from("profiles").select("display_name,bio,avatar_url,interests,intent").eq("id", user.id).maybeSingle(),
      supabase.from("presence").select("where_i_am,what_im_wearing,specific_location").eq("user_id", user.id).maybeSingle(),
    ]);

    if (profile) {
      setName(profile.display_name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
      setInterests(profile.interests || []);
      setMood(profile.intent || "");
    }
    if (presence) {
      setWhereIAm(presence.where_i_am || presence.specific_location || "");
      setWhatImWearing(presence.what_im_wearing || "");
    }
  }

  async function enterCircle() {
    if (!supabase) {
      setAuthError("Circle necesita estar conectado a Supabase para iniciar sesión.");
      setView("auth");
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      setIsAuthenticated(true);
      await loadOwnProfile();
      await loadRequests(true);
      await searchNearby();
      return;
    }
    setView("auth");
  }

  async function handleAuthSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError("");
    setAuthMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) return setAuthError("Escribe tu correo y contraseña.");
    if (password.length < 6) return setAuthError("La contraseña debe tener al menos 6 caracteres.");
    if (authMode === "signup" && password !== confirmPassword) return setAuthError("Las contraseñas no coinciden.");
    if (!supabase) return setAuthError("Supabase no está configurado. Revisa las variables de entorno.");

    setAuthLoading(true);
    try {
      if (authMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        if (!data.session) throw new Error("No se pudo iniciar la sesión.");
        normalizeViewportAfterInput();
        setIsAuthenticated(true);
        await loadOwnProfile();
        await loadRequests(true);
        await loadActiveConversation(true);
        await searchNearby();
      } else {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
        if (error) throw error;
        if (data.session) {
          normalizeViewportAfterInput();
          setIsAuthenticated(true);
          await loadOwnProfile();
          await loadRequests(true);
          await loadActiveConversation(true);
          await searchNearby();
        } else {
          setAuthMessage("Cuenta creada. Revisa tu correo para confirmar tu cuenta y después inicia sesión.");
          setAuthMode("login");
          setPassword("");
          setConfirmPassword("");
        }
      }
    } catch (error: any) {
      const message = error?.message || "No pudimos completar la solicitud.";
      setAuthError(message.toLowerCase().includes("invalid login credentials") ? "Correo o contraseña incorrectos." : message);
    } finally {
      setAuthLoading(false);
    }
  }

  function isIOSDevice() {
    if (typeof navigator === "undefined") return false;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  }

  function isStandalonePWA() {
    if (typeof window === "undefined") return false;
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  }

  function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string) {
    return Promise.race<T>([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(message)), ms)),
    ]);
  }

  async function ensureServiceWorkerRegistration() {
    if (!("serviceWorker" in navigator)) throw new Error("Este navegador no soporta Service Workers.");
    const registration = await withTimeout(
      navigator.serviceWorker.register("/sw.js", { scope: "/" }),
      8000,
      "No pudimos iniciar el servicio de notificaciones."
    );
    await registration.update().catch(() => undefined);
    if (registration.active) return registration;
    return await withTimeout(
      navigator.serviceWorker.ready,
      8000,
      "Circle no pudo terminar de activar las notificaciones. Cierra la app y vuelve a abrirla."
    );
  }

  function normalizeViewportAfterInput() {
    const active = document.activeElement as HTMLElement | null;
    active?.blur?.();
    window.setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, 80);
  }

  async function installCircle() {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        setPwaInstalled(true);
        setPwaInstallDismissed(false);
        window.localStorage.removeItem("circle:pwa-install-dismissed");
      } else {
        setPwaInstallDismissed(true);
        window.localStorage.setItem("circle:pwa-install-dismissed", "1");
      }
      setInstallPrompt(null);
      return;
    }
    setPwaHelpOpen(true);
  }

  function dismissPwaInstallHelp() {
    setPwaHelpOpen(false);
    setPwaInstallDismissed(true);
    try {
      window.localStorage.setItem("circle:pwa-install-dismissed", "1");
    } catch {}
  }

  async function enablePushNotifications() {
    setPushMessage("");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushState("unsupported");
      setPushMessage("Este navegador no permite notificaciones web push.");
      return;
    }
    if (isIOSDevice() && !isStandalonePWA()) {
      setPushState("needs-install");
      setPwaHelpOpen(true);
      return;
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setPushState("error");
      setPushMessage("Falta configurar NEXT_PUBLIC_VAPID_PUBLIC_KEY en Vercel.");
      return;
    }
    if (!supabase) {
      setPushState("error");
      setPushMessage("Supabase no está disponible.");
      return;
    }

    setPushBusy(true);
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await withTimeout(Notification.requestPermission(), 12000, "iPhone no respondió a la solicitud de notificaciones.");

      if (permission !== "granted") {
        setPushState(permission === "denied" ? "blocked" : "prompt");
        setPushMessage(permission === "denied"
          ? "Las notificaciones están bloqueadas para Circle. Ve a Ajustes > Notificaciones > Circle."
          : "No se activaron las notificaciones.");
        return;
      }

      const registration = await ensureServiceWorkerRegistration();
      let subscription = await withTimeout(
        registration.pushManager.getSubscription(),
        8000,
        "No pudimos revisar la suscripción de este dispositivo."
      );

      if (!subscription) {
        subscription = await withTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey),
          }),
          15000,
          "El servicio push tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo."
        );
      }

      const json = subscription.toJSON();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.user || !json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("No pudimos asociar este iPhone con tu cuenta.");
      }

      const rpcResult = await withTimeout(
        supabase.rpc("save_my_push_subscription", {
          p_endpoint: json.endpoint,
          p_p256dh: json.keys.p256dh,
          p_auth: json.keys.auth,
          p_user_agent: navigator.userAgent,
        }),
        10000,
        "Supabase tardó demasiado en guardar la suscripción."
      );
      if (rpcResult.error) throw rpcResult.error;

      const token = sessionData.session.access_token;
      const response = await withTimeout(
        fetch("/api/push/test", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }),
        15000,
        "La prueba de notificación tardó demasiado."
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "La suscripción se guardó, pero la prueba push falló.");
      }

      setPushState("enabled");
      setPushMessage("Notificaciones activadas. Te enviamos una notificación de prueba.");
    } catch (error: any) {
      setPushState("error");
      setPushMessage(error?.message || "No pudimos activar las notificaciones.");
    } finally {
      setPushBusy(false);
    }
  }

  async function syncExistingPushSubscription() {
    if (!supabase || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = await ensureServiceWorkerRegistration();
      const subscription = await withTimeout(
        registration.pushManager.getSubscription(),
        8000,
        "No pudimos revisar la suscripción."
      );
      if (!subscription) return;
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
      await supabase.rpc("save_my_push_subscription", {
        p_endpoint: json.endpoint,
        p_p256dh: json.keys.p256dh,
        p_auth: json.keys.auth,
        p_user_agent: navigator.userAgent,
      });
    } catch {}
  }

  async function sendPushNotification(recipientId: string, kind: "request" | "accepted", requestId?: number) {
    if (!supabase || !recipientId) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;
      await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipientId, kind, requestId }),
      });
    } catch {
      // Push is a secondary channel; Realtime remains the in-app source of truth.
    }
  }

  async function signOut() {
    const currentSupabase = supabase;
    try {
      if (currentSupabase) {
        const { data } = await currentSupabase.auth.getSession();
        const user = data.session?.user;

        if (user) {
          // Poka-yoke: una sola operación de base de datos termina cualquier conversación
          // activa y marca al usuario como no disponible antes de cerrar Auth.
          await withTimeout(
            currentSupabase.rpc("leave_circle"),
            5000,
            "No pudimos actualizar tu disponibilidad al salir."
          ).catch(() => undefined);
        }

        void (async () => {
          try {
            const registration = await ensureServiceWorkerRegistration();
            const subscription = await withTimeout(registration.pushManager.getSubscription(), 3000, "timeout");
            if (subscription) {
              await withTimeout(
                currentSupabase.rpc("remove_my_push_subscription", { p_endpoint: subscription.endpoint }),
                3500,
                "timeout"
              ).catch(() => undefined);
            }
          } catch {}
        })();

        await withTimeout(currentSupabase.auth.signOut(), 6000, "No pudimos cerrar la sesión en el servidor.");
      }
    } catch {
      try { await currentSupabase?.auth.signOut({ scope: "local" as any }); } catch {}
    } finally {
      setIsAuthenticated(false);
      setPeople(demoPeople);
      setSelected(null);
      setRequests([]);
      requestsRef.current = [];
      notifiedAcceptedRequestIdsRef.current.clear();
      setActiveConversation(null);
      setConnectionNotice(null);
      setConnectionNoticeRequestId(null);
      setName(""); setBio(""); setWhereIAm(""); setWhatImWearing(""); setInterests([]); setMood(""); setAvatarUrl(""); setAvatarBlob(null);
      setEmail(""); setPassword(""); setConfirmPassword("");
      setPushState("idle");
      setPushMessage("");
      normalizeViewportAfterInput();
      setView("landing");
    }
  }

  function registerLocationIssue(error: GeolocationPositionError | null, action: LocationAction) {
    setLocationAction(action);
    if (!navigator.geolocation) {
      setLocationIssue("unsupported");
      return;
    }
    if (!error) {
      setLocationIssue("unavailable");
      return;
    }
    if (error.code === error.PERMISSION_DENIED) setLocationIssue("permission-denied");
    else if (error.code === error.TIMEOUT) setLocationIssue("timeout");
    else setLocationIssue("unavailable");
  }

  function currentLocation(action: LocationAction, options: PositionOptions = { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 }) {
    return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) {
        registerLocationIssue(null, action);
        reject(new Error("Tu navegador no permite obtener la ubicación."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setLocationIssue(null);
          resolve({ lat: coords.latitude, lng: coords.longitude });
        },
        (error) => {
          registerLocationIssue(error, action);
          if (error.code === error.PERMISSION_DENIED) reject(new Error("Circle necesita permiso de ubicación para mostrar personas reales cerca de ti."));
          else if (error.code === error.TIMEOUT) reject(new Error("La ubicación tardó demasiado en responder. Intenta de nuevo."));
          else reject(new Error("No pudimos obtener tu ubicación. Revisa que la ubicación del teléfono esté activada."));
        },
        options
      );
    });
  }

  async function retryLocationAccess() {
    if (locationRetrying) return;
    setLocationRetrying(true);
    setLocationIssue(null);
    try {
      if (locationAction === "update") await updatePresenceAndNearby();
      else if (locationAction === "save") await saveProfile();
      else await searchNearby();
    } finally {
      setLocationRetrying(false);
    }
  }

  function locationHelpText() {
    if (typeof navigator === "undefined") return "Activa la ubicación para este sitio y vuelve a intentarlo.";
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    if (isIOS) return "En iPhone: abre Ajustes > Privacidad y seguridad > Localización y verifica que esté activa. Después revisa el permiso de ubicación de tu navegador para Circle y selecciona Permitir. Vuelve a Circle y toca Intentar de nuevo.";
    if (isAndroid) return "En Android: activa Ubicación en el teléfono. Después abre la información/configuración del sitio en tu navegador, entra a Permisos > Ubicación y selecciona Permitir. Vuelve a Circle y toca Intentar de nuevo.";
    return "Activa la ubicación del equipo y permite el acceso a ubicación para este sitio desde la configuración o el icono de permisos de tu navegador. Después vuelve a Circle y toca Intentar de nuevo.";
  }

  async function searchNearby() {
    setLocating(true);
    setStatus("Buscando personas cerca de ti…");

    try {
      const location = await currentLocation("search", { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 });
      setCoords(location);

      if (!supabase) {
        setPeople(demoPeople);
        setStatus("Personas disponibles cerca de ti.");
        setView("radar");
        triggerRadarScan();
        return;
      }

      await supabase.rpc("update_my_presence_location", { user_lat: location.lat, user_lng: location.lng });
      lastPresenceCoordsRef.current = location;

      const { data, error } = await supabase.rpc("nearby_profiles", {
        user_lat: location.lat,
        user_lng: location.lng,
        radius_meters: radius,
      });

      const realPeople: Person[] = !error && data?.length ? data.map((p: any) => ({
        id: p.id,
        name: p.display_name || "Alguien cerca",
        initials: (p.display_name || "C").slice(0, 1).toUpperCase(),
        bio: p.bio || "Disponible para socializar.",
        intent: p.intent || "Socializar",
        interests: p.interests || [],
        avatar: p.avatar_url || "",
        socialStatus: p.social_status === "busy" ? "busy" : "available",
        simulated: false,
      })) : [];

      setPeople([...realPeople.slice(0, 5), ...demoPeople].slice(0, 10));
      setStatus("Personas disponibles actualizadas.");
      setView("radar");
      triggerRadarScan();
    } catch (error: any) {
      setPeople(demoPeople);
      setStatus(error?.message || "Activa tu ubicación para ver personas reales cerca de ti.");
      setView("radar");
    } finally {
      setLocating(false);
    }
  }

  function openPerson(person: Person) {
    setRequestNotice("");
    setSelected(person);
    setView("profile");
  }

  function openMyProfile(prompt = "") {
    setProfilePrompt(prompt);
    setProfileError("");
    setView("myProfile");
  }

  async function repairMySocialStatus() {
    if (!supabase) return "available";
    try {
      const { data, error } = await supabase.rpc("repair_my_social_status");
      if (error) throw error;
      return data === "busy" ? "busy" : "available";
    } catch {
      return "available";
    }
  }

  async function loadRequests(silent = false): Promise<SocialRequest[]> {
    if (!supabase) return [];
    if (!silent) setRequestsLoading(true);
    try {
      const { data, error } = await supabase.rpc("my_social_requests");
      if (error) throw error;
      const normalized: SocialRequest[] = (data || []).map((r: any) => ({
        id: Number(r.id),
        direction: r.direction,
        status: r.status,
        otherId: r.other_id,
        name: r.display_name || "Usuario Circle",
        bio: r.bio || "Disponible para socializar.",
        avatar: r.avatar_url || "",
        interests: r.interests || [],
        intent: r.intent || "Socializar",
        whereIAm: r.where_i_am || "",
        whatImWearing: r.what_im_wearing || "",
        createdAt: r.created_at,
      }));
      setRequests(normalized);
      requestsRef.current = normalized;
      return normalized;
    } catch (error: any) {
      if (!silent) setRequestNotice(error?.message || "No pudimos cargar tus solicitudes.");
      return [] as SocialRequest[];
    } finally {
      if (!silent) setRequestsLoading(false);
    }
  }

  async function loadActiveConversation(silent = false): Promise<ActiveConversation | null> {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.rpc("my_active_conversation");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const conversation = row ? {
        id: Number(row.conversation_id),
        otherId: row.other_id,
        name: row.display_name || "Usuario Circle",
        avatar: row.avatar_url || "",
        intent: row.intent || "Socializar",
        whereIAm: row.where_i_am || "",
        whatImWearing: row.what_im_wearing || "",
        startedAt: row.started_at,
      } : null;
      setActiveConversation(conversation);
      if (conversation) {
        setPeople(current => current.map(person =>
          person.id === conversation.otherId
            ? { ...person, socialStatus: "busy" as const }
            : person
        ));
      }
      return conversation;
    } catch (error: any) {
      if (!silent) setRequestNotice(error?.message || "No pudimos cargar tu conversación activa.");
      return null;
    }
  }

  async function loadActiveConversationWithRetry(
    fallback?: ActiveConversation | null,
    attempts = 5,
    delayMs = 250
  ): Promise<ActiveConversation | null> {
    // Poka-yoke: después de aceptar, la conversación en BD es la fuente de verdad.
    // En móvil/Reatime puede haber pequeños retrasos de propagación en UI, así que
    // reintentamos en vez de asumir que un primer null significa "sin conversación".
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const conversation = await loadActiveConversation(true);
      if (conversation) return conversation;
      if (attempt < attempts - 1) {
        await new Promise(resolve => window.setTimeout(resolve, delayMs));
      }
    }
    if (fallback) setActiveConversation(fallback);
    return fallback || null;
  }

  function markConversationLocally(conversation: ActiveConversation | null) {
    setActiveConversation(conversation);
    if (!conversation) return;
    // Poka-yoke visual: no esperamos a que nearby_profiles vuelva para reflejar
    // que la contraparte ya está ocupada. El siguiente refresh confirma desde BD.
    setPeople(current => current.map(person =>
      person.id === conversation.otherId
        ? { ...person, socialStatus: "busy" as const }
        : person
    ));
  }

  async function syncSocialState(showAcceptedFeedback = false) {
    if (!supabase) return;

    // Poka-yoke: nunca confiamos ciegamente en social_status.
    // Supabase lo repara si dice busy sin existir una conversación activa.
    await repairMySocialStatus();

    const latest = await loadRequests(true);
    const conversation = await loadActiveConversation(true);
    if (conversation) markConversationLocally(conversation);

    if (showAcceptedFeedback && conversation) {
      // No dependemos de haber observado la transición pending -> accepted.
      // Basta con que exista una solicitud saliente aceptada que corresponda
      // a la conversación activa y que el usuario aún no haya reconocido.
      const accepted = latest
        .filter(request =>
          request.direction === "outgoing" &&
          request.status === "accepted" &&
          request.otherId === conversation.otherId
        )
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

      if (accepted && !isConnectionAcknowledged(accepted.id)) {
        notifiedAcceptedRequestIdsRef.current.add(accepted.id);
        setConnectionNoticeRequestId(accepted.id);
        setConnectionNotice(conversation);
        setRequestNotice(`${accepted.name} aceptó tu solicitud.`);
        // Si A sigue en "Solicitud enviada", el modal aparece encima inmediatamente.
      }
    }

    return { requests: latest, conversation };
  }

  async function endActiveConversation() {
    if (!supabase || !activeConversation) return;
    setConversationEnding(true);
    setRequestNotice("");
    try {
      const confirmedConversation = activeConversation.id > 0
        ? activeConversation
        : await loadActiveConversationWithRetry(activeConversation, 6, 250);
      if (!confirmedConversation || confirmedConversation.id <= 0) {
        throw new Error("La conversación todavía se está sincronizando. Intenta de nuevo en un momento.");
      }
      const { error } = await supabase.rpc("end_conversation", { p_conversation_id: confirmedConversation.id });
      if (error) throw error;
      setActiveConversation(null);
      await repairMySocialStatus();
      setStatus("Conversación finalizada. Vuelves a estar disponible.");
      await loadRequests(true);
      if (coords) await refreshNearbyAt(coords, true);
    } catch (error: any) {
      setRequestNotice(error?.message || "No pudimos finalizar la conversación.");
    } finally {
      setConversationEnding(false);
    }
  }

  async function sendRequest(person: Person) {
    setRequestNotice("");
    if (person.socialStatus === "busy") throw new Error("Esta persona está ocupada en una conversación.");
    if (!person.simulated) {
      const alreadyPending = requestsRef.current.find(r => r.direction === "outgoing" && r.otherId === person.id && r.status === "pending");
      if (alreadyPending) throw new Error("Ya habías enviado un saludo a esta persona. Puedes esperar su respuesta o cancelarlo en Solicitudes → Enviadas.");
    }
    if (!person.simulated && supabase) {
      const { error } = await supabase.rpc("send_social_request", { p_receiver_id: person.id });
      if (error) throw error;
      void sendPushNotification(person.id, "request");
      await loadRequests(true);
    }
    setView("success");

    // Poka-yoke para aceptaciones extremadamente rápidas: no esperamos
    // exclusivamente al evento Realtime para comprobar el estado final.
    if (!person.simulated) window.setTimeout(() => { void syncSocialState(true); }, 250);
  }

  async function respondToRequest(request: SocialRequest, decision: "accepted" | "declined") {
    if (!supabase) return;
    setRequestActionId(request.id);
    setRequestNotice("");
    try {
      const { error } = await supabase.rpc("respond_social_request", { p_request_id: request.id, p_decision: decision });
      if (error) throw error;
      if (decision === "accepted") void sendPushNotification(request.otherId, "accepted", request.id);
      setRequestNotice(decision === "accepted" ? `Aceptaste a ${request.name}. Ahora puede ver cómo encontrarte.` : `Rechazaste la solicitud de ${request.name}.`);
      await loadRequests(true);
      if (decision === "accepted") {
        // Feedback inmediato para quien acepta (B): no debe depender de Realtime.
        const provisional: ActiveConversation = {
          id: -request.id,
          otherId: request.otherId,
          name: request.name,
          avatar: request.avatar,
          intent: request.intent,
          whereIAm: request.whereIAm,
          whatImWearing: request.whatImWearing,
          startedAt: new Date().toISOString(),
        };
        markConversationLocally(provisional);
        setView("radar");

        const confirmed = await loadActiveConversationWithRetry(provisional, 6, 250);
        if (confirmed) markConversationLocally(confirmed);
        await repairMySocialStatus();
        if (coords) await refreshNearbyAt(coords, true);
      }
    } catch (error: any) {
      setRequestNotice(error?.message || "No pudimos actualizar la solicitud.");
    } finally {
      setRequestActionId(null);
    }
  }

  async function cancelRequest(request: SocialRequest) {
    if (!supabase || request.direction !== "outgoing" || request.status !== "pending") return;
    setRequestActionId(request.id);
    setRequestNotice("");
    try {
      const { error } = await supabase.rpc("cancel_social_request", { p_request_id: request.id });
      if (error) throw error;
      setRequestNotice(`Cancelaste el saludo enviado a ${request.name}.`);
      await loadRequests(true);
    } catch (error: any) {
      setRequestNotice(error?.message || "No pudimos cancelar la solicitud.");
    } finally {
      setRequestActionId(null);
    }
  }

  async function requestHello(person: Person) {
    setPendingPerson(person);
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (!session) {
      setView("auth");
      return;
    }
    if (!profileComplete) {
      openMyProfile("Completa tu perfil para que la otra persona pueda decidir si quiere que te acerques.");
      return;
    }
    try {
      await sendRequest(person);
    } catch (error: any) {
      setRequestNotice(error?.message || "No se pudo enviar la solicitud.");
    }
  }

  function choosePhoto() {
    fileInputRef.current?.click();
  }

  function onPhotoSelected(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setProfileError("Selecciona una imagen válida.");
    if (file.size > 12 * 1024 * 1024) return setProfileError("La imagen es demasiado grande. Usa una menor a 12 MB.");
    if (cropSource.startsWith("blob:")) URL.revokeObjectURL(cropSource);
    const objectUrl = URL.createObjectURL(file);
    setCropSource(objectUrl);
    setCropZoom(1);
    setCropOffset({ x: 0, y: 0 });
    setProfileError("");
  }

  function cropGeometry(zoom = cropZoom) {
    const size = 280;
    if (!cropImageSize.width || !cropImageSize.height) return { scale: 1, renderedWidth: size, renderedHeight: size, maxX: 0, maxY: 0 };
    const baseScale = Math.max(size / cropImageSize.width, size / cropImageSize.height);
    const scale = baseScale * zoom;
    const renderedWidth = cropImageSize.width * scale;
    const renderedHeight = cropImageSize.height * scale;
    return {
      scale,
      renderedWidth,
      renderedHeight,
      maxX: Math.max(0, (renderedWidth - size) / 2),
      maxY: Math.max(0, (renderedHeight - size) / 2),
    };
  }

  function clampOffset(offset: CropOffset, zoom = cropZoom): CropOffset {
    const { maxX, maxY } = cropGeometry(zoom);
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  }

  function handleCropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: cropOffset.x, originY: cropOffset.y };
  }

  function handleCropPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current || dragRef.current.pointerId !== e.pointerId) return;
    const next = {
      x: dragRef.current.originX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.originY + (e.clientY - dragRef.current.startY),
    };
    setCropOffset(clampOffset(next));
  }

  function handleCropPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  }

  async function acceptCrop() {
    const image = cropImageRef.current;
    if (!image || !cropImageSize.width || !cropImageSize.height) return;
    const size = 280;
    const { scale, renderedWidth, renderedHeight } = cropGeometry();
    const imageLeft = (size - renderedWidth) / 2 + cropOffset.x;
    const imageTop = (size - renderedHeight) / 2 + cropOffset.y;
    const sx = -imageLeft / scale;
    const sy = -imageTop / scale;
    const sourceSize = size / scale;

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, 640, 640);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    setAvatarBlob(blob);
    setAvatarUrl(canvas.toDataURL("image/jpeg", 0.9));
    if (cropSource.startsWith("blob:")) URL.revokeObjectURL(cropSource);
    setCropSource("");
  }

  async function refreshNearbyAt(location: { lat: number; lng: number }, silent = false) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("nearby_profiles", {
      user_lat: location.lat,
      user_lng: location.lng,
      radius_meters: radius,
    });
    if (error) {
      if (!silent) setStatus(error.message || "No pudimos actualizar las personas cercanas.");
      return;
    }
    const realPeople: Person[] = data?.length ? data.map((p: any) => ({
      id: p.id,
      name: p.display_name || "Alguien cerca",
      initials: (p.display_name || "C").slice(0, 1).toUpperCase(),
      bio: p.bio || "Disponible para socializar.",
      intent: p.intent || "Socializar",
      interests: p.interests || [],
      avatar: p.avatar_url || "",
      socialStatus: p.social_status === "busy" ? "busy" : "available",
      simulated: false,
    })) : [];
    setPeople([...realPeople.slice(0, 5), ...demoPeople].slice(0, 10));
    if (!silent) setStatus(`${realPeople.length ? `${realPeople.length} ${realPeople.length === 1 ? "persona real cerca" : "personas reales cerca"} · ` : ""}Actualizado ahora.`);
  }

  async function updatePresenceAndNearby() {
    setProfileError("");
    triggerRadarScan();
    if (!profileComplete) {
      openMyProfile("Completa tu perfil para activar tu presencia y actualizar las personas cercanas.");
      return;
    }
    if (!supabase) {
      setStatus("Supabase no está conectado.");
      return;
    }
    if (!navigator.geolocation) {
      registerLocationIssue(null, "update");
      setStatus("Tu navegador no permite obtener la ubicación.");
      return;
    }

    setProfileUpdating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");

      const location = await currentLocation("update", { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });

      // “Actualizar” refresca el mood/estatus y la presencia, sin modificar el resto del perfil.
      const { error: moodError } = await supabase.from("profiles").update({ intent: mood }).eq("id", user.id);
      if (moodError) throw moodError;

      const { error: presenceError } = await supabase.from("presence").upsert({
        user_id: user.id,
        location: `POINT(${location.lng} ${location.lat})`,
        where_i_am: whereIAm.trim() || null,
        what_im_wearing: whatImWearing.trim() || null,
        specific_location: [whereIAm.trim(), whatImWearing.trim()].filter(Boolean).join(" · ") || null,
        is_available: true,
        last_seen: new Date().toISOString(),
      });
      if (presenceError) throw presenceError;

      setCoords(location);
      lastPresenceCoordsRef.current = location;
      await refreshNearbyAt(location);
      setView("radar");
    } catch (error: any) {
      setStatus(error?.message || "No pudimos actualizar tu presencia.");
      setView("radar");
    } finally {
      setProfileUpdating(false);
    }
  }

  async function saveProfile() {
    setProfileError("");
    if (!name.trim() || !bio.trim() || !avatarUrl || !interests.length || !mood || !whereIAm.trim() || !whatImWearing.trim()) {
      setProfileError("Completa foto, nombre, Sobre mí, al menos un interés, mood, Dónde me ubico y Qué estoy usando.");
      return;
    }
    if (!supabase) return setProfileError("Supabase no está conectado.");

    setProfileSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");

      let finalAvatarUrl = avatarUrl;
      if (avatarBlob) {
        const path = `${user.id}/avatar.jpg`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, avatarBlob, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true,
        });
        if (uploadError) throw uploadError;
        finalAvatarUrl = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      }

      const { error: profileUpsertError } = await supabase.from("profiles").upsert({
        id: user.id,
        display_name: name.trim(),
        bio: bio.trim(),
        avatar_url: finalAvatarUrl,
        interests,
        intent: mood,
      });
      if (profileUpsertError) throw profileUpsertError;

      let locationForPresence = coords;
      if (!locationForPresence) {
        locationForPresence = await currentLocation("save", { enableHighAccuracy: true, timeout: 8000, maximumAge: 15000 });
        setCoords(locationForPresence);
      }

      const { error: presenceError } = await supabase.from("presence").upsert({
        user_id: user.id,
        location: `POINT(${locationForPresence.lng} ${locationForPresence.lat})`,
        where_i_am: whereIAm.trim(),
        what_im_wearing: whatImWearing.trim(),
        specific_location: `${whereIAm.trim()} · ${whatImWearing.trim()}`,
        is_available: true,
        last_seen: new Date().toISOString(),
      });
      if (presenceError) throw presenceError;

      setAvatarUrl(finalAvatarUrl);
      setAvatarBlob(null);
      setProfilePrompt("");

      const personToRequest = pendingPerson;
      if (personToRequest) {
        await sendRequest(personToRequest);
      } else {
        await searchNearby();
      }
    } catch (error: any) {
      const message = error?.message || "No pudimos guardar tu perfil.";
      setProfileError(message.includes("Bucket not found") ? "Falta crear el bucket de fotos 'avatars' en Supabase. Ejecuta profile_upgrade.sql." : message);
    } finally {
      setProfileSaving(false);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setIsAuthenticated(Boolean(data.session));
      if (data.session) {
        await loadOwnProfile();
        const currentRequests = await loadRequests(true);
        currentRequests.filter(r => r.direction === "outgoing" && r.status === "accepted").forEach(r => notifiedAcceptedRequestIdsRef.current.add(r.id));
        await loadActiveConversation(true);

        // Deep-link de Web Push. La sesión de Supabase ya persistía; lo que faltaba
        // era respetarla antes de decidir qué vista mostrar.
        const params = new URLSearchParams(window.location.search);
        if (params.get("open") === "requests") {
          setRequestTab(params.get("tab") === "outgoing" ? "outgoing" : "incoming");
          setView("requests");
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsAuthenticated(Boolean(session));
      if (session) {
        await repairMySocialStatus();
        await loadRequests(true);
        await loadActiveConversation(true);
        // Si una aceptación ocurrió mientras la app estaba cerrada,
        // la detectamos al restaurar la sesión en lugar de marcarla como "ya vista".
        await syncSocialState(true);

        const params = new URLSearchParams(window.location.search);
        if (params.get("open") === "requests") {
          setRequestTab(params.get("tab") === "outgoing" ? "outgoing" : "incoming");
          setView("requests");
          window.history.replaceState({}, "", window.location.pathname);
        }
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!isAuthenticated || !client) return;
    let cancelled = false;
    let channel: any = null;

    const subscribe = async () => {
      const { data } = await client.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId || cancelled) return;

      channel = client
        .channel(`circle-social-${userId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "social_requests", filter: `receiver_id=eq.${userId}` },
          async () => {
            await syncSocialState(false);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "social_requests", filter: `sender_id=eq.${userId}` },
          async (payload: any) => {
            const next = payload?.new as { id?: number; status?: string; sender_id?: string } | undefined;
            await syncSocialState(next?.status === "accepted");
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversation_members", filter: `user_id=eq.${userId}` },
          async () => {
            await syncSocialState(true);
            if (view === "radar" && coords) await refreshNearbyAt(coords, true);
          }
        )
        .subscribe();
    };

    subscribe();
    return () => {
      cancelled = true;
      if (channel) client.removeChannel(channel);
    };
  }, [isAuthenticated, view, coords?.lat, coords?.lng]);

  useEffect(() => {
    // Mientras el emisor está mirando "Solicitud enviada", comprobamos rápido
    // el estado como segunda capa de seguridad además de Realtime.
    if (!isAuthenticated || view !== "success" || !pendingPerson || pendingPerson.simulated) return;
    let stopped = false;

    const check = async () => {
      if (stopped) return;
      await syncSocialState(true);
    };

    void check();
    const timer = window.setInterval(check, 2000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [isAuthenticated, view, pendingPerson?.id]);

  useEffect(() => {
    const client = supabase;
    if (!isAuthenticated || !client) return;

    const resync = async () => {
      if (document.visibilityState === "hidden") return;
      await syncSocialState(true);
      if (view === "radar" && coords) await refreshNearbyAt(coords, true);
    };

    const onVisibility = () => { if (document.visibilityState === "visible") void resync(); };
    window.addEventListener("focus", resync);
    document.addEventListener("visibilitychange", onVisibility);

    const timer = window.setInterval(async () => {
      await syncSocialState(true);
      if (view === "radar" && coords) await refreshNearbyAt(coords, true);
    }, 15000);

    return () => {
      window.removeEventListener("focus", resync);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [isAuthenticated, view, coords?.lat, coords?.lng]);

  useEffect(() => {
    const client = supabase;
    if (!isAuthenticated || !profileComplete || !client || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async ({ coords: next }) => {
        const nextCoords = { lat: next.latitude, lng: next.longitude };
        const previous = lastPresenceCoordsRef.current || coords;

        if (previous && distanceMeters(previous, nextCoords) < 25) return;

        lastPresenceCoordsRef.current = nextCoords;
        setCoords(nextCoords);

        await client.rpc("update_my_presence_location", {
          user_lat: nextCoords.lat,
          user_lng: nextCoords.lng,
        });

        if (view === "radar") {
          await refreshNearbyAt(nextCoords, true);
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) registerLocationIssue(error, "update");
      },
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isAuthenticated, profileComplete, view, coords?.lat, coords?.lng]);

  function centerPeopleCanvas() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const current = peopleCanvasRef.current;
        if (!current) return;
        current.scrollLeft = Math.max(0, (current.scrollWidth - current.clientWidth) / 2);
        current.scrollTop = Math.max(0, (current.scrollHeight - current.clientHeight) / 2);
      });
    });
  }

  function minimumRadarZoom() {
    // Mantiene las burbujas físicamente dentro del círculo incluso en el
    // nivel de zoom más abierto permitido para esa densidad.
    const screenBubbleRadius = 43 * peopleDensityScale;
    const worldMargin = Math.max(18, locationRadiusPx * 0.22);
    return Math.max(0.72, screenBubbleRadius / worldMargin);
  }

  function setComfortableCanvasZoom() {
    const el = peopleCanvasRef.current;
    if (!el) return;

    // Con poca gente mostramos contexto. Conforme aumenta la densidad,
    // "entramos" al radar para darle más superficie visual a las personas.
    const densityBoost =
      people.length <= 10 ? 1 :
      people.length <= 20 ? 1.18 :
      people.length <= 35 ? 1.42 :
      people.length <= 50 ? 1.72 :
      people.length <= 75 ? 2.08 :
      2.42;

    const baseDiameter = Math.min(el.clientWidth * 1.22, el.clientHeight * 0.78);
    const baseZoom = baseDiameter / Math.max(locationRadiusPx * 2, 1);
    const nextZoom = Math.min(4.6, Math.max(minimumRadarZoom(), baseZoom * densityBoost));

    canvasZoomRef.current = nextZoom;
    setCanvasZoom(nextZoom);
    centerPeopleCanvas();
  }

  function applyCanvasZoom(nextValue: number, anchorX?: number, anchorY?: number) {
    const el = peopleCanvasRef.current;
    if (!el) return;

    const oldZoom = canvasZoomRef.current;
    const nextZoom = Math.min(4.8, Math.max(minimumRadarZoom(), Number(nextValue.toFixed(3))));
    if (Math.abs(nextZoom - oldZoom) < 0.002) return;

    const localX = anchorX ?? el.clientWidth / 2;
    const localY = anchorY ?? el.clientHeight / 2;
    const contentX = el.scrollLeft + localX;
    const contentY = el.scrollTop + localY;
    const ratio = nextZoom / oldZoom;

    canvasZoomRef.current = nextZoom;
    setCanvasZoom(nextZoom);

    window.requestAnimationFrame(() => {
      const current = peopleCanvasRef.current;
      if (!current) return;
      current.scrollLeft = Math.max(0, contentX * ratio - localX);
      current.scrollTop = Math.max(0, contentY * ratio - localY);
    });
  }

  function canvasPointerDistance() {
    const points = Array.from(canvasPointersRef.current.values());
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function canvasPointerMidpoint(el: HTMLDivElement) {
    const points = Array.from(canvasPointersRef.current.values());
    if (points.length < 2) return { x: el.clientWidth / 2, y: el.clientHeight / 2 };
    const rect = el.getBoundingClientRect();
    return {
      x: (points[0].x + points[1].x) / 2 - rect.left,
      y: (points[0].y + points[1].y) / 2 - rect.top,
    };
  }

  function handleCanvasPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    canvasPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (canvasPointersRef.current.size >= 2) {
      canvasGestureRef.current = {
        mode: "pinch",
        lastX: 0,
        lastY: 0,
        lastDistance: canvasPointerDistance(),
      };
      return;
    }

    canvasGestureRef.current = { mode: "pan", lastX: e.clientX, lastY: e.clientY, lastDistance: 0 };
    suppressCanvasClickRef.current = false;
  }

  function handleCanvasPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!canvasPointersRef.current.has(e.pointerId)) return;
    const el = e.currentTarget;
    canvasPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (canvasPointersRef.current.size >= 2) {
      e.preventDefault();
      const distance = canvasPointerDistance();
      const previousDistance = canvasGestureRef.current.lastDistance || distance;
      if (previousDistance > 0 && distance > 0) {
        const midpoint = canvasPointerMidpoint(el);
        applyCanvasZoom(canvasZoomRef.current * (distance / previousDistance), midpoint.x, midpoint.y);
        if (Math.abs(distance - previousDistance) > 1) suppressCanvasClickRef.current = true;
      }
      canvasGestureRef.current.mode = "pinch";
      canvasGestureRef.current.lastDistance = distance;
      return;
    }

    if (canvasGestureRef.current.mode !== "pan") return;
    const dx = e.clientX - canvasGestureRef.current.lastX;
    const dy = e.clientY - canvasGestureRef.current.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      e.preventDefault();
      suppressCanvasClickRef.current = true;
      el.scrollLeft -= dx;
      el.scrollTop -= dy;
    }
    canvasGestureRef.current.lastX = e.clientX;
    canvasGestureRef.current.lastY = e.clientY;
  }

  function handleCanvasPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    canvasPointersRef.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    const remaining = Array.from(canvasPointersRef.current.values());
    if (remaining.length >= 2) {
      canvasGestureRef.current.mode = "pinch";
      canvasGestureRef.current.lastDistance = canvasPointerDistance();
    } else if (remaining.length === 1) {
      canvasGestureRef.current = { mode: "pan", lastX: remaining[0].x, lastY: remaining[0].y, lastDistance: 0 };
    } else {
      canvasGestureRef.current.mode = "idle";
      canvasGestureRef.current.lastDistance = 0;
    }
  }

  function handleCanvasClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressCanvasClickRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    suppressCanvasClickRef.current = false;
  }

  useEffect(() => {
    if (view !== "radar") return;
    const initialFit = () => setComfortableCanvasZoom();
    const frame = window.requestAnimationFrame(initialFit);
    window.addEventListener("resize", initialFit);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", initialFit);
    };
  }, [view, cloudLayout.width, cloudLayout.height, people.length]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone = isStandalonePWA();
    setPwaInstalled(standalone);
    try {
      setPwaInstallDismissed(window.localStorage.getItem("circle:pwa-install-dismissed") === "1");
    } catch {}

    if (standalone) {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> };
      orientation?.lock?.("portrait-primary").catch(() => undefined);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(registration => registration.update().catch(() => undefined))
        .catch(() => {
          setPushState("error");
          setPushMessage("Circle no pudo registrar el servicio de notificaciones.");
        });
    }

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as any);
    };
    const installed = () => {
      setPwaInstalled(true);
      setPwaInstallDismissed(false);
      try { window.localStorage.removeItem("circle:pwa-install-dismissed"); } catch {}
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);

    if ("Notification" in window) {
      if (Notification.permission === "granted") setPushState("enabled");
      else if (Notification.permission === "denied") setPushState("blocked");
      else setPushState(isIOSDevice() && !isStandalonePWA() ? "needs-install" : "prompt");
    } else {
      setPushState("unsupported");
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (count?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (!pwaInstalled) return;
    if (pendingIncomingCount > 0) nav.setAppBadge?.(pendingIncomingCount).catch(() => undefined);
    else nav.clearAppBadge?.().catch(() => undefined);
  }, [pendingIncomingCount, pwaInstalled]);

  useEffect(() => {
    if (!isAuthenticated || pushState !== "enabled") return;
    void syncExistingPushSubscription();
  }, [isAuthenticated, pushState]);

  useEffect(() => {
    if (!locationIssue) return;
    const retryWhenVisible = () => {
      if (document.visibilityState === "visible") {
        window.setTimeout(() => { void retryLocationAccess(); }, 350);
      }
    };
    document.addEventListener("visibilitychange", retryWhenVisible);
    return () => document.removeEventListener("visibilitychange", retryWhenVisible);
  }, [locationIssue, locationAction]);

  return (
    <main className={`page-shell ${view === "radar" ? "radar-page-shell" : ""}`}>
      <div className="glow glow-one" />
      <div className="glow glow-two" />
      <section className={`phone-card ${view === "radar" ? "radar-mode" : ""}`}>
        <header className="topbar">
          <button className="brand" onClick={() => setView("landing")}>Circle</button>
          <div className="topbar-actions">
            {isAuthenticated && view !== "landing" && view !== "auth" && (
              <>
                <button className="notification-button" onClick={async () => { await loadRequests(); setView("requests"); }} aria-label="Solicitudes" title="Solicitudes">
                  <Bell size={18}/>
                  {pendingIncomingCount > 0 && <span className="notification-badge">{pendingIncomingCount > 9 ? "9+" : pendingIncomingCount}</span>}
                </button>
                <button className="logout-button" onClick={signOut} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={17}/></button>
              </>
            )}
          </div>
        </header>

        {view === "landing" && (
          <div className="landing content-pad">
            <div className="eyebrow"><Sparkles size={16}/> Conoce a quien ya está aquí</div>
            <h1>¿Quién está abierto a <span>hablar contigo</span> cerca?</h1>
            <p className="lead">Circle elimina la parte incómoda de iniciar una conversación: primero sabes quién sí quiere que te acerques.</p>
            <div className="mini-cloud" aria-label="Vista previa de personas cercanas">
              {demoPeople.slice(0,4).map((p, i) => <img key={p.id} src={p.avatar} alt="Perfil" className={`mini-avatar a${i+1}`} />)}
              <div className="you-dot">Tú</div>
            </div>
            <button className="primary hero-button" onClick={enterCircle}><Radio size={20}/>{isAuthenticated ? "Entrar a Circle" : "Buscar gente para socializar"}</button>
            <p className="microcopy"><MapPin size={14}/> Usamos tu ubicación para saber quién está en tu zona, nunca para mostrar tu posición exacta.</p>
            {!hasSupabase && <div className="dev-note">Conecta Supabase para usar cuentas y perfiles reales.</div>}
          </div>
        )}

        {view === "auth" && (
          <div className="content-pad auth-screen">
            <button className="back" onClick={() => setView("landing")}><ArrowLeft size={20}/> Volver</button>
            <span className="subtle">Tu cuenta Circle</span>
            <h2>{authMode === "login" ? "Bienvenido de vuelta" : "Crea tu cuenta"}</h2>
            <p>{authMode === "login" ? "Inicia sesión para ver quién está disponible cerca de ti." : "Solo necesitas correo y contraseña. Tu perfil social lo completarás después."}</p>
            <div className="auth-tabs" role="tablist" aria-label="Acceso a Circle">
              <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); setAuthMessage(""); }}>Iniciar sesión</button>
              <button type="button" className={authMode === "signup" ? "active" : ""} onClick={() => { setAuthMode("signup"); setAuthError(""); setAuthMessage(""); }}>Crear cuenta</button>
            </div>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>Correo electrónico<div className="input-with-icon"><Mail size={18}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@correo.com" /></div></label>
              <label>Contraseña<div className="input-with-icon password-field"><input type={showPassword ? "text" : "password"} autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
              {authMode === "signup" && <label>Confirmar contraseña<div className="input-with-icon"><input type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Repite tu contraseña" /></div></label>}
              {authError && <div className="auth-feedback error">{authError}</div>}
              {authMessage && <div className="auth-feedback success">{authMessage}</div>}
              <button className="primary" type="submit" disabled={authLoading}>{authLoading ? "Procesando…" : authMode === "login" ? "Iniciar sesión" : "Crear cuenta"}</button>
            </form>
            <p className="microcopy center"><ShieldCheck size={14}/> Tu correo se usa para tu cuenta; no se muestra públicamente en Circle.</p>
          </div>
        )}

        {view === "radar" && (
          <div className="radar-screen">
            <div className="people-cloud-frame radar-map-stage" aria-label="Personas disponibles cerca. La posición de las burbujas es ilustrativa.">
              <div
                className="people-cloud-scroll"
                ref={peopleCanvasRef}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                onClickCapture={handleCanvasClickCapture}
              >
                <div className="people-cloud-world" style={{ width: `max(100%, ${Math.round(cloudLayout.width * canvasZoom)}px)`, height: `max(100%, ${Math.round(cloudLayout.height * canvasZoom)}px)` }}>
                  <div className="people-cloud-scale-layer" style={{ width: `${cloudLayout.width * canvasZoom}px`, height: `${cloudLayout.height * canvasZoom}px` }}>
                    <div className="people-cloud-canvas" style={{ width: `${cloudLayout.width}px`, height: `${cloudLayout.height}px`, transform: `scale(${canvasZoom})` }}>
                      {coords && (
                        <>
                          <iframe
                            className="social-map-background social-map-world"
                            title="Mapa de referencia de tu zona"
                            src={mapEmbedUrl(coords)}
                            loading="lazy"
                            tabIndex={-1}
                            aria-hidden="true"
                          />
                          <div className="map-gray-wash" aria-hidden="true" />
                          <div
                            className="my-location-radius"
                            aria-hidden="true"
                            style={{
                              left: `${cloudLayout.centerX}px`,
                              top: `${cloudLayout.centerY}px`,
                              width: `${locationRadiusPx * 2}px`,
                              height: `${locationRadiusPx * 2}px`,
                            }}
                          />
                          {radarScanKey > 0 && (
                            <div
                              key={radarScanKey}
                              className="map-radar-scan"
                              aria-hidden="true"
                              style={{
                                left: `${cloudLayout.centerX}px`,
                                top: `${cloudLayout.centerY}px`,
                                width: `${locationRadiusPx * 2}px`,
                                height: `${locationRadiusPx * 2}px`,
                              }}
                            >
                              <span className="radar-sweep" />
                            </div>
                          )}
                          <div
                            className="my-location-dot"
                            aria-label="Tu ubicación aproximada"
                            style={{ left: `${cloudLayout.centerX}px`, top: `${cloudLayout.centerY}px` }}
                          >
                            <span />
                          </div>
                        </>
                      )}
                      {people.map((p, i) => (
                        <button key={p.id} className={`person-bubble ${p.socialStatus === "busy" ? "busy" : ""} ${people.length > 40 ? "dense" : ""} ${people.length > 70 ? "very-dense" : ""}`} style={{ left: `${cloudLayout.people[i].x}px`, top: `${cloudLayout.people[i].y}px`, transform: `translate(-50%, -50%) scale(${peopleDensityScale / canvasZoom})` }} onClick={() => openPerson(p)}>
                          <span className="intent-tag">{p.intent}</span>
                          {profileComplete && p.avatar ? <img src={p.avatar} alt={p.name}/> : <span className="avatar-fallback locked-avatar"><UserRound size={28}/></span>}
                          <strong>{p.name}</strong><small>{p.socialStatus === "busy" ? "Ocupado" : "Disponible"}</small>
                        </button>
                      ))}
                      <button className={`my-bubble ${activeConversation ? "busy" : ""}`} style={{ left: `${cloudLayout.centerX}px`, top: `${cloudLayout.centerY}px`, transform: `translate(-50%, -50%) scale(${1 / canvasZoom})` }} onClick={() => openMyProfile()} aria-label="Abrir mi perfil">
                        {avatarUrl ? <img src={avatarUrl} alt="Tu perfil"/> : <span className="my-avatar-empty"><UserRound size={30}/></span>}
                        <strong>Tú</strong>
                        <small>{profileComplete ? (activeConversation ? "Ocupado" : mood) : "Completar perfil"}</small>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="cloud-note">{people.length > 20 ? `${people.length} cerca · ` : ""}{Math.round(canvasZoom * 100)}% · pellizca para zoom · arrastra para explorar</div>
            </div>

            <div className="radar-floating-stack">
              <div className="nearby-floating-card">
                <span className="subtle">Personas cerca de ti</span>
                <h2>{nearbyCount} personas cerca</h2>
                <small className="nearby-summary">{availableNearbyCount} disponibles{nearbyCount - availableNearbyCount > 0 ? ` · ${nearbyCount - availableNearbyCount} ocupadas` : ""}</small>
                {status && <div className="status-line">{status}</div>}
              </div>

              {((!pwaInstalled && !pwaInstallDismissed) || (pwaInstalled && pushState !== "enabled")) && (
                <div className="pwa-setup-card radar-overlay-card">
                  <div className="pwa-setup-icon"><Bell size={19}/></div>
                  <div className="pwa-setup-copy">
                    <strong>{!pwaInstalled && isIOSDevice() ? "Instala Circle en tu inicio" : pushState === "enabled" ? "Circle instalado" : "No te pierdas un saludo"}</strong>
                    <span>{!pwaInstalled && isIOSDevice() ? "Instálala para usar Circle como app y recibe notificaciones en tu celular." : "Activa notificaciones para enterarte cuando alguien quiera saludarte o acepte tu solicitud."}</span>
                    {pushMessage && <small>{pushMessage}</small>}
                  </div>
                  {!pwaInstalled && isIOSDevice()
                    ? <button type="button" onClick={installCircle}>Cómo instalar</button>
                    : pushState !== "enabled" && <button type="button" onClick={enablePushNotifications} disabled={pushBusy}>{pushBusy ? "Activando…" : "Activar"}</button>}
                </div>
              )}

              {activeConversation && (
                <div className="conversation-banner radar-overlay-card">
                  <div className="conversation-icon"><MessageCircle size={19}/></div>
                  <div><span>Estás conversando con</span><strong>{activeConversation.name}</strong><small>{activeConversation.whereIAm || activeConversation.whatImWearing
                    ? [activeConversation.whereIAm && `Dónde: ${activeConversation.whereIAm}`, activeConversation.whatImWearing && `Usa: ${activeConversation.whatImWearing}`].filter(Boolean).join(" · ")
                    : "Conversación activa"}</small></div>
                  <button type="button" onClick={endActiveConversation} disabled={conversationEnding || activeConversation.id <= 0}>{conversationEnding ? "Finalizando…" : activeConversation.id <= 0 ? "Sincronizando…" : "Plática concluida"}</button>
                </div>
              )}

              {pendingIncomingCount > 0 && (
                <button className="incoming-alert radar-overlay-card" onClick={async () => { await loadRequests(); setView("requests"); }}>
                  <Bell size={18}/><div><strong>{pendingIncomingCount === 1 ? "Alguien quiere saludarte" : `${pendingIncomingCount} personas quieren saludarte`}</strong><span>Toca para revisar la solicitud.</span></div><span className="incoming-alert-arrow">›</span>
                </button>
              )}
            </div>

            <div className="radar-update-zone radar-update-floating">
              <button className="profile-update-button" type="button" onClick={updatePresenceAndNearby} disabled={profileUpdating || locating}>
                <RefreshCw size={19} className={profileUpdating ? "spin" : ""}/>
                {profileUpdating ? "Actualizando…" : "Actualizar"}
              </button>
              <p>Actualiza tu ubicación, estado y las personas que aparecen en tu entorno.</p>
            </div>
          </div>
        )}

        {view === "profile" && selected && (
          <div className="content-pad profile-screen">
            <button className="back" onClick={() => setView("radar")}><ArrowLeft size={20}/> Personas cerca</button>
            <div className="profile-avatar-wrap">
              {profileComplete && selected.avatar ? <img src={selected.avatar} alt={selected.name}/> : <div className="profile-photo-locked"><UserRound size={42}/><span>Completa tu perfil para ver fotos</span></div>}
              <span>{selected.intent}</span>
            </div>
            <h2>{selected.name}</h2><p>{selected.bio}</p>
            <div className={`availability-pill ${selected.socialStatus === "busy" ? "busy" : ""}`}><span className="availability-dot"/> {selected.socialStatus === "busy" ? "Ocupado en una conversación" : "Disponible cerca de ti"}</div>
            <div className="section-card"><span className="section-label">Intereses</span><div className="chips">{selected.interests.map(x => <span key={x}>{x}</span>)}</div></div>
            <div className="permission-copy"><Hand size={22}/><div><strong>No mostramos dónde está exactamente.</strong><span>“Dónde me ubico” y “Qué estoy usando” permanecen ocultos hasta que exista consentimiento. Quien recibe una solicitud sí puede identificar primero a quien la envió.</span></div></div>
            {requestNotice && <div className="auth-feedback error">{requestNotice}</div>}
            {selected.socialStatus === "busy" ? <button className="primary busy-disabled" disabled><MessageCircle size={19}/> Ocupado</button> : activeConversation ? <button className="primary busy-disabled" disabled><MessageCircle size={19}/> Estás ocupado</button> : <button className="primary" onClick={() => requestHello(selected)}><Hand size={19}/> Quiero saludarle</button>}
          </div>
        )}

        {view === "myProfile" && (
          <div className="content-pad onboarding-screen my-profile-screen">
            <button className="back" onClick={() => { setProfilePrompt(""); setPendingPerson(null); setView("radar"); }}><ArrowLeft size={20}/> Personas cerca</button>
            <span className="subtle">Mi perfil</span><h2>{profileComplete ? "Tu perfil Circle" : "Completa tu perfil"}</h2>
            {profilePrompt ? <div className="profile-prompt"><ShieldCheck size={18}/><span>{profilePrompt}</span></div> : <p>Esta es la información que las personas cercanas usan para decidir si quieren conocerte.</p>}

            <input ref={fileInputRef} className="hidden-file-input" type="file" accept="image/*" onChange={e => { onPhotoSelected(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            <button type="button" className={`avatar-picker ${avatarUrl ? "has-photo" : ""}`} onClick={choosePhoto}>
              {avatarUrl ? <img src={avatarUrl} alt="Tu selfie"/> : <><Camera size={28}/><strong>Selfie</strong><span>Agregar foto desde tu galería</span></>}
              {avatarUrl && <span className="avatar-edit-badge"><Camera size={16}/></span>}
            </button>
            <p className="avatar-help">Tu foto ayudará a otros usuarios a reconocerte fácilmente.</p>

            <label>Nombre<input value={name} onChange={e => setName(e.target.value)} placeholder="Ej Armando, Sofia"/></label>
            <label>Sobre mí<textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Lo que compartas aquí ayudará a otros a romper el hielo contigo."/></label>

            <div className="field-label">Mood</div>
            <div className="chips selectable mood-grid">{moodOptions.map(x => <button type="button" key={x} className={mood === x ? "selected" : ""} onClick={() => setMood(x)}>{x}</button>)}</div>

            <div className="field-label">Intereses <span className="optional">(elige hasta 5)</span></div>
            <div className="chips selectable">{interestOptions.map(x => <button type="button" key={x} className={interests.includes(x) ? "selected" : ""} onClick={() => setInterests(v => v.includes(x) ? v.filter(i => i !== x) : v.length < 5 ? [...v, x] : v)}>{x}</button>)}</div>

            <label>Dónde me ubico<input value={whereIAm} onChange={e => setWhereIAm(e.target.value)} placeholder="Ej. Biblioteca, tercer piso, al lado de la ventana" required/></label>
            <label>Qué estoy usando<input value={whatImWearing} onChange={e => setWhatImWearing(e.target.value)} placeholder="Ej. Playera blanca, jeans azules" required/></label>
            <p className="privacy-hint"><ShieldCheck size={14}/> Estos datos permanecen ocultos. Solo quien reciba una solicitud tuya podrá verlos; si tú recibes una solicitud, la otra persona solo los verá después de que aceptes.</p>

            {profileError && <div className="auth-feedback error">{profileError}</div>}
            <button className="primary" onClick={saveProfile} disabled={profileSaving}>{profileSaving ? "Guardando…" : pendingPerson ? "Guardar y enviar solicitud" : "Guardar perfil"}</button>
            <p className="microcopy center">Las fotos de otras personas se desbloquean cuando completas tu perfil.</p>

          </div>
        )}

        {view === "requests" && (
          <div className="content-pad requests-screen">
            <button className="back" onClick={() => setView("radar")}><ArrowLeft size={20}/> Personas cerca</button>
            <span className="subtle">Solicitudes</span>
            <h2>{requestTab === "incoming" && pendingIncomingCount ? `${pendingIncomingCount} ${pendingIncomingCount === 1 ? "persona quiere" : "personas quieren"} saludarte` : "Tus invitaciones"}</h2>
            <div className="request-tabs" role="tablist" aria-label="Tipo de solicitudes">
              <button type="button" className={requestTab === "incoming" ? "active" : ""} onClick={() => { setRequestTab("incoming"); setRequestNotice(""); }}>Recibidas <span>{incomingRequests.length}</span></button>
              <button type="button" className={requestTab === "outgoing" ? "active" : ""} onClick={() => { setRequestTab("outgoing"); setRequestNotice(""); }}>Enviadas <span>{outgoingRequests.length}</span></button>
            </div>
            <p>{requestTab === "incoming" ? "Antes de aceptar puedes identificar a quien quiere acercarse. Tus datos para encontrarte siguen ocultos hasta que tú aceptes." : "Aquí puedes revisar tus saludos enviados y cancelar los que sigan pendientes."}</p>
            {requestNotice && <div className="auth-feedback success">{requestNotice}</div>}
            {requestsLoading ? <div className="requests-empty">Cargando solicitudes…</div> : visibleRequests.length === 0 ? <div className="requests-empty"><Hand size={26}/><strong>{requestTab === "incoming" ? "Aún no tienes solicitudes recibidas" : "Aún no has enviado saludos"}</strong><span>{requestTab === "incoming" ? "Cuando alguien quiera saludarte aparecerá aquí." : "Los saludos que envíes aparecerán aquí."}</span></div> : (
              <div className="request-list">
                {visibleRequests.map(request => (
                  <article className={`request-card ${request.direction === "outgoing" && request.status === "declined" ? "pending" : request.status}`} key={request.id}>
                    <div className="request-person">
                      {request.avatar ? <img src={request.avatar} alt={request.name}/> : <span className="request-avatar-fallback"><UserRound size={25}/></span>}
                      <div><span className="request-direction">{request.direction === "incoming" ? "Quiere saludarte" : "Solicitud enviada"}</span><h3>{request.name}</h3><small>{request.intent}</small></div>
                      <span className={`request-status status-${request.direction === "outgoing" && request.status === "declined" ? "pending" : request.status}`}>{request.direction === "outgoing" && request.status === "declined" ? "Pendiente" : request.status === "pending" ? "Pendiente" : request.status === "accepted" ? "Aceptada" : request.status === "declined" ? "Rechazada" : "Cancelada"}</span>
                    </div>
                    <p className="request-bio">{request.bio}</p>
                    {!!request.interests.length && <div className="chips request-chips">{request.interests.slice(0,5).map(x => <span key={x}>{x}</span>)}</div>}
                    {(request.whereIAm || request.whatImWearing) && (
                      <div className="how-to-find-card">
                        <MapPin size={19}/>
                        <div>
                          {request.whereIAm && <><span>Dónde se ubica</span><strong>{request.whereIAm}</strong></>}
                          {request.whatImWearing && <><span>Qué está usando</span><strong>{request.whatImWearing}</strong></>}
                        </div>
                      </div>
                    )}
                    {request.direction === "incoming" && request.status === "pending" && activeConversation && <div className="waiting-copy">Termina tu conversación actual antes de aceptar otra solicitud.</div>}
                    {request.direction === "incoming" && request.status === "pending" && !activeConversation && (
                      <div className="request-actions">
                        <button className="decline-request" disabled={requestActionId === request.id} onClick={() => respondToRequest(request, "declined")}>Ahora no</button>
                        <button className="accept-request" disabled={requestActionId === request.id} onClick={() => respondToRequest(request, "accepted")}><Check size={18}/>{requestActionId === request.id ? "Procesando…" : "Puede acercarse"}</button>
                      </div>
                    )}
                    {request.direction === "outgoing" && (request.status === "pending" || request.status === "declined") && (
                      <div className="outgoing-pending-row">
                        <div className="waiting-copy">Esperando respuesta. Su ubicación sigue oculta.</div>
                        {request.status === "pending" && (
                          <button className="cancel-request" type="button" disabled={requestActionId === request.id} onClick={() => cancelRequest(request)}>{requestActionId === request.id ? "Cancelando…" : "Cancelar saludo"}</button>
                        )}
                      </div>
                    )}
                    {request.direction === "outgoing" && request.status === "accepted" && (request.whereIAm || request.whatImWearing) && <div className="accepted-copy"><Check size={16}/> Ya puedes acercarte a saludarle. Ambos aparecen como ocupados hasta finalizar la plática.</div>}
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "success" && (
          <div className="content-pad success-screen">
            <div className="success-icon">✓</div>
            <span className="subtle">Solicitud lista</span>
            <h2>Solicitud enviada</h2>
            <p>{pendingPerson?.simulated ? `Este perfil de muestra permite recorrer el flujo de Circle sin afectar a otro usuario.` : `Le avisamos a ${pendingPerson?.name || "la persona"}. Si acepta, Circle revelará sus datos para encontrarle para que puedas acercarte.`}</p>
            <div className="section-card safety"><ShieldCheck size={22}/><div><strong>Consentimiento primero</strong><span>Tu GPS nunca se comparte. “Dónde me ubico” y “Qué estoy usando” solo se revelan según las reglas de consentimiento de la solicitud.</span></div></div>
            <button className="primary" onClick={async () => { setPendingPerson(null); await searchNearby(); }}>Volver a personas cerca</button>
          </div>
        )}
      </section>

      {pwaHelpOpen && (
          <div className="connection-modal" role="dialog" aria-modal="true" aria-label="Instalar Circle">
            <div className="connection-sheet pwa-install-sheet">
              <div className="connection-success-icon"><Bell size={28}/></div>
              <h2>Instala Circle</h2>
              <p>{isIOSDevice() ? "En iPhone abre Circle en Safari, toca Compartir y selecciona Agregar a pantalla de inicio. Después abre Circle desde su nuevo icono." : "Usa la opción Instalar aplicación o Agregar a pantalla de inicio de tu navegador."}</p>
              <div className="connection-location-card"><ShieldCheck size={20}/><div><span>Para notificaciones</span><strong>Una vez instalada, abre Circle desde el icono y toca “Activar” cuando te pidamos permiso.</strong></div></div>
              <button className="primary" type="button" onClick={dismissPwaInstallHelp}>Entendido</button>
            </div>
          </div>
        )}

        {locationIssue && (
        <div className="connection-modal" role="dialog" aria-modal="true" aria-label="Permiso de ubicación requerido">
          <div className="connection-sheet">
            <div className="connection-success-icon"><MapPin size={32}/></div>
            <span className="subtle">Ubicación requerida</span>
            <h2>{locationIssue === "permission-denied" ? "Permite tu ubicación" : locationIssue === "timeout" ? "No pudimos ubicarte" : locationIssue === "unsupported" ? "Ubicación no disponible" : "Activa tu ubicación"}</h2>
            <p>{locationIssue === "permission-denied" ? "Circle necesita permiso de ubicación para mostrarte personas reales que están cerca. Tu ubicación exacta nunca se muestra a otros usuarios." : locationIssue === "timeout" ? "El teléfono tardó demasiado en responder. Comprueba que la ubicación esté activa y vuelve a intentarlo." : locationIssue === "unsupported" ? "Este navegador no está dando acceso a geolocalización. Prueba con Safari en iPhone o Chrome en Android y permite ubicación para Circle." : "Comprueba que la ubicación del teléfono esté activada y que este sitio tenga permiso para usarla."}</p>
            <div className="connection-location-card">
              <ShieldCheck size={21}/>
              <div><span>Cómo activarla</span><strong>{locationHelpText()}</strong></div>
            </div>
            <button className="primary" type="button" onClick={() => void retryLocationAccess()} disabled={locationRetrying}>
              <RefreshCw size={18} className={locationRetrying ? "spin" : ""}/>{locationRetrying ? "Comprobando…" : "Intentar de nuevo"}
            </button>
            <button className="secondary" type="button" onClick={() => setLocationIssue(null)}>Ahora no</button>
          </div>
        </div>
      )}

      {connectionNotice && (
        <div className="connection-modal" role="dialog" aria-modal="true" aria-label="Conexión hecha">
          <div className="connection-sheet">
            <div className="connection-success-icon"><Check size={34}/></div>
            <span className="subtle">Conexión confirmada</span>
            <h2>¡Conexión hecha!</h2>
            <p><strong>{connectionNotice.name}</strong> aceptó tu solicitud. Ya puedes acercarte a saludarle.</p>
            <div className="connection-location-card">
              <MapPin size={21}/>
              <div>
                <span>Dónde se ubica</span><strong>{connectionNotice.whereIAm || "Sin referencia."}</strong>
                <span>Qué está usando</span><strong>{connectionNotice.whatImWearing || "Sin referencia."}</strong>
              </div>
            </div>
            <button className="primary" onClick={() => { acknowledgeConnection(connectionNoticeRequestId); setConnectionNoticeRequestId(null); setConnectionNotice(null); setPendingPerson(null); setView("radar"); }}>Entendido</button>
          </div>
        </div>
      )}

      {cropSource && (
        <div className="crop-modal" role="dialog" aria-modal="true" aria-label="Encuadrar foto de perfil">
          <div className="crop-sheet">
            <div className="crop-header"><div><span className="subtle">Foto de perfil</span><h3>Encuadra tu foto</h3></div><button type="button" onClick={() => { if (cropSource.startsWith("blob:")) URL.revokeObjectURL(cropSource); setCropSource(""); }} aria-label="Cerrar"><X size={21}/></button></div>
            <p>Mueve la imagen con el dedo y usa el control para acercar o alejar.</p>
            <div className="crop-stage" onPointerDown={handleCropPointerDown} onPointerMove={handleCropPointerMove} onPointerUp={handleCropPointerUp} onPointerCancel={handleCropPointerUp}>
              <img ref={cropImageRef} src={cropSource} alt="Foto por recortar" draggable={false} onLoad={e => { const img = e.currentTarget; setCropImageSize({ width: img.naturalWidth, height: img.naturalHeight }); setCropOffset({ x: 0, y: 0 }); }} style={cropImageSize.width ? (() => { const g = cropGeometry(); return { width: g.renderedWidth, height: g.renderedHeight, transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px))` }; })() : undefined}/>
              <div className="crop-mask" />
            </div>
            <label className="zoom-control">Zoom<input type="range" min="1" max="3" step="0.01" value={cropZoom} onChange={e => { const next = Number(e.target.value); setCropZoom(next); setCropOffset(current => clampOffset(current, next)); }}/></label>
            <div className="crop-actions"><button type="button" className="secondary" onClick={choosePhoto}>Elegir otra</button><button type="button" className="primary" onClick={acceptCrop}><Check size={18}/> Usar foto</button></div>
          </div>
        </div>
      )}
    </main>
  );
}
