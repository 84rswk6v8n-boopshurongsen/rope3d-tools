import { _decorator, Component, Node, Vec3 } from 'cc';
import { RopeBoxColliderProvider } from './RopeBoxColliderProvider';
import { RopeColliderData, RopeSolver3D } from './RopeSolver3D';
import { RopeTubeRenderer } from './RopeTubeRenderer';

const { ccclass, property, requireComponent, menu } = _decorator;

const GROUP_ANCHOR = 'Anchor';
const GROUP_BASIC = 'Basic';
const GROUP_SOLVER = 'Solver';
const GROUP_COLLISION = 'Collision';
const GROUP_SELF_COLLISION = 'Self Collision';
const GROUP_RIGID_BODY = 'Rigid Body Interaction';
const GROUP_GRASS = 'Grass Interaction';
const GROUP_TIME_STEP = 'Time Step';

type GrassReactionSurface = Component & {
    reactionEnabled?: boolean;
    sampleReaction?: (
        worldPosition: Readonly<Vec3>,
        worldVelocity: Readonly<Vec3>,
        radius: number,
        outForce: Vec3,
        options?: {
            supportScale?: number;
            dragScale?: number;
            recoveryScale?: number;
        },
    ) => number;
};

@ccclass('Rope3D')
@menu('Rope3D/Rope 3D')
@requireComponent(RopeTubeRenderer)
export class Rope3D extends Component {
    @property({ type: Node, group: GROUP_ANCHOR, displayName: 'Start Anchor' })
    public startAnchor: Node | null = null;

    @property({ type: Node, group: GROUP_ANCHOR, displayName: 'End Anchor' })
    public endAnchor: Node | null = null;

    @property({ type: Node, group: GROUP_COLLISION, displayName: 'Collider Root' })
    public colliderRoot: Node | null = null;

    @property({ group: GROUP_BASIC, displayName: 'Rope Radius' })
    public ropeRadius = 0.08;

    @property({ group: GROUP_BASIC, displayName: 'Segment Length' })
    public segmentLength = 0.2;

    @property({ group: GROUP_BASIC, displayName: 'Target Length' })
    public targetLength = 7;

    @property({ group: GROUP_ANCHOR, displayName: 'Pin End Anchor' })
    public pinEndAnchor = false;

    @property({ group: GROUP_ANCHOR, displayName: 'End Pull Stiffness' })
    public endAnchorPullStiffness = 0.85;

    @property({ group: GROUP_ANCHOR, displayName: 'End Max Pull Speed' })
    public endAnchorMaxPullSpeed = 2.5;

    @property({ group: GROUP_SOLVER, displayName: 'Gravity Y' })
    public gravityY = -9.8;

    @property({ group: GROUP_SOLVER, displayName: 'Damping' })
    public damping = 0.985;

    @property({ group: GROUP_SOLVER, displayName: 'Stretch Stiffness' })
    public stretchStiffness = 1;

    @property({ group: GROUP_SOLVER, displayName: 'Bend Stiffness' })
    public bendStiffness = 0.32;

    @property({ group: GROUP_SOLVER, displayName: 'Solver Iterations' })
    public solverIterations = 10;

    @property({ group: GROUP_COLLISION, displayName: 'Collision Iterations' })
    public collisionIterations = 4;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Enable Self Collision' })
    public selfCollisionEnabled = true;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Iterations' })
    public selfCollisionIterations = 2;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Radius Scale' })
    public selfCollisionRadiusScale = 1;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Stiffness' })
    public selfCollisionStiffness = 0.85;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Segment Skip' })
    public selfCollisionSegmentSkip = 2;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Dynamic Friction' })
    public selfCollisionDynamicFriction = 0.45;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Static Speed' })
    public selfCollisionStaticFrictionSpeed = 0.35;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Static Friction' })
    public selfCollisionStaticFriction = 0.85;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Normal Blend' })
    public selfCollisionNormalCacheBlend = 0.75;

    @property({ group: GROUP_SELF_COLLISION, displayName: 'Self Collision Normal Frames' })
    public selfCollisionNormalCacheFrames = 8;

    @property({ group: GROUP_COLLISION, displayName: 'Surface Dynamic Friction' })
    public surfaceDynamicFriction = 0.55;

    @property({ group: GROUP_COLLISION, displayName: 'Surface Static Speed' })
    public surfaceStaticFrictionSpeed = 0.35;

    @property({ group: GROUP_COLLISION, displayName: 'Surface Static Friction' })
    public surfaceStaticFriction = 1;

