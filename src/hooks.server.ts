import { fedifyHook } from '@fedify/fedify/x/sveltekit';
import {
	createFederation,
	MemoryKvStore,
	Service,
	Follow,
	Undo,
	Accept,
	importJwk
} from '@fedify/fedify';
import keys from '$lib/server/keys.json';

const federation = createFederation<void>({
	kv: new MemoryKvStore()
});

federation
	.setInboxListeners('/services/{identifier}/inbox', '/inbox')
	.on(Follow, async (ctx, follow) => {
		if (follow.objectId == null) return;
		const parsed = ctx.parseUri(follow.objectId);
		if (parsed?.type !== 'actor') return;
		const recipient = await follow.getActor(ctx);
		if (recipient == null) return;
		await ctx.sendActivity(
			{ identifier: parsed.identifier },
			recipient,
			new Accept({ actor: follow.objectId, object: follow })
		);

		await ctx.sendActivity(
			{ identifier: parsed.identifier },
			recipient,
			new Follow({
				actor: follow.objectId,
				object: recipient.id
			})
		);
	})
	.on(Undo, async (ctx, undo) => {
		const object = await undo.getObject();
		if (!(object instanceof Follow)) return;
		if (undo.actorId == null || object.objectId == null) return;
		const parsed = ctx.parseUri(object.objectId);
		if (parsed == null || parsed.type !== 'actor') return;

		const recipient = await undo.getActor(ctx);
		if (recipient == null) return;
		await ctx.sendActivity(
			{ identifier: parsed.identifier },
			recipient,
			new Undo({
				actor: object.objectId,
				object: new Follow({
					actor: object.objectId,
					object: recipient.id
				})
			})
		);
	});

federation
	.setActorDispatcher('/services/{identifier}', async (ctx, identifier) => {
		if (identifier !== 'xing') return null;

		const keys = await ctx.getActorKeyPairs(identifier);

		return new Service({
			id: ctx.getActorUri(identifier),
			name: 'Everywhere', // Display name
			summary: 'This is a bot crossposting accounts to other platforms', // Bio
			preferredUsername: identifier, // Bare handle
			discoverable: false,
			indexable: false,
			inbox: ctx.getInboxUri(identifier),
			manuallyApprovesFollowers: false,
			publicKey: keys[0].cryptographicKey,
			assertionMethods: keys.map((key) => key.multikey)
		});
	})
	.mapHandle(async (ctx, username) => {
		return 'xing';
	})
	.setKeyPairsDispatcher(async (ctx, identifier) => {
		return [
			{
				publicKey: await importJwk(keys.rsa.publicKey, 'public'),
				privateKey: await importJwk(keys.rsa.privateKey, 'private')
			},
			{
				publicKey: await importJwk(keys.ed25519.publicKey, 'public'),
				privateKey: await importJwk(keys.ed25519.privateKey, 'private')
			}
		];
	});

// This is the entry point to the Fedify hook from the SvelteKit framework:
export const handle = fedifyHook(federation, () => null);
