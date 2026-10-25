-- Workspace.salesProposalGuidelines: en la práctica no se usaba desde
-- Configuración (las indicaciones se cargan por propuesta, en el momento de
-- generarla) y estaba vacío en todos los workspaces — se saca del todo.

-- DropColumn
ALTER TABLE "Workspace" DROP COLUMN "salesProposalGuidelines";
