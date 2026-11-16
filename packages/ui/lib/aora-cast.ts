/**
 * Aora's core cast: the characters a derived avatar is picked from.
 *
 * Copied from `CAST` (and `CORE_CAST_IDS`, same order) in @aora-bot/engine
 * 0.2.0, dist/core/cast.d.ts. It lives here as data because `core` cannot
 * import the `ui` package that owns the engine, and because both languages need
 * the table without a runtime dependency: server/internal/avatar/cast.go holds
 * the same rows in the same order.
 *
 * A cast member *is* a shape plus a colour, so the trio is stored as one row and
 * never chosen apart: picking them independently is what made every derived
 * avatar look like a plain body with no character.
 *
 * The order is part of the cross-language contract. Appending is safe; reordering
 * or removing a row changes which character an existing id derives to.
 */

/** One cast member: the id is the printable name, the look is the shape + colour. */
export interface AoraCastCharacter {
  readonly id: string;
  readonly shape: string;
  readonly color: string;
}

export const AORA_CAST_CHARACTERS: readonly AoraCastCharacter[] = [
  { id: "dot", shape: "circle", color: "cream" },
  { id: "mochi", shape: "mochi", color: "blue" },
  { id: "pip", shape: "blob", color: "cyan" },
  { id: "byte", shape: "pebble", color: "violet" },
  { id: "momo", shape: "egg", color: "red" },
  { id: "bao", shape: "bun", color: "yellow" },
  { id: "teal", shape: "tofu", color: "cyan" },
  { id: "tato", shape: "pill", color: "red" },
  { id: "hexa", shape: "hex", color: "cyan" },
  { id: "tri", shape: "onigiri", color: "magenta" },
  { id: "gemma", shape: "gem", color: "cyan" },
  { id: "nimbo", shape: "cloud", color: "blue" },
  { id: "dew", shape: "drop", color: "blue" },
  { id: "leafy", shape: "leaf", color: "green" },
  { id: "bloom", shape: "flower", color: "magenta" },
  { id: "lucky", shape: "clover", color: "green" },
  { id: "sprout", shape: "sprout", color: "green" },
  { id: "shroom", shape: "mushroom", color: "red" },
  { id: "oak", shape: "acorn", color: "brown" },
  { id: "pokey", shape: "cactus", color: "green" },
  { id: "aubie", shape: "eggplant", color: "violet" },
  { id: "nashi", shape: "pear", color: "yellow" },
  { id: "pomme", shape: "apple", color: "green" },
  { id: "berry", shape: "strawberry", color: "red" },
  { id: "cheri", shape: "cherry", color: "magenta" },
  { id: "avo", shape: "avocado", color: "yellow" },
  { id: "melo", shape: "melon", color: "red" },
  { id: "pud", shape: "pudding", color: "yellow" },
  { id: "toasty", shape: "toast", color: "brown" },
  { id: "scoop", shape: "icecream", color: "pink" },
  { id: "cuppy", shape: "cupcake", color: "pink" },
  { id: "fry", shape: "fries", color: "yellow" },
  { id: "candy", shape: "candy", color: "blue" },
  { id: "patty", shape: "burger", color: "brown" },
  { id: "twinkle", shape: "star", color: "yellow" },
  { id: "luv", shape: "heart", color: "red" },
  { id: "ember", shape: "flame", color: "orange" },
  { id: "chime", shape: "bell", color: "violet" },
  { id: "jelly", shape: "ghost", color: "orange" },
  { id: "beep", shape: "bot", color: "cyan" },
  { id: "luna", shape: "crescent", color: "yellow" },
  { id: "boba", shape: "boba", color: "brown" },
  { id: "orbi", shape: "planet", color: "violet" },
  { id: "nook", shape: "cottage", color: "orange" },
  { id: "chatty", shape: "chat", color: "cyan" },
  { id: "joy", shape: "gift", color: "magenta" },
  { id: "lumi", shape: "bulb", color: "yellow" },
  { id: "finn", shape: "fish", color: "cyan" },
  { id: "inky", shape: "octopus", color: "violet" },
  { id: "roly", shape: "seal", color: "blue" },
  { id: "puff", shape: "puffer", color: "green" },
  { id: "miso", shape: "cat", color: "orange" },
  { id: "hop", shape: "bunny", color: "magenta" },
  { id: "bruno", shape: "bear", color: "brown" },
  { id: "chirp", shape: "chick", color: "yellow" },
  { id: "waddle", shape: "penguin", color: "blue" },
  { id: "oink", shape: "pig", color: "pink" },
  { id: "rusty", shape: "fox", color: "orange" },
  { id: "leo", shape: "lion", color: "orange" },
  { id: "hammy", shape: "hamster", color: "orange" },
  { id: "prickle", shape: "hedgehog", color: "brown" },
  { id: "koko", shape: "koala", color: "gray" },
  { id: "flap", shape: "bat", color: "violet" },
  { id: "kiki", shape: "bob", color: "brown" },
  { id: "maru", shape: "topknot", color: "pink" },
  { id: "zip", shape: "spiky", color: "blue" },
  { id: "fuzz", shape: "curly", color: "green" },
  { id: "lulu", shape: "twinbuns", color: "violet" },
  { id: "cinder", shape: "chunk", color: "night" },
  { id: "sooty", shape: "lump", color: "night" },
  { id: "ashy", shape: "fluff", color: "night" },
];

/** The cast ids alone, for callers that only need to name or validate one. */
export const AORA_CAST_CHARACTER_IDS: readonly string[] = AORA_CAST_CHARACTERS.map(
  (character) => character.id,
);
