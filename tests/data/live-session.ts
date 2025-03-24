import { Prisma } from '@prisma/client';
import prismaClient from '../../src/database/clients/prisma';
import fs from 'node:fs';
import { faker } from '@faker-js/faker';

interface CreateTestLiveSessionCreationInput
  extends Pick<
    Prisma.live_sessionGetPayload<true>,
    'access_level' | 'organizer_id' | 'status'
  > {
  break_time?: Pick<
    Prisma.live_session_break_timeCreateInput,
    'interval' | 'duration'
  >;
}

export type CreatedTestLiveSession = Prisma.live_sessionGetPayload<true>;

export async function createTestLiveSession(
  data: CreateTestLiveSessionCreationInput
): Promise<CreatedTestLiveSession> {
  const liveSession = await prismaClient.live_session.create({
    data: {
      id: faker.string.uuid(),
      title: faker.lorem.words(3),
      description: faker.lorem.sentence(),
      thumbnail_uri: faker.image.url(),
      stream_key: faker.string.uuid(),
      category: 'study',
      access_level: data.access_level,
      organizer_id: data.organizer_id,
      status: data.status,

      break_time: {
        create: data.break_time,
      },
    },
  });

  return liveSession;
}

export const sampleLiveSessionFields = {
  title: faker.lorem.words(3),
  description: faker.lorem.sentence(),
  category: 'study',
  getThumbnailReadable: () =>
    fs.createReadStream('./tests/data/images/image.png'),
};

export const sampleBreakTimeFields: Pick<
  Prisma.live_session_break_timeCreateInput,
  'interval' | 'duration'
> = {
  interval: 50,
  duration: 10,
};
