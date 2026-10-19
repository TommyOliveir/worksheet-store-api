import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { OrdersService, VerifiedCheckoutSession } from './orders.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Order } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { StripeService } from '../stripe/stripe.service';

// Interface matching what JwtAuthGuard attaches to request
interface AuthenticatedUser {
  id: string;
  email: string;
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly stripeService: StripeService,
  ) {}

  @Get()
  async findAll(@GetUser('id') userId: string): Promise<Order[]> {
    return this.ordersService.findUserOrders(userId);
  }

  // Requires login: the session id proves the checkout happened, but access
  // to its contents is also scoped to the logged-in user who owns the order,
  // so a shared/leaked link can't be used to view someone else's purchase.
  @Get('session/:sessionId')
  async getCheckoutSession(
    @Param('sessionId') sessionId: string,
    @GetUser('id') userId: string,
  ): Promise<VerifiedCheckoutSession> {
    return this.ordersService.getCheckoutSessionDetails(sessionId, userId);
  }

  @Post('checkout')
  async checkout(
    @GetUser() user: AuthenticatedUser,
    @Body('worksheetIds') worksheetIds: string[],
  ) {
    // Step 1: Create local order in Prisma DB (status: PENDING)
    const order = await this.ordersService.createPendingOrder(
      user.id,
      worksheetIds,
    );

    // Step 2: Call createCheckoutSession using the created order details
    const session = await this.stripeService.createCheckoutSession(
      order.id, // Pass the local DB order ID
      Number(order.totalAmount), // Total amount to charge
      user.email, // Pre-fill user email in Stripe
    );

    // Step 3: Return the Stripe redirect URL to the frontend
    return { url: session.url };
  }
}
