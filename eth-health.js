#!/usr/bin/env babel-node

import axios from 'axios'
import minimist from 'minimist'
import nodemailer from 'nodemailer'
import os from 'os'
import { IncomingWebhook } from '@slack/client'
import winston from 'winston'

const networkPrefix = process.env.NETWORK === 'ropsten' ? 'ropsten' : 'api'

const ETHERSCAN_URL = `http://${networkPrefix}.etherscan.io/api?module=proxy&action=eth_blockNumber`
const NODE_URL = 'http://localhost:8545'

let logger = null
let opts = null
let emailTransport = null
let slackTransport = null

const setupLogging = verbose => {
  const log = new winston.Logger()
  log.add(winston.transports.Console, {
    level: verbose ? 'debug' : 'info',
    prettyPrint: true,
    colorize: true,
    silent: false,
    timestamp: true
  })
  return log
}

const setupEmailTransport = (user, pass, from, verbose) => {
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

const setupSlackTransport = url => {
  return new IncomingWebhook(url)
}

const sendEmailMessage = (to, subject, text) => {
  if (!to) {
    throw new Error('You need to supply an email to send to')
  }

  const message = { to, subject, text }

  return new Promise((resolve, reject) =>
    emailTransport.sendMail(message, (err, info) => {
      if (err) {
        reject(err, err.stack)
        return
      }
      logger.debug(
        `[msg:email] (${info.messageId} ${info.response}) ${to} => ${text}`
      )
      resolve(info.response)
    })
  )
}

const sendSlackMessage = (text, channel) => {
  const payload = { text, channel }

  return new Promise((resolve, reject) => {
    slackTransport.send(payload, (err, res) => {
      if (err) {
        reject(err, err.stack)
        return
      }
      logger.debug(`[msg:slack] #${channel} => ${text}`)
      resolve(res)
    })
  })
}

const getEthBlockNumber = () => {
  return axios
    .post(NODE_URL, {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    })
    .then(res => {
      return parseInt(res.data.result)
    })
}

const getRefBlockNumber = () => {
  return axios.get(ETHERSCAN_URL).then(res => {
    return parseInt(res.data.result)
  })
}

const handleRefConnectionError = () => {
  return {
    subject: `(${os.hostname()}) Etherscan connection error`
  }
}

const handleEthConnectionError = () => {
  return {
    subject: `(${os.hostname()}) ETH node connection error`
  }
}

const handleNoBlockNumbers = () => {
  return {
    subject: `(${os.hostname()}) Unable to fetch block numbers :(`
  }
}

const handleBlocksAway = params => {
  const { blocksAway } = params
  return {
    subject: `(${os.hostname()}) ETH node lagging behind ${blocksAway} blocks`,
    message: `
      (${os.hostname()}) ETH node is behind REF by ${blocksAway} blocks
    `
  }
}

const sendAlert = (handler, params = {}) => {
  let { subject, message } = Object.assign({ message: '' }, handler(params))

  // Add error if available
  if (params.err) {
    message += '\nStack:\n' + params.err
  }

  // Send notifications
  const tasks = []
  if (emailTransport) {
    tasks.push(sendEmailMessage(opts.email, subject, message))
  }
  if (slackTransport) {
    tasks.push(sendSlackMessage(subject, opts.channel))
  }
  return Promise.all(tasks)
}

const healthCheck = async () => {
  logger.info('[Health] Node in sync...')

  try {
    const ethBlockNumber = await getEthBlockNumber()

    try {
      const refBlockNumber = await getRefBlockNumber()

      // Data available
      if (!ethBlockNumber || !refBlockNumber) {
        logger.info('[Health] ❌ Fail => Unable to fetch block numbers')
        return sendAlert(handleNoBlockNumbers)
      }

      // Blocks away
      const blocksAway = refBlockNumber - ethBlockNumber
      if (blocksAway > parseInt(opts.blocks)) {
        logger.info(
          `[Health] ❌ Fail => REF (${refBlockNumber}) is ${blocksAway} blocks ahead of node (${ethBlockNumber})`
        )
        return sendAlert(handleBlocksAway, { blocksAway })
      }

      logger.info('[Health] ✅ Pass')
    } catch (err) {
      logger.error(err)
      return sendAlert(handleRefConnectionError, { err })
    }
  } catch (err) {
    logger.error(err)
    return sendAlert(handleEthConnectionError, { err })
  }
}

const parseArgs = () => {
  return minimist(process.argv.slice(2), {
    default: {
      blocks: 10,
      verbose: false
    },
    boolean: ['verbose']
  })
}

//
// Main

if (require.main === module) {
  opts = parseArgs()
  logger = setupLogging(opts.verbose)

  // Enable transports
  if (opts.email) {
    emailTransport = setupEmailTransport(
      opts.user,
      opts.pass,
      opts.from,
      opts.verbose
    )
  }
  if (opts.slackws) {
    slackTransport = setupSlackTransport(opts.slackws)
  }

  // Run checks
  Promise.resolve(healthCheck())
}
