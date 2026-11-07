---
description: LumenX Studio 桌面应用构建流程 - macOS DMG 和 Windows EXE 打包
---

# LumenX Studio 桌面应用构建

此 skill 用于将 LumenX Studio 打包为桌面应用分发包。

## 前置条件

**通用:**
- Python 3.11+
- Node.js 18+ (npm)
- FFmpeg

**macOS 额外:**
- Xcode Command Line Tools
- `brew install ffmpeg`（如未安装）

**Windows 额外:**
- PowerShell 5.1+
- Edge WebView2 Runtime

## macOS 构建 (.dmg)

### 1. 确保构建脚本有执行权限

```bash
chmod +x build_mac.sh
```

### 2. 执行构建

```bash
./build_mac.sh
```

**构建流程:**
1. 构建 Next.js 前端为静态文件 → `static/`
2. 创建 Python 虚拟环境
3. 安装 Python 依赖
4. 准备 FFmpeg 二进制
5. PyInstaller 打包为 .app
6. 创建 DMG 安装包

### 3. 输出位置

```
dist_mac/LumenX Studio.app   # macOS 应用
dist_mac/LumenX Studio.dmg   # DMG 安装包（分发用）
```

### 4. 测试

```bash
open "dist_mac/LumenX Studio.app"
```

### macOS 常见问题

| 问题 | 解决方案 |
|------|---------|
| FFmpeg 未找到 | `brew install ffmpeg` |
| DMG 创建失败 | 卸载已挂载的 DMG: `hdiutil detach "/Volumes/LumenX Studio"` |
| 签名错误 | 首次运行需右键→打开，绕过 Gatekeeper |

## Windows 构建 (.exe)

### 1. 在 PowerShell 中执行

```powershell
.\build_windows.ps1
```

**构建流程:**
1. 构建 Next.js 前端为静态文件
2. 创建 Python 虚拟环境
3. 安装 Python 依赖
4. 准备 FFmpeg
5. PyInstaller 打包为 .exe（onedir 目录模式）

### 2. 输出位置

```
dist_windows\LumenX Studio\LumenX Studio.exe   # Windows 应用目录
```

### Windows 常见问题

| 问题 | 解决方案 |
|------|---------|
| FFmpeg 未找到 | 下载 FFmpeg 放入 `bin\` 目录或添加到 PATH |
| PowerShell 执行策略 | 管理员 PowerShell: `Set-ExecutionPolicy RemoteSigned` |
| WebView2 错误 | 安装 Edge WebView2 Runtime |

### 3. Windows 安装包（Setup EXE，可选）

前置条件：安装 Inno Setup 6.3+（`winget install JRSoftware.InnoSetup` 或从 https://jrsoftware.org/isinfo.php 下载）。

在完成上述构建后执行：

```powershell
iscc installer.iss
```

**输出位置:**

```
dist_installer\LumenXStudio_Setup.exe   # 标准安装包（安装向导 + 快捷方式 + 卸载程序）
```

说明：
- 安装包提供安装向导、桌面/开始菜单快捷方式、标准卸载程序
- 卸载不会删除用户数据（`~/.lumen-x/` 保留）
- 如需离线安装 WebView2，编译前把 `MicrosoftEdgeWebview2Setup.exe` 放入 `bin\`

## 构建产物清理

```bash
rm -rf dist/ dist_mac/ dist_windows/ dist_installer/ build/ *.spec
rm -rf frontend/.next frontend/out static/
```

## 应用数据路径

打包后应用的用户数据存储在：
- **macOS/Linux:** `~/.lumen-x/`
- **Windows:** `C:\Users\<username>\.lumen-x\`

包含：
- `config.json` — 配置（API Key、OSS 等）
- `logs/` — 运行日志
