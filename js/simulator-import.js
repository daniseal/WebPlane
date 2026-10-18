import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TRIANGLES = 1_000_000;
const MAX_MESHES = 3000;
const MAX_COORDINATE = 1e9;
const importResources = new WeakMap();

class ModelImportError extends Error {}

function invalid(message) {
    throw new ModelImportError(message);
}

function inspectContainer(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 20) {
        invalid('El archivo está vacío o no contiene un modelo GLB válido.');
    }
    if (buffer.byteLength > MAX_BYTES) invalid('El modelo supera el límite de 50 MB.');
    const view = new DataView(buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
        invalid('Selecciona un archivo GLB de versión 2.0.');
    }
    if (view.getUint32(8, true) !== buffer.byteLength) {
        invalid('El archivo GLB está incompleto: su tamaño no coincide con la cabecera.');
    }
    let json;
    let binaryLength = 0;
    let hasBinary = false;
    let offset = 12;
    while (offset < buffer.byteLength) {
        if (offset + 8 > buffer.byteLength) invalid('El archivo GLB contiene un bloque incompleto.');
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        if (length % 4 !== 0 || offset + 8 + length > buffer.byteLength) {
            invalid('La longitud de uno de los bloques GLB es incorrecta.');
        }
        if (offset === 12 && type !== 0x4e4f534a) {
            invalid('Falta el bloque de información inicial del modelo GLB.');
        }
        if (type === 0x4e4f534a) {
            if (json !== undefined) invalid('El archivo contiene más de un bloque JSON.');
            try {
                json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, offset + 8, length)));
            } catch {
                invalid('No se puede leer la información del modelo: el JSON está dañado.');
            }
        } else if (type === 0x004e4942) {
            if (hasBinary) invalid('El archivo contiene más de un bloque binario.');
            hasBinary = true;
            binaryLength = length;
        }
        offset += 8 + length;
    }
    if (!json || json.asset?.version !== '2.0') invalid('El modelo debe estar exportado como glTF 2.0 / GLB.');
    return { json, binaryLength };
}

