# SMS Gateway

Gateway SMS nativo para un Samsung Galaxy A03.

## Estado actual

Hitos validados:

- Android nativo con Kotlin + Jetpack Compose.
- Envío real mediante `SmsManager`.
- Callbacks `SENT` y `DELIVERED`.
- Room para historial y estado local.
- Idempotencia local por `jobId`.
- Foreground Service dedicado al gateway.
- Retrofit/OkHttp para REST.
- Registro y autenticación por gateway.
- Socket.IO autenticado.
- Heartbeat con ACK real del backend.
- Cola remota `sms.available -> claim -> send -> status`.
- PostgreSQL 17 + Prisma ORM 7.10.
- Idempotencia remota por `idempotencyKey`.
- Artemis E2E sobre Samsung físico.
- E2E real backend -> A03 -> operador -> destinatario -> `DELIVERED`.

Versiones de runtime actuales:

- Android app: `0.6.0`
- Backend: `0.4.0`
- Hito de arquitectura: PostgreSQL/Prisma

## Stack

### Android

- Kotlin integrado de AGP 9.4
- Jetpack Compose
- Compose BOM 2026.09.00
- Room 2.8.5
- DataStore
- Retrofit 3
- OkHttp
- Socket.IO client
- Foreground Service
- Android `SmsManager`
- JUnit

### Backend

- Node.js 24
- TypeScript 6
- Express 5
- Socket.IO 4
- Zod
- Prisma ORM 7.10
- PostgreSQL 17
- Docker Compose

### Testing

- Unit tests Android
- Tests de dominio backend
- PostgreSQL real para tests del registro de mensajes
- Samsung Galaxy A03 físico
- Artemis para E2E visual/agéntico

## Arquitectura

```text
Cliente / sistema externo
          |
          | POST /api/v1/messages
          v
+-----------------------------+
| Node.js / Express / Prisma  |
| PostgreSQL                  |
+-------------+---------------+
              |
              | Socket.IO: sms.available
              v
+-----------------------------+
| Samsung A03                 |
| GatewayForegroundService    |
+-------------+---------------+
              |
              | REST claim
              v
        Room SmsJob
              |
              v
         SmsManager
          /      \
       SENT    DELIVERED
          \      /
           v    v
       Backend status
              |
              v
         PostgreSQL
```

Socket.IO es señalización. PostgreSQL + Room mantienen la consistencia.

## Idempotencia

Hay dos niveles:

```text
Solicitud externa
    |
idempotencyKey UNIQUE (PostgreSQL)
    |
    +-- primera vez -> crea job
    +-- repetida    -> devuelve el mismo job

jobId remoto
    |
Room INSERT OR IGNORE
    |
    +-- nuevo  -> SmsManager
    +-- existe -> no duplica el envío
```

El E2E remoto validó que repetir la misma solicitud mantiene:

```text
created: false
attempts: 1
status: DELIVERED
```

## Desarrollo local

Backend:

```powershell
cd D:\SMS\backend
docker compose up -d
npm install
npm run db:migrate
npm run dev
```

Android conectado por USB:

```powershell
adb reverse tcp:3000 tcp:3000
```

La app usa durante desarrollo:

```text
http://127.0.0.1:3000/
```

que ADB redirige al backend de la PC.

## Verificación

Android:

```powershell
.\gradlew.bat test assembleDebug
```

Backend:

```powershell
cd backend
npm run check
npm test
```

Los tests de backend cubren:

- idempotencia por `idempotencyKey`;
- claim idempotente;
- rechazo de otro gateway;
- protección contra degradar `DELIVERED` con un `SENT` tardío.

## Hardware validado

- Samsung SM-A037M / Galaxy A03
- Android 13 / API 33
- SIM activa
- ADB autorizado
- entrega SMS real confirmada

## Próximas etapas

1. Reconciliación tras reinicios/desconexiones.
2. Política para jobs ambiguos en estado `SENDING`.
3. WorkManager como watchdog eventual.
4. Autenticación de clientes que crean mensajes.
5. Rate limiting y auditoría.
6. HTTPS/VPS y PostgreSQL de producción.
