import { IStatsTransport } from './types'

export class MockTransport implements IStatsTransport {
  public readonly packets: Buffer[]
  public readonly maxBuffer: number
  constructor(maxBuffer = 100) {
    this.packets = []
    this.maxBuffer = maxBuffer
  }
  public close() {}
  public send(packet: Buffer) {
    this.packets.push(packet)
    if (this.packets.length > this.maxBuffer) {
      this.packets.shift()
    }
  }
}
