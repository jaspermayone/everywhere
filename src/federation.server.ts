import { PreviewServer, type ViteDevServer } from "vite";
import federation from "../lib/federation.ts";
// @ts-expect-error
import { getRequest, setResponse } from "../lib/convert.js";
import { IncomingMessage, ServerResponse } from "http";
import { NextFunction } from "express";

async function middleware (server: ViteDevServer | PreviewServer, request: IncomingMessage, res: ServerResponse, next: NextFunction) {
  const base = "http://" + (server.config.server.host || "localhost") + ":" + server.config.server.port
  const response = (await federation.fetch(await getRequest({ request, base}), { contextData: undefined }))      
  
  response?.status != 404 ? await setResponse(res, response) : next()
}

export default () => ({
  name: 'federation',
  configureServer(server: ViteDevServer) {
    server.middlewares.use(async (req, res, next) => { await middleware(server, req, res, next) })
  },
  configurePreviewServer(server: PreviewServer) {
    server.middlewares.use(async (req, res, next) => { await middleware(server, req, res, next) })
  }
})