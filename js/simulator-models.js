import * as THREE from 'three';

// Modelos didácticos creados con geometría local. Las dimensiones son aproximadas.
// Convención: frente +X, altura +Y; cada modelo descansa sobre el plano Y = 0.
export const VEHICLES = [
    {
        id: 'mark-i', name: 'Mark I', era: 'ww1', eraLabel: 'Primera Guerra Mundial',
        country: 'Reino Unido', type: 'tank',
        description: 'Tanque británico de orugas romboidales, empleado por primera vez en combate en 1916.',
        photo: 'img/historicos/british-heavy-tanks-of-the-first-world-war.jpg',
        dimensions: { length: 9.9, width: 4.2, height: 2.5 }
    },
    {
        id: 'sopwith-camel', name: 'Sopwith Camel', era: 'ww1', eraLabel: 'Primera Guerra Mundial',
        country: 'Reino Unido', type: 'aircraft',
        description: 'Caza biplano británico conocido por su maniobrabilidad y su exigente pilotaje.',
        photo: 'img/historicos/sopwith-camel.jpg',
        dimensions: { length: 5.7, width: 8.5, height: 2.6 }
    },
    {
        id: 'tiger-i', name: 'Tiger I', era: 'ww2', eraLabel: 'Segunda Guerra Mundial',
        country: 'Alemania', type: 'tank',
        description: 'Tanque pesado alemán destacado por su blindaje y su cañón de 88 mm.',
        photo: 'img/historicos/tiger-i.jpg',
        dimensions: { length: 8.5, width: 3.7, height: 3.0 }
    },
    {
        id: 'spitfire', name: 'Supermarine Spitfire', era: 'ww2', eraLabel: 'Segunda Guerra Mundial',
        country: 'Reino Unido', type: 'aircraft',
        description: 'Caza británico de ala elíptica, clave en la defensa aérea del Reino Unido.',
        photo: 'img/historicos/supermarine-spitfire.jpg',
        dimensions: { length: 9.1, width: 11.2, height: 3.5 }
    },
    {
        id: 'm1-abrams', name: 'M1 Abrams', era: 'modern', eraLabel: 'Vehículos modernos',
        country: 'Estados Unidos', type: 'tank',
        description: 'Tanque de combate estadounidense con torreta de perfil angular y motor de turbina.',
        photo: 'img/m1.jpg',
        dimensions: { length: 9.8, width: 3.7, height: 2.4 }
    },
    {
        id: 'f-35', name: 'F-35 Lightning II', era: 'modern', eraLabel: 'Vehículos modernos',
        country: 'Estados Unidos', type: 'aircraft',
        description: 'Caza polivalente de quinta generación, diseñado con baja observabilidad y sensores integrados.',
        photo: 'img/F35.jpg',
        dimensions: { length: 15.7, width: 10.7, height: 4.4 }
    }
];

function material(color, options = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.25, ...options });
}

function add(parent, geometry, surface, position = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

function box(parent, size, position, surface) {
    return add(parent, new THREE.BoxGeometry(...size), surface, position);
}

function ellipsoid(parent, size, position, surface) {
    const mesh = add(parent, new THREE.SphereGeometry(1, 24, 14), surface, position);
    mesh.scale.set(...size);
    return mesh;
}

function rod(parent, from, to, radius, surface, endRadius = radius, sides = 12) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const mesh = add(parent, new THREE.CylinderGeometry(endRadius, radius, direction.length(), sides), surface);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
}

function outline(points) {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    points.slice(1).forEach(point => shape.lineTo(...point));
    shape.closePath();
    return shape;
}

