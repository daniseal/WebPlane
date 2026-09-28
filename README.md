# WebPlane
Site Web js, html, css3 Diseño De Sitio Web

## Ejecutar localmente

Desde la carpeta del proyecto, con Python instalado:

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Abrir http://127.0.0.1:8080/WebPlanes.html. También se puede abrir `WebPlanes.html`
con Live Server de Visual Studio Code. No hay compilación ni paquetes que instalar.

Los carruseles y las pestañas utilizan Bootstrap 5.3.3. Bootstrap y las fuentes se
cargan desde sus CDN y requieren conexión a Internet. Las fotos de las diapositivas
se sirven desde `img/`, incluidas las históricas, para evitar enlaces remotos rotos.

Los créditos, las licencias y las fuentes de las nuevas fotografías están en
[img/historicos/CREDITOS.md](img/historicos/CREDITOS.md); el detalle por vehículo está
en [img/historicos/sources.json](img/historicos/sources.json).

## Simulador 3D

Con el mismo servidor abierto, visitar http://127.0.0.1:8080/Simulador3D.html
o abrir `Simulador3D.html` con Live Server. Los módulos JavaScript requieren HTTP;
abrirlo con doble clic (`file://`) muestra las instrucciones para iniciar el servidor.

- WWI: Mark I y Sopwith Camel.
- WWII: Tiger I y Supermarine Spitfire.
- Modernidad: M1 Abrams y F-35 Lightning II.

Son modelos geométricos didácticos de proporciones aproximadas, sin simulación
física ni modelos de ingeniería. El visor permite girar, acercar, cambiar de vista,
ver la malla, activar giro automático y entrar en pantalla completa. También admite
controles táctiles, flechas del teclado, `+`/`-` y `R` para restablecer la cámara.

Three.js **0.186.1** se guarda en `vendor/three/`, con su licencia MIT. Usa WebGPU
cuando está disponible y WebGL 2 como alternativa. Para solicitar la alternativa
explícitamente: http://127.0.0.1:8080/Simulador3D.html?renderer=webgl.
El simulador carga sus módulos, modelos y fotografías localmente, sin CDN.

El código está en `js/simulator.js`, los modelos en `js/simulator-models.js`, la
recuperación ante errores en `js/simulator-loader.js` y los estilos en `simulator.css`.
La inicialización del motor, la importación de módulos y la pérdida del contexto
gráfico muestran mensajes de error con opciones de recuperación.

Verificación del 27/09/2026: los seis vehículos se probaron en Chrome con WebGPU
y WebGL 2, junto con los controles de cámara, selección por época, malla y cuadrícula,
vista móvil de 390 px y mensajes ante módulo ausente o apertura mediante `file://`.
Las fuentes de las descripciones completadas en JetPlanes están en
[docs/FUENTES_DESCRIPCIONES.md](docs/FUENTES_DESCRIPCIONES.md).
