import { verifyWebhook } from '@clerk/express/webhooks';
import { AppError } from '../shared/errors.js';

function identity(data) {
  const primary = data.email_addresses?.find((item) => item.id === data.primary_email_address_id)
    || data.email_addresses?.[0];
  if (!primary?.email_address) throw new AppError(400, 'INVALID_WEBHOOK', 'Clerk user has no email address');
  return {
    clerkUserId: data.id,
    email: primary.email_address.trim().toLowerCase(),
    firstName: data.first_name || null,
    lastName: data.last_name || null
  };
}

export function createClerkWebhookHandler({ users, webhookVerifier = verifyWebhook }) {
  return async (req, res, next) => {
    try {
      let event;
      try { event = await webhookVerifier(req); }
      catch { throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Invalid webhook signature'); }

      if (event.type === 'user.created' || event.type === 'user.updated') {
        await users.upsertIdentity(identity(event.data));
      } else if (event.type === 'user.deleted' && event.data.id) {
        await users.disableByClerkId(event.data.id);
      }
      return res.status(200).json({ success: true });
    } catch (error) { return next(error); }
  };
}
