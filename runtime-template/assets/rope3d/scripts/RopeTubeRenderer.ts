import { _decorator, Color, Component, MeshRenderer, Vec3, utils } from 'cc';

const { ccclass, property, requireComponent, menu } = _decorator;
const GROUP_RENDER = '渲染设置';

const EPSILON = 0.00001;
function pickInitialNormal(tangent: Vec3) {
    const up = Math.abs(Vec3.dot(tangent, Vec3.UP)) > 0.92 ? Vec3.RIGHT : Vec3.UP;
    const normal = Vec3.cross(new Vec3(), tangent, up);
    if (normal.lengthSqr() < EPSILON) {
        normal.set(1, 0, 0);
    } else {
        normal.normalize();
    }
    return normal;
}

@ccclass('RopeTubeRenderer')
@menu('Rope3D/绳子管状渲染')
@requireComponent(MeshRenderer)
export class RopeTubeRenderer extends Component {
    @property({ group: GROUP_RENDER, displayName: '渲染半径', tooltip: '管状绳子的显示半径，通常由 Rope3D 自动同步。' })
    public radius = 0.08;

    @property({ group: GROUP_RENDER, displayName: '横截面分段', tooltip: '绳子圆管横截面分段数，越高越圆滑但顶点更多。' })
    public ringSegments = 8;

    @property({ group: GROUP_RENDER, displayName: '曲线细分', tooltip: '渲染层曲线插值细分次数，只影响显示效果，不影响物理。' })
    public smoothSubdivisions = 1;

    @property({ group: GROUP_RENDER, displayName: '曲线强度', tooltip: '渲染曲线插值强度，越高越平滑，但可能偏离物理粒子位置。' })
    public curveStrength = 0.35;

    @property({ group: GROUP_RENDER, displayName: '剔角迭代', tooltip: '渲染层剔角平滑次数，用来减少折线感。' })
    public cornerCutIterations = 2;

    @property({ group: GROUP_RENDER, displayName: '剔角比例', tooltip: '每次剔角的比例，过高会让绳子视觉上收缩。' })
    public cornerCutAmount = 0.32;

    @property({ type: Color, group: GROUP_RENDER, displayName: 'Gradient Start' })
    public gradientStart = new Color(255, 18, 12, 255);

    @property({ type: Color, group: GROUP_RENDER, displayName: 'Gradient Middle' })
    public gradientMiddle = new Color(255, 220, 32, 255);

    @property({ type: Color, group: GROUP_RENDER, displayName: 'Gradient End' })
    public gradientEnd = new Color(30, 185, 255, 255);

    private _renderer: MeshRenderer | null = null;
    private readonly _renderPoints: Vec3[] = [];
    private readonly _cornerPointsA: Vec3[] = [];
    private readonly _cornerPointsB: Vec3[] = [];

    onLoad() {
        this._renderer = this.getComponent(MeshRenderer);
    }

    public render(points: ReadonlyArray<Vec3>) {
        if (!this._renderer) {
            this._renderer = this.getComponent(MeshRenderer);
        }
        if (!this._renderer || points.length < 2) {
            return;
        }

        const renderPoints = this.buildRenderPoints(points);
        const ringSegments = Math.max(3, Math.floor(this.ringSegments));
        const positions: number[] = [];
        const normals: number[] = [];
        const uvs: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];
        let previousNormal: Vec3 | null = null;

        for (let i = 0; i < renderPoints.length; i++) {
            const gradientT = i / Math.max(1, renderPoints.length - 1);
            const tangent = this.computeTangent(renderPoints, i);
            let normal: Vec3;
            if (!previousNormal) {
                normal = pickInitialNormal(tangent);
            } else {
                const projected = Vec3.scaleAndAdd(new Vec3(), previousNormal, tangent, -Vec3.dot(previousNormal, tangent));
                normal = projected.lengthSqr() < EPSILON ? pickInitialNormal(tangent) : projected.normalize();
            }

            const binormal = Vec3.cross(new Vec3(), tangent, normal).normalize();
            previousNormal = normal;

            for (let r = 0; r < ringSegments; r++) {
                const angle = r / ringSegments * Math.PI * 2;
                const cos = Math.cos(angle);
                const sin = Math.sin(angle);
                const radial = new Vec3(
                    normal.x * cos + binormal.x * sin,
                    normal.y * cos + binormal.y * sin,
                    normal.z * cos + binormal.z * sin,
                );
                const vertex = Vec3.scaleAndAdd(new Vec3(), renderPoints[i], radial, this.radius);
                positions.push(vertex.x, vertex.y, vertex.z);
                normals.push(radial.x, radial.y, radial.z);
                uvs.push(r / ringSegments, i / Math.max(1, renderPoints.length - 1));
                this.pushGradientColor(colors, gradientT);
            }
        }

