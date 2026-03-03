import catFemale from "@/assets/avatars/gatinha.png";
import catMale from "@/assets/avatars/gatinho.png";

export const AVATAR_OPTIONS = [
  { id: "cat-female", label: "Gatinha", src: catFemale, category: "gato" },
  { id: "cat-male", label: "Gatinho", src: catMale, category: "gato" },
] as const;

export type AvatarId = (typeof AVATAR_OPTIONS)[number]["id"];

export const DEFAULT_AVATAR_ID: AvatarId = "cat-female";

export const getAvatarById = (avatarId?: string | null) =>
  AVATAR_OPTIONS.find((item) => item.id === avatarId) || AVATAR_OPTIONS[0];
