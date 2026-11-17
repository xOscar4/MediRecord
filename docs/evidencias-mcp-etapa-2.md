# Evidencias MCP — Etapa 2 (auditoría final del Deber 7)

Fecha: 2026-11-17 (fecha indicada por el entorno de la sesión de auditoría; no se registró otra fecha verificable en el historial disponible)
Proyecto: MediRecord
Ruta: `C:\Users\Administrator\Documents\aplicacion web\MediRecord`
Supabase project ref: `lkakqfktfublposlufoy`

> Auditoría de **solo lectura**: no se modificaron archivos de la aplicación, no se instalaron paquetes, no se ejecutaron migraciones y no se cambiaron datos de Supabase. En este documento no se incluyen claves, tokens ni secretos; solo consultas, resultados y decisiones.

## Origen de la información

Para no atribuir evidencias que no existen, se distinguen tres fuentes:

| Etiqueta | Significado |
|---|---|
| **[A] Sesión de auditoría actual** | Llamadas ejecutadas durante la auditoría; constan en el registro de conversación de esta sesión. |
| **[H] Historial de sesión previa** | Llamadas ejecutadas durante el desarrollo/corrección de MediRecord; constan en el registro de conversación de sesiones anteriores, **no** en un archivo versionado del repositorio. |
| **[V] Archivo versionado** | Información presente en archivos rastreados por Git (por ejemplo, `docs/evidencias-mcp-etapa-1.md`, migraciones y código fuente). |

Las consultas de la Etapa 1 (`expo.read_documentation` sobre SQLite y la guía Expo + Supabase; `supabase.get_project`, `list_tables`, `list_migrations`, `get_advisors` y `get_publishable_keys`) ya están documentadas en `docs/evidencias-mcp-etapa-1.md` **[V]** y no se repiten aquí salvo para verificar el estado actual.

---

## 1. Supabase MCP

### Consulta: conexión y estado del proyecto **[A]**

Herramientas: `supabase.list_organizations` y `supabase.get_project`.

Qué se quería comprobar: que el MCP estuviera conectado y que el proyecto remoto respondiera.

Información obtenida:

- Organización: `oscar` (`ygpiptufavtjbleypimt`).
- Proyecto: **MediRecord**, `lkakqfktfublposlufoy`, estado `ACTIVE_HEALTHY`, región `us-west-2`, PostgreSQL `17.12.0`, release channel `ga`.

Decisión: confirmar la conectividad del MCP antes de cualquier otra consulta. No se realizó ninguna acción de escritura.

Nota: el primer intento de `get_project` usó el parámetro `project_id` y fue rechazado por el servidor (`id: Missing key`); se repitió con `id` y funcionó. Fue un error de argumentos, sin efectos en la base de datos.

### Consulta: esquema, columnas y relaciones **[A]**

Herramienta: `supabase.execute_sql` sobre `information_schema.columns`, `information_schema.tables` y `information_schema.table_constraints` / `referential_constraints`.

Qué se quería comprobar: qué tablas y columnas existían realmente antes de diseñar la “eliminación” de medicamentos, y cómo se relacionaban las tomas con medicamentos y horarios.

Información obtenida:

- Tablas en `public`: `profiles`, `medications`, `medication_schedules`, `dose_occurrences`; vista `dose_occurrences_view`.
- **No existe la tabla `dose_logs`**. El historial real de tomas está en `dose_occurrences` (con `status`, `resolved_at`, snapshots de nombre y dosis).
- La vista `dose_occurrences_view` hace `LEFT JOIN medications` y expone `medication_is_active`, `is_overdue` y los snapshots; tiene `security_invoker=true` y no tiene RLS propio.
- Claves foráneas:
  - `dose_occurrences.medication_id → medications.id` con `ON DELETE SET NULL`.
  - `dose_occurrences.schedule_id → medication_schedules.id` con `ON DELETE SET NULL`.
  - `dose_occurrences.user_id → profiles.id` con `ON DELETE CASCADE`.

Decisión: no usar un borrado físico. La eliminación debía apoyarse en el estado `is_active` del medicamento y en la conservación de `dose_occurrences`.

### Consulta: políticas RLS y triggers **[A]**

Herramienta: `supabase.execute_sql` sobre `pg_class`, `pg_policies`, `pg_trigger` y `pg_get_functiondef`.

Qué se quería comprobar: que el acceso estuviera aislado por usuario y que ningún trigger impidiera conservar el historial.

Información obtenida:

- RLS habilitado en `profiles`, `medications`, `medication_schedules` y `dose_occurrences`.
- Políticas por usuario, por ejemplo `occurrences_select_own` (`user_id = auth.uid()`), `occurrences_update_own_pending` y `schedules_delete_own_without_history`.
- Triggers en `dose_occurrences`: `dose_occurrences_guard` (`BEFORE INSERT OR DELETE OR UPDATE`) y `dose_occurrences_set_updated_at` (`BEFORE UPDATE`).
- El trigger `dose_occurrences_guard` fuerza que toda toma insertada quede en `pending` si no se indica un motivo de resolución; por eso la prueba tuvo que ajustarse para simular una toma histórica `taken` (ver transacción más abajo).

