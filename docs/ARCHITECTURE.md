# Arquitectura

## Estado actual

```text
                       Sistema externo
                             |
                   POST /api/v1/messages
                             |
                             v
                 +-----------------------+
                 | Express + Prisma      |
                 | PostgreSQL            |
                 +----------+------------+
                            |
                    sms.available
                      Socket.IO
                            |
                            v
                 +-----------------------+
                 | GatewayForeground     |
                 | Service               |
                 +----------+------------+
                            |
                         REST claim
                            |
                            v
                           Room
                            |
                      SendSmsUseCase
                            |
                       SmsTransport
                            |
                       SmsManager
                       /       \
                    SENT     DELIVERED
                       \       /
                        v     v
                   REST status update
                            |
                            v
                       PostgreSQL
```

## Fuentes de verdad

- PostgreSQL: trabajos remotos, gateway registrado y estado global.
- Room: ledger local del A03.
- Socket.IO: señalización de baja latencia, no persistencia.

## Backend

### Gateway

`Gateway` almacena:

- `gatewayId`
- hash SHA-256 del token
- identificador/modelo del dispositivo
- versión Android/app
- `enabled`
- `lastSeenAt`

El token en claro solo se entrega al dispositivo durante el registro.

### SmsMessage

Estados remotos:

```text
QUEUED -> CLAIMED -> SENT -> DELIVERED
                    |
                    +-----> FAILED
```

Reglas:

- `idempotencyKey` es UNIQUE.
- El claim de `QUEUED` usa un update condicional en PostgreSQL.
- Un segundo claim del mismo gateway no aumenta `attempts`.
- Otro gateway no puede reclamar el job.
- Un `SENT` tardío no degrada `DELIVERED`.
- Un `SENT` tardío puede completar `sentAt` si faltaba, manteniendo `DELIVERED`.

## Android

Estados locales:

```text
QUEUED -> SENDING -> SENT -> DELIVERED
              |
              +-----------> FAILED
```

`RETRY_PENDING` queda reservado para reconciliación controlada.

## Idempotencia

### Backend

```text
idempotencyKey
      |
 PostgreSQL UNIQUE
      |
 +----+----+
 |         |
new     existing
 |         |
create   return same job
```

### Android

```text
jobId remoto
    |
Room INSERT OR IGNORE
    |
 +-- nuevo ----> enviar
 |
 +-- existe ---> no enviar
```

## Heartbeat

El A03 emite `gateway.heartbeat` por Socket.IO.

El backend:

1. actualiza `lastSeenAt` en PostgreSQL;
2. devuelve ACK;
3. Android marca el heartbeat como exitoso solo al recibir dicho ACK.

## Desarrollo

```text
A03
 |
 | http://127.0.0.1:3000
 v
ADB reverse tcp:3000
 |
 v
PC backend
 |
 v
PostgreSQL Docker :54329
```

## Siguiente fase: reconciliación

La regla principal será:

> Un job local ambiguo en `SENDING` después de un crash no se reenvía automáticamente.

La reconciliación comparará backend + Room y distinguirá trabajos:

- recuperables;
- ya finalizados;
- pendientes de claim;
- ambiguos que requieren política/manual review.
