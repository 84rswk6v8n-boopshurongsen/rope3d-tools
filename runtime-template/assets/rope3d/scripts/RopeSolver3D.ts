import { Mat4, RigidBody, Vec3 } from 'cc';

export type RopeParticle = {
    position: Vec3;
    previousPosition: Vec3;
    velocity: Vec3;
    invMass: number;
};

type RopeColliderBase = {
    name: string;
    center: Vec3;
    worldToLocal: Mat4;
    localToWorld: Mat4;
    rigidBody: RigidBody | null;
    rigidBodyImpulse: Vec3;
    rigidBodyFrictionImpulse: Vec3;
    rigidBodyContactPoint: Vec3;
    rigidBodyContactWeight: number;
};

export type RopeBoxData = RopeColliderBase & {
    type: 'box';
    halfExtents: Vec3;
};

export type RopeSphereData = RopeColliderBase & {
    type: 'sphere';
    radius: number;
    worldCenter: Vec3;
};

export type RopeColliderData = RopeBoxData | RopeSphereData;

export type RopeGrassReactionSampler = (
    position: Readonly<Vec3>,
    velocity: Readonly<Vec3>,
    radius: number,
    outForce: Vec3,
) => number;

export type RopeSolverOptions = {
    ropeRadius: number;
    segmentLength: number;
    targetLength: number;
    pinEndAnchor: boolean;
    endAnchorPullStiffness: number;
    endAnchorMaxPullSpeed: number;
    selfCollisionEnabled: boolean;
    selfCollisionIterations: number;
    selfCollisionRadiusScale: number;
    selfCollisionStiffness: number;
    selfCollisionSegmentSkip: number;
    selfCollisionDynamicFriction: number;
    selfCollisionStaticFrictionSpeed: number;
    selfCollisionStaticFriction: number;
    selfCollisionNormalCacheBlend: number;
    selfCollisionNormalCacheFrames: number;
    surfaceDynamicFriction: number;
    surfaceStaticFrictionSpeed: number;
    surfaceStaticFriction: number;
    continuousCollisionEnabled: boolean;
    continuousCollisionSegmentSamples: number;
    gravity: Vec3;
    damping: number;
    stretchStiffness: number;
    bendStiffness: number;
    solverIterations: number;
    collisionIterations: number;
    rigidBodyInteraction: boolean;
    rigidBodyImpulseScale: number;
    maxRigidBodyImpulse: number;
    rigidBodyFriction: number;
    rigidBodyFrictionImpulseScale: number;
    maxRigidBodyFrictionImpulse: number;
    grassInteractionEnabled: boolean;
    grassReactionSampler: RopeGrassReactionSampler | null;
    grassRopeWeight: number;
    grassSupportScale: number;
    grassDragScale: number;
    grassMaxAcceleration: number;
};

const MIN_LENGTH = 0.00001;
const COLLISION_SLOP = 0.001;

type SelfCollisionContact = {
    normal: Vec3;
    age: number;
    touched: boolean;
};

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function transformPoint(out: Vec3, point: Vec3, matrix: Mat4) {
    return Vec3.transformMat4(out, point, matrix);
}

export class RopeSolver3D {
    public readonly particles: RopeParticle[] = [];

    public ropeRadius = 0.08;
    public segmentLength = 0.2;
    public targetLength = 5;
    public pinEndAnchor = false;
    public endAnchorPullStiffness = 0.85;
    public endAnchorMaxPullSpeed = 2.5;
    public selfCollisionEnabled = true;
    public selfCollisionIterations = 2;
    public selfCollisionRadiusScale = 1;
    public selfCollisionStiffness = 0.85;
    public selfCollisionSegmentSkip = 2;
    public selfCollisionDynamicFriction = 0.45;
    public selfCollisionStaticFrictionSpeed = 0.35;
    public selfCollisionStaticFriction = 0.85;
    public selfCollisionNormalCacheBlend = 0.75;
    public selfCollisionNormalCacheFrames = 8;
    public surfaceDynamicFriction = 0.55;
    public surfaceStaticFrictionSpeed = 0.35;
    public surfaceStaticFriction = 1;
    public continuousCollisionEnabled = true;
    public continuousCollisionSegmentSamples = 3;
    public gravity = new Vec3(0, -9.8, 0);
    public damping = 0.985;
    public stretchStiffness = 1;
    public bendStiffness = 0.35;
    public solverIterations = 10;
    public collisionIterations = 3;
    public rigidBodyInteraction = true;
    public rigidBodyImpulseScale = 0.08;
    public maxRigidBodyImpulse = 0.16;
    public rigidBodyFriction = 0.8;
    public rigidBodyFrictionImpulseScale = 0.08;
    public maxRigidBodyFrictionImpulse = 0.18;
    public grassInteractionEnabled = false;
    public grassReactionSampler: RopeGrassReactionSampler | null = null;
    public grassRopeWeight = 1;
    public grassSupportScale = 1;
    public grassDragScale = 1;
    public grassMaxAcceleration = 14;

    private readonly _startAnchor = new Vec3();
    private readonly _endAnchor = new Vec3();
    private readonly _selfCollisionContacts = new Map<string, SelfCollisionContact>();
    private readonly _grassForce = new Vec3();
    private _hasStartAnchor = false;
    private _hasEndAnchor = false;

