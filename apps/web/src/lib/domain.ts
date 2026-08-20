export type Domain = "pokemon" | "sports";

export const DOMAINS: readonly Domain[] = ["pokemon", "sports"] as const;

export const DOMAIN_META: Record<Domain, {
  label: string;
  shortLabel: string;
  tagline: string;
  searchPlaceholder: string;
  nameFieldLabel: string;
  variantPlaceholder: string;
  numberPlaceholder: string;
  setPlaceholder: string;
}> = {
  pokemon: {
    label: "Pokémon",
    shortLabel: "Pokémon",
    tagline: "Pokémon collection + PSA workflow",
    searchPlaceholder: "Search Pokémon, set, number, variant…",
    nameFieldLabel: "Pokémon / card name",
    variantPlaceholder: "Holo, D.V. Stamp…",
    numberPlaceholder: "11/20",
    setPlaceholder: "Plasma Blast",
  },
  sports: {
    label: "Sports",
    shortLabel: "Sports",
    tagline: "Sports cards + PSA workflow",
    searchPlaceholder: "Search players, set, number, parallel…",
    nameFieldLabel: "Player / card name",
    variantPlaceholder: "Refractor, Rookie, /99…",
    numberPlaceholder: "150",
    setPlaceholder: "Topps Chrome",
  },
};

export function isDomain(value: string | undefined | null): value is Domain {
  return value === "pokemon" || value === "sports";
}

/** First path segment when it names a section; falls back to pokemon. */
export function domainFromPath(pathname: string | null | undefined): Domain {
  const first = (pathname || "").split("/").filter(Boolean)[0];
  return isDomain(first) ? first : "pokemon";
}
