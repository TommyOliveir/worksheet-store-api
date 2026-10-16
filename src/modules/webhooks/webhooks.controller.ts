import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  InternalServerErrorException,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { OrdersService } from '../orders/orders.service';
import { StripeService } from '../stripe/stripe.service';
import { Public } from '../../common/decorators/public.decorator';
import Stripe from 'stripe';

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly stripeService: StripeService,
  ) {}

  @Public() // Stripe sends no JWT; signature verification is the auth here
  @Post('stripe')
  @HttpCode(HttpStatus.OK) // Returns HTTP 200 automatically
  async handleStripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    let event: Stripe.Event;

    try {
      event = this.stripeService.constructEvent(req.rawBody, signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new BadRequestException(`Webhook Signature Error: ${message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const stripePaymentIntentId = session.payment_intent as string;

      if (orderId) {
        try {
          await this.ordersService.fulfillOrder(orderId, stripePaymentIntentId);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          throw new InternalServerErrorException(
            `Failed to fulfill order ${orderId}: ${message}`,
          );
        }
      }
    }

    return { received: true };
  }
}
