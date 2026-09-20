# SMS Gateway Backend

Backend local de desarrollo para el gateway Android.

## Desarrollo

```powershell
npm install
npm run dev
```

Health checks:

- `GET /health`
- `GET /api/v1/gateway/health`

Durante desarrollo con el Samsung conectado por USB:

```powershell
adb reverse tcp:3000 tcp:3000
```

Con eso, la app Android puede usar `http://127.0.0.1:3000/` y el tráfico se redirige al backend de la PC.

La autenticación, PostgreSQL/Prisma, claims de jobs y Socket.IO autenticado se incorporarán en fases siguientes.
