import pino from 'pino';

const IS_PROD = process.env.NODE_ENV === 'production';

const logger = pino(
  IS_PROD
    ? { level: 'info' }
    : { level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } } }
);

export default logger;
