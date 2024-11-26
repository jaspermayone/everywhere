import type { UserConfig } from 'vite'
import api from "./src/api.server.ts"
import federation from "./src/federation.server.ts"

export default {
  plugins: [api(), federation()]
} satisfies UserConfig
