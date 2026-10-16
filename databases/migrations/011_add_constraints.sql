-- 011_add_constraints.sql
-- Additional integrity constraints for God of Notes.


-- ============================================================
-- 1. Exactly one OWNER membership per workspace
-- ============================================================

CREATE UNIQUE INDEX uq_workspace_members_one_owner
ON workspace_members (workspace_id)
WHERE role = 'OWNER';


-- ============================================================
-- 2. Workspace owner must have an OWNER membership
-- ============================================================

CREATE OR REPLACE FUNCTION validate_workspace_owner_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check the workspace owner.
    IF EXISTS (
        SELECT 1
        FROM workspaces w
        WHERE w.id = NEW.workspace_id
          AND NOT EXISTS (
              SELECT 1
              FROM workspace_members wm
              WHERE wm.workspace_id = w.id
                AND wm.user_id = w.owner_id
                AND wm.role = 'OWNER'
          )
    ) THEN
        RAISE EXCEPTION
            'Workspace % must have an OWNER membership matching owner_id',
            NEW.workspace_id;
    END IF;

    RETURN NEW;
END;
$$;


CREATE CONSTRAINT TRIGGER trg_validate_workspace_owner_membership
AFTER INSERT OR UPDATE
ON workspace_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_owner_membership();

-- ============================================================
-- 3. Workspace owner_id must have matching OWNER membership
-- ============================================================

CREATE OR REPLACE FUNCTION validate_workspace_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM workspace_members wm
        WHERE wm.workspace_id = NEW.id
          AND wm.user_id = NEW.owner_id
          AND wm.role = 'OWNER'
    ) THEN
        RAISE EXCEPTION
            'Workspace % owner_id must match an OWNER membership',
            NEW.id;
    END IF;

    RETURN NEW;
END;
$$;


CREATE CONSTRAINT TRIGGER trg_validate_workspace_owner
AFTER INSERT OR UPDATE OF owner_id
ON workspaces
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_workspace_owner();

-- ============================================================
-- 4. OWNER membership cannot be deleted directly
--    Workspace deletion may still CASCADE to the membership.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_owner_membership_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.role = 'OWNER'
       AND EXISTS (
           SELECT 1
           FROM workspaces
           WHERE id = OLD.workspace_id
       )
    THEN
        RAISE EXCEPTION
            'Cannot delete the OWNER membership of workspace %',
            OLD.workspace_id;
    END IF;

    RETURN OLD;
END;
$$;


CREATE TRIGGER trg_prevent_owner_membership_deletion
BEFORE DELETE
ON workspace_members
FOR EACH ROW
EXECUTE FUNCTION prevent_owner_membership_deletion();