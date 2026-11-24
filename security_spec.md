# TASKFLOW Firestore Security Specification

## 1. Data Invariants
1. **Strict UID Ownership**: Every document in `/users/{userId}` and all subcollections (`/tasks`, `/projects`, `/subjects`, `/assignments`, `/exams`, `/studySessions`, `/routineSlots`, `/calendarEvents`, `/notes`, `/activities`) belongs strictly to `userId` (`request.auth.uid == userId`).
2. **No Cross-User Access or User Enumeration**: `allow list` on `/users` is strictly forbidden (`false`). A signed-in user can only `get`, `create`, `update`, or `delete` within their own `/users/{request.auth.uid}` subtree.
3. **Immutable Ownership & Identity**: `uid` (on root workspace) and `id` + `ownerUid` (on subcollection items) must match the path parameter and `request.auth.uid` on creation, and cannot be altered on update.
4. **No Shadow / Ghost Fields**: Every collection enforces strict `keys().hasAll(...)` and `keys().hasOnly(...)` on create, and `affectedKeys().hasOnly(...)` + `isValid[Entity](incoming())` on update.
5. **Bounded Strings & Arrays**: All strings have explicit `.size() <= MAX` limits and all arrays (tags, subtasks, attachments, milestones, chapters, topics, revisionDates) have explicit `.size() <= MAX` limits to prevent resource exhaustion.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Read**: `GET /users/uid_alice/tasks/tsk_1` with `auth = null`.
2. **Cross-User Read**: `GET /users/uid_alice/tasks/tsk_1` with `auth.uid = 'uid_bob'`.
3. **User Enumeration Query**: `LIST /users` with `auth.uid = 'uid_bob'`.
4. **Cross-User Subcollection List**: `LIST /users/uid_alice/notes` with `auth.uid = 'uid_bob'`.
5. **Owner Spoofing on Create**: `CREATE /users/uid_bob/tasks/tsk_1` with `{ id: 'tsk_1', ownerUid: 'uid_alice', ... }`.
6. **ID Poisoning on Path**: `CREATE /users/uid_bob/tasks/bad$id..with/chars` or >128 chars.
7. **Shadow / Ghost Field Injection**: `CREATE /users/uid_bob/tasks/tsk_1` with extra `{ isAdmin: true }`.
8. **Shadow Field on Update**: `UPDATE /users/uid_bob/tasks/tsk_1` adding `{ role: 'superuser' }`.
9. **Immutable Owner Tampering**: `UPDATE /users/uid_bob/tasks/tsk_1` changing `ownerUid` to `'uid_alice'`.
10. **Invalid Enum Value Poisoning**: `CREATE /users/uid_bob/tasks/tsk_1` with `priority: 'SUPER_URGENT'`.
11. **Oversized Payload Attack**: `CREATE /users/uid_bob/notes/nte_1` with `content` exceeding 20,000 characters.
12. **Unbounded Array Attack**: `CREATE /users/uid_bob/tasks/tsk_1` with `tags` array of 500 elements.
