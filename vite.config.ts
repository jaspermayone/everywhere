import type { UserConfig } from 'vite'
import api from "./src/api.server.ts"

export default {
  plugins: [api()]
} satisfies UserConfig
