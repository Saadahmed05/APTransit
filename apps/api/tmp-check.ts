import { PrismaService } from './src/prisma/prisma.service';

(async () => {
  const cfg = { get: (k) => process.env[k] };
  const prisma = new PrismaService(cfg as any);
  const rows = await prisma.stop.findMany({
    where: {
      OR: [
        { nameEn: { contains: 'kurn', mode: 'insensitive' } },
        { nameTe: { contains: 'kurn' } },
      ],
    },
    select: {
      id: true,
      nameEn: true,
      nameTe: true,
      busStandId: true,
      district: { select: { nameEn: true, nameTe: true } },
    },
    take: 10,
  });
  console.log(JSON.stringify(rows, null, 2));
  await prisma.$disconnect();
})();
