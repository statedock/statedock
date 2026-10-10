CREATE TABLE notification_outbox (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_id TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('bark','ntfy','telegram','discord','webhook')),
 payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 available_at TEXT NOT NULL, lease TEXT, delivered_at TEXT
);
CREATE INDEX notification_outbox_pending ON notification_outbox(delivered_at,available_at);
CREATE TRIGGER plan_event_notification_outbox AFTER INSERT ON plan_events BEGIN
 INSERT INTO notification_outbox(id,project_id,user_id,channel,payload,available_at)
 SELECT printf('%d:%s:%s',NEW.sequence,recipient.user_id,channels.channel),NEW.project_id,recipient.user_id,channels.channel,
 json_object('projectId',NEW.project_id,'projectName',pr.name,'projectSlug',pr.slug,'number',NEW.number,'reference',NEW.reference,'title',NEW.title,'kind',NEW.kind,'summary',p.summary,'reason',substr(p.body,1,1000)),NEW.created_at
 FROM projects pr JOIN plans p ON p.project_id=pr.id AND p.number=NEW.number
 JOIN (SELECT owner_id user_id,id project_id FROM projects UNION SELECT user_id,project_id FROM project_members) recipient ON recipient.project_id=pr.id
 CROSS JOIN (SELECT 'bark' channel UNION ALL SELECT 'ntfy' UNION ALL SELECT 'telegram' UNION ALL SELECT 'discord' UNION ALL SELECT 'webhook') channels
 WHERE pr.id=NEW.project_id;
END;
