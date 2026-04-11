import { PrismaClient } from "@prisma/client";

// ----------------------------------------------------------------------------
// Prisma Client Singleton
// Prevents multiple instances during development hot-reloads
// ----------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

const createPrismaClient = () => {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
    errorFormat: "pretty",
  });
};

export const prisma: PrismaClient =
  globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

// Re-export Prisma types for convenience
export {
  Prisma,
  type Organization,
  type User,
  type WorkflowDefinition,
  type WorkflowExecution,
  type StepExecution,
  type HumanApprovalRequest,
  type AuditLog,
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
  ExecutionStatus,
  StepExecutionStatus,
  ApprovalStatus,
} from "@prisma/client";

export default prisma;
