import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Order, OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrder(userId: string, worksheetIds: string[]): Promise<Order> {
    const worksheets = await this.prisma.worksheet.findMany({
      where: { id: { in: worksheetIds } },
    });

    if (worksheets.length !== worksheetIds.length) {
      throw new NotFoundException('One or more worksheets not found');
    }

    const totalAmount = worksheets.reduce((sum, w) => sum + Number(w.price), 0);

    return this.prisma.order.create({
      data: {
        userId,
        totalAmount,
        status: OrderStatus.COMPLETED,
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

  async findUserOrders(userId: string): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { userId },
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
