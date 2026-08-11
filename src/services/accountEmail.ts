import { supabase } from '../config/supabase';

export type EmailChangeStatus =
  // auth.users.email changed straight away; the DB trigger has already mirrored
  // it into profiles.email and everything downstream reads the new address.
  | 'applied'
  // The project requires confirmation. auth.users.email still holds the old
  // address until the user clicks the link sent to the new one; the mirror
  // follows at that moment, via the same trigger.
  | 'confirmation_sent';

export interface EmailChangeResult {
  status: EmailChangeStatus;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();

  if (text.includes('already been registered') || text.includes('already registered')) {
    return 'That email address is already in use by another account.';
  }
  if (text.includes('invalid email') || (text.includes('email') && text.includes('invalid'))) {
    return 'Please enter a valid email address.';
  }
  if (text.includes('rate limit') || text.includes('too many')) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }

  return message;
}

export const accountEmailService = {
  /**
   * Changes the signed-in user's login email.
   *
   * Supabase Auth owns the address; public.profiles.email is a mirror kept in
   * step by the users_sync_email_to_profile trigger, so nothing here writes to
   * profiles directly. Whether the new address takes effect immediately or
   * after a confirmation click depends on the project's auth settings, so both
   * outcomes are reported back to the caller.
   */
  async changeEmail(
    newEmail: string,
    currentPassword: string,
    currentEmail: string,
  ): Promise<EmailChangeResult> {
    const trimmedEmail = newEmail.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      throw new Error('Please enter a valid email address.');
    }

    if (trimmedEmail === currentEmail.trim().toLowerCase()) {
      throw new Error('That is already your email address.');
    }

    // Re-authenticate before touching the login identity. Mirrors the password
    // form's check so a walked-away-from session can't be used to take over the
    // account by moving its email.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    });

    if (verifyError) {
      throw new Error('Current password is incorrect');
    }

    const { data, error } = await supabase.auth.updateUser({ email: trimmedEmail });

    if (error) {
      throw new Error(friendlyAuthError(error.message || 'Failed to update email'));
    }

    const applied =
      (data?.user?.email || '').toLowerCase() === trimmedEmail;

    if (applied) {
      // Only worth doing once the address is real. On the confirmation path
      // this runs later, from the USER_UPDATED handler in useAuth.
      await accountEmailService.syncStripeCustomerEmail();
      return { status: 'applied', email: trimmedEmail };
    }

    return { status: 'confirmation_sent', email: trimmedEmail };
  },

  /**
   * Best-effort push of the caller's verified auth email onto their Stripe
   * customer record, so invoices and receipts follow the change. Billing mail
   * is not worth failing an otherwise-successful email change over, so this
   * never throws.
   */
  async syncStripeCustomerEmail(): Promise<void> {
    try {
      const { error } = await supabase.functions.invoke('sync-stripe-customer-email');
      if (error) {
        console.warn('Failed to sync Stripe customer email', error);
      }
    } catch (err) {
      console.warn('Failed to sync Stripe customer email', err);
    }
  },
};