function inspectDocument(json, binaryLength) {
    const compressed = new Set(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_meshopt_compression', 'KHR_texture_basisu']);
    // También se revisan las extensiones en cada objeto, aunque el exportador no las haya declarado.
    const pending = [json];
    while (pending.length) {
        const value = pending.pop();
        if (!value || typeof value !== 'object') continue;
        if (value.extensions && Object.keys(value.extensions).some((name) => compressed.has(name))) {
            invalid('Este GLB usa Draco, Meshopt o KTX2. Expórtalo sin compresión y con texturas PNG o JPEG incorporadas.');
        }
        for (const child of Object.values(value)) {
            if (child && typeof child === 'object') pending.push(child);
        }
    }
    if ([...(json.extensionsUsed || []), ...(json.extensionsRequired || [])].some((name) => compressed.has(name)) ||
        (json.images || []).some((entry) => entry.mimeType === 'image/ktx2' || /^data:image\/ktx2/i.test(entry.uri || ''))) {
        invalid('Este GLB usa Draco, Meshopt o KTX2. Expórtalo sin compresión y con texturas PNG o JPEG incorporadas.');
    }
    for (const entry of [...(json.buffers || []), ...(json.images || [])]) {
        if (Object.hasOwn(entry, 'uri') && (typeof entry.uri !== 'string' || !/^data:/i.test(entry.uri))) {
            invalid('El GLB contiene archivos externos. Exporta un único GLB con todas las texturas y la geometría incorporadas.');
        }
    }
    for (const [index, entry] of (json.buffers || []).entries()) {
        if (!Number.isSafeInteger(entry.byteLength) || entry.byteLength < 1 || entry.byteLength > MAX_BYTES) {
            invalid('El GLB declara un bloque de geometría de tamaño no admitido.');
        }
        if (entry.uri === undefined && (index !== 0 || entry.byteLength > binaryLength)) {
            invalid('Falta una parte de la geometría incorporada en el archivo GLB.');
        }
    }
    for (const accessor of json.accessors || []) {
        if (!Number.isSafeInteger(accessor.count) || accessor.count < 1 || accessor.count > MAX_TRIANGLES * 3) {
            invalid('El modelo contiene demasiados datos geométricos o un número de vértices incorrecto.');
        }
    }
    const nodes = json.nodes || [];
    if (nodes.length > 12000) invalid('El modelo contiene demasiados objetos. Simplifícalo antes de exportarlo.');
    const visited = new Set();
    const ancestors = new Set();
    function visit(index, depth) {
        if (!Number.isInteger(index) || !nodes[index]) invalid('El modelo tiene referencias de objetos incorrectas.');
        if (ancestors.has(index) || depth > 200) invalid('La jerarquía del modelo es circular o demasiado profunda.');
        if (visited.has(index)) return;
        ancestors.add(index);
        for (const child of nodes[index].children || []) visit(child, depth + 1);
        ancestors.delete(index);
        visited.add(index);
    }
    nodes.forEach((_, index) => visit(index, 0));
    let primitiveCount = 0;
    let triangleCount = 0;
    for (const mesh of json.meshes || []) {
        for (const primitive of mesh.primitives || []) {
            primitiveCount++;
            const accessor = json.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
            if (!accessor) invalid('Una de las mallas no contiene posiciones de vértices válidas.');
            const mode = primitive.mode ?? 4;
            triangleCount += mode === 4 ? accessor.count / 3 : mode === 5 || mode === 6 ? Math.max(0, accessor.count - 2) : 0;
        }
    }
    if (primitiveCount > MAX_MESHES || triangleCount > MAX_TRIANGLES) {
        invalid('El modelo supera el límite de 3.000 mallas o 1.000.000 de triángulos. Exporta una versión optimizada.');
    }
}

function resourceCollection() {
    const resources = new Set();
    const closedImages = new Set();
    const disposed = new Set();
    let released = false;
    function dispose(resource) {
        if (disposed.has(resource)) return;
        disposed.add(resource);
        if (resource.isTexture) {
            for (const image of [].concat(resource.source?.data || resource.image || [])) {
                if (image && typeof image.close === 'function' && !closedImages.has(image)) {
                    closedImages.add(image);
                    image.close();
                }
            }
        }
        resource.dispose();
    }
    function add(resource) {
        if (!resource) return;
        if (Array.isArray(resource)) {
            resource.forEach(add);
        } else if (resource.isObject3D) {
            resource.traverse((object) => {
                add(object.geometry);
                add(object.material);
                if (object.skeleton) add(object.skeleton);
            });
        } else if (resource.isBufferGeometry || resource.isMaterial || resource.isTexture || resource instanceof THREE.Skeleton) {
            if (resource.isMaterial) Object.values(resource).filter((value) => value?.isTexture).forEach(add);
            resources.add(resource);
            if (released) dispose(resource);
        }
    }
    return {
        add,
        release() {
            released = true;
            resources.forEach(dispose);
        }
    };
}

/** Libera geometrías, materiales, texturas e ImageBitmap, incluidos los compartidos. */
export function disposeObject(group) {
    if (!group) return;
    const resources = importResources.get(group) || resourceCollection();
    resources.add(group);
    resources.release();
    importResources.delete(group);
}

function inspectScene(group, animations) {
    let meshCount = 0;
    let triangles = 0;
    const checkedGeometries = new Set();
    const equipment = [];
    group.updateMatrixWorld(true);
    group.traverse((object) => {
        if (object.matrixWorld.elements.some((value) => !Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE)) {
            invalid('El modelo contiene posiciones o escalas fuera de rango. Revisa sus transformaciones al exportarlo.');
        }
        if (object.isCamera || object.isLight) equipment.push(object);
        if (!object.isMesh) return;
        const geometry = object.geometry;
        const positions = geometry?.getAttribute('position');
        if (!positions || positions.count < 3 || positions.itemSize !== 3) invalid('Una malla del modelo no tiene geometría visible.');
        const instances = object.isInstancedMesh ? object.count : 1;
        meshCount += instances;
        triangles += (geometry.index?.count ?? positions.count) / 3 * instances;
        if (meshCount > MAX_MESHES || triangles > MAX_TRIANGLES) {
            invalid('El modelo supera el límite de 3.000 mallas o 1.000.000 de triángulos. Exporta una versión optimizada.');
        }
        if (!checkedGeometries.has(geometry)) {
            checkedGeometries.add(geometry);
            const attributes = [positions, ...(geometry.morphAttributes.position || [])];
            for (const attribute of attributes) {
                for (let i = 0; i < attribute.count; i++) {
                    const x = attribute.getX(i);
                    const y = attribute.getY(i);
                    const z = attribute.getZ(i);
                    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) ||
                        Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE || Math.abs(z) > MAX_COORDINATE) {
                        invalid('El modelo contiene coordenadas inválidas. Corrige la geometría antes de exportarlo.');
                    }
                }
            }
            if (geometry.index) {
                for (let i = 0; i < geometry.index.count; i++) {
                    const index = geometry.index.getX(i);
                    if (!Number.isInteger(index) || index < 0 || index >= positions.count) {
                        invalid('La geometría contiene referencias a vértices inexistentes.');
                    }
                }
            }
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        }
        object.castShadow = true;
        object.receiveShadow = true;
    });
    if (meshCount === 0 || triangles < 1) invalid('El archivo no contiene ninguna malla 3D visible.');
    const bounds = new THREE.Box3().setFromObject(group, true);
    const extent = bounds.getSize(new THREE.Vector3()).length();
    if (bounds.isEmpty() || !Number.isFinite(extent) || extent < 1e-8 || extent > MAX_COORDINATE ||
        [...bounds.min.toArray(), ...bounds.max.toArray()].some((value) => !Number.isFinite(value) || Math.abs(value) > MAX_COORDINATE)) {
        invalid('El tamaño del modelo es nulo o está fuera de rango. Revisa la escala al exportarlo.');
    }
    for (const clip of animations) {
        if (!Number.isFinite(clip.duration) || clip.tracks.some((track) =>
            track.times.some((value) => !Number.isFinite(value)) || track.values.some((value) => !Number.isFinite(value)))) {
            invalid('El modelo contiene una animación con datos inválidos. Corrígela o exporta sin animaciones.');
        }
    }
    // Un grupo conserva las transformaciones y los hijos, pero no altera la iluminación del visor.
    for (const object of equipment) {
        if (!object.parent) continue;
        const replacement = new THREE.Group().copy(object, false);
        replacement.uuid = object.uuid;
        object.parent.add(replacement);
        replacement.add(...object.children.slice());
        object.removeFromParent();
    }
    return { meshes: meshCount, triangles: Math.ceil(triangles) };
}

