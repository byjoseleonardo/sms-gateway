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

## PostgreSQL local

```powershell
docker compose up -d
docker compose ps
```

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

## Desarrollo

```powershell
npm install
docker compose up -d
npm run dev
```

Health:

- `GET /health`
- `GET /api/v1/gateway/health`

## API principal

### Gateway

- `POST /api/v1/gateways/register`
- `POST /api/v1/gateways/heartbeat`
- `GET /api/v1/gateways/:gatewayId/status`

### Mensajes

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

## Estado validado

El gateway `GW-A03-001` se reconecta al backend Prisma usando la credencial
preexistente y mantiene heartbeat. El job E2E migrado conserva el estado
`DELIVERED`, sus timestamps y `attempts = 1`.
