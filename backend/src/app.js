import cors from "cors";
import express from "express";
import paymentRouter from "./routes/payment.js";
import adminRouter from "./routes/admin.js";
import { config } from "./config.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, message: "payment backend is running" });
});

app.use("/api/payment", paymentRouter);
app.use("/api/admin", adminRouter);

app.listen(config.port, () => {
  console.log(`payment backend listening on http://localhost:${config.port}`);
});
