import { logger } from '../logger'

export default class Engine {
  constructor(transporter) {
    this.clearChecks()
    this.clearHandlers()
    this.transporter = transporter
  }

  addCheck(check) {
    this.checks.push(check)
  }

  addChecks(checks) {
    checks.map(check => this.addCheck(check))
  }

  clearChecks() {
    this.checks = []
  }

  addHandler(name, handler) {
    this.handlers[name] = handler
  }

  addHandlers(handlers) {
    handlers.map(([name, fn]) => this.addHandler(name, fn))
  }

  delHandler(name) {
    delete this.handlers[name]
  }

  clearHandlers() {
    this.handlers = {}
  }

  sendAlert(text, body) {
    if (!this.transporter) {
      throw new Error('No transporter specified for alerts')
    }
    return this.transporter.sendAll(text, body)
  }

  async execute() {
    for (const check of this.checks) {
      const alert = await check.execute()
      if (!alert) {
        continue
      }

      // Failed check execute handler
      try {
        if (!(alert.name in this.handlers)) {
          throw new Error(`Unhandled alert (${alert.name})`)
        }

        await this.handlers[alert.name](alert, this)
      } catch (err) {
        logger.error(err)
      }
      break
    }
  }
}
