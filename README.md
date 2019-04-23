# statsd-lambda 🔨

[![CircleCI](https://circleci.com/gh/bustle/statsd-lambda/tree/master.svg?style=svg)](https://circleci.com/gh/bustle/statsd-lambda/tree/master) [![Try streaming-iterables on RunKit](https://badge.runkitcdn.com/statsd-lambda.svg)](https://npm.runkit.com/statsd-lambda) [![install size](https://badgen.net/bundlephobia/minzip/statsd-lambda)](https://bundlephobia.com/result?p=statsd-lambda@1.0.0)

A simple UDP based statsd client designed for Amazon Lambda. (And is probably useful for other functions as a service.) It leverages the microtask queue to batch metrics messages and sends them out via UDP for a very cheap way to collect counters, gauges, and timers that wont block your responses.

- Overview
  - [Why another statsd client?](#why-another-statsd-client)
  - [Why statsd vs a service?](#why-statsd-vs-a-hosted-service)
  - [Security](#security)
  - [Install](#install)
  - [Contributors wanted](#contributors-wanted)
- API
  - [`constructor()`](#constructor)
  - [`close()`](#close)
  - [`counter()`](#counter)
  - [`flush()`](#flush)
  - [`gauge()`](#gauge)
  - [`timer()`](#timer)
  - [`MockTransport()`](#MockTransport)
  - [`UDPTransport`](#UDPTransport)


## Why another statsd client?

Many statsd clients exist and if you're not using lambda you should consider them. However on amazon lambda once you've responded to a request your function is put to sleep preventing background tasks from executing. Most stats libraries use a background task or send metrics data which will be unpredictable. Most lambda specific libraries will block your response to send metrics over https slowing down your process which is unnecessary. To report stats data without leveraging background task queues or slowing down your response `statsd-lambda` queues sending metrics using `process.nextTick` which is fired after promises resolve and before the next event loop. This allows the very fast process of sending UDP packets to complete

This has proven to reliably report metrics with a low impact (0-2 ms).

## Why statsd vs a hosted service?
There are currently no UDP based hosted services. Every single service I have found blocks your lambda's response with an https request that can take anywhere from 10-300ms to complete (this includes Cloudwatch metrics which has pretty harsh rate limiting). With one exception, Amazon's X-Ray, which isn't suitable for metric collection.

That aside (and it's a big aside) every hosted solution is significantly more money than a self hosted solution. So while Lambda has brought in an era of reduced operations, it hasn't eliminated all of it.

## Security
`statsd` doesn't provide any security. It uses an unencrypted plain text UDP protocol. This isn't a problem if you're in a VPC. However if you're not running in a vpc you should know that the metric traffic could be intercepted by any network between your lambda and your statsd server. If you're running a `statsd` server in AWS then there's a low risk of anyone other than AWS seeing your metrics but there's no guarantee.

## Install
There are no dependencies.

```bash
npm install statsd-lambda
```

We ship esm, umd (with the AMD global `streamingIterables`) and typescript types.

## API

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

`MockTransport` is an `IStatsTransport` conforming transport that does nothing but store the packets to be sent as strings up to `maxBuffer` (default is 100). This is helpful for testing.

```ts
import { MockTransport, MetricsClient } from 'statsd-lambda'
const transport = new MockTransport()
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport,
})

client.counter('test.count', 1)
client.counter('test.count', 3)
client.flush()
console.log(transport.packets)
// ["pokedex.production.test.count:4|c"]
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

This library was developed at Bustle. However writing docs and code is a lot of work! Thank you in advance for helping out and keeping projects like this open source.
