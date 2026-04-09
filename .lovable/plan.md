## Plan: Clickable Coaching Notifications

### 1. Add `action_url` column to notifications table
- Add nullable `action_url` text column to store the target route (e.g. `/admin?tab=booking-logs&bookingId=xyz`)

### 2. Update notification creation (edge function)
- In `send-notification-email` or wherever coaching request notifications are inserted, include the `action_url` pointing to the admin booking logs tab with the booking ID as a query param

### 3. Update NotificationBell component
- When a notification has an `action_url`, clicking it navigates (via `useNavigate`) to that URL instead of just marking as read
- Mark as read on click as well

### 4. Update Admin Booking Logs tab
- Read `bookingId` from URL query params
- If present, auto-highlight or scroll to that booking and show the approve/reject actions

### 5. Mobile friendly
- Ensure the notification popover works well on mobile (already uses ScrollArea)
- The booking logs tab already has responsive design per existing patterns

**Files to change:**
- Migration: add `action_url` to `notifications`
- `supabase/functions/send-notification-email/index.ts` — include action_url on coaching notifications
- `src/components/NotificationBell.tsx` — navigate on click
- `src/components/admin/AdminBookingLogsTab.tsx` — handle bookingId query param
