import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';

export const GetUser = createParamDecorator(
  (data: keyof Omit<User, 'password'> | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ user: Omit<User, 'password'> }>();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);
