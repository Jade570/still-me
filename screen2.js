import * as THREE from 'three';

let scene, camera, renderer, controls;
const seatGroups = new Array(50).fill(null); // 50개의 아이스크림 그룹

// ... (App.tsx의 유틸리티 함수들 (JS로 포팅) ...
const ZERO2 = new THREE.Vector2(0, 0);

// ===== 색상 그라데이션 (App.tsx와 동일) =====
// ... (gradientColorAt 함수 등)
const gradientStops = [
    [0.03, [155, 78, 42]],
    [0.20, [239, 124, 247]],
    [0.40, [235, 215, 40]],
    [0.60, [87, 199, 133]],
    [0.80, [155, 201, 238]],
    [0.97, [255, 255, 255]],
];

// 💡 Store original camera state
let originalCameraPosition = new THREE.Vector3(0, 20, 15);
let originalCameraZoom; // Will be set in init
const frustumSize = 25;


function gradientColorAt(x) {
    const t = Math.min(1, Math.max(0, x));
    if (gradientStops.length === 0) return "rgb(255,255,255)";
    const first = gradientStops[0];
    if (t <= first[0]) {
        const c = first[1];
        return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
    for (let i = 0; i < gradientStops.length - 1; i++) {
        const curr = gradientStops[i];
        const next = gradientStops[i + 1];
        const p0 = curr[0], c0 = curr[1];
        const p1 = next[0], c1 = next[1];
        if (t <= p1) {
            const u = (t - p0) / (p1 - p0);
            const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
            const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
            const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
            return `rgb(${r}, ${g}, ${b})`;
        }
    }
    const last = gradientStops[gradientStops.length - 1];
    const c = last[1];
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}


// ===== 지오메트리 생성 (App.tsx 포팅) =====

class TaperedSpiral extends THREE.Curve {
    constructor({ height = 6, turns = 6, r0 = 1.2, taper = (t) => 1 - t }) {
        super(); this.height = height; this.turns = turns; this.r0 = r0; this.taper = taper;
    }
    getPoint(t, target = new THREE.Vector3()) {
        const angularAdjustment = 1 + 0.5 * (1 - t);
        const ang = 2 * Math.PI * this.turns * t * angularAdjustment;
        const r = this.r0 * Math.max(0.0001, this.taper(t));
        return target.set(r * Math.cos(ang), this.height * t, r * Math.sin(ang));
    }
}

function shapeRing(N = 16, morph = 0, starPoints = 5, inner = 0.35, ringRadius = 0.35) {
    const pts = [];
    for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        const k = ((th * starPoints) % (2 * Math.PI));
        const rOuter = ringRadius;
        const rInner = ringRadius * inner;
        const rs = THREE.MathUtils.lerp(rOuter, rInner, (1 - Math.cos(k)) * 0.5);
        const r = THREE.MathUtils.lerp(ringRadius, rs, morph);
        pts.push(new THREE.Vector2(Math.cos(th) * r, Math.sin(th) * r));
    }
    return pts;
}

