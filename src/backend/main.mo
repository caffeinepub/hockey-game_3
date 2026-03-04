import Array "mo:core/Array";
import Order "mo:core/Order";
import List "mo:core/List";

actor {
  type ScoreEntry = {
    playerName : Text;
    score : Nat;
  };

  module ScoreEntry {
    public func compare(a : ScoreEntry, b : ScoreEntry) : Order.Order {
      Nat.compare(b.score, a.score);
    };
  };

  let leaderboard = List.empty<ScoreEntry>();

  public shared ({ caller }) func addScore(playerName : Text, score : Nat) : async () {
    let newScore : ScoreEntry = {
      playerName;
      score;
    };
    leaderboard.add(newScore);
  };

  public query ({ caller }) func getTopScores() : async [ScoreEntry] {
    let sorted = leaderboard.toArray().sort();
    let len = sorted.size();
    if (len <= 10) { sorted } else {
      Array.tabulate<ScoreEntry>(10, func(i) { sorted[i] });
    };
  };
};
