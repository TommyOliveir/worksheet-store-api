import { Controller, Post, Get, Body } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Order } from '@prisma/client';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async create(
    @GetUser('id') userId: string,
    @Body('worksheetIds') worksheetIds: string[],
  ): Promise<Order> {
    return this.ordersService.createOrder(userId, worksheetIds);
  }

  @Get()
  async findAll(@GetUser('id') userId: string): Promise<Order[]> {
    return this.ordersService.findUserOrders(userId);
  }
}
