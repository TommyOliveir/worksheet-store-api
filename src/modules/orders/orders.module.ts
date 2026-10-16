import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { StripeModule } from '../stripe/stripe.module';
import { WorksheetsModule } from '../worksheets/worksheets.module';

@Module({
  imports: [StripeModule, WorksheetsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
