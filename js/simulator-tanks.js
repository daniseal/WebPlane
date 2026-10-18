import * as THREE from 'three';
import { material, paint, add, box, rod, profile, ellipsoid } from './model-primitives.js';

// Modelos locales de exposición: siluetas y detalles aproximados, frente +X.
// Las piezas repetidas comparten geometría y se dibujan mediante instancias.
function instances(parent, geometry, surface, transforms) {
    if (!transforms.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, surface, transforms.length);
    const transform = new THREE.Object3D();
    transforms.forEach((item, index) => {
        transform.position.set(...item.position);
        transform.rotation.set(...(item.rotation || [0, 0, 0]));
        transform.scale.set(...(item.scale || [1, 1, 1]));
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function bolts(parent, positions, surface, radius = 0.028) {
    return instances(parent, new THREE.SphereGeometry(radius, 6, 4), surface,
        positions.map(position => ({ position })));
}

function linePoints(from, to, spacing) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const count = Math.max(1, Math.ceil(start.distanceTo(end) / spacing));
    return Array.from({ length: count + 1 }, (_, index) => start.clone().lerp(end, index / count).toArray());
}

// Anillos de igual número de vértices para blindajes con caras inclinadas.
function armorLoft(parent, rings, surface) {
    const plan = rings[0].points;
    const signedArea = plan.reduce((sum, [x, z], i) => {
        const next = plan[(i + 1) % plan.length];
        return sum + x * next[1] - next[0] * z;
    }, 0);
    // Homogeneiza la orientación para conservar las caras exteriores visibles.
    if (signedArea < 0) rings = rings.map(ring => ({ ...ring, points: [...ring.points].reverse() }));
    const vertices = [], uv = [];
    const point = (ring, index) => [ring.points[index][0], ring.y, ring.points[index][1]];
    const triangle = (a, b, c) => {
        vertices.push(...a, ...b, ...c);
        for (const p of [a, b, c]) uv.push((p[0] + p[2]) * 0.18, (p[1] + p[2]) * 0.2);
    };
    const sides = rings[0].points.length;
    for (let r = 0; r < rings.length - 1; r++) {
        for (let i = 0; i < sides; i++) {
            const next = (i + 1) % sides;
            triangle(point(rings[r], i), point(rings[r + 1], i), point(rings[r], next));
            triangle(point(rings[r], next), point(rings[r + 1], i), point(rings[r + 1], next));
        }
    }
    for (let i = 1; i < sides - 1; i++) {
        triangle(point(rings[0], 0), point(rings[0], i), point(rings[0], i + 1));
        const top = rings.at(-1);
        triangle(point(top, 0), point(top, i + 1), point(top, i));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.computeVertexNormals();
    return add(parent, geometry, surface);
}

function trackBand(parent, outer, inner, z, width, palette, spacing = 0.19) {
    const shoes = [], ribs = [];
    for (const sign of [-1, 1]) {
        profile(parent, outer, width, [0, 0, sign * z], palette.track, [inner]);
        outer.forEach((start, index) => {
            const end = outer[(index + 1) % outer.length];
            const dx = end[0] - start[0], dy = end[1] - start[1];
            const length = Math.hypot(dx, dy), count = Math.ceil(length / spacing);
            const rotation = [0, 0, Math.atan2(dy, dx)];
            for (let i = 0; i < count; i++) {
                const position = [start[0] + dx * (i + 0.5) / count, start[1] + dy * (i + 0.5) / count, sign * z];
                shoes.push({ position, rotation, scale: [length / count * 0.88, 0.072, width + 0.02] });
                ribs.push({ position, rotation, scale: [0.038, 0.105, width + 0.045] });
            }
        });
    }
    instances(parent, new THREE.BoxGeometry(1, 1, 1), palette.track, shoes);
    instances(parent, new THREE.BoxGeometry(1, 1, 1), palette.steel, ribs);
}

function roadWheels(parent, wheels, palette) {
    const tires = [], rims = [], centers = [], studs = [];
    for (const [x, y, z, radius, width] of wheels) {
        tires.push({ position: [x, y, z], scale: [radius, radius, width] });
        rims.push({ position: [x, y, z], scale: [radius * 0.81, radius * 0.81, width + 0.025] });
        centers.push({ position: [x, y, z], scale: [radius * 0.25, radius * 0.25, width + 0.075] });
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            studs.push([x + Math.cos(angle) * radius * 0.53, y + Math.sin(angle) * radius * 0.53,
                z + Math.sign(z) * (width / 2 + 0.023)]);
        }
    }
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20);
    cylinder.rotateX(Math.PI / 2);
    instances(parent, cylinder, palette.rubber, tires);
    instances(parent, cylinder.clone(), palette.armor, rims);
    instances(parent, cylinder.clone(), palette.steel, centers);
    bolts(parent, studs, palette.steel, 0.022);
}

function standardRunningGear(parent, length, z, width, palette, count = 7, radius = 0.44) {
    const end = length / 2;
    const outer = [[-end + 0.43, 0.105], [end - 0.44, 0.105], [end - 0.08, 0.4],
        [end, 0.75], [end - 0.28, 1.22], [end - 0.6, 1.31], [-end + 0.56, 1.31],
        [-end + 0.19, 1.15], [-end, 0.69], [-end + 0.09, 0.36]];
    const inner = outer.map(([x, y]) => [x * 0.946, 0.69 + (y - 0.69) * 0.72]);
    trackBand(parent, outer, inner, z, width, palette);
    const wheels = [];
    for (const sign of [-1, 1]) {
        for (let i = 0; i < count; i++) {
            const x = -end + 0.79 + i * (length - 1.58) / (count - 1);
            wheels.push([x, 0.6, sign * z, radius, width * 0.8]);
        }
        for (const x of [-end + 0.37, end - 0.36]) wheels.push([x, 0.78, sign * z, 0.35, width * 0.72]);
        for (let i = 0; i < 3; i++) wheels.push([-end + 1.1 + i * (length - 2.2) / 2, 1.13, sign * z, 0.12, width * 0.6]);
    }
    roadWheels(parent, wheels, palette);
}

function openBarrel(parent, from, to, radius, surface, innerSurface, endRadius = radius * 0.83) {
    const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start), length = direction.length();
    direction.normalize();
    const tube = add(parent, new THREE.CylinderGeometry(endRadius, radius, length, 24, 1, true), surface);
    tube.position.copy(start).add(end).multiplyScalar(0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    const lip = add(parent, new THREE.RingGeometry(endRadius * 0.68, endRadius, 24), surface, to);
    lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
    const bore = add(parent, new THREE.CircleGeometry(endRadius * 0.7, 24), innerSurface);
    bore.position.copy(end).addScaledVector(direction, -0.08);
    bore.quaternion.copy(lip.quaternion);
    return tube;
}

function grille(parent, position, size, surface, dark, slats = 12) {
    box(parent, size, position, dark);
    const transforms = Array.from({ length: slats }, (_, i) => ({
        position: [position[0] - size[0] * 0.46 + size[0] * 0.92 * i / (slats - 1), position[1] + size[1] / 2 + 0.012, position[2]],
        scale: [size[0] / slats * 0.48, 0.025, size[2] * 0.93]
    }));
    instances(parent, new THREE.BoxGeometry(1, 1, 1), surface, transforms);
}

function hatch(parent, x, y, z, radius, surface, dark) {
    rod(parent, [x, y, z], [x, y + 0.05, z], radius + 0.025, dark, radius + 0.025, 28);
    rod(parent, [x, y + 0.05, z], [x, y + 0.09, z], radius, surface, radius, 28);
    rod(parent, [x - 0.075, y + 0.14, z], [x + 0.075, y + 0.14, z], 0.018, dark);
    for (const sx of [-0.075, 0.075]) rod(parent, [x + sx, y + 0.08, z], [x + sx, y + 0.14, z], 0.017, dark);
}

function lamp(parent, x, y, z, palette) {
    rod(parent, [x - 0.09, y, z], [x, y, z], 0.092, palette.armor, 0.092, 16);
    const lens = add(parent, new THREE.CircleGeometry(0.074, 16), palette.glass, [x + 0.005, y, z]);
    lens.rotation.y = Math.PI / 2;
    rod(parent, [x - 0.05, y + 0.13, z - 0.12], [x - 0.05, y + 0.13, z + 0.12], 0.019, palette.steel);
    for (const sign of [-1, 1]) rod(parent, [x - 0.05, y - 0.09, z + sign * 0.12], [x - 0.05, y + 0.13, z + sign * 0.12], 0.018, palette.steel);
}

function towingEyes(parent, x, y, width, surface) {
    for (const sign of [-1, 1]) {
        const eye = add(parent, new THREE.TorusGeometry(0.077, 0.027, 6, 14), surface, [x, y, sign * width]);
        eye.rotation.y = Math.PI / 2;
    }
}

function palette(color, options = {}) {
    return {
        armor: paint(color, { seed: 41, roughness: 0.88, metalness: 0.22, ...options }),
        trim: paint(new THREE.Color(color).multiplyScalar(0.73).getHex(), { seed: 18, roughness: 0.91 }),
        steel: material(0x514e42, { roughness: 0.8, metalness: 0.62 }),
        track: paint(0x393932, { seed: 52, roughness: 0.96, metalness: 0.4, scale: 3 }),
        rubber: material(0x191e1d, { roughness: 0.95, metalness: 0.02 }),
        glass: material(0x80b2ba, { roughness: 0.14, metalness: 0.76 })
    };
}

function complete(group) {
    group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(group);
    group.position.y -= bounds.min.y;
    return group;
}

function markI() {
    const group = new THREE.Group();
    const p = palette(0x736a49, { camo: [0x625e46, 0x827958], seed: 11 });
    profile(group, [[-3.15, 0.77], [2.9, 0.77], [3.37, 1.71], [1.96, 2.01], [-2.92, 2.01], [-3.4, 1.6]], 2.06, [0, 0, 0], p.armor);
    const outer = [[-4.0, 0.87], [-3.12, 0.13], [2.5, 0.13], [4.0, 1.78], [3.5, 2.38], [-2.64, 2.38]];
    const inner = [[-3.6, 0.92], [-2.99, 0.41], [2.28, 0.41], [3.65, 1.79], [3.29, 2.1], [-2.48, 2.1]];
    trackBand(group, outer, inner, 1.31, 0.56, p, 0.195);
    const rivets = [], tailWheels = [];
    for (const sign of [-1, 1]) {
        profile(group, inner, 0.42, [0, 0, sign * 1.31], p.armor);
        // Paños de chapa, con juntas verticales y remaches visibles.
        for (const x of [-2.32, -1.48, 1.48, 2.12]) {
            box(group, [0.027, 1.32, 0.018], [x, 1.32, sign * 1.531], p.trim);
            rivets.push(...linePoints([x - 0.055, 0.74, sign * 1.55], [x - 0.055, 1.97, sign * 1.55], 0.16));
        }
        const rim = [[-3.29, 0.93], [-2.85, 0.54], [2.19, 0.54], [3.44, 1.76], [3.21, 1.98], [-2.38, 1.98]];
        rim.forEach((a, i) => {
            const b = rim[(i + 1) % rim.length];
            rivets.push(...linePoints([a[0], a[1], sign * 1.542], [b[0], b[1], sign * 1.542], 0.17));
        });
        const sponson = new THREE.Group();
        sponson.position.z = sign * 1.53;
        group.add(sponson);
        armorLoft(sponson, [
            { y: 0.96, points: [[-1.12, -0.53], [-1.12, 0.53], [0.76, 0.53], [1.13, 0.26], [1.13, -0.26], [0.76, -0.53]] },
            { y: 1.82, points: [[-1.08, -0.48], [-1.08, 0.48], [0.72, 0.48], [1.04, 0.24], [1.04, -0.24], [0.72, -0.48]] }
        ], p.armor);
        ellipsoid(group, [0.31, 0.31, 0.24], [0.83, 1.4, sign * 2.01], p.trim);
        openBarrel(group, [0.92, 1.41, sign * 2.05], [1.92, 1.43, sign * 2.33], 0.079, p.steel, p.rubber);
        rivets.push(...linePoints([-1.01, 1.06, sign * 2.067], [0.6, 1.06, sign * 2.067], 0.14));
        rivets.push(...linePoints([-1.01, 1.71, sign * 2.027], [0.6, 1.71, sign * 2.027], 0.14));
        box(group, [0.43, 0.036, 0.02], [-0.6, 1.43, sign * 2.067], p.rubber);
        rod(group, [-2.83, 0.96, sign * 0.6], [-5.13, 0.52, sign * 0.81], 0.055, p.trim);
        rod(group, [-3.26, 0.89, sign * 0.61], [-4.79, 0.61, sign * 0.81], 0.035, p.steel);
        tailWheels.push([-5.13, 0.45, sign * 0.92, 0.45, 0.16]);
    }
    roadWheels(group, tailWheels, p);
    rod(group, [-5.13, 0.45, -1.04], [-5.13, 0.45, 1.04], 0.065, p.steel);
    profile(group, [[1.59, 2], [2.67, 2], [2.49, 2.34], [1.74, 2.34]], 1.32, [0, 0, 0], p.armor);
    for (const z of [-0.33, 0.33]) {
        box(group, [0.034, 0.065, 0.41], [2.585, 2.16, z], p.rubber);
        rivets.push(...linePoints([2.48, 2.29, z - 0.23], [2.48, 2.29, z + 0.23], 0.13));
    }
    grille(group, [-1.42, 2.025, 0], [1.42, 0.023, 0.8], p.trim, p.rubber, 14);
    hatch(group, 0.25, 2.02, 0, 0.32, p.armor, p.trim);
    rod(group, [-1.94, 2.06, 0.64], [-1.94, 2.31, 0.64], 0.065, p.steel);
    rod(group, [-1.94, 2.31, 0.64], [-2.66, 2.31, 0.64], 0.066, p.steel);
    bolts(group, rivets, p.trim, 0.031);
    return complete(group);
}

function renaultFT() {
    const group = new THREE.Group();
    const p = palette(0x7c805a, { camo: [0x83704c, 0x555e49], seed: 8 });
    const outer = [[-2.02, 0.65], [-1.76, 0.13], [1.32, 0.13], [2.14, 0.97], [2.06, 1.38], [1.65, 1.72], [1.15, 1.62], [-1.77, 1.14]];
    const inner = [[-1.79, 0.67], [-1.63, 0.36], [1.2, 0.36], [1.89, 1.0], [1.85, 1.28], [1.61, 1.48], [1.19, 1.4], [-1.61, 0.96]];
    trackBand(group, outer, inner, 0.84, 0.34, p, 0.14);
    const wheels = [], rivets = [];
    for (const sign of [-1, 1]) {
        for (let i = 0; i < 9; i++) wheels.push([-1.52 + i * 0.34, 0.41, sign * 0.84, 0.235, 0.29]);
        wheels.push([1.57, 1.14, sign * 0.84, 0.425, 0.26], [-1.59, 0.81, sign * 0.84, 0.33, 0.28]);
        box(group, [2.88, 0.12, 0.095], [-0.06, 0.65, sign * 1.024], p.trim);
        for (const x of [-1.21, -0.22, 0.77]) {
            profile(group, [[x - 0.35, 0.64], [x, 0.95], [x + 0.35, 0.64]], 0.09, [0, 0, sign * 1.005], p.armor);
            rod(group, [x, 0.69, sign * 1.04], [x, 1.08, sign * 1.04], 0.065, p.steel);
        }
        rod(group, [-1.59, 0.87, sign * 0.95], [1.48, 1.23, sign * 0.95], 0.055, p.trim);
    }
    roadWheels(group, wheels, p);
    profile(group, [[-1.81, 0.5], [1.6, 0.5], [1.72, 0.83], [0.97, 1.57], [0.12, 1.67], [-0.56, 1.3], [-1.74, 1.13]], 1.27, [0, 0, 0], p.armor);
    for (const sign of [-1, 1]) {
        rivets.push(...linePoints([-1.68, 0.61, sign * 0.652], [1.47, 0.61, sign * 0.652], 0.15));
        rivets.push(...linePoints([-1.58, 1.12, sign * 0.652], [-0.58, 1.25, sign * 0.652], 0.16));
        rivets.push(...linePoints([0.0, 1.59, sign * 0.652], [0.92, 1.52, sign * 0.652], 0.13));
    }
    const driverPlate = box(group, [0.03, 0.36, 0.87], [1.2, 1.34, 0], p.trim);
    driverPlate.rotation.z = 0.73;
    box(group, [0.033, 0.043, 0.39], [1.337, 1.32, 0], p.rubber).rotation.z = 0.73;
    grille(group, [-1.2, 1.21, 0], [0.8, 0.055, 0.82], p.trim, p.rubber, 12);
    // Patín trasero para franquear zanjas, propio del Renault FT.
    profile(group, [[-1.7, 0.91], [-2.76, 0.6], [-3.0, 0.74], [-2.9, 0.86], [-1.76, 1.12]], 0.75, [0, 0, 0], p.trim);
    for (const sign of [-1, 1]) rod(group, [-1.22, 1.03, sign * 0.42], [-2.64, 0.79, sign * 0.35], 0.045, p.steel);
    const turret = new THREE.Group();
    turret.position.x = 0.28;
    group.add(turret);
    group.userData.turret = turret;
    rod(turret, [0, 1.54, 0], [0, 1.66, 0], 0.64, p.trim, 0.64, 24);
    rod(turret, [0, 1.66, 0], [0, 2.3, 0], 0.65, p.armor, 0.53, 8);
    rod(turret, [-0.08, 2.3, 0], [-0.08, 2.48, 0], 0.29, p.trim, 0.24, 8);
    hatch(turret, -0.08, 2.48, 0, 0.22, p.armor, p.trim);
    box(turret, [0.15, 0.36, 0.35], [0.565, 1.98, 0], p.trim);
    openBarrel(turret, [0.62, 1.99, 0], [1.11, 1.99, 0], 0.064, p.steel, p.rubber);
    const turretRivets = [];
    for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + Math.PI / 8;
        for (const [y, r] of [[1.74, 0.627], [2.22, 0.541]]) turretRivets.push([Math.cos(a) * r, y, Math.sin(a) * r]);
        box(turret, [0.12, 0.025, 0.012], [Math.cos(a) * 0.249 - 0.08, 2.4, Math.sin(a) * 0.249], p.rubber).rotation.y = -a + Math.PI / 2;
    }
    bolts(turret, turretRivets, p.trim, 0.022);
    bolts(group, rivets, p.trim, 0.024);
    return complete(group);
}