    public configure(options: Partial<RopeSolverOptions>) {
        if (options.ropeRadius !== undefined) this.ropeRadius = Math.max(0.001, options.ropeRadius);
        if (options.segmentLength !== undefined) this.segmentLength = Math.max(0.02, options.segmentLength);
        if (options.targetLength !== undefined) this.targetLength = Math.max(this.segmentLength, options.targetLength);
        if (options.pinEndAnchor !== undefined) this.pinEndAnchor = options.pinEndAnchor;
        if (options.endAnchorPullStiffness !== undefined) this.endAnchorPullStiffness = Math.max(0, Math.min(1, options.endAnchorPullStiffness));
        if (options.endAnchorMaxPullSpeed !== undefined) this.endAnchorMaxPullSpeed = Math.max(0, options.endAnchorMaxPullSpeed);
        if (options.selfCollisionEnabled !== undefined) this.selfCollisionEnabled = options.selfCollisionEnabled;
        if (options.selfCollisionIterations !== undefined) this.selfCollisionIterations = Math.max(0, Math.floor(options.selfCollisionIterations));
        if (options.selfCollisionRadiusScale !== undefined) this.selfCollisionRadiusScale = Math.max(0, options.selfCollisionRadiusScale);
        if (options.selfCollisionStiffness !== undefined) this.selfCollisionStiffness = Math.max(0, Math.min(1, options.selfCollisionStiffness));
        if (options.selfCollisionSegmentSkip !== undefined) this.selfCollisionSegmentSkip = Math.max(1, Math.floor(options.selfCollisionSegmentSkip));
        if (options.selfCollisionDynamicFriction !== undefined) this.selfCollisionDynamicFriction = Math.max(0, Math.min(1, options.selfCollisionDynamicFriction));
        if (options.selfCollisionStaticFrictionSpeed !== undefined) this.selfCollisionStaticFrictionSpeed = Math.max(0, options.selfCollisionStaticFrictionSpeed);
        if (options.selfCollisionStaticFriction !== undefined) this.selfCollisionStaticFriction = Math.max(0, Math.min(1, options.selfCollisionStaticFriction));
        if (options.selfCollisionNormalCacheBlend !== undefined) this.selfCollisionNormalCacheBlend = Math.max(0, Math.min(1, options.selfCollisionNormalCacheBlend));
        if (options.selfCollisionNormalCacheFrames !== undefined) this.selfCollisionNormalCacheFrames = Math.max(0, Math.floor(options.selfCollisionNormalCacheFrames));
        if (options.surfaceDynamicFriction !== undefined) this.surfaceDynamicFriction = Math.max(0, Math.min(1, options.surfaceDynamicFriction));
        if (options.surfaceStaticFrictionSpeed !== undefined) this.surfaceStaticFrictionSpeed = Math.max(0, options.surfaceStaticFrictionSpeed);
        if (options.surfaceStaticFriction !== undefined) this.surfaceStaticFriction = Math.max(0, Math.min(1, options.surfaceStaticFriction));
        if (options.continuousCollisionEnabled !== undefined) this.continuousCollisionEnabled = options.continuousCollisionEnabled;
        if (options.continuousCollisionSegmentSamples !== undefined) this.continuousCollisionSegmentSamples = Math.max(1, Math.floor(options.continuousCollisionSegmentSamples));
        if (options.gravity) this.gravity.set(options.gravity);
        if (options.damping !== undefined) this.damping = Math.max(0, Math.min(1, options.damping));
        if (options.stretchStiffness !== undefined) this.stretchStiffness = Math.max(0, Math.min(1, options.stretchStiffness));
        if (options.bendStiffness !== undefined) this.bendStiffness = Math.max(0, Math.min(1, options.bendStiffness));
        if (options.solverIterations !== undefined) this.solverIterations = Math.max(1, Math.floor(options.solverIterations));
        if (options.collisionIterations !== undefined) this.collisionIterations = Math.max(0, Math.floor(options.collisionIterations));
        if (options.rigidBodyInteraction !== undefined) this.rigidBodyInteraction = options.rigidBodyInteraction;
        if (options.rigidBodyImpulseScale !== undefined) this.rigidBodyImpulseScale = Math.max(0, options.rigidBodyImpulseScale);
        if (options.maxRigidBodyImpulse !== undefined) this.maxRigidBodyImpulse = Math.max(0, options.maxRigidBodyImpulse);
        if (options.rigidBodyFriction !== undefined) this.rigidBodyFriction = Math.max(0, options.rigidBodyFriction);
        if (options.rigidBodyFrictionImpulseScale !== undefined) this.rigidBodyFrictionImpulseScale = Math.max(0, options.rigidBodyFrictionImpulseScale);
        if (options.maxRigidBodyFrictionImpulse !== undefined) this.maxRigidBodyFrictionImpulse = Math.max(0, options.maxRigidBodyFrictionImpulse);
        if (options.grassInteractionEnabled !== undefined) this.grassInteractionEnabled = options.grassInteractionEnabled;
        if (options.grassReactionSampler !== undefined) this.grassReactionSampler = options.grassReactionSampler;
        if (options.grassRopeWeight !== undefined) this.grassRopeWeight = Math.max(0.001, options.grassRopeWeight);
        if (options.grassSupportScale !== undefined) this.grassSupportScale = Math.max(0, options.grassSupportScale);
        if (options.grassDragScale !== undefined) this.grassDragScale = Math.max(0, options.grassDragScale);
        if (options.grassMaxAcceleration !== undefined) this.grassMaxAcceleration = Math.max(0, options.grassMaxAcceleration);
    }

    public initialize(start: Vec3, end: Vec3, targetLength = this.targetLength) {
        this.targetLength = Math.max(this.segmentLength, targetLength);
        this.particles.length = 0;

        const segmentCount = this.getDesiredSegmentCount();
        const direction = Vec3.subtract(new Vec3(), end, start);
        if (direction.lengthSqr() < MIN_LENGTH) {
            direction.set(1, 0, 0);
        } else {
            direction.normalize();
        }

        for (let i = 0; i <= segmentCount; i++) {
            const t = i / segmentCount;
            const position = new Vec3(
                start.x + (end.x - start.x) * t,
                start.y + (end.y - start.y) * t,
                start.z + (end.z - start.z) * t,
            );
            this.particles.push({
                position,
                previousPosition: position.clone(),
                velocity: new Vec3(),
                invMass: 1,
            });
        }
    }

    public setStartAnchor(position: Vec3 | null) {
        this._hasStartAnchor = !!position;
        if (position) this._startAnchor.set(position);
    }

    public setEndAnchor(position: Vec3 | null) {
        this._hasEndAnchor = !!position;
        if (position) this._endAnchor.set(position);
    }

    public setTargetLength(length: number) {
        this.targetLength = Math.max(this.segmentLength, length);
        this.resizeParticleChain();
    }

    public simulate(dt: number, boxes: RopeColliderData[]) {
        if (this.particles.length < 2 || dt <= 0) {
            return;
        }

        this.resizeParticleChain();
        this.applyAnchorMasses();
        this.resetRigidBodyImpulses(boxes);
        this.beginSelfCollisionContacts();

        for (const particle of this.particles) {
            particle.previousPosition.set(particle.position);
            if (particle.invMass === 0) {
                particle.velocity.set(0, 0, 0);
                continue;
            }

            particle.velocity.x += this.gravity.x * dt;
            particle.velocity.y += this.gravity.y * dt;
            particle.velocity.z += this.gravity.z * dt;
            this.applyGrassInteraction(particle, dt);
            particle.position.x += particle.velocity.x * dt;
            particle.position.y += particle.velocity.y * dt;
            particle.position.z += particle.velocity.z * dt;
        }

        this.applyAnchors();
        this.pullEndTowardAnchor(dt);

        for (let i = 0; i < this.solverIterations; i++) {
            this.solveDistanceConstraints();
            this.solveBendConstraints();
            this.applyAnchors();
        }

        const collisionPasses = Math.max(this.collisionIterations, this.selfCollisionIterations);
        for (let pass = 0; pass < collisionPasses; pass++) {
            if (pass < this.collisionIterations) {
                this.solveBoxCollisions(boxes, dt);
            }
            if (pass < this.selfCollisionIterations) {
                this.solveSelfCollisions(dt);
                this.solveDistanceConstraints();
            }
            this.applyAnchors();
        }
        this.endSelfCollisionContacts();

        for (const particle of this.particles) {
            if (particle.invMass === 0) {
                particle.velocity.set(0, 0, 0);
                continue;
            }

            particle.velocity.x = (particle.position.x - particle.previousPosition.x) / dt * this.damping;
            particle.velocity.y = (particle.position.y - particle.previousPosition.y) / dt * this.damping;
            particle.velocity.z = (particle.position.z - particle.previousPosition.z) / dt * this.damping;
        }

        this.applyRigidBodyImpulses(boxes);
    }

