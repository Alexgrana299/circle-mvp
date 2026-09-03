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


## Actualizar presencia

El botón **Actualizar** en Mi perfil vuelve a pedir la ubicación actual, refresca el mood, la referencia específica, `last_seen` y las personas reales cercanas. Después regresa al panel principal con el entorno actualizado.


## Cómo encontrarme

El campo visible como **Cómo encontrarme** es obligatorio para considerar un perfil completo. Internamente se conserva en `presence.specific_location`. Nunca forma parte de `nearby_profiles`.

Ejecuta también `supabase/how_to_find_me_upgrade.sql` una vez. Ese upgrade bloquea la lectura directa de perfiles/presencia de otros usuarios y crea `request_how_to_find_me(request_id)`: el receptor de una solicitud pendiente puede ver la referencia del emisor; el emisor solo puede ver la referencia del receptor después de que la solicitud sea aceptada.

## Conversaciones y presencia social

Ejecuta `supabase/conversations_upgrade.sql` después de `requests_upgrade.sql`.

Este incremento agrega:

- `presence.social_status`: `available` o `busy`.
- Conversaciones reales 1 a 1 con tablas `conversations` y `conversation_members`.
- Al aceptar una solicitud, ambas personas pasan a `busy` y siguen visibles en Circle.
- Una persona ocupada no puede recibir una solicitud normal nueva.
- Cualquiera de los participantes puede pulsar **Plática concluida**; ambos vuelven a `available`.
- La estructura de `conversation_members` queda lista para conversaciones de más de dos personas en una futura fase.
- Circle ya no elimina personas por un timeout de inactividad. La visibilidad depende de `is_available` y de su ubicación registrada.
- Mientras Circle permanece abierto y el perfil está completo, la PWA observa cambios de ubicación y actualiza Supabase cuando detecta un desplazamiento aproximado de 25 m o más. El radio de búsqueda sigue siendo 75 m por defecto mediante `NEXT_PUBLIC_NEARBY_RADIUS_METERS`.

### Limitación PWA importante

iOS y Android pueden suspender una web/PWA cuando queda en segundo plano. Por ello, el seguimiento de movimiento no es garantizado con la app cerrada o suspendida. El botón **Actualizar** continúa siendo la forma explícita de refrescar ubicación, estado y entorno. El seguimiento fiable en background requerirá una app nativa posterior.

## Realtime social sync

After `conversations_upgrade.sql`, run `supabase/realtime_upgrade.sql` once in the Supabase SQL Editor.

This increment adds:
- Supabase Realtime subscriptions for incoming/outgoing social request changes.
- Realtime refresh of active conversation membership.
- A prominent “¡Conexión hecha!” confirmation for the sender when a request is accepted.
- Automatic re-sync on `focus` and `visibilitychange` for iPhone/PWA resume behavior.
- 15-second polling retained only as a fallback; Realtime is the primary sync path.
