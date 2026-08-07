# Dashboard VP Proyectos 2026

Portal web donde cada socio del **Programa Valor Pyme** (Fe Consulting / BCI) entra con su email y ve, en vivo, el estado de las etapas y la planificación semanal de sus proyectos. Los datos vienen del Google Sheet maestro `Plan_Trabajo_VP_Proyectos_2026`, que sigue siendo la fuente de verdad operativa del equipo: el dashboard sólo lo lee y lo presenta filtrado por socio.

> Contexto: este repo forma parte del trabajo de Fe Consulting con BCI sobre el Programa Valor Pyme. La carpeta de proyecto en Complexity está en `~/Code/complexity/projects/fe-consulting`.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **Supabase Auth** (email + contraseña) — único almacén de identidades
- **Google Sheets API** vía service account (sólo lectura, con caché en memoria)
- **Vercel** para hosting y deploy continuo desde GitHub

No hay base de datos propia ni backend persistente: todo el estado de proyectos vive en el Sheet.

## Cómo funciona

1. El socio entra a la URL pública. El middleware (`middleware.ts` → `src/lib/supabase/middleware.ts`) valida la sesión Supabase y redirige a `/login` si no hay usuario.
2. Tras autenticarse, `/dashboard` resuelve el socio a partir del **email** (ver "Autorización").
3. La función `fetchSheet` (`src/lib/sheets.ts`) lee el rango configurado del Sheet con un service account, parsea el formato Gantt y cachea el resultado por 2 minutos.
4. `filterRowsForPartner` deja sólo las filas del socio, agrupadas por solución, y se renderiza una tabla con badges de estado y un mini-Gantt semanal.
5. Los emails del dominio `@feconsulting.cl` reciben el flag `ALL` y ven todos los socios (vista interna).

## Modelo de autorización

Definido en `src/lib/partner-mapping.ts`:

- **Por dominio**: `bci.cl → BCI`, `walmart.com → Walmart`, etc. Es el mecanismo principal.
- **Por email exacto** (`EMAIL_TO_PARTNER`): excepciones cuando el dominio del socio no es propio (ej. un contacto con `@gmail.com`).
- **Equipo interno FE** (`FE_INTERNAL_DOMAINS`): cualquier `@feconsulting.cl` ve todos los socios.
- Si el email no matchea nada → el dashboard muestra un mensaje pidiendo contactar al ejecutivo FE.

Los **nombres de socio** definidos aquí deben coincidir (case-insensitive) con la columna `Socio` del Sheet, porque el filtro hace match literal.

## Forma esperada del Sheet

`fetchSheet` asume la estructura del `Plan_Trabajo_VP_Proyectos_2026`:

- En las primeras ~10 filas hay una fila de headers semanales con tokens del tipo `06-Apr`, `13-Apr`, … en las columnas a partir de la 6ª (índice 5).
- Las filas de datos tienen el orden: `Socio | Solución | Etapa | Responsable | Estado | <semanas...>`.
- `Socio` y `Solución` se rellenan con *carry-forward*: si la celda viene vacía, se hereda de la fila anterior (es como está editado el Sheet humano).
- Cada celda semanal se renderiza como cuadradito coloreado si tiene cualquier valor, vacío si no.

Si el Sheet cambia de estructura (cambia el nombre de la pestaña, se mueve el header, se agregan columnas antes de "Socio"), hay que ajustar `src/lib/sheets.ts`.

## Variables de entorno

Copia `.env.local.example` a `.env.local` para desarrollo, o configúralas en Vercel para producción:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_…`). **Nunca** la Secret key. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` del JSON del service account |
| `GOOGLE_PRIVATE_KEY` | `private_key` completa, con `-----BEGIN/END PRIVATE KEY-----`. Acepta `\n` literales o multilínea. |
| `SHEET_ID` | ID del Sheet (de la URL `/spreadsheets/d/<ID>/edit`) |
| `SHEET_RANGE` | Rango a leer, ej. `Gantt!A1:AT200` |
| `PARTNERS_SHEET_ID` | **Opcional**. ID del Sheet "Gestión de Partners — Valor Pyme 2026". La pestaña `KPIs_PYMEs_Partners` se lee desde aquí. Si se deja vacío, se usa `SHEET_ID` (comportamiento actual). El Sheet debe estar compartido con el service account como Lector. |
| `BYPASS_AUTH` | **TEMPORAL**. Si vale `1`, el middleware deja pasar todo y `/dashboard` finge ser `valentina.galiano@feconsulting.cl` (vista ALL). Útil para demos sin Supabase configurado. **Quitar antes de abrirlo a socios.** |

## Desarrollo local

```bash
cp .env.local.example .env.local
# completar valores
npm install
npm run dev
# http://localhost:3000
```

Scripts disponibles: `dev`, `build`, `start`, `lint`.

## Estructura

