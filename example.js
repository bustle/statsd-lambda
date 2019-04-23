const { MockTransport, MetricsClient } = require('statsd-lambda')

const transport = new MockTransport()
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport,
})

client.counter('test.count', 1)
client.flush()
console.log(transport.packets)
