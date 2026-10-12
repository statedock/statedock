-- Keep completion lookup bounded to each task's own audit history.
CREATE INDEX activities_task_completion_idx ON activities(subject_id, created_at DESC, id DESC) WHERE subject_type='plan' AND action IN ('plan.updated','plan.created');
