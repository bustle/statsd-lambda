# statsd-lambda 🔨

[![Build Status](https://travis-ci.org/reconbot/statsd-lambda.svg?branch=master)](https://travis-ci.org/reconbot/statsd-lambda) [![Try streaming-iterables on RunKit](https://badge.runkitcdn.com/statsd-lambda.svg)](https://npm.runkit.com/statsd-lambda) [![install size](https://packagephobia.now.sh/badge?p=statsd-lambda)](https://packagephobia.now.sh/result?p=statsd-lambda)

A simple UDP based statsd client designed for functions as a service. Leverages the microtask queue to batch metrics messages and sends them out via UDP for a very cheap way to collect counters, gauges, and timers that wont block your responses.

Many statsd clients exist and if you're not using lambda you should look at them and choose one. However on lambda (and other functions as a service) once you've responded to a request your function is put to sleep and you never know when the data will be sent. To work around this `statsd-lambda` queues sending metrics using `process.nextTick` which is fired after promises resolve and before the next event loop. (Tested in node 8+ and node 11+.)

This has proven to submit the packets to be sent over UDP before the lambda is put to sleep at a low scale (high scale testing is forthcoming). If you want to be sure the metrics send immediately you can manually flush the cache before your function resolves.

## Install
There are no dependencies.

```bash
npm install statsd-lambda
```

We ship esm, umd (with the AMD global `streamingIterables`) and typescript types.

## API
- [`constructor()`](#constructor)
- [`close()`](#close)
- [`counter()`](#counter)
- [`flush()`](#flush)
- [`gauge()`](#gauge)
- [`timer()`](#timer)
- [`MockTransport()`](#MockTransport)
- [`UDPTransport`](#UDPTransport)

### constructor
```ts
class MetricsClient {
  constructor({ prefix, transport, enabled, packetSize }: IMetricClientConstructor)
}

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

interface IStatsTransport {
  readonly send: (data: string | Buffer) => void
  readonly close: () => void
}
```
Returns a new metric client.

```ts
import { UDPTransport, MetricsClient } from 'statsd-lambda'
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport: new UDPTransport('10.10.0.22', 8125),
})
```

### close
```ts
client.close(): void
```

Closes the transport. This is handy if you're outside of lambda (eg, tasks or tests) and need to close the udp socket so node will exit cleanly.

```ts
import { UDPTransport, MetricsClient } from 'statsd-lambda'
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport: new UDPTransport('10.10.0.22', 8125),
})

// after some work
client.close()
```

### counter
```ts
client.counter(name: string, count?: number, sampleRate?: number): void
```

Sends a [statsd counter](https://github.com/statsd/statsd/blob/master/docs/metric_types.md#counting).

- `name` must only include letters, numbers. Periods may be used as a namespace separator.
- `count` a number to count
- `sampleRate` is both communicated and respected. A value of `1` (default) means send all the time, a value of `0` means never send, and a value of `0.5` means send 50% of the time.

Counters are batched by name and sample rate so two calls to a specific counter will be combined into one.

```ts
import { UDPTransport, MetricsClient } from 'statsd-lambda'
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport: new UDPTransport('10.10.0.22', 8125),
})

const pokemon = await catchPokemon() // an array of 3 monsters
for (const monster of pokemon) {
  client.counter('pokemon.caught', 1)
}
// sends "pokedex.production.pokemon.caught:3|c" on process.nextTick
```

### flush
```ts
client.flush(): void
```

Flushes all buffered metrics to the transport as a [multi-metric packet](https://github.com/statsd/statsd/blob/master/docs/metric_types.md#multi-metric-packets). This is automatically run on `process.nextTick` but may be run manually at any time.

```ts
import { UDPTransport, MetricsClient } from 'statsd-lambda'
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport: new UDPTransport('10.10.0.22', 8125),
})

client.counter('pokemon.trained', 2)
client.flush()
// sends "pokedex.production.pokemon.trained:2|c" immediately
```

### gauge
```ts
client.gauge(name: string, value: number | string, sampleRate?: number): void
```

Sends a [statsd gauge](https://github.com/statsd/statsd/blob/master/docs/metric_types.md#gauges).

- `name` must only include letters, numbers. Periods may be used as a namespace separator.
- `value` the value of the gauge or a change in gauge value eg `-1`, `+1`
- `sampleRate` is both communicated and respected. A value of `1` (default) means send all the time, a value of `0` means never send, and a value of `0.5` means send 50% of the time.

```ts
import { UDPTransport, MetricsClient } from 'statsd-lambda'
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport: new UDPTransport('10.10.0.22', 8125),
})

const { discovered, total } = await pokedexStatus()
client.gauge('pokemon.percentDiscovered', Math.round(discovered / total * 100))
// sends "pokedex.production.pokemon.percentDiscovered:50|g"
```

### timer
```ts
client.timer(name: string, time: number, sampleRate?: number): void
```

Sends a [statsd timer](https://github.com/statsd/statsd/blob/master/docs/metric_types.md#timing).

- `name` must only include letters, numbers. Periods may be used as a namespace separator.
- `time` the milliseconds to record
- `sampleRate` is both communicated and respected. A value of `1` (default) means send all the time, a value of `0` means never send, and a value of `0.5` means send 50% of the time.

```ts
import { UDPTransport, MetricsClient } from 'statsd-lambda'
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport: new UDPTransport('10.10.0.22', 8125),
})

const start = Date.now()
await findPokemon()
client.time('pokemon.discoverTime', Date.now() - start)
// sends "pokedex.production.pokemon.discoverTime:30|ms"
```

### MockTransport
```ts
class MockTransport implements IStatsTransport {
  readonly packets: Buffer[]
  readonly maxBuffer: number
  constructor(maxBuffer?: number)
  close(): void
  send(packet: Buffer): void
}
```

`MockTransport` is an `IStatsTransport` conforming transport that does nothing but buffer the packets to be sent up to `maxBuffer` (default is 100). This is helpful for testing.

```ts
import { MockTransport, MetricsClient } from 'statsd-lambda'
const transport = new MockTransport()
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport,
})

client.counter('test.count', 1)
client.flush()
console.log(transport.packets)
// [Buffer.from("pokedex.production.test.count:1|c")]
```


### UDPTransport
```ts
class UDPTransport implements IStatsTransport {
  constructor(host: string, port?: number)
  close(): void
  send(packet: Buffer): void
}
```
`UDPTransport` is an `IStatsTransport` conforming transport that sends packets via UDP to a host and port. `host` must be an ip address or dns hostname, and port must be a number (default to `8125` the statsd port). It is not necessary to interact with this object directly.

```ts
import { UDPTransport, MetricsClient } from 'statsd-lambda'
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport: new UDPTransport('statsdserver.local'),
})

client.counter('test.count', 1)
client.flush()
// a packet is sent to statsdserver.local with the value of
// "pokedex.production.test.count:1|c"
```

## Contributors wanted!

Writing docs and code is a lot of work! Thank you in advance for helping out.