function tigerI() {
    const group = new THREE.Group();
    const p = palette(0xb2a177, { camo: [0x68704c, 0x75604a], seed: 19 });
    const outer = [[-2.63, 0.11], [2.47, 0.11], [2.94, 0.43], [3.02, 0.87], [2.63, 1.36], [-2.58, 1.36], [-3.01, 0.96], [-3.02, 0.53]];
    const inner = outer.map(([x, y]) => [x * 0.949, 0.74 + (y - 0.74) * 0.77]);
    trackBand(group, outer, inner, 1.42, 0.71, p, 0.165);
    const wheels = [];
    for (const sign of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
            wheels.push([-2.29 + i * 0.654, 0.64, sign * (1.39 + (i % 2 ? 0.12 : -0.12)), 0.515, 0.24]);
            if (i % 2 === 0) wheels.push([-2.29 + i * 0.654, 0.64, sign * 1.68, 0.515, 0.1]);
        }
        wheels.push([-2.66, 0.91, sign * 1.42, 0.32, 0.45], [2.67, 0.86, sign * 1.42, 0.35, 0.45]);
    }
    roadWheels(group, wheels, p);
    profile(group, [[-2.97, 0.72], [2.52, 0.72], [2.85, 1.18], [2.8, 1.74], [-2.97, 1.74]], 2.74, [0, 0, 0], p.armor);
    box(group, [5.85, 0.085, 3.53], [-0.015, 1.7, 0], p.armor);
    // Uniones de faldones; pequeñas separaciones dejan leer las placas.
    for (const sign of [-1, 1]) {
        for (let i = 0; i < 4; i++) box(group, [1.38, 0.12, 0.26], [-2.17 + i * 1.43, 1.63, sign * 1.71], p.trim);
        box(group, [0.038, 0.19, 0.3], [2.822, 1.49, sign * 0.71], p.trim);
        lamp(group, 2.86, 1.83, sign * 1.03, p);
        grille(group, [-1.99, 1.754, sign * 0.75], [1.37, 0.032, 0.85], p.trim, p.rubber, 15);
        rod(group, [-3.015, 1.03, sign * 0.62], [-3.015, 1.96, sign * 0.62], 0.1, p.steel);
        rod(group, [-3.015, 1.14, sign * 0.62], [-3.015, 1.7, sign * 0.62], 0.19, p.trim);
        rod(group, [-1.05, 1.82, sign * 1.25], [0.89, 1.82, sign * 1.25], 0.035, p.steel);
    }
    box(group, [0.03, 0.072, 0.32], [2.825, 1.5, -0.67], p.rubber);
    ellipsoid(group, [0.12, 0.14, 0.14], [2.836, 1.44, 0.66], p.trim);
    rod(group, [2.85, 1.44, 0.66], [3.2, 1.44, 0.66], 0.026, p.steel);
    towingEyes(group, 2.9, 0.97, 1.01, p.steel);
    towingEyes(group, -3.02, 0.91, 0.99, p.steel);
    const turret = new THREE.Group();
    turret.position.x = 0.18;
    group.add(turret);
    group.userData.turret = turret;
    rod(turret, [0, 1.75, 0], [0, 1.86, 0], 1.07, p.trim, 1.07, 40);
    const ring = Array.from({ length: 32 }, (_, i) => {
        const a = i * Math.PI / 16;
        return [Math.min(0.92, Math.cos(a) * 1.17), Math.sin(a) * 1.095];
    });
    armorLoft(turret, [{ y: 1.85, points: ring }, { y: 2.65, points: ring.map(([x, z]) => [x * 0.98, z * 0.98]) }], p.armor);
    box(turret, [0.42, 0.64, 1.73], [1, 2.21, 0], p.armor);
    ellipsoid(turret, [0.16, 0.275, 0.54], [1.22, 2.22, 0], p.trim);
    box(turret, [0.45, 0.49, 1.17], [-1.26, 2.26, 0], p.trim);
    box(turret, [0.46, 0.035, 1.2], [-1.26, 2.52, 0], p.armor);
    rod(turret, [1.22, 2.22, 0], [1.7, 2.22, 0], 0.205, p.trim, 0.143, 24);
    openBarrel(turret, [1.68, 2.22, 0], [5.03, 2.22, 0], 0.112, p.armor, p.rubber, 0.081);
    openBarrel(turret, [4.92, 2.22, 0], [5.26, 2.22, 0], 0.15, p.steel, p.rubber, 0.15);
    for (const sign of [-1, 1]) {
        box(turret, [0.17, 0.09, 0.015], [5.075, 2.22, sign * 0.148], p.rubber);
        for (let i = 0; i < 3; i++) rod(turret, [0.46 - i * 0.2, 2.62, sign * 1.045], [0.63 - i * 0.2, 2.77, sign * 1.13], 0.049, p.trim);
        const white = material(0xd8d7c9, { roughness: 0.9 });
        box(turret, [0.51, 0.19, 0.013], [-0.03, 2.2, sign * 1.099], white);
        box(turret, [0.19, 0.52, 0.015], [-0.03, 2.2, sign * 1.101], white);
        box(turret, [0.45, 0.078, 0.019], [-0.03, 2.2, sign * 1.111], p.rubber);
        box(turret, [0.079, 0.45, 0.019], [-0.03, 2.2, sign * 1.111], p.rubber);
    }
    rod(turret, [-0.39, 2.64, -0.47], [-0.39, 2.94, -0.47], 0.34, p.trim, 0.31, 24);
    hatch(turret, -0.39, 2.94, -0.47, 0.3, p.armor, p.trim);
    for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3;
        box(turret, [0.115, 0.069, 0.018], [-0.39 + Math.cos(a) * 0.323, 2.83, -0.47 + Math.sin(a) * 0.323], p.rubber).rotation.y = -a + Math.PI / 2;
    }
    hatch(turret, 0.04, 2.65, 0.56, 0.24, p.armor, p.trim);
    rod(turret, [-0.87, 2.64, 0.39], [-0.87, 3.55, 0.39], 0.012, p.steel, 0.007, 6);
    const fasteners = [];
    for (const sign of [-1, 1]) fasteners.push(...linePoints([-2.72, 1.759, sign * 1.3], [2.65, 1.759, sign * 1.3], 0.3));
    bolts(group, fasteners, p.trim, 0.028);
    return complete(group);
}

