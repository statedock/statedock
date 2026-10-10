ALTER TABLE plans ADD COLUMN global_number INTEGER NOT NULL DEFAULT 0;
WITH numbered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM plans)
UPDATE plans SET global_number = (SELECT n FROM numbered WHERE numbered.id = plans.id);
CREATE UNIQUE INDEX plans_global_number_uq ON plans(global_number);
CREATE TABLE plan_sequence (id INTEGER PRIMARY KEY CHECK(id=1), last_number INTEGER NOT NULL);
INSERT INTO plan_sequence(id,last_number) SELECT 1,COALESCE(MAX(global_number),0) FROM plans;
CREATE TRIGGER plan_number_positive BEFORE INSERT ON plans WHEN NEW.global_number <= 0 BEGIN SELECT RAISE(ABORT,'Global plan number must be positive'); END;
CREATE TRIGGER plan_number_immutable BEFORE UPDATE OF global_number ON plans WHEN NEW.global_number <> OLD.global_number BEGIN SELECT RAISE(ABORT,'Global plan number is immutable'); END;
