import { deepEqual, ok, equal } from 'assert'
import { MetricsClient, MockTransport } from './index'

const asyncSetImmediate = () => new Promise(resolve => setImmediate(resolve))

describe('MetricsClient', () => {
  let transport: MockTransport
  let client: MetricsClient
  beforeEach(() => {
    transport = new MockTransport()
    client = new MetricsClient({
      prefix: 'gradius',
      transport,
    })
  })
  it('flushes metrics at the end of the microtask queue', async () => {
    client.timer('test', 1)
    deepEqual(transport.packets, [])
    await asyncSetImmediate()
    deepEqual(transport.packets[0].toString(), 'gradius.test:1|ms')
  })
  it('flushes metrics manually', async () => {
    client.timer('test', 1)
    deepEqual(transport.packets, [])
    client.flush()
    deepEqual(transport.packets[0].toString(), 'gradius.test:1|ms')
    await asyncSetImmediate()
  })
  it('batches metrics', async () => {
    client.timer('test', 1)
    client.counter('test')
    client.gauge('test', 100)
    await asyncSetImmediate()
    deepEqual(transport.packets[0].toString(), 'gradius.test:1|ms\ngradius.test:100|g\ngradius.test:1|c')
  })
  it('splits packets on a byte length', async () => {
    const client = new MetricsClient({
      packetSize: 20,
      prefix: 'gradius',
      transport,
    })
    client.timer('test', 1)
    client.counter('test')
    await asyncSetImmediate()
    deepEqual(transport.packets[0].toString(), 'gradius.test:1|ms')
    deepEqual(transport.packets[1].toString(), 'gradius.test:1|c')
    equal(transport.packets.length, 2)
  })
  it('groups counters by name and sample rate', async () => {
    // The odds that we fail this test are very very low 1 in 10000000000
    client.timer('test', 1)
    client.counter('test', 1)
    client.counter('test', 1, 0.99)
    client.counter('test', 1)
    client.counter('test', 1, 0.99)
    client.counter('test', 1, 0.99)
    client.counter('test', 1, 0.99)
    client.counter('test', 1, 0.99)
    await asyncSetImmediate()
    ok(transport.packets[0].toString().match(/gradius\.test:1\|ms\ngradius.test:2\|c\ngradius.test:\d\|c\|@0.99/))
  })
})
