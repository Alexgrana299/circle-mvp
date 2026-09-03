"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent as ReactPointerEvent } from "react";
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

type CropOffset = { x: number; y: number };
type ActiveConversation = {
  id: number;
  otherId: string;
  name: string;
  avatar: string;
  intent: string;
  howToFindMe: string;
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
  howToFindMe: string;
  createdAt: string;
};


const moodOptions = ["Networking", "Entrenar", "Charlar", "Hacer amigos"];
const interestOptions = ["Viajes", "Libros", "Café", "Startups", "Running", "Tecnología", "Música", "Arte", "Negocios"];

const demoPeople: Person[] = [
  { id: "demo-sofia", name: "Sofía", initials: "S", bio: "Arquitectura. Me gusta leer, viajar y descubrir cafés.", intent: "Charlar", interests: ["Viajes", "Libros", "Café"], avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-diego", name: "Diego", initials: "D", bio: "Emprendimiento, tecnología y running.", intent: "Networking", interests: ["Startups", "Tecnología", "Running"], avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-andrea", name: "Andrea", initials: "A", bio: "Diseño, música y conocer gente nueva.", intent: "Hacer amigos", interests: ["Arte", "Música", "Viajes"], avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-carlos", name: "Carlos", initials: "C", bio: "Negocios, fitness y café.", intent: "Entrenar", interests: ["Negocios", "Running", "Café"], avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
  { id: "demo-fer", name: "Fernanda", initials: "F", bio: "Libros, cine y nuevas experiencias.", intent: "Charlar", interests: ["Libros", "Arte", "Viajes"], avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80", socialStatus: "available", simulated: true },
];

const bubblePositions = [
  { left: "18%", top: "20%", scale: 1.00 },
  { left: "78%", top: "18%", scale: .94 },
  { left: "15%", top: "54%", scale: .92 },
  { left: "82%", top: "53%", scale: 1.00 },
  { left: "25%", top: "84%", scale: .94 },
  { left: "74%", top: "83%", scale: .96 },
  { left: "48%", top: "14%", scale: .88 },
  { left: "48%", top: "88%", scale: .90 },
  { left: "9%", top: "78%", scale: .84 },
  { left: "91%", top: "77%", scale: .84 },
];

function isProfileComplete(profile: { name: string; bio: string; avatar: string; interests: string[]; mood: string; howToFindMe: string }) {
  return Boolean(
    profile.name.trim() &&
    profile.bio.trim() &&
    profile.avatar &&
    profile.interests.length > 0 &&
    profile.mood &&
    profile.howToFindMe.trim()
  );
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [selected, setSelected] = useState<Person | null>(null);
  const [status, setStatus] = useState("Toca buscar para descubrir quién está disponible.");
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [specificLocation, setSpecificLocation] = useState("");
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
  const [activeConversation, setActiveConversation] = useState<ActiveConversation | null>(null);
  const [conversationEnding, setConversationEnding] = useState(false);
  const [connectionNotice, setConnectionNotice] = useState<ActiveConversation | null>(null);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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

  const radius = Number(process.env.NEXT_PUBLIC_NEARBY_RADIUS_METERS || 75);
  const profileComplete = useMemo(() => isProfileComplete({ name, bio, avatar: avatarUrl, interests, mood, howToFindMe: specificLocation }), [name, bio, avatarUrl, interests, mood, specificLocation]);
  const nearbyCount = useMemo(() => people.length, [people]);
  const pendingIncomingCount = useMemo(() => requests.filter(r => r.direction === "incoming" && r.status === "pending").length, [requests]);
  const availableNearbyCount = useMemo(() => people.filter(p => p.socialStatus === "available").length, [people]);

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
      supabase.from("presence").select("specific_location").eq("user_id", user.id).maybeSingle(),
    ]);

    if (profile) {
      setName(profile.display_name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
      setInterests(profile.interests || []);
      setMood(profile.intent || "");
    }
    if (presence) setSpecificLocation(presence.specific_location || "");
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
        setIsAuthenticated(true);
        await loadOwnProfile();
        await loadRequests(true);
        await loadActiveConversation(true);
        await searchNearby();
      } else {
        const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
        if (error) throw error;
        if (data.session) {
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

  async function signOut() {
    if (supabase) {
      if (activeConversation) await supabase.rpc("end_conversation", { p_conversation_id: activeConversation.id });
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) await supabase.from("presence").update({ is_available: false }).eq("user_id", data.session.user.id);
      await supabase.auth.signOut();
    }
    setIsAuthenticated(false);
    setPeople(demoPeople);
    setSelected(null);
    setRequests([]);
    requestsRef.current = [];
    notifiedAcceptedRequestIdsRef.current.clear();
    setActiveConversation(null);
    setConnectionNotice(null);
    setName(""); setBio(""); setSpecificLocation(""); setInterests([]); setMood(""); setAvatarUrl(""); setAvatarBlob(null);
    setView("landing");
  }

  async function searchNearby() {
    setLocating(true);
    setStatus("Buscando personas cerca de ti…");

    if (!navigator.geolocation) {
      setPeople(demoPeople);
      setStatus("Mostrando personas disponibles de ejemplo.");
      setLocating(false);
      setView("radar");
      return;
    }

    navigator.geolocation.getCurrentPosition(async ({ coords: browserCoords }) => {
      const location = { lat: browserCoords.latitude, lng: browserCoords.longitude };
      setCoords(location);

      if (!supabase) {
        setPeople(demoPeople);
        setStatus("Personas disponibles cerca de ti.");
        setLocating(false);
        setView("radar");
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
        intent: p.intent || "Charlar",
        interests: p.interests || [],
        avatar: p.avatar_url || "",
        socialStatus: p.social_status === "busy" ? "busy" : "available",
        simulated: false,
      })) : [];

      setPeople([...realPeople.slice(0, 5), ...demoPeople].slice(0, 10));
      setStatus("Personas disponibles actualizadas.");
      setLocating(false);
      setView("radar");
    }, () => {
      setPeople(demoPeople);
      setStatus("No pudimos acceder a tu ubicación. Mostramos personas de ejemplo.");
      setLocating(false);
      setView("radar");
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 });
  }

  function openPerson(person: Person) {
    setSelected(person);
    setView("profile");
  }

  function openMyProfile(prompt = "") {
    setProfilePrompt(prompt);
    setProfileError("");
    setView("myProfile");
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
        intent: r.intent || "Charlar",
        howToFindMe: r.how_to_find_me || "",
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
        intent: row.intent || "Charlar",
        howToFindMe: row.how_to_find_me || "",
        startedAt: row.started_at,
      } : null;
      setActiveConversation(conversation);
      return conversation;
    } catch (error: any) {
      if (!silent) setRequestNotice(error?.message || "No pudimos cargar tu conversación activa.");
      return null;
    }
  }

  async function syncSocialState(showAcceptedFeedback = false) {
    if (!supabase) return;
    const previous = requestsRef.current;
    const latest = await loadRequests(true);
    const conversation = await loadActiveConversation(true);

    if (showAcceptedFeedback && conversation) {
      const newlyAccepted = latest.find(request =>
        request.direction === "outgoing" &&
        request.status === "accepted" &&
        !notifiedAcceptedRequestIdsRef.current.has(request.id) &&
        (previous.length === 0 || previous.some(old => old.id === request.id && old.status !== "accepted"))
      );

      if (newlyAccepted) {
        notifiedAcceptedRequestIdsRef.current.add(newlyAccepted.id);
        setConnectionNotice(conversation);
        setRequestNotice(`${newlyAccepted.name} aceptó tu solicitud.`);
      }
    }

    return { requests: latest, conversation };
  }

  async function endActiveConversation() {
    if (!supabase || !activeConversation) return;
    setConversationEnding(true);
    setRequestNotice("");
    try {
      const { error } = await supabase.rpc("end_conversation", { p_conversation_id: activeConversation.id });
      if (error) throw error;
      setActiveConversation(null);
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
    if (person.socialStatus === "busy") throw new Error("Esta persona está ocupada en una conversación.");
    if (!person.simulated && supabase) {
      const { error } = await supabase.rpc("send_social_request", { p_receiver_id: person.id });
      if (error) throw error;
      await loadRequests(true);
    }
    setView("success");
  }

  async function respondToRequest(request: SocialRequest, decision: "accepted" | "declined") {
    if (!supabase) return;
    setRequestActionId(request.id);
    setRequestNotice("");
    try {
      const { error } = await supabase.rpc("respond_social_request", { p_request_id: request.id, p_decision: decision });
      if (error) throw error;
      setRequestNotice(decision === "accepted" ? `Aceptaste a ${request.name}. Ahora puede ver cómo encontrarte.` : `Rechazaste la solicitud de ${request.name}.`);
      await loadRequests(true);
      if (decision === "accepted") {
        await loadActiveConversation(true);
        if (coords) await refreshNearbyAt(coords, true);
      }
    } catch (error: any) {
      setRequestNotice(error?.message || "No pudimos actualizar la solicitud.");
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
      setProfileError(error?.message || "No se pudo enviar la solicitud.");
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
      intent: p.intent || "Charlar",
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
    if (!profileComplete) {
      openMyProfile("Completa tu perfil para activar tu presencia y actualizar las personas cercanas.");
      return;
    }
    if (!supabase) {
      setStatus("Supabase no está conectado.");
      return;
    }
    if (!navigator.geolocation) {
      setStatus("Tu navegador no permite obtener la ubicación.");
      return;
    }

    setProfileUpdating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");

      const location = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
          () => reject(new Error("No pudimos obtener tu ubicación. Revisa el permiso de ubicación de Circle.")),
          { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 }
        );
      });

      // “Actualizar” refresca el mood/estatus y la presencia, sin modificar el resto del perfil.
      const { error: moodError } = await supabase.from("profiles").update({ intent: mood }).eq("id", user.id);
      if (moodError) throw moodError;

      const { error: presenceError } = await supabase.from("presence").upsert({
        user_id: user.id,
        location: `POINT(${location.lng} ${location.lat})`,
        specific_location: specificLocation.trim() || null,
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
    if (!name.trim() || !bio.trim() || !avatarUrl || !interests.length || !mood || !specificLocation.trim()) {
      setProfileError("Completa foto, nombre, descripción, al menos un interés, mood y Cómo encontrarme.");
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
        if (!navigator.geolocation) throw new Error("Circle necesita tu ubicación para activar tu perfil.");
        locationForPresence = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
            () => reject(new Error("No pudimos obtener tu ubicación. Revisa el permiso de ubicación de Circle.")),
            { enableHighAccuracy: true, timeout: 7000, maximumAge: 15000 }
          );
        });
        setCoords(locationForPresence);
      }

      const { error: presenceError } = await supabase.from("presence").upsert({
        user_id: user.id,
        location: `POINT(${locationForPresence.lng} ${locationForPresence.lat})`,
        specific_location: specificLocation.trim(),
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
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setIsAuthenticated(Boolean(session));
      if (session) {
        const currentRequests = await loadRequests(true);
        currentRequests.filter(r => r.direction === "outgoing" && r.status === "accepted").forEach(r => notifiedAcceptedRequestIdsRef.current.add(r.id));
        await loadActiveConversation(true);
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
            await loadActiveConversation(true);
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
    if (!isAuthenticated || !profileComplete || !supabase || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(async ({ coords: next }) => {
      const nextCoords = { lat: next.latitude, lng: next.longitude };
      const previous = lastPresenceCoordsRef.current || coords;
      if (previous && distanceMeters(previous, nextCoords) < 25) return;
      lastPresenceCoordsRef.current = nextCoords;
      setCoords(nextCoords);
      await supabase.rpc("update_my_presence_location", { user_lat: nextCoords.lat, user_lng: nextCoords.lng });
      if (view === "radar") await refreshNearbyAt(nextCoords, true);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 20000, timeout: 10000 });
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isAuthenticated, profileComplete, view]);

  return (
    <main className="page-shell">
      <div className="glow glow-one" />
      <div className="glow glow-two" />
      <section className="phone-card">
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
          <div className="content-pad radar-screen">
            <div className="screen-heading">
              <div><span className="subtle">Personas cerca de ti</span><h2>{nearbyCount} personas cerca</h2><small className="nearby-summary">{availableNearbyCount} disponibles{nearbyCount - availableNearbyCount > 0 ? ` · ${nearbyCount - availableNearbyCount} ocupadas` : ""}</small></div>
            </div>
            <div className="status-line">{status}</div>
            {activeConversation && (
              <div className="conversation-banner">
                <div className="conversation-icon"><MessageCircle size={19}/></div>
                <div><span>Estás conversando con</span><strong>{activeConversation.name}</strong><small>{activeConversation.howToFindMe ? `Cómo encontrarle: ${activeConversation.howToFindMe}` : "Conversación activa"}</small></div>
                <button type="button" onClick={endActiveConversation} disabled={conversationEnding}>{conversationEnding ? "Finalizando…" : "Plática concluida"}</button>
              </div>
            )}
            {pendingIncomingCount > 0 && (
              <button className="incoming-alert" onClick={async () => { await loadRequests(); setView("requests"); }}>
                <Bell size={18}/><div><strong>{pendingIncomingCount === 1 ? "Alguien quiere saludarte" : `${pendingIncomingCount} personas quieren saludarte`}</strong><span>Toca para revisar la solicitud.</span></div><span className="incoming-alert-arrow">›</span>
              </button>
            )}
            <div className="people-cloud" aria-label="Personas disponibles cerca. La posición de las burbujas es ilustrativa.">
              <div className="cloud-note">Las posiciones son ilustrativas</div>
              {people.slice(0,10).map((p, i) => (
                <button key={p.id} className={`person-bubble ${p.socialStatus === "busy" ? "busy" : ""}`} style={{ left: bubblePositions[i].left, top: bubblePositions[i].top, transform: `translate(-50%,-50%) scale(${bubblePositions[i].scale})` }} onClick={() => openPerson(p)}>
                  <span className="intent-tag">{p.intent}</span>
                  {profileComplete && p.avatar ? <img src={p.avatar} alt={p.name}/> : <span className="avatar-fallback locked-avatar"><UserRound size={28}/></span>}
                  <strong>{p.name}</strong><small>{p.socialStatus === "busy" ? "Ocupado" : "Disponible"}</small>
                </button>
              ))}
              <button className={`my-bubble ${activeConversation ? "busy" : ""}`} onClick={() => openMyProfile()} aria-label="Abrir mi perfil">
                {avatarUrl ? <img src={avatarUrl} alt="Tu perfil"/> : <span className="my-avatar-empty"><UserRound size={30}/></span>}
                <strong>Tú</strong>
                <small>{profileComplete ? (activeConversation ? "Ocupado" : mood) : "Completar perfil"}</small>
              </button>
            </div>
            <div className="radar-update-zone">
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
            <div className="permission-copy"><Hand size={22}/><div><strong>No mostramos dónde está exactamente.</strong><span>“Cómo encontrarme” permanece oculto hasta que exista consentimiento. Quien recibe una solicitud sí puede identificar primero a quien la envió.</span></div></div>
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
              {avatarUrl ? <img src={avatarUrl} alt="Tu foto"/> : <><Camera size={28}/><strong>Agregar foto</strong><span>Desde tu galería</span></>}
              {avatarUrl && <span className="avatar-edit-badge"><Camera size={16}/></span>}
            </button>
            <p className="avatar-help">Toca la foto para cambiarla. Podrás encuadrarla antes de guardar.</p>

            <label>Nombre<input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre"/></label>
            <label>Tu descripción<textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Me gusta viajar, leer y conocer gente nueva."/></label>

            <div className="field-label">Mood</div>
            <div className="chips selectable mood-grid">{moodOptions.map(x => <button type="button" key={x} className={mood === x ? "selected" : ""} onClick={() => setMood(x)}>{x}</button>)}</div>

            <div className="field-label">Intereses <span className="optional">(elige hasta 5)</span></div>
            <div className="chips selectable">{interestOptions.map(x => <button type="button" key={x} className={interests.includes(x) ? "selected" : ""} onClick={() => setInterests(v => v.includes(x) ? v.filter(i => i !== x) : v.length < 5 ? [...v, x] : v)}>{x}</button>)}</div>

            <label>Cómo encontrarme <span className="required-mark">(obligatorio)</span><input value={specificLocation} onChange={e => setSpecificLocation(e.target.value)} placeholder="Piso 7, al lado de la ventana, playera azul" required/></label>
            <p className="privacy-hint"><ShieldCheck size={14}/> Este dato permanece oculto. Solo quien reciba una solicitud tuya podrá verlo; si tú recibes una solicitud, la otra persona solo lo verá después de que aceptes.</p>

            {profileError && <div className="auth-feedback error">{profileError}</div>}
            <button className="primary" onClick={saveProfile} disabled={profileSaving}>{profileSaving ? "Guardando…" : pendingPerson ? "Guardar y enviar solicitud" : "Guardar perfil"}</button>
            <p className="microcopy center">Las fotos de otras personas se desbloquean cuando completas tu perfil.</p>

          </div>
        )}

        {view === "requests" && (
          <div className="content-pad requests-screen">
            <button className="back" onClick={() => setView("radar")}><ArrowLeft size={20}/> Personas cerca</button>
            <span className="subtle">Solicitudes</span>
            <h2>{pendingIncomingCount ? `${pendingIncomingCount} ${pendingIncomingCount === 1 ? "persona quiere" : "personas quieren"} saludarte` : "Tus solicitudes"}</h2>
            <p>Antes de aceptar puedes identificar a quien quiere acercarse. Tu “Cómo encontrarme” sigue oculto hasta que tú aceptes.</p>
            {requestNotice && <div className="auth-feedback success">{requestNotice}</div>}
            {requestsLoading ? <div className="requests-empty">Cargando solicitudes…</div> : requests.length === 0 ? <div className="requests-empty"><Hand size={26}/><strong>Aún no tienes solicitudes</strong><span>Cuando alguien quiera saludarte aparecerá aquí.</span></div> : (
              <div className="request-list">
                {requests.map(request => (
                  <article className={`request-card ${request.status}`} key={request.id}>
                    <div className="request-person">
                      {request.avatar ? <img src={request.avatar} alt={request.name}/> : <span className="request-avatar-fallback"><UserRound size={25}/></span>}
                      <div><span className="request-direction">{request.direction === "incoming" ? "Quiere saludarte" : "Solicitud enviada"}</span><h3>{request.name}</h3><small>{request.intent}</small></div>
                      <span className={`request-status status-${request.status}`}>{request.status === "pending" ? "Pendiente" : request.status === "accepted" ? "Aceptada" : request.status === "declined" ? "Rechazada" : "Cancelada"}</span>
                    </div>
                    <p className="request-bio">{request.bio}</p>
                    {!!request.interests.length && <div className="chips request-chips">{request.interests.slice(0,5).map(x => <span key={x}>{x}</span>)}</div>}
                    {request.howToFindMe && (
                      <div className="how-to-find-card"><MapPin size={19}/><div><span>Cómo encontrarme</span><strong>{request.howToFindMe}</strong></div></div>
                    )}
                    {request.direction === "incoming" && request.status === "pending" && activeConversation && <div className="waiting-copy">Termina tu conversación actual antes de aceptar otra solicitud.</div>}
                    {request.direction === "incoming" && request.status === "pending" && !activeConversation && (
                      <div className="request-actions">
                        <button className="decline-request" disabled={requestActionId === request.id} onClick={() => respondToRequest(request, "declined")}>Ahora no</button>
                        <button className="accept-request" disabled={requestActionId === request.id} onClick={() => respondToRequest(request, "accepted")}><Check size={18}/>{requestActionId === request.id ? "Procesando…" : "Puede acercarse"}</button>
                      </div>
                    )}
                    {request.direction === "outgoing" && request.status === "pending" && <div className="waiting-copy">Esperando respuesta. Su ubicación sigue oculta.</div>}
                    {request.direction === "outgoing" && request.status === "accepted" && request.howToFindMe && <div className="accepted-copy"><Check size={16}/> Ya puedes acercarte a saludarle. Ambos aparecen como ocupados hasta finalizar la plática.</div>}
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
            <p>{pendingPerson?.simulated ? `Este perfil de muestra permite recorrer el flujo de Circle sin afectar a otro usuario.` : `Le avisamos a ${pendingPerson?.name || "la persona"}. Si acepta, Circle revelará su “Cómo encontrarme” para que puedas acercarte.`}</p>
            <div className="section-card safety"><ShieldCheck size={22}/><div><strong>Consentimiento primero</strong><span>Tu GPS nunca se comparte. “Cómo encontrarme” solo se revela según las reglas de consentimiento de la solicitud.</span></div></div>
            <button className="primary" onClick={async () => { setPendingPerson(null); await searchNearby(); }}>Volver a personas cerca</button>
          </div>
        )}
      </section>

      {connectionNotice && (
        <div className="connection-modal" role="dialog" aria-modal="true" aria-label="Conexión hecha">
          <div className="connection-sheet">
            <div className="connection-success-icon"><Check size={34}/></div>
            <span className="subtle">Conexión confirmada</span>
            <h2>¡Conexión hecha!</h2>
            <p><strong>{connectionNotice.name}</strong> aceptó tu solicitud. Ya puedes acercarte a saludarle.</p>
            <div className="connection-location-card">
              <MapPin size={21}/>
              <div><span>Cómo encontrarle</span><strong>{connectionNotice.howToFindMe || "La persona no agregó una referencia."}</strong></div>
            </div>
            <button className="primary" onClick={() => { setConnectionNotice(null); setView("radar"); }}>Entendido</button>
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