function star(parent, position, radius, facing = 1) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + i * Math.PI / 5;
        const r = radius * (i % 2 ? 0.42 : 1);
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const mesh = add(parent, new THREE.ShapeGeometry(shape), material(0xdedccc, { roughness: 0.95, side: THREE.DoubleSide }), position);
    if (facing < 0) mesh.rotation.y = Math.PI;
}

function sherman() {
    const group = new THREE.Group();
    const p = palette(0x657052, { camo: [0x596347], seed: 22 });
    standardRunningGear(group, 5.45, 1.25, 0.48, p, 6, 0.38);
    profile(group, [[-2.74, 0.73], [2.24, 0.73], [2.77, 1.17], [1.61, 2.02], [-2.6, 2.02]], 2.15, [0, 0, 0], p.armor);
    for (const sign of [-1, 1]) {
        box(group, [5.48, 0.06, 0.55], [-0.03, 1.49, sign * 1.23], p.trim);
        // Tres bogies VVSS de dos ruedas por lado, con brazos y resortes.
        for (const x of [-1.56, 0, 1.56]) {
            profile(group, [[x - 0.4, 0.51], [x - 0.31, 1.03], [x + 0.31, 1.03], [x + 0.4, 0.51], [x + 0.2, 0.51], [x, 0.85], [x - 0.2, 0.51]], 0.09, [0, 0, sign * 1.53], p.armor);
            for (const dx of [-0.13, 0.13]) rod(group, [x + dx, 0.8, sign * 1.49], [x + dx, 1.17, sign * 1.49], 0.092, p.trim, 0.092, 12);
            rod(group, [x - 0.32, 1.15, sign * 1.45], [x + 0.38, 1.15, sign * 1.45], 0.05, p.steel);
        }
        lamp(group, 2.1, 1.86, sign * 0.91, p);
        ellipsoid(group, [0.46, 0.16, 0.29], [0.91, 2.02, sign * 0.64], p.armor);
        hatch(group, 0.89, 2.15, sign * 0.64, 0.25, p.armor, p.trim);
        box(group, [0.22, 0.08, 0.13], [1.0, 2.25, sign * 0.64], p.trim);
        box(group, [0.011, 0.041, 0.1], [1.115, 2.25, sign * 0.64], p.glass);
        star(group, [-0.1, 1.76, sign * 1.081], 0.25, sign);
        rod(group, [-2.79, 1.05, sign * 0.7], [-2.92, 0.77, sign * 0.7], 0.09, p.steel);
    }
    grille(group, [-1.87, 2.048, 0], [1.08, 0.04, 1.46], p.trim, p.rubber, 15);
    box(group, [0.075, 0.35, 1.49], [-2.7, 1.77, 0], p.trim);
    ellipsoid(group, [0.15, 0.14, 0.14], [2.265, 1.65, 0.43], p.trim);
    rod(group, [2.25, 1.65, 0.43], [2.65, 1.65, 0.43], 0.022, p.steel);
    towingEyes(group, 2.71, 1.02, 0.94, p.steel);
    const turret = new THREE.Group();
    turret.position.x = -0.15;
    group.add(turret);
    group.userData.turret = turret;
    rod(turret, [0, 2, 0], [0, 2.11, 0], 0.86, p.trim, 0.86, 36);
    ellipsoid(turret, [1.07, 0.61, 0.96], [0.01, 2.46, 0], p.armor);
    ellipsoid(turret, [0.61, 0.28, 0.65], [-0.79, 2.45, 0], p.armor);
    rod(turret, [0, 2.92, 0], [0, 2.96, 0], 0.65, p.armor, 0.6, 32);
    ellipsoid(turret, [0.22, 0.35, 0.58], [0.94, 2.51, 0], p.trim);
    box(turret, [0.25, 0.41, 0.81], [1.14, 2.5, 0], p.armor);
    openBarrel(turret, [1.21, 2.51, 0], [3.32, 2.51, 0], 0.092, p.armor, p.rubber, 0.068);
    rod(turret, [1.24, 2.51, 0], [1.6, 2.51, 0], 0.16, p.trim, 0.13, 20);
    hatch(turret, -0.29, 2.97, -0.23, 0.31, p.armor, p.trim);
    box(turret, [0.15, 0.115, 0.11], [0.31, 3.0, -0.14], p.trim);
    box(turret, [0.014, 0.063, 0.09], [0.39, 3.01, -0.14], p.glass);
    rod(turret, [-0.46, 3.06, 0.43], [-0.46, 3.3, 0.43], 0.027, p.steel);
    box(turret, [0.5, 0.12, 0.12], [-0.23, 3.3, 0.43], p.rubber);
    rod(turret, [0.03, 3.3, 0.43], [0.56, 3.3, 0.43], 0.025, p.steel);
    rod(turret, [-0.82, 2.81, 0.41], [-0.82, 3.84, 0.41], 0.01, p.steel, 0.005, 6);
    for (const sign of [-1, 1]) {
        star(turret, [-0.02, 2.48, sign * 0.965], 0.31, sign);
        rod(turret, [-0.26, 2.91, sign * 0.51], [-0.04, 2.91, sign * 0.51], 0.028, p.trim);
    }
    return complete(group);
}

