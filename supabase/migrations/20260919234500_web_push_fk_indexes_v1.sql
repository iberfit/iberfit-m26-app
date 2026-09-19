-- IBERFIT Web Push FK indexes v1
-- Cover new foreign keys introduced by the Web Push delivery/preferences layer.

create index if not exists iberfit_notification_preferences_user_idx
  on public.iberfit_notification_preferences(user_id);

create index if not exists iberfit_web_push_delivery_attempts_subscription_idx
  on public.iberfit_web_push_delivery_attempts(subscription_id);

create index if not exists iberfit_web_push_dispatch_kicks_org_idx
  on public.iberfit_web_push_dispatch_kicks(organization_id);

create index if not exists iberfit_web_push_dispatch_kicks_actor_idx
  on public.iberfit_web_push_dispatch_kicks(actor_user_id);