function buildSweepGeometry({
    curve, steps = 100, radialSegments = 36, starPoints = 5, inner = 0.35,
    morphFn = (t) => t, scaleFn = (t) => 1, ringRadius = 0.35
}) {
    const positions = new Float32Array((steps + 1) * radialSegments * 3);
    const uvs = new Float32Array((steps + 1) * radialSegments * 2);
    const indices = new Uint32Array(steps * radialSegments * 6);

    const tmp = new THREE.Vector3(), tangent = new THREE.Vector3(), normal = new THREE.Vector3(0, 1, 0), binormal = new THREE.Vector3(), prevTangent = new THREE.Vector3();
    curve.getTangent(0, tangent);
    binormal.crossVectors(tangent, normal).normalize();
    normal.crossVectors(binormal, tangent).normalize();

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const center = curve.getPoint(t);
        prevTangent.copy(tangent);
        curve.getTangent(t, tangent);
        if (!tangent.equals(prevTangent)) {
            const q = new THREE.Quaternion().setFromUnitVectors(prevTangent, tangent);
            normal.applyQuaternion(q); binormal.applyQuaternion(q);
        }
        const ring2D = shapeRing(radialSegments, THREE.MathUtils.clamp(morphFn(t), 0, 1), starPoints, inner, ringRadius);
        const s = scaleFn(t);
        for (let j = 0; j < radialSegments; j++) {
            const v2 = ring2D[j] ?? ZERO2;
            tmp.copy(center).addScaledVector(normal, v2.x * s).addScaledVector(binormal, v2.y * s);
            const idx = (i * radialSegments + j) * 3;
            positions[idx] = tmp.x; positions[idx + 1] = tmp.y; positions[idx + 2] = tmp.z;
            const uvIdx = (i * radialSegments + j) * 2;
            uvs[uvIdx] = j / radialSegments; uvs[uvIdx + 1] = t;
        }
    }
    let id = 0;
    for (let i = 0; i < steps; i++) {
        for (let j = 0; j < radialSegments; j++) {
            const a = i * radialSegments + j;
            const b = i * radialSegments + ((j + 1) % radialSegments);
            const c = (i + 1) * radialSegments + ((j + 1) % radialSegments);
            const d = (i + 1) * radialSegments + j;
            indices[id++] = a; indices[id++] = b; indices[id++] = d;
            indices[id++] = b; indices[id++] = c; indices[id++] = d;
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();
    return geo;
}

function createSoftServeGeometry({ height, morph, ringRadius = 0.35 }) {
    const turns = height * 1.65;
    const r0 = 1.2;
    const steps = 150; // 💡 성능을 위해 600 -> 150으로 줄임
    const radialSegments = 48; // 💡 128 -> 48
    const starPoints = 5;

    const taper = (t) => 1 - t * 0.99;
    const curve = new TaperedSpiral({ height, turns, r0, taper });
    const morphFn = () => THREE.MathUtils.clamp(morph, 0, 1);

    // App.tsx의 scaleFn
    const scaleFn = (t) => {
        const minScale = 0.05;
        const smooth = (x) => x * x * x * (x * (x * 6 - 15) + 10);
        const BASE_H = 3;
        const bottomLenAtBase = 0.15 * BASE_H;
        const topLenAtBase = 0.30 * BASE_H;
        const bottomFrac = Math.min(1, bottomLenAtBase / height);
        const topFrac = Math.min(1, topLenAtBase / height);
        const bottomT = smooth(THREE.MathUtils.clamp(t / bottomFrac, 0, 1));
        const topT = smooth(THREE.MathUtils.clamp((1 - t) / topFrac, 0, 1));
        return Math.min(
            THREE.MathUtils.lerp(minScale, 1, bottomT),
            THREE.MathUtils.lerp(minScale, 1, topT),
        );
    };

    return buildSweepGeometry({ curve, steps, radialSegments, starPoints, inner: 0.35, morphFn, scaleFn, ringRadius });
}

// 💡 1. 콘 지오메트리와 재질을 파일 최상단에서 "단 한 번" 생성합니다.
const SHARED_CONE_GEOMETRY = new THREE.ConeGeometry(1.2, 3.3, 16);
const SHARED_CONE_MATERIAL = new THREE.MeshStandardMaterial({ color: "#d4a76a", roughness: 0.7 });
const nutMaterialSide = new THREE.MeshStandardMaterial({
    color: 0x8b4513, // 갈색 "껍질"
    roughness: 0.8,
    metalness: 0.0,
});
const nutMaterialCap = new THREE.MeshStandardMaterial({
    color: 0xffe4c4, // 살구색 "단면"
    roughness: 0.6,
    metalness: 0.0,
});

function createConeMesh() {
    // 💡 2. 새로 생성하는 대신, 미리 만들어 둔 상수를 사용합니다.
    const mesh = new THREE.Mesh(SHARED_CONE_GEOMETRY, SHARED_CONE_MATERIAL);
    mesh.position.set(0, -1.55, 0);
    mesh.rotation.set(0, 0, Math.PI);
    return mesh;
}

// App.tsx의 SprinkleMesh 포팅
function createSprinkleMesh(style, i) {
    if (style === "none") return null;
    let geom, mat;

    if (style === "chocochips") {
        const isStar = i % 3 === 0;
        if (isStar) {
            geom = new THREE.ConeGeometry(0.2, 0.1, 4);
        } else {
            geom = new THREE.SphereGeometry(0.1, 6, 6);
        }
        mat = new THREE.MeshStandardMaterial({
            color: i % 2 ? "#5a3e2b" : "#f3f3f3",
            metalness: 0.05, roughness: 0.7
        });
    } else if (style === "pearls") {
        // App.tsx (0.04) -> 2.5x 스케일 -> 0.1 (세그먼트 6, 6)
        geom = new THREE.SphereGeometry(0.1, 6, 6);
        mat = new THREE.MeshStandardMaterial({ color: "#f8f1ff", metalness: 0.2, roughness: 0.2 });

    } else if (style === "nuts") {
        // 💡 2. 'nuts' 로직을 App.tsx와 동일하게(비례 스케일 적용) 수정

        // App.tsx s (avg 0.026) -> 2.5x 스케일 (avg 0.065)
        const s = 0.06 + (i % 5) * 0.01;

        // App.tsx thickness (s*0.5) -> avg 0.013 -> 2.5x 스케일 (avg 0.0325)
        const thickness = s * 0.5;
        // App.tsx radius (s*2.0) -> avg 0.052 -> 2.5x 스케일 (avg 0.13)
        const radius = s * 2.0;
        // App.tsx ellipseScaleX (1.3)
        const ellipseScaleX = 1.3;

        geom = new THREE.CylinderGeometry(
            radius, radius, // radius
            thickness,      // height (두께)
            16              // radialSegments (성능 위해 16)
        );

        // 재질 배열: 0=옆(갈색), 1=위(살구), 2=아래(살구)
        mat = [nutMaterialSide, nutMaterialCap, nutMaterialCap];

        const mesh = new THREE.Mesh(geom, mat);

        // App.tsx와 같이 X축으로 스케일 적용
        mesh.scale.set(ellipseScaleX, 1.0, 1.0);

        return mesh; // 💡 스케일이 적용된 메시를 직접 반환

    } else { // rainbow
        const RB = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff", "#b074ff", "#ff9ecd"];
        // App.tsx (0.02, 0.12) -> 2.5x 스케일 -> (0.05, 0.30)
        geom = new THREE.CapsuleGeometry(0.05, 0.30, 4, 8);
        mat = new THREE.MeshStandardMaterial({
            color: RB[i % RB.length],
            metalness: 0.1, roughness: 0.5
        });
    }

    // (nuts가 아닌 경우에만 여기로 옴)
    return new THREE.Mesh(geom, mat);
}

// App.tsx의 AnimatedSprinkles 로직 중 위치 선정/방향 설정 부분만 포팅
function createSprinkles(softServeGeom, style, count) {
    const sprinkleGroup = new THREE.Group();
    if (style === "none" || !softServeGeom) return sprinkleGroup;

    const positions = softServeGeom.getAttribute("position");
    const normals = softServeGeom.getAttribute("normal");
    const posCount = positions.count;

    // 💡 3. App.tsx 로직 포팅 (회전용)
    const upVector = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * posCount);
        const p = new THREE.Vector3().fromBufferAttribute(positions, idx);
        const n = new THREE.Vector3().fromBufferAttribute(normals, idx).normalize();

        // 💡 4. 'nuts' 스타일일 때만 중앙(n.y > 0.8)을 피해 외곽에 뿌립니다.
        if (style === "nuts") {
            // 아몬드: 중앙(n.y > 0.8)과 너무 옆(n.y < 0.2)을 피해 외곽에만
            if (n.y < 0.2 || n.y > 0.8) continue;
        } else {
            // 기타: 너무 옆(n.y < 0.2)만 아니면 됨
            if (n.y < 0.2) continue;
        }

        const mesh = createSprinkleMesh(style, i);
        if (!mesh) continue;

        // 위치 설정 (n 방향으로 살짝 띄움)
        const lift = style === "pearls" ? 0.01 : 0.02;
        mesh.position.copy(p).addScaledVector(n, lift);

        // 💡 5. 방향 설정 (App.tsx 로직 포팅)
        if (style === "nuts") {
            // --- "붙는" 로직 (nuts ONLY) ---
            const targetQuatBase = new THREE.Quaternion().setFromUnitVectors(upVector, n);
            const roll = Math.random() * Math.PI * 2;
            const rollQuat = new THREE.Quaternion().setFromAxisAngle(n, roll); // 법선 기준 회전
            mesh.quaternion.copy(targetQuatBase.multiply(rollQuat));

        } else {
            // --- "눕는" 로직 (rainbow, chocochips, pearls) ---
            let rand = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
            let tangent = rand.sub(n.clone().multiplyScalar(n.dot(rand))).normalize();
            if (tangent.lengthSq() < 1e-6) tangent = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 1, 0)).normalize();

            const targetQuatBase = new THREE.Quaternion().setFromUnitVectors(upVector, tangent); // 접선 기준 Y축 정렬
            const roll = (Math.random() - 0.5) * Math.PI * 0.6;
            const rollQuat = new THREE.Quaternion().setFromAxisAngle(tangent, roll); // 접선 기준 회전
            mesh.quaternion.copy(targetQuatBase.multiply(rollQuat));
        }

        sprinkleGroup.add(mesh);
    }
    return sprinkleGroup;
}

