'use strict';

const PACKAGE_NAME = 'rope3d-tools';
const ROPE_MENU_LABEL = '3D 绳索';

function resolveNodeUuid(nodeInfo) {
    if (!nodeInfo) {
        return '';
    }
    if (typeof nodeInfo === 'string') {
        return nodeInfo;
    }
    if (nodeInfo.uuid) {
        return nodeInfo.uuid;
    }
    if (nodeInfo.value && typeof nodeInfo.value === 'string') {
        return nodeInfo.value;
    }
    if (nodeInfo.value && nodeInfo.value.uuid) {
        return nodeInfo.value.uuid;
    }
    if (nodeInfo.node && typeof nodeInfo.node === 'string') {
        return nodeInfo.node;
    }
    return '';
}

async function createRope3DNode(parentUuid = '') {
    try {
        await Editor.Message.request(PACKAGE_NAME, 'create-rope3d-node', parentUuid);
    } catch (error) {
        console.error('[rope3d-tools] create rope node from hierarchy menu failed:', error);
    }
}

function getRopeMenuItem(parentUuid = '') {
    return {
        label: ROPE_MENU_LABEL,
        click() {
            createRope3DNode(parentUuid);
        },
    };
}

function getRopeCreateMenuItem() {
    return {
        path: '3D 对象',
        label: ROPE_MENU_LABEL,
        click() {
            createRope3DNode();
        },
    };
}

function getRopeMenu(parentUuid = '') {
    return [
        { type: 'separator' },
        getRopeMenuItem(parentUuid),
    ];
}

exports.getCreateMenu = function getCreateMenu() {
    return [getRopeCreateMenuItem()];
};

exports.getNodeMenu = function getNodeMenu(nodeInfo) {
    return getRopeMenu(resolveNodeUuid(nodeInfo));
};

exports.getRootMenu = function getRootMenu() {
    return getRopeMenu();
};
