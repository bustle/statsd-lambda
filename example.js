const { MockTransport, MetricsClient } = require('statsd-lambda')

const transport = new MockTransport()
const client = new MetricsClient({
  prefix: 'pokedex.production',
  transport,
})

client.counter('test.count', 1)
client.counter('test.count', 2)
client.timer('timer', 200)
client.flush()
console.log(transport.packets)
