import winston from 'winston'

export const logger = new winston.Logger()

export const setupLogger = verbose => {
  logger.add(winston.transports.Console, {
    level: verbose ? 'debug' : 'info',
    prettyPrint: true,
    colorize: true,
    silent: false,
    timestamp: true
  })
}
