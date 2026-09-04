# Circle — PWA + Web Push upgrade

Este incremento convierte Circle en una PWA instalable y agrega Web Push para solicitudes y aceptaciones.

## Archivos a reemplazar
- `app/page.tsx`
- `app/globals.css`
- `app/layout.tsx`
- `public/manifest.webmanifest`

## Archivos nuevos
- `public/sw.js`
- `public/icons/icon-180.png`
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `public/icons/icon-maskable-512.png`
- `app/api/push/send/route.ts`
- `supabase/push_notifications_upgrade.sql`

## Dependencias nuevas
Ejecutar en la raíz del proyecto:

```bash
npm install web-push
npm install -D @types/web-push
```

## Supabase
Ejecutar `supabase/push_notifications_upgrade.sql` completo en SQL Editor.

## Generar VAPID keys

```bash
npx web-push generate-vapid-keys
```

Guardar el Public Key y Private Key.

## Variables de entorno
Agregar a `.env.local` para pruebas locales y también a Vercel > Project Settings > Environment Variables:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=PUBLIC_KEY_GENERADA
VAPID_PRIVATE_KEY=PRIVATE_KEY_GENERADA
VAPID_SUBJECT=mailto:TU_CORREO
SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
```

Ya deben existir las variables de Supabase y radio usadas por Circle.

IMPORTANTE: `VAPID_PRIVATE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` nunca deben llevar prefijo `NEXT_PUBLIC_`.

## Probar

```bash
npm run build
```

Después commit/push a Vercel. Web Push debe probarse desde el dominio HTTPS desplegado.

### iPhone
1. Abrir Circle en Safari.
2. Compartir > Agregar a pantalla de inicio.
3. Abrir Circle desde el icono instalado.
4. Iniciar sesión.
5. Tocar `Activar` en la tarjeta de notificaciones.
6. Aceptar el permiso de notificaciones de iOS.
7. Bloquear el teléfono y enviar una solicitud desde otra cuenta/dispositivo.

## Eventos que disparan push
- Alguien te manda `Quiero saludarle`.
- Alguien acepta tu saludo.

Realtime continúa siendo la fuente de verdad dentro de la app. Push es el canal para llamar la atención cuando Circle no está visible.
