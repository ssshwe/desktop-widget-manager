# 桌面小组件管理工具项目概览

> 本文基于当前 `desktop-widget-manager` 项目的源码、配置、构建脚本和项目文档整理。当前项目根目录未发现 `README.md`；文档中的结论以现行代码为准，未将 TODO、已下线的数据看板或测试产物当作现行功能。

## 1. 项目简介

项目名称为“桌面小组件管理工具”（Desktop Widget Manager），是一款面向 Windows 桌面的 Electron 本地应用。它解决的是用户需要在桌面上长期查看时间、天气、待办和日程，同时又希望快速整理桌面文件、收纳常用文件与应用入口的问题。应用由一个管理中心和多个可独立运行的桌面小组件组成，支持固定到桌面、普通窗口、始终置顶等显示层级，也支持透明度、尺寸、锁定和主题设置。核心使用场景包括个人桌面信息看板、日常任务与提醒、快速便签记录、天气查询，以及通过分类规则整理 Windows 桌面文件。数据主要保存在本机，不依赖独立后端服务。

## 2. 核心功能

### 管理中心

- 管理已添加的小组件：添加、显示/隐藏、删除、重命名、刷新列表。
- 为单个小组件设置透明度、窗口显示层级和位置锁定，并打开组件内部设置。
- 主题设置：浅色、深色、毛玻璃三种主题；全局透明度、圆角、字体大小和阴影开关支持实时预览后保存。
- 系统设置：通过 Electron 登录项 API 开启或关闭 Windows 开机自启动。
- 系统托盘常驻：打开管理中心、显示/隐藏全部小组件、重启小组件和退出软件。

### 六类小组件

- 时钟：每秒更新当前时间、日期和星期，并读取天气服务展示当前天气与温度。
- 天气：按城市查询天气，或使用用户授权的当前位置；展示当前温度、最高/最低温度、天气状况和空气质量，支持手动/自动刷新、缓存回退和中文语音播报。
- 待办事项：新增、编辑、删除、完成/取消完成任务；支持低/中/高优先级、备注、截止时间，以及全部/进行中/已完成和今天/本周/本月筛选。
- 快速便签：按组件实例隔离便签数据，支持快速新增、编辑、自动保存、分类、置顶、删除和按标题/正文/分类搜索。
- 日程提醒：新增、编辑、删除日程，维护开始/结束/提醒时间；展示今日时间线，并通过系统通知处理到期提醒和应用关闭期间错过的提醒。
- 快捷收纳区：收纳文件、文件夹和应用快捷引用；支持 Windows `.lnk` 解析及系统图标、拖拽添加、打开/移除、多个分区、自定义分区图标、分区管理、排序、紧凑/舒适/大尺寸和独立分区窗口。

### 桌面文件分类

- 使用 Windows PowerShell 扫描当前用户桌面，过滤隐藏和系统项目。
- 根据文件扩展名和文件名关键词给出“学习、工作、娱乐、工具、其他”分类建议。
- 在实际移动前生成逐文件预览；用户确认且携带有效预览令牌后，才创建分类文件夹并移动文件。
- 同名目标文件自动改名避免覆盖，记录移动成功、跳过或失败的结果，并在整理后重新扫描。

## 3. 技术栈

| 技术 | 在项目中的用途 |
| --- | --- |
| Electron 42.7.x | 提供 Windows 桌面应用壳、`BrowserWindow` 多窗口、托盘、系统通知、文件对话框、地理位置权限和登录项能力。 |
| Node.js / CommonJS JavaScript | 编写 Electron 主进程、IPC 注册、业务 Service、文件系统和外部接口调用。 |
| HTML / CSS / 原生 JavaScript | 实现管理中心页面、小组件页面、交互表单、主题样式和响应式尺寸适配。 |
| Electron Preload + Context Isolation | 通过 `contextBridge` 暴露白名单 API；渲染进程不能直接访问 Node.js、文件系统或数据库。 |
| IPC (`ipcMain.handle` / `ipcRenderer.invoke`) | 连接 Renderer 与主进程服务，传递小组件、文件、配置和系统设置操作。 |
| `sql.js` / SQLite WASM | 在主进程内存中运行 SQLite，保存小组件、待办、便签、日程、天气缓存、桌面扫描结果和整理记录。 |
| JSON 配置文件 | 保存全局主题、管理中心尺寸、开机启动偏好，以及每个小组件的位置、大小、透明度、窗口模式、锁定状态和快捷收纳区配置。 |
| C++ / Node-API v8 / Win32 `user32.lib` | 构建 `windows_desktop_zorder.node`，查找 Windows 桌面宿主并维护桌面模式下的小组件 Z-order。 |
| Motion 12.42.2 | 为管理中心和小组件提供入场、列表、状态、面板等动效，并遵循 reduced-motion 设置。 |
| Electron `net.fetch` / Fetch | 主进程访问 Open-Meteo 天气与地理编码接口；天气组件还使用 BigDataCloud 做位置名称反查，主进程以 Nominatim 作为后备反查。 |
| PowerShell | 在 Windows 上枚举用户桌面文件并以 JSON 形式返回给主进程。 |
| `node-gyp` + `electron-builder` / NSIS | 编译 Electron ABI 对应的原生模块，并打包 x64 Windows NSIS 安装程序。 |

