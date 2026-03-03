import catFemale from "@/assets/avatars/cat-female.svg";
import catMale from "@/assets/avatars/cat-male.svg";

export const AVATAR_OPTIONS = [
  { id: "cat-female", label: "Gato Femea", src: catFemale, category: "gato" },
  { id: "cat-male", label: "Gato Macho", src: catMale, category: "gato" },
] as const;

export type AvatarId = (typeof AVATAR_OPTIONS)[number]["id"];

export const DEFAULT_AVATAR_ID: AvatarId = "cat-female";

export const getAvatarById = (avatarId?: string | null) =>
  AVATAR_OPTIONS.find((item) => item.id === avatarId) || AVATAR_OPTIONS[0];

