# SMS Gateway Backend

Backend de control para el gateway Android.

## Stack

- Node.js 24
- TypeScript 6
- Express 5
- Socket.IO 4
- Zod
- Prisma ORM 7.10
- PostgreSQL 17

## Stack Docker local

Define primero la clave de operador en la terminal:

```powershell
$env:OPERATOR_API_KEY = "<clave-larga-y-aleatoria>"
$env:GATEWAY_ENROLLMENT_KEY = "<otra-clave-larga-y-aleatoria>"
```

Levanta PostgreSQL, ejecuta migraciones y arranca el backend:

```powershell
docker compose up -d --build
docker compose ps
```

Servicios:

- `postgres`: PostgreSQL 17
- `migrate`: ejecuta `prisma migrate deploy` y finaliza
- `backend`: Node.js 24, expuesto en `127.0.0.1:3000`

El backend solo arranca cuando PostgreSQL está healthy y las migraciones terminaron correctamente.

## PostgreSQL local

El contenedor publica PostgreSQL en:

```text
127.0.0.1:54329
```

Credenciales incluidas en `docker-compose.yml` son exclusivamente para desarrollo local.

El runtime permite sobrescribir la conexión mediante:

```text
DATABASE_URL
```

## Prisma

Generar cliente:

```powershell
npm run prisma:generate
```

Crear una migración durante desarrollo:

```powershell
npm run db:migrate
```

Aplicar migraciones existentes:

```powershell
npm run db:deploy
```

Abrir Prisma Studio:

```powershell
npm run db:studio
```

La migración inicial crea:

- `gateways`
- `sms_messages`
- enum `SmsMessageStatus`

## Importación legacy

El script:

```powershell
npm run db:import-json
```

importa de forma idempotente los antiguos:

- `data/gateways.json`
- `data/messages.json`

Se conserva únicamente para transición/desarrollo. El runtime ya no depende de esos archivos.

## Desarrollo sin contenedor de aplicación

Si quieres ejecutar Node directamente en Windows:

```powershell
$env:OPERATOR_API_KEY = "<clave-larga-y-aleatoria>"
npm install
docker compose up -d postgres
npm run dev
```

La clave protege los endpoints de control que crean y consultan mensajes.

Health:

- `GET /health`
- `GET /api/v1/gateway/health`

## API principal

### Gateway

El registro inicial requiere:

```http
x-gateway-enrollment-key: <GATEWAY_ENROLLMENT_KEY>
```

- `POST /api/v1/gateways/register`
- `POST /api/v1/gateways/heartbeat`
- `GET /api/v1/gateways/:gatewayId/status`

### Mensajes

Requieren:

```http
Authorization: Bearer <OPERATOR_API_KEY>
```

- `POST /api/v1/messages`
- `GET /api/v1/messages/:jobId`
- `GET /api/v1/gateway/jobs/available`
- `POST /api/v1/gateway/jobs/:jobId/claim`
- `POST /api/v1/gateway/jobs/:jobId/status`

### Socket.IO

Autenticación:

- `gatewayId`
- token por dispositivo

Eventos:

- `gateway.serverReady`
- `gateway.heartbeat`
- `sms.available`

## Desarrollo con el Samsung por USB

```powershell
adb reverse tcp:3000 tcp:3000
```

La app puede usar:

```text
http://127.0.0.1:3000/
```

## Tests

```powershell
npm run check
npm test
```

Los tests de `SmsMessageRegistry` se ejecutan contra PostgreSQL real y verifican
las reglas críticas de concurrencia/idempotencia.

## Seguridad

- El token del gateway, la clave de enrolamiento y la API key de operador son credenciales distintas.
- La clave de enrolamiento solo autoriza registro/rotación; Android la elimina después de obtener el token operativo.
- La API key de operador nunca se guarda en el repositorio.
- Los endpoints Android siguen autenticándose con `gatewayId + token`.
- Health permanece público para monitorización.
- El backend no habilita CORS para navegadores por defecto.

## Estado validado

El gateway `GW-A03-001` se reconecta al backend Prisma usando la credencial
preexistente y mantiene heartbeat. El job E2E migrado conserva el estado
`DELIVERED`, sus timestamps y `attempts = 1`.
