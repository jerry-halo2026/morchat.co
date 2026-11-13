/**
 * Faces the product assigns itself, as opposed to ones a person picked.
 *
 * A product face is written by the server when the agent is created, so the
 * client has to use the same string before the agent exists — otherwise the
 * introduction shows one face and the created agent another.
 */

/**
 * The workspace agent (Sika, historically "Mika") keeps one fixed face.
 *
 * Mirrors `mikaAgentAvatarURL` in `server/internal/handler/mika_agent.go`; the
 * two must move together. Keep it a complete `aora:` spec so both the static
 * route and the inline renderer draw it as written rather than deriving another.
 */
export const SIKA_AVATAR_URL = "aora::boba:green:capsule:vector:0001";
