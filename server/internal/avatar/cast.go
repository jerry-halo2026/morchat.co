package avatar

// Aora's core cast: the characters a derived avatar is picked from.
//
// This is the Go half of packages/core/avatar/aora-cast.ts and holds the same
// rows in the same order. A cast member is a shape plus a colour, so the trio is
// stored as one row and never chosen apart: that is what gives a derived avatar
// a character instead of a bare body.
//
// The order is part of the cross-language contract. Appending is safe; reordering
// or removing a row changes which character an existing id derives to.

// CastCharacter is one cast member: the ID is the printable name, Shape and Color
// are the look it draws.
type CastCharacter struct {
	ID    string
	Shape string
	Color string
}

// CastCharacters is Aora's CAST, in catalogue order.
var CastCharacters = []CastCharacter{
	{ID: "dot", Shape: "circle", Color: "cream"},
	{ID: "mochi", Shape: "mochi", Color: "blue"},
	{ID: "pip", Shape: "blob", Color: "cyan"},
	{ID: "byte", Shape: "pebble", Color: "violet"},
	{ID: "momo", Shape: "egg", Color: "red"},
	{ID: "bao", Shape: "bun", Color: "yellow"},
	{ID: "teal", Shape: "tofu", Color: "cyan"},
	{ID: "tato", Shape: "pill", Color: "red"},
	{ID: "hexa", Shape: "hex", Color: "cyan"},
	{ID: "tri", Shape: "onigiri", Color: "magenta"},
	{ID: "gemma", Shape: "gem", Color: "cyan"},
	{ID: "nimbo", Shape: "cloud", Color: "blue"},
	{ID: "dew", Shape: "drop", Color: "blue"},
	{ID: "leafy", Shape: "leaf", Color: "green"},
	{ID: "bloom", Shape: "flower", Color: "magenta"},
	{ID: "lucky", Shape: "clover", Color: "green"},
	{ID: "sprout", Shape: "sprout", Color: "green"},
	{ID: "shroom", Shape: "mushroom", Color: "red"},
	{ID: "oak", Shape: "acorn", Color: "brown"},
	{ID: "pokey", Shape: "cactus", Color: "green"},
	{ID: "aubie", Shape: "eggplant", Color: "violet"},
	{ID: "nashi", Shape: "pear", Color: "yellow"},
	{ID: "pomme", Shape: "apple", Color: "green"},
	{ID: "berry", Shape: "strawberry", Color: "red"},
	{ID: "cheri", Shape: "cherry", Color: "magenta"},
	{ID: "avo", Shape: "avocado", Color: "yellow"},
	{ID: "melo", Shape: "melon", Color: "red"},
	{ID: "pud", Shape: "pudding", Color: "yellow"},
	{ID: "toasty", Shape: "toast", Color: "brown"},
	{ID: "scoop", Shape: "icecream", Color: "pink"},
	{ID: "cuppy", Shape: "cupcake", Color: "pink"},
	{ID: "fry", Shape: "fries", Color: "yellow"},
	{ID: "candy", Shape: "candy", Color: "blue"},
	{ID: "patty", Shape: "burger", Color: "brown"},
	{ID: "twinkle", Shape: "star", Color: "yellow"},
	{ID: "luv", Shape: "heart", Color: "red"},
	{ID: "ember", Shape: "flame", Color: "orange"},
	{ID: "chime", Shape: "bell", Color: "violet"},
	{ID: "jelly", Shape: "ghost", Color: "orange"},
	{ID: "beep", Shape: "bot", Color: "cyan"},
	{ID: "luna", Shape: "crescent", Color: "yellow"},
	{ID: "boba", Shape: "boba", Color: "brown"},
	{ID: "orbi", Shape: "planet", Color: "violet"},
	{ID: "nook", Shape: "cottage", Color: "orange"},
	{ID: "chatty", Shape: "chat", Color: "cyan"},
	{ID: "joy", Shape: "gift", Color: "magenta"},
	{ID: "lumi", Shape: "bulb", Color: "yellow"},
	{ID: "finn", Shape: "fish", Color: "cyan"},
	{ID: "inky", Shape: "octopus", Color: "violet"},
	{ID: "roly", Shape: "seal", Color: "blue"},
	{ID: "puff", Shape: "puffer", Color: "green"},
	{ID: "miso", Shape: "cat", Color: "orange"},
	{ID: "hop", Shape: "bunny", Color: "magenta"},
	{ID: "bruno", Shape: "bear", Color: "brown"},
	{ID: "chirp", Shape: "chick", Color: "yellow"},
	{ID: "waddle", Shape: "penguin", Color: "blue"},
	{ID: "oink", Shape: "pig", Color: "pink"},
	{ID: "rusty", Shape: "fox", Color: "orange"},
	{ID: "leo", Shape: "lion", Color: "orange"},
	{ID: "hammy", Shape: "hamster", Color: "orange"},
	{ID: "prickle", Shape: "hedgehog", Color: "brown"},
	{ID: "koko", Shape: "koala", Color: "gray"},
	{ID: "flap", Shape: "bat", Color: "violet"},
	{ID: "kiki", Shape: "bob", Color: "brown"},
	{ID: "maru", Shape: "topknot", Color: "pink"},
	{ID: "zip", Shape: "spiky", Color: "blue"},
	{ID: "fuzz", Shape: "curly", Color: "green"},
	{ID: "lulu", Shape: "twinbuns", Color: "violet"},
	{ID: "cinder", Shape: "chunk", Color: "night"},
	{ID: "sooty", Shape: "lump", Color: "night"},
	{ID: "ashy", Shape: "fluff", Color: "night"},
}
