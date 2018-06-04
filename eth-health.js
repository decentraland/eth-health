#!/usr/bin/env babel-node

import axios from 'axios'
import minimist from 'minimist'
import os from 'os'
import { logger, setupLogger } from './logger'
import { EmailTransport, SlackTransport } from './transports'

const networkPrefix = process.env.NETWORK === 'ropsten' ? 'ropsten' : 'api'

const ETHERSCAN_URL = `http://${networkPrefix}.etherscan.io/api?module=proxy&action=eth_blockNumber`
const NODE_URL = 'http://localhost:8545'

let opts = null
let transporter = null

class Transporter {
  constructor() {
    this.clearTransports()
  }

  addTransport(name, transport) {
    this.transports[name] = transport
  }

  delTransport(name) {
    delete this.transporter.name
  }

  clearTransports() {
    this.transports = {}
  }

  send(name, text, body) {
    const transport = this.transports[name]
    if (transport) {
      return transport.send(text, body)
    }
    return null
  }

  sendAll(text, body) {
    return Promise.all(
      Object.values(this.transports).map(transport =>
        transport.send(text, body)
      )
    )
  }
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
  return { text: `(${os.hostname()}) Etherscan connection error` }
}

const handleEthConnectionError = () => {
  return { text: `(${os.hostname()}) ETH node connection error` }
}

const handleNoBlockNumbers = () => {
  return {
    text: `(${os.hostname()}) Unable to fetch block numbers :(`
  }
}

const handleBlocksAway = params => {
  const { blocksAway } = params
  return {
    text: `(${os.hostname()}) ETH node lagging behind ${blocksAway} blocks`,
    body: `
      (${os.hostname()}) ETH node is behind REF by ${blocksAway} blocks
    `
  }
}

const sendAlert = (handler, params = {}) => {
  let { text, body } = Object.assign({ body: '' }, handler(params))

  // Add error if available
  if (params.err) {
    body += '\nStack:\n' + params.err
  }

  // Send notifications
  return transporter.sendAll(text, body)
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

const setupTransporter = () => {
  const transporter = new Transporter()
  if (opts.email) {
    transporter.addTransport(
      'email',
      new EmailTransport({
        email: opts.email,
        user: opts.user,
        pass: opts.pass,
        from: opts.from,
        verbose: opts.verbose
      })
    )
  }
  if (opts.slackws) {
    transporter.addTransport(
      'slack',
      new SlackTransport({
        channel: opts.channel,
        slackws: opts.slackws
      })
    )
  }
  return transporter
}

//
// Main

if (require.main === module) {
  opts = parseArgs()
  setupLogger(opts.verbose)

  // Transporter
  transporter = setupTransporter()

  // Run checks
  Promise.resolve(healthCheck())
}