    public getPositions(out: Vec3[]) {
        out.length = this.particles.length;
        for (let i = 0; i < this.particles.length; i++) {
            if (!out[i]) out[i] = new Vec3();
            out[i].set(this.particles[i].position);
        }
        return out;
    }

    private applyGrassInteraction(particle: RopeParticle, dt: number) {
        if (
            !this.grassInteractionEnabled ||
            !this.grassReactionSampler ||
            this.grassMaxAcceleration <= 0 ||
            particle.invMass <= 0 ||
            dt <= 0
        ) {
            return;
        }

        const density = this.grassReactionSampler(particle.position, particle.velocity, this.ropeRadius, this._grassForce);
        if (density <= 0 || this._grassForce.lengthSqr() <= MIN_LENGTH) {
            return;
        }

        this._grassForce.multiplyScalar(1 / this.grassRopeWeight);
        const accelerationLength = this._grassForce.length();
        if (accelerationLength > this.grassMaxAcceleration) {
            this._grassForce.multiplyScalar(this.grassMaxAcceleration / accelerationLength);
        }

        Vec3.scaleAndAdd(particle.velocity, particle.velocity, this._grassForce, dt);
    }

    private getDesiredSegmentCount() {
        return Math.max(2, Math.ceil(this.targetLength / Math.max(0.02, this.segmentLength)));
    }

    private getRestLength() {
        return this.targetLength / this.getDesiredSegmentCount();
    }

    private resizeParticleChain() {
        const desiredCount = this.getDesiredSegmentCount() + 1;
        if (this.particles.length === 0) {
            const start = this._hasStartAnchor ? this._startAnchor : new Vec3();
            const end = this._hasEndAnchor ? this._endAnchor : new Vec3(this.targetLength, 0, 0);
            this.initialize(start, end, this.targetLength);
            return;
        }

        while (this.particles.length < desiredCount) {
            this.insertParticleNearTail();
        }

        while (this.particles.length > desiredCount && this.particles.length > 2) {
            const removeIndex = this._hasEndAnchor ? this.particles.length - 2 : this.particles.length - 1;
            this.particles.splice(removeIndex, 1);
        }
    }

    private insertParticleNearTail() {
        const count = this.particles.length;
        const tail = this.particles[count - 1];
        const beforeTail = this.particles[Math.max(0, count - 2)];
        const position = new Vec3();

        if (this._hasEndAnchor && count >= 2) {
            Vec3.lerp(position, beforeTail.position, tail.position, 0.5);
            this.particles.splice(count - 1, 0, {
                position,
                previousPosition: position.clone(),
                velocity: beforeTail.velocity.clone(),
                invMass: 1,
            });
            return;
        }

        const direction = Vec3.subtract(new Vec3(), tail.position, beforeTail.position);
        if (direction.lengthSqr() < MIN_LENGTH) {
            direction.set(1, 0, 0);
        } else {
            direction.normalize();
        }
        Vec3.scaleAndAdd(position, tail.position, direction, this.segmentLength);
        this.particles.push({
            position,
            previousPosition: position.clone(),
            velocity: tail.velocity.clone(),
            invMass: 1,
        });
    }

    private applyAnchorMasses() {
        if (this.particles.length === 0) {
            return;
        }

        for (const particle of this.particles) {
            particle.invMass = 1;
        }
        if (this._hasStartAnchor) this.particles[0].invMass = 0;
        if (this._hasEndAnchor && this.pinEndAnchor) this.particles[this.particles.length - 1].invMass = 0;
    }

    private applyAnchors() {
        if (this.particles.length === 0) {
            return;
        }

        if (this._hasStartAnchor) {
            this.particles[0].position.set(this._startAnchor);
        }
        if (this._hasEndAnchor && this.pinEndAnchor) {
            this.particles[this.particles.length - 1].position.set(this._endAnchor);
        }
    }

    private pullEndTowardAnchor(dt: number) {
        if (
            !this._hasEndAnchor ||
            this.pinEndAnchor ||
            this.particles.length === 0 ||
            this.endAnchorPullStiffness <= 0 ||
            this.endAnchorMaxPullSpeed <= 0 ||
            dt <= 0
        ) {
            return;
        }

        const tail = this.particles[this.particles.length - 1];
        if (tail.invMass <= 0) {
            return;
        }

        const delta = Vec3.subtract(new Vec3(), this._endAnchor, tail.position);
        const distance = delta.length();
        if (distance < MIN_LENGTH) {
            return;
        }

        const maxStep = this.endAnchorMaxPullSpeed * dt;
        const step = Math.min(distance * this.endAnchorPullStiffness, maxStep);
        delta.multiplyScalar(step / distance);
        Vec3.add(tail.position, tail.position, delta);
    }

    private solveDistanceConstraints() {
        const restLength = this.getRestLength();
        for (let i = 0; i < this.particles.length - 1; i++) {
            this.solveDistance(i, i + 1, restLength, this.stretchStiffness);
        }
    }

    private solveBendConstraints() {
        const restLength = this.getRestLength() * 2;
        for (let i = 0; i < this.particles.length - 2; i++) {
            this.solveDistance(i, i + 2, restLength, this.bendStiffness);
        }
    }

    private solveDistance(i0: number, i1: number, restLength: number, stiffness: number) {
        if (stiffness <= 0) {
            return;
        }

        const p0 = this.particles[i0];
        const p1 = this.particles[i1];
        const w0 = p0.invMass;
        const w1 = p1.invMass;
        const weightSum = w0 + w1;
        if (weightSum <= 0) {
            return;
        }

        const delta = Vec3.subtract(new Vec3(), p1.position, p0.position);
        const length = delta.length();
        if (length < MIN_LENGTH) {
            return;
        }

        const correctionMagnitude = (length - restLength) * stiffness / weightSum;
        delta.multiplyScalar(correctionMagnitude / length);

        if (w0 > 0) Vec3.scaleAndAdd(p0.position, p0.position, delta, w0);
        if (w1 > 0) Vec3.scaleAndAdd(p1.position, p1.position, delta, -w1);
    }

    private solveBoxCollisions(boxes: RopeColliderData[], dt: number) {
        for (const particle of this.particles) {
            for (const box of boxes) {
                if (box.type === 'box') {
                    this.solveParticleBoxCollision(particle, box, dt);
                } else {
                    this.solveParticleSphereCollision(particle, box, dt);
                }
            }
        }

        for (let segmentIndex = 0; segmentIndex < this.particles.length - 1; segmentIndex++) {
            const p0 = this.particles[segmentIndex];
            const p1 = this.particles[segmentIndex + 1];
            for (const box of boxes) {
                if (box.type === 'box') {
                    this.solveSegmentBoxCollision(p0, p1, box, dt);
                } else {
                    this.solveSegmentSphereCollision(p0, p1, box, dt);
                }
            }
        }
    }

