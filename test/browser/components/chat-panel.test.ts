import { describe, expect, it } from "vitest";
import { ChatPanel } from "../../../src/browser/components/chat-panel.js";

if (!customElements.get("ui-chat-panel")) {
  customElements.define("ui-chat-panel", ChatPanel);
}

function mountPanel(): ChatPanel {
  const panel = document.createElement("ui-chat-panel") as ChatPanel;
  document.body.appendChild(panel);
  return panel;
}

describe("ChatPanel activity indicator", () => {
  it("is hidden by default", () => {
    const panel = mountPanel();
    const activity = panel.querySelector("#chat-activity") as HTMLDivElement;
    expect(activity.hidden).toBe(true);
  });

  it("shows the sending label", () => {
    const panel = mountPanel();
    panel.setActivity({ kind: "sending" });
    const activity = panel.querySelector("#chat-activity") as HTMLDivElement;
    const label = activity.querySelector(".chat-activity-label") as HTMLSpanElement;
    expect(activity.hidden).toBe(false);
    expect(activity.dataset.kind).toBe("sending");
    expect(label.textContent).toBe("Sending request");
  });

  it("shows the thinking label", () => {
    const panel = mountPanel();
    panel.setActivity({ kind: "thinking" });
    const label = panel.querySelector(".chat-activity-label") as HTMLSpanElement;
    expect(label.textContent).toBe("Thinking");
  });

  it("appends a tool name to the tool label", () => {
    const panel = mountPanel();
    panel.setActivity({ kind: "tool", label: "read_document_outline" });
    const activity = panel.querySelector("#chat-activity") as HTMLDivElement;
    const label = activity.querySelector(".chat-activity-label") as HTMLSpanElement;
    expect(activity.dataset.kind).toBe("tool");
    expect(label.textContent).toBe("Calling tool: read_document_outline");
  });

  it("hides when set to null", () => {
    const panel = mountPanel();
    panel.setActivity({ kind: "thinking" });
    panel.setActivity(null);
    const activity = panel.querySelector("#chat-activity") as HTMLDivElement;
    const label = activity.querySelector(".chat-activity-label") as HTMLSpanElement;
    expect(activity.hidden).toBe(true);
    expect(label.textContent).toBe("");
  });
});