function abrams() {
    const group = new THREE.Group();
    const p = palette(0xb4a17a, { seed: 33 });
    standardRunningGear(group, 7.03, 1.52, 0.64, p, 7, 0.45);
    profile(group, [[-3.57, 0.72], [3.09, 0.72], [3.67, 1.1], [2.18, 1.55], [-3.57, 1.55]], 2.74, [0, 0, 0], p.armor);
    box(group, [6.3, 0.066, 3.51], [-0.17, 1.53, 0], p.trim);
    const fasteners = [];
    for (const sign of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
            box(group, [0.9, 0.64, 0.12], [-2.86 + i * 0.96, 1.11, sign * 1.84], p.armor);
            fasteners.push([-3.2 + i * 0.96, 1.38, sign * 1.905], [-2.54 + i * 0.96, 1.38, sign * 1.905]);
            box(group, [0.13, 0.04, 0.145], [-2.86 + i * 0.96, 1.46, sign * 1.84], p.trim);
        }
        profile(group, [[2.95, 0.74], [3.56, 0.74], [3.46, 1.48], [2.95, 1.48]], 0.13, [0, 0, sign * 1.81], p.trim);
        lamp(group, 3.24, 1.44, sign * 1.48, p);
        towingEyes(group, sign > 0 ? 3.32 : -3.59, 0.97, 0.87, p.steel);
    }
    bolts(group, fasteners, p.trim, 0.024);
    grille(group, [-2.72, 1.594, 0], [1.44, 0.05, 2.15], p.trim, p.rubber, 19);
    box(group, [0.048, 0.51, 2.2], [-3.596, 1.18, 0], p.rubber);
    const rearSlats = Array.from({ length: 18 }, (_, i) => ({ position: [-3.626, 1.18, -1.035 + i * 0.122], scale: [0.04, 0.48, 0.04] }));
    instances(group, new THREE.BoxGeometry(1, 1, 1), p.trim, rearSlats);
    hatch(group, 1.82, 1.58, 0, 0.32, p.armor, p.trim);
    for (const z of [-0.24, 0, 0.24]) box(group, [0.13, 0.075, 0.15], [2.2, 1.7, z], p.glass);
    const turret = new THREE.Group();
    turret.position.x = -0.11;
    group.add(turret);
    group.userData.turret = turret;
    rod(turret, [0, 1.55, 0], [0, 1.68, 0], 1.21, p.trim, 1.21, 40);
    armorLoft(turret, [
        { y: 1.7, points: [[-2.19, -1.14], [-2.19, 1.14], [-0.08, 1.47], [1.83, 0.77], [2.02, 0.42], [2.02, -0.42], [1.83, -0.77], [-0.08, -1.47]] },
        { y: 2.42, points: [[-2.04, -1.03], [-2.04, 1.03], [-0.23, 1.13], [1.18, 0.71], [1.5, 0.36], [1.5, -0.36], [1.18, -0.71], [-0.23, -1.13]] }
    ], p.armor);
    // Placas superiores y laterales del blindaje compuesto, con biseles reales.
    for (const sign of [-1, 1]) {
        const cheek = new THREE.Group();
        if (sign < 0) cheek.scale.z = -1;
        turret.add(cheek);
        armorLoft(cheek, [
            { y: 1.82, points: [[-0.08, 1.49], [1.84, 0.8], [1.86, 0.45], [1.16, 0.64], [-0.23, 1.18]] },
            { y: 2.4, points: [[-0.22, 1.2], [1.23, 0.72], [1.5, 0.4], [1.03, 0.53], [-0.27, 1.08]] }
        ], p.armor);
        rod(turret, [-1.86, 2.44, sign * 0.94], [-1.86, 3.44, sign * 0.94], 0.013, p.steel, 0.006, 6);
        // Cesta trasera abierta, para conservar la silueta característica.
        for (const y of [1.95, 2.36]) rod(turret, [-2.14, y, sign * 1.12], [-2.91, y, sign * 1.12], 0.025, p.steel);
        for (const x of [-2.14, -2.52, -2.91]) rod(turret, [x, 1.95, sign * 1.12], [x, 2.36, sign * 1.12], 0.022, p.steel);
        for (let i = 0; i < 6; i++) {
            rod(turret, [-0.14 - i * 0.115, 2.16, sign * 1.31], [0.01 - i * 0.115, 2.33, sign * 1.42], 0.043, p.trim);
        }
    }
    for (const y of [1.95, 2.36]) rod(turret, [-2.91, y, -1.12], [-2.91, y, 1.12], 0.025, p.steel);
    for (const z of [-0.74, -0.37, 0, 0.37, 0.74]) {
        rod(turret, [-2.91, 1.95, z], [-2.91, 2.36, z], 0.018, p.steel);
        rod(turret, [-2.17, 1.95, z], [-2.91, 1.95, z], 0.018, p.steel);
    }
    box(turret, [0.75, 0.33, 0.58], [-2.51, 2.13, -0.54], p.trim);
    box(turret, [0.46, 0.43, 0.68], [1.68, 2.09, 0], p.trim);
    rod(turret, [1.88, 2.09, 0], [2.58, 2.09, 0], 0.168, p.trim, 0.137, 24);
    openBarrel(turret, [2.56, 2.09, 0], [6.17, 2.09, 0], 0.116, p.armor, p.rubber, 0.09);
    rod(turret, [3.3, 2.09, 0], [3.96, 2.09, 0], 0.167, p.trim, 0.167, 24);
    for (const x of [2.68, 4.08, 5.54]) rod(turret, [x, 2.09, 0], [x + 0.055, 2.09, 0], 0.12, p.trim, 0.12, 24);
    hatch(turret, -0.52, 2.43, -0.58, 0.32, p.armor, p.trim);
    hatch(turret, -0.72, 2.43, 0.59, 0.28, p.armor, p.trim);
    rod(turret, [0.1, 2.43, 0.58], [0.1, 2.62, 0.58], 0.19, p.trim, 0.19, 20);
    box(turret, [0.27, 0.21, 0.28], [0.12, 2.68, 0.58], p.armor);
    box(turret, [0.014, 0.13, 0.2], [0.262, 2.68, 0.58], p.glass);
    box(turret, [0.37, 0.28, 0.36], [0.36, 2.56, -0.5], p.trim);
    box(turret, [0.015, 0.15, 0.27], [0.554, 2.6, -0.5], p.glass);
    rod(turret, [-0.46, 2.56, -0.57], [-0.46, 2.92, -0.57], 0.035, p.steel);
    box(turret, [0.64, 0.13, 0.15], [-0.18, 2.96, -0.57], p.rubber);
    rod(turret, [0.13, 2.96, -0.57], [0.83, 2.96, -0.57], 0.029, p.steel);
    return complete(group);
}

