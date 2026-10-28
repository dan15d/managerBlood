export interface Script {
  id: string;
  name: string;
  author: string;
  /** Ids de personajes. Las Fábulas y Viajeros también pueden estar en el guion. */
  characterIds: string[];
  official: boolean;
  description?: string;
  /** Jugadores mínimos recomendados (BMR y S&V se recomiendan con 7 o más). */
  recommendedMinPlayers?: number;
}