/** Lee un GLB local y devuelve { group, animations, name }. No carga archivos de red. */
export async function loadLocalVehicle(file) {
    if (!file || typeof file.arrayBuffer !== 'function' || !/\.glb$/i.test(file.name || '')) {
        invalid('Selecciona un archivo .glb con el modelo y sus texturas incorporadas.');
    }
    if (file.size > MAX_BYTES) invalid('El modelo supera el límite de 50 MB.');
    const resources = resourceCollection();
    const objectURLs = new Set();
    let parser;
    try {
        const buffer = await file.arrayBuffer();
        const { json, binaryLength } = inspectContainer(buffer);
        inspectDocument(json, binaryLength);
        const manager = new THREE.LoadingManager();
        let resourceFailed = false;
        manager.onError = () => { resourceFailed = true; };
        manager.setURLModifier((url) => {
            if (!/^(blob:|data:)/i.test(url)) invalid('El modelo intenta cargar un recurso externo. Exporta un GLB completamente incorporado.');
            if (/^blob:/i.test(url)) objectURLs.add(url);
            return url;
        });
        const loader = new GLTFLoader(manager);
        loader.register((instance) => {
            parser = instance;
            // Three.js 0.186.1: registrar las dependencias permite liberarlas incluso si el parseo falla después.
            for (const method of ['getDependency', 'loadGeometries']) {
                const original = instance[method].bind(instance);
                instance[method] = (...args) => {
                    const result = original(...args);
                    Promise.resolve(result).then(resources.add, () => {});
                    if (method === 'loadGeometries') {
                        for (const entry of Object.values(instance.primitiveCache)) {
                            Promise.resolve(entry.promise).then(resources.add, () => {});
                        }
                    }
                    return result;
                };
            }
            return { name: 'JETPLANES_local_resources' };
        });
        const gltf = await loader.parseAsync(buffer, '');
        gltf.scenes.forEach(resources.add);
        if (resourceFailed) invalid('Una textura incorporada no se pudo decodificar. Exporta el GLB con texturas PNG o JPEG válidas.');
        const group = new THREE.Group();
        if (gltf.scene) group.add(gltf.scene);
        const statistics = inspectScene(group, gltf.animations || []);
        const name = file.name.replace(/\.glb$/i, '').slice(0, 120) || 'Modelo importado';
        group.name = name;
        group.userData.imported = true;
        group.userData.statistics = statistics;
        resources.add(parser?.cache.DefaultMaterial);
        importResources.set(group, resources);
        return { group, animations: gltf.animations || [], name };
    } catch (error) {
        resources.add(parser?.cache.DefaultMaterial);
        parser?.associations.forEach((_, resource) => resources.add(resource));
        resources.release();
        if (error instanceof ModelImportError) throw error;
        throw new ModelImportError('No se pudo leer el modelo GLB. Comprueba que el archivo esté completo y expórtalo como glTF 2.0 con sus recursos incorporados.', { cause: error });
    } finally {
        objectURLs.forEach((url) => URL.revokeObjectURL(url));
    }
}