## 4. 项目架构

```text
Electron Main Process
  ├─ 应用生命周期、单实例、托盘、通知、登录项
  ├─ BrowserWindow：管理中心 + 每个小组件独立窗口
  ├─ IPC Handler（安全校验和错误兜底）
  └─ Service 层
       ├─ SQLite(sql.js) / userData/desktop-widget-manager.sqlite
       ├─ userData/config.json、日志和原子文件写入
       ├─ Windows 文件系统 / PowerShell
       ├─ Windows Node-API 原生桌面层级模块
       └─ Open-Meteo / BigDataCloud / Nominatim

Preload（contextBridge 白名单）
        ↓ ipcRenderer.invoke
Renderer 管理中心（src/renderer.js）
        ↓
Widget Renderer（src/widgetRenderer.js 按类型动态加载脚本）
        ↓
六类小组件 UI 与交互（src/widgets/*.js）
```

- 主进程负责应用生命周期、单实例锁、窗口创建与销毁、托盘、系统通知、开机启动、数据库初始化、配置读写、外部网络请求、桌面文件操作和 Windows 原生能力。
- 管理中心 Renderer 负责导航、列表、表单、主题预览和状态展示；小组件 Renderer 负责单个窗口中的 UI、用户交互和定时刷新。
- Preload 通过 `contextBridge.exposeInMainWorld` 暴露 `window.api` 和窗口控制 API。主进程的 `safeIpcHandle` 会校验调用页面是否为 `src` 下的受信任本地文件，再调用对应 Service 并统一转换错误。
- Service 层将业务规则与窗口/UI 解耦：`widgetService` 管理组件记录，`widgetWindowService` 管理 BrowserWindow 生命周期与布局，其他 Service 分别处理待办、便签、日程、天气、桌面文件和快捷收纳区。
- SQLite 由 `sql.js` 在内存中操作；每次业务写入后导出并通过原子文件写入 `app.getPath('userData')` 下的数据库文件。JSON 配置同样位于 Electron `userData`，写入时使用临时文件、`fsync` 和重命名。

## 5. 核心模块

| 模块 | 主要作用 |
| --- | --- |
| `electron/main.js` | 启动流程、单实例、管理中心窗口、托盘、退出前保存、IPC 注册和服务初始化。 |
| `electron/preload.js` | 安全隔离桥接，向管理中心和小组件暴露受限 API，并转发渲染层错误诊断。 |
| `electron/services/widgetService.js` | 小组件类型校验、增删改、可见状态和废弃 dashboard 数据清理。 |
| `electron/services/widgetWindowService.js` | 独立 `BrowserWindow` 的创建、复用、关闭、显示/隐藏、拖动/缩放状态保存、主题应用和多显示器恢复。 |
| `electron/services/windowModeService.js` | `desktop`、`normal`、`alwaysOnTop` 三态显示层级切换、运行时状态和原生失败降级。 |
| `electron/services/desktopWindowService.js` | 加载原生桥接模块、转换 HWND、调用桌面层级/恢复/注销/刷新接口。 |
| `electron/db/database.js` + `electron/db/init.sql` | 初始化和校验 SQLite，创建业务表、索引及兼容结构，处理损坏数据库备份和恢复。 |
| `electron/services/configService.js` | 管理 `config.json`、默认值、字段归一化、旧配置迁移和每个小组件的布局配置。 |
| `electron/services/desktopFileService.js` | 桌面扫描、分类规则、预览令牌、确认移动、重名处理和整理记录。 |
| `electron/services/floatingFolderService.js` | 校验快捷收纳区授权路径、解析 `.lnk` 信息、读取系统图标和使用系统默认程序打开项目。 |
| `electron/services/weatherService.js` | 城市/坐标天气查询、地理编码、空气质量、缓存有效期和接口失败回退。 |
| `electron/services/scheduleReminderService.js` | 每 30 秒检查到期日程，启动时处理错过提醒并发送系统通知。 |
| `src/renderer.js` | 管理中心四个视图、组件列表、桌面分类操作、主题设置和系统设置交互。 |
| `src/widgetRenderer.js` + `src/widgets/*.js` | 小组件通用窗口壳、上下文菜单、布局设置，以及六种具体组件的渲染和交互。 |
| `native/windows-desktop-zorder/` | C++ Node-API 原生模块，维护小组件与 Windows 桌面宿主之间的窗口层级。 |

