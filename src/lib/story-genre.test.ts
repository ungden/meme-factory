import { describe, expect, it } from "vitest";
import {
  markedStoryIntent,
  storyGenreFromIntent,
  stripStoryGenreMarker,
} from "./story-genre";

describe("story genre selection", () => {
  it("does not turn ordinary comedy into emotion because of a substring", () => {
    expect(storyGenreFromIntent("Hài về hai đồng nghiệp thương lượng đổi ca.")).toBe("comedy");
    expect(storyGenreFromIntent("Hai bé giấu bánh rồi đối đáp tự nhiên.")).toBe("comedy");
  });

  it("recognizes an explicit emotional brief", () => {
    expect(storyGenreFromIntent("Bố nhớ ông nội và hồi tưởng một buổi chiều ở biển.")).toBe("emotion");
  });

  it("round-trips an explicit UI choice without exposing its marker", () => {
    const intent = markedStoryIntent("Một chuyện nhỏ trong bếp", "emotion");
    expect(storyGenreFromIntent(intent, ["comedy"])).toBe("emotion");
    expect(stripStoryGenreMarker(intent)).toBe("Một chuyện nhỏ trong bếp");
  });
});
