import { BoxCollider, Mat4, Node, RigidBody, SphereCollider, Vec3 } from 'cc';
import { RopeColliderData } from './RopeSolver3D';

export class RopeBoxColliderProvider {
    public static collect(root: Node | null, out: RopeColliderData[]) {
        out.length = 0;
        if (!root || !root.activeInHierarchy) {
            return out;
        }

        const boxColliders = root.getComponentsInChildren(BoxCollider);
        for (const collider of boxColliders) {
            if (!collider.enabled || !collider.node.activeInHierarchy) {
                continue;
            }

            const localToWorld = collider.node.getWorldMatrix(new Mat4());
            const worldToLocal = Mat4.invert(new Mat4(), localToWorld);
            const size = collider.size;
            const center = collider.center;
            const rigidBody = collider.node.getComponent(RigidBody);

            out.push({
                type: 'box',
                name: collider.node.name,
                center: center.clone(),
                halfExtents: new Vec3(size.x * 0.5, size.y * 0.5, size.z * 0.5),
                worldToLocal,
                localToWorld,
                rigidBody: rigidBody && rigidBody.enabled ? rigidBody : null,
                rigidBodyImpulse: new Vec3(),
                rigidBodyFrictionImpulse: new Vec3(),
                rigidBodyContactPoint: new Vec3(),
                rigidBodyContactWeight: 0,
            });
        }

        const sphereColliders = root.getComponentsInChildren(SphereCollider);
        for (const collider of sphereColliders) {
            if (!collider.enabled || !collider.node.activeInHierarchy) {
                continue;
            }

            const localToWorld = collider.node.getWorldMatrix(new Mat4());
            const worldToLocal = Mat4.invert(new Mat4(), localToWorld);
            const center = collider.center;
            const scale = collider.node.worldScale;
            const radiusScale = Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 0.001);
            const rigidBody = collider.node.getComponent(RigidBody);
            const worldCenter = Vec3.transformMat4(new Vec3(), center, localToWorld);

            out.push({
                type: 'sphere',
                name: collider.node.name,
                center: center.clone(),
                radius: Math.max(0.001, collider.radius * radiusScale),
                worldCenter,
                worldToLocal,
                localToWorld,
                rigidBody: rigidBody && rigidBody.enabled ? rigidBody : null,
                rigidBodyImpulse: new Vec3(),
                rigidBodyFrictionImpulse: new Vec3(),
                rigidBodyContactPoint: new Vec3(),
                rigidBodyContactWeight: 0,
            });
        }

        return out;
    }
}
