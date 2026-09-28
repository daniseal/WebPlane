import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VEHICLES, createVehicle } from './simulator-models.js';

export async function startSimulator(showError) {
    const $ = (id) => document.getElementById(id);
    const stage = $('stage');
    const canvas = $('vehicle-canvas');
    const viewer = document.querySelector('.viewer');
    const forceWebGL = new URLSearchParams(location.search).get('renderer') === 'webgl';
    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: false, forceWebGL });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    $('loading-message').textContent = 'Iniciando la aceleración gráfica…';
    await renderer.init();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x182333);
    scene.fog = new THREE.Fog(0x182333, 35, 100);
    const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.1, 250);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.025;
    controls.enablePan = false;
    controls.autoRotateSpeed = 1.25;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.8;

    scene.add(new THREE.HemisphereLight(0xc7dfff, 0x646455, 2.4));
    const keyLight = new THREE.DirectionalLight(0xffedcf, 3.3);
    keyLight.position.set(12, 20, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    Object.assign(keyLight.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 70 });
    keyLight.shadow.normalBias = 0.04;
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x82b8f2, 2);
    rimLight.position.set(-12, 10, -8);
    scene.add(rimLight);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x1c2938, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.035;
    ground.receiveShadow = true;
    scene.add(ground);
    const grid = new THREE.GridHelper(70, 70, 0x4d667f, 0x304559);
    grid.position.y = -0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
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
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function disposeModel(model) {
        const geometries = new Set();
        const materials = new Set();
        model.traverse((object) => {
            if (object.geometry) geometries.add(object.geometry);
            if (object.material) {
                for (const material of [].concat(object.material)) materials.add(material);
            }
        });
        geometries.forEach((geometry) => geometry.dispose());
        materials.forEach((material) => material.dispose());
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

    function selectVehicle(id) {
        const vehicle = VEHICLES.find((entry) => entry.id === id);
        if (!vehicle) throw new Error('Vehículo no encontrado: ' + id);
        // Construir primero permite conservar el modelo anterior si hubiera un fallo.
        const nextModel = createVehicle(id);
        if (currentModel) {
            modelRoot.remove(currentModel);
            disposeModel(currentModel);
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
        selectedId = id;
        document.querySelectorAll('[data-vehicle]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.vehicle === id)));
        $('vehicle-name').textContent = vehicle.name;
        $('vehicle-description').textContent = vehicle.description;
        $('vehicle-category').textContent = vehicle.type === 'tank' ? 'VEHÍCULO TERRESTRE / BLINDADO' : 'AVIACIÓN / CAZA';
        $('vehicle-era').textContent = vehicle.eraLabel;
        $('vehicle-country').textContent = vehicle.country;
        canvas.setAttribute('aria-label', 'Modelo 3D de ' + vehicle.name + '. Usa las flechas para girar y + o − para acercar o alejar.');
        canvas.dataset.vehicle = id;
        applyWireframe();
        setView();
        dirty = true;
    }

    function chooseEra(era) {
        currentEra = era;
        const list = $('vehicle-list');
        list.replaceChildren();
        document.querySelectorAll('[data-era]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.era === era)));
        const vehicles = VEHICLES.filter((vehicle) => vehicle.era === era);
        for (const vehicle of vehicles) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vehicle-card';
            button.dataset.vehicle = vehicle.id;
            button.setAttribute('aria-pressed', 'false');
            const image = document.createElement('img');
            image.src = vehicle.photo;
            image.alt = '';
            image.width = 230;
            image.height = 112;
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
        $('era-link').href = { ww1: 'WWI.html', ww2: 'WWII.html', modern: 'WebPlanes.html' }[era];
        list.setAttribute('aria-busy', 'false');
        selectVehicle(vehicles[0].id);
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
    renderer.render(scene, camera);
    $('loading-panel').hidden = true;
    stage.setAttribute('aria-busy', 'false');
    viewer.dataset.ready = 'true';
    $('render-status').textContent = 'Visor 3D listo';
    const backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    viewer.dataset.backend = backend;
    $('engine-info').textContent = `Three.js ${THREE.REVISION} · ${backend} · motor y modelos locales. Representaciones geométricas sin simulación física.`;
    viewer.querySelectorAll('button, input').forEach((element) => { element.disabled = false; });
    if (!document.fullscreenEnabled) $('fullscreen').hidden = true;

    renderer.setAnimationLoop((time) => {
        if (document.hidden || failed) return;
        const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
        lastTime = time;
        try {
            controls.update(delta);
            const animate = controls.autoRotate && !reducedMotion.matches && currentModel?.userData.animate;
            if (animate) { currentModel.userData.animate(delta); dirty = true; }
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
        geometries: renderer.info.memory.geometries
    });
    function countMeshes(model) { let count = 0; model.traverse((object) => { if (object.isMesh) count++; }); return count; }
    window.addEventListener('pagehide', (event) => {
        if (event.persisted) return;
        renderer.setAnimationLoop(null);
        resizeObserver.disconnect();
        controls.dispose();
        disposeModel(scene);
        renderer.dispose();
    }, { once: true });
}
