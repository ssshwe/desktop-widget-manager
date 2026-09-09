# Windows 发布检查清单

正式分发安装包前，执行：

```powershell
npm run test:regression
npm run build:release
```

`build:release` 要求构建环境已配置下列任意一种签名来源：`CSC_LINK`、`WIN_CSC_LINK` 或 `CSC_NAME`。证书文件和私钥密码不得提交到仓库；应通过受保护的 CI 密钥或本机证书存储提供给 electron-builder。

构建完成后，使用 Windows 验证安装程序的签名：

```powershell
Get-AuthenticodeSignature '.\dist\桌面小组件管理工具-<版本>-Setup.exe'
```

预期 `Status` 为 `Valid`，签名者应为发布主体。没有有效签名时，不应将安装包作为正式版本分发。

应用运行日志保存在 `%APPDATA%\desktop-widget-manager\logs`（实际路径由 Electron `userData` 决定），最多保留 14 个日志文件。收集用户日志前，应先取得用户同意并注意其中可能包含文件路径等诊断信息。
