# Circle MVP

Circle es una Web/PWA para validar la idea: descubrir personas cercanas que están abiertas a socializar y pedir permiso antes de acercarte.

## Principio de ubicación
Circle usa GPS únicamente para decidir qué usuarios están dentro de un radio de proximidad. La interfaz **no muestra metros, dirección ni posición relativa**. Las burbujas son una nube visual y su posición es ilustrativa.

El usuario puede guardar una referencia opcional como `Piso 7`, `Terraza` o `Mesa junto a la ventana`. Esa referencia no forma parte de la búsqueda de cercanía y está diseñada para revelarse solamente después de que una solicitud sea aceptada.

## Qué funciona hoy
- Landing sin login: primero comunica el valor.
- Nube demo interactiva con perfiles claramente marcados como simulados.
- Solicita geolocalización al pulsar “Buscar gente para socializar”.
- Si Supabase está conectado, consulta perfiles reales dentro del radio configurado.
- No muestra distancia ni ubicación exacta de otros usuarios.
- Si no hay nadie real, cae a la demo en vez de mostrar un producto muerto.
- Perfil de persona y CTA “Quiero saludarle”.
- Onboarding justo antes del primer compromiso.
- Campo opcional “Especificar ubicación”.
- Soporte para Supabase Anonymous Auth.
- SQL para perfiles, presencia geográfica PostGIS y solicitudes.

## Ejecutar local
1. Instala Node.js 20.9 o superior.
2. En esta carpeta: `npm install`
3. Copia `.env.example` a `.env.local`.
4. `npm run dev`
5. Abre `http://localhost:3000`.

Sin variables de Supabase, el producto funciona en modo demo.

## Conectar Supabase
1. Crea un proyecto.
2. En SQL Editor ejecuta `supabase/schema.sql`.
3. En Authentication habilita **Anonymous Sign-Ins**.
4. En `.env.local` agrega:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Reinicia `npm run dev`.

## Desplegar en Vercel
1. Sube la carpeta a GitHub.
2. Importa el repo en Vercel.
3. Agrega las mismas variables de entorno.
4. Deploy.

## Siguiente incremento recomendado
- Pantalla de solicitudes recibidas y aceptar/rechazar.
- Revelar `specific_location` solamente después de una aceptación.
- Heartbeat de presencia cada 60–90 s mientras “Disponible” esté activo.
- Subida de foto a Supabase Storage.
- PWA icons + service worker/offline shell.
- Reportar/bloquear.

## Autenticación por correo y contraseña

Circle usa Supabase Auth para iniciar sesión y crear cuentas con email/password.

En Supabase revisa **Authentication → Providers → Email** y confirma que Email esté habilitado.

Para demos rápidas puedes desactivar temporalmente la confirmación obligatoria de correo en la configuración de Email. Si la confirmación está activa, al crear una cuenta Circle mostrará un mensaje para revisar el correo y luego iniciar sesión.

El flujo implementado es:

1. Portada de Circle.
2. Iniciar sesión / Crear cuenta.
3. Al autenticarse, Circle solicita ubicación y abre la vista de personas cercanas.
4. La sesión persiste mediante Supabase Auth hasta cerrar sesión.

El perfil social (nombre, bio, intereses, mood, foto, ubicación específica) permanece separado de la cuenta y se completará en el siguiente incremento del MVP.


## Profile upgrade

After the base schema has already been created, run `supabase/profile_upgrade.sql` once in the Supabase SQL Editor. It creates the `avatars` Storage bucket, owner-only upload policies, and updates `nearby_profiles` so avatar URLs are withheld until the viewer has completed their own profile.

A profile is considered complete when it has: photo, name, bio, at least one interest, and a mood. Specific location remains optional.
