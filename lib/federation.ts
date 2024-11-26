import { createFederation, MemoryKvStore, Service } from "@fedify/fedify";

const federation = createFederation<void>({
  kv: new MemoryKvStore(),
});

federation.setActorDispatcher("/services/{identifier}", (ctx, identifier) => {
  if (identifier !== "xing") return null;
  return new Service({
    id: ctx.getActorUri(identifier),
    name: "Everywhere",  // Display name
    summary: "This is a bot crossposting accounts to other platforms",  // Bio
    preferredUsername: identifier,  // Bare handle
    discoverable: false,
    indexable: false
  });
});


export default federation;