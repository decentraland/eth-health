import { IncomingWebhook } from '@slack/client'
import Transport from './base'
import { logger } from '../logger'

export class SlackTransport extends Transport {
  setup(params) {
    const { channel, slackws } = params
    this.defaultChannel = channel
    return new IncomingWebhook(slackws)
  }

  send(text, body) {
    return this.sendTo(this.defaultChannel, text, body)
  }

  sendTo(channel, text, body) {
    const payload = { text, channel }

    return new Promise((resolve, reject) => {
      this.transport.send(payload, (err, res) => {
        if (err) {
          reject(err, err.stack)
          return
        }
        logger.debug(`[msg:slack] #${channel} => ${text}`)
        resolve(res)
      })
    })
  }
}
