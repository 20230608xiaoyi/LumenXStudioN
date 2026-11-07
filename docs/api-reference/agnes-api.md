# Agnes AI API 参考证据

> 来源（source URL）:
> - 平台首页: https://platform.agnes-ai.cn/
> - 官方文档站: https://wiki.agnes-ai.com/zh-Hans/docs/faqs
> - 文本模型: https://wiki.agnes-ai.com/en/docs/agnes-25-flash
> - 文本模型 3.0: https://wiki.agnes-ai.com/zh-Hans/docs/agnes-30-flash
> - 图像模型: https://wiki.agnes-ai.com/zh-Hans/docs/agnes-image-25-flash
> - 视频模型: https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash
> 抓取日期: 2026-10-17
> Provider / family / model scope: provider `agnes`；family `agnes`（routing_prefixes: `agnes-`）
> LumenX 接入版本: LLM `agnes-2.5-pro-beta`（可选 `agnes-2.5-flash` / `agnes-3.0-flash`）、图像 `agnes-image-2.0-flash` / `agnes-image-2.5-flash`、视频 `agnes-video-2.5` / `agnes-video-2.5-flash`

---

## 平台概况

Agnes AI（爱思）是 OpenAI 兼容聚合商，提供文本、图像、视频三类生成 API，核心模型限时免费（受 RPM 限制）。平台首页展示的三类旗舰模型：

| 类型 | 模型 | 开发者 |
|---|---|---|
| 文本 | Agnes-2.5-Pro-Beta | SapiensAI |
| 图像 | Agnes-Image-2.0 | SapiensAI |
| 视频 | Agnes-Video-2.5 | SapiensAI |

## 通用接入信息

- **Base URL（国际站）**: `https://apihub.agnes-ai.com/v1`
- **鉴权**: `Authorization: Bearer YOUR_API_KEY`
- **API Key**: 平台控制台 → API Key 管理页创建，完整密钥仅创建时展示一次
- 文本模型用 `/chat/completions`（或 `/responses`、`/messages`），图像模型用 `/images/generations`，视频模型用 `/videos`

## 一、文本模型（LLM）

### Endpoint

```
POST https://apihub.agnes-ai.com/v1/chat/completions
```

同时支持 OpenAI Responses API（`POST /v1/responses`）与 Anthropic Messages API（`POST /v1/messages`，鉴权用 `x-api-key` 头）。

### 请求头

```
-H "Authorization: Bearer YOUR_API_KEY"
-H "Content-Type: application/json"
```

### 请求参数（Chat Completions）

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 模型名：`agnes-2.5-flash`（512K 上下文 / 65.5K 输出）、`agnes-3.0-flash`（新一代，强化 Agent 编程与工具编排）、`agnes-2.5-pro-beta`（平台首页旗舰） |
| `messages` | array | 是 | 会话消息，含 `system` / `user` / `assistant` |
| `temperature` | number | 否 | 随机性控制 |
| `top_p` | number | 否 | 核采样 |
| `max_tokens` | number | 否 | 输出 token 上限 |
| `stream` | boolean | 否 | 流式输出 |
| `tools` / `tool_choice` | array / object | 否 | 工具调用 |

### 响应格式

标准 OpenAI Chat Completions 结构，生成文本位于 `choices[].message.content`。

### 示例

```bash
curl https://apihub.agnes-ai.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "agnes-2.5-flash",
    "messages": [{"role": "user", "content": "你好"}]
  }'
```

## 二、图像模型

### Endpoint

```
POST https://apihub.agnes-ai.com/v1/images/generations
```

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 模型名，如 `agnes-image-2.5-flash`（文档示例）/ `agnes-image-2.0-flash`（LumenX 当前默认） |
| `prompt` | string | 是 | 生成/编辑指令 |
| `size` | string | 是 | 输出尺寸档位 `1K`/`2K`/`3K`/`4K`，兼容 `1024x768` 精确写法 |
| `ratio` | string | 否 | 宽高比 `1:1`/`3:4`/`4:3`/`16:9`/`9:16`/`2:3`/`3:2`/`21:9`，默认 `1:1` |
| `image` | string[] | 图生图必填 | 输入图像数组（URL 或 Data URI Base64） |
| `return_base64` | boolean | 否 | 文生图 Base64 返回 |
| `extra_body.response_format` | string | 否 | `url` 或 `b64_json`（不要放顶层 `response_format`） |

### 响应格式

