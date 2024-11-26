/**
 * @param {{
 *   request: import('http').IncomingMessage;
 *   base: string;
 *   bodySizeLimit?: number;
 * }} options
 * @returns {Promise<Request>}
 */
// TODO 3.0 make the signature synchronous?
// eslint-disable-next-line @typescript-eslint/require-await
export async function getRequest({ request, base, bodySizeLimit }) {
	return new Request(base + request.url, {
		// @ts-expect-error
		duplex: 'half',
		method: request.method,
		headers: /** @type {Record<string, string>} */ (request.headers),
		body:
			request.method === 'GET' || request.method === 'HEAD'
				? undefined
				: get_raw_body(request, bodySizeLimit)
	});
}

/**
 * @param {import('http').ServerResponse} res
 * @param {Response} response
 * @returns {Promise<void>}
 */
// TODO 3.0 make the signature synchronous?
// eslint-disable-next-line @typescript-eslint/require-await
export async function setResponse(res, response) {
	for (const [key, value] of response.headers) {
		try {
			res.setHeader(
				key,
				key === 'set-cookie'
					? set_cookie_parser.splitCookiesString(
							// This is absurd but necessary, TODO: investigate why
							/** @type {string}*/ (response.headers.get(key))
						)
					: value
			);
		} catch (error) {
			res.getHeaderNames().forEach((name) => res.removeHeader(name));
			res.writeHead(500).end(String(error));
			return;
		}
	}

	res.writeHead(response.status);

	if (!response.body) {
		res.end();
		return;
	}

	if (response.body.locked) {
		res.end(
			'Fatal error: Response body is locked. ' +
				"This can happen when the response was already read (for example through 'response.json()' or 'response.text()')."
		);
		return;
	}

	const reader = response.body.getReader();

	if (res.destroyed) {
		reader.cancel();
		return;
	}

	const cancel = (/** @type {Error|undefined} */ error) => {
		res.off('close', cancel);
		res.off('error', cancel);

		// If the reader has already been interrupted with an error earlier,
		// then it will appear here, it is useless, but it needs to be catch.
		reader.cancel(error).catch(() => {});
		if (error) res.destroy(error);
	};

	res.on('close', cancel);
	res.on('error', cancel);

	next();
	async function next() {
		try {
			for (;;) {
				const { done, value } = await reader.read();

				if (done) break;

				if (!res.write(value)) {
					res.once('drain', next);
					return;
				}
			}
			res.end();
		} catch (error) {
			cancel(error instanceof Error ? error : new Error(String(error)));
		}
	}
}