import * as THREE from 'three';

export function material(color, options = {}) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.25, ...options });
}

// Texturas generadas localmente y con semilla fija: cada modelo conserva su acabado.
export function paint(color, { camo = [], seed = 17, roughness = 0.72, metalness = 0.16, scale = 1 } = {}) {
    if (typeof document === 'undefined') return material(color, { roughness, metalness });
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
    const size = 512;
    const makeCanvas = () => { const canvas = document.createElement('canvas'); canvas.width = canvas.height = size; return canvas; };
    const canvas = makeCanvas();
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = new THREE.Color(color).getStyle();
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < camo.length * 8; i++) {
        ctx.fillStyle = new THREE.Color(camo[i % camo.length]).getStyle();
        const x = random() * size, y = random() * size;
        const radius = 25 + random() * 90;
        ctx.beginPath();
        for (let j = 0; j <= 16; j++) {
            const angle = j / 16 * Math.PI * 2;
            const r = radius * (0.65 + random() * 0.5);
            const px = x + Math.cos(angle) * r, py = y + Math.sin(angle) * r * 0.65;
            if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
    }
    const pixels = ctx.getImageData(0, 0, size, size);
    const relief = makeCanvas(); const reliefCtx = relief.getContext('2d');
    const rough = makeCanvas(); const roughCtx = rough.getContext('2d');
    const reliefPixels = reliefCtx.createImageData(size, size);
    const roughPixels = roughCtx.createImageData(size, size);
    for (let i = 0; i < pixels.data.length; i += 4) {
        const noise = (random() - 0.5) * 17;
        for (let c = 0; c < 3; c++) {
            pixels.data[i + c] = Math.max(0, Math.min(255, pixels.data[i + c] + noise));
            reliefPixels.data[i + c] = 128 + noise * 1.5;
            roughPixels.data[i + c] = 210 + noise;
        }
        reliefPixels.data[i + 3] = roughPixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    reliefCtx.putImageData(reliefPixels, 0, 0);
    roughCtx.putImageData(roughPixels, 0, 0);
    // Desgaste fino; evita convertir la superficie en un mosaico de manchas grandes.
    ctx.strokeStyle = 'rgba(200,195,174,.16)'; ctx.lineWidth = .65;
    for (let i = 0; i < 85; i++) {
        const x = random() * size, y = random() * size;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 2 + random() * 10, y + random() * 2); ctx.stroke();
    }
    const texture = (image, colorSpace = THREE.NoColorSpace) => {
        const map = new THREE.CanvasTexture(image);
        map.colorSpace = colorSpace;
        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(scale, scale);
        map.anisotropy = 4;
        return map;
    };
    return material(0xffffff, {
        map: texture(canvas, THREE.SRGBColorSpace),
        bumpMap: texture(relief), bumpScale: 0.012,
        roughnessMap: texture(rough), roughness, metalness
    });
}

export function add(parent, geometry, surface, position = [0, 0, 0]) {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}

export function box(parent, size, position, surface) {
    return add(parent, new THREE.BoxGeometry(...size), surface, position);
}

export function ellipsoid(parent, size, position, surface) {
    const mesh = add(parent, new THREE.SphereGeometry(1, 24, 14), surface, position);
    mesh.scale.set(...size);
    return mesh;
}

export function rod(parent, from, to, radius, surface, endRadius = radius, sides = 12) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const direction = end.clone().sub(start);
    const mesh = add(parent, new THREE.CylinderGeometry(endRadius, radius, direction.length(), sides), surface);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return mesh;
}

export function outline(points) {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    points.slice(1).forEach(point => shape.lineTo(...point));
    shape.closePath();
    return shape;
}

export function profile(parent, points, width, position, surface, holes = []) {
    const shape = outline(points);
    holes.forEach(points => shape.holes.push(outline(points)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    geometry.translate(0, 0, -width / 2);
    return add(parent, geometry, surface, position);
}

export function wing(parent, points, thickness, position, surface) {
    const mesh = profile(parent, points.map(([x, z]) => [x, -z]), thickness, position, surface);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}

export function fuselage(parent, rings, position, surface, verticalScale = 1) {
    const geometry = new THREE.LatheGeometry(rings.map(([x, radius]) => new THREE.Vector2(radius, x)), 28);
    geometry.rotateZ(-Math.PI / 2);
    geometry.scale(1, verticalScale, 1);
    return add(parent, geometry, surface, position);
}

export function wheel(parent, x, y, z, radius, width, tire, hub) {
    rod(parent, [x, y, z - width / 2], [x, y, z + width / 2], radius, tire, radius, 20);
    for (const sign of [-1, 1]) {
        rod(parent, [x, y, z + sign * width / 2], [x, y, z + sign * (width / 2 + 0.025)], radius * 0.68, hub, radius * 0.68, 16);
    }
}

export function treads(parent, points, z, width, surface, spacing = 0.23) {
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

export function conventionalTracks(parent, length, z, width, palette, wheelCount = 7) {
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

export function roundel(parent, position, radius, facing = 'top') {
    const colors = [0x203e6b, 0xe8e9df, 0xab3438];
    const ratios = [1, 0.67, 0.35];
    const group = new THREE.Group();
    group.position.set(...position);
    if (facing === 'top') group.rotation.x = -Math.PI / 2;
    if (facing === 'left') group.rotation.y = Math.PI;
    parent.add(group);
    colors.forEach((color, index) => add(group, new THREE.CircleGeometry(radius * ratios[index], 24), material(color, { metalness: 0, roughness: 1 }), [0, 0, index * 0.003]));
}

export function propeller(parent, x, y, radius, surface, bladeCount = 2) {
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

