-- AlterTable: add scheduledAfter to WorkflowExecution to support delayed/scheduled send
ALTER TABLE "WorkflowExecution" ADD COLUMN "scheduledAfter" TIMESTAMP(3);

-- CreateIndex: efficient polling query — only pick up executions ready to run
CREATE INDEX "WorkflowExecution_status_scheduledAfter_idx" ON "WorkflowExecution"("status", "scheduledAfter");