    @property({ group: GROUP_COLLISION, displayName: 'Continuous Collision' })
    public continuousCollisionEnabled = true;

    @property({ group: GROUP_COLLISION, displayName: 'CCD Segment Samples' })
    public continuousCollisionSegmentSamples = 3;

    @property({ group: GROUP_RIGID_BODY, displayName: 'Affect Rigid Bodies' })
    public rigidBodyInteraction = true;

    @property({ group: GROUP_RIGID_BODY, displayName: 'Normal Impulse Scale' })
    public rigidBodyImpulseScale = 0.08;

    @property({ group: GROUP_RIGID_BODY, displayName: 'Max Normal Impulse' })
    public maxRigidBodyImpulse = 0.16;

    @property({ group: GROUP_RIGID_BODY, displayName: 'Rigid Body Friction' })
    public rigidBodyFriction = 0.8;

    @property({ group: GROUP_RIGID_BODY, displayName: 'Friction Impulse Scale' })
    public rigidBodyFrictionImpulseScale = 0.08;

    @property({ group: GROUP_RIGID_BODY, displayName: 'Max Friction Impulse' })
    public maxRigidBodyFrictionImpulse = 0.18;

    @property({ group: GROUP_GRASS, displayName: 'Enable Grass Interaction' })
    public grassInteractionEnabled = true;

    @property({ type: Node, group: GROUP_GRASS, displayName: 'Grass Root' })
    public grassRoot: Node | null = null;

    @property({ group: GROUP_GRASS, displayName: 'Rope Weight' })
    public grassRopeWeight = 1.4;

    @property({ group: GROUP_GRASS, displayName: 'Support Scale' })
    public grassSupportScale = 0.75;

    @property({ group: GROUP_GRASS, displayName: 'Drag Scale' })
    public grassDragScale = 1;

    @property({ group: GROUP_GRASS, displayName: 'Recovery Push Scale' })
    public grassRecoveryScale = 0.65;

    @property({ group: GROUP_GRASS, displayName: 'Max Grass Acceleration' })
    public grassMaxAcceleration = 14;

    @property({ group: GROUP_TIME_STEP, displayName: 'Fixed Dt' })
    public fixedDt = 1 / 60;

    @property({ group: GROUP_TIME_STEP, displayName: 'Max Sub Steps' })
    public maxSubSteps = 4;

    private readonly _solver = new RopeSolver3D();
    private readonly _boxes: RopeColliderData[] = [];
    private readonly _positions: Vec3[] = [];
    private readonly _startWorld = new Vec3();
    private readonly _endWorld = new Vec3();
    private readonly _grassForce = new Vec3();
    private readonly _grassSampleForce = new Vec3();
    private readonly _grassSurfaces: GrassReactionSurface[] = [];
    private _renderer: RopeTubeRenderer | null = null;
    private _accumulator = 0;
    private _initialized = false;

    onLoad() {
        this._renderer = this.getComponent(RopeTubeRenderer);
    }

    start() {
        this.initializeSolver();
    }

    update(dt: number) {
        if (!this._initialized) {
            this.initializeSolver();
        }

        this.syncOptions();
        RopeBoxColliderProvider.collect(this.colliderRoot, this._boxes);
        this.collectGrassSurfaces();

        this._accumulator += Math.min(dt, this.fixedDt * this.maxSubSteps);
        let steps = 0;
        while (this._accumulator >= this.fixedDt && steps < this.maxSubSteps) {
            this.syncAnchors();
            this._solver.simulate(this.fixedDt, this._boxes);
            this._accumulator -= this.fixedDt;
            steps++;
        }

        this._solver.getPositions(this._positions);
        if (this._renderer) {
            this._renderer.radius = this.ropeRadius;
            this._renderer.render(this._positions);
        }
    }

    public resetRope() {
        this._initialized = false;
        this.initializeSolver();
    }

    public getPositionsSnapshot(out: Vec3[] = []) {
        out.length = 0;
        for (const position of this._positions) {
            out.push(position.clone());
        }
        return out;
    }

    public getRopeRadius() {
        return this.ropeRadius;
    }

    private initializeSolver() {
        this.syncOptions();
        const start = this.startAnchor ? this.startAnchor.getWorldPosition(this._startWorld) : new Vec3(-3, 3, 0);
        const end = this.endAnchor ? this.endAnchor.getWorldPosition(this._endWorld) : new Vec3(3, 3, 0);
        this._solver.initialize(start, end, this.targetLength);
        this.syncAnchors();
        this._initialized = true;
    }

