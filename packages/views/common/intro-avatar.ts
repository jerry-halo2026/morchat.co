import { aoraAvatarDataUri } from "@morechat/ui/components/common/aora-avatar";
import { deriveAoraSpec, encodeAoraSpec } from "@morechat/ui/lib/aora-spec";

/**
 * A stable face for the fictional teammates drawn in empty-state art.
 *
 * These are not product identities, so the id is namespaced: the same name gets
 * the same face on every screen, and no real workspace id can collide with it.
 * Emoji avatars used to stand in here, which broke the icon rule and looked like
 * a different product than the one the rest of the app renders.
 */
export function introAvatar(id: string, sizePx = 40): string {
  const entityId = `intro:${id}`;
  return aoraAvatarDataUri({
    entityId,
    avatarUrl: encodeAoraSpec(deriveAoraSpec(entityId)),
    sizePx,
  });
}
