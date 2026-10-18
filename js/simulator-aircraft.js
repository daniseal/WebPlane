import * as THREE from 'three';
import { add, material, paint, box, rod, ellipsoid, fuselage, wheel, propeller, roundel } from './model-primitives.js';

// Modelado original y aproximado. Eje longitudinal +X, vertical +Y, envergadura Z.
// Las superficies aerodinámicas tienen intradós, extradós y bordes cerrados.
const TAU = Math.PI * 2;
const rubber = () => material(0x192024, { roughness: 0.96, metalness: 0 });
const steel = () => material(0x909899, { roughness: 0.37, metalness: 0.8 });

function loft(parent, sections, y, surface, sides = 40) {
    // [posición longitudinal, semiancho, semialtura, desplazamiento vertical]
    const positions = [], uvs = [], indices = [];
    sections.forEach(([x, width, height, offset = 0], ring) => {
        for (let j = 0; j <= sides; j++) {
            const angle = j / sides * TAU;
            positions.push(x, y + offset + Math.cos(angle) * height, Math.sin(angle) * width);
            uvs.push(ring / (sections.length - 1), j / sides);
            if (ring < sections.length - 1 && j < sides) {
                const a = ring * (sides + 1) + j, b = a + 1, c = a + sides + 1;
                indices.push(a, b, c, b, c + 1, c);
            }
        }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(parent, geometry, surface);
}

function seam(parent, points, color = 0x263137, opacity = 0.48) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    parent.add(line);
    return line;
}

function airfoilHeight(t, thickness) {
    return 5 * thickness * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t ** 2 + 0.2843 * t ** 3 - 0.1036 * t ** 4);
}

function foil(parent, stations, sign, position, surface, options = {}) {
    // [semienvergadura, borde de ataque X, borde de salida X, espesor total, diedro Y]
    const sections = [];
    stations.slice(0, -1).forEach((station, index) => {
        const next = stations[index + 1];
        for (let step = 0; step < 5; step++) sections.push(station.map((n, j) => THREE.MathUtils.lerp(n, next[j], step / 5)));
    });
    sections.push(stations[stations.length - 1]);
    const positions = [], uvs = [], indices = [], chordSteps = 28;
    for (const side of [1, -1]) {
        sections.forEach(([span, lead, trail, thickness, rise = 0]) => {
            for (let j = 0; j <= chordSteps; j++) {
                const t = (1 - Math.cos(j / chordSteps * Math.PI)) / 2;
                const camber = (options.camber ?? 0.015) * Math.sin(t * Math.PI);
                positions.push(lead + (trail - lead) * t, rise + side * airfoilHeight(t, thickness) + camber, sign * span);
                uvs.push(t, span / stations[stations.length - 1][0]);
            }
        });
    }
    const row = chordSteps + 1, half = sections.length * row;
    for (let side = 0; side < 2; side++) {
        for (let i = 0; i < sections.length - 1; i++) {
            for (let j = 0; j < chordSteps; j++) {
                const a = side * half + i * row + j, b = a + 1, c = a + row;
                if ((side === 0) === (sign > 0)) indices.push(a, b, c, b, c + 1, c);
                else indices.push(a, c, b, b, c, c + 1);
            }
        }
    }
    for (let j = 0; j < chordSteps; j++) {
        const a = (sections.length - 1) * row + j, b = a + 1;
        if (sign > 0) indices.push(a, a + half, b, b, a + half, b + half);
        else indices.push(a, b, a + half, b, b + half, a + half);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = add(parent, geometry, surface, position);
    if (options.seam !== false) {
        const hinge = sections.filter((_, index) => index > 2).map(([span, lead, trail, thickness, rise = 0]) => {
            const t = options.hinge ?? 0.77;
            return [position[0] + lead + (trail - lead) * t, position[1] + rise + airfoilHeight(t, thickness) + 0.018, position[2] + sign * span];
        });
        seam(parent, hinge);
    }
    return mesh;
}

function fin(parent, stations, position, surface, cant = 0) {
    const group = new THREE.Group();
    group.position.set(...position);
    group.rotation.x = -Math.PI / 2 + cant;
    parent.add(group);
    foil(group, stations, 1, [0, 0, 0], surface, { camber: 0, seam: true, hinge: 0.73 });
    return group;
}

function canopy(parent, x, y, length, width, height, frameMaterial, tint = 0x92b4bb) {
    const glazing = new THREE.MeshPhysicalMaterial({
        color: tint, metalness: 0.05, roughness: 0.12, clearcoat: 1,
        transparent: true, opacity: 0.43, depthWrite: false, side: THREE.DoubleSide
    });
    const shell = add(parent, new THREE.SphereGeometry(1, 36, 18, 0, TAU, 0, Math.PI / 2), glazing, [x, y, 0]);
    shell.scale.set(length, height, width);
    const inside = material(0x172225, { roughness: 0.9, metalness: 0 });
    ellipsoid(parent, [length * 0.95, 0.04, width * 0.94], [x, y, 0], inside);
    box(parent, [length * 0.28, height * 0.48, width * 0.68], [x - length * 0.23, y + height * 0.23, 0], inside);
    box(parent, [length * 0.25, height * 0.18, width * 1.3], [x + length * 0.43, y + height * 0.16, 0], inside);
    for (const fraction of [-0.62, 0.48]) {
        const factor = Math.sqrt(1 - fraction ** 2), points = [];
        for (let i = 0; i <= 20; i++) {
            const a = i / 20 * Math.PI;
            points.push(new THREE.Vector3(x + fraction * length, y + Math.sin(a) * height * factor + 0.008, Math.cos(a) * width * factor));
        }
        add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 20, 0.018, 6, false), frameMaterial);
    }
    const rim = [];
    for (let i = 0; i <= 48; i++) rim.push(new THREE.Vector3(x + Math.cos(i / 48 * TAU) * length, y + 0.006, Math.sin(i / 48 * TAU) * width));
    add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim), 48, 0.018, 6, true), frameMaterial);
}

function ringSeam(parent, x, y, width, height, color = 0x2b3333) {
    const points = [];
    for (let j = 0; j <= 48; j++) points.push([x, y + Math.cos(j / 48 * TAU) * height, Math.sin(j / 48 * TAU) * width]);
    seam(parent, points, color, 0.34);
}

function rivets(parent, points, color = 0xa2a297, radius = 0.012) {
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 5, 4), material(color, { roughness: 0.65, metalness: 0.45 }), points.length);
    const transform = new THREE.Matrix4();
    points.forEach((point, index) => { transform.makeTranslation(...point); mesh.setMatrixAt(index, transform); });
    parent.add(mesh);
}

function cross(parent, x, y, z, radius, top = true) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    if (!top) group.rotation.x = Math.PI / 2;
    parent.add(group);
    const white = material(0xeee8d4, { roughness: 0.9, metalness: 0 }), black = rubber();
    box(group, [radius * 2, 0.004, radius * 0.65], [0, 0, 0], white);
    box(group, [radius * 0.65, 0.004, radius * 2], [0, 0, 0], white);
    box(group, [radius * 1.82, 0.005, radius * 0.39], [0, 0.005, 0], black);
    box(group, [radius * 0.39, 0.005, radius * 1.82], [0, 0.005, 0], black);
}

function openCockpit(parent, x, y, size, leather) {
    ellipsoid(parent, [size * 1.3, 0.055, size], [x, y, 0], rubber());
    const curve = new THREE.EllipseCurve(0, 0, size * 1.3, size, 0, TAU);
    const points = curve.getPoints(40).map(p => new THREE.Vector3(x + p.x, y + 0.014, p.y));
    add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.025, 7, true), leather);
    box(parent, [0.1, 0.12, size * 1.1], [x - size * 0.6, y + 0.055, 0], leather);
}

function tailWheel(parent, x, y, tire, metal, radius = 0.16) {
    rod(parent, [x + 0.11, y, 0], [x, radius, 0], 0.032, metal);
    wheel(parent, x, radius, 0, radius, radius * 0.72, tire, metal);
}

function finishProp(group, prop, speed = 20) {
    group.userData.animate = delta => { prop.rotation.x = (prop.rotation.x + delta * speed) % TAU; };
    return group;
}

