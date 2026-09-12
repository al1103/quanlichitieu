const { PrismaClient } = require('@prisma/client');

// Khởi tạo Prisma để thao tác với Database
const prisma = new PrismaClient();

module.exports = prisma;
