/**
 * armSolver.ts — 캐릭터 공간 방향벡터(ArmPose) → VRM 정규화 본 로컬 회전 FK 솔버.
 * (BRIEF v3 "모델" 1 — 계약 v2: upperDir/lowerDir/palmNormal/handDir)
 *
 * 프레임 규약
 *  - 캐릭터 공간(계약): x=캐릭터 왼쪽+, y=위+, z=앞(카메라)+ — 모델 root 프레임과 동일.
 *  - "리그 공간": 정규화 본 트리(normalizedHumanBonesRoot)의 로컬 프레임.
 *    rest에서 모든 정규화 본 회전이 항등이므로 각 본의 rest 로컬 기저 == 리그 공간 기저.
 *    three-vrm은 정규화 본 위치를 파싱 시점 월드 오프셋으로 만들기 때문에(rotateVRM0 이전)
 *    VRM0의 리그 공간은 캐릭터 공간의 y-π 플립이다. 이 차이는 생성자에서 charToRig
 *    쿼터니언 하나(= 리그 루트 월드 회전⁻¹)로 흡수 — S 부호 가지치기가 필요 없다.
 *  - 트래킹의 팔 방향은 어깨라인 기저(몸통 기준)의 기하학적 사실이므로, 부모 체인 워크는
 *    stopAt(팔이 매달린 몸통 본) **직전**까지만 누적한다 — 몸통 lean/twist에 팔이 같이 실린다.
 *
 * 알고리즘 (매 프레임, 힙 할당 0 — 스크래치 전부 인스턴스 필드)
 *  1. upperArm: swing(setFromUnitVectors: restDir→목표) 후, rest 팔꿈치 힌지축(hingeRest)의
 *     상이 실제 힌지축(u×l)과 일치하도록 목표축 둘레 트위스트를 더한다 — 스윙-트위스트
 *     분해로 상완 롤을 힌지에 종속시켜 안정화 (팔을 앞으로 들어도 겨드랑이 뒤틀림 없음).
 *     팔이 거의 곧으면 u×l이 퇴화 → lastHinge 히스테리시스로 유지.
 *  2. lowerArm: 순수 힌지 — upper 로컬로 변환한 lowerDir로의 최소 회전(자체 롤 0;
 *     전완 비틀림은 손목이 담당). 힌지축은 1의 정렬 덕에 rest 힌지축과 자연 일치.
 *  3. hand: (handDir, palmNormal) 직교 기저 → 손목 회전(전완 기준 상대).
 *     전완축 스윙-트위스트 분해 후 굽힘 ±80°, 비틀림 ±90° 클램프 (지오메트리 파손 방지).
 *
 * 검증: 하네스가 새 파라미터를 아직 지원하지 않으므로 armSolverSelfTest()가 합성 본
 * 체인(VRM1형/VRM0형/몸통 비틀림)으로 수치 검증하고 콘솔에 PASS/FAIL을 남긴다.
 */
import * as THREE from 'three';
/** 손목 굽힘 클램프 ±80° (rad) — 인체 한계, 메시 파손 방지 */
export const WRIST_BEND_MAX = 1.396;
/** 손목(전완) 비틀림 클램프 ±90° (rad) */
export const WRIST_TWIST_MAX = Math.PI / 2;
/** 힌지 신뢰 페이드: sin(팔꿈치각)이 LO 이하면 lastHinge 유지, HI 이상이면 즉시 채택 */
const HINGE_FADE_LO = 0.10;
const HINGE_FADE_HI = 0.30;
const { smoothstep } = THREE.MathUtils;
// 클램프 전용 모듈 스크래치 (단일 스레드 전제 — solve 내부에서만 사용)
const _qTwist = new THREE.Quaternion();
const _qSwing = new THREE.Quaternion();
/** 쿼터니언 회전각을 maxRad로 캡 (축 유지, w<0 정규화 포함) */
function clampQuatAngle(q, maxRad) {
    if (q.w < 0)
        q.set(-q.x, -q.y, -q.z, -q.w);
    const half = Math.acos(Math.min(1, q.w));
    if (2 * half <= maxRad)
        return;
    const s = Math.sin(half);
    if (s < 1e-6)
        return;
    const k = Math.sin(maxRad / 2) / s;
    q.set(q.x * k, q.y * k, q.z * k, Math.cos(maxRad / 2));
}
/**
 * q를 axis(단위벡터) 둘레 트위스트와 나머지 스윙으로 분해해 각각 클램프 후 재조립.
 * q = swing · twist (twist 먼저 적용되는 순서).
 */