function makeCamel() {
    const group = new THREE.Group();
    const olive = paint(0x63644a, { roughness: 0.9, metalness: 0.02, seed: 4, scale: 5 });
    const linen = paint(0xc7b896, { roughness: 0.94, metalness: 0, seed: 8, scale: 6 });
    const wood = paint(0x724422, { roughness: 0.6, metalness: 0, seed: 12, scale: 2 });
    const metal = steel(), tire = rubber(), leather = material(0x563d2e, { roughness: 0.95 });
    loft(group, [[-2.75, 0.015, 0.045], [-2.3, 0.12, 0.17], [-1.7, 0.23, 0.24], [-0.8, 0.34, 0.36], [0.1, 0.45, 0.45], [0.8, 0.47, 0.45], [1.55, 0.47, 0.44], [1.94, 0.41, 0.4]], 1.59, olive);
    fuselage(group, [[1.4, 0.48], [1.81, 0.49], [1.99, 0.45]], [0, 1.59, 0], metal, 0.98);
    rod(group, [1.97, 1.59, 0], [2.01, 1.59, 0], 0.405, tire, 0.405, 32);
    for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU;
        rod(group, [2.025, 1.59 + Math.cos(a) * 0.12, Math.sin(a) * 0.12], [2.025, 1.59 + Math.cos(a) * 0.355, Math.sin(a) * 0.355], 0.047, metal, 0.055, 8);
    }
    const upper = [[0, 0.93, -0.57, 0.15, 0], [2.9, 0.93, -0.57, 0.15, 0.015], [3.91, 0.91, -0.54, 0.12, 0.018], [4.2, 0.72, -0.32, 0.05, 0.018], [4.26, 0.3, 0.14, 0.018, 0.018]];
    for (const sign of [-1, 1]) {
        foil(group, upper, sign, [0.1, 2.6, 0], olive);
        foil(group, upper.map(s => [s[0] * 0.95, s[1], s[2], s[3], s[4] + s[0] * 0.026]), sign, [0, 1.17, 0], linen);
        for (const x of [-0.32, 0.75]) rod(group, [x, 1.28, sign * 2.77], [x + 0.1, 2.56, sign * 2.8], 0.029, wood, 0.023, 10);
        rod(group, [-0.32, 1.29, sign * 2.77], [0.85, 2.57, sign * 2.8], 0.008, metal, 0.008, 5);
        rod(group, [0.75, 1.29, sign * 2.77], [-0.22, 2.57, sign * 2.8], 0.008, metal, 0.008, 5);
        rod(group, [0.08, 1.31, sign * 0.3], [0.15, 2.57, sign * 2.8], 0.007, metal, 0.007, 5);
        rod(group, [0.1, 2.58, sign * 0.65], [0.1, 1.3, sign * 2.8], 0.007, metal, 0.007, 5);
        for (const x of [-0.2, 0.85]) rod(group, [x, 1.98, sign * 0.3], [x + 0.06, 2.55, sign * 0.6], 0.024, metal);
        roundel(group, [0.38, 2.687, sign * 3.08], 0.46);
        roundel(group, [-1.45, 1.62, sign * 0.277], 0.225, sign < 0 ? 'left' : 'right');
        for (const x of [-0.45, 0.81]) rod(group, [x, 1.27, sign * 0.29], [0.43, 0.34, sign * 0.87], 0.034, metal);
        wheel(group, 0.43, 0.34, sign * 0.96, 0.34, 0.15, tire, linen);
        foil(group, [[0, -1.8, -2.72, 0.08, 0], [0.8, -1.87, -2.7, 0.065, 0], [1.2, -2.11, -2.55, 0.025, 0], [1.3, -2.32, -2.37, 0.008, 0]], sign, [0, 1.61, 0], linen);
        rod(group, [0.55, 2.04, sign * 0.13], [1.44, 2.05, sign * 0.13], 0.033, tire);
    }
    rod(group, [0.43, 0.34, -1.02], [0.43, 0.34, 1.02], 0.04, metal);
    fin(group, [[0, -1.83, -2.8, 0.07, 0], [0.45, -2.03, -2.78, 0.05, 0], [0.74, -2.32, -2.64, 0.025, 0], [0.78, -2.44, -2.52, 0.01, 0]], [0, 1.61, 0], linen);
    openCockpit(group, -0.57, 1.97, 0.22, leather);
    rod(group, [-2.22, 1.43, 0], [-2.64, 0.5, 0], 0.035, wood);
    rod(group, [-2.64, 0.5, 0], [-2.85, 0.3, 0], 0.04, wood);
    ringSeam(group, 1.42, 1.59, 0.484, 0.474);
    const prop = propeller(group, 2.1, 1.59, 1.16, wood, 2);
    rod(group, [2.08, 1.59, 0], [2.19, 1.59, 0], 0.105, metal);
    return finishProp(group, prop, 18);
}