// ===== 3D 씬 초기화 =====
export function init(container) {
    if (!container) {
        console.error("Screen 2 container not found for init.");
        return;
    }

    scene = new THREE.Scene();

    // 💡 탑다운 뷰 (Orthographic)
    const aspect = container.clientWidth / container.clientHeight;

    camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        100
    );
    camera.position.copy(originalCameraPosition);
    camera.lookAt(0, 0, 0);      // 아래를
    scene.add(camera);

    originalCameraZoom = camera.zoom;

    // 렌더러
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // 조명
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(10, 20, 10);
    light.castShadow = true;
    scene.add(light);

    // 50개 좌석(그룹) 생성 및 "계란판" 배치
    const gridX = 10;
    const gridY = 5;
    // const spacing = 5.0; // 아이스크림 간격


    function updateGridPositions() {
        if (!camera || !renderer) return; // 💡 Added renderer check

        // 💡 Get aspect from renderer, not camera
        const rendererSize = renderer.getSize(new THREE.Vector2());
        // Handle case where renderer size might be 0
        if (rendererSize.y === 0) return;
        const aspect = rendererSize.x / rendererSize.y;

        // 💡 ALWAYS use the original frustumSize
        const viewWidth = (frustumSize * aspect);
        const viewHeight = frustumSize;

        const padding = 0.85;
        const spacingX = (viewWidth * padding) / gridX;
        const spacingY = (viewHeight * (padding + 0.2)) / gridY;

        // 💡 2. Z축(세로) 오프셋 추가
        // 전체 격자를 아이스크림 높이를 감안해 아래로 0.5칸 정도 내립니다.
        const verticalOffset = spacingY * 0.2;

        for (let i = 0; i < 50; i++) {
            const group = seatGroups[i];
            if (!group) continue;

            const x = (i % gridX - (gridX - 1) / 2) * spacingX;

            // 💡 3. Z축 계산에 verticalOffset 적용
            const z = (Math.floor(i / gridX) - (gridY - 1) / 2) * spacingY + verticalOffset;

            group.position.set(x, 0, z);
        }
    }

    for (let i = 0; i < 50; i++) {
        const group = new THREE.Group();

        // 💡 1. 여기에 createConeMesh()를 즉시 호출합니다.
        group.add(createConeMesh());
        // 💡 2. 그룹을 처음부터 보이도록(true) 설정합니다.
        group.visible = true;
        group.userData = { seat: i, params: {} }; // 상태 저장
        seatGroups[i] = group;
        scene.add(group);
    }

    // 💡 4. init 마지막에 격자 위치를 "최초"로 한 번 계산합니다.
    updateGridPositions();

    // 창 크기 조절
    window.addEventListener('resize', () => {
        if (!container || !renderer) return;
        if (container.clientWidth === 0 || container.clientHeight === 0) {
            return;
        }
        const aspect = container.clientWidth / container.clientHeight;
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);

        updateGridPositions();
    });
    lastTime = 0;
    animate();
}

