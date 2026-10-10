import type { OnlineEnv } from "./auth.js";
import { dispatchNotifications } from "./notification-dispatcher.js";
import { D1Repository } from "./repository.js";
export function notificationRepository(env: OnlineEnv, userId: string) {
  return new D1Repository(
    env.DB,
    userId,
    (event) => dispatchNotifications(env, event.projectId),
    env.ATTACHMENTS,
  );
}