function makeFokker() {
    const group = new THREE.Group();
    const red = paint(0x95382e, { roughness: 0.89, metalness: 0.02, seed: 15, scale: 5 });
    const wood = paint(0x80502b, { roughness: 0.68, metalness: 0, seed: 16 });
    const dark = rubber(), metal = steel();
    loft(group, [[-2.76, 0.025, 0.04], [-2.33, 0.14, 0.18], [-1.45, 0.24, 0.28], [-0.42, 0.35, 0.37], [0.6, 0.44, 0.44], [1.48, 0.46, 0.44], [1.84, 0.42, 0.4]], 1.66, red, 32);
    const fabric = paint(0xb8493a, { roughness: 0.92, metalness: 0, seed: 19 });
    const wings = [{ y: 1.13, span: 3.02, shift: -0.16 }, { y: 1.91, span: 3.23, shift: 0 }, { y: 2.8, span: 3.59, shift: 0.13 }];
    for (const sign of [-1, 1]) {
        wings.forEach(({ y, span, shift }, layer) => {
            foil(group, [[0, 0.94, -0.35, 0.12, 0], [span - 0.3, 0.94, -0.35, 0.11, 0.015], [span - 0.05, 0.74, -0.23, 0.06, 0.015], [span, 0.37, 0.2, 0.018, 0.015]], sign, [shift, y, 0], layer === 1 ? fabric : red);
        });
        rod(group, [0.23, 1.18, sign * 2.31], [0.51, 2.79, sign * 2.31], 0.049, red, 0.04, 10);
        for (const x of [-0.15, 0.83]) rod(group, [x, 2.02, sign * 0.26], [x + 0.12, 2.78, sign * 0.65], 0.023, dark);
        rod(group, [0.5, 2.07, sign * 0.27], [0.57, 2.79, sign * 0.65], 0.007, metal, 0.007, 5);
        for (const x of [-0.25, 0.88]) rod(group, [x, 1.31, sign * 0.32], [0.44, 0.35, sign * 0.83], 0.032, dark);
        wheel(group, 0.44, 0.35, sign * 0.92, 0.35, 0.14, dark, red);
        cross(group, 0.38, 2.869, sign * 2.86, 0.36);
        cross(group, -1.53, 1.69, sign * 0.25, 0.2, false);
        foil(group, [[0, -1.86, -2.71, 0.06, 0], [0.7, -1.98, -2.69, 0.05, 0], [1.14, -2.41, -2.52, 0.015, 0]], sign, [0, 1.65, 0], red);
        rod(group, [0.5, 2.12, sign * 0.12], [1.32, 2.12, sign * 0.12], 0.037, dark);
    }
    foil(group, [[0, 0.71, 0.12, 0.09, 0], [0.87, 0.71, 0.12, 0.09, 0]], 1, [0, 0.35, 0], red, { seam: false });
    foil(group, [[0, 0.71, 0.12, 0.09, 0], [0.87, 0.71, 0.12, 0.09, 0]], -1, [0, 0.35, 0], red, { seam: false });
    fin(group, [[0, -2.09, -2.8, 0.06, 0], [0.53, -2.19, -2.79, 0.045, 0], [0.87, -2.42, -2.64, 0.02, 0], [0.91, -2.53, -2.57, 0.008, 0]], [0, 1.66, 0], material(0xe0dac7, { roughness: 0.94 }));
    fuselage(group, [[1.48, 0.47], [1.86, 0.47], [1.97, 0.43]], [0, 1.66, 0], red);
    rod(group, [1.97, 1.66, 0], [1.995, 1.66, 0], 0.38, dark, 0.38, 24);
    for (let i = 0; i < 9; i++) {
        const a = i * TAU / 9;
        rod(group, [2.01, 1.66 + Math.cos(a) * 0.12, Math.sin(a) * 0.12], [2.01, 1.66 + Math.cos(a) * 0.34, Math.sin(a) * 0.34], 0.042, metal, 0.054, 8);
    }
    openCockpit(group, -0.42, 2.025, 0.23, wood);
    rod(group, [-2.22, 1.46, 0], [-2.75, 0.25, 0], 0.036, wood);
    const prop = propeller(group, 2.07, 1.66, 1.15, wood, 2);
    rod(group, [2.06, 1.66, 0], [2.17, 1.66, 0], 0.12, metal);
    return finishProp(group, prop, 18);
}

function mainGear(parent, x, y, spread, tire, metal, fairing) {
    for (const sign of [-1, 1]) {
        rod(parent, [x - 0.17, y, sign * spread * 0.78], [x, 0.35, sign * spread], 0.052, metal);
        rod(parent, [x - 0.18, y * 0.78, sign * spread * 0.81], [x - 0.36, y, sign * spread * 1.04], 0.026, metal);
        const cover = box(parent, [0.28, y * 0.48, 0.035], [x + 0.008, y * 0.57, sign * (spread + 0.06)], fairing);
        cover.rotation.z = -0.08;
        wheel(parent, x, 0.35, sign * (spread + 0.16), 0.35, 0.19, tire, metal);
    }
}

