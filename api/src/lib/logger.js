import pino from 'pino';

// Check if we're in development
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({

  // Set log level (default: info)
  level: process.env.LOG_LEVEL || 'info',

  // Pretty logs in development, JSON logs in production
  transport: isDev
    ? {
      target: 'pino-pretty',
      options: {
        colorize: true,              // Add colors
        translateTime: 'HH:MM:ss',   // Show readable time
        ignore: 'pid,hostname',      // Hide unnecessary fields
      },
    }
    : undefined,
});