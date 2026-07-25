# Nexo Control

Panel operativo construido con Next.js, Prisma y MariaDB para administrar usuarios, validar recargas y revisar retiros de `registro_bot`.

## Requisitos

- Node.js 20 o superior
- pnpm 10 o superior
- MariaDB/MySQL con las tablas `usuarios`, `recarga_whatsapp` y `retirar_saldo`

## Configuración

1. Copia las variables documentadas en `.env.example` a un archivo `.env`.
2. Define una `SESSION_PASSWORD` aleatoria de al menos 32 caracteres.
3. En producción usa un usuario MySQL exclusivo. La cuenta `root` solo está permitida localmente cuando `ALLOW_ROOT_DATABASE="true"`.
4. Genera Prisma con `pnpm prisma:generate`.

La aplicación utiliza introspección sobre una base existente. No ejecutes `prisma migrate reset` contra la base del bot.

## Administrador inicial

En PowerShell, define temporalmente las credenciales y ejecuta el seed:

```powershell
$env:ADMIN_USERNAME="admin"
$env:ADMIN_NAME="Administrador"
$env:ADMIN_PASSWORD="una-clave-unica-de-12-o-mas-caracteres"
pnpm db:seed-admin
Remove-Item Env:ADMIN_USERNAME, Env:ADMIN_NAME, Env:ADMIN_PASSWORD
```

El comando rechaza usuarios existentes y almacena la contraseña con Argon2id.

## Desarrollo

```bash
pnpm install
pnpm dev
```

Abre `http://localhost:3000`.

## Verificación

```bash
pnpm lint
pnpm test
pnpm build
```

## Roles

- `administrador`: solicitudes, retiros, usuarios, roles y reportes.
- `vendedor`: solicitudes, retiros y validación de comprobantes.

Las autorizaciones se verifican nuevamente en el servidor. Los comprobantes se sirven mediante rutas privadas y nunca se exponen directamente desde la base.

Las filas usadas únicamente para conservar una conversación no se muestran como
solicitudes. Una recarga aparece al quedar en revisión con comprobante validado;
un retiro aparece al pasar de borrador a pendiente. Los borradores y operaciones
canceladas tampoco afectan métricas, reportes ni exportaciones.

## Retiros

`/retiros` permite buscar, filtrar y revisar registros existentes de `retirar_saldo`. El panel no crea retiros ni ejecuta migraciones sobre esta tabla.

- Un retiro `pendiente` puede rechazarse únicamente con un motivo.
- Un retiro `error_comprobante` permite reemplazar la imagen y aprobarlo nuevamente.
- Para aprobarlo se exige un comprobante JPEG, PNG o WEBP de hasta 16 MiB.
- El servidor valida los magic bytes, calcula SHA-256 y registra tamaño, MIME, agente y fecha de revisión.
- La actualización condicionada por estado evita que dos agentes procesen la misma solicitud.
- Las imágenes del premio y del comprobante requieren una sesión activa.
- El ID del usuario autenticado se registra como agente del panel y como `apuestas.usuario`.
