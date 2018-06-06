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
    return this.transporter.sendAll(text, body)
  }

  async execute() {
    for (const check of this.checks) {
      const alert = await check.execute()
      if (!alert) {
        continue
      }
      if (!(alert.name in this.handlers)) {
        continue
      }

      // Failed check execute handler
      try {
        await this.handlers[alert.name](alert, this)
      } catch (err) {
        logger.error(err)
      }
      break
    }
  }
}
