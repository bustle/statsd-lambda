export interface IStatsTransport {
  readonly send: (data: string | Buffer) => void
  readonly close: () => void
}