## 6. 关键技术实现

### 6.1 Electron 多窗口与小组件生命周期

**解决的问题：** 管理中心和每个小组件需要独立显示、关闭、重启和恢复，不能留下孤立窗口或错误地删除组件记录。

**实现方式：** `widgetWindowService` 使用 `Map<widgetId, entry>` 管理窗口实例；创建时把组件 ID、类型和配置通过 URL query 传给统一的 `widget.html`，按类型动态加载渲染脚本。窗口移动和缩放通过 250ms 延迟合并写入布局，关闭时区分“用户隐藏”和“应用退出”。

**使用的技术：** Electron `BrowserWindow`、窗口事件、`Map`、Preload、`widgetRenderer`。

### 6.2 Windows 桌面显示层级与安全降级

**解决的问题：** 普通 Electron 窗口无法直接稳定实现“贴在桌面上方、又能被普通应用覆盖”的桌面小组件效果。

**实现方式：** C++ Node-API 模块查找 `Progman` / `WorkerW` / `SHELLDLL_DefView` 桌面宿主，将有效 HWND 放置到桌面宿主前的 Z-order；使用 WinEvent、`TaskbarCreated`、显示配置和电源相关消息恢复层级，并以 1500ms 低频校验兜底。桌面、普通窗口、始终置顶三态由 `windowModeService` 统一管理；原生模块缺失、加载失败、桌面宿主不存在或调用失败时自动降级为普通窗口，保留组件和配置。

**使用的技术：** C++17、Node-API v8、Win32 `SetWindowPos` / WinEvent / 窗口消息、Electron `setAlwaysOnTop`。

### 6.3 Main / Renderer IPC 与受信任页面校验

**解决的问题：** 渲染层需要读写数据库、配置和系统资源，但不应直接获得 Node.js 或原生模块权限。

**实现方式：** `preload.js` 只暴露明确列出的调用函数；所有异步业务通过 `ipcRenderer.invoke` 进入主进程白名单 Handler。`safeIpcHandle` 在执行前校验发送页面是否位于 `src` 目录，并提供统一日志、友好错误信息和安全兜底返回值；窗口启用 `contextIsolation`、`sandbox`、`nodeIntegration: false`，同时阻止远程导航和新窗口。

**使用的技术：** Electron `contextBridge`、`ipcMain.handle`、`ipcRenderer.invoke`、CSP、URL/path 校验。

### 6.4 SQLite 与 JSON 的分工式持久化

**解决的问题：** 业务列表需要查询、排序、关联和事务；窗口外观与布局又需要灵活扩展并兼容旧配置。

**实现方式：** SQLite 表保存组件、待办、便签、日程、天气、桌面文件、分类和整理记录；配置文件保存全局主题、管理中心尺寸和每个组件的窗口/视觉配置。`sql.js` 在内存中运行后显式 `export()` 落盘，启动时检查缺失表并修复，无法读取的数据库会先备份再重建。配置采用默认配置深合并、数值范围收敛、旧 `widget-*` key 和旧 `pinned` 字段迁移。

**使用的技术：** `sql.js`、SQLite 外键/索引/事务、JSON、Electron `userData`、原子文件写入。

### 6.5 桌面文件“预览—确认—执行”流程

**解决的问题：** 自动整理桌面存在误移动、重名覆盖和权限失败风险，需要让用户先看到每个文件的目标位置。

**实现方式：** 主进程扫描桌面并按扩展名/关键词生成分类建议；预览阶段创建一次性 token，执行阶段必须同时携带 token 和 `confirmed` 标志。执行时逐项判断源文件、创建目标分类目录、用唯一目标路径处理重名，再把 moved/skipped/failed 状态写入整理记录并重新扫描。

**使用的技术：** PowerShell、Node.js `fs`、SQLite 事务、预览 token、Electron IPC。

