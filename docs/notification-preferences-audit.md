# Notification Preferences Audit

## Status

`no_change_needed`

## Scope

This audit follows a saved notification preference from persistence to the
in-app notification center.

## Findings

- Preferences are stored server-side per wallet by
  `NotificationPreferencesStore` and exposed through
  `/api/notification-preferences`. A missing row defaults both categories to
  enabled.
- `useNotificationPreferences` loads the authenticated wallet's preferences
  and applies optimistic updates. The preferences API only reads and writes
  settings; it does not deliver notification events.
- `useNotifications` reads events from the shared indexer event cache, derives
  wallet-relevant `milestone_approval` and `contact_unlock` notifications, and
  then calls `applyNotificationPreferences` before returning notifications and
  calculating `unreadCount`.
- Enforcement therefore happens client-side in `useNotifications`, not
  server-side. The current in-app notification flow has no `/api/notifications`
  delivery route to filter; `/api/notifications/read` only persists read IDs.
- `__tests__/hooks/useNotifications.test.ts` asserts that disabling
  `milestoneApprovals` removes milestone notifications while retaining contact
  notifications. The equivalent pure filtering behavior is also covered in
  `__tests__/lib/notifications.test.ts`.

## Conclusion

The saved channel preferences do affect which notifications appear in the
in-app bell/panel and which notifications contribute to the unread count. No
implementation change is required for the current delivery path.

This is not a push or email preference system: those delivery channels do not
exist in the current application. Any future server-side or external delivery
producer must independently load the wallet preferences and enforce the same
category mapping.
