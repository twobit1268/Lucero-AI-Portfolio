import type { Page } from "playwright";

/** Shared by the authoring agent and the self-healing locator so both reason
 * about the same simplified view of the page (role/id/label/text only —
 * not raw HTML) rather than duplicating extraction logic. */
export async function snapshotAccessibleElements(page: Page): Promise<string> {
  const snapshot = await page.evaluate(() => {
    const interesting = Array.from(
      document.querySelectorAll("button, input, a, [role], label, h1, h2")
    );
    return interesting.map((el) => {
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute("role") ?? "";
      const text = (el.textContent ?? "").trim().slice(0, 60);
      const forAttr = el.getAttribute("for") ?? "";
      const type = el.getAttribute("type") ?? "";
      return `<${tag}${el.id ? ` id="${el.id}"` : ""}${type ? ` type="${type}"` : ""}${
        role ? ` role="${role}"` : ""
      }${forAttr ? ` for="${forAttr}"` : ""}>${text}</${tag}>`;
    });
  });
  return snapshot.join("\n");
}
