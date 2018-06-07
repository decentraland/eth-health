#!/usr/bin/env babel-node

import minimist from 'minimist'
import os from 'os'
import Engine from './engine'
import {
  NodeConnectionCheck,
  ReferenceNodeCheck,
  BlocksAwayCheck
} from './checks/node'
import { logger, setupLogger } from './logger'
import { Transporter, EmailTransport, SlackTransport } from './transports'

let opts = null
let transporter = null

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

const alertToMessage = {
  refConnectionError: () => {
    return { text: `(${os.hostname()}) Etherscan connection error` }
  },
  ethConnectionError: () => {
    return { text: `(${os.hostname()}) ETH node connection error` }
  },
  noBlockNumbersError: () => {
    return { text: `(${os.hostname()}) Unable to fetch block numbers :(` }
  },
  blocksAwayError: alert => {
    const { blocksAway } = alert.params
    return {
      text: `(${os.hostname()}) ETH node lagging behind ${blocksAway} blocks`,
      body: `
      (${os.hostname()}) ETH node is behind REF by ${blocksAway} blocks
    `
    }
  }
}

const handleAlert = (alert, engine) => {
  const { text, body } = alertToMessage[alert.name](alert)
  return engine.sendAlert(text, body)
}

const start = async engine => {
  await engine.execute()
}

//
// Main

if (require.main === module) {
  opts = parseArgs()
  setupLogger(opts.verbose)

  transporter = setupTransporter()

  const engine = new Engine(transporter)
  engine.addHandlers([
    ['refConnectionError', handleAlert],
    ['ethConnectionError', handleAlert],
    ['noBlockNumbersError', handleAlert],
    ['blocksAwayError', handleAlert]
  ])
  engine.addChecks([
    new NodeConnectionCheck(),
    new ReferenceNodeCheck(),
    new BlocksAwayCheck(opts.blocks)
  ])

  Promise.resolve(start(engine)).catch(logger.error)
}
