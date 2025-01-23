declare namespace NodeJS {
  interface ProcessEnv {
    PROTOCOL: string;
    HOST: string;
    PORT: string;
    SERVER_URL: string;
    WWS_CLIENT_APP_ORIGIN: string;

    APP_SECRET: string;
    TOKEN_USER_SECRET: string;

    DATABASE_HOST: string;
    DATABASE_PORT: string;
    DATABASE_NAME: string;
    DATABASE_USER: string;
    DATABASE_PASSWORD: string;

    DATABASE_URL: string;

    REDIS_HOST: string;
    REDIS_PORT: string;

    REDIS_NAME: string;
    REDIS_DATABASE_NUMBER: string;

    REDIS_USERNAME: string;
    REDIS_PASSWORD: string;
  }
}