let lastTime = 0;

function animate(time) {
    // 렌더러나 씬이 없으면 중지
    if (!renderer || !scene || !camera) return;

    // 1. Delta Time 계산 (프레임 속도에 관계없이 일정한 속도 보장)
    if (lastTime === 0) lastTime = time;
    const deltaTime = (time - lastTime) * 0.001; // 초 단위
    lastTime = time;
    requestAnimationFrame(animate);

    // 2. 💡 모든 아이스크림 그룹을 순회하며 회전
    const baseSpeed = 0.5; // 1.0 = 초당 1 라디안(약 57도)

    for (const group of seatGroups) {
        if (!group) continue;

        // 3. 💡 userData에서 pan 값을 읽어옴
        const pan = group.userData.params?.pan; // Optional chaining

        if (pan !== undefined && pan !== 0) {
            // 4. 💡 Y축(수직)을 기준으로 pan 값에 비례하여 회전
            // pan은 -1.0 (왼쪽) ~ 1.0 (오른쪽)
            group.rotation.y += pan * baseSpeed * deltaTime;
        }
    }
    renderer.render(scene, camera);
}


// 💡💡💡 [수정됨] 'spotlightSeat' 함수 💡💡💡
// 💡 ADD: Function to spotlight a specific seat
export function spotlightSeat(seat, playerState) {
    if (!camera || !seatGroups[seat] || !renderer) return;

    // --- 1. (NEW) Isolate this ice cream ---
    for (let i = 0; i < 50; i++) {
        if (seatGroups[i]) {
            // Hide all *except* the target seat
            seatGroups[i].visible = (i === seat);
        }
    }

    const group = seatGroups[seat];
    const targetPosition = group.position.clone(); // (x, 0, z)

    // --- 2. (NEW) Account for ice cream height ---
    // Get height parameter (s1)
    const s1 = (playerState?.slider && playerState.slider[1] !== undefined) ? playerState.slider[1] : 0;
    const iceCreamHeight = s1 * 5 + 1; // 1 (min) to 6 (max)
    const coneHeight = 3.3; // From createConeMesh (ConeGeometry)
    const totalObjectHeight = iceCreamHeight + coneHeight; // Max ~9.3

    // Move the camera's "lookAt" target to the vertical center of the cream
    const lookAtY = iceCreamHeight / 3.0;
    targetPosition.y = lookAtY; // Adjust lookAt target vertically

    // --- 3. Camera Position ---
    // Move camera relative to this new target
    const newCamPos = new THREE.Vector3(
        targetPosition.x,                            
        targetPosition.y + originalCameraPosition.y, // (lookAtY + 20)
        targetPosition.z + originalCameraPosition.z  // (targetZ + 15)
    );
    camera.position.copy(newCamPos);

    // --- 4. Look At ---
    camera.lookAt(targetPosition.x, targetPosition.y, targetPosition.z);

    // --- 5. (NEW) Dynamic Frustum (View) to prevent clipping ---
    // We want the view to be slightly larger than the object height.
    const newFrustumHeight = totalObjectHeight * 1.5; // Add 50% padding
    
    // Get current aspect ratio
    const rendererSize = renderer.getSize(new THREE.Vector2());
    const aspect = (rendererSize.y === 0) ? 1 : (rendererSize.x / rendererSize.y);
    
    // Set the new frustum dimensions
    camera.top = newFrustumHeight / 2;
    camera.bottom = -newFrustumHeight / 2;
    camera.left = (newFrustumHeight * aspect) / -2;
    camera.right = (newFrustumHeight * aspect) / 2;

    // Reset zoom to 1.0, since we are manually controlling the frustum size
    camera.zoom = 1.0; 
    
    camera.updateProjectionMatrix();
}


