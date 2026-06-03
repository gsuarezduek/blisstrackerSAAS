-- Workspace.billingExempt: exime a un workspace de la regla de free tier / past_due.
ALTER TABLE "Workspace" ADD COLUMN "billingExempt" BOOLEAN NOT NULL DEFAULT false;

-- El workspace "bliss" está permanentemente exento de billing.
UPDATE "Workspace" SET "billingExempt" = true WHERE "slug" = 'bliss';
