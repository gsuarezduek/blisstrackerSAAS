-- Generaliza Workspace.salesRoleNames (solo Ventas) a un mapa de acceso por módulo
-- (rrhh, gamification, ventas, marketing, contenido, eos), configurable desde
-- Preferencias. Ver backend/src/lib/moduleAccess.js.

ALTER TABLE "Workspace" ADD COLUMN "moduleAccess" JSONB NOT NULL DEFAULT '{}';

-- Backfill: si algún workspace ya tenía roles de "equipo comercial" configurados,
-- se migran a moduleAccess.ventas conservando el mismo comportamiento (allMembers:false).
UPDATE "Workspace"
SET "moduleAccess" = jsonb_build_object('ventas', jsonb_build_object('allMembers', false, 'roles', "salesRoleNames"))
WHERE "salesRoleNames" IS NOT NULL AND "salesRoleNames" <> '[]'::jsonb;

ALTER TABLE "Workspace" DROP COLUMN "salesRoleNames";
