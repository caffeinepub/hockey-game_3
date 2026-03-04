import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ScoreEntry } from "../backend.d";
import { useActor } from "./useActor";

export function useTopScores() {
  const { actor, isFetching } = useActor();
  return useQuery<ScoreEntry[]>({
    queryKey: ["topScores"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getTopScores();
    },
    enabled: !!actor && !isFetching,
    staleTime: 30_000,
  });
}

export function useAddScore() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      playerName,
      score,
    }: {
      playerName: string;
      score: bigint;
    }) => {
      if (!actor) throw new Error("No actor");
      await actor.addScore(playerName, score);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["topScores"] });
    },
  });
}
