import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const config = loadConfig();
  const app = buildApp(config);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      app.close().then(() => process.exit(0), () => process.exit(1));
    });
  }
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  if (error.code === "EADDRINUSE") {
    console.error(`后端端口 ${error.port} 已被占用，请修改 server/.env 的 PORT 后重启；本地开发代理会自动同步。`);
  } else {
    console.error(`后端启动失败：${error.message}`);
  }
  process.exit(1);
}