function profile(parent, points, width, position, surface, holes = []) {
    const shape = outline(points);
    holes.forEach(points => shape.holes.push(outline(points)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.translate(0, 0, -width / 2);
    return add(parent, geometry, surface, position);
}

function wing(parent, points, thickness, position, surface) {
    const mesh = profile(parent, points.map(([x, z]) => [x, -z]), thickness, position, surface);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}

function fuselage(parent, rings, position, surface, verticalScale = 1) {
    const geometry = new THREE.LatheGeometry(rings.map(([x, radius]) => new THREE.Vector2(radius, x)), 28);
    geometry.rotateZ(-Math.PI / 2);
    geometry.scale(1, verticalScale, 1);
    return add(parent, geometry, surface, position);
}

function wheel(parent, x, y, z, radius, width, tire, hub) {
    rod(parent, [x, y, z - width / 2], [x, y, z + width / 2], radius, tire, radius, 20);
    for (const sign of [-1, 1]) {
        rod(parent, [x, y, z + sign * width / 2], [x, y, z + sign * (width / 2 + 0.025)], radius * 0.68, hub, radius * 0.68, 16);
    }
}

function treads(parent, points, z, width, surface, spacing = 0.23) {
    for (let i = 0; i < points.length; i++) {
        const start = new THREE.Vector2(...points[i]);
        const end = new THREE.Vector2(...points[(i + 1) % points.length]);
        const delta = end.clone().sub(start);
        const count = Math.ceil(delta.length() / spacing);
        for (let j = 0; j < count; j++) {
            const point = start.clone().lerp(end, (j + 0.5) / count);
            const tread = box(parent, [delta.length() / count * 0.78, 0.075, width + 0.04], [point.x, point.y, z], surface);
            tread.rotation.z = Math.atan2(delta.y, delta.x);
        }
    }
}

function conventionalTracks(parent, length, z, width, palette, wheelCount = 7) {
    const end = length / 2;
    const perimeter = [[-end + 0.45, 0.12], [end - 0.45, 0.12], [end, 0.58], [end - 0.22, 1.2], [-end + 0.18, 1.2], [-end, 0.58]];
    const inner = [[-end + 0.51, 0.33], [end - 0.52, 0.33], [end - 0.22, 0.63], [end - 0.39, 0.97], [-end + 0.38, 0.97], [-end + 0.24, 0.61]];
    for (const sign of [-1, 1]) {
        profile(parent, perimeter, width, [0, 0, sign * z], palette.track, [inner]);
        for (let i = 0; i < wheelCount; i++) {
            wheel(parent, -end + 0.65 + i * (length - 1.3) / (wheelCount - 1), 0.62, sign * z, 0.43, width * 0.86, palette.rubber, palette.armor);
        }
        treads(parent, perimeter, sign * z, width, palette.steel);
    }
}

function roundel(parent, position, radius, facing = 'top') {
    const colors = [0x203e6b, 0xe8e9df, 0xab3438];
    const ratios = [1, 0.67, 0.35];
    const group = new THREE.Group();
    group.position.set(...position);
    if (facing === 'top') group.rotation.x = -Math.PI / 2;
    if (facing === 'left') group.rotation.y = Math.PI;
    parent.add(group);
    colors.forEach((color, index) => add(group, new THREE.CircleGeometry(radius * ratios[index], 24), material(color, { metalness: 0, roughness: 1 }), [0, 0, index * 0.003]));
}

function propeller(parent, x, y, radius, surface, bladeCount = 2) {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    parent.add(group);
    for (let i = 0; i < bladeCount; i++) {
        const blade = ellipsoid(group, [0.055, radius * 0.52, radius * 0.09], [0, radius * 0.48, 0], surface);
        const angle = i * Math.PI * 2 / bladeCount;
        blade.position.set(0, Math.cos(angle) * radius * 0.48, Math.sin(angle) * radius * 0.48);
        blade.rotation.x = angle;
    }
    return group;
}

function makeMarkI() {
    const group = new THREE.Group();
    const olive = material(0x76715b);
    const darkOlive = material(0x555846);
    const track = material(0x30312e, { metalness: 0.55 });
    const steel = material(0x5b5b50, { metalness: 0.62 });
    const black = material(0x1f2426);
    profile(group, [[-3.2, 0.9], [2.8, 0.9], [3.4, 1.85], [1.5, 2.04], [-3.25, 1.85]], 2.1, [0, 0, 0], olive);
    const outside = [[-4.0, 0.87], [-3.12, 0.12], [2.5, 0.12], [4.0, 1.78], [3.5, 2.38], [-2.64, 2.38]];
    const inside = [[-3.45, 0.93], [-2.95, 0.43], [2.29, 0.43], [3.57, 1.8], [3.26, 2.08], [-2.49, 2.08]];
    for (const sign of [-1, 1]) {
        profile(group, outside, 0.55, [0, 0, sign * 1.3], track, [inside]);
        profile(group, inside, 0.4, [0, 0, sign * 1.3], olive);
        treads(group, outside, sign * 1.3, 0.57, steel, 0.24);
        box(group, [2.2, 0.8, 0.72], [0, 1.36, sign * 1.81], darkOlive);
        ellipsoid(group, [0.53, 0.44, 0.3], [0.6, 1.47, sign * 2.0], olive);
        rod(group, [0.62, 1.47, sign * 2.05], [1.65, 1.49, sign * 2.32], 0.08, steel, 0.065);
        for (let i = 0; i < 17; i++) {
            ellipsoid(group, [0.037, 0.037, 0.025], [-2.8 + i * 0.35, 1.98, sign * 1.515], steel);
        }
        // Ruedas traseras de dirección, características del Mark I.
        rod(group, [-2.8, 0.95, sign * 0.55], [-5.05, 0.5, sign * 0.75], 0.065, darkOlive);
        wheel(group, -5.05, 0.45, sign * 0.86, 0.45, 0.17, steel, darkOlive);
    }
    box(group, [0.85, 0.36, 1.34], [1.95, 2.14, 0], darkOlive);
    box(group, [0.025, 0.065, 0.38], [2.39, 2.19, -0.33], black);
    box(group, [0.025, 0.065, 0.38], [2.39, 2.19, 0.33], black);
    for (let i = 0; i < 7; i++) box(group, [0.06, 0.04, 0.65], [-1.65 + i * 0.18, 2.03, 0], black);
    return group;
}

function makeTiger() {
    const group = new THREE.Group();
    const armor = material(0xa99a6c);
    const darkArmor = material(0x817956);
    const steel = material(0x5a5b52, { metalness: 0.58 });
    const track = material(0x373b3b, { metalness: 0.55 });
    const rubber = material(0x272c2d, { metalness: 0.05 });
    conventionalTracks(group, 6.0, 1.42, 0.66, { armor, track, steel, rubber }, 8);
    box(group, [5.8, 0.87, 2.78], [0, 1.25, 0], armor);
    box(group, [5.95, 0.15, 3.45], [0, 1.64, 0], darkArmor);
    box(group, [1.1, 0.3, 2.7], [2.1, 1.81, 0], armor);
    rod(group, [0, 1.7, 0], [0, 1.85, 0], 1.15, darkArmor, 1.15, 32);
    const turret = new THREE.Group();
    turret.position.set(0.1, 0, 0);
    group.add(turret);
    rod(turret, [0, 1.84, 0], [0, 2.63, 0], 1.2, armor, 1.08, 16);
    box(turret, [0.4, 0.67, 1.67], [1.05, 2.2, 0], armor);
    box(turret, [0.38, 0.55, 1.08], [-1.22, 2.17, 0], darkArmor);
    rod(turret, [1.1, 2.2, 0], [1.65, 2.2, 0], 0.24, darkArmor, 0.19);
    rod(turret, [1.65, 2.2, 0], [5.03, 2.2, 0], 0.105, armor, 0.076, 16);
    rod(turret, [4.97, 2.2, 0], [5.3, 2.2, 0], 0.145, steel, 0.145);
    for (const sign of [-1, 1]) box(turret, [0.18, 0.075, 0.01], [5.12, 2.2, sign * 0.147], rubber);
    rod(turret, [-0.42, 2.6, -0.46], [-0.42, 2.89, -0.46], 0.34, darkArmor, 0.31, 20);
    rod(turret, [0.17, 2.64, 0.45], [0.17, 2.71, 0.45], 0.28, darkArmor, 0.28, 20);
    for (let i = 0; i < 8; i++) {
        box(group, [0.12, 0.035, 1.08], [-1.38 - i * 0.16, 1.735, -0.68], steel);
        box(group, [0.12, 0.035, 1.08], [-1.38 - i * 0.16, 1.735, 0.68], steel);
    }
    for (const sign of [-1, 1]) {
        rod(group, [-2.99, 0.99, sign * 0.56], [-2.99, 1.83, sign * 0.56], 0.13, steel);
        box(group, [0.75, 0.22, 0.04], [0.03, 2.22, sign * 1.145], material(0xe5e2d4));
        box(group, [0.23, 0.66, 0.043], [0.03, 2.22, sign * 1.147], material(0xe5e2d4));
        box(group, [0.64, 0.1, 0.048], [0.03, 2.22, sign * 1.153], rubber);
        box(group, [0.1, 0.55, 0.048], [0.03, 2.22, sign * 1.153], rubber);
    }
    return group;
}

function makeAbrams() {
    const group = new THREE.Group();
    const armor = material(0xc0aa7e);
    const darkArmor = material(0x998664);
    const rubber = material(0x272e30, { metalness: 0.05 });
    const track = material(0x363c3e, { metalness: 0.55 });
    const steel = material(0x6c6d62, { metalness: 0.55 });
    conventionalTracks(group, 6.9, 1.51, 0.64, { armor, track, steel, rubber }, 7);
    profile(group, [[-3.55, 0.75], [3.1, 0.75], [3.65, 1.2], [2.1, 1.53], [-3.55, 1.53]], 2.65, [0, 0, 0], armor);
    for (const sign of [-1, 1]) {
        for (let i = 0; i < 7; i++) box(group, [0.88, 0.59, 0.11], [-2.83 + i * 0.94, 1.1, sign * 1.85], armor);
    }
    rod(group, [0, 1.52, 0], [0, 1.68, 0], 1.27, darkArmor, 1.27, 32);
    wing(group, [[-2.25, -1.18], [-0.1, -1.5], [1.9, -0.86], [1.9, 0.86], [-0.1, 1.5], [-2.25, 1.18]], 0.69, [0, 1.98, 0], armor);
    // Mejillas inclinadas del blindaje y cesta trasera de la torreta.
    for (const sign of [-1, 1]) {
        const cheek = box(group, [1.62, 0.49, 0.45], [0.72, 2.17, sign * 0.96], darkArmor);
        cheek.rotation.y = sign * 0.28;
        box(group, [0.82, 0.38, 0.7], [-2.45, 2.04, sign * 0.73], steel);
        rod(group, [-1.7, 2.35, sign * 1.02], [-1.7, 3.27, sign * 1.02], 0.018, rubber);
    }
    box(group, [0.47, 0.47, 0.64], [1.82, 2.12, 0], darkArmor);
    rod(group, [1.96, 2.12, 0], [2.7, 2.12, 0], 0.16, darkArmor, 0.135, 16);
    rod(group, [2.65, 2.12, 0], [6.25, 2.12, 0], 0.105, armor, 0.08, 16);
    rod(group, [3.6, 2.12, 0], [4.1, 2.12, 0], 0.17, darkArmor, 0.17, 16);
    rod(group, [6.23, 2.12, 0], [6.28, 2.12, 0], 0.073, rubber);
    rod(group, [-0.33, 2.32, -0.57], [-0.33, 2.46, -0.57], 0.34, darkArmor, 0.34, 20);
    rod(group, [-0.67, 2.31, 0.59], [-0.67, 2.41, 0.59], 0.28, darkArmor, 0.28, 20);
    box(group, [0.34, 0.29, 0.29], [0.39, 2.48, -0.47], steel);
    box(group, [0.015, 0.1, 0.2], [0.569, 2.51, -0.47], material(0x283e45, { metalness: 0.5, roughness: 0.2 }));
    rod(group, [-0.24, 2.49, -0.57], [-0.24, 2.78, -0.57], 0.04, steel);
    box(group, [0.57, 0.13, 0.12], [-0.02, 2.8, -0.57], steel);
    rod(group, [0.24, 2.8, -0.57], [0.8, 2.8, -0.57], 0.025, rubber);
    for (let i = 0; i < 9; i++) box(group, [0.085, 0.025, 2.1], [-2.35 - i * 0.12, 1.552, 0], steel);
    box(group, [0.05, 0.51, 2.14], [-3.58, 1.19, 0], steel);
    return group;
}

function makeCamel() {
    const group = new THREE.Group();
    const olive = material(0x666946, { metalness: 0.05 });
    const linen = material(0xbeb091, { metalness: 0.02 });
    const wood = material(0x795031, { metalness: 0.05 });
    const metal = material(0x939894, { metalness: 0.65, roughness: 0.44 });
    const black = material(0x262e31);
    fuselage(group, [[-2.65, 0], [-2.3, 0.16], [-1.2, 0.29], [0.1, 0.48], [1.35, 0.53], [1.8, 0.43]], [0, 1.57, 0], olive, 0.88);
    fuselage(group, [[1.47, 0.52], [1.91, 0.52], [2.04, 0.42]], [0, 1.57, 0], metal);
    rod(group, [1.96, 1.57, 0], [2.065, 1.57, 0], 0.38, black, 0.38, 24);
    const plan = [[1.07, -3.93], [0.91, -4.25], [-0.21, -4.25], [-0.35, -4.02], [-0.35, 4.02], [-0.21, 4.25], [0.91, 4.25], [1.07, 3.93]];
    wing(group, plan, 0.1, [0, 2.52, 0], olive);
    wing(group, plan, 0.09, [-0.12, 1.22, 0], linen);
    for (const sign of [-1, 1]) {
        for (const x of [0.84, -0.17]) rod(group, [x - 0.12, 1.25, sign * 2.78], [x, 2.46, sign * 2.8], 0.035, wood);
        rod(group, [-0.29, 1.29, sign * 2.8], [0.84, 2.46, sign * 2.8], 0.008, metal, 0.008, 6);
        rod(group, [0.73, 1.29, sign * 2.8], [-0.17, 2.46, sign * 2.8], 0.008, metal, 0.008, 6);
        rod(group, [0.7, 1.93, sign * 0.3], [0.81, 2.49, sign * 0.75], 0.029, wood);
        rod(group, [-0.19, 1.94, sign * 0.3], [-0.16, 2.49, sign * 0.75], 0.029, wood);
        roundel(group, [0.36, 2.577, sign * 2.95], 0.47);
        roundel(group, [-1.3, 1.59, sign * 0.293], 0.21, sign < 0 ? 'left' : 'right');
        rod(group, [0.67, 1.24, sign * 0.3], [0.51, 0.34, sign * 0.88], 0.04, metal);
        rod(group, [-0.42, 1.23, sign * 0.29], [0.51, 0.34, sign * 0.88], 0.04, metal);
        wheel(group, 0.51, 0.34, sign * 0.96, 0.34, 0.16, black, linen);
    }
    rod(group, [0.51, 0.34, -1.02], [0.51, 0.34, 1.02], 0.045, metal);
    wing(group, [[-1.95, -1.25], [-2.45, -1.24], [-2.76, -0.83], [-2.76, 0.83], [-2.45, 1.24], [-1.95, 1.25]], 0.07, [0, 1.61, 0], linen);
    profile(group, [[-2.78, 1.58], [-2.7, 2.25], [-2.37, 2.33], [-1.92, 1.6]], 0.055, [0, 0, 0], olive);
    ellipsoid(group, [0.32, 0.06, 0.27], [-0.41, 2.001, 0], black);
    ellipsoid(group, [0.06, 0.14, 0.21], [-0.09, 2.05, 0], material(0x8aa6ac, { roughness: 0.22, metalness: 0.48 }));
    rod(group, [-2.25, 1.46, 0], [-2.71, 0.42, 0], 0.045, wood);
    rod(group, [-2.71, 0.42, 0], [-2.92, 0.24, 0], 0.05, wood);
    const prop = propeller(group, 2.12, 1.57, 1.2, wood, 2);
    rod(group, [2.05, 1.57, 0], [2.23, 1.57, 0], 0.11, metal);
    group.userData.animate = delta => { prop.rotation.x += delta * 17; };
    return group;
}

function makeSpitfire() {
    const group = new THREE.Group();
    const green = material(0x667064);
    const brown = material(0x8d8167);
    const underside = material(0xb0bdb5);
    const rubber = material(0x20282c, { metalness: 0.05 });
    const steel = material(0x7d898b, { metalness: 0.65 });
    const glass = material(0x466773, { metalness: 0.6, roughness: 0.16 });
    fuselage(group, [[-4.32, 0], [-3.75, 0.19], [-2.8, 0.29], [-1.3, 0.41], [0.2, 0.53], [2.3, 0.5], [3.22, 0.35], [3.7, 0.12]], [0, 1.94, 0], green, 1.05);
    const wingPoints = [];
    for (let i = 0; i < 48; i++) {
        const angle = i * Math.PI * 2 / 48;
        const z = Math.sin(angle) * 5.61;
        wingPoints.push([0.15 + Math.cos(angle) * 1.36 - Math.abs(z) * 0.025, z]);
    }
    wing(group, wingPoints, 0.12, [0, 1.63, 0], green);
    for (const sign of [-1, 1]) {
        wing(group, [[0.79, sign * 1.0], [0.51, sign * 4.63], [-0.11, sign * 5.21], [-0.5, sign * 4.1], [-0.6, sign * 1.0]], 0.013, [0, 1.698, 0], brown);
        roundel(group, [0.05, 1.714, sign * 3.65], 0.56);
        roundel(group, [-2.21, 1.96, sign * 0.35], 0.3, sign < 0 ? 'left' : 'right');
        rod(group, [0.38, 1.63, sign * 1.12], [0.65, 0.38, sign * 1.28], 0.065, steel);
        box(group, [0.32, 0.9, 0.055], [0.61, 0.9, sign * 1.36], underside);
        wheel(group, 0.65, 0.35, sign * 1.42, 0.35, 0.2, rubber, steel);
        box(group, [0.7, 0.22, 0.49], [-0.49, 1.47, sign * 1.73], underside);
        rod(group, [0.75, 1.64, sign * 2.12], [1.77, 1.64, sign * 2.12], 0.038, steel);
        for (let i = 0; i < 6; i++) rod(group, [1.1 + i * 0.26, 2.14, sign * 0.44], [1.0 + i * 0.26, 2.11, sign * 0.57], 0.041, steel);
    }
    wing(group, [[-2.98, -1.93], [-3.65, -1.81], [-4.05, -0.8], [-4.05, 0.8], [-3.65, 1.81], [-2.98, 1.93], [-2.51, 0]], 0.07, [0, 1.94, 0], green);
    profile(group, [[-4.25, 1.91], [-4.05, 3.19], [-3.7, 3.33], [-3.16, 2.91], [-2.78, 1.92]], 0.09, [0, 0, 0], green);
    ellipsoid(group, [0.79, 0.49, 0.37], [-0.7, 2.36, 0], glass);
    rod(group, [-0.67, 2.82, 0], [-0.68, 2.41, -0.36], 0.025, green);
    rod(group, [-0.67, 2.82, 0], [-0.68, 2.41, 0.36], 0.025, green);
    rod(group, [-2.99, 1.79, 0], [-3.19, 0.35, 0], 0.038, steel);
    wheel(group, -3.19, 0.2, 0, 0.2, 0.15, rubber, steel);
    const prop = propeller(group, 3.58, 1.94, 1.46, rubber, 3);
    fuselage(group, [[3.59, 0.27], [3.86, 0.24], [4.1, 0]], [0, 1.94, 0], underside);
    group.userData.animate = delta => { prop.rotation.x += delta * 19; };
    return group;
}

function makeF35() {
    const group = new THREE.Group();
    const gray = material(0x818f98, { roughness: 0.58, metalness: 0.36 });
    const panels = material(0x626e77, { roughness: 0.64 });
    const dark = material(0x242e37, { metalness: 0.55 });
    const steel = material(0xa3acac, { metalness: 0.75, roughness: 0.37 });
    const glass = material(0x5b747b, { metalness: 0.72, roughness: 0.13 });
    const tire = material(0x20282e, { metalness: 0.02 });
    fuselage(group, [[-7.1, 0.7], [-6.0, 0.84], [-3.6, 1.12], [-0.6, 1.07], [2.6, 0.91], [4.4, 0.62], [6.25, 0.37], [7.72, 0]], [0, 1.83, 0], gray, 0.78);
    // Raíz ancha, alas trapezoidales y dos derivas inclinadas.
    for (const sign of [-1, 1]) {
        wing(group, [[2.41, sign * 0.58], [-0.1, sign * 5.34], [-2.88, sign * 5.34], [-2.83, sign * 1.5], [-5.7, sign * 0.7]], 0.14, [0, 1.89, 0], gray);
        wing(group, [[-1.8, sign * 1.72], [-2.24, sign * 5.07], [-2.75, sign * 5.07], [-2.67, sign * 1.85]], 0.017, [0, 1.973, 0], panels);
        wing(group, [[-3.8, sign * 0.69], [-5.02, sign * 3.68], [-6.99, sign * 3.17], [-6.59, sign * 0.66]], 0.09, [0, 1.96, 0], gray);
        const fin = profile(group, [[-6.7, 0], [-5.87, 2.14], [-4.98, 2.47], [-3.32, 0]], 0.1, [0, 2.0, sign * 1.03], panels);
        fin.rotation.x = sign * 0.36;
        // Entradas de aire laterales y carenados de la toma.
        fuselage(group, [[-2.25, 0.46], [1.3, 0.63], [2.15, 0.47]], [0, 1.63, sign * 0.98], gray, 0.79);
        const inlet = add(group, new THREE.CircleGeometry(0.39, 5), dark, [2.18, 1.65, sign * 0.98]);
        inlet.rotation.y = Math.PI / 2;
        inlet.scale.y = 0.87;
        rod(group, [-1.9, 1.35, sign * 0.91], [-2.23, 0.4, sign * 1.25], 0.074, steel);
        box(group, [0.65, 0.89, 0.09], [-2.08, 0.94, sign * 1.38], panels);
        wheel(group, -2.23, 0.4, sign * 1.37, 0.4, 0.23, tire, steel);
        box(group, [1.82, 0.034, 0.38], [-0.54, 1.02, sign * 0.37], panels);
    }
    ellipsoid(group, [1.64, 0.59, 0.55], [2.81, 2.52, 0], glass);
    rod(group, [1.72, 2.81, -0.35], [1.61, 2.74, 0], 0.036, gray);
    rod(group, [1.61, 2.74, 0], [1.72, 2.81, 0.35], 0.036, gray);
    rod(group, [4.0, 1.34, 0], [3.84, 0.34, 0], 0.066, steel);
    box(group, [0.4, 0.6, 0.045], [4.05, 0.85, 0.15], panels);
    wheel(group, 3.84, 0.29, 0, 0.29, 0.19, tire, steel);
    // Tobera única, abierta hacia la cola; no requiere texturas externas.
    const nozzle = new THREE.CylinderGeometry(0.73, 0.58, 0.7, 20, 1, true);
    nozzle.rotateZ(Math.PI / 2);
    add(group, nozzle, material(0x59606a, { metalness: 0.82, roughness: 0.4, side: THREE.DoubleSide }), [-7.23, 1.83, 0]);
    rod(group, [-7.52, 1.83, 0], [-7.5, 1.83, 0], 0.55, dark, 0.55, 24);
    for (let i = 0; i < 20; i++) {
        const angle = i * Math.PI / 10;
        rod(group, [-6.95, 1.83 + Math.cos(angle) * 0.69, Math.sin(angle) * 0.69], [-7.55, 1.83 + Math.cos(angle) * 0.58, Math.sin(angle) * 0.58], 0.014, steel, 0.014, 6);
    }
    return group;
}

const builders = {
    'mark-i': makeMarkI,
    'sopwith-camel': makeCamel,
    'tiger-i': makeTiger,
    'spitfire': makeSpitfire,
    'm1-abrams': makeAbrams,
    'f-35': makeF35
};

export function createVehicle(id) {
    const build = builders[id];
    if (!build) throw new Error(`Vehículo 3D desconocido: ${id}`);
    const group = build();
    group.name = id;
    // Ajusta la cota del conjunto, incluidas las pequeñas zapatas de las orugas.
    const bounds = new THREE.Box3().setFromObject(group);
    group.position.y -= bounds.min.y;
    group.userData.vehicleId = id;
    return group;
}
