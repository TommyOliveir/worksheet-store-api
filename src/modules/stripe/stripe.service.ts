import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }

  /**
   * Verifies and constructs the Stripe Event from raw body buffer and signature header.
   */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  }

  /**
   * Retrieves a Stripe Checkout Session by its id, used to verify payment
   * status from the frontend success page without trusting the redirect alone.
   */
  async retrieveSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.retrieve(sessionId);
  }

  /**
   * Creates a hosted Stripe Checkout Session for worksheet purchases.
   */
  async createCheckoutSession(
    orderId: string,
    amount: number,
    customerEmail: string,
  ): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create({
      // Removed payment_method_types -> Stripe handles this automatically
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Worksheet Purchase',
              // Required by Stripe Managed Payments, which is on by default
              tax_code: 'txcd_10000000', // General - Electronically Supplied Services
            },
            unit_amount: Math.round(amount * 100), // Stripe expects amounts in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail,
      metadata: {
        orderId, // Attached to map back to local Prisma DB Order ID
      },
      success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/cart`,
    });
  }
}
