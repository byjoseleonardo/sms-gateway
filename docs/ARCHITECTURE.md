# Arquitectura

## v0.3.0

```text
                       Android App
                           |
              +------------+------------+
              |                         |
              v                         v
    GatewayForegroundService       Compose UI
      remoteMessaging                   |
              |                         v
              |                   SendSmsUseCase
              |                    /          \
              |                   v            v
              |             SmsJobStore    SmsTransport
              |                   |            |
              |                   v            v
      Socket.IO pendiente        Room      SmsManager
                                   ^       /       \
                                   |    SENT      DELIVERED
                                   +------+----------+
```

## Domain

- `SmsJob`
- `SmsJobStatus`
- `SmsJobRequest`
- `SmsJobStore`
- `SmsTransport`
- `SendSmsUseCase`

## Persistencia

Room mantiene `sms_jobs` y genera el schema en `app/schemas/`.

Estados:

```text
QUEUED -> SENDING -> SENT -> DELIVERED
              |
              +-----------> FAILED
```

`RETRY_PENDING` está reservado para reconciliación/reintentos.

## Idempotencia

```text
jobId remoto
    |
    v
Room INSERT OR IGNORE
    |
    +-- nuevo ----> enviar
    |
    +-- existe ---> no enviar
```

El contenido del SMS no se usa como clave de idempotencia; dos trabajos distintos
pueden contener exactamente el mismo número y mensaje.

## Foreground Service

`GatewayForegroundService`:

- se inicia desde una interacción visible del usuario;
- usa una notificación persistente;
- declara `remoteMessaging`;
- utiliza `FOREGROUND_SERVICE_REMOTE_MESSAGING` en API 34+;
- será el propietario de la conexión Socket.IO en la siguiente fase.

No usamos `dataSync` como servicio persistente.

## Arquitectura objetivo

```text
Backend
   |
Socket.IO
(solo señalización)
   |
GatewayForegroundService
   |
REST claim/sync
   |
Room
   |
SendSmsUseCase
   |
SmsManager
```

Backend + Room serán las fuentes de consistencia. Socket.IO solamente reducirá
latencia.
