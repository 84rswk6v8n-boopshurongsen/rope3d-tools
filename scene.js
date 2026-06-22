'use strict';

function findNodeByUuid(root, uuid) {
    if (!root || !uuid) {
        return null;
    }
    if (root.uuid === uuid || root._uuid === uuid) {
        return root;
    }
    for (const child of root.children || []) {
        const result = findNodeByUuid(child, uuid);
        if (result) {
            return result;
        }
    }
    return null;
}

function getProjectClass(modulePath, className) {
    try {
        const moduleExports = require(modulePath);
        return moduleExports[className] || moduleExports.default || null;
    } catch (error) {
        return null;
    }
}

function addComponentSafe(node, componentCtor, componentName) {
    if (componentCtor) {
        try {
            return node.addComponent(componentCtor);
        } catch (error) {
            // Fall back to component name below. Cocos can be picky about constructors loaded from db:// in editor scripts.
        }
    }
    try {
        return node.addComponent(componentName);
    } catch (error) {
        return null;
    }
}

function getComponentSafe(node, componentCtor, componentName) {
    if (componentCtor) {
        try {
            return node.getComponent(componentCtor);
        } catch (error) {
            // Fall back to component name below.
        }
    }
    try {
        return node.getComponent(componentName);
    } catch (error) {
        return null;
    }
}

exports.methods = {
    createRope3DNodeV2(parentUuid) {
        const { director, Node, Vec3, MeshRenderer } = require('cc');
        const Rope3D = getProjectClass('db://assets/rope3d/scripts/Rope3D', 'Rope3D');
        const RopeTubeRenderer = getProjectClass('db://assets/rope3d/scripts/RopeTubeRenderer', 'RopeTubeRenderer');

        const scene = director.getScene();
        if (!scene) {
            return {
                success: false,
                message: '当前没有打开的场景。',
            };
        }
        const parent = findNodeByUuid(scene, parentUuid) || scene;
        const ropeNode = new Node('Rope3D');
        const startAnchor = new Node('StartAnchor');
        const endAnchor = new Node('EndAnchor');
        const colliderRoot = new Node('ColliderRoot');

        parent.addChild(ropeNode);
        ropeNode.addChild(startAnchor);
        ropeNode.addChild(endAnchor);
        ropeNode.addChild(colliderRoot);

        ropeNode.setPosition(new Vec3(0, 0, 0));
        startAnchor.setPosition(new Vec3(-3, 2.5, 0));
        endAnchor.setPosition(new Vec3(3, 2.5, 0));
        colliderRoot.setPosition(new Vec3(0, 0, 0));

        if (!ropeNode.getComponent(MeshRenderer)) {
            addComponentSafe(ropeNode, MeshRenderer, 'cc.MeshRenderer');
        }

        const renderer = getComponentSafe(ropeNode, RopeTubeRenderer, 'RopeTubeRenderer') || addComponentSafe(ropeNode, RopeTubeRenderer, 'RopeTubeRenderer');
        const rope = getComponentSafe(ropeNode, Rope3D, 'Rope3D') || addComponentSafe(ropeNode, Rope3D, 'Rope3D');

        if (!renderer || !rope) {
            ropeNode.destroy();
            return {
                success: false,
                message: 'Rope3D 组件挂载失败，请确认 assets/rope3d 运行时代码已经完成导入。',
            };
        }

        renderer.radius = 0.08;
        renderer.ringSegments = 8;
        renderer.smoothSubdivisions = 1;
        renderer.curveStrength = 0.35;
        renderer.cornerCutIterations = 2;
        renderer.cornerCutAmount = 0.32;

        rope.startAnchor = startAnchor;
        rope.endAnchor = endAnchor;
        rope.colliderRoot = colliderRoot;
        rope.ropeRadius = 0.08;
        rope.segmentLength = 0.2;
        rope.targetLength = 6;
        rope.pinEndAnchor = false;

        return {
            success: true,
            uuid: ropeNode.uuid || ropeNode._uuid,
            name: ropeNode.name,
            message: '已创建 3D 绳索节点。',
        };
    },
};
