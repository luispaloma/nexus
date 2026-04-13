import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";

import { workflowsRouter } from "./routes/workflows";
import { executionsRouter } from "./routes/executions";
import { billingRouter } from "./routes/billing";
import { analyticsRouter } from "./routes/analytics";
import { integrationsRouter } from "./routes/integrations";
import { shareRouter } from "./routes/share";
import { onboardingRouter } from "./routes/onboarding";
import { sdrRouter } from "./routes/sdr";
import { pipelineRouter } from "./routes/pipeline";

// ----------------------------------------------------------------------------
// App initialization
// ----------------------------------------------------------------------------

const app = express();
const PORT = process.env.PORT ?? 3001;

// ----------------------------------------------------------------------------
// Security & utility middleware
// ----------------------------------------------------------------------------

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? [
      "http://localhost:3000",
      "https://nexus.yourdomain.com",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
    credentials: true,
    maxAge: 86400,
  })
);

app.use(compression());

app.use(
  morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
    skip: (_req, res) => process.env.NODE_ENV === "test" && res.statusCode < 400,
  })
);

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TooManyRequests", message: "Too many requests, please try again later." },
});
app.use("/api/", globalLimiter);

// Stripe webhooks need raw body - mount BEFORE json middleware
app.use("/api/billing/webhook", express.raw({ type: "application/json" }));

// JSON body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Clerk authentication - makes auth available on req.auth
app.use(clerkMiddleware());

// ----------------------------------------------------------------------------
// Health check
// ----------------------------------------------------------------------------

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: process.env.npm_package_version ?? "0.1.0",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? "development",
  });
});

// ----------------------------------------------------------------------------
// API Routes
// ----------------------------------------------------------------------------

app.use("/api/workflows", workflowsRouter);
app.use("/api/executions", executionsRouter);
app.use("/api/billing", billingRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/integrations", integrationsRouter);
app.use("/api", shareRouter); // share routes: /api/workflows/:id/share and /api/share/:token
app.use("/api/onboarding", onboardingRouter);
app.use("/api/sdr", sdrRouter);
app.use("/api/pipeline", pipelineRouter);

// ----------------------------------------------------------------------------
// 404 handler
// ----------------------------------------------------------------------------

app.use((_req, res) => {
  res.status(404).json({
    error: "NotFound",
    message: "The requested resource was not found",
    statusCode: 404,
  });
});

// ----------------------------------------------------------------------------
// Global error handler
// ----------------------------------------------------------------------------

app.use(
  (
    err: Error & { statusCode?: number; status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const statusCode = err.statusCode ?? err.status ?? 500;
    const message =
      statusCode >= 500 && process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message;

    if (statusCode >= 500) {
      console.error("Unhandled error:", err);
    }

    res.status(statusCode).json({
      error: err.name ?? "Error",
      message,
      statusCode,
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
  }
);

// ----------------------------------------------------------------------------
// Start server
// ----------------------------------------------------------------------------

const server = app.listen(PORT, () => {
  console.log(`Nexus API server running on port ${PORT} (${process.env.NODE_ENV ?? "development"})`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  server.close(() => {
    process.exit(0);
  });
});

export default app;
