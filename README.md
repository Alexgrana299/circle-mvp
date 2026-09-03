# Circle · Canvas desplazable + Solicitudes recibidas/enviadas

Reemplaza `app/page.tsx` y `app/globals.css`.

Ejecuta una vez en Supabase SQL Editor: `supabase/requests_navigation_upgrade.sql`.

Cambios:
- Canvas de personas desplazable horizontal y verticalmente.
- Separación mínima entre burbujas mediante una cuadrícula espiral ilustrativa.
- Ya no se limita la UI a 10 personas.
- Tu círculo permanece en el centro geométrico del canvas.
- Solicitudes separadas en Recibidas / Enviadas.
- Las enviadas pendientes se pueden cancelar.
- Una solicitud pendiente duplicada se bloquea tanto en frontend como en Supabase.
