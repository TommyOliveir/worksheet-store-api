import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { WorksheetsService } from './worksheets.service';
import { CreateWorksheetDto } from './dto/create-worksheet.dto';
import { UpdateWorksheetDto } from './dto/update-worksheet.dto';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Worksheet, User } from '@prisma/client';

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
  @UseGuards(RolesGuard)
  async create(
    @GetUser('id') authorId: string,
    @Body() dto: CreateWorksheetDto,
  ): Promise<Worksheet> {
    return this.worksheetsService.create(authorId, dto);
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

  // @Public()
  // @Get('testdownload')
  // async testDownload() {
  //   const userId = '124367bd-ed75-49cc-a990-aa2e031749a9'; // Replace with your seed UserId
  //   const worksheetId = '6fbcd5ad-4bf1-4f67-a630-b1fe4a7f91a2'; // Replace with your seed WorksheetId

  //   const downloadResult = await this.worksheetsService.generateDownloadUrl(
  //     userId,
  //     worksheetId,
  //   );

  //   console.log('PRESIGNED URL:', downloadResult.downloadUrl);
  //   return downloadResult;
  // }

  // 2. PRODUCTION ENDPOINT (for actual authenticated users)
  // @Get(':id/download')
  // async getDownloadUrl(@Req() req: any, @Param('id') worksheetId: string) {
  //   return this.worksheetsService.generateDownloadUrl(req.user.id, worksheetId);
  // }
}