### 6.6 天气数据的实时、定位与缓存回退

**解决的问题：** 天气接口和定位服务可能超时或不可用，但小组件仍应保留可解释的上一次数据或不可用状态。

**实现方式：** 城市先经 Open-Meteo 地理编码再查询天气和空气质量；用户点击定位后由浏览器获取坐标，客户端优先反查地区名称，主进程以 Nominatim 后备反查。天气设置表保存城市、刷新间隔和 JSON 缓存，默认至少 30 分钟自动刷新；接口失败时仅在城市/坐标匹配且缓存有效的情况下展示缓存，并标注 `cache`/错误原因。

**使用的技术：** Electron `net.fetch`、Fetch、Geolocation API、Open-Meteo、BigDataCloud、Nominatim、AbortController。

## 7. 项目难点与解决方案

### 难点一：桌面模式的窗口层级既要贴近桌面，又要保持可交互

**解决方案：** 通过 Node-API 调用 C++/Win32，围绕 Windows 桌面宿主窗口维护小组件 HWND 的 Z-order；不使用 `SetParent`，并保留普通窗口模式和始终置顶模式。Explorer 重启、显示器变化、电源恢复等事件会触发刷新；原生失败时自动回退普通窗口，不阻塞应用启动。

### 难点二：多窗口状态的一致性与退出恢复

**解决方案：** 以 widget ID 为键统一维护窗口 Map，在 move/resize 事件中延迟保存边界，在退出或重启前主动 flush。启动时只恢复 SQLite 中 `visible=1` 的组件，并通过工作区边界修正将脱离当前显示器的窗口拉回可见区域；显示器增删、分辨率/DPI 变化和解锁后重新检查。

### 难点三：桌面整理不能绕过预览直接移动文件

**解决方案：** 将扫描建议、预览和实际移动拆成三步，服务端在执行阶段校验一次性预览 token 与确认标志；目标路径统一做同名冲突处理，失败项保留错误信息，整理记录可追踪每个文件的源路径、目标路径和状态。

### 难点四：本地数据损坏或接口失败时保持可恢复性

**解决方案：** SQLite 启动时检查必需表，损坏数据库先复制 `.bak` 再重建；配置解析失败同样先备份并回退默认值。天气接口使用超时控制、缓存标记和不可用状态，避免网络异常导致组件整体不可用。

### 难点五：快捷收纳区需要保存引用而不是复制文件

**解决方案：** 只保存规范化后的路径引用和分区排序，不移动或复制原文件；打开前在主进程校验路径是否仍存在且确实属于当前组件配置，使用 Electron `shell.openPath` 交给系统默认程序处理。快捷方式图标通过 `.lnk` 目标/图标候选和 `app.getFileIcon` 获取。

## 8. 数据与状态管理

### SQLite 保存内容

- `widgets`：小组件 ID、名称、类型、显示状态、旧版固定/锁定字段和时间戳。
- `todos`：标题、备注、优先级、截止时间、完成状态和时间戳。
- `notes`：便签实例 ID、标题、正文、分类、置顶状态和时间戳；通过外键按组件实例隔离，并在删除便签组件时显式清理。
- `schedules`：日程内容、开始/结束/提醒时间和 `reminded` 状态。
- `weather_settings`：城市、刷新间隔、天气 JSON 缓存和更新时间。
- `categories` / `desktop_files`：桌面分类规则、扫描到的文件路径、类型、修改时间和建议分类。
- `desktop_organize_records`：每次整理的 run ID、文件源/目标路径、分类、移动状态和错误信息。
- `floating_folders`：仅作为旧版数据库兼容表保留；当前快捷收纳区主要使用组件配置保存路径和分区信息。

### JSON / Electron `userData`

- `config.json`：全局主题（`theme`、透明度、圆角、字体、阴影）、管理中心尺寸、开机自启动偏好，以及按组件 ID 保存的 `x/y/width/height/opacity/windowMode/locked` 和快捷收纳区的分区、排序、路径、图标尺寸等配置。
- `desktop-widget-manager.sqlite`：位于 `app.getPath('userData')`，不是项目源码目录；启动时读取，写入后导出落盘。
- `logs/`：主进程和渲染层诊断日志，按天写入，超过 3 MB 轮转，最多保留 14 个日志文件。

窗口位置和大小在首次创建时从组件配置读取，超出显示器工作区时收敛到可见范围；用户移动/缩放后延迟保存，应用退出前再次主动保存。透明度、主题、窗口模式和锁定状态更新后立即应用到已打开窗口，并写入配置供下次启动恢复。

