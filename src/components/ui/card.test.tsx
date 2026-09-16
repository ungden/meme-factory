import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Card from "./card";

/**
 * A div with onClick is clickable by mouse and invisible to everything else:
 * no tab stop, no Enter/Space, and a screen reader never announces a control.
 * Every clickable tile in the gallery is one of these.
 */
describe("Card", () => {
  it("announces itself as a button and takes keyboard focus when clickable", () => {
    const html = renderToStaticMarkup(
      <Card onClick={() => {}} ariaLabel="Mở đầu ra">
        nội dung
      </Card>,
    );
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Mở đầu ra"');
  });

  it("stays a plain container when it is not clickable", () => {
    // Otherwise every static card becomes a pointless tab stop.
    const html = renderToStaticMarkup(<Card>nội dung</Card>);
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("tabindex");
  });

  it("shows a visible focus ring only when interactive", () => {
    const interactive = renderToStaticMarkup(
      <Card onClick={() => {}}>nội dung</Card>,
    );
    const plain = renderToStaticMarkup(<Card>nội dung</Card>);
    expect(interactive).toContain("focus-visible:outline-2");
    expect(plain).not.toContain("focus-visible:outline-2");
  });
});
