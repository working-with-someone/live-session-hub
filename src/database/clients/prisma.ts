import { PrismaClient } from '@prisma/client';

const prismaClient = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'stdout',
      level: 'error',
    },
    {
      emit: 'stdout',
      level: 'warn',
    },
  ],
});

prismaClient.$on('query', (e) => {
  const message = `${e.query} / ${e.params} / ${e.duration}`;
});

export default prismaClient;
