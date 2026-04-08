import express from "express";
import path from "path";
import cors from "cors";
import { fileURLToPath } from "url";
import paymentRouter from "./routes/payment.js";
import adminRouter from "./routes/admin.js";
import { config } from "./config.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, message: "payment backend is running" });
});

app.use("/api/payment", paymentRouter);
app.use("/api/admin", adminRouter);
app.use(express.static(frontendDist));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(frontendDist, "index.html"), (error) => {
    if (error) {
      next(error);
    }
  });
});

app.listen(config.port, () => {
  console.log(`payment backend listening on http://localhost:${config.port}`);
});
