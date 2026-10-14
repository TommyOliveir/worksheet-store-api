# Teacher Worksheet Marketplace Backend

NestJS REST API for buying and selling worksheets, powered by Prisma, Neon PostgreSQL, Passport, and JWT.

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Setup environment variables:
   ```bash
   cp .env.example .env
   # Update DATABASE_URL with your Neon PostgreSQL connection string
   ```

3. Generate Prisma client & push schema:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. Run the application:
   ```bash
   npm run start:dev
   ```