function makeSpitfire() {
    const group = new THREE.Group();
    const camouflage = paint(0x59634e, { camo: [0x76694e, 0x485248], seed: 43, roughness: 0.79, metalness: 0.13 });
    const underside = paint(0xabb7ac, { seed: 2, roughness: 0.78, metalness: 0.12 });
    const tire = rubber(), metal = steel();
    loft(group, [[-4.32, 0.01, 0.04], [-3.85, 0.13, 0.21], [-3.2, 0.22, 0.29], [-2.3, 0.29, 0.35], [-1.25, 0.39, 0.43], [-0.35, 0.44, 0.47], [0.7, 0.47, 0.48], [1.9, 0.44, 0.44], [2.8, 0.34, 0.35], [3.36, 0.23, 0.27]], 1.78, camouflage);
    const elliptic = [];
    for (let i = 0; i <= 14; i++) {
        const fraction = Math.sin(i / 14 * Math.PI / 2), span = 5.61 * fraction;
        const chord = 2.36 * Math.sqrt(Math.max(0.001, 1 - fraction ** 2));
        const center = 0.08 - span * 0.065;
        elliptic.push([span, center + chord * 0.52, center - chord * 0.48, Math.max(0.017, 0.24 * (1 - fraction * 0.81)), span * 0.047]);
    }
    for (const sign of [-1, 1]) {
        foil(group, elliptic, sign, [0, 1.46, 0], camouflage, { camber: 0.018 });
        roundel(group, [-0.13, 1.75, sign * 3.68], 0.48);
        roundel(group, [-2.14, 1.8, sign * 0.313], 0.29, sign < 0 ? 'left' : 'right');
        foil(group, [[0, -2.65, -4.02, 0.1, 0], [0.85, -2.81, -3.99, 0.08, 0.015], [1.48, -3.12, -3.85, 0.05, 0.018], [1.83, -3.47, -3.67, 0.015, 0.02]], sign, [0, 1.83, 0], camouflage);
        const radiator = loft(group, [[-0.8, 0.16, 0.055], [-0.54, 0.27, 0.19], [0.05, 0.25, 0.17], [0.21, 0.19, 0.11]], 1.24, underside, 20);
        radiator.position.z = sign * 1.7;
        box(group, [0.025, 0.16, 0.34], [0.22, 1.23, sign * 1.7], tire);
        rod(group, [0.68, 1.59, sign * 2.0], [1.7, 1.59, sign * 2.0], 0.031, metal, 0.027);
        rod(group, [1.1, 1.59, sign * 2.0], [1.37, 1.59, sign * 2.0], 0.057, camouflage);
        for (let i = 0; i < 6; i++) rod(group, [1.3 + i * 0.255, 1.92, sign * 0.422], [1.2 + i * 0.255, 1.88, sign * 0.53], 0.041, material(0x574d42, { roughness: 0.71, metalness: 0.65 }), 0.035, 9);
    }
    fin(group, [[0, -2.8, -4.31, 0.115, 0], [0.65, -3.14, -4.25, 0.08, 0], [1.19, -3.56, -4.03, 0.035, 0], [1.27, -3.76, -3.87, 0.012, 0]], [0, 1.78, 0], camouflage);
    canopy(group, -0.79, 2.145, 0.76, 0.355, 0.48, camouflage);
    mainGear(group, 0.53, 1.48, 1.11, tire, metal, underside);
    tailWheel(group, -3.24, 1.58, tire, metal);
    for (const [x, w, h] of [[-2.5, 0.277, 0.338], [0.8, 0.473, 0.481], [2.78, 0.347, 0.357]]) ringSeam(group, x, 1.78, w, h);
    rod(group, [-1.8, 2.15, 0], [-1.83, 2.59, 0], 0.018, camouflage);
    seam(group, [[-1.83, 2.59, 0], [-3.77, 2.98, 0]], 0x889187, 0.5);
    const points = [];
    for (const sign of [-1, 1]) for (let i = 0; i < 24; i++) points.push([0.95 + i * 0.075, 1.93, sign * (0.44 - i * 0.0045)]);
    rivets(group, points, 0x777c68, 0.009);
    const prop = propeller(group, 3.39, 1.78, 1.43, tire, 3);
    fuselage(group, [[3.4, 0.275], [3.6, 0.26], [3.85, 0.19], [4.13, 0]], [0, 1.78, 0], underside);
    return finishProp(group, prop);
}

