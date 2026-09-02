"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Hand, MapPin, Radio, ShieldCheck, Sparkles } from "lucide-react";
import { hasSupabase, supabase } from "@/lib/supabase";

type Person = {
  id: string;
  name: string;
  initials: string;
  bio: string;
  intent: string;
  interests: string[];
  avatar: string;
};

type View = "landing" | "radar" | "profile" | "onboarding" | "success";

const demoPeople: Person[] = [
  { id: "sofia", name: "Sofía", initials: "S", bio: "Arquitectura. Me gusta leer, viajar y descubrir cafés.", intent: "Platicar", interests: ["Viajes", "Libros", "Café"], avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80" },
  { id: "diego", name: "Diego", initials: "D", bio: "Emprendimiento, tecnología y running.", intent: "Networking", interests: ["Startups", "IA", "Running"], avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80" },
  { id: "andrea", name: "Andrea", initials: "A", bio: "Diseño, música y conocer gente nueva.", intent: "Platicar", interests: ["Diseño", "Música", "Viajes"], avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80" },
  { id: "carlos", name: "Carlos", initials: "C", bio: "Negocios, fitness y café.", intent: "Networking", interests: ["Negocios", "Gym", "Café"], avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80" },
  { id: "fer", name: "Fernanda", initials: "F", bio: "Libros, cine y nuevas experiencias.", intent: "Conocer gente", interests: ["Libros", "Cine", "Arte"], avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80" }
];

const bubblePositions = [
  { left: "24%", top: "18%", scale: 1.02 },
  { left: "73%", top: "16%", scale: .94 },
  { left: "50%", top: "47%", scale: 1.08 },
  { left: "20%", top: "72%", scale: .93 },
  { left: "77%", top: "72%", scale: 1.0 }
];

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [people, setPeople] = useState<Person[]>(demoPeople);
  const [selected, setSelected] = useState<Person | null>(null);
  const [isDemo, setIsDemo] = useState(true);
  const [status, setStatus] = useState("Toca buscar para descubrir cómo funciona Circle.");
  const [locating, setLocating] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [specificLocation, setSpecificLocation] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [pendingPerson, setPendingPerson] = useState<Person | null>(null);
  const [coords, setCoords] = useState<{lat:number; lng:number} | null>(null);

  const radius = Number(process.env.NEXT_PUBLIC_NEARBY_RADIUS_METERS || 75);
  const interestOptions = ["Viajes", "Libros", "Café", "Startups", "Running", "Tecnología", "Música", "Arte", "Negocios"];
  const nearbyCount = useMemo(() => people.length, [people]);

  async function searchNearby() {
    setLocating(true);
    setStatus("Buscando personas cerca de ti…");

    if (!navigator.geolocation) {
      activateDemo("Tu navegador no ofrece ubicación. Te mostramos una demo interactiva.");
      return;
    }

    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const location = { lat: coords.latitude, lng: coords.longitude };
      setCoords(location);

      if (!supabase) {
        activateDemo("Esta es una demo interactiva. Al conectar Supabase aparecerán personas reales.");
        return;
      }

      const { data, error } = await supabase.rpc("nearby_profiles", {
        user_lat: location.lat,
        user_lng: location.lng,
        radius_meters: radius,
      });

      if (error || !data?.length) {
        activateDemo("Todavía no hay personas disponibles aquí. Así se verá Circle cuando alguien aparezca.");
        return;
      }

      const realPeople: Person[] = data.map((p: any) => ({
        id: p.id,
        name: p.display_name || "Alguien cerca",
        initials: (p.display_name || "C").slice(0, 1),
        bio: p.bio || "Disponible para socializar.",
        intent: p.intent || "Platicar",
        interests: p.interests || [],
        avatar: p.avatar_url || "",
      }));

      setPeople(realPeople);
      setIsDemo(false);
      setStatus(`${realPeople.length} ${realPeople.length === 1 ? "persona disponible" : "personas disponibles"} en tu zona.`);
      setLocating(false);
      setView("radar");
    }, () => {
      activateDemo("No pudimos acceder a tu ubicación. Puedes probar Circle en modo demo.");
    }, { enableHighAccuracy: true, timeout: 7000, maximumAge: 30000 });
  }

  function activateDemo(message: string) {
    setPeople(demoPeople);
    setIsDemo(true);
    setStatus(message);
    setLocating(false);
    setView("radar");
  }

  function openPerson(person: Person) {
    setSelected(person);
    setView("profile");
  }

  async function requestHello(person: Person) {
    setPendingPerson(person);
    const session = supabase ? (await supabase.auth.getSession()).data.session : null;
    if (!session) {
      setView("onboarding");
      return;
    }
    if (!isDemo && supabase) {
      await supabase.from("social_requests").insert({ receiver_id: person.id });
    }
    setView("success");
  }

  async function createProfile() {
    if (!name.trim()) return;
    if (supabase) {
      let session = (await supabase.auth.getSession()).data.session;
      if (!session) {
        const result = await supabase.auth.signInAnonymously();
        session = result.data.session;
      }
      if (session) {
        await supabase.from("profiles").upsert({
          id: session.user.id,
          display_name: name.trim(),
          bio: bio.trim(),
          interests,
          intent: "Platicar",
        });
        if (coords) {
          await supabase.from("presence").upsert({
            user_id: session.user.id,
            location: `POINT(${coords.lng} ${coords.lat})`,
            specific_location: specificLocation.trim() || null,
            is_available: true,
            last_seen: new Date().toISOString(),
          });
        }
      }
    }
    setView("success");
  }

  useEffect(() => {
    if (view === "landing") setSelected(null);
  }, [view]);

  return (
    <main className="page-shell">
      <div className="glow glow-one" />
      <div className="glow glow-two" />
      <section className="phone-card">
        <header className="topbar">
          <button className="brand" onClick={() => setView("landing")}>Circle</button>
          <span className={`mode-pill ${isDemo ? "demo" : "live"}`}>{isDemo ? "DEMO" : "EN VIVO"}</span>
        </header>

        {view === "landing" && (
          <div className="landing content-pad">
            <div className="eyebrow"><Sparkles size={16}/> Conoce a quien ya está aquí</div>
            <h1>¿Quién está abierto a <span>hablar contigo</span> cerca?</h1>
            <p className="lead">Circle elimina la parte incómoda de iniciar una conversación: primero sabes quién sí quiere que te acerques.</p>

            <div className="mini-cloud" aria-label="Vista previa de personas cercanas">
              {demoPeople.slice(0,4).map((p, i) => <img key={p.id} src={p.avatar} alt="Perfil demo" className={`mini-avatar a${i+1}`} />)}
              <div className="you-dot">Tú</div>
            </div>

            <button className="primary hero-button" onClick={searchNearby} disabled={locating}>
              <Radio size={20}/>{locating ? "Buscando…" : "Buscar gente para socializar"}
            </button>
            <p className="microcopy"><MapPin size={14}/> Usamos tu ubicación para saber quién está en tu zona, nunca para mostrar tu posición exacta.</p>
            {!hasSupabase && <div className="dev-note">Modo demo activo · conecta Supabase para datos reales.</div>}
          </div>
        )}

        {view === "radar" && (
          <div className="content-pad radar-screen">
            <div className="screen-heading">
              <div><span className="subtle">Personas cerca de ti</span><h2>{nearbyCount} disponibles</h2></div>
              <button className="icon-button" onClick={searchNearby} aria-label="Actualizar"><Radio size={20}/></button>
            </div>
            <div className="status-line">{status}</div>
            <div className="people-cloud" aria-label="Personas disponibles cerca. La posición de las burbujas es ilustrativa.">
              <div className="cloud-note">Las posiciones son ilustrativas</div>
              {people.slice(0,5).map((p, i) => (
                <button
                  key={p.id}
                  className="person-bubble"
                  style={{ left: bubblePositions[i].left, top: bubblePositions[i].top, transform: `translate(-50%,-50%) scale(${bubblePositions[i].scale})` }}
                  onClick={() => openPerson(p)}
                >
                  <span className="intent-tag">{p.intent}</span>
                  {p.avatar ? <img src={p.avatar} alt={p.name}/> : <span className="avatar-fallback">{p.initials}</span>}
                  <strong>{p.name}</strong>
                  <small>Disponible</small>
                </button>
              ))}
            </div>
            {isDemo && <div className="demo-banner"><Sparkles size={16}/><span><strong>Demo interactiva.</strong> Estos perfiles son simulados para que entiendas Circle antes de registrarte.</span></div>}
            <button className="secondary" onClick={() => setView("landing")}>Volver</button>
          </div>
        )}

        {view === "profile" && selected && (
          <div className="content-pad profile-screen">
            <button className="back" onClick={() => setView("radar")}><ArrowLeft size={20}/> Personas cerca</button>
            <div className="profile-avatar-wrap"><img src={selected.avatar} alt={selected.name}/><span>{selected.intent}</span></div>
            <h2>{selected.name}</h2><p>{selected.bio}</p>
            <div className="availability-pill"><span className="availability-dot"/> Disponible cerca de ti</div>
            <div className="section-card"><span className="section-label">Intereses</span><div className="chips">{selected.interests.map(x => <span key={x}>{x}</span>)}</div></div>
            <div className="permission-copy"><Hand size={22}/><div><strong>No mostramos dónde está exactamente.</strong><span>Si acepta tu solicitud, podrá compartir una referencia como “Piso 7” o “mesa junto a la ventana”.</span></div></div>
            <button className="primary" onClick={() => requestHello(selected)}><Hand size={19}/> Quiero saludarle</button>
          </div>
        )}

        {view === "onboarding" && (
          <div className="content-pad onboarding-screen">
            <button className="back" onClick={() => setView("profile")}><ArrowLeft size={20}/> Volver</button>
            <span className="subtle">Un último paso</span><h2>Crea tu perfil</h2>
            <p>La otra persona necesita saber quién quiere acercarse antes de decidir.</p>
            <label>Nombre<input value={name} onChange={e=>setName(e.target.value)} placeholder="Tu nombre"/></label>
            <label>Tu descripción<textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="Me gusta viajar, leer y conocer gente nueva."/></label>
            <label>Especificar ubicación <span className="optional">(opcional)</span><input value={specificLocation} onChange={e=>setSpecificLocation(e.target.value)} placeholder="Ej. Piso 7, terraza, mesa junto a la ventana"/></label>
            <p className="privacy-hint"><ShieldCheck size={14}/> Esta referencia solo se comparte cuando aceptas una interacción.</p>
            <div className="field-label">Elige tus intereses</div>
            <div className="chips selectable">{interestOptions.map(x => <button key={x} className={interests.includes(x)?"selected":""} onClick={() => setInterests(v => v.includes(x)?v.filter(i=>i!==x):v.length<5?[...v,x]:v)}>{x}</button>)}</div>
            <button className="primary" onClick={createProfile} disabled={!name.trim()}>Crear perfil y continuar</button>
            <p className="microcopy center">Puedes usar Circle sin publicar correo, teléfono ni redes sociales.</p>
          </div>
        )}

        {view === "success" && (
          <div className="content-pad success-screen">
            <div className="success-icon">✓</div>
            <span className="subtle">Solicitud lista</span>
            <h2>{isDemo ? "Así se sentiría el momento clave" : "Solicitud enviada"}</h2>
            <p>{isDemo ? `${pendingPerson?.name || "La persona"} vería tu perfil y decidiría si puedes acercarte.` : `Le avisamos a ${pendingPerson?.name || "la persona"}. Si acepta, podrán compartir una referencia para encontrarse.`}</p>
            <div className="section-card safety"><ShieldCheck size={22}/><div><strong>Consentimiento primero</strong><span>Ni la ubicación exacta ni una referencia específica se muestran antes de aceptar.</span></div></div>
            <button className="primary" onClick={() => { setPendingPerson(null); setView("radar"); }}>Volver a personas cerca</button>
          </div>
        )}
      </section>
      <footer>Construido para validar interacción humana, no otro feed social.</footer>
    </main>
  );
}