    private beginSelfCollisionContacts() {
        for (const contact of this._selfCollisionContacts.values()) {
            contact.touched = false;
        }
    }

    private endSelfCollisionContacts() {
        for (const [key, contact] of this._selfCollisionContacts) {
            if (contact.touched) {
                contact.age = 0;
                continue;
            }

            contact.age++;
            if (contact.age > this.selfCollisionNormalCacheFrames) {
                this._selfCollisionContacts.delete(key);
            }
        }
    }

    private solveSelfCollisions(dt: number) {
        if (!this.selfCollisionEnabled || this.selfCollisionStiffness <= 0 || this.selfCollisionRadiusScale <= 0) {
            return;
        }

        const segmentCount = this.particles.length - 1;
        if (segmentCount < 3) {
            return;
        }

        const minDistance = this.ropeRadius * 2 * this.selfCollisionRadiusScale;
        const minDistanceSqr = minDistance * minDistance;
        const skip = Math.max(1, this.selfCollisionSegmentSkip);

        for (let i = 0; i < segmentCount; i++) {
            const a0 = this.particles[i];
            const a1 = this.particles[i + 1];

            for (let j = i + skip + 1; j < segmentCount; j++) {
                const b0 = this.particles[j];
                const b1 = this.particles[j + 1];
                this.solveSegmentSegmentSelfCollision(i, j, a0, a1, b0, b1, minDistance, minDistanceSqr, dt);
            }
        }
    }

    private solveSegmentSegmentSelfCollision(
        segmentA: number,
        segmentB: number,
        a0: RopeParticle,
        a1: RopeParticle,
        b0: RopeParticle,
        b1: RopeParticle,
        minDistance: number,
        minDistanceSqr: number,
        dt: number,
    ) {
        const closest = this.getClosestSegmentParameters(a0.position, a1.position, b0.position, b1.position);
        const u = closest.s;
        const v = closest.t;
        const au = 1 - u;
        const bu = u;
        const av = 1 - v;
        const bv = v;
        const wa0 = a0.invMass;
        const wa1 = a1.invMass;
        const wb0 = b0.invMass;
        const wb1 = b1.invMass;
        const denominator = au * au * wa0 + bu * bu * wa1 + av * av * wb0 + bv * bv * wb1;
        if (denominator <= 0) {
            return;
        }

        const pointA = Vec3.lerp(new Vec3(), a0.position, a1.position, u);
        const pointB = Vec3.lerp(new Vec3(), b0.position, b1.position, v);
        const normal = Vec3.subtract(new Vec3(), pointA, pointB);
        let distanceSqr = normal.lengthSqr();
        if (distanceSqr >= minDistanceSqr) {
            return;
        }

        let distance = Math.sqrt(distanceSqr);
        if (distance < MIN_LENGTH) {
            this.getSelfCollisionFallbackNormal(normal, a0.position, a1.position, b0.position, b1.position);
            distance = MIN_LENGTH;
        } else {
            normal.multiplyScalar(1 / distance);
        }
        this.stabilizeSelfCollisionNormal(segmentA, segmentB, normal);

        const correctionMagnitude = (minDistance - distance) * this.selfCollisionStiffness / denominator;
        const correction = normal.clone().multiplyScalar(correctionMagnitude);
        this.applyWeightedSelfCollisionCorrection(a0, correction, au * wa0);
        this.applyWeightedSelfCollisionCorrection(a1, correction, bu * wa1);
        this.applyWeightedSelfCollisionCorrection(b0, correction, -av * wb0);
        this.applyWeightedSelfCollisionCorrection(b1, correction, -bv * wb1);
        this.applySelfCollisionFriction(a0, a1, b0, b1, u, v, normal, denominator, dt);
    }

    private applyWeightedSelfCollisionCorrection(particle: RopeParticle, correction: Vec3, weight: number) {
        if (weight === 0) {
            return;
        }

        Vec3.scaleAndAdd(particle.position, particle.position, correction, weight);
        Vec3.scaleAndAdd(particle.previousPosition, particle.previousPosition, correction, weight);
    }

    private stabilizeSelfCollisionNormal(segmentA: number, segmentB: number, normal: Vec3) {
        if (this.selfCollisionNormalCacheFrames <= 0) {
            return;
        }

        const key = `${segmentA}:${segmentB}`;
        let contact = this._selfCollisionContacts.get(key);
        if (!contact) {
            contact = {
                normal: normal.clone(),
                age: 0,
                touched: true,
            };
            this._selfCollisionContacts.set(key, contact);
            return;
        }

        contact.touched = true;
        if (Vec3.dot(normal, contact.normal) < 0) {
            normal.multiplyScalar(-1);
        }

        const blend = this.selfCollisionNormalCacheBlend * Math.max(0, 1 - contact.age / Math.max(1, this.selfCollisionNormalCacheFrames));
        if (blend > 0) {
            normal.set(
                normal.x * (1 - blend) + contact.normal.x * blend,
                normal.y * (1 - blend) + contact.normal.y * blend,
                normal.z * (1 - blend) + contact.normal.z * blend,
            );
            if (normal.lengthSqr() > MIN_LENGTH) {
                normal.normalize();
            }
        }

        contact.normal.set(normal);
        contact.age = 0;
    }

    private applySelfCollisionFriction(
        a0: RopeParticle,
        a1: RopeParticle,
        b0: RopeParticle,
        b1: RopeParticle,
        u: number,
        v: number,
        normal: Vec3,
        denominator: number,
        dt: number,
    ) {
        if (
            dt <= 0 ||
            denominator <= 0 ||
            (this.selfCollisionDynamicFriction <= 0 && this.selfCollisionStaticFriction <= 0)
        ) {
            return;
        }

        const au = 1 - u;
        const bu = u;
        const av = 1 - v;
        const bv = v;
        const velocityA = this.getSegmentContactVelocity(a0, a1, u, dt);
        const velocityB = this.getSegmentContactVelocity(b0, b1, v, dt);
        const relativeVelocity = Vec3.subtract(new Vec3(), velocityA, velocityB);
        const normalSpeed = Vec3.dot(relativeVelocity, normal);
        Vec3.scaleAndAdd(relativeVelocity, relativeVelocity, normal, -normalSpeed);

        const tangentSpeed = relativeVelocity.length();
        if (tangentSpeed < MIN_LENGTH) {
            return;
        }

        let friction = this.selfCollisionDynamicFriction;
        if (tangentSpeed <= this.selfCollisionStaticFrictionSpeed) {
            friction = Math.max(friction, this.selfCollisionStaticFriction);
        }
        friction = Math.min(1, friction);
        if (friction <= 0) {
            return;
        }

        relativeVelocity.multiplyScalar(-friction / denominator);
        this.applyWeightedSelfCollisionVelocity(a0, relativeVelocity, au * a0.invMass, dt);
        this.applyWeightedSelfCollisionVelocity(a1, relativeVelocity, bu * a1.invMass, dt);
        this.applyWeightedSelfCollisionVelocity(b0, relativeVelocity, -av * b0.invMass, dt);
        this.applyWeightedSelfCollisionVelocity(b1, relativeVelocity, -bv * b1.invMass, dt);
    }

