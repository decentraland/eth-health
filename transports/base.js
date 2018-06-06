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

export class Transporter {
  constructor() {
    this.clearTransports()
  }

  addTransport(name, transport) {
    this.transports[name] = transport
  }

  delTransport(name) {
    delete this.transporter[name]
  }

  clearTransports() {
    this.transports = {}
  }

  send(name, text, body) {
    const transport = this.transports[name]
    if (!transport) {
      throw new Error(`${name} transport does not exist`)
    }
    return transport.send(text, body)
  }

  sendAll(text, body) {
    return Promise.all(
      Object.values(this.transports).map(transport =>
        transport.send(text, body)
      )
    )
  }
}
