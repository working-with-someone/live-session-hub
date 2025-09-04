import { Prisma } from '@prisma/client';
import prismaClient from '../../src/database/clients/prisma';

type CurrentUser = Prisma.userGetPayload<{
  include: {
    pfp: true;
    email_verification: true;
  };
}>;

class CurrUser implements CurrentUser {
  pfp: Prisma.pfpGetPayload<null>;
  email_verification: Prisma.email_verificationGetPayload<null>;
  id: number;
  username: string;
  encrypted_password: string;
  email: string;
  created_at: Date;
  updated_at: Date;
  followers_count: number;
  followings_count: number;

  constructor() {
    this.id = 1;
    this.username = 'currUser';
    this.encrypted_password =
      '$2b$10$6ZbxBKRk1qdhySGQeN5Iw.CTA4XFCVGL9KHkZnabitdjSRegvBif2';
    this.email = 'email@test.com';
    this.pfp = {
      curr: '/media/images/default/pfp',
      is_default: true,
      user_id: 1,
    };
    this.email_verification = {
      email_verified: true,
      verify_token: 'testVerifyToken',
      created_at: new Date(),
      expired_at: new Date(),
      user_id: 1,
    };
    this.created_at = new Date();
    this.updated_at = new Date();

    this.followers_count = 0;
    this.followings_count = 0;
  }

  async insert() {
    if (await this.isInserted()) {
      throw new Error('curr user already inserted');
    }

    await prismaClient.user.create({
      data: {
        id: this.id,
        username: this.username,
        email: this.email,
        encrypted_password: this.encrypted_password,
        created_at: this.created_at,
        updated_at: this.updated_at,
      },
    });

    await prismaClient.pfp.create({
      data: this.pfp,
    });

    await prismaClient.email_verification.create({
      data: this.email_verification,
    });
  }

  async restore() {
    if (!(await this.isInserted())) {
      throw new Error('curr user does not inserted');
    }

    await prismaClient.user.update({
      where: {
        id: this.id,
      },
      data: {
        username: this.username,
        email: this.email,
        encrypted_password: this.encrypted_password,
        created_at: this.created_at,
        updated_at: this.updated_at,
      },
    });

    await prismaClient.pfp.update({
      where: {
        user_id: this.id,
      },
      data: this.pfp,
    });

    await prismaClient.email_verification.update({
      where: {
        user_id: this.id,
      },
      data: this.email_verification,
    });
  }

  async delete() {
    await prismaClient.user.delete({
      where: {
        id: this.id,
      },
      include: {
        email_verification: true,
      },
    });
  }

  async isInserted() {
    const currUser = await prismaClient.user.findFirst({
      where: {
        id: this.id,
      },
    });

    if (currUser) {
      return true;
    }

    return false;
  }
}

const currUser = new CurrUser();

export default currUser;
