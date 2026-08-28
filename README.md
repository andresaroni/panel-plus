# PanelPlus+

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

## Alertas Web Push

Aplica `AsistenteBot/sql/migracion_004_panel_push.sql` en `registro_bot` y configura:

```env
WEB_PUSH_PUBLIC_KEY="clave-publica-vapid"
WEB_PUSH_PRIVATE_KEY="clave-privada-vapid"
WEB_PUSH_SUBJECT="https://www.frankobot.app"
PANEL_PUSH_WEBHOOK_SECRET="secreto-compartido-de-al-menos-32-caracteres"
```

Genera el par VAPID con `pnpm exec web-push generate-vapid-keys`. El secreto del
webhook debe coincidir con `PANEL_PUSH_SECRET` del bot. Android y escritorio
pueden activar alertas desde el encabezado. En iOS 16.4 o superior es necesario
agregar el panel a la pantalla de inicio y activarlas desde la aplicación instalada.

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

## Historial del Asistente IA

Aplica `prisma/sql/migracion_005_asistente_historial.sql` una sola vez sobre la base
`registro_bot`. La migración crea las conversaciones privadas de cada administrador
y sus mensajes, con eliminación en cascada. No modifica recargas, retiros ni
solicitudes existentes.

```bash
pnpm exec prisma db execute --file prisma/sql/migracion_005_asistente_historial.sql --schema prisma/schema.prisma
pnpm prisma:generate
```

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
- Para aprobarlo se exige un comprobante JPEG, PNG o WEBP.
- El panel se despliega en **Vercel** desde GitHub. Eso fija el techo de una subida: el cuerpo de una petición a una Serverless Function no puede pasar de ~4,5 MB, y al superarlo corta el edge de Vercel **antes de ejecutar la función**, sin log, sin escritura en base y con una respuesta que no es JSON. Por eso el límite de la petición está en 4 MiB: para que el rechazo lo demos nosotros con un mensaje útil y nunca Vercel en silencio.
- El límite de almacenamiento es `PANEL_MAX_STORED_IMAGE_BYTES` (3 MiB por defecto). **No lo impone la base**: el `max_allowed_packet` del MySQL de producción es 1 GB. Lo impone WhatsApp, que rechaza imágenes de más de unos 5 MB; como el comprobante se le envía al cliente *después* de aplicar el pago, aceptar una imagen que Meta no acepte deja un retiro pagado cuyo comprobante no se puede entregar.
- El navegador encoge el comprobante por encima de 1 MiB antes de subirlo, un umbral más bajo que el del servidor: no es una validación, es que el agente suele subir desde el móvil con datos. Si ya es JPEG, PNG o WEBP y no llega a ese tamaño, se sube intacto para no degradar con una recompresión la imagen que después lee el OCR. Esto automatiza el recorte que los agentes hacían a mano.
- El MIME se deriva de los magic bytes: el tipo que declara el navegador se ignora, porque proviene de la extensión o del content-provider del sistema y no del contenido. Por el mismo motivo el selector de archivos no filtra por ese MIME, que escondía comprobantes válidos sin dar ninguna explicación.
- Un archivo que no sea JPEG, PNG o WEBP se rechaza nombrando su formato real (HEIC, PDF...). El formato se comprueba antes que el tamaño, para que a un HEIC pesado se le diga que lo guarde como JPEG y no que pesa mucho.
- Todo rechazo lleva un código corto al final del mensaje (`ERR-IMG`, `ERR-FORM`, `ERR-BIG`, `ERR-DUP`, `ERR-DB`, `ERR-SRV`) que el agente puede dictar sin acceso a los logs. Si la respuesta no llega a ser JSON —un 502 de nginx, el proceso caído— el mensaje muestra `ERR-HTTP-<estado>`, que distingue «el panel falló» de «la petición no llegó».
- Cada intento fallido se guarda en `retiro_subida_fallida` con la excepción real, la huella del archivo (nombre, MIME declarado, tamaño, primeros 12 bytes en hexadecimal, SHA-256) y el archivo mismo. El modal lo enseña a todos los que revisan, con un enlace para descargarlo. **El motivo de un fallo nunca vive solo en los logs del servidor**: en la práctica no se consultan, y por eso hubo fallos que quedaron sin explicación.
- Retención: se conservan los 5 últimos intentos por retiro, los bytes solo por debajo del tope admitido, y solo se muestran los intentos posteriores a la última revisión. Los anteriores quedan como historial. Ver en `DESPLIEGUE_VPS.md` la purga por antigüedad.
- Una versión compacta del fallo queda además en `retirar_saldo.error_interno`, con un `UPDATE` que no incluye la imagen para que entre aunque lo que falle sea escribir el BLOB. La aprobación siguiente lo limpia.
- El servidor calcula SHA-256 y registra tamaño, MIME real, agente y fecha de revisión.
- La actualización condicionada por estado evita que dos agentes procesen la misma solicitud.
- Las imágenes del premio y del comprobante requieren una sesión activa.
- El ID del usuario autenticado se registra como agente del panel y como `apuestas.usuario`.
