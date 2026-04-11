import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "@nexus/db";
import { requireAuth } from "../middleware/auth";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

// ----------------------------------------------------------------------------
// GET /api/analytics/overview
// Returns high-level execution stats for the org's dashboard
// ----------------------------------------------------------------------------

analyticsRouter.get("/overview", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.nexusOrgId!;
    const now = new Date();

    // Rolling 30-day window
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    // Previous 30-day window for trend comparison
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(now.getDate() - 60);

    const [
      totalExecutions,
      completedExecutions,
      failedExecutions,
      waitingApproval,
      runningExecutions,
      recentExecutions,
      prevPeriodExecutions,
      prevPeriodCompleted,
      activeWorkflows,
      totalWorkflows,
      totalApprovalRequests,
      respondedApprovalRequests,
      executionsByDay,
    ] = await Promise.all([
      // Current 30-day totals
      prisma.workflowExecution.count({
        where: { orgId, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.workflowExecution.count({
        where: { orgId, status: "completed", createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.workflowExecution.count({
        where: { orgId, status: "failed", createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.workflowExecution.count({
        where: { orgId, status: "waiting_approval" },
      }),
      prisma.workflowExecution.count({
        where: { orgId, status: "running" },
      }),
      // Recent 7-day executions
      prisma.workflowExecution.count({
        where: {
          orgId,
          createdAt: { gte: new Date(now.getTime() - 7 * 24 * 3600 * 1000) },
        },
      }),
      // Previous 30-day for comparison
      prisma.workflowExecution.count({
        where: {
          orgId,
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
      prisma.workflowExecution.count({
        where: {
          orgId,
          status: "completed",
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
      }),
      // Workflow counts
      prisma.workflowDefinition.count({ where: { orgId, isActive: true } }),
      prisma.workflowDefinition.count({ where: { orgId } }),
      // Approvals
      prisma.humanApprovalRequest.count({
        where: { execution: { orgId }, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.humanApprovalRequest.count({
        where: {
          execution: { orgId },
          status: { in: ["approved", "rejected"] },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      // Daily execution counts for chart (last 14 days)
      prisma.$queryRaw<{ date: string; count: bigint }[]>`
        SELECT
          DATE("createdAt") as date,
          COUNT(*)::bigint as count
        FROM "WorkflowExecution"
        WHERE "orgId" = ${orgId}
          AND "createdAt" >= NOW() - INTERVAL '14 days'
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      `,
    ]);

    const successRate =
      totalExecutions > 0
        ? Math.round((completedExecutions / (completedExecutions + failedExecutions)) * 100)
        : 0;

    const prevSuccessRate =
      prevPeriodExecutions > 0
        ? Math.round((prevPeriodCompleted / prevPeriodExecutions) * 100)
        : 0;

    const executionTrend =
      prevPeriodExecutions > 0
        ? Math.round(((totalExecutions - prevPeriodExecutions) / prevPeriodExecutions) * 100)
        : 0;

    // Estimated time saved: assume each completed execution saves 25 minutes of manual work
    const estimatedMinutesSaved = completedExecutions * 25;

    res.json({
      data: {
        period: "last_30_days",
        executions: {
          total: totalExecutions,
          completed: completedExecutions,
          failed: failedExecutions,
          waitingApproval,
          running: runningExecutions,
          recent7Days: recentExecutions,
          trend: executionTrend, // % change vs prior 30 days
        },
        successRate: {
          current: successRate,
          previous: prevSuccessRate,
          delta: successRate - prevSuccessRate,
        },
        workflows: {
          active: activeWorkflows,
          total: totalWorkflows,
        },
        approvals: {
          total: totalApprovalRequests,
          responded: respondedApprovalRequests,
          pending: totalApprovalRequests - respondedApprovalRequests,
          responseRate:
            totalApprovalRequests > 0
              ? Math.round((respondedApprovalRequests / totalApprovalRequests) * 100)
              : 0,
        },
        timeSaved: {
          estimatedMinutes: estimatedMinutesSaved,
          estimatedHours: Math.round(estimatedMinutesSaved / 60),
          assumptionMinutesPerExecution: 25,
        },
        chart: {
          daily: executionsByDay.map((row) => ({
            date: row.date,
            count: Number(row.count),
          })),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ----------------------------------------------------------------------------
// GET /api/analytics/workflows
// Per-workflow execution stats
// ----------------------------------------------------------------------------

analyticsRouter.get("/workflows", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.nexusOrgId!;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const workflowStats = await prisma.workflowDefinition.findMany({
      where: { orgId, isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        isTemplate: true,
        createdAt: true,
        _count: { select: { executions: true } },
        executions: {
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: {
            status: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
    });

    const result = workflowStats.map((wf) => {
      const recent = wf.executions;
      const completed = recent.filter((e) => e.status === "completed");
      const failed = recent.filter((e) => e.status === "failed");

      const avgDurationMs =
        completed.length > 0
          ? completed
              .filter((e) => e.startedAt && e.completedAt)
              .reduce((sum, e) => {
                const duration = e.completedAt!.getTime() - e.startedAt!.getTime();
                return sum + duration;
              }, 0) /
            Math.max(
              1,
              completed.filter((e) => e.startedAt && e.completedAt).length
            )
          : 0;

      return {
        id: wf.id,
        name: wf.name,
        description: wf.description,
        isTemplate: wf.isTemplate,
        totalExecutions: wf._count.executions,
        last30Days: {
          total: recent.length,
          completed: completed.length,
          failed: failed.length,
          successRate:
            recent.length > 0
              ? Math.round((completed.length / (completed.length + failed.length || 1)) * 100)
              : 0,
          avgDurationSeconds: Math.round(avgDurationMs / 1000),
        },
      };
    });

    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
