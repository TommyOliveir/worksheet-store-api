import { Controller, Get, Patch, Body } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { User } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getProfile(
    @GetUser('id') userId: string,
  ): Promise<Omit<User, 'password'>> {
    return this.usersService.findProfile(userId);
  }

  @Patch('me')
  async updateProfile(
    @GetUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ): Promise<Omit<User, 'password'>> {
    return this.usersService.updateProfile(userId, dto);
  }
}