    private syncOptions() {
        this.fixedDt = Math.max(1 / 240, this.fixedDt);
        this.maxSubSteps = Math.max(1, Math.floor(this.maxSubSteps));
        this._solver.configure({
            ropeRadius: this.ropeRadius,
            segmentLength: this.segmentLength,
            targetLength: this.targetLength,
            pinEndAnchor: this.pinEndAnchor,
            endAnchorPullStiffness: this.endAnchorPullStiffness,
            endAnchorMaxPullSpeed: this.endAnchorMaxPullSpeed,
            gravity: new Vec3(0, this.gravityY, 0),
            damping: this.damping,
            stretchStiffness: this.stretchStiffness,
            bendStiffness: this.bendStiffness,
            solverIterations: this.solverIterations,
            collisionIterations: this.collisionIterations,
            selfCollisionEnabled: this.selfCollisionEnabled,
            selfCollisionIterations: this.selfCollisionIterations,
            selfCollisionRadiusScale: this.selfCollisionRadiusScale,
            selfCollisionStiffness: this.selfCollisionStiffness,
            selfCollisionSegmentSkip: this.selfCollisionSegmentSkip,
            selfCollisionDynamicFriction: this.selfCollisionDynamicFriction,
            selfCollisionStaticFrictionSpeed: this.selfCollisionStaticFrictionSpeed,
            selfCollisionStaticFriction: this.selfCollisionStaticFriction,
            selfCollisionNormalCacheBlend: this.selfCollisionNormalCacheBlend,
            selfCollisionNormalCacheFrames: this.selfCollisionNormalCacheFrames,
            surfaceDynamicFriction: this.surfaceDynamicFriction,
            surfaceStaticFrictionSpeed: this.surfaceStaticFrictionSpeed,
            surfaceStaticFriction: this.surfaceStaticFriction,
            continuousCollisionEnabled: this.continuousCollisionEnabled,
            continuousCollisionSegmentSamples: this.continuousCollisionSegmentSamples,
            rigidBodyInteraction: this.rigidBodyInteraction,
            rigidBodyImpulseScale: this.rigidBodyImpulseScale,
            maxRigidBodyImpulse: this.maxRigidBodyImpulse,
            rigidBodyFriction: this.rigidBodyFriction,
            rigidBodyFrictionImpulseScale: this.rigidBodyFrictionImpulseScale,
            maxRigidBodyFrictionImpulse: this.maxRigidBodyFrictionImpulse,
            grassInteractionEnabled: this.grassInteractionEnabled,
            grassReactionSampler: this.grassInteractionEnabled ? this.sampleGrassReaction : null,
            grassRopeWeight: this.grassRopeWeight,
            grassSupportScale: this.grassSupportScale,
            grassDragScale: this.grassDragScale,
            grassMaxAcceleration: this.grassMaxAcceleration,
        });
        this._solver.setTargetLength(this.targetLength);
    }

    private syncAnchors() {
        this._solver.setStartAnchor(this.startAnchor ? this.startAnchor.getWorldPosition(this._startWorld) : null);
        this._solver.setEndAnchor(this.endAnchor ? this.endAnchor.getWorldPosition(this._endWorld) : null);
    }

    private collectGrassSurfaces() {
        this._grassSurfaces.length = 0;
        if (!this.grassInteractionEnabled) {
            return;
        }

        const root = this.grassRoot ?? (this.node.scene as unknown as Node | null);
        if (!root || typeof root.getComponentsInChildren !== 'function') {
            return;
        }

        const components = root.getComponentsInChildren(Component) as GrassReactionSurface[];
        for (const component of components) {
            if (component !== this && typeof component.sampleReaction === 'function') {
                this._grassSurfaces.push(component);
            }
        }
    }

    private readonly sampleGrassReaction = (
        position: Readonly<Vec3>,
        velocity: Readonly<Vec3>,
        radius: number,
        outForce: Vec3,
    ) => {
        outForce.set(0, 0, 0);
        let density = 0;
        for (const surface of this._grassSurfaces) {
            if (!surface.enabledInHierarchy || surface.reactionEnabled === false || typeof surface.sampleReaction !== 'function') {
                continue;
            }
            density += surface.sampleReaction(position, velocity, radius, this._grassSampleForce, {
                supportScale: this.grassSupportScale,
                dragScale: this.grassDragScale,
                recoveryScale: this.grassRecoveryScale,
            });
            Vec3.add(outForce, outForce, this._grassSampleForce);
        }
        return density;
    };
}