function t90() {
    const group = new THREE.Group();
    const p = palette(0x647258, { camo: [0x35443b, 0x968669], seed: 71 });
    standardRunningGear(group, 6.46, 1.48, 0.62, p, 6, 0.46);
    profile(group, [[-3.24, 0.72], [2.67, 0.72], [3.39, 1.22], [1.95, 1.58], [-3.24, 1.58]], 2.74, [0, 0, 0], p.armor);
    const skirtBolts = [], reactive = [];
    for (const sign of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
            box(group, [0.81, 0.71, 0.09], [-2.74 + i * 0.85, 1.05, sign * 1.81], p.rubber);
            box(group, [0.78, 0.28, 0.135], [-2.74 + i * 0.85, 1.42, sign * 1.81], p.armor);
            skirtBolts.push([-2.95 + i * 0.85, 1.48, sign * 1.885], [-2.52 + i * 0.85, 1.48, sign * 1.885]);
        }
        lamp(group, 2.95, 1.49, sign * 1.22, p);
        rod(group, [-3.27, 1.0, sign * 0.86], [-3.58, 1.0, sign * 0.86], 0.27, p.trim, 0.27, 20);
    }
    bolts(group, skirtBolts, p.trim, 0.025);
    grille(group, [-2.37, 1.613, 0], [1.3, 0.04, 1.82], p.trim, p.rubber, 17);
    // Paneles reactivos del glacis, colocados sobre el plano inclinado.
    for (let row = 0; row < 2; row++) for (let col = 0; col < 6; col++) {
        reactive.push({ position: [2.12 + row * 0.43, 1.64 - row * 0.112, -1.08 + col * 0.43], rotation: [0, 0, -0.25], scale: [0.38, 0.095, 0.38] });
    }
    instances(group, new THREE.BoxGeometry(1, 1, 1), p.trim, reactive);
    hatch(group, 1.32, 1.62, 0, 0.25, p.armor, p.trim);
    box(group, [0.19, 0.08, 0.22], [1.69, 1.69, 0], p.glass);
    towingEyes(group, 3.26, 0.96, 0.92, p.steel);
    // Tronco de recuperación fijado a la parte posterior del casco.
    rod(group, [-3.43, 0.93, -1.15], [-3.43, 0.93, 1.15], 0.15, material(0x715940, { roughness: 0.96 }), 0.15, 12);
    for (const z of [-0.76, 0.76]) box(group, [0.045, 0.35, 0.06], [-3.585, 0.94, z], p.steel);
    const turret = new THREE.Group();
    turret.position.x = 0.04;
    group.add(turret);
    group.userData.turret = turret;
    rod(turret, [0, 1.57, 0], [0, 1.7, 0], 1.14, p.trim, 1.14, 36);
    ellipsoid(turret, [1.42, 0.49, 1.25], [-0.11, 1.99, 0], p.armor);
    box(turret, [0.88, 0.25, 1.25], [-1.31, 2.12, 0], p.trim);
    const turretBlocks = [];
    for (const sign of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
            const a = 0.29 + i * 0.27;
            turretBlocks.push({ position: [Math.cos(a) * 1.19, 2.12, sign * Math.sin(a) * 1.16], rotation: [sign * 0.18, -sign * a, -0.23], scale: [0.32, 0.28, 0.48] });
            turretBlocks.push({ position: [Math.cos(a) * 1.02 - 0.03, 2.38, sign * Math.sin(a) * 0.94], rotation: [sign * 0.22, -sign * a, -0.25], scale: [0.3, 0.1, 0.36] });
        }
        for (let i = 0; i < 6; i++) rod(turret, [-0.72 - (i % 3) * 0.19, 2.26 + Math.floor(i / 3) * 0.13, sign * 1.07], [-0.6 - (i % 3) * 0.19, 2.45 + Math.floor(i / 3) * 0.13, sign * 1.2], 0.043, p.trim);
        box(turret, [0.25, 0.25, 0.29], [1.13, 2.13, sign * 0.56], p.trim);
        const lens = add(turret, new THREE.CircleGeometry(0.085, 16), material(0x6c3530, { roughness: 0.26, metalness: 0.65 }), [1.263, 2.13, sign * 0.56]);
        lens.rotation.y = Math.PI / 2;
        rod(turret, [-1.32, 2.19, sign * 0.8], [-1.32, 2.35, sign * 0.8], 0.022, p.steel);
        rod(turret, [-1.32, 2.35, sign * 0.8], [-0.73, 2.35, sign * 0.8], 0.022, p.steel);
    }
    instances(turret, new THREE.BoxGeometry(1, 1, 1), p.armor, turretBlocks);
    box(turret, [0.37, 0.33, 0.46], [1.26, 2.03, 0], p.trim);
    rod(turret, [1.42, 2.03, 0], [2.01, 2.03, 0], 0.17, p.trim, 0.132, 24);
    openBarrel(turret, [1.97, 2.03, 0], [6.05, 2.03, 0], 0.108, p.armor, p.rubber, 0.083);
    rod(turret, [3.13, 2.03, 0], [3.81, 2.03, 0], 0.164, p.trim, 0.151, 24);
    for (const x of [2.22, 4.18, 5.33]) rod(turret, [x, 2.03, 0], [x + 0.07, 2.03, 0], 0.12, p.trim, 0.12, 24);
    hatch(turret, -0.39, 2.46, -0.54, 0.31, p.armor, p.trim);
    hatch(turret, -0.37, 2.46, 0.55, 0.27, p.armor, p.trim);
    box(turret, [0.28, 0.22, 0.23], [0.21, 2.57, -0.43], p.trim);
    box(turret, [0.015, 0.115, 0.16], [0.359, 2.6, -0.43], p.glass);
    rod(turret, [-0.35, 2.63, 0.55], [-0.35, 2.95, 0.55], 0.036, p.steel);
    box(turret, [0.49, 0.12, 0.12], [-0.13, 2.99, 0.55], p.rubber);
    rod(turret, [0.1, 2.99, 0.55], [0.87, 2.99, 0.55], 0.024, p.steel);
    rod(turret, [-1.04, 2.38, -0.61], [-1.04, 3.53, -0.61], 0.012, p.steel, 0.005, 6);
    return complete(group);
}

export const TANK_BUILDERS = {
    'mark-i': markI,
    'renault-ft': renaultFT,
    'tiger-i': tigerI,
    'm4-sherman': sherman,
    'm1-abrams': abrams,
    't-90': t90
};
