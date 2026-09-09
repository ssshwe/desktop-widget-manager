const signingSource = process.env.CSC_LINK || process.env.WIN_CSC_LINK || process.env.CSC_NAME;

if (!signingSource) {
  console.error(
    '正式发布构建已停止：请配置 CSC_LINK、WIN_CSC_LINK 或 CSC_NAME，使用受信任的代码签名证书。'
  );
  process.exit(1);
}

console.log('检测到代码签名配置；electron-builder 将在打包阶段签名 Windows 可执行文件。');