## 9. 项目目录

```text
desktop-widget-manager/
├─ electron/
│  ├─ main.js                    Electron 主进程入口
│  ├─ preload.js                 安全桥接 API
│  ├─ db/database.js             sql.js/SQLite 初始化与持久化
│  ├─ db/init.sql                数据表、索引和兼容结构
│  ├─ ipc/                       各业务 IPC Handler
│  ├─ services/                  窗口、配置、组件、天气、文件等业务服务
│  ├─ security/windowSecurity.js 本地页面与导航安全校验
│  └─ utils/atomicFile.js        原子文件写入工具
├─ src/
│  ├─ index.html                 管理中心页面
│  ├─ renderer.js                管理中心 Renderer
│  ├─ widget.html                小组件通用页面壳
│  ├─ widgetRenderer.js          按类型加载和挂载小组件
│  ├─ widgets/                   clock/weather/todo/notes/schedule/floatingFolder
│  ├─ shared/uiUtils.js          主题、转义、动画和窗口模式 UI 工具
│  └─ styles/                    管理中心、小组件及快捷收纳区样式
├─ native/windows-desktop-zorder/
│  ├─ src/desktop_zorder.cc      C++ Node-API / Win32 实现
│  ├─ binding.gyp                原生模块构建配置
│  └─ index.js                   开发/打包路径加载器
├─ resources/
│  ├─ config.default.json        默认全局配置
│  └─ icon.ico                   Windows 应用图标
├─ scripts/                      回归测试、原生降级验证、QA 截图和发布校验脚本
├─ docs/                         窗口模式、发布清单等项目文档
├─ package.json                  启动、原生构建、测试和打包配置
└─ package-lock.json             依赖锁定文件
```

## 10. 项目亮点

- 基于 Electron 构建 Windows 桌面小组件管理应用，统一管理管理中心与六类独立 `BrowserWindow` 的生命周期。
- 通过 `contextIsolation`、sandbox、CSP、Preload 白名单 API 和受信任本地 URL 校验建立 Main/Renderer 安全通信边界。
- 使用 C++ Node-API v8 配合 Win32 桌面宿主和 Z-order 管理，实现可交互的“固定到桌面 / 普通窗口 / 始终置顶”三态切换，并支持原生能力失败降级。
- 使用 `sql.js` 将 SQLite 业务数据持久化到 Electron `userData`，覆盖待办、便签、日程、天气缓存、桌面扫描和整理记录。
- 将窗口位置、大小、透明度、主题、锁定和窗口模式保存到 JSON，并在多显示器、分辨率变化、系统恢复和重启后进行边界修正与状态恢复。
- 为桌面整理实现“扫描分类—逐文件预览—确认令牌—执行移动—结果记录—重新扫描”闭环，并处理隐藏文件、非桌面根目录项目和重名冲突。
- 快速便签支持按组件实例隔离、分类、置顶、搜索和延迟自动保存；日程服务支持到期及启动时错过提醒的系统通知。
- 快捷收纳区以路径引用方式管理文件、文件夹和应用，支持 `.lnk` 解析、系统图标、拖放添加、多分区、排序及将分区拉出为独立组件。

## 11. 简历项目摘要

## 简历快速摘要

“桌面小组件管理工具”是一款面向 Windows 的 Electron 桌面应用，采用 Node.js、HTML/CSS/JavaScript、sql.js/SQLite、Electron IPC、Motion 和 C++ Node-API/Win32 构建。项目提供管理中心与六类组件：时钟、天气、待办、快速便签、日程提醒和快捷收纳区，支持桌面文件扫描、分类预览和一键整理。主进程负责窗口生命周期、托盘、通知、开机自启动、数据存储、文件系统和天气接口；Renderer 通过 Preload 白名单 API 与主进程通信。实现包括多窗口状态持久化、多显示器位置恢复、桌面/普通/置顶三态窗口管理，以及 C++ 原生模块维护 Windows 桌面 Z-order。针对普通 Electron 窗口难以实现桌面层级的问题，项目通过 Win32 桌面宿主定位、事件监听和失败降级实现可交互的桌面模式。SQLite 保存业务数据，JSON 保存主题、窗口布局和快捷收纳区状态，并通过原子写入、数据库修复、损坏备份和天气缓存回退增强可恢复。桌面整理以预览 token 和用户确认约束文件移动，兼顾功能与安全。
