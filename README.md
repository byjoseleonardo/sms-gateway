# SMS Gateway Android

Gateway SMS nativo para un Samsung Galaxy A03.

## Estado actual — v0.3.0

Validado hasta ahora:

- Envío real mediante `SmsManager`.
- Permiso `SEND_SMS`.
- Callbacks `SENT` y `DELIVERED`.
- Room 2.8.5.
- Historial local.
- Máquina de estados persistente.
- Idempotencia por `jobId`.
- Foreground Service para el gateway.
- Tipo de servicio `remoteMessaging`.
- Notificación persistente del servicio.
- Tests unitarios.
- Artemis instalado localmente para E2E.

## Stack

- Kotlin integrado de AGP 9.4
- Jetpack Compose
- Compose compiler plugin 2.2.10
- Compose BOM 2026.09.00
- Android Gradle Plugin 9.4.0
- Gradle Wrapper 9.6.0
- Room 2.8.5
- KSP 2.3.12
- Java target 17
- Android Studio JBR 25
- JUnit 4

## Arquitectura Android

```text
                      Compose UI
                          |
             +------------+------------+
             |                         |
             v                         v
     GatewayForegroundService    SendSmsUseCase
     remoteMessaging             /          \
             |                  /            \
     [Socket.IO después]       v              v
                         SmsJobStore       SmsTransport
                              |                 |
                              v                 v
                             Room           SmsManager
                              ^            /         \
                              |        SENT           DELIVERED
                              +----------+---------------+
```

## Idempotencia

`SmsJob.id` es la clave primaria local. Si el mismo trabajo se entrega dos veces,
el segundo `INSERT OR IGNORE` no llega a `SmsManager`.

## Foreground Service

El servicio se inicia explícitamente desde la UI y mantiene una notificación
visible. Actualmente mantiene la infraestructura del gateway activa; la conexión
Socket.IO se añadirá en la siguiente fase.

## Verificación

```powershell
.\gradlew.bat test assembleDebug
```

Resultado actual:

```text
BUILD SUCCESSFUL
44 actionable tasks
```

APK:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Hardware validado

- Samsung SM-A037M / Galaxy A03
- Android 13 / API 33
- ADB autorizado
- SIM capaz de enviar SMS
- Base local `sms-gateway.db`

## Próximas etapas

1. Validar Foreground Service v0.3 en el A03.
2. Completar Artemis con dispositivo desbloqueado y credencial local.
3. Retrofit + OkHttp.
4. Registro/autenticación del gateway.
5. Socket.IO para señalización.
6. REST claim/sync.
7. Backend Node.js/Express/PostgreSQL.
8. WorkManager para reconciliación.
