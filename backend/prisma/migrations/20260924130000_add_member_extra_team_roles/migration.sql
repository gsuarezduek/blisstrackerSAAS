-- Roles de equipo adicionales por miembro (el principal sigue siendo teamRole)
ALTER TABLE "WorkspaceMember" ADD COLUMN "extraTeamRoles" JSONB NOT NULL DEFAULT '[]';