```json
{
  "created": 1780000000,
  "data": [
    { "url": "https://storage.googleapis.com/agnes-aigc/xxx.png", "b64_json": null, "revised_prompt": null }
  ]
}
```

### 注意

- 图生图不需要 `tags: ["img2img"]`
- 客户端超时建议 `60s - 360s`

## 三、视频模型

### Endpoint

- 创建任务: `POST https://apihub.agnes-ai.com/v1/videos`
- 查询任务: `GET https://apihub.agnes-ai.com/agnesapi?video_id=<VIDEO_ID>&model_name=<MODEL>`
  - `video_id + model_name` 组合对 `text` / `keyframe` / `reference` 三种模式均有效（推荐）
  - 仅 `video_id`（不带 `model_name`）只对 `text` 模式有效

### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `model` | string | 是 | 模型名，如 `agnes-video-2.5-flash`（文档示例）/ `agnes-video-2.5`（LumenX 当前默认） |
| `prompt` | string | 是 | 视频描述 |
| `mode` | string | 是 | `text` / `keyframe` / `reference` |
| `seconds` | string | 否 | 时长字符串 `"4"`–`"12"`，默认 `"5"`（注意是字符串） |
| `size` | string | 否 | 分辨率档位；2.5 完整版支持 `720P`/`1080P`/`1K`/`2K`，Flash 固定 `720P` |
| `aspect_ratio` | string | 否 | `21:9`/`16:9`/`4:3`/`1:1`/`3:4`/`9:16`，默认 `16:9` |
| `seed` | integer | 否 | 随机种子 |
| `n` | integer | 否 | 仅支持 `1` |
| `keyframe.first_frame` / `last_frame` | string | keyframe 模式 | 首帧/末帧图像（至少一个），为 URL 或 Data URI |
| `images` / `audios` | string[] | reference 模式 | 参考图（≤5）/ 参考音频（≤3） |

不支持 `videos` 参考输入。`reference` 模式已接入 LumenX R2V 工作流（目录条目 `agnes-video-2.5[-flash]-r2v`，参考图上限 5）。

### 任务响应与轮询

创建响应含 `id` / `task_id` / `video_id`，用 `video_id` 轮询。轮询间隔建议 1–2 秒（LumenX 适配器用 10 秒），直到 `status` 变为 `completed` 或 `failed`。

```json
{
  "id": "task_YOUR_TASK_ID",
  "object": "video",
  "status": "completed",
  "progress": 100,
  "seconds": "4",
  "size": "720P",
  "url": "https://example.com/generated/video.mp4"
}
```

完成后从顶层 `url` 字段取视频地址下载。

## 四、LumenX 适配映射

| 能力 | 文件 | 说明 |
|---|---|---|
| 文本 LLM | `src/apps/comic_gen/llm_adapter.py` | `LLM_PROVIDER=agnes`，OpenAI SDK 客户端指向 `{AGNES_BASE_URL}/v1`，凭据 `AGNES_API_KEY`，默认模型 `AGNES_MODEL`（缺省 `agnes-2.5-pro-beta`，可在设置页下拉切换 flash 档） |
| 图像生成 | `src/models/agnes.py` `AgnesImageModel` | OpenAI images 兼容 `POST /v1/images/generations`，`response_format: b64_json`，模型名随选择透传 |
| 视频生成 | `src/models/agnes.py` `AgnesVideoModel` | text/keyframe/reference 模式 + `/agnesapi` 轮询（10s 间隔，900s 超时）；`_resolve_api_model` 将目录 id（`agnes/agnes-video-2.5[-flash]` 或 `*-i2v`/`*-t2v`/`*-r2v`）映射为 API 模型名 |
| 默认端点 | `src/utils/endpoints.py` | `PROVIDER_DEFAULTS["AGNES"] = "https://apihub.agnes-ai.com"`，可用 `AGNES_BASE_URL` 覆盖 |

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `AGNES_API_KEY` | 是 | 三类模型共用 |
| `AGNES_BASE_URL` | 否 | 默认 `https://apihub.agnes-ai.com` |
| `AGNES_MODEL` | 否 | LLM 默认模型，缺省 `agnes-2.5-pro-beta` |
| `AGNES_IMAGE_MODEL` | 否 | 缺省 `agnes-image-2.0-flash` |
| `AGNES_VIDEO_MODEL` | 否 | 缺省 `agnes-video-2.5` |
| `LLM_PROVIDER` | 否 | 设为 `agnes` 启用 Agnes 文本模型 |
