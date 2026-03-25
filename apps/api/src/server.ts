import { createApp } from "./app";

const app = createApp();
const port = Number(process.env.PORT ?? 4318);

app.listen(port, "127.0.0.1", () => {
  console.log(`Codex Sessions Viewer API listening on http://127.0.0.1:${port}`);
});
