# Changelog

All notable changes to LumenX will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

---

## [Unreleased]

---

## [1.1.0] - 2026-06-05

### Added
- **MuleRun/MuleRouter provider** — 通过 MuleRun 平台调用 Seedance 2.0 (T2V/I2V/R2V) 和 GPT-Image-2 (T2I/I2I)，一个账号统一计费
- **MuleRun CLI 双模式** — 支持 CLI subprocess 模式（`mulerun login` 登录）和 HTTP API 模式（`MULEROUTER_API_KEY`），自动检测优先级
- **R2V 模型一等公民** — 独立 `selection_group: r2v`，8 个 R2V 模型跨 6 个 family 直接可见可选，消除旧的 hidden + 推导架构
- **reference_sheet 生成类型** — R2V 角色设定图一次 T2I 生成（含特写 + 三视图），替代旧的 full_body → three_view → headshot 三步流水线
- **GroupedModelGrid 组件** — 模型按 family 分组展示（带 display_name 标题），覆盖 6 个设置/选择组件
- **Family display_name** — Catalog YAML 支持 `display_name` 字段，如 "Wan (通义万相)"、"Seedance (即梦)"
- **t2v selection group** — 为 Seedance T2V 预留独立分组，不污染 I2V 列表
- **MuleRun key 配置 UI** — 全局设置 + 项目环境配置统一，含 3 步获取引导面板
- **MuleRun CLI 登录检测** — 当 CLI 已登录时显示 "✓ MuleRun CLI 已登录，无需手动填写"
- **R2V 模型全局默认设置** — 全局设置页新增 R2V 模型选择区

### Changed
- **错误透传** — 资产生成失败显示 provider 真实错误信息（替代通用 "请检查 API 配置"），toast 支持复制错误详情
- **isVisibleModel 过滤 deprecated** — deprecated 状态的模型不再出现在 UI 下拉列表

### Deprecated
- **wan2.6 全系列** — wan2.6-t2i、wan2.6-image、wan2.6-i2v、wan2.6-i2v-flash 等全部标记 deprecated，UI 不再显示

### Fixed
- **GPT-Image-2 size 兼容** — 自动转换 DashScope 格式 (1024*768) 为 GPT-Image-2 合法尺寸 (1536x1024)
- **GPT-Image-2 edit 参数** — `--images` (复数) 替代 `--image`
- **MuleRun CLI JSON 格式** — 兼容 string URL 数组和 object 数组两种返回格式
- **Pipeline 死代码** — 删除重复的 `create_asset_video_task` 定义，R2V-aware 版本生效
- **图片生成路由** — `AssetGenerator` 按 model_name 前缀路由到 MuleRouter adapter
- **R2V auto-switch 防护** — 直选 R2V 模型时跳过 I2V→R2V 自动切换
- **wan2.7-i2v 去掉残留 r2v capability** — 避免路由歧义
- **HappyHorse R2V 补 inputs.reference_images** — UI 正确显示参考图限制
- **MuleRouter submit 加 retry** — 提交任务与轮询/下载一致使用指数退避重试