```
dashboard-vp/
├── middleware.ts                       # entry point del middleware Next
├── src/
│   ├── app/
│   │   ├── page.tsx                    # redirect según sesión
│   │   ├── layout.tsx
│   │   ├── login/page.tsx              # form de email/password (Supabase)
│   │   ├── dashboard/page.tsx          # vista por socio (server component)
│   │   ├── api/sheet/route.ts          # JSON protegido del Sheet (no se usa por el dashboard server-side, queda disponible para clientes)
│   │   └── auth/signout/route.ts
│   ├── components/
│   │   └── SignOutButton.tsx
│   └── lib/
│       ├── partner-mapping.ts          # email/dominio → socio
│       ├── sheets.ts                   # cliente Google Sheets + caché 2 min
│       └── supabase/
│           ├── client.ts               # browser
│           ├── server.ts               # server components / route handlers
│           └── middleware.ts           # refresco de sesión + redirects
└── tailwind.config.ts                  # paleta `brand` (azul corporativo)
```

## Despliegue (primera vez)

Estimado: 60–90 min. Pasos resumidos; si es tu primer proyecto de este tipo, ver la sección extendida más abajo.

1. **GitHub**: crear repo privado y subir este código.
2. **Supabase**: crear proyecto → copiar `Project URL` y `Publishable key` → en *Authentication → Providers → Email* dejar habilitado y desactivar "Confirm email" para acelerar onboarding → en *Users* crear un usuario por socio con contraseña inicial.
3. **Google Cloud**: crear proyecto, habilitar Google Sheets API, crear service account `dashboard-vp-reader`, generar key JSON y guardarla.
4. **Sheet**: compartir `Plan_Trabajo_VP_Proyectos_2026` con el `client_email` del service account, permiso *Viewer*.
5. **Vercel**: importar el repo, pegar las 6 env vars de la tabla de arriba (sin `BYPASS_AUTH`), deploy.
6. **Probar**: abrir la URL → login → ver dashboard del socio asociado al dominio del email.
7. **Mapear socios**: editar `src/lib/partner-mapping.ts` con los dominios y emails reales. Commit + push → Vercel redeploya solo.

### Detalle por paso (primera vez)

<details>
<summary>Expandir guía paso a paso</summary>

#### Paso 1 — GitHub
Crea cuenta en [github.com/signup](https://github.com/signup), verifica el email y crea un repo privado `dashboard-vp`. Si no tienes Git: [git-scm.com](https://git-scm.com/) o GitHub Desktop.

```bash
cd dashboard-vp
git init && git add . && git commit -m "primer commit"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/dashboard-vp.git
git push -u origin main
```

#### Paso 2 — Supabase
1. [supabase.com](https://supabase.com/), región cercana (ej. São Paulo).
2. *Project Settings → API Keys*:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `Publishable key` (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`. En proyectos antiguos esta key se llamaba "anon public" — es lo mismo. **Nunca uses** la Secret key.
3. *Authentication → Providers → Email*: habilitado, "Confirm email" desactivado al inicio.
4. *Authentication → Users → Add user*: uno por socio.

#### Paso 3 — Google Cloud + Sheet
1. [console.cloud.google.com](https://console.cloud.google.com/) con la cuenta `@feconsulting.cl` que tiene acceso al Sheet.
2. Nuevo proyecto `dashboard-vp` → habilita *Google Sheets API*.
3. *IAM & Admin → Service Accounts → Create*: `dashboard-vp-reader`, sin roles. *Keys → Add Key → Create new key → JSON*. Del JSON, copia `client_email` y `private_key`.
4. En el Sheet, *Share* con el `client_email` como **Viewer**, sin notificación.

#### Paso 4 — Vercel
1. [vercel.com/signup](https://vercel.com/signup) con GitHub → *Add New → Project* → importar `dashboard-vp`.
2. Pegar las 6 env vars (ver tabla). `GOOGLE_PRIVATE_KEY` se pega multilínea tal cual viene del JSON.
3. Deploy. Te queda en `https://dashboard-vp.vercel.app` (o tu dominio personalizado).

</details>

## Operación

- **Refrescar caché**: la API `/api/sheet?refresh=1` fuerza una lectura nueva (la caché es por instancia de Vercel, así que en producción el efecto puede ser parcial).
- **Agregar un socio**: alta del usuario en Supabase + entrada en `DOMAIN_TO_PARTNER` (o `EMAIL_TO_PARTNER` si es excepción) + commit. El nombre debe coincidir con el del Sheet.
- **Bypass temporal**: setear `BYPASS_AUTH=1` en Vercel para mostrar la vista ALL sin login — útil para demos. Quitar antes de exponerlo a socios.
- **Historial de ingresos**: correr una vez `supabase/login_events.sql` en el SQL Editor de Supabase para crear la tabla. Desde ese momento, cada login queda registrado y visible en Usuarios → columna "Ingresos" (no hay forma de recuperar logins previos a la creación de la tabla).

## Próximos pasos sugeridos

- Activar "Confirm email" en Supabase y enviar invitaciones reales en lugar de crear usuarios manualmente.
- Página `/admin` con auth FE para editar el mapeo de socios sin desplegar.
- Snapshots semanales del Sheet para ver evolución (requiere DB propia).
- Branding completo: logo, dominio `dashboard.feconsulting.cl`, paleta refinada.
- 2FA para los socios en Supabase.
