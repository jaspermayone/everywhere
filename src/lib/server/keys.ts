import { generateCryptoKeyPair, exportJwk } from "@fedify/fedify";
import fs from "node:fs"

const rsaPair = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
const ed25519Pair = await generateCryptoKeyPair("Ed25519");

const keys = {
	rsa: {
		privateKey: await exportJwk(rsaPair.privateKey),
		publicKey: await exportJwk(rsaPair.publicKey),
	},
	ed25519: {
		privateKey: await exportJwk(ed25519Pair.privateKey),
		publicKey: await exportJwk(ed25519Pair.publicKey),
	}
}

fs.writeFileSync("./keys.json", JSON.stringify(keys))