    private getSegmentContactVelocity(p0: RopeParticle, p1: RopeParticle, t: number, dt: number) {
        const velocity0 = this.getParticleVelocity(p0, dt);
        const velocity1 = this.getParticleVelocity(p1, dt);
        return Vec3.lerp(velocity0, velocity0, velocity1, t);
    }

    private applyWeightedSelfCollisionVelocity(particle: RopeParticle, deltaVelocity: Vec3, weight: number, dt: number) {
        if (weight === 0 || particle.invMass <= 0) {
            return;
        }

        Vec3.scaleAndAdd(particle.previousPosition, particle.previousPosition, deltaVelocity, -weight * dt);
    }

    private getClosestSegmentParameters(p1: Vec3, q1: Vec3, p2: Vec3, q2: Vec3) {
        const d1 = Vec3.subtract(new Vec3(), q1, p1);
        const d2 = Vec3.subtract(new Vec3(), q2, p2);
        const r = Vec3.subtract(new Vec3(), p1, p2);
        const a = Vec3.dot(d1, d1);
        const e = Vec3.dot(d2, d2);
        const f = Vec3.dot(d2, r);
        let s = 0;
        let t = 0;

        if (a <= MIN_LENGTH && e <= MIN_LENGTH) {
            return { s, t };
        }

        if (a <= MIN_LENGTH) {
            t = clamp01(f / e);
            return { s, t };
        }

        const c = Vec3.dot(d1, r);
        if (e <= MIN_LENGTH) {
            s = clamp01(-c / a);
            return { s, t };
        }

        const b = Vec3.dot(d1, d2);
        const denominator = a * e - b * b;
        if (Math.abs(denominator) > MIN_LENGTH) {
            s = clamp01((b * f - c * e) / denominator);
        }

        t = (b * s + f) / e;
        if (t < 0) {
            t = 0;
            s = clamp01(-c / a);
        } else if (t > 1) {
            t = 1;
            s = clamp01((b - c) / a);
        }

        return { s, t };
    }

    private getSelfCollisionFallbackNormal(out: Vec3, a0: Vec3, a1: Vec3, b0: Vec3, b1: Vec3) {
        const da = Vec3.subtract(new Vec3(), a1, a0);
        const db = Vec3.subtract(new Vec3(), b1, b0);
        Vec3.cross(out, da, db);
        if (out.lengthSqr() < MIN_LENGTH) {
            const centerA = Vec3.lerp(new Vec3(), a0, a1, 0.5);
            const centerB = Vec3.lerp(new Vec3(), b0, b1, 0.5);
            Vec3.subtract(out, centerA, centerB);
        }
        if (out.lengthSqr() < MIN_LENGTH) {
            out.set(0, 1, 0);
        } else {
            out.normalize();
        }
    }

    private solveParticleBoxCollision(particle: RopeParticle, box: RopeBoxData, dt: number) {
        if (particle.invMass <= 0) {
            return;
        }

        const localPoint = transformPoint(new Vec3(), particle.position, box.worldToLocal);
        const bounds = this.getBoxBounds(box);
        const localCorrection = this.getSphereBoxCorrection(localPoint, bounds.min, bounds.max);
        if (localCorrection.lengthSqr() < MIN_LENGTH) {
            this.solveParticleBoxSweepCollision(particle, box, dt);
            return;
        }

        const contactVelocity = this.getParticleVelocity(particle, dt);
        const worldPoint = transformPoint(new Vec3(), localPoint, box.localToWorld);
        const correctedLocalPoint = Vec3.add(new Vec3(), localPoint, localCorrection);
        const correctedWorldPoint = transformPoint(new Vec3(), correctedLocalPoint, box.localToWorld);
        const correction = Vec3.subtract(new Vec3(), correctedWorldPoint, worldPoint);

        Vec3.add(particle.position, particle.position, correction);
        Vec3.add(particle.previousPosition, particle.previousPosition, correction);
        this.applySurfaceVelocityCorrection(particle, correction, dt);
        this.accumulateRigidBodyImpulse(box, worldPoint, correction, contactVelocity, dt);
    }

    private solveParticleSphereCollision(particle: RopeParticle, sphere: RopeSphereData, dt: number) {
        if (particle.invMass <= 0) {
            return;
        }

        const minDistance = sphere.radius + this.ropeRadius;
        const delta = Vec3.subtract(new Vec3(), particle.position, sphere.worldCenter);
        let distance = delta.length();
        if (distance >= minDistance) {
            return;
        }

        if (distance < MIN_LENGTH) {
            delta.set(0, 1, 0);
            distance = MIN_LENGTH;
        } else {
            delta.multiplyScalar(1 / distance);
        }

        const correction = delta.clone().multiplyScalar(minDistance - distance + COLLISION_SLOP);
        const contactVelocity = this.getParticleVelocity(particle, dt);
        const contactPoint = Vec3.scaleAndAdd(new Vec3(), sphere.worldCenter, delta, sphere.radius);

        Vec3.add(particle.position, particle.position, correction);
        Vec3.add(particle.previousPosition, particle.previousPosition, correction);
        this.applySurfaceVelocityCorrection(particle, correction, dt);
        this.accumulateRigidBodyImpulse(sphere, contactPoint, correction, contactVelocity, dt);
    }

    private solveParticleBoxSweepCollision(particle: RopeParticle, box: RopeBoxData, dt: number) {
        if (!this.continuousCollisionEnabled || dt <= 0) {
            return false;
        }

        const previousLocalPoint = transformPoint(new Vec3(), particle.previousPosition, box.worldToLocal);
        const currentLocalPoint = transformPoint(new Vec3(), particle.position, box.worldToLocal);
        const sweptBounds = this.getExpandedBounds(box);
        const hit = this.sweptPointAabbHit(previousLocalPoint, currentLocalPoint, sweptBounds.min, sweptBounds.max);
        if (!hit.hit) {
            return false;
        }

        const contactVelocity = this.getParticleVelocity(particle, dt);
        const contactWorldPoint = transformPoint(new Vec3(), hit.point, box.localToWorld);
        const correctedLocalPoint = Vec3.scaleAndAdd(new Vec3(), hit.point, hit.normal, COLLISION_SLOP);
        const correctedWorldPoint = transformPoint(new Vec3(), correctedLocalPoint, box.localToWorld);
        const correction = Vec3.subtract(new Vec3(), correctedWorldPoint, particle.position);
        if (correction.lengthSqr() < MIN_LENGTH) {
            return false;
        }

        const worldNormal = Vec3.subtract(new Vec3(), correctedWorldPoint, contactWorldPoint);
        if (worldNormal.lengthSqr() < MIN_LENGTH) {
            return false;
        }
        worldNormal.normalize();
        particle.position.set(correctedWorldPoint);
        this.applySurfaceVelocityCorrection(particle, worldNormal, dt);
        this.accumulateRigidBodyImpulse(box, contactWorldPoint, worldNormal, contactVelocity, dt);
        return true;
    }

