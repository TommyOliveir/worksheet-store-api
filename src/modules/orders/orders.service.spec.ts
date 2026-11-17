import { describe, expect, it, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../stripe/stripe.service';

const worksheetA = { id: 'ws-a', title: 'Fractions', price: 3 };
const worksheetB = { id: 'ws-b', title: 'Spelling', price: 2.5 };

function setup({
  worksheets = [worksheetA, worksheetB],
  owned = [] as { worksheet: { title: string } }[],
} = {}) {
  const prisma = {
    worksheet: { findMany: vi.fn().mockResolvedValue(worksheets) },
    orderItem: { findMany: vi.fn().mockResolvedValue(owned) },
    order: { create: vi.fn().mockResolvedValue({ id: 'order-1' }) },
  };
  const service = new OrdersService(
    prisma as unknown as PrismaService,
    {} as StripeService,
  );
  return { prisma, service };
}

describe('OrdersService.createPendingOrder', () => {
  it('creates a PENDING order for worksheets the user does not own', async () => {
    const { prisma, service } = setup();

    await service.createPendingOrder('user-1', ['ws-a', 'ws-b', 'ws-a']);

    const [{ data }] = prisma.order.create.mock.calls[0];
    expect(data).toMatchObject({
      userId: 'user-1',
      totalAmount: 5.5,
      status: OrderStatus.PENDING,
    });
    expect(data.items.create).toHaveLength(2);
  });

  it('refuses a worksheet the user already bought, without creating an order', async () => {
    const { prisma, service } = setup({
      owned: [{ worksheet: { title: 'Fractions' } }],
    });

    await expect(
      service.createPendingOrder('user-1', ['ws-a', 'ws-b']),
    ).rejects.toThrow(new ConflictException('You already own: Fractions'));
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('counts only paid orders as owned', async () => {
    const { prisma, service } = setup({ worksheets: [worksheetA] });

    await service.createPendingOrder('user-1', ['ws-a']);

    // PENDING or FAILED checkouts must not lock the worksheet forever.
    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          worksheetId: { in: ['ws-a'] },
          order: { userId: 'user-1', status: OrderStatus.COMPLETED },
        },
      }),
    );
  });

  it('rejects ids that are not real worksheets', async () => {
    const { prisma, service } = setup({ worksheets: [worksheetA] });

    await expect(
      service.createPendingOrder('user-1', ['ws-a', 'missing']),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });
});