function makeBf109() {
    const group = new THREE.Group();
    const camouflage = paint(0x778075, { camo: [0x424d49, 0x687162], roughness: 0.8, metalness: 0.1, seed: 69 });
    const underside = paint(0xa4b8b7, { roughness: 0.82, metalness: 0.08, seed: 70 });
    const yellow = paint(0xc7a43e, { roughness: 0.75, metalness: 0.12, seed: 71 });
    const tire = rubber(), metal = steel();
    loft(group, [[-4.3, 0.018, 0.04], [-3.65, 0.125, 0.23], [-2.85, 0.23, 0.31], [-1.7, 0.31, 0.39], [-0.7, 0.375, 0.44], [0.45, 0.39, 0.47], [1.6, 0.39, 0.47], [2.75, 0.32, 0.37], [3.2, 0.25, 0.3]], 1.8, camouflage);
    fuselage(group, [[2.75, 0.32], [3.19, 0.275], [3.39, 0.225]], [0, 1.8, 0], yellow, 1.12);
    for (const sign of [-1, 1]) {
        foil(group, [[0, 1.0, -1.29, 0.235, 0], [1.1, 0.96, -1.2, 0.22, 0.035], [3.95, 0.24, -0.91, 0.12, 0.19], [4.74, -0.04, -0.82, 0.06, 0.23], [4.96, -0.33, -0.57, 0.025, 0.24]], sign, [0, 1.43, 0], camouflage);
        cross(group, -0.1, 1.692, sign * 3.45, 0.38);
        cross(group, -1.94, 1.8, sign * 0.299, 0.225, false);
        foil(group, [[0, -2.87, -4.13, 0.09, 0], [0.91, -3.02, -4.05, 0.075, 0], [1.39, -3.39, -3.86, 0.038, 0], [1.5, -3.6, -3.74, 0.013, 0]], sign, [0, 1.97, 0], camouflage);
        const radiator = loft(group, [[-0.84, 0.16, 0.04], [-0.51, 0.25, 0.17], [0.1, 0.25, 0.17], [0.2, 0.21, 0.12]], 1.25, underside, 18);
        radiator.position.z = sign * 1.65;
        box(group, [0.027, 0.16, 0.33], [0.217, 1.22, sign * 1.65], tire);
        for (let i = 0; i < 6; i++) rod(group, [1.2 + i * 0.27, 1.78, sign * 0.395], [1.1 + i * 0.27, 1.75, sign * 0.49], 0.04, material(0x645043, { metalness: 0.6, roughness: 0.8 }), 0.034, 8);
        rod(group, [2.03, 2.195, sign * 0.12], [2.96, 2.175, sign * 0.12], 0.029, tire);
    }
    // Toma del compresor, asimétrica en el lateral izquierdo del motor.
    rod(group, [1.46, 1.82, -0.45], [1.96, 1.82, -0.53], 0.107, camouflage, 0.13, 14);
    rod(group, [1.969, 1.82, -0.53], [1.98, 1.82, -0.53], 0.097, tire, 0.097, 14);
    fin(group, [[0, -2.96, -4.33, 0.09, 0], [0.53, -3.19, -4.25, 0.07, 0], [1.05, -3.6, -4.1, 0.036, 0], [1.15, -3.77, -3.98, 0.013, 0]], [0, 1.87, 0], camouflage);
    canopy(group, -0.77, 2.135, 0.7, 0.324, 0.46, camouflage);
    mainGear(group, 0.49, 1.48, 0.9, tire, metal, underside);
    tailWheel(group, -3.23, 1.6, tire, metal);
    for (const [x, w, h] of [[-2.84, 0.234, 0.314], [-1.7, 0.314, 0.394], [0.46, 0.394, 0.474]]) ringSeam(group, x, 1.8, w, h);
    rod(group, [-1.67, 2.17, 0], [-1.78, 2.62, 0], 0.017, camouflage);
    seam(group, [[-1.78, 2.62, 0], [-3.83, 2.95, 0]], 0x9c9e90, 0.45);
    const prop = propeller(group, 3.36, 1.8, 1.41, tire, 3);
    fuselage(group, [[3.36, 0.25], [3.64, 0.23], [3.97, 0.1], [4.11, 0]], [0, 1.8, 0], yellow);
    return finishProp(group, prop);
}

function nozzle(parent, x, y, z, radius, length, metal, dark) {
    const geometry = new THREE.CylinderGeometry(radius, radius * 0.84, length, 32, 1, true);
    geometry.rotateZ(-Math.PI / 2);
    const shell = add(parent, geometry, metal, [x, y, z]);
    shell.material = metal.clone();
    shell.material.side = THREE.DoubleSide;
    const inner = new THREE.CylinderGeometry(radius * 0.82, radius * 0.66, length * 0.86, 32, 1, true);
    inner.rotateZ(-Math.PI / 2);
    add(parent, inner, dark, [x - 0.05, y, z]);
    rod(parent, [x + length * 0.2, y, z], [x + length * 0.22, y, z], radius * 0.68, dark, radius * 0.68, 24);
    const points = [];
    for (let i = 0; i < 24; i++) {
        const angle = i / 24 * TAU;
        points.push([x + length * 0.47, y + Math.cos(angle) * radius * 1.004, z + Math.sin(angle) * radius * 1.004]);
        points.push([x - length * 0.47, y + Math.cos(angle) * radius * 0.849, z + Math.sin(angle) * radius * 0.849]);
    }
    const seams = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))), new THREE.LineBasicMaterial({ color: 0x25272a }));
    parent.add(seams);
    const ring = new THREE.TorusGeometry(radius * 0.845, 0.026, 8, 36);
    ring.rotateY(Math.PI / 2);
    add(parent, ring, metal, [x - length * 0.5, y, z]);
}

