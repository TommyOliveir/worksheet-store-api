import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorksheetsService } from './worksheets.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User, Role } from '@prisma/client';
import { PublicWorksheet } from './types/worksheet.types';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('worksheets')
export class WorksheetsController {
  constructor(private readonly worksheetsService: WorksheetsService) {}

  @UseGuards(JwtAuthGuard)
  @Get(':id/download')
  async download(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.worksheetsService.generateDownloadUrl(userId, id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async create(
    @Req()
    req: Request & {
      user: { id: string; role: string };
    },
    @Body() dto: CreateWorksheetDto,
  ) {
    return this.worksheetsService.create(req.user.id, dto);
  }

  @Public()
  @Get()
  async findAll(): Promise<PublicWorksheet[]> {
    return this.worksheetsService.findAll();
  }

  @Public()
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<PublicWorksheet> {
    return this.worksheetsService.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PublicWorksheet> {
    return this.worksheetsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @GetUser() user: Omit<User, 'password'>,
    @Body() dto: UpdateWorksheetDto,
  ): Promise<PublicWorksheet> {
    return this.worksheetsService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @GetUser() user: Omit<User, 'password'>,
  ): Promise<PublicWorksheet> {
    return this.worksheetsService.remove(id, user.id, user.role);
  }
}