function clampSwingTwist(q, axis, maxSwing, maxTwist) {
    if (q.w < 0)
        q.set(-q.x, -q.y, -q.z, -q.w);
    const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
    _qTwist.set(axis.x * d, axis.y * d, axis.z * d, q.w);
    if (_qTwist.lengthSq() < 1e-12)
        _qTwist.identity();
    else
        _qTwist.normalize();
    _qSwing.copy(_qTwist).invert().premultiply(q); // swing = q · twist⁻¹
    clampQuatAngle(_qTwist, maxTwist);
    clampQuatAngle(_qSwing, maxSwing);
    q.copy(_qSwing).multiply(_qTwist);
}
export class ArmSolver {
    upper;
    lower;
    hand;
    /** 부모 체인 워크 종료 노드(비포함) — 팔이 매달린 몸통 본 */
    stopAt;
    /** 캐릭터(root) 공간 → 리그 공간 (리그 루트 rest 월드 회전의 역) */
    charToRig;
    // rest 데이터 (로드 시 1회 계산 — BRIEF "rest pose 방향 로드 시 1회")
    restU; // 상완 rest 방향 (부모 프레임 == 리그 공간)
    restL; // 하완 rest 방향 == 전완 트위스트축 (lower 프레임)
    restHandDir; // 손목→중지MCP rest (hand 프레임)
    restPalm; // 손바닥 법선 rest (VRM T포즈 = 손바닥 아래)
    hingeRest; // rest 팔꿈치 힌지축 (전방 굽힘 기준)
    lastHinge; // 힌지 히스테리시스 상태
    // 스크래치 (핫패스 할당 금지)
    u = new THREE.Vector3();
    l = new THREE.Vector3();
    pn = new THREE.Vector3();
    hd = new THREE.Vector3();
    h = new THREE.Vector3();
    href = new THREE.Vector3();
    tmp = new THREE.Vector3();
    tmp2 = new THREE.Vector3();
    qp = new THREE.Quaternion();
    qA = new THREE.Quaternion();
    qB = new THREE.Quaternion();
    qC = new THREE.Quaternion();
    /**
     * @param bones 정규화 본 노드들 (rest 상태·회전 항등에서 생성할 것)
     * @param stopAt 부모 워크 종료(비포함) 노드 — 보통 (shoulder ?? upperArm).parent
     * @param rigWorldQ 리그 루트(normalizedHumanBonesRoot)의 rest 월드 쿼터니언
     */
    constructor(bones, stopAt, rigWorldQ) {
        this.upper = bones.upper;
        this.lower = bones.lower;
        this.hand = bones.hand;
        this.stopAt = stopAt;
        this.charToRig = rigWorldQ.clone().invert();
        this.restU = bones.lower.position.clone().normalize();
        this.restL = bones.hand.position.clone().normalize();
        this.restHandDir = (bones.middleProx ? bones.middleProx.position : bones.hand.position).clone().normalize();
        // rest 손바닥 법선: 검지/새끼 MCP 실측 (VRM 표준 rest = 손바닥 아래 → 부호를 -y로 통일)
        const down = new THREE.Vector3(0, -1, 0);
        let palm = null;
        if (bones.indexProx && bones.littleProx) {
            const ref = bones.littleProx.position.clone().sub(bones.indexProx.position);
            const n = new THREE.Vector3().crossVectors(this.restHandDir, ref);
            if (n.lengthSq() > 1e-8) {
                if (n.dot(down) < 0)
                    n.negate();
                palm = n.normalize();
            }
        }
        if (!palm) {
            palm = down.clone().addScaledVector(this.restHandDir, -down.dot(this.restHandDir));
            if (palm.lengthSq() < 1e-8)
                palm.set(0, 0, -1);
            palm.normalize();
        }
        this.restPalm = palm;
        // rest 힌지축: "팔꿈치는 앞(front)으로 굽는다"를 기준 롤로 삼는다 — restU × front(리그)
        const frontRig = new THREE.Vector3(0, 0, 1).applyQuaternion(this.charToRig);
        this.hingeRest = new THREE.Vector3().crossVectors(this.restU, frontRig);
        if (this.hingeRest.lengthSq() < 1e-8)
            this.hingeRest.set(0, -1, 0);
        this.hingeRest.normalize();
        this.lastHinge = this.hingeRest.clone();
    }
    /**
     * 캐릭터 공간 목표(정규화 가정, 방어적 재정규화 포함)로 upper/lower/hand 본 회전 갱신.
     * smooth: 0..1 — 목표 로컬 쿼터니언으로의 slerp 비율 (1 = 즉시). 체인 아래 본은
     * slerp 적용 후의 실제 부모 회전 기준으로 풀므로 스무딩 중에도 체인이 일관된다.
     */
    solve(uC, lC, pnC, hdC, smooth) {
        const { u, l, pn, hd, h, tmp } = this;
        // ---- 캐릭터 → 리그 공간 ----
        u.copy(uC).applyQuaternion(this.charToRig);
        l.copy(lC).applyQuaternion(this.charToRig);
        pn.copy(pnC).applyQuaternion(this.charToRig);
        hd.copy(hdC).applyQuaternion(this.charToRig);
        if (u.lengthSq() < 1e-8)
            u.copy(this.restU);
        else
            u.normalize();
        if (l.lengthSq() < 1e-8)
            l.copy(u);
        else
            l.normalize();
        if (hd.lengthSq() < 1e-8)
            hd.copy(this.restHandDir);
        else
            hd.normalize();
        // pn은 손목 단계에서 직교화하며 정규화
        // ---- 팔꿈치 힌지축 추정 (u×l) + 곧은 팔 히스테리시스 ----
        tmp.crossVectors(u, l);
        const sinElbow = tmp.length();
        if (sinElbow > 1e-6) {
            const w = smoothstep(sinElbow, HINGE_FADE_LO, HINGE_FADE_HI);
            if (w > 0)
                this.lastHinge.lerp(tmp.divideScalar(sinElbow), w).normalize();
        }
        h.copy(this.lastHinge).addScaledVector(u, -this.lastHinge.dot(u));
        if (h.lengthSq() < 1e-6)
            h.copy(this.hingeRest).addScaledVector(u, -this.hingeRest.dot(u));
        if (h.lengthSq() < 1e-6) {
            // u가 rest 힌지와도 평행한 병리적 케이스 — u에 수직인 아무 축
            tmp.set(Math.abs(u.x) < 0.9 ? 1 : 0, 0, Math.abs(u.x) < 0.9 ? 0 : 1);
            h.crossVectors(u, tmp);
        }
        h.normalize();
        // ---- 부모(어깨 체인) 현재 회전 — stopAt 직전까지 누적 (몸통 기준 해석) ----
        const qp = this.qp.set(0, 0, 0, 1);
        let n = this.upper.parent;
        while (n && n !== this.stopAt) {
            qp.premultiply(n.quaternion);
            n = n.parent;
        }
        const qpInv = this.qA.copy(qp).invert();
        u.applyQuaternion(qpInv);
        l.applyQuaternion(qpInv);
        pn.applyQuaternion(qpInv);
        hd.applyQuaternion(qpInv);
        h.applyQuaternion(qpInv);
        // ---- 1) upperArm: swing + 힌지 정렬 트위스트 (스윙-트위스트 롤 안정화) ----
        const qSwing = this.qB.setFromUnitVectors(this.restU, u);
        const href = this.href.copy(this.hingeRest).applyQuaternion(qSwing);
        const twist = Math.atan2(tmp.crossVectors(href, h).dot(u), href.dot(h));
        const qUp = this.qC.setFromAxisAngle(u, twist).multiply(qSwing);
        this.upper.quaternion.slerp(qUp, smooth);
        // ---- 2) lowerArm: 순수 힌지 (upper 실제 회전 기준 로컬 목표로 최소 회전) ----
        const qUpInv = this.qA.copy(this.upper.quaternion).invert();
        l.applyQuaternion(qUpInv);
        pn.applyQuaternion(qUpInv);
        hd.applyQuaternion(qUpInv);
        const qLow = this.qB.setFromUnitVectors(this.restL, l);
        this.lower.quaternion.slerp(qLow, smooth);
        // ---- 3) hand: (handDir, palmNormal) 기저 → 손목 회전 + 클램프 ----
        const qLowInv = this.qA.copy(this.lower.quaternion).invert();
        pn.applyQuaternion(qLowInv);
        hd.applyQuaternion(qLowInv);
        hd.normalize();
        pn.addScaledVector(hd, -pn.dot(hd)); // 기저 직교화 (palmNormal ⊥ handDir 보장)
        if (pn.lengthSq() < 1e-6)
            pn.copy(this.restPalm).addScaledVector(hd, -this.restPalm.dot(hd));
        if (pn.lengthSq() < 1e-6)
            pn.copy(this.restPalm);
        pn.normalize();
        const q1 = this.qB.setFromUnitVectors(this.restHandDir, hd);
        const pref = tmp.copy(this.restPalm).applyQuaternion(q1);
        const roll = Math.atan2(this.tmp2.crossVectors(pref, pn).dot(hd), pref.dot(pn));
        const qHand = this.qC.setFromAxisAngle(hd, roll).multiply(q1);
        clampSwingTwist(qHand, this.restL, WRIST_BEND_MAX, WRIST_TWIST_MAX);
        this.hand.quaternion.slerp(qHand, smooth);
    }
}
function buildTestChain(vrm0) {
    const mk = (name, parent, x, y, z) => {
        const o = new THREE.Object3D();
        o.name = name;
        o.position.set(x, y, z);
        parent.add(o);
        return o;
    };
    const m = vrm0 ? -1 : 1; // VRM0 리그 공간: 캐릭터 왼팔이 -x
    const scene = new THREE.Object3D();
    const rigRoot = new THREE.Object3D();
    if (vrm0)
        rigRoot.rotation.y = Math.PI; // rotateVRM0 상당
    scene.add(rigRoot);
    const hips = mk('hips', rigRoot, 0, 0.9, 0);
    const torso = mk('chest', hips, 0, 0.35, 0);
    const shoulder = mk('shoulder', torso, m * 0.05, 0.12, 0);
    const upper = mk('upper', shoulder, m * 0.07, 0, 0);
    const lower = mk('lower', upper, m * 0.25, 0, 0);
    const hand = mk('hand', lower, m * 0.24, 0, 0);
    const middle = mk('middleProx', hand, m * 0.09, 0, 0);
    const index = mk('indexProx', hand, m * 0.085, 0, 0.02);
    const little = mk('littleProx', hand, m * 0.08, 0, -0.02);
    scene.updateMatrixWorld(true);
    const rigWorldQ = rigRoot.getWorldQuaternion(new THREE.Quaternion());
    const solver = new ArmSolver({ upper, lower, hand, middleProx: middle, indexProx: index, littleProx: little }, shoulder.parent, rigWorldQ);
    return { scene, torso, upper, lower, hand, middle, solver };
}
export function armSolverSelfTest() {
    const v = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const dir = (from, to, out) => out.copy(to.getWorldPosition(new THREE.Vector3())).sub(from.getWorldPosition(new THREE.Vector3())).normalize();
    const cases = [
        { name: 'T포즈(rest) 왼팔 VRM1형', vrm0: false,
            u: [1, 0, 0], l: [1, 0, 0], pn: [0, -1, 0], hd: [1, 0, 0],
            expU: [1, 0, 0], expL: [1, 0, 0], expHd: [1, 0, 0], expPn: [0, -1, 0] },
        { name: '팔 앞으로 나란히(fwd, 손바닥 아래)', vrm0: false,
            u: [0, 0, 1], l: [0, 0, 1], pn: [0, -1, 0], hd: [0, 0, 1],
            expU: [0, 0, 1], expL: [0, 0, 1], expHd: [0, 0, 1], expPn: [0, -1, 0] },
        { name: 'T + 팔꿈치 90° 전방 (팔 앞으로 접기)', vrm0: false,
            u: [1, 0, 0], l: [0, 0, 1], pn: [0, -1, 0], hd: [0, 0, 1],
            expU: [1, 0, 0], expL: [0, 0, 1], expHd: [0, 0, 1], expPn: [0, -1, 0] },
        { name: '만세(up) — 힌지 퇴화 폴백', vrm0: false,
            u: [0, 1, 0], l: [0, 1, 0], pn: [0, 0, 1], hd: [0, 1, 0],
            expU: [0, 1, 0], expL: [0, 1, 0], expHd: [0, 1, 0] },
        { name: '손목 30° 신전 + 손바닥 앞(palm=front)', vrm0: false,
            u: [1, 0, 0], l: [1, 0, 0], pn: [0, 0, 1], hd: [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0],
            expU: [1, 0, 0], expL: [1, 0, 0],
            expHd: [Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 0], expPn: [0, 0, 1] },
        { name: 'VRM0형(π 플립) 팔 앞으로', vrm0: true,
            u: [0, 0, 1], l: [0, 0, 1], pn: [0, -1, 0], hd: [0, 0, 1],
            expU: [0, 0, 1], expL: [0, 0, 1], expHd: [0, 0, 1], expPn: [0, -1, 0] },
        { name: 'VRM0형 T자 + 팔꿈치 90°', vrm0: true,
            u: [1, 0, 0], l: [0, 0, 1], pn: [0, -1, 0], hd: [0, 0, 1],
            expU: [1, 0, 0], expL: [0, 0, 1], expHd: [0, 0, 1] },
        { name: '몸통 twist 0.4에 팔이 같이 실림(몸통 기준 해석)', vrm0: false, torsoTwist: 0.4,
            u: [0, 0, 1], l: [0, 0, 1], pn: [0, -1, 0], hd: [0, 0, 1],
            expU: [Math.sin(0.4), 0, Math.cos(0.4)], expL: [Math.sin(0.4), 0, Math.cos(0.4)] },
    ];
    let allOk = true;
    const TOL = 0.02; // rad-상당 (1−cos 오차 아님: 방향각 허용치 ≈1.1°)
    for (const c of cases) {
        const t = buildTestChain(c.vrm0);
        if (c.torsoTwist)
            t.torso.rotation.y = c.torsoTwist * (c.vrm0 ? -1 : 1); // 월드 twist 기준
        const uC = new THREE.Vector3(...c.u).normalize();
        const lC = new THREE.Vector3(...c.l).normalize();
        const pnC = new THREE.Vector3(...c.pn).normalize();
        const hdC = new THREE.Vector3(...c.hd).normalize();
        t.solver.solve(uC, lC, pnC, hdC, 1);
        t.scene.updateMatrixWorld(true);
        let err = 0;
        err = Math.max(err, dir(t.upper, t.lower, v).angleTo(v2.set(...c.expU)));
        err = Math.max(err, dir(t.lower, t.hand, v).angleTo(v2.set(...c.expL)));
        if (c.expHd)
            err = Math.max(err, dir(t.hand, t.middle, v).angleTo(v2.set(...c.expHd)));
        if (c.expPn) {
            // 손바닥 법선: rest 손바닥(-y)을 hand 월드 회전으로 이동시켜 비교
            t.hand.getWorldQuaternion(q);
            const restPalmRig = new THREE.Vector3(0, -1, 0); // 합성 체인의 rest 손바닥 (아래)
            err = Math.max(err, v.copy(restPalmRig).applyQuaternion(q).angleTo(v2.set(...c.expPn)));
        }
        const nan = [t.upper, t.lower, t.hand].some((b) => Number.isNaN(b.quaternion.x + b.quaternion.w));
        const ok = !nan && err < TOL;
        allOk &&= ok;
        console.info(`[armSolver selfTest] ${ok ? 'PASS' : 'FAIL'} ${c.name} (maxErr ${(err * 180 / Math.PI).toFixed(2)}°${nan ? ', NaN!' : ''})`);
    }
    console.info(`[armSolver selfTest] ${allOk ? '전체 PASS' : '실패 있음 — 위 FAIL 확인'}`);
    return allOk;
}
