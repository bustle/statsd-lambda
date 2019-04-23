import { IStatsTransport } from './types'

const sample = (rate: number) => Math.random() < rate

interface IMetricClientConstructor {
  /**
   * A prefix string for all statsd metrics eg "myapp.production"
   */
  prefix?: string
  /**
   * When disabled all operations are a no-op
   */
  enabled?: boolean
  /**
   * The transport object that delivers the metrics. This package ships with `UDPTransport` and `MockTransport`
   */
  transport: IStatsTransport
  /**
   * Batches packets into multi metric packets of this max size. Defaults to 1432 which is the mtu for fast ethernet - headers, lambda probably can do higher if the perf here needs tuning - see https://github.com/statsd/statsd/blob/master/docs/metric_types.md#multi-metric-packets
   */
  packetSize?: number
}

export class MetricsClient {
  public readonly prefix: string
  public readonly maxPacketSize: number
  private readonly transport: IStatsTransport
  private closed: boolean
  private counterQueue: Map<string, { name: string; count: number; sampleRate: number }>
  private metricQueue: string[]
  private enqueuedFlush: boolean

  constructor({ prefix = '', transport, enabled = true, packetSize = 1432 }: IMetricClientConstructor) {
    this.closed = !enabled
    this.prefix = prefix
    this.transport = transport
    this.enqueuedFlush = false
    this.counterQueue = new Map()
    this.metricQueue = []
    this.maxPacketSize = packetSize
  }

  public close() {
    if (this.closed) {
      return
    }
    this.transport.close()
    this.closed = true
  }

  public flush() {
    if (this.metricQueue.length === 0 && this.counterQueue.size === 0) {
      return
    }

    // process all counters and queue them
    for (const { name, count, sampleRate } of this.counterQueue.values()) {
      this.metricQueue.push(`${name}:${count}|c` + (sampleRate === 1 ? '' : `|@${sampleRate}`))
    }
    this.counterQueue.clear()
    const metrics = this.metricQueue.map(str => `${this.prefix}.${str}`)
    this.metricQueue.splice(0, this.metricQueue.length)

    let batch = Buffer.allocUnsafe(this.maxPacketSize)
    let usedPacketSize = 0
    const makeNewBatch = () => {
      usedPacketSize = 0
      batch = Buffer.allocUnsafe(this.maxPacketSize)
    }

    for (const metric of metrics) {
      // drop too large packets
      if (metric.length > this.maxPacketSize) {
        continue
      }
      const packetSize = metric.length + (usedPacketSize === 0 ? 0 : 1)
      if (this.maxPacketSize < usedPacketSize + packetSize) {
        this.transport.send(batch.slice(0, usedPacketSize))
        makeNewBatch()
      }
      const metricToWrite = usedPacketSize === 0 ? metric : `\n${metric}`
      batch.write(metricToWrite, usedPacketSize)
      usedPacketSize += metricToWrite.length
    }
    if (usedPacketSize > 0) {
      this.transport.send(batch.slice(0, usedPacketSize))
    }
  }

  public counter(name: string, count = 1, sampleRate = 1) {
    if (name.includes(':')) {
      throw new Error('"name" can only include "." for namespaces')
    }
    if (this.closed) {
      return
    }
    if (!sample(sampleRate)) {
      return
    }
    const counterKey = `${name}:${sampleRate}`
    const existing = this.counterQueue.get(counterKey)
    if (existing) {
      existing.count += count
    } else {
      this.counterQueue.set(counterKey, { name, count, sampleRate })
    }
    this.enqueueFlush()
  }

  public timer(name: string, time: number, sampleRate = 1) {
    if (name.includes(':')) {
      throw new Error('"name" can only include "." for namespaces')
    }
    this.send(`${name}:${time}|ms`, sampleRate)
  }

  public gauge(name: string, value: number | string, sampleRate = 1) {
    if (name.includes(':')) {
      throw new Error('"name" can only include "." for namespaces')
    }
    this.send(`${name}:${value}|g`, sampleRate)
  }

  private enqueueFlush() {
    if (this.enqueuedFlush) {
      return
    }
    this.enqueuedFlush = true
    // nextTick happens in the same event loop, so anything that happens in a single event
    // loop is logged here, in effect this batches anything that comes in the same loop.
    process.nextTick(() => {
      this.flush()
      this.enqueuedFlush = false
    })
  }

  private send(metric: string, sampleRate = 1) {
    if (this.closed) {
      return
    }
    if (!sample(sampleRate)) {
      return
    }
    const sampledMetric = sampleRate === 1 ? metric : `${metric}|@${sampleRate}`
    this.metricQueue.push(sampledMetric)
    this.enqueueFlush()
  }
}
