# Estrategia de testing

## 1. Unit tests

Cubren:

- validación de números;
- validación de mensajes;
- idempotencia por `jobId`;
- error síncrono del transporte -> `FAILED`.

Un job duplicado debe producir exactamente una invocación del transporte.

## 2. Build / Room

Cada build ejecuta:

```powershell
.\gradlew.bat test assembleDebug
```

Room exporta el schema a `app/schemas/`.

Antes de cambiar la versión del schema se añadirán pruebas de migración.

## 3. Samsung A03

Ya validado:

- ADB;
- instalación APK;
- permiso SMS;
- envío real;
- SENT;
- DELIVERED;
- inicialización de Room.

Siguiente matriz física:

- Foreground Service start/stop.
- App en background.
- Pantalla apagada.
- Sin señal.
- Modo avión.
- SIM ausente.
- Reinicio de app/dispositivo.
- Pérdida/recuperación de Internet.

## 4. Artemis

Artemis se encuentra en:

```text
.tools/artemis
```

No forma parte del repositorio principal.

Estado del doctor:

- Python: OK.
- Artemis config/daemon: OK.
- Node/UI: OK.
- ADB: OK.
- A03 detectado.
- scrcpy/ffmpeg: opcionales pendientes.
- LLM multimodal: credencial pendiente.
- dispositivo: debe estar desbloqueado.

El primer E2E no enviará SMS automáticamente. Primero validará:

1. abrir app;
2. verificar título;
3. comprobar estado del gateway;
4. iniciar/detener Foreground Service;
5. verificar que la app sigue estable.

Los E2E que consumen SMS reales serán escenarios explícitos y separados.