    private solveSegmentBoxCollision(p0: RopeParticle, p1: RopeParticle, box: RopeBoxData, dt: number) {
        const localA = transformPoint(new Vec3(), p0.position, box.worldToLocal);
        const localB = transformPoint(new Vec3(), p1.position, box.worldToLocal);
        const bounds = this.getBoxBounds(box);
        const sweptBounds = this.getExpandedBounds(box);
        const segmentLength = Vec3.distance(p0.position, p1.position);
        const sampleSpacing = Math.max(0.025, this.ropeRadius * 0.45);
        const steps = Math.max(2, Math.min(6, Math.ceil(segmentLength / sampleSpacing)));
        let corrected = false;

        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            if (this.solveSegmentSampleCollision(p0, p1, localA, localB, t, box, bounds.min, bounds.max, dt)) {
                corrected = true;
            }
        }

        if (corrected) {
            return;
        }

        if (this.solveSegmentBoxSweepCollision(p0, p1, localA, localB, box, dt)) {
            return;
        }

        const hit = this.segmentAabbHit(localA, localB, sweptBounds.min, sweptBounds.max);
        if (hit.hit) {
            this.solveSegmentSampleCollision(p0, p1, localA, localB, hit.t, box, bounds.min, bounds.max, dt);
        }
    }

    private solveSegmentSphereCollision(p0: RopeParticle, p1: RopeParticle, sphere: RopeSphereData, dt: number) {
        const segment = Vec3.subtract(new Vec3(), p1.position, p0.position);
        const segmentLengthSqr = segment.lengthSqr();
        if (segmentLengthSqr <= MIN_LENGTH) {
            return;
        }

        const t = clamp01(Vec3.dot(Vec3.subtract(new Vec3(), sphere.worldCenter, p0.position), segment) / segmentLengthSqr);
        const closest = Vec3.scaleAndAdd(new Vec3(), p0.position, segment, t);
        const delta = Vec3.subtract(new Vec3(), closest, sphere.worldCenter);
        let distance = delta.length();
        const minDistance = sphere.radius + this.ropeRadius;
        if (distance >= minDistance) {
            return;
        }

        if (distance < MIN_LENGTH) {
            delta.set(0, 1, 0);
            distance = MIN_LENGTH;
        } else {
            delta.multiplyScalar(1 / distance);
        }

        const correction = delta.clone().multiplyScalar(minDistance - distance + COLLISION_SLOP);
        const contactVelocity = this.getSegmentVelocity(p0, p1, t, dt);
        const contactPoint = Vec3.scaleAndAdd(new Vec3(), sphere.worldCenter, delta, sphere.radius);

        if (!this.applySegmentPointCorrection(p0, p1, t, correction, dt, delta)) {
            return;
        }

        this.accumulateRigidBodyImpulse(sphere, contactPoint, correction, contactVelocity, dt);
    }

    private solveSegmentBoxSweepCollision(
        p0: RopeParticle,
        p1: RopeParticle,
        localA: Vec3,
        localB: Vec3,
        box: RopeBoxData,
        dt: number,
    ) {
        if (!this.continuousCollisionEnabled || dt <= 0) {
            return false;
        }

        const previousLocalA = transformPoint(new Vec3(), p0.previousPosition, box.worldToLocal);
        const previousLocalB = transformPoint(new Vec3(), p1.previousPosition, box.worldToLocal);
        const sweptBounds = this.getExpandedBounds(box);
        const samples = Math.max(1, this.continuousCollisionSegmentSamples);
        let bestHit: { hit: boolean; t: number; point: Vec3; normal: Vec3 } | null = null;
        let bestSegmentT = 0;

        for (let i = 1; i <= samples; i++) {
            const segmentT = i / (samples + 1);
            const previousLocalPoint = Vec3.lerp(new Vec3(), previousLocalA, previousLocalB, segmentT);
            const currentLocalPoint = Vec3.lerp(new Vec3(), localA, localB, segmentT);
            const hit = this.sweptPointAabbHit(previousLocalPoint, currentLocalPoint, sweptBounds.min, sweptBounds.max);
            if (!hit.hit || (bestHit && hit.t >= bestHit.t)) {
                continue;
            }

            bestHit = hit;
            bestSegmentT = segmentT;
        }

        if (!bestHit) {
            return false;
        }

        const currentLocalPoint = Vec3.lerp(new Vec3(), localA, localB, bestSegmentT);
        const currentWorldPoint = transformPoint(new Vec3(), currentLocalPoint, box.localToWorld);
        const contactWorldPoint = transformPoint(new Vec3(), bestHit.point, box.localToWorld);
        const correctedLocalPoint = Vec3.scaleAndAdd(new Vec3(), bestHit.point, bestHit.normal, COLLISION_SLOP);
        const correctedWorldPoint = transformPoint(new Vec3(), correctedLocalPoint, box.localToWorld);
        const correction = Vec3.subtract(new Vec3(), correctedWorldPoint, currentWorldPoint);
        if (correction.lengthSqr() < MIN_LENGTH) {
            return false;
        }

        const worldNormal = Vec3.subtract(new Vec3(), correctedWorldPoint, contactWorldPoint);
        if (worldNormal.lengthSqr() < MIN_LENGTH) {
            return false;
        }
        worldNormal.normalize();

        const contactVelocity = this.getSegmentVelocity(p0, p1, bestSegmentT, dt);
        if (!this.applySegmentPointCorrection(p0, p1, bestSegmentT, correction, dt, worldNormal)) {
            return false;
        }

        this.accumulateRigidBodyImpulse(box, contactWorldPoint, worldNormal, contactVelocity, dt);
        return true;
    }

    private solveSegmentSampleCollision(
        p0: RopeParticle,
        p1: RopeParticle,
        localA: Vec3,
        localB: Vec3,
        t: number,
        box: RopeBoxData,
        min: Vec3,
        max: Vec3,
        dt: number,
    ) {
        const localPoint = Vec3.lerp(new Vec3(), localA, localB, t);
        const localCorrection = this.getSphereBoxCorrection(localPoint, min, max);
        if (localCorrection.lengthSqr() < MIN_LENGTH) {
            return false;
        }

        const contactVelocity = this.getSegmentVelocity(p0, p1, t, dt);
        const worldPoint = transformPoint(new Vec3(), localPoint, box.localToWorld);
        const correctedLocalPoint = Vec3.add(new Vec3(), localPoint, localCorrection);
        const correctedWorldPoint = transformPoint(new Vec3(), correctedLocalPoint, box.localToWorld);
        const correction = Vec3.subtract(new Vec3(), correctedWorldPoint, worldPoint);

        if (!this.applySegmentPointCorrection(p0, p1, t, correction, dt)) {
            return false;
        }

        this.accumulateRigidBodyImpulse(box, worldPoint, correction, contactVelocity, dt);
        return true;
    }

    private getBoxBounds(box: RopeBoxData) {
        return {
            min: new Vec3(
                box.center.x - box.halfExtents.x,
                box.center.y - box.halfExtents.y,
                box.center.z - box.halfExtents.z,
            ),
            max: new Vec3(
                box.center.x + box.halfExtents.x,
                box.center.y + box.halfExtents.y,
                box.center.z + box.halfExtents.z,
            ),
        };
    }

    private getExpandedBounds(box: RopeBoxData) {
        return {
            min: new Vec3(
                box.center.x - box.halfExtents.x - this.ropeRadius,
                box.center.y - box.halfExtents.y - this.ropeRadius,
                box.center.z - box.halfExtents.z - this.ropeRadius,
            ),
            max: new Vec3(
                box.center.x + box.halfExtents.x + this.ropeRadius,
                box.center.y + box.halfExtents.y + this.ropeRadius,
                box.center.z + box.halfExtents.z + this.ropeRadius,
            ),
        };
    }

    private segmentAabbHit(a: Vec3, b: Vec3, min: Vec3, max: Vec3) {
        let tEnter = 0;
        let tExit = 1;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;

        const slab = (origin: number, direction: number, slabMin: number, slabMax: number) => {
            if (Math.abs(direction) < MIN_LENGTH) {
                return origin >= slabMin && origin <= slabMax;
            }

            let t0 = (slabMin - origin) / direction;
            let t1 = (slabMax - origin) / direction;
            if (t0 > t1) {
                const temp = t0;
                t0 = t1;
                t1 = temp;
            }
            tEnter = Math.max(tEnter, t0);
            tExit = Math.min(tExit, t1);
            return tEnter <= tExit;
        };

        if (!slab(a.x, dx, min.x, max.x)) return { hit: false, t: 0 };
        if (!slab(a.y, dy, min.y, max.y)) return { hit: false, t: 0 };
        if (!slab(a.z, dz, min.z, max.z)) return { hit: false, t: 0 };

        return { hit: true, t: clamp01((Math.max(0, tEnter) + Math.min(1, tExit)) * 0.5) };
    }

    private sweptPointAabbHit(start: Vec3, end: Vec3, min: Vec3, max: Vec3) {
        if (this.isPointInsideAabb(start, min, max)) {
            return { hit: false, t: 0, point: new Vec3(), normal: new Vec3() };
        }

        let tEnter = 0;
        let tExit = 1;
        let normalAxis = -1;
        let normalSign = 0;
        const direction = Vec3.subtract(new Vec3(), end, start);

        const slab = (axis: number, origin: number, delta: number, slabMin: number, slabMax: number) => {
            if (Math.abs(delta) < MIN_LENGTH) {
                return origin >= slabMin && origin <= slabMax;
            }

            const invDelta = 1 / delta;
            let tNear = (slabMin - origin) * invDelta;
            let tFar = (slabMax - origin) * invDelta;
            let nearSign = -1;
            if (tNear > tFar) {
                const temp = tNear;
                tNear = tFar;
                tFar = temp;
                nearSign = 1;
            }

            if (tNear > tEnter) {
                tEnter = tNear;
                normalAxis = axis;
                normalSign = nearSign;
            }

            tExit = Math.min(tExit, tFar);
            return tEnter <= tExit;
        };

        if (!slab(0, start.x, direction.x, min.x, max.x)) return { hit: false, t: 0, point: new Vec3(), normal: new Vec3() };
        if (!slab(1, start.y, direction.y, min.y, max.y)) return { hit: false, t: 0, point: new Vec3(), normal: new Vec3() };
        if (!slab(2, start.z, direction.z, min.z, max.z)) return { hit: false, t: 0, point: new Vec3(), normal: new Vec3() };

        if (tEnter < 0 || tEnter > 1 || normalAxis < 0) {
            return { hit: false, t: 0, point: new Vec3(), normal: new Vec3() };
        }

        const point = Vec3.scaleAndAdd(new Vec3(), start, direction, tEnter);
        const normal = new Vec3();
        if (normalAxis === 0) normal.x = normalSign;
        if (normalAxis === 1) normal.y = normalSign;
        if (normalAxis === 2) normal.z = normalSign;
        return { hit: true, t: tEnter, point, normal };
    }

    private isPointInsideAabb(point: Vec3, min: Vec3, max: Vec3) {
        return (
            point.x >= min.x && point.x <= max.x &&
            point.y >= min.y && point.y <= max.y &&
            point.z >= min.z && point.z <= max.z
        );
    }

    private getSphereBoxCorrection(point: Vec3, min: Vec3, max: Vec3) {
        const closest = new Vec3(
            clamp(point.x, min.x, max.x),
            clamp(point.y, min.y, max.y),
            clamp(point.z, min.z, max.z),
        );
        const fromBox = Vec3.subtract(new Vec3(), point, closest);
        const distanceSqr = fromBox.lengthSqr();
        const radius = this.ropeRadius;

        if (distanceSqr > MIN_LENGTH) {
            const distance = Math.sqrt(distanceSqr);
            if (distance >= radius) {
                return new Vec3();
            }

            fromBox.multiplyScalar((radius - distance + COLLISION_SLOP) / distance);
            return fromBox;
        }

        return this.getInsideBoxExitCorrection(point, min, max, radius);
    }

    private getInsideBoxExitCorrection(point: Vec3, min: Vec3, max: Vec3, radius: number) {
        if (
            point.x < min.x || point.x > max.x ||
            point.y < min.y || point.y > max.y ||
            point.z < min.z || point.z > max.z
        ) {
            return new Vec3();
        }

        const distances = [
            { axis: 0, sign: -1, value: point.x - min.x },
            { axis: 0, sign: 1, value: max.x - point.x },
            { axis: 1, sign: -1, value: point.y - min.y },
            { axis: 1, sign: 1, value: max.y - point.y },
            { axis: 2, sign: -1, value: point.z - min.z },
            { axis: 2, sign: 1, value: max.z - point.z },
        ];
        distances.sort((a, b) => a.value - b.value);

        const best = distances[0];
        const amount = Math.max(0, best.value) + radius + COLLISION_SLOP;
        const correction = new Vec3();
        if (best.axis === 0) correction.x = best.sign * amount;
        if (best.axis === 1) correction.y = best.sign * amount;
        if (best.axis === 2) correction.z = best.sign * amount;
        return correction;
    }

    private resetRigidBodyImpulses(boxes: RopeColliderData[]) {
        for (const box of boxes) {
            box.rigidBodyImpulse.set(0, 0, 0);
            box.rigidBodyFrictionImpulse.set(0, 0, 0);
            box.rigidBodyContactPoint.set(0, 0, 0);
            box.rigidBodyContactWeight = 0;
        }
    }

    private accumulateRigidBodyImpulse(box: RopeColliderData, contactPoint: Vec3, ropeCorrection: Vec3, contactVelocity: Vec3, dt: number) {
        if (!this.rigidBodyInteraction || !box.rigidBody || dt <= 0) {
            return;
        }

        const body = box.rigidBody;
        if (!body.enabled || !(body as any).isDynamic) {
            return;
        }

        const normal = ropeCorrection.clone();
        if (normal.lengthSqr() < MIN_LENGTH) {
            return;
        }
        normal.normalize();

        const normalImpulse = ropeCorrection.clone();
        normalImpulse.multiplyScalar(-this.rigidBodyImpulseScale / dt);
        const normalWeight = normalImpulse.length();
        if (normalWeight > MIN_LENGTH) {
            Vec3.add(box.rigidBodyImpulse, box.rigidBodyImpulse, normalImpulse);
        }

        const frictionImpulse = this.getRigidBodyFrictionImpulse(body, contactVelocity, normal);
        const frictionWeight = frictionImpulse.length();
        if (frictionWeight > MIN_LENGTH) {
            Vec3.add(box.rigidBodyFrictionImpulse, box.rigidBodyFrictionImpulse, frictionImpulse);
        }

        const totalWeight = normalWeight + frictionWeight;
        if (totalWeight > MIN_LENGTH) {
            Vec3.scaleAndAdd(box.rigidBodyContactPoint, box.rigidBodyContactPoint, contactPoint, totalWeight);
            box.rigidBodyContactWeight += totalWeight;
        }
    }

    private applyRigidBodyImpulses(boxes: RopeColliderData[]) {
        if (!this.rigidBodyInteraction || this.maxRigidBodyImpulse <= 0) {
            return;
        }

        for (const box of boxes) {
            const body = box.rigidBody;
            if (!body || !body.enabled || !(body as any).isDynamic || box.rigidBodyContactWeight <= 0) {
                continue;
            }

            const normalImpulse = box.rigidBodyImpulse.clone();
            const normalImpulseLength = normalImpulse.length();
            if (normalImpulseLength > this.maxRigidBodyImpulse) {
                normalImpulse.multiplyScalar(this.maxRigidBodyImpulse / normalImpulseLength);
            }

            const frictionImpulse = box.rigidBodyFrictionImpulse.clone();
            const frictionImpulseLength = frictionImpulse.length();
            if (frictionImpulseLength > this.maxRigidBodyFrictionImpulse) {
                frictionImpulse.multiplyScalar(this.maxRigidBodyFrictionImpulse / frictionImpulseLength);
            }

            const impulse = Vec3.add(new Vec3(), normalImpulse, frictionImpulse);
            if (impulse.lengthSqr() < MIN_LENGTH) {
                continue;
            }

            const contactPoint = box.rigidBodyContactPoint.clone();
            contactPoint.multiplyScalar(1 / box.rigidBodyContactWeight);

            const bodyCenter = body.node.getWorldPosition(new Vec3());
            const relativePoint = Vec3.subtract(new Vec3(), contactPoint, bodyCenter);
            body.wakeUp();
            body.applyImpulse(impulse, relativePoint);
        }
    }

    private getRigidBodyFrictionImpulse(body: RigidBody, contactVelocity: Vec3, normal: Vec3) {
        if (this.rigidBodyFriction <= 0 || this.rigidBodyFrictionImpulseScale <= 0 || this.maxRigidBodyFrictionImpulse <= 0) {
            return new Vec3();
        }

        const bodyVelocity = new Vec3();
        body.getLinearVelocity(bodyVelocity);
        const relativeVelocity = Vec3.subtract(new Vec3(), contactVelocity, bodyVelocity);
        const normalSpeed = Vec3.dot(relativeVelocity, normal);
        Vec3.scaleAndAdd(relativeVelocity, relativeVelocity, normal, -normalSpeed);

        if (relativeVelocity.lengthSqr() < MIN_LENGTH) {
            return new Vec3();
        }

        relativeVelocity.multiplyScalar(this.rigidBodyFriction * this.rigidBodyFrictionImpulseScale);
        return relativeVelocity;
    }

    private getParticleVelocity(particle: RopeParticle, dt: number) {
        const velocity = Vec3.subtract(new Vec3(), particle.position, particle.previousPosition);
        velocity.multiplyScalar(1 / dt);
        return velocity;
    }

    private getSegmentVelocity(p0: RopeParticle, p1: RopeParticle, t: number, dt: number) {
        const v0 = this.getParticleVelocity(p0, dt);
        const v1 = this.getParticleVelocity(p1, dt);
        return Vec3.lerp(v0, v0, v1, t);
    }

    private applySegmentPointCorrection(p0: RopeParticle, p1: RopeParticle, t: number, correction: Vec3, dt: number, surfaceNormal?: Vec3) {
        const a = 1 - t;
        const b = t;
        const w0 = p0.invMass;
        const w1 = p1.invMass;
        const denominator = a * a * w0 + b * b * w1;
        if (denominator <= 0) {
            return false;
        }

        let applied = false;
        const velocityCorrection = surfaceNormal ?? correction;
        if (w0 > 0) {
            const scale = a * w0 / denominator;
            Vec3.scaleAndAdd(p0.position, p0.position, correction, scale);
            Vec3.scaleAndAdd(p0.previousPosition, p0.previousPosition, correction, scale);
            this.applySurfaceVelocityCorrection(p0, velocityCorrection, dt);
            applied = true;
        }
        if (w1 > 0) {
            const scale = b * w1 / denominator;
            Vec3.scaleAndAdd(p1.position, p1.position, correction, scale);
            Vec3.scaleAndAdd(p1.previousPosition, p1.previousPosition, correction, scale);
            this.applySurfaceVelocityCorrection(p1, velocityCorrection, dt);
            applied = true;
        }
        return applied;
    }

    private applySurfaceVelocityCorrection(particle: RopeParticle, correction: Vec3, dt: number) {
        if (dt <= 0 || correction.lengthSqr() < MIN_LENGTH) {
            return;
        }

        const normal = correction.clone().normalize();
        const velocity = Vec3.subtract(new Vec3(), particle.position, particle.previousPosition);
        velocity.multiplyScalar(1 / dt);

        const normalSpeed = Vec3.dot(velocity, normal);
        if (normalSpeed < 0) {
            Vec3.scaleAndAdd(velocity, velocity, normal, -normalSpeed);
        }

        this.applySurfaceFrictionToVelocity(velocity, normal);
        particle.previousPosition.set(
            particle.position.x - velocity.x * dt,
            particle.position.y - velocity.y * dt,
            particle.position.z - velocity.z * dt,
        );
    }

    private applySurfaceFrictionToVelocity(velocity: Vec3, normal: Vec3) {
        const tangentVelocity = Vec3.scaleAndAdd(new Vec3(), velocity, normal, -Vec3.dot(velocity, normal));
        const tangentSpeed = tangentVelocity.length();
        if (tangentSpeed < MIN_LENGTH) {
            return;
        }

        let friction = this.surfaceDynamicFriction;
        if (tangentSpeed <= this.surfaceStaticFrictionSpeed) {
            friction = Math.max(friction, this.surfaceStaticFriction);
        }

        if (friction <= 0) {
            return;
        }

        const removeScale = Math.min(1, friction);
        Vec3.scaleAndAdd(velocity, velocity, tangentVelocity, -removeScale);
    }
}