Decisión: no modificar RLS ni triggers. La RPC de archivado es `SECURITY DEFINER` y ya valida `auth.uid()` internamente.

Nota: una primera consulta intentó leer `c.rowsecurity` y Postgres devolvió el error `42703: column c.rowsecurity does not exist`; se corrigió a `c.relrowsecurity`. Error de consulta, sin efectos en la base de datos.

### Consulta: funciones RPC disponibles **[A]**

Herramienta: `supabase.execute_sql` sobre `pg_proc` / `pg_get_functiondef`.

Qué se quería comprobar: si ya existía un mecanismo seguro de archivado antes de crear cualquier migración.

Información obtenida:

- `archive_medication(p_medication_id uuid, p_skip_future boolean DEFAULT false) RETURNS jsonb`, `SECURITY DEFINER`, `SET search_path TO ''`. Desactiva el medicamento, desactiva sus horarios, omite tomas futuras pendientes y conserva el historial.
- `restore_medication`, `sync_dose_occurrences`, `replace_schedule`, `set_schedule_end_date`.
- `delete_medication`: borrado físico, no apto para conservar el historial.

Decisión: reutilizar `archive_medication` para el botón “Eliminar medicamento” en `src/app/medicamentos/[id].tsx` **[V]**. No se usó `delete_medication` y no se creó ninguna migración nueva.

### Consulta: transacción de prueba con `BEGIN` / `ROLLBACK` **[A]**

Herramienta: `supabase.execute_sql`.

Qué se quería comprobar: que el archivado usado como “eliminación” desactivara el medicamento y sus horarios, cancelara dosis futuras, conservara el historial y no afectara a otros medicamentos, sin dejar datos de prueba.

Procedimiento: transacción con `begin; … rollback;`, suplantación del usuario de prueba mediante `request.jwt.claim.sub`, creación de un medicamento objetivo y uno de control, sus horarios y varias tomas. Primero se insertó una toma histórica directamente como `taken`, pero el trigger la devolvió a `pending`; la prueba se ajustó con `set_config('app.occurrence_reason', 'manual', true)` antes del `UPDATE` para simular correctamente el estado histórico.

Información obtenida antes del `rollback`:

- `archive_result`: `archived: true`, `skipped_future: 1`, `already_archived: false`.
- Objetivo: `is_active = false`, horario `is_active = false`, `archived_at` poblado.
- Toma histórica `taken`: `1` antes y `1` después (conservada).
- Tomas futuras del objetivo: `pending = 0`, `skipped = 1`, con `resolution_reason = 'medication_archived'`.
- Control: medicamento y horario activos, `14` tomas futuras pendientes.
- `dose_occurrences` del objetivo: `2 → 3` (la sincronización completó un hueco pasado); del control: `1 → 16`. No se borraron filas.

Información obtenida después del `rollback`:

- `leftover_medications: 0`, `leftover_schedules: 0`, `leftover_occurrences: 0`.

Decisión: la eliminación lógica cumple los requisitos y no requiere cambios de esquema. No quedaron datos de prueba en Supabase.

### Consulta: logs de fotografías y actualización de horarios **[H]**

Herramienta: `supabase.query_logs`.
Origen: historial de la sesión previa de corrección; **no** existe un archivo versionado con el volcado de logs.

Qué se quería comprobar/resolver: por qué no se guardaba la fotografía y por qué un cambio de horario no se aplicaba.

Información obtenida:

- Los logs de la API mostraban `PATCH /rest/v1/medications` **sin** la llamada esperada a `replace_schedule`.
- El diagnóstico registrado en el historial asoció el fallo de horarios al `DateTimePicker` montado dentro de un `Modal` de React Native, que impedía confirmar; el de fotos, a `fetch(photo.uri)` sobre una URI `file://` en Android.

Decisión / corrección relacionada (según el historial de sesión):

- Montar el `DateTimePicker` de Android directamente con `presentation="dialog"` y desmontarlo al confirmar o cancelar; usar `id` y `persistedId` de `result.scheduleId` tras `replace_schedule`.
- Leer la fotografía con `new File(uri).arrayBuffer()` en lugar de `fetch(file://)`.

Precisión de atribución: los logs permitieron identificar la ausencia de `replace_schedule`; la causa `file://` procede del diagnóstico registrado en el historial de la sesión, no de un archivo versionado ni necesariamente del propio volcado de logs.

### Consulta: estado actual del proyecto **[A]**

Herramientas: `supabase.list_tables` y `supabase.list_migrations`.

Qué se quería comprobar: que el esquema y las migraciones desplegadas coincidieran con el repositorio.

Información obtenida:

| Tabla | RLS | Filas |
|---|---|---|
| `public.profiles` | habilitado | 1 |
| `public.medications` | habilitado | 6 |
| `public.medication_schedules` | habilitado | 7 |
| `public.dose_occurrences` | habilitado | 98 |

