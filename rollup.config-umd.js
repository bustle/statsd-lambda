import resolve from 'rollup-plugin-node-resolve'

export default {
  input: './dist-ts/index.js',
  plugins: [
    resolve({})
  ],
  output: {
    format: 'umd',
    name: 'statsdLambda',
    file: './dist/index.js',
  }
}
