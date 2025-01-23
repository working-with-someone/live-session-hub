import prismaClient from '../../../src/database/clients/prisma';
import testUserData from '../../data/user.json';

export default async function globalSetup() {
  // curr user를 추가한다.
  await prismaClient.user.create({
    data: {
      ...testUserData.currUser,
      pfp: {},
    },
  });
}
