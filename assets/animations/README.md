# Animaciones Lottie de MediRecord

Todas las animaciones se almacenan localmente como JSON y se reproducen con el
componente compartido `src/components/lottie-animation.tsx` (`lottie-react-native`).

## Animaciones originales de MediRecord

`medirecord-success.json`, `medirecord-loading.json`, `medirecord-health.json`,
`medirecord-empty.json` y `medirecord-alarm.json` son composiciones originales
creadas para MediRecord, sin recursos externos.

**Fuente:** diseño original de MediRecord.

**Licencia:** MIT para su uso y distribución dentro de MediRecord:

Copyright (c) 2026 MediRecord

Se concede permiso, de forma gratuita, para usar, copiar, modificar y distribuir
estos archivos, siempre que se conserve este aviso.

`medirecord-loading.json` se conserva para usos futuros; el estado de carga
global (`LoadingState`) utiliza ahora la animación de pastilla descrita abajo.

## Animación de pastilla (indicador de carga)

`medirecord-pill.json` es la animación **Free pill Animation** de Alan Navarrete,
descargada desde LottieFiles bajo la **Lottie Simple License** (uso gratuito,
no se requiere atribución, aunque se agradece).

- Página: https://lottiefiles.com/free-animation/pill-W1vSIUP7io
- Autor: Alan Navarrete — https://lottiefiles.com/5630834g6ghfc5si
- Licencia: https://lottiefiles.com/page/license

El archivo descargado era un contenedor dotLottie (`.lottie`) con la composición
JSON y una imagen PNG incrustada. Se exportó a JSON autocontenido (la imagen va
codificada en base64 dentro del campo `p` del asset) para que sea compatible con
la implementación actual de `LottieAnimation`, sin dependencias ni archivos
remotos. La imagen original de 6291×8192 px se redimensionó a 393×512 px
(la composición mide 256×256 px y se muestra a 44–60 px), reduciendo el archivo
de ~1,35 MB a ~43 KB sin cambios visibles.

Tras esa reducción, los metadatos `w`/`h` del asset y el ancla/escala de la capa
seguían apuntando a 6291×8192 px. Lottie Android redimensiona la imagen
decodificada a esas dimensiones declaradas, por lo que intentaba dibujar un
bitmap de `6291 × 8192 × 4 = 206.143.488` bytes y cerraba la aplicación. Los
metadatos ya están corregidos a 393×512 px y el ancla/escala se recalcularon para
conservar exactamente el render anterior (94,365 × 122,880 unidades de composición).

## Animación del doctor (saludo del Home)

`medirecord-doctor.json` es la animación **Free Doctor Animation** de Sarah Ahmad,
descargada desde LottieFiles bajo la **Lottie Simple License** (uso gratuito,
no se requiere atribución, aunque se agradece).

- Página: https://lottiefiles.com/free-animation/doctor-VPJbbHt8uZ
- Autora: Sarah Ahmad — https://lottiefiles.com/91aodb1k1w
- Licencia: https://lottiefiles.com/page/license

Se descargó directamente el **Lottie JSON** oficial (69 KB, composición de
500×500 px, 30 fps, 139 frames). El archivo es autocontenido: sus nueve assets
son imágenes PNG embebidas en base64, por lo que no necesita recursos remotos
ni configuración adicional. Se muestra a 40×40 px junto al saludo dinámico del
Home mediante `LottieAnimation`.

El asset `image_3` (`54335.png`) tenía 3375×4219 px con gran parte transparente.
Se recortó a su contenido visible y se redimensionó a 221×319 px, ajustando el
ancla y la escala de la capa para conservar exactamente su posición y tamaño en
la composición. Esto evita bitmaps Android de decenas de MiB al mostrar el
saludo del Home.

## Animación pendiente

La animación **Medical Specialist Animation** de Oğuz Akar
(https://lottiefiles.com/animation/medical-specialist-animation_3435807) es de
carácter **Premium** (IconScout / LottieFiles, Digital License). No se ha
descargado ni sustituido: se necesita que el usuario proporcione el archivo
exportado con una licencia válida para poder integrarla en el saludo del Home.

Las animaciones son decorativas y no sustituyen controles, estados de datos ni
la lógica de alarmas.
