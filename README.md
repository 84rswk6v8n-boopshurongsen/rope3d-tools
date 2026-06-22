# Rope3D Tools

这个编辑器扩展用于创建 Rope3D 标准节点结构。

## 资源介绍

Rope3D Tools 是面向 Cocos Creator 3.8.x 的 3D 绳索编辑器扩展。当前版本为 `0.2.4`。安装后可以在顶部 `节点 / 3D 绳索` 菜单或层级管理器右键菜单中快速创建标准 Rope3D 节点结构。

扩展自带 `runtime-template/assets/rope3d` 运行时代码模板。加载扩展或创建绳索节点时会自动检查当前项目是否存在 `assets/rope3d`，如果缺少运行时代码，会自动复制缺失文件并刷新资源数据库。已有文件不会被覆盖。

`0.2.4` 同步了最新 Rope3D 运行时：绳子仍可独立使用，同时支持可选的草地反作用采样。项目里存在带 `sampleReaction(...)` 接口的草地组件时，绳子可以受到草地支撑、阻力和恢复推力；没有草地系统时不会产生硬依赖。

当前入口：

- `节点 / 3D 绳索`
- 层级管理器右键菜单：优先注册到 `创建 / 3D 对象 / 3D 绳索`，并额外提供右键菜单底部的 `3D 绳索` 兜底入口

创建结果：

- `Rope3D`：挂载 `MeshRenderer`、`RopeTubeRenderer`、`Rope3D`
- `StartAnchor`：默认起点锚点
- `EndAnchor`：默认终点目标
- `ColliderRoot`：默认碰撞体根节点

说明：顶部菜单使用 `contributions.menu` 注册；层级管理器右键入口使用 Cocos Creator 的 `contributions.hierarchy.menu` 注册到 `createMenu/nodeMenu/rootMenu`。创建逻辑已经独立在 `scene.js`，右键节点创建时会优先把新绳索放到当前右键节点下。