// 💡💡💡 [수정됨] 'resetCamera' 함수 💡💡💡
// 💡 ADD: Function to reset the camera to the default grid view
export function resetCamera() {
    if (!camera || !renderer) return;

    // --- 1. (NEW) Make all ice creams visible again ---
    for (let i = 0; i < 50; i++) {
        if (seatGroups[i]) {
            seatGroups[i].visible = true;
        }
    }

    // 2. Position Reset
    camera.position.copy(originalCameraPosition);
    
    // 3. (NEW) Frustum Reset
    // Reset the frustum back to the original size
    const rendererSize = renderer.getSize(new THREE.Vector2());
    const aspect = (rendererSize.y === 0) ? 1 : (rendererSize.x / rendererSize.y);
    
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.left = (frustumSize * aspect) / -2;
    camera.right = (frustumSize * aspect) / 2;

    // 4. Zoom Reset
    camera.zoom = originalCameraZoom;

    // 5. LookAt Reset
    camera.lookAt(0, 0, 0); 
    
    // 6. Apply
    camera.updateProjectionMatrix();
}

// ===== 아이스크림 업데이트 함수 =====
// 이 함수 전체를 기존 updateIceCream 함수와 교체하세요.

export function updateIceCream(seat, playerState) {
    // 씬이 초기화되지 않았으면(seatGroups[seat]이 null이면) 종료
    const group = seatGroups[seat];
    if (!group) return;

    // 1. 💡 비활성 처리 (크림과 스프링클만 제거)
    if (!playerState) {
        // 기존 소프트서브(크림) 제거
        const oldSoftServe = group.getObjectByName("softserve");
        if (oldSoftServe) {
            oldSoftServe.geometry.dispose();
            oldSoftServe.material.dispose();
            group.remove(oldSoftServe);
        }
        // 기존 스프링클 제거
        const oldSprinkles = group.getObjectByName("sprinkles");
        if (oldSprinkles) {
            // 💡💡💡 [수정됨] 재질 배열(nuts) 처리를 위한 로직 변경 💡💡💡
            oldSprinkles.traverse(child => {
                if (child.geometry) child.geometry.dispose();

                if (child.material) {
                    if (Array.isArray(child.material)) {
                        // 1. 재질이 배열인 경우 (nuts)
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        // 2. 재질이 단일 객체인 경우 (rainbow, pearls, chocochips)
                        child.material.dispose();
                    }
                }
            });
            // 💡💡💡 ============================================ 💡💡💡
            group.remove(oldSprinkles);
        }

        // 유저데이터 파라미터 초기화
        group.userData.params = {};
        return;
    }

    // 3. 파라미터 추출 (App.tsx 매핑 기준)
    const { slider, perc, pan } = playerState;
    // 💡 slider가 없는 경우(초기 상태) 대비
    const s0 = (slider && slider[0] !== undefined) ? slider[0] : 0;
    const s1 = (slider && slider[1] !== undefined) ? slider[1] : 0;
    const s2 = (slider && slider[2] !== undefined) ? slider[2] : 0;

    const morph = s0;         // 0..1 (shape)
    const height = s1 * 5 + 1; // 0..1 -> 1..6 (height)
    const lightness = s2;   // 0..1 (color)
    const creamColor = gradientColorAt(lightness);

    // 3. Perc -> Sprinkle 스타일 변환
    const styleMap = ["rainbow", "chocochips", "pearls", "nuts"];
    const sprinkleStyle = styleMap[perc] || "none";

    // 💡 'nuts'일 때 개수를 40개로 설정
    const sprinkleCount =
        sprinkleStyle === "none" ? 0 :
            sprinkleStyle === "pearls" ? 50 : // (App: 90)
                sprinkleStyle === "nuts" ? 50 :   // (App: 70)
                    80; // others (App: 150)

    // 4. 변경 사항 감지
    const params = group.userData.params;
    const needsGeomUpdate = params.morph !== morph || params.height !== height;
    const needsColorUpdate = params.color !== creamColor;
    const needsSprinkleUpdate = params.sprinkle !== sprinkleStyle;

    if (!needsGeomUpdate && !needsColorUpdate && !needsSprinkleUpdate && params.pan === pan) {
        // 💡 pan 값도 변경 감지에 포함
        return; // 변경 없음
    }

    // 5. 업데이트
    let softServeGeom = group.userData.geom;

    // 지오메트리 (가장 비싼 작업)
    if (needsGeomUpdate) {
        // 기존 지오메트리/메시 정리
        const oldSoftServe = group.getObjectByName("softserve");
        if (oldSoftServe) {
            oldSoftServe.geometry.dispose();
            oldSoftServe.material.dispose();
            group.remove(oldSoftServe);
        }

        softServeGeom = createSoftServeGeometry({ height, morph });
        const mat = new THREE.MeshStandardMaterial({
            color: creamColor,
            roughness: 0.55
        });
        const softServeMesh = new THREE.Mesh(softServeGeom, mat);
        softServeMesh.name = "softserve";

        group.add(softServeMesh);
        group.userData.geom = softServeGeom; // 새 지오메트리 저장
    }
    // 색상 (저렴한 작업)
    else if (needsColorUpdate) {
        const softServeMesh = group.getObjectByName("softserve");
        if (softServeMesh) {
            softServeMesh.material.color.set(creamColor);
        }
    }

    // 스프링클 (중간 작업)
    if (needsGeomUpdate || needsSprinkleUpdate) {
        // 기존 스프링클 정리
        const oldSprinkles = group.getObjectByName("sprinkles");
        if (oldSprinkles) {
            // 💡💡💡 [수정됨] 재질 배열(nuts) 처리를 위한 로직 변경 💡💡💡
            oldSprinkles.traverse(child => {
                if (child.geometry) child.geometry.dispose();

                if (child.material) {
                    if (Array.isArray(child.material)) {
                        // 1. 재질이 배열인 경우 (nuts)
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        // 2. 재질이 단일 객체인 경우 (rainbow, pearls, chocochips)
                        child.material.dispose();
                    }
                }
            });
            // 💡💡💡 ============================================ 💡💡💡
            group.remove(oldSprinkles);
        }

        const sprinkleGroup = createSprinkles(softServeGeom, sprinkleStyle, sprinkleCount);
        sprinkleGroup.name = "sprinkles";
        group.add(sprinkleGroup);
    }

    // 새 상태 저장
    group.userData.params = {
        morph,
        height,
        color: creamColor,
        sprinkle: sprinkleStyle,
        pan: pan // 💡 pan 값 저장
    };
}

// 전체 업데이트용
export async function updateAllIceCreams(seats, loadingMessageEl) {
    let count = 0;
    const total = seats.filter(s => s !== null).length;
    
    for (let s = 0; s < 50; s++) {
        const playerState = seats[s];
        if (!playerState) continue; // 비활성 좌석은 건너뜀

        updateIceCream(s, playerState);
        count++;

        // 💡 2. 5개의 아이스크림을 생성할 때마다 
        //    메인 스레드 제어권을 브라우저에 잠시 돌려줍니다.
        //    이렇게 하면 UI가 멈추지 않고, 아이스크림이 순차적으로 나타납니다.
        if (s % 5 === 4) {
            if (loadingMessageEl) {
                // 💡 진행 상황 업데이트
                loadingMessageEl.textContent = `Generating 3D visuals... (${count}/${total})`;
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
}