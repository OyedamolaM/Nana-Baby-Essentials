# Payment emails

Paid store orders queue a customer receipt (with PDF) and a support notification.
Registry item/cash gifts and delivery gifts queue a giver receipt and an owner
notification. Registry delivery checkout queues a receipt for its payer. Fees
added by Paystack are excluded from the registry contribution amount in emails.

Jobs are inserted by database triggers in the same transaction as the paid
ledger. Next.js `after` attempts delivery after the payment response. A scheduler
must drain the durable queue when these immediate attempts fail or are interrupted.
An email failure does not undo a recorded payment.

## Deployment

1. Apply `20261017_registry_payment_recovery.sql` (if not already applied), then
   `20261018_payment_email_outbox.sql` in Supabase. Fresh installs include both in
   `supabase/setup.sql`. Deploy the application after applying the migrations.
2. Retain `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and the existing order sender and
   support settings. Set `BREVO_SANDBOX_MODE=false` for actual delivery.
3. Generate separate random secrets for `CRON_SECRET` and `BREVO_WEBHOOK_SECRET`.
   Store them in the deployment environment; never put them in source control.
4. Configure a scheduler to call `GET https://YOUR_DOMAIN/api/cron/payment-emails`
   every two minutes, with `Authorization: Bearer YOUR_CRON_SECRET`.
   Use an external scheduler if the hosting plan does not support this interval.
   The endpoint claims at most ten jobs and has a 60-second route limit. Concurrent
   invocations are safe. The scheduler must retry non-successful HTTP responses.
5. Create a Brevo transactional webhook for
   `https://YOUR_DOMAIN/api/brevo/webhook`, with bearer authentication using
   `BREVO_WEBHOOK_SECRET`. Subscribe to `delivered`, `hardBounce`, `softBounce`,
   `blocked`, `spam`, `invalid`, and `deferred` events. Brevo sends their
   corresponding payload event names to the handler.

Brevo's [bearer webhook configuration](https://developers.brevo.com/docs/secured-webhooks)
uses `auth: { "type": "bearer", "token": "YOUR_BREVO_WEBHOOK_SECRET" }` in the
webhook creation request. No production emails are sent by installing the SQL.

## Recovery and monitoring

Admin Registry Accounts → Payment Activity → Check payment verifies the original
Paystack reference, repairs the payment/funding ledger, and queues missing emails.
Repeated recovery reuses the original notification rows. The migration does not
bulk-send receipts for historical payments; ordinary edits of old paid rows do
not queue them either.

Inspect `public.payment_email_outbox` in Supabase. `accepted` means Brevo accepted
the request; `delivered` requires its delivery event. `sandbox` is a dropped test
email. `pending` jobs use exponential retry delays; definitive failures stop
after eight attempts. Permanent provider rejections or bounces are `failed`.

Provider calls have a 15-second timeout and workers hold a two-minute lease.
Brevo's [idempotency window](https://developers.brevo.com/docs/heterogenous-versions-batch-emails)
is 30 minutes. If a network interruption leaves acceptance uncertain, the worker
retries the same key only within 25 minutes, then marks the job `review`. This
avoids silently resending a possibly accepted email after the provider window
expires. Check Brevo logs for the payment reference/tag before resolving a review.
Accepted/delivered notifications are never automatically resent.

Only service-role code can access the queue or claim jobs. Both HTTP endpoints
reject requests when their authentication secret is missing or incorrect.
