import axios from 'axios'
import Check from '.'
import Alert from '../alerts'
import { logger } from '../logger'

const networkPrefix = process.env.NETWORK === 'ropsten' ? 'ropsten' : 'api'

const NODE_URL = 'http://localhost:8545'
const ETHERSCAN_URL = `http://${networkPrefix}.etherscan.io/api?module=proxy&action=eth_blockNumber`

export class NodeConnectionCheck extends Check {
  getEthBlockNumber() {
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

  async execute(context) {
    try {
      context.ethBlockNumber = await this.getEthBlockNumber()
    } catch (err) {
      logger.error(err)
      return new Alert('ethConnectionError', { err })
    }
  }
}

export class ReferenceNodeCheck extends Check {
  getRefBlockNumber() {
    return axios.get(ETHERSCAN_URL).then(res => {
      return parseInt(res.data.result)
    })
  }

  async execute(context) {
    try {
      context.refBlockNumber = await this.getRefBlockNumber()
    } catch (err) {
      logger.error(err)
      return new Alert('refConnectionError', { err })
    }
  }
}

export class BlocksAwayCheck extends Check {
  constructor(blocks) {
    super()
    this.blocks = parseInt(blocks)
  }

  async execute(context) {
    const { ethBlockNumber, refBlockNumber } = context

    // Data available
    if (!ethBlockNumber || !refBlockNumber) {
      logger.info(
        `[${this.constructor.name}] ❌ Fail => Unable to fetch block numbers`
      )
      return new Alert('noBlockNumbersError')
    }

    // Blocks away
    const blocksAway = refBlockNumber - ethBlockNumber
    if (blocksAway > this.blocks) {
      logger.info(
        `[${
          this.constructor.name
        }] ❌ Fail => REF (${refBlockNumber}) is ${blocksAway} blocks ahead of node (${ethBlockNumber})`
      )
      return new Alert('blocksAwayError', { blocksAway })
    }
  }
}
