import axios from 'axios'
import Check from '.'
import Alert from '../alerts'
import { logger } from '../logger'

const NODE_URL = 'http://localhost:8545'
const ETHERSCAN_URL = `http://${networkPrefix}.etherscan.io/api?module=proxy&action=eth_blockNumber`

export class NodeHealthCheck extends Check {
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

  getRefBlockNumber() {
    return axios.get(ETHERSCAN_URL).then(res => {
      return parseInt(res.data.result)
    })
  }

  async execute() {
    logger.info('[NodeHealthCheck] Node in sync...')

    try {
      const ethBlockNumber = await this.getEthBlockNumber()

      try {
        const refBlockNumber = await this.getRefBlockNumber()

        // Data available
        if (!ethBlockNumber || !refBlockNumber) {
          logger.info(
            '[NodeHealthCheck] ❌ Fail => Unable to fetch block numbers'
          )
          return new Alert('noBlockNumbersError')
        }

        // Blocks away
        const blocksAway = refBlockNumber - ethBlockNumber
        if (blocksAway > parseInt(opts.blocks)) {
          logger.info(
            `[NodeHealthCheck] ❌ Fail => REF (${refBlockNumber}) is ${blocksAway} blocks ahead of node (${ethBlockNumber})`
          )
          return new Alert('blocksAwayError', { blocksAway })
        }

        logger.info('[NodeHealthCheck] ✅ Pass')
      } catch (err) {
        logger.error(err)
        return new Alert('refConnectionError', { err })
      }
    } catch (err) {
      logger.error(err)
      return new Alert('ethConnectionError', { err })
    }
  }
}
