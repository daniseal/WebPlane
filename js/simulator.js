import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { VEHICLES, createVehicle } from './simulator-models.js';
import { paint } from './model-primitives.js';
import { loadLocalVehicle, disposeObject } from './simulator-import.js';

export async function startSimulator(showError) {
    const $ = (id) => document.getElementById(id);
    const stage = $('stage');
    const canvas = $('vehicle-canvas');
    const viewer = document.querySelector('.viewer');
    const forceWebGL = new URLSearchParams(location.search).get('renderer') === 'webgl';
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, forceWebGL });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    $('loading-message').textContent = 'Iniciando la aceleración gráfica…';
    await renderer.init();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x20242a);
    scene.fog = new THREE.Fog(0x20242a, 35, 100);
    const environmentScene = new RoomEnvironment();
    const environmentGenerator = new THREE.PMREMGenerator(renderer);
    const environmentTarget = environmentGenerator.fromScene(environmentScene, 0.04);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.85;
    environmentScene.dispose();
    environmentGenerator.dispose();
    const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.1, 250);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.025;
    controls.enablePan = false;
    controls.autoRotateSpeed = 1.25;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.8;

    const fillLight = new THREE.HemisphereLight(0xc7dfff, 0x646455, 0.65);
    scene.add(fillLight);
    const keyLight = new THREE.DirectionalLight(0xffedcf, 3);
    keyLight.position.set(12, 20, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    Object.assign(keyLight.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 70 });
    keyLight.shadow.normalBias = 0.04;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xb6d6f2, 1.1);
    rimLight.position.set(-12, 10, -8);
    scene.add(rimLight);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), paint(0x50575e, { seed: 810, roughness: 0.96, metalness: 0.03, scale: 40 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.035;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(70, 70, 0x4d667f, 0x304559);
    grid.position.y = -0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    grid.visible = $('show-grid').checked;
    scene.add(grid);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);
    let currentModel = null;
    let selectedId = '';
    let currentEra = 'ww1';
    let modelRadius = 5;
    let modelBounds = new THREE.Box3();
    let fitDistance = 18;
    let dirty = true;
    let failed = false;
    let lastTime = 0;
    let frames = 0;
    let mixer = null;
    let selectionRevision = 0;
    let lastCatalogId = 'mark-i';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function setEnvironment(name) {
        const outdoor = name === 'outdoor';
        const background = outdoor ? 0x9aaeb9 : 0x20242a;
        scene.background.setHex(background);
        scene.fog.color.setHex(background);
        scene.environmentIntensity = outdoor ? 0.6 : 0.85;
        keyLight.color.setHex(outdoor ? 0xffeccd : 0xfff1dc);
        keyLight.intensity = outdoor ? 4 : 3;
        keyLight.position.set(outdoor ? 16 : 12, outdoor ? 15 : 20, 9);
        fillLight.intensity = outdoor ? 1.1 : 0.65;
        ground.material.color.setHex(outdoor ? 0xd1c9b8 : 0xffffff);
        dirty = true;
    }

    function updateFitDistance(direction = camera.position.clone().sub(controls.target).normalize()) {
        const verticalFov = THREE.MathUtils.degToRad(camera.fov) / 2;
        const horizontalFov = Math.atan(Math.tan(verticalFov) * camera.aspect);
        const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize();
        const up = direction.clone().cross(right).normalize();
        let distance = 0;
        for (const x of [modelBounds.min.x, modelBounds.max.x]) {
            for (const y of [modelBounds.min.y, modelBounds.max.y]) {
                for (const z of [modelBounds.min.z, modelBounds.max.z]) {
                    const corner = new THREE.Vector3(x, y, z).sub(controls.target);
                    const depth = corner.dot(direction);
                    distance = Math.max(distance, Math.abs(corner.dot(right)) / Math.tan(horizontalFov) + depth,
                        Math.abs(corner.dot(up)) / Math.tan(verticalFov) + depth);
                }
            }
        }
        fitDistance = Math.max(distance * 1.18, modelRadius * 1.3);
        controls.minDistance = modelRadius * 1.25;
        controls.maxDistance = fitDistance * 3;
        camera.far = Math.max(250, controls.maxDistance * 3);
        camera.updateProjectionMatrix();
    }

    function setView(view = 'perspective') {
        if (currentModel) modelBounds.setFromObject(currentModel);
        const directions = {
            perspective: new THREE.Vector3(1.35, 0.85, 1.6),
            side: new THREE.Vector3(0, 0.12, 1),
            front: new THREE.Vector3(1, 0.12, 0),
            top: new THREE.Vector3(0.001, 1, 0)
        };
        const direction = directions[view].normalize();
        updateFitDistance(direction);
        camera.position.copy(controls.target).add(direction.multiplyScalar(fitDistance));
        controls.update();
        document.querySelectorAll('[data-view]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
        dirty = true;
    }

    function applyWireframe() {
        currentModel?.traverse((object) => {
            if (object.isMesh) {
                for (const material of [].concat(object.material)) material.wireframe = $('wireframe').checked;
            }
        });
        dirty = true;
    }

    function mountModel(nextModel, vehicle, animations = []) {
        if (currentModel) {
            if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(currentModel); mixer = null; }
            modelRoot.remove(currentModel);
            disposeObject(currentModel);
        }
        currentModel = nextModel;
        modelRoot.add(currentModel);
        const bounds = new THREE.Box3().setFromObject(currentModel);
        const center = bounds.getCenter(new THREE.Vector3());
        currentModel.position.x -= center.x;
        currentModel.position.z -= center.z;
        currentModel.position.y -= bounds.min.y;
        bounds.setFromObject(currentModel);
        modelBounds.copy(bounds);
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        modelRadius = sphere.radius;
        controls.target.copy(sphere.center);
        selectedId = vehicle.id;
        document.querySelectorAll('[data-vehicle]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.vehicle === selectedId)));
        $('vehicle-name').textContent = vehicle.name;
        $('vehicle-description').textContent = vehicle.description;
        $('vehicle-category').textContent = vehicle.type === 'tank' ? 'VEHÍCULO TERRESTRE / BLINDADO' : vehicle.type === 'aircraft' ? 'AVIACIÓN / CAZA' : 'MODELO GLB / ARCHIVO LOCAL';
        $('vehicle-era').textContent = vehicle.eraLabel;
        $('vehicle-country').textContent = vehicle.country;
        canvas.setAttribute('aria-label', 'Modelo 3D de ' + vehicle.name + '. Usa las flechas para girar y + o − para acercar o alejar.');
        canvas.dataset.vehicle = vehicle.id;
        $('vehicle-representation').textContent = vehicle.id === 'local-glb' ? 'Modelo GLB importado' : 'Modelo con materiales PBR';
        $('return-catalog').hidden = vehicle.id !== 'local-glb';
        $('turret-control').hidden = !currentModel.userData.turret;
        $('turret-angle').value = '0';
        $('turret-value').textContent = '0°';
        if (animations.length) {
            mixer = new THREE.AnimationMixer(currentModel);
            animations.forEach((clip) => mixer.clipAction(clip).play());
        }
        $('animate-parts').checked = false;
        $('animate-parts').disabled = !currentModel.userData.animate && !mixer;
        applyWireframe();
        setView();
        dirty = true;
    }

    function selectVehicle(id) {
        const vehicle = VEHICLES.find((entry) => entry.id === id);
        if (!vehicle) throw new Error('Vehículo no encontrado: ' + id);
        const nextModel = createVehicle(id);
        selectionRevision++;
        lastCatalogId = id;
        $('import-status').textContent = '';
        mountModel(nextModel, vehicle);
    }

    function renderCatalog(selectFirst = false) {
        const list = $('vehicle-list');
        list.replaceChildren();
        const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-\s.]/g, '');
        const query = normalize($('vehicle-search').value.trim());
        const type = $('vehicle-type').value;
        const vehicles = VEHICLES.filter((vehicle) => vehicle.era === currentEra
            && (type === 'all' || vehicle.type === type)
            && normalize(`${vehicle.name} ${vehicle.country}`).includes(query))
            .sort((a, b) => (a.type === 'tank' ? 0 : 1) - (b.type === 'tank' ? 0 : 1));
        for (const vehicle of vehicles) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vehicle-card';
            button.dataset.vehicle = vehicle.id;
            button.setAttribute('aria-pressed', String(vehicle.id === selectedId));
            const image = document.createElement('img');
            image.src = vehicle.photo;
            image.alt = '';
            image.width = 76;
            image.height = 80;
            const copy = document.createElement('span');
            copy.className = 'card-copy';
            const title = document.createElement('strong');
            title.textContent = vehicle.name;
            const subtitle = document.createElement('small');
            subtitle.textContent = `${vehicle.country} · ${vehicle.type === 'tank' ? 'Tanque' : 'Avión'}`;
            copy.append(title, subtitle);
            button.append(image, copy);
            button.addEventListener('click', () => selectVehicle(vehicle.id));
            list.append(button);
        }
        $('catalog-count').textContent = `${vehicles.length} de ${VEHICLES.length}`;
        $('catalog-empty').hidden = vehicles.length > 0;
        list.setAttribute('aria-busy', 'false');
        if (selectFirst && vehicles.length) selectVehicle(vehicles[0].id);
    }

    function chooseEra(era) {
        currentEra = era;
        $('vehicle-search').value = '';
        document.querySelectorAll('[data-era]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.era === era)));
        $('era-link').href = { ww1: 'WWI.html', ww2: 'WWII.html', modern: 'WebPlanes.html' }[era];
        renderCatalog(true);
    }

    function zoom(factor) {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
        camera.position.copy(controls.target).add(offset);
        controls.update();
        dirty = true;
    }

    function resetView() {
        $('auto-rotate').checked = false;
        controls.autoRotate = false;
        setView();
    }

    controls.addEventListener('change', () => { dirty = true; });
    controls.addEventListener('start', () => {
        $('auto-rotate').checked = false;
        controls.autoRotate = false;
        document.querySelectorAll('[data-view]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
    });
    document.querySelectorAll('[data-era]').forEach((button) => button.addEventListener('click', () => chooseEra(button.dataset.era)));
    document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
    $('reset-view').addEventListener('click', resetView);
    $('zoom-in').addEventListener('click', () => zoom(0.8));
    $('zoom-out').addEventListener('click', () => zoom(1.25));
    $('wireframe').addEventListener('change', applyWireframe);
    $('show-grid').addEventListener('change', () => { grid.visible = $('show-grid').checked; dirty = true; });
    $('auto-rotate').addEventListener('change', () => { controls.autoRotate = $('auto-rotate').checked; dirty = true; });
    $('vehicle-search').addEventListener('input', () => renderCatalog());
    $('vehicle-type').addEventListener('change', () => renderCatalog());
    $('environment-select').addEventListener('change', () => setEnvironment($('environment-select').value));
    $('animate-parts').addEventListener('change', () => { dirty = true; });
    $('turret-angle').addEventListener('input', () => {
        if (currentModel?.userData.turret) {
            currentModel.userData.turret.rotation.y = THREE.MathUtils.degToRad(Number($('turret-angle').value));
            $('turret-value').textContent = $('turret-angle').value + '°';
            dirty = true;
        }
    });
    $('return-catalog').addEventListener('click', () => selectVehicle(lastCatalogId));
    $('glb-file').addEventListener('change', async () => {
        const file = $('glb-file').files[0];
        if (!file) return;
        const revision = ++selectionRevision;
        $('import-status').dataset.error = 'false';
        $('import-status').textContent = 'Abriendo ' + file.name + '…';
        $('glb-file').disabled = true;
        try {
            const imported = await loadLocalVehicle(file);
            if (revision !== selectionRevision) { disposeObject(imported.group); return; }
            const extent = new THREE.Box3().setFromObject(imported.group).getSize(new THREE.Vector3());
            const largest = Math.max(extent.x, extent.y, extent.z);
            if (largest < 1 || largest > 35) imported.group.scale.multiplyScalar(12 / largest);
            imported.group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
            mountModel(imported.group, {
                id: 'local-glb', name: imported.name, eraLabel: 'Archivo local', country: '—', type: 'imported',
                description: 'Modelo cargado desde tu equipo. Conserva sus materiales y texturas; se ajusta su tamaño para encuadrarlo en el visor.'
            }, imported.animations);
            $('import-status').textContent = 'Modelo cargado. El archivo no se ha enviado a ningún servidor.';
        } catch (error) {
            if (revision === selectionRevision) {
                $('import-status').dataset.error = 'true';
                $('import-status').textContent = error.message || 'No se pudo leer el modelo GLB.';
            }
        } finally {
            $('glb-file').disabled = false;
            $('glb-file').value = '';
        }
    });
    canvas.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r') { event.preventDefault(); resetView(); return; }
        if (['+', '=', '-', '_'].includes(event.key)) { event.preventDefault(); zoom(['+', '='].includes(event.key) ? 0.85 : 1.18); return; }
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        document.querySelectorAll('[data-view]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
        const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
        if (event.key === 'ArrowLeft') spherical.theta -= 0.12;
        if (event.key === 'ArrowRight') spherical.theta += 0.12;
        if (event.key === 'ArrowUp') spherical.phi -= 0.12;
        if (event.key === 'ArrowDown') spherical.phi += 0.12;
        spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.01, controls.maxPolarAngle);
        camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
        controls.update();
        dirty = true;
    });

    $('fullscreen').addEventListener('click', async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await viewer.requestFullscreen();
        } catch {
            $('render-status').textContent = 'Pantalla completa no disponible';
        }
    });
    document.addEventListener('fullscreenchange', () => {
        $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Salir de pantalla completa' : 'Ver en pantalla completa');
    });

    const resizeObserver = new ResizeObserver(() => {
        if (!stage.clientWidth || !stage.clientHeight) return;
        const oldFit = fitDistance;
        camera.aspect = stage.clientWidth / stage.clientHeight;
        updateFitDistance();
        const offset = camera.position.clone().sub(controls.target).multiplyScalar(fitDistance / oldFit);
        camera.position.copy(controls.target).add(offset);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(stage.clientWidth, stage.clientHeight, false);
        controls.update();
        dirty = true;
    });
    resizeObserver.observe(stage);
    document.addEventListener('visibilitychange', () => { lastTime = 0; dirty = true; });
    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        failed = true;
        renderer.setAnimationLoop(null);
        showError('Se perdió la conexión con la tarjeta gráfica. Pulsa Volver a intentar para recuperar la vista.');
    });
    renderer.onDeviceLost = () => {
        failed = true;
        renderer.setAnimationLoop(null);
        showError('Se perdió la conexión con la tarjeta gráfica. Pulsa Volver a intentar o utiliza el modo compatible.');
    };

    chooseEra(currentEra);
    $('total-vehicles').textContent = VEHICLES.length;
    renderer.render(scene, camera);
    $('loading-panel').hidden = true;
    stage.setAttribute('aria-busy', 'false');
    viewer.dataset.ready = 'true';
    $('render-status').textContent = 'Visor 3D listo';
    const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    viewer.dataset.backend = backend;
    $('engine-info').textContent = `Three.js ${THREE.REVISION} · ${backend} · motor y modelos locales. Representaciones geométricas sin simulación física.`;
    viewer.querySelectorAll('button, input, select').forEach((element) => { element.disabled = false; });
    $('animate-parts').disabled = !currentModel.userData.animate && !mixer;
    if (!document.fullscreenEnabled) $('fullscreen').hidden = true;

    renderer.setAnimationLoop((time) => {
        if (document.hidden || failed) return;
        const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
        lastTime = time;
        try {
            controls.update(delta);
            const animate = $('animate-parts').checked && !reducedMotion.matches;
            if (animate && currentModel?.userData.animate) { currentModel.userData.animate(delta); dirty = true; }
            if (animate && mixer) { mixer.update(delta); dirty = true; }
            if (!dirty && !controls.autoRotate) return;
            renderer.render(scene, camera);
            dirty = false;
            canvas.dataset.frames = String(++frames);
        } catch (error) {
            failed = true;
            renderer.setAnimationLoop(null);
            console.error('Error de renderizado:', error);
            showError('El navegador no pudo dibujar el modelo. Prueba el modo compatible para usar otra opción de aceleración gráfica.');
        }
    });

    // Estado consultable para comprobar el visor sin modificar la escena desde fuera.
    window.getSimulatorStatus = () => ({
        vehicle: selectedId, era: currentEra, backend, frames, failed,
        meshes: currentModel ? countMeshes(currentModel) : 0,
        camera: camera.position.toArray(), target: controls.target.toArray(),
        wireframe: $('wireframe').checked, grid: grid.visible, autoRotate: controls.autoRotate,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        environment: $('environment-select').value, turret: currentModel?.userData.turret?.rotation.y,
        animated: $('animate-parts').checked, vehicleCount: VEHICLES.length
    });
    function countMeshes(model) { let count = 0; model.traverse((object) => { if (object.isMesh) count++; }); return count; }
    window.addEventListener('pagehide', (event) => {
        if (event.persisted) return;
        renderer.setAnimationLoop(null);
        resizeObserver.disconnect();
        controls.dispose();
        if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(currentModel); }
        disposeObject(scene);
        environmentTarget.dispose();
        renderer.dispose();
    }, { once: true });
}
