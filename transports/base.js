export default class Transport {
  constructor(params) {
    this.transport = this.setup(params)
  }

  setup(params) {
    throw new Error('Must be implemented')
  }

  send(text, body) {
    throw new Error('Must be implemented')
  }
}
