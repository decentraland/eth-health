import nodemailer from 'nodemailer'
import Transport from './base'
import { logger } from '../logger'

export class EmailTransport extends Transport {
  setup(params) {
    const { email, user, pass, from, verbose } = params
    this.defaultEmail = email

    return nodemailer.createTransport(
      {
        service: 'Mandrill',
        auth: {
          user,
          pass
        },
        logger: true,
        debug: verbose
      },
      {
        from: from
      }
    )
  }

  send(text, body) {
    this.sendTo(this.defaultEmail, text, body)
  }

  sendTo(to, subject, body) {
    if (!to) {
      throw new Error('You need to supply an email to send to')
    }

    const message = { to, subject, body }

    return new Promise((resolve, reject) =>
      this.transport.sendMail(message, (err, info) => {
        if (err) {
          reject(err, err.stack)
          return
        }
        logger.debug(
          `[msg:email] (${info.messageId} ${info.response}) ${to} => ${body}`
        )
        resolve(info.response)
      })
    )
  }
}
