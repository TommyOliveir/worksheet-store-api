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
import { Worksheet, User, Role } from '@prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('worksheets')
export class WorksheetsController {
  constructor(private readonly worksheetsService: WorksheetsService) {}

  @Public()
  @Get('testdownload')
  async testDownload() {
    // 1. Pass your seeded User ID and Worksheet ID from Neon DB
    const userId = '03e07ef5-498f-4bbe-9e2f-c3621c80b5c9'; // Replace with your seed UserId
    const worksheetId = '025505d1-4476-463e-9816-d790a089e35b'; // Replace with your seed WorksheetId

    // 2. Call your service method
    return this.worksheetsService.generateDownloadUrl(userId, worksheetId);
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
  async findAll(): Promise<Worksheet[]> {
    return this.worksheetsService.findAll();
  }

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Worksheet> {
    return this.worksheetsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @GetUser() user: Omit<User, 'password'>,
    @Body() dto: UpdateWorksheetDto,
  ): Promise<Worksheet> {
    return this.worksheetsService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @GetUser() user: Omit<User, 'password'>,
  ): Promise<Worksheet> {
    return this.worksheetsService.remove(id, user.id, user.role);
  }
}
