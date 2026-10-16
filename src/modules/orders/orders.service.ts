import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Order, OrderStatus } from '@prisma/client';
import { StripeService } from '../stripe/stripe.service';

export interface VerifiedCheckoutSessionItem {
  id: string;
  title: string;
  price: number;
  downloadUrl?: string;
}

export interface VerifiedCheckoutSession {
  sessionId: string;
  status: 'paid' | 'pending' | 'failed';
  email?: string;
  total: number;
  items: VerifiedCheckoutSessionItem[];
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
  ) {}

  // STEP 1: Called BEFORE redirecting to Stripe
  async createPendingOrder(
    userId: string,
    worksheetIds: string[],
  ): Promise<Order> {
    const uniqueIds = [...new Set(worksheetIds)];

    const worksheets = await this.prisma.worksheet.findMany({
      where: { id: { in: uniqueIds } },
    });

    if (worksheets.length !== uniqueIds.length) {
      throw new NotFoundException('One or more worksheets not found');
    }

    const totalAmount = worksheets.reduce((sum, w) => sum + Number(w.price), 0);

    // Create order with PENDING status
    return this.prisma.order.create({
      data: {
        userId,
        totalAmount,
        status: OrderStatus.PENDING, // <-- Crucial Fix: Start as PENDING
        items: {
          create: worksheets.map((w) => ({
            worksheetId: w.id,
            price: w.price,
          })),
        },
      },
      include: {
        items: {
          include: {
            worksheet: true,
          },
        },
      },
    });
  }

  // STEP 2: Called ONLY by the Stripe Webhook Handler
  // STEP 2: Called ONLY by the Stripe Webhook Handler
  async fulfillOrder(
    orderId: string,
    stripePaymentIntentId: string,
  ): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Prevent duplicate fulfillment (idempotency check)
    if (order.status === OrderStatus.COMPLETED) {
      return order;
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.COMPLETED,
        paymentIntentId: stripePaymentIntentId, // <-- Using the parameter here
      },
      include: {
        items: {
          include: {
            worksheet: true,
          },
        },
      },
    });
  }
  // STEP 3: Called by the frontend success page. Verifies the session against
  // Stripe directly rather than trusting the redirect, then reports the local
  // order's fulfillment status (the webhook may not have landed yet).
  async getCheckoutSessionDetails(
    sessionId: string,
  ): Promise<VerifiedCheckoutSession> {
    let session;
    try {
      session = await this.stripeService.retrieveSession(sessionId);
    } catch {
      throw new NotFoundException('Checkout session not found');
    }

    const orderId = session.metadata?.orderId;
    if (!orderId) {
      throw new NotFoundException('Checkout session not found');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        items: { include: { worksheet: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const status: VerifiedCheckoutSession['status'] =
      order.status === OrderStatus.COMPLETED
        ? 'paid'
        : order.status === OrderStatus.PENDING
          ? 'pending'
          : 'failed';

    return {
      sessionId,
      status,
      email: order.user.email,
      total: Number(order.totalAmount),
      items: order.items.map((item) => ({
        id: item.id,
        title: item.worksheet.title,
        price: Number(item.price),
        downloadUrl: status === 'paid' ? item.worksheet.fileUrl : undefined,
      })),
    };
  }

  async findUserOrders(userId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: {
        userId,
        status: OrderStatus.COMPLETED, // Only return successfully paid orders
      },
      include: {
        items: {
          include: {
            worksheet: true,
          },
        },
      },
    });
  }
}
