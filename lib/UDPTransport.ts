import { Socket, createSocket } from 'dgram'
import { IStatsTransport } from './types'
export { MetricsClient } from './MetricsClient'

export class UDPTransport implements IStatsTransport {
  public readonly host: string
  public readonly port: number
  private readonly socket: Socket
  private closed: boolean
  constructor(host: string, port = 8125) {
    this.host = host
    this.port = port
    this.socket = createSocket('udp4')
    this.socket.on('error', () => this.close())
    this.closed = false
  }

  public send(data: string | Buffer) {
    if (this.closed) {
      throw new Error('socket is closed cannot send data')
    }
    try {
      this.socket.send(data, this.port, this.host)
    } catch {
      this.close()
    }
  }

  public close() {
    this.closed = true
    this.socket.close()
  }
}