function inlet(parent, x, y, z, width, height, lip, dark, slant = 0) {
    // Toma hueca con conducto visible y fondo retrasado, no un disco sobre el fuselaje.
    const points = [[-width * 0.5, -height * 0.41], [width * 0.35, -height * 0.5], [width * 0.5, height * 0.27], [width * 0.16, height * 0.5], [-width * 0.5, height * 0.36]];
    const vertices = [], indices = [];
    for (const depth of [0, -0.65]) for (const [a, b] of points) vertices.push(x + depth + a * slant, y + b * (depth ? 0.77 : 1), z + a * (depth ? 0.8 : 1));
    for (let i = 0; i < points.length; i++) {
        const a = i, b = (i + 1) % points.length, c = a + points.length, d = b + points.length;
        indices.push(a, c, b, b, c, d);
        rod(parent, [vertices[a * 3], vertices[a * 3 + 1], vertices[a * 3 + 2]], [vertices[b * 3], vertices[b * 3 + 1], vertices[b * 3 + 2]], 0.031, lip, 0.031, 6);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const inner = dark.clone(); inner.side = THREE.DoubleSide;
    add(parent, geometry, inner);
    box(parent, [0.025, height * 0.72, width * 0.78], [x - 0.65, y, z], dark);
}

function jetGear(parent, front, rear, rearSpread, y, surface, tire, metal) {
    rod(parent, [front + 0.12, y, 0], [front, 0.29, 0], 0.056, metal);
    rod(parent, [front + 0.12, y, 0], [front - 0.4, y * 0.53, 0], 0.033, metal);
    wheel(parent, front, 0.29, 0, 0.29, 0.2, tire, metal);
    box(parent, [0.46, y * 0.49, 0.028], [front + 0.07, y * 0.62, 0.21], surface);
    for (const sign of [-1, 1]) {
        rod(parent, [rear + 0.3, y, sign * rearSpread * 0.67], [rear, 0.41, sign * rearSpread], 0.071, metal);
        rod(parent, [rear - 0.3, y, sign * rearSpread * 0.54], [rear + 0.06, 0.62, sign * rearSpread * 0.9], 0.033, metal);
        wheel(parent, rear, 0.4, sign * (rearSpread + 0.08), 0.4, 0.24, tire, metal);
        box(parent, [0.69, y * 0.54, 0.036], [rear + 0.08, y * 0.62, sign * (rearSpread + 0.24)], surface);
    }
}

function jetPanel(parent, points) { seam(parent, points, 0x3c4951, 0.7); }

function makeF35() {
    const group = new THREE.Group();
    const gray = paint(0x737f84, { seed: 95, roughness: 0.71, metalness: 0.17, scale: 3 });
    const panels = paint(0x5f6a72, { seed: 96, roughness: 0.76, metalness: 0.12 });
    const dark = rubber(), metal = steel(), hotMetal = material(0x63636b, { metalness: 0.82, roughness: 0.45 });
    loft(group, [[-6.9, 0.65, 0.62], [-6.1, 0.78, 0.71], [-4.7, 0.99, 0.72], [-2.9, 1.08, 0.71], [-0.8, 1.02, 0.67], [1.05, 0.82, 0.64], [2.7, 0.64, 0.57], [4.1, 0.54, 0.43], [5.5, 0.4, 0.3, -0.025], [6.7, 0.2, 0.17, -0.045], [7.76, 0.012, 0.012, -0.07]], 1.85, gray);
    for (const sign of [-1, 1]) {
        foil(group, [[0.6, 2.23, -3.7, 0.38, 0], [1.7, 1.15, -3.25, 0.3, 0], [4.97, -1.28, -3.14, 0.095, 0.07], [5.35, -1.59, -3.05, 0.044, 0.075]], sign, [0, 1.84, 0], gray, { camber: 0 });
        foil(group, [[0.65, -3.66, -6.54, 0.13, 0], [2.9, -5.0, -7.02, 0.068, 0.035], [3.65, -5.5, -6.77, 0.025, 0.045]], sign, [0, 1.94, 0], panels, { camber: 0 });
        fin(group, [[0, -3.55, -6.76, 0.18, 0], [1.7, -4.65, -6.11, 0.08, 0], [2.36, -5.08, -5.75, 0.027, 0]], [0, 2.04, sign * 0.96], panels, -sign * 0.37);
        const nacelle = loft(group, [[-3.9, 0.19, 0.24], [-2.4, 0.5, 0.49], [0.1, 0.59, 0.46], [1.78, 0.47, 0.41], [2.18, 0.32, 0.34]], 1.58, gray, 24);
        nacelle.position.z = sign * 0.92;
        inlet(group, 2.26, 1.57, sign * 1.05, 0.62, 0.68, gray, dark, -sign * 0.15);
        jetPanel(group, [[1.25, 1.875, sign * 1.65], [0.97, 1.96, sign * 1.85], [-1.44, 1.986, sign * 4.78], [-2.8, 1.935, sign * 4.78]]);
        jetPanel(group, [[0.7, 1.16, sign * 0.39], [-0.8, 1.15, sign * 0.46], [-2.7, 1.14, sign * 0.5]]);
        const light = material(sign > 0 ? 0x41636a : 0x813c3b, { roughness: 0.35, emissive: sign > 0 ? 0x0a1818 : 0x260a0a });
        ellipsoid(group, [0.085, 0.026, 0.03], [-1.75, 1.956, sign * 5.34], light);
    }
    canopy(group, 2.78, 2.305, 1.56, 0.49, 0.59, panels, 0xb1a476);
    ringSeam(group, 4.95, 1.84, 0.458, 0.347, 0x56626a);
    jetGear(group, 3.93, -2.04, 1.22, 1.35, gray, dark, metal);
    nozzle(group, -7.22, 1.85, 0, 0.68, 0.8, hotMetal, dark);
    // Ventana inferior del sistema electroóptico, simplificada.
    ellipsoid(group, [0.32, 0.14, 0.19], [4.7, 1.41, 0], material(0x31434b, { roughness: 0.18, metalness: 0.4 }));
    return group;
}

function makeSu57() {
    const group = new THREE.Group();
    const upper = paint(0x819299, { camo: [0x4c626f, 0xa7b6b8], seed: 122, roughness: 0.7, metalness: 0.18, scale: 2 });
    const underside = paint(0x9babad, { seed: 124, roughness: 0.74, metalness: 0.15 });
    const panel = paint(0x586c75, { roughness: 0.71, metalness: 0.2, seed: 125 });
    const dark = rubber(), metal = steel(), hotMetal = material(0x77777b, { roughness: 0.45, metalness: 0.87 });
    loft(group, [[-8.2, 0.17, 0.18], [-6.3, 0.68, 0.29], [-4.3, 1.48, 0.44], [-1.9, 1.77, 0.48], [0.5, 1.55, 0.5], [2.15, 1.2, 0.51], [3.7, 0.75, 0.58], [5.2, 0.61, 0.51], [6.75, 0.5, 0.35], [8.2, 0.32, 0.22], [9.95, 0.008, 0.008, -0.12]], 2.08, upper);
    for (const sign of [-1, 1]) {
        foil(group, [[0.7, 3.7, -4.58, 0.42, 0], [2.15, 2.05, -4.63, 0.29, 0], [5.91, -1.65, -4.23, 0.105, 0.11], [7.05, -2.76, -4.07, 0.036, 0.15]], sign, [0, 2.1, 0], upper, { camber: 0 });
        // Extensiones de raíz adelantadas y estabilizadores con flecha pronunciada.
        foil(group, [[0.65, 4.4, 0.5, 0.15, 0], [1.92, 2.88, 0.35, 0.07, 0.02], [2.3, 2.28, 0.34, 0.025, 0.025]], sign, [0, 2.11, 0], upper, { camber: 0, hinge: 0.57 });
        foil(group, [[1.16, -4.92, -8.31, 0.15, 0], [3.8, -6.23, -8.8, 0.075, 0.02], [4.86, -7.12, -8.39, 0.025, 0.06]], sign, [0, 1.94, 0], upper, { camber: 0 });
        const nacelle = loft(group, [[-8.05, 0.61, 0.58], [-6.94, 0.7, 0.63], [-5.0, 0.77, 0.65], [-2.8, 0.84, 0.65], [-0.58, 0.75, 0.59], [1.69, 0.51, 0.44]], 1.75, underside, 32);
        nacelle.position.z = sign * 1.33;
        inlet(group, 1.75, 1.69, sign * 1.36, 0.94, 0.76, upper, dark, -sign * 0.11);
        nozzle(group, -8.46, 1.75, sign * 1.33, 0.62, 0.93, hotMetal, dark);
        fin(group, [[0, -4.62, -7.92, 0.16, 0], [1.63, -5.76, -7.15, 0.075, 0], [2.32, -6.23, -6.84, 0.025, 0]], [0, 2.27, sign * 1.97], upper, -sign * 0.39);
        jetPanel(group, [[1.1, 2.17, sign * 2.93], [-2.22, 2.28, sign * 6.33], [-3.85, 2.273, sign * 6.45]]);
        jetPanel(group, [[-0.7, 2.25, sign * 2.7], [-2.2, 2.27, sign * 4.2], [-3.77, 2.28, sign * 4.2]]);
        rod(group, [-2.8, 2.24, sign * 6.97], [-4.65, 2.24, sign * 6.97], 0.054, panel, 0.043, 10);
    }
    canopy(group, 4.09, 2.515, 1.5, 0.475, 0.66, panel, 0x8aa9ae);
    jetGear(group, 4.79, -1.74, 1.55, 1.22, underside, dark, metal);
    ringSeam(group, 7.24, 2.046, 0.446, 0.31, 0x58717c);
    ellipsoid(group, [0.21, 0.18, 0.18], [5.58, 2.66, -0.37], material(0x36535e, { roughness: 0.15, metalness: 0.45 }));
    return group;
}

export const AIRCRAFT_BUILDERS = {
    'sopwith-camel': makeCamel,
    'fokker-dr1': makeFokker,
    'spitfire': makeSpitfire,
    'bf-109': makeBf109,
    'f-35': makeF35,
    'su-57': makeSu57
};
