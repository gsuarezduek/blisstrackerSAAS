-- Backfill: los workspaces que ya existían antes de este feature no deben ver el
-- wizard de onboarding (selector de módulos + tour). Sin este backfill, la columna
-- onboardingCompletedAt (agregada en add_workspace_onboarding_completed) queda NULL
-- para TODOS los workspaces preexistentes, no solo para los nuevos, y el wizard les
-- aparece a sus admins como si fueran workspaces recién creados.
UPDATE "Workspace"
SET "onboardingCompletedAt" = "createdAt"
WHERE "onboardingCompletedAt" IS NULL;