- Migraciones aplicadas: `0001_preflight_extensions`, `0002_profiles`, `0003_auth_hook`, `0004_medications`, `0005_medication_schedules`, `0006_dose_occurrences`, `0007_dose_functions`, `0008_rls_policies`, `0009_grants`, `0010_storage_bucket`, `0011_storage_policies`, `0012_read_views` (12 en total).

Decisión: confirmar que no faltan migraciones y que la base está desplegada. No se aplicó ninguna migración durante la auditoría.

---

## 2. Expo MCP

### Consulta: conexión del MCP **[A]**

Herramienta: `expo.search_documentation`.

Qué se quería comprobar: que el servidor Expo MCP respondiera y sirviera documentación oficial.

Información obtenida: para la consulta `Expo Router SDK 57 file based routing` se devolvieron, entre otras, `https://docs.expo.dev/router/introduction/`, `https://docs.expo.dev/router/basics/core-concepts/`, `https://docs.expo.dev/versions/latest/sdk/router/` y `https://docs.expo.dev/router/advanced/native-tabs/`.

Decisión: usar la respuesta como verificación de conexión; no se extrajo de ella ningún cambio de código.

### Consulta: documentación de `DateTimePicker` **[H]**

Herramienta: `expo.read_documentation`.
Origen: historial de la sesión previa de corrección de horarios; no hay un archivo versionado con la respuesta.

Qué se quería comprobar/resolver: la API del `DateTimePicker` de la comunidad en la versión de Expo del proyecto, en particular el modo de presentación y el ciclo de montaje, para que el usuario pudiera confirmar la hora.

Información obtenida: la documentación versionada orientó el uso de `presentation="dialog"` y el montaje directo del componente. El historial registra también un intento fallido con la URL `https://docs.expo.dev/versions/v57.0.0/ui/community/datetime-picker/`, que no devolvió la página esperada; el historial no conserva la URL exacta de la consulta correcta, por lo que no se transcribe aquí.

Decisión / corrección relacionada: abandonar el `Modal` de React Native que bloqueaba la confirmación y desmontar el selector al confirmar/cancelar.

### Consulta: documentación de `ImagePicker` **[H]**

Herramienta: `expo.read_documentation`.
Origen: historial de la sesión previa de corrección de fotografías; no hay un archivo versionado con la respuesta.

Qué se quería comprobar/resolver: el uso de `expo-image-picker` en la versión del proyecto y el manejo de la URI resultante en Android.

Información obtenida: la documentación consultada orientó la selección de imágenes y el acceso al archivo local; el historial no conserva el texto literal de la respuesta, por lo que no se reproducen fragmentos.

Decisión / corrección relacionada: combinar `expo-image-picker` con `expo-file-system` para leer los bytes mediante `new File(uri).arrayBuffer()`.

### Consulta sin resultado **[A]**

Herramienta: `expo.read_documentation`.
URL intentada: `https://docs.expo.dev/versions/v57.0.0/guides/using-supabase/`.
Resultado: `Could not fetch documentation page`. La guía ya había sido consultada en la Etapa 1 sin el prefijo versionado **[V]**, por lo que no se considera una nueva evidencia de uso.

---

## 3. Comandos ejecutados por terminal (NO son MCP)

Los siguientes comandos se ejecutaron mediante shell/CLI en el historial de la sesión **[H]** y **no** deben atribuirse a ningún servidor MCP:

| Comando | Finalidad | Resultado registrado |
|---|---|---|
| `npx tsc --noEmit` | Verificación de tipos | Sin errores |
| `npx expo lint` | Verificación de estilo | Sin errores |
| `npx expo export --platform android` | Verificación del bundle Android | Correcto, 1803 módulos |

Tampoco son MCP los comandos de Git ejecutados en la auditoría **[A]** (`git status --short`, `git remote -v`, `git log --oneline -15`, `git branch -a`, `git ls-files`, `git check-ignore`, `git diff --stat`, `git grep`).

---

## 4. Resumen de contribución de cada MCP

| MCP | Herramientas utilizadas | Aporte verificable |
|---|---|---|
| Supabase | `get_project`, `list_organizations`, `execute_sql`, `query_logs` **[H]**, `list_tables`, `list_migrations` | Verificar conexión y esquema; identificar `archive_medication` como borrado lógico seguro; comprobar RLS, triggers y relaciones; validar la eliminación con transacción revertida; investigar los fallos de fotos y horarios; confirmar el estado desplegado. |
| Expo | `search_documentation`, `read_documentation` **[H]** | Verificar conexión; orientar el uso de `DateTimePicker` e `ImagePicker` para las correcciones de horarios y lectura de fotografías; documentar el patrón de cliente Supabase en la Etapa 1. |

**Límite de atribución:** los MCP aportaron consultas, documentación y verificación. El código de la aplicación fue escrito por OpenCode; ningún MCP “implementó” por sí solo una funcionalidad de MediRecord. Las consultas marcadas **[H]** proceden del historial de conversación y no de un archivo versionado del repositorio.
