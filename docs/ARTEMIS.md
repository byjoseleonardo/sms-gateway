# Artemis

ARTEMIS se usa como herramienta externa de exploración y E2E sobre el Samsung A03.

Repositorio local:

```text
D:\SMS\.tools\artemis
```

`.tools/` está ignorado por Git.

## Consola

El bootstrap oficial se inicia con:

```powershell
cd D:\SMS\.tools\artemis
.\start.bat -NoOpen
```

Consola:

```text
http://localhost:8000
```

Admin:

```text
http://localhost:8000/admin
```

## Diagnóstico

```powershell
uv run artemis doctor
```

No guardar credenciales de modelos en el repositorio.

Para configurar una credencial, usar localmente:

```powershell
uv run artemis init
```

No compartir la API key por chat ni incluirla en commits.

## Dependencias opcionales

`scrcpy` y `ffmpeg` mejoran streaming/video/replays. El doctor los marca como
opcionales, por lo que no forman parte del bloqueo del código Android.

## Device

Serial de desarrollo actual:

```text
R9HR90MKC5E
```

El dispositivo debe estar desbloqueado para tareas E2E.

## Helper

ARTEMIS puede instalar un helper de accesibilidad para leer la jerarquía de UI.
Debe instalarse con el teléfono desbloqueado y puede eliminarse posteriormente
con el comando de uninstall de Artemis.
