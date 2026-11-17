# Evidencias MCP — Etapa 1 (configuración y conexión con Supabase)

Fecha: 2026-11-16  
Proyecto: MediRecord  
Ruta: `C:\Users\Administrator\Documents\aplicacion web\MediRecord`  
Supabase project ref: `lkakqfktfublposlufoy`

> En este documento no se incluyen claves, tokens ni secretos. Solo se registran consultas, resultados y decisiones.

## 1. Expo MCP

### Consulta: documentación de Expo SQLite para SDK 57

Herramienta: `expo.read_documentation`  
URL: `https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/`

Resultados relevantes:

- Plataformas: Android, iOS, macOS, tvOS, Web.
- Incluido en Expo Go.
- Versión recomendada para SDK 57: `~57.0.5`.
- El módulo `expo-sqlite/localStorage/install` proporciona una implementación de `localStorage` respaldada por SQLite.

Decisión: instalar `expo-sqlite` con `npx expo install expo-sqlite` y usarlo para persistir la sesión de Supabase.

### Consulta: guía oficial Expo + Supabase

Herramienta: `expo.read_documentation`  
URL: `https://docs.expo.dev/guides/using-supabase/`

Resultados relevantes:

- Importar `expo-sqlite/localStorage/install`.
- Crear el cliente con `createClient`.
- Usar `storage: localStorage`.
- Configurar `autoRefreshToken: true`, `persistSession: true` y `detectSessionInUrl: false`.
- Ligar `startAutoRefresh()` / `stopAutoRefresh()` a `AppState`.
- Variables: `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- La guía indica que Expo ya instala el global `URL`, por lo que no se añadió `react-native-url-polyfill`.

Decisión: implementar `src/lib/supabase.ts` exactamente con ese patrón, sin lógica de autenticación todavía.

## 2. Supabase MCP

### Consulta: información del proyecto

Herramienta: `supabase.get_project`  
Project ID: `lkakqfktfublposlufoy`

Resultado:

- Nombre: MediRecord.
- Estado: `ACTIVE_HEALTHY`.
- Región: `us-west-2`.
- PostgreSQL: `17.12.0`.
- Release channel: `ga`.

### Consulta: tablas del esquema público

Herramienta: `supabase.list_tables`  
Schemas: `["public"]`  
Verbose: `true`

Resultado:

- `public` está vacío.
- No se crearon tablas en esta etapa.

### Consulta: migraciones

Herramienta: `supabase.list_migrations`

Resultado:

- No hay migraciones.
- No se aplicó SQL en esta etapa.

### Consulta: advisors

Herramientas:

- `supabase.get_advisors` con `type: "security"`.
- `supabase.get_advisors` con `type: "performance"`.

Resultado:

- Sin hallazgos de seguridad.
- Sin hallazgos de rendimiento.

### Consulta: claves publicables

Herramienta: `supabase.get_publishable_keys`

Resultado:

- Existe una clave publicable habilitada (`type: "publishable"`).
- Existe también la clave legacy `anon`.
- No se registró el valor de ninguna clave en este documento.
- No se usó ninguna clave `service_role`.

## 3. Estado local después de la configuración

- `expo-sqlite`: `~57.0.5`.
- `@supabase/supabase-js`: `^2.119.0`.
- `app.json`: se añadió el plugin `expo-sqlite` (añadido automáticamente por `npx expo install`).
- `src/lib/supabase.ts`: cliente creado, sin lógica de autenticación.
- `.env.example`: creado con valores de ejemplo.
- `.env.local`: creado con `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; está ignorado por Git y no se versiona.
- La clave publicable se reutilizó del proyecto MediRecord con autorización explícita; no se mostró en la terminal ni en la respuesta final.
- No se crearon tablas, buckets, migraciones ni usuarios.
- No se instalaron paquetes de notificaciones, cámara, fotografías, horarios ni historial.

### Prueba de conectividad

Se ejecutó un script temporal de Node con `@supabase/supabase-js`, leyendo las variables desde `.env.local` sin imprimirlas. Se intentó un inicio de sesión con credenciales deliberadamente inválidas para comprobar que el proyecto responde:

```text
SUPABASE_REACHED code=invalid_credentials status=400
```

Esto confirma que la URL y la clave publicable son válidas y que el proyecto responde. No se creó ningún usuario ni se accedió a tablas.

## 4. Validaciones ejecutadas

| Comando | Resultado |
|---|---|
| `npx expo install --check` | Dependencias actualizadas |
| `npx tsc --noEmit` | Sin errores (después de generar `expo-env.d.ts` al iniciar Expo) |
| `npx expo lint` | Configuró ESLint automáticamente; reportó 1 error preexistente en la plantilla (`use-color-scheme.web.ts`, regla `react-hooks/set-state-in-effect`), ajeno a esta etapa |
| `npx expo-doctor` | 21/21 comprobaciones correctas |
| `npx expo start --port 8083` | Metro Bundler inició correctamente; `expo-env.d.ts` generado |
| `npx expo start --port 8084` | Cargó `.env.local`, exportó las variables y Metro quedó esperando en `http://localhost:8084` |
| Prueba de conectividad | `SUPABASE_REACHED code=invalid_credentials status=400` |

## 5. Consultas reproducibles para el video

1. `expo.read_documentation` sobre `v57.0.0/sdk/sqlite/`.
2. `expo.read_documentation` sobre `guides/using-supabase/`.
3. `supabase.get_project` con `lkakqfktfublposlufoy`.
4. `supabase.list_tables` con `schemas: ["public"]` y `verbose: true`.
5. `supabase.list_migrations`.
6. `supabase.get_advisors` security y performance.
7. `supabase.get_publishable_keys` (sin mostrar el valor de la clave).
