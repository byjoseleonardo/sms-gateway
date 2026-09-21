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

Copia `.env.example` a `.env` y define claves aleatorias de al menos 32 caracteres:

```env
OPERATOR_API_KEY=<clave-larga-y-aleatoria>
GATEWAY_ENROLLMENT_KEY=<otra-clave-larga-y-aleatoria>
```

`.env` es local y está ignorado por Git. En el entorno de desarrollo actual se preservan allí las credenciales del contenedor para que los reinicios de Docker/Windows no obliguen a rotarlas.

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

### Operador y mensajes

Requieren:

```http
Authorization: Bearer <OPERATOR_API_KEY>
```

- `GET /api/v1/gateways`
- `PATCH /api/v1/gateways/:gatewayId`
- `GET /api/v1/audit`
- `GET /api/v1/metrics`
- `GET /api/v1/messages`
- `POST /api/v1/messages`
- `GET /api/v1/messages/:jobId`
- `GET /api/v1/messages/:jobId/detail`
- `POST /api/v1/messages/:jobId/resolve`
- `GET /api/v1/clients`
- `POST /api/v1/clients`
- `PATCH /api/v1/clients/:clientId`
- `PATCH /api/v1/clients/:clientId/limits`
- `POST /api/v1/clients/:clientId/rotate-key`
- `GET /api/v1/clients/:clientId/metrics`

La resolución manual solo acepta jobs `AMBIGUOUS` y permite registrar `SENT`, `DELIVERED` o `FAILED`. Guarda `operatorResolvedAt` y `operatorResolutionNote` y nunca reencola el SMS.

Los endpoints usados por Android son:

- `GET /api/v1/gateway/jobs/available`
- `POST /api/v1/gateway/jobs/:jobId/claim`
- `POST /api/v1/gateway/jobs/:jobId/status`

### Panel de operador

El backend sirve una interfaz same-origin en:

```text
http://127.0.0.1:3000/operator
```

La API key se introduce en el navegador y se mantiene únicamente en `sessionStorage` de esa pestaña. El panel permite:

- ver gateways online/offline y habilitarlos/deshabilitarlos con nota;
- consultar y filtrar mensajes con paginación;
- ver métricas globales o por gateway;
- abrir el detalle de un SMS con timeline reconstruido;
- crear jobs SMS con idempotency key única;
- refresco automático cada 5 segundos;
- consultar auditoría administrativa reciente;
- resolver estados `AMBIGUOUS` con confirmación y nota de auditoría;
- crear y administrar API Clients para sistemas externos;
- ver consumo mensual, scopes, cuota y rate limit por cliente;
- filtrar historial y métricas por sistema consumidor;
- rotar o revocar claves de clientes.

Las API keys de clientes se muestran una sola vez al crearlas o rotarlas. El panel no contiene claves embebidas ni dependencias web externas.

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
las reglas críticas de concurrencia/idempotencia, reparación por heartbeat y
resolución manual de estados ambiguos.

## Seguridad

- El token del gateway, la clave de enrolamiento y la API key de operador son credenciales distintas.
- La clave de enrolamiento solo autoriza registro/rotación; Android la elimina después de obtener el token operativo.
- La API key de operador nunca se guarda en el repositorio.
- Los endpoints Android siguen autenticándose con `gatewayId + token`.
- Health permanece público para monitorización.
- El backend no habilita CORS para navegadores por defecto.

## Estado validado

El gateway `GW-A03-001` se reconecta al backend Prisma usando la credencial
preexistente y mantiene heartbeat. Los E2E remotos conservan `DELIVERED`,
timestamps e idempotencia en PostgreSQL. También se validó recuperación de un
job `QUEUED` cuyo evento realtime inicial se perdió y resolución manual de un
`AMBIGUOUS` sintético sin retransmisión.

## Consola v0.14

La consola de operador añade:

- paginación server-side de mensajes;
- métricas por estado y tasa de entrega;
- timeline de `QUEUED → CLAIMED → SENT → DELIVERED`;
- control de habilitación del gateway;
- tabla `operator_audit_logs` para cambios administrativos;
- bloqueo de reanuncio por heartbeat cuando un gateway está deshabilitado.

Al deshabilitar un gateway se limpia `lastSeenAt`; al volverlo a habilitar se mantiene
offline hasta recibir un heartbeat nuevo.


## API Clients v0.16

Los sistemas externos no usan `OPERATOR_API_KEY`. Cada integración recibe una credencial propia con formato:

```text
sk_sms_<keyId>_<secret>
```

El backend conserva únicamente `keyId` y SHA-256 de la clave. La clave completa se devuelve una sola vez y las respuestas que la contienen usan `Cache-Control: no-store`.

Scopes disponibles actualmente:

- `sms:send`: crear mensajes;
- `sms:read`: consultar estado y consumo propio.

Cada cliente puede tener un `rateLimitPerMinute` y una `monthlyQuota`. La revocación y rotación son independientes para cada sistema.

### Enviar desde un sistema externo

```http
POST /api/v1/client/messages
Authorization: Bearer sk_sms_<clave-del-sistema>
Content-Type: application/json

{
  "idempotencyKey": "pedido-123-notificacion",
  "destination": "+51999999999",
  "message": "Tu pedido fue procesado"
}
```

`gatewayId` es opcional. Si se omite, el backend selecciona un gateway habilitado y Online. Esta selección simple será sustituida por pools/políticas de routing cuando se habilite multi-gateway.

La idempotencia está aislada por cliente: dos sistemas pueden usar la misma `idempotencyKey` sin colisionar. Repetir la misma clave dentro del mismo cliente devuelve el job existente y no consume cuota nuevamente.

### Consultar estado y consumo

```http
GET /api/v1/client/messages/:jobId
Authorization: Bearer sk_sms_<clave-del-sistema>
```

Un cliente solo puede consultar sus propios mensajes. Los jobs pertenecientes a otro cliente se responden como no encontrados.

```http
GET /api/v1/client/usage
Authorization: Bearer sk_sms_<clave-del-sistema>
```

Devuelve totales, consumo del mes, estados y tasa de entrega del cliente autenticado.

### Atribución

`sms_messages` registra `source_id` y `client_id`. Los mensajes históricos y los creados manualmente por el operador usan `source_id = operator`; los mensajes de integraciones quedan asociados a su `ApiClient`.

## Validación v0.16

La suite incluye pruebas PostgreSQL y HTTP aisladas para:

- autenticación y revocación de API Clients;
- rotación de API key y revocación inmediata de la anterior;
- idempotencia independiente entre sistemas;
- cuota mensual y métricas por cliente;
- envío HTTP idempotente contra un gateway sintético sin dispositivo;
- acceso únicamente a mensajes propios;
- rechazo de credenciales inválidas.

Las pruebas HTTP usan claves y gateways sintéticos y no despachan SMS reales.
