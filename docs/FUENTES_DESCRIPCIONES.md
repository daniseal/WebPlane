# Fuentes de las descripciones de JetPlanes

Revisión del 27 de septiembre de 2026 de las 21 diapositivas de `WebPlanes.html`. Se completaron seis descripciones vacías y se corrigieron seis descripciones con errores o contexto insuficiente. Se conservaron el orden, las imágenes, los controles y los indicadores del carrusel. Los títulos modificados se sincronizaron con el texto alternativo y la etiqueta del indicador.

## Descripciones completadas

| Diapositiva | Datos utilizados | Fuente primaria |
| --- | --- | --- |
| Collage Sukhoi Su-57, Su-34 y Su-35 | Su-57 de quinta generación; Su-34 cazabombardero biplaza; Su-35 polivalente. | UAC: [Su-57](https://www.uacrussia.ru/en/aircraft/lineup/military/su-57/), [Su-34](https://uacrussia.ru/en/aircraft/lineup/lineup/su-34/) y [Su-35](https://uacrussia.ru/en/aircraft/lineup/military/su-35/). |
| IAI Kfir | Desarrollo israelí en los años setenta; empleo en combate y entrenamiento como adversario. | IAI: [Kfir fleet modernization](https://www.iai.co.il/press/kfir-fleet-modernization-for-sri-lanka-air-force/) y [modernización para Sri Lanka](https://www.iai.co.il/press/iai-to-upgrade-the-sri-lankan-air-forces-kfir-aircraft/). |
| Sukhoi Su-34 | Dos tripulantes, ataque a objetivos de superficie, operación diurna y nocturna y cabina blindada. | [UAC, Su-34](https://uacrussia.ru/en/aircraft/lineup/lineup/su-34/). |
| Tupolev Tu-144 | Transporte supersónico soviético; primer vuelo en 1968; servicio de pasajeros entre 1977 y 1978. | [NASA, ficha del Tu-144LL, sección Development History](https://www.nasa.gov/wp-content/uploads/2021/09/120315main_fs-062-dfrc.pdf). |
| Lockheed Martin F-35 Lightning II | Caza furtivo polivalente de quinta generación; integración de sensores e intercambio de datos. | [Lockheed Martin, F-35 capabilities](https://www.lockheedmartin.com/f35/about/5th-gen-capabilities.html). |
| Tupolev Tu-160 | Aeronave estratégica supersónica de geometría variable, concebida para misiles de crucero de largo alcance. | [UAC, Tu-160](https://uacrussia.ru/en/aircraft/lineup/military/Tu-160/). |

## Descripciones corregidas

| Diapositiva | Corrección | Evidencia |
| --- | --- | --- |
| Lockheed Martin FB-22 | Se presenta como una propuesta de bombardero derivado del F-22. Se retiraron prestaciones que se mostraban como si se hubieran medido en un prototipo operativo. | Congressional Research Service, [Air Force FB-22 Bomber Concept, RS21848](https://www.congressionalresearch.com/RS21848/document.php?study=Air+Force+FB-22+Bomber+Concept). Es una reproducción del informe primario del CRS; también está [catalogado por EveryCRSReport](https://www.everycrsreport.com/reports/RS21848.html). |
| GPB | Se corrigió «misil antibuque» por bomba guiada y se aclaró que la imagen pertenece a Ace Combat 7. No se le atribuyen prestaciones de un modelo militar real. | Inspección de `img/gpb.png`: modelo de bomba y controles del hangar del videojuego. [Ficha publicada por Bandai Namco en Steam](https://store.steampowered.com/app/1966880/ACE_COMBAT7_SKIES_UNKNOWN/) confirma GPB como armamento del juego. |
| HVAA | Se aclaró el contexto de videojuego y se sustituyó el texto coloquial por una descripción breve. | Inspección de `img/HVAA.png`: interfaz del hangar. Bandai Namco: [actualizaciones oficiales que identifican HVAA como armamento de Ace Combat 7](https://ace7.acecombat.jp/special/update.php) y [ficha del editor en Steam](https://store.steampowered.com/app/1966880/ACE_COMBAT7_SKIES_UNKNOWN/). |
| Mikoyan MiG-31 | Se retiró la atribución de operaciones «exosféricas» y se describió su papel de interceptor biplaza. | Ficha museística del portal del Ministerio de Cultura ruso: [Fighter-interceptor MiG-31](https://ar.culture.ru/en/subject/mig-31). El texto indexado identifica el interceptor supersónico biplaza y su entrada en servicio en 1981; la apertura directa no respondió durante esta revisión. |
| Sukhoi Su-35 | Se separó la versión moderna del anterior Su-27M y se retiró la ficha numérica que mezclaba variantes. | [UAC, Su-35](https://uacrussia.ru/en/aircraft/lineup/military/su-35/): desarrollo moderno derivado del Su-27 y primer vuelo en 2008. |
| F-16 Fighting Falcon | Se corrigió el orden del nombre y se precisó enero de 1979 como capacidad operativa inicial del F-16A en la USAF. | [USAF, F-16 Fighting Falcon fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104505/f-16-fighting-falcon/). |

## Comprobación de las imágenes

Las imágenes de las seis descripciones completadas y las de FB-22, GPB, HVAA y Su-35 se inspeccionaron visualmente. `img/su-34.jpg` muestra tres aeronaves: se identificó visualmente el aparato superior derecho, sin canards y con numeral 901, como Su-35; por ello se corrigió el anterior título Su-37. Esta identificación procede de la imagen local, mientras que UAC sustenta las funciones de los tres modelos.

Se normalizó `Tupolev 144` a `Tupolev Tu-144`. Se dejó `Sukhoi Su-34` como denominación del modelo, sin presentar el nombre de archivo `BlackDuck` como una variante oficial.

Las imágenes `gpb.png`, `HVAA.png` y `blackDuck.jpg` superaron la decodificación completa con Pillow. La franja gris inferior de `blackDuck.jpg` forma parte del contenido visible del archivo original; no se modificó el recurso en esta revisión de textos.