        for (let i = 0; i < renderPoints.length - 1; i++) {
            const base = i * ringSegments;
            const nextBase = (i + 1) * ringSegments;
            for (let r = 0; r < ringSegments; r++) {
                const nextR = (r + 1) % ringSegments;
                indices.push(base + r, base + nextR, nextBase + r);
                indices.push(base + nextR, nextBase + nextR, nextBase + r);
            }
        }

        this._renderer.mesh = utils.createMesh({
            positions,
            normals,
            uvs,
            colors,
            indices,
        });
    }

    private pushGradientColor(colors: number[], t: number) {
        const clamped = Math.max(0, Math.min(1, t));
        const from = clamped < 0.5 ? this.gradientStart : this.gradientMiddle;
        const to = clamped < 0.5 ? this.gradientMiddle : this.gradientEnd;
        const localT = clamped < 0.5 ? clamped * 2 : (clamped - 0.5) * 2;
        colors.push(
            (from.r + (to.r - from.r) * localT) / 255,
            (from.g + (to.g - from.g) * localT) / 255,
            (from.b + (to.b - from.b) * localT) / 255,
            (from.a + (to.a - from.a) * localT) / 255,
        );
    }

    private buildRenderPoints(points: ReadonlyArray<Vec3>) {
        const subdivisions = Math.max(0, Math.floor(this.smoothSubdivisions));
        const strength = Math.max(0, Math.min(1, this.curveStrength));
        const cornerIterations = Math.max(0, Math.floor(this.cornerCutIterations));
        if (points.length < 3 || (subdivisions <= 0 && strength <= 0 && cornerIterations <= 0)) {
            return points;
        }

        const basePoints = this.buildCornerCutPoints(points, cornerIterations);
        if (subdivisions <= 0 || strength <= 0 || basePoints.length < 3) {
            return basePoints;
        }

        this._renderPoints.length = 0;
        this._renderPoints.push(basePoints[0].clone());

        for (let i = 0; i < basePoints.length - 1; i++) {
            const p0 = basePoints[Math.max(0, i - 1)];
            const p1 = basePoints[i];
            const p2 = basePoints[i + 1];
            const p3 = basePoints[Math.min(basePoints.length - 1, i + 2)];

            for (let step = 1; step <= subdivisions; step++) {
                const t = step / (subdivisions + 1);
                const linear = Vec3.lerp(new Vec3(), p1, p2, t);
                const curved = this.catmullRom(p0, p1, p2, p3, t);
                this._renderPoints.push(Vec3.lerp(curved, linear, curved, strength));
            }

            this._renderPoints.push(p2.clone());
        }

        return this._renderPoints;
    }

    private buildCornerCutPoints(points: ReadonlyArray<Vec3>, iterations: number) {
        const amount = Math.max(0, Math.min(0.48, this.cornerCutAmount));
        if (iterations <= 0 || amount <= 0) {
            return points;
        }

        this._cornerPointsA.length = 0;
        for (const point of points) {
            this._cornerPointsA.push(point.clone());
        }

        let source = this._cornerPointsA;
        let target = this._cornerPointsB;
        for (let iteration = 0; iteration < iterations; iteration++) {
            target.length = 0;
            target.push(source[0].clone());

            for (let i = 0; i < source.length - 1; i++) {
                const p0 = source[i];
                const p1 = source[i + 1];
                target.push(Vec3.lerp(new Vec3(), p0, p1, amount));
                target.push(Vec3.lerp(new Vec3(), p0, p1, 1 - amount));
            }

            target.push(source[source.length - 1].clone());
            const temp = source;
            source = target;
            target = temp;
        }

        return source;
    }

    private catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number) {
        const t2 = t * t;
        const t3 = t2 * t;
        return new Vec3(
            0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
            0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
        );
    }

    private computeTangent(points: ReadonlyArray<Vec3>, index: number) {
        const tangent = new Vec3();
        if (index === 0) {
            Vec3.subtract(tangent, points[1], points[0]);
        } else if (index === points.length - 1) {
            Vec3.subtract(tangent, points[index], points[index - 1]);
        } else {
            Vec3.subtract(tangent, points[index + 1], points[index - 1]);
        }

        if (tangent.lengthSqr() < EPSILON) {
            tangent.set(1, 0, 0);
        } else {
            tangent.normalize();
        }
        return tangent;
    }
}
