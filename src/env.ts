// Come from tsup's define
declare const NODE_ENV: string
declare const NAME: string
declare const VERSION: string
// Empty string if Firefox
declare const POLYFILL: string

export default {
  NODE_ENV, NAME, VERSION, POLYFILL,
}
