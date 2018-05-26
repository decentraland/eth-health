#!/usr/bin/env babel-node

import axios from 'axios'
import minimist from 'minimist'
import nodemailer from 'nodemailer'
import os from 'os'
import winston from 'winston'

const networkPrefix = process.env.NETWORK === 'ropsten' ? 'ropsten' : 'api'

const ETHERSCAN_URL = `http://${networkPrefix}.etherscan.io/api?module=proxy&action=eth_blockNumber`
const NODE_URL = 'http://localhost:8545'

let opts = null
let transport = null
let logger = null

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

const setupTransport = (user, pass, from, verbose) => {
  return nodemailer.createTransport(
    {
      service: 'Mandrill',
      auth: {
        user: user,
        pass: pass
      },
      logger: true,
      debug: verbose
    },
    {
      from: from
    }
  )
}

const sendMail = (to, subject, text) => {
  if (!to) {
    throw new Error('You need to supply an email to send to')
  }

  const message = { to, subject, text }

  return new Promise((resolve, reject) =>
    transport.sendMail(message, (err, info) => {
      if (err) {
        reject(err, err.stack)
        return
      }
      logger.debug(`Email ${info.messageId} sent: ${info.response}`)
      resolve(info.response)
    })
  )
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

const handleBlocksAway = opts => {
  const { blocksAway } = opts
  return {
    subject: `(${os.hostname()}) ETH node lagging behind`,
    message: `
      (${os.hostname()}) ETH node is behind REF by ${blocksAway} blocks
    `
  }
}

const sendAlert = (handler, email, opts = {}) => {
  let { subject, message } = handler(opts)

  // Add error if available
  if (opts.err) {
    message += '\nStack:\n' + opts.err
  }

  return sendMail(email, subject, message || '')
}

const healthCheck = async () => {
  logger.info('[Health] Node in sync...')

  transport = setupTransport(opts.user, opts.pass, opts.from, opts.verbose)

  try {
    const ethBlockNumber = await getEthBlockNumber()

    try {
      const refBlockNumber = await getRefBlockNumber()

      // Data available
      if (!ethBlockNumber || !refBlockNumber) {
        logger.info('[Health] ❌ Fail => Unable to fetch block numbers')
        return sendAlert(handleNoBlockNumbers, opts.email)
      }

      // Blocks away
      const blocksAway = refBlockNumber - ethBlockNumber
      if (blocksAway > parseInt(opts.blocks)) {
        logger.info(
          `[Health] ❌ Fail => REF (${refBlockNumber}) is ${blocksAway} blocks ahead of node (${ethBlockNumber})`
        )
        return sendAlert(handleBlocksAway, opts.email, { blocksAway })
      }

      logger.info('[Health] ✅ Pass')
    } catch (err) {
      logger.error(err)
      return sendAlert(handleRefConnectionError, opts.email, { err })
    }
  } catch (err) {
    logger.error(err)
    return sendAlert(handleEthConnectionError, opts.email, { err })
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
  Promise.resolve(healthCheck())
}
