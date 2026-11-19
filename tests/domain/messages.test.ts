import { describe, expect, it } from "vitest";
import {
  MESSAGE_MAX_LENGTH,
  SendMessageInput,
  cleanMessageBody,
  messagePreview,
} from "@/domain/messages";

const key = "0f8fad5b-d9cb-469f-a165-70867728950e";
const firstIssue = (input: unknown) => {
  const parsed = SendMessageInput.safeParse(input);
  return parsed.success ? null : parsed.error.issues[0]?.message;
};

describe("SendMessageInput", () => {
  it("accepts a message and trims it", () => {
    expect(SendMessageInput.parse({ body: "  Hello team\n", clientKey: key })).toEqual({
      body: "Hello team",
      clientKey: key,
    });
  });

  it("refuses an empty message, including one made of spaces and control characters", () => {
    expect(firstIssue({ body: "", clientKey: key })).toBe("errors.messageEmpty");
    expect(firstIssue({ body: " \n\t\u0000 ", clientKey: key })).toBe("errors.messageEmpty");
    expect(firstIssue({ clientKey: key })).toBe("errors.messageEmpty");
    expect(firstIssue({ body: 42, clientKey: key })).toBe("errors.messageEmpty");
  });

  it("refuses a message over the limit and accepts one at the limit", () => {
    expect(firstIssue({ body: "a".repeat(MESSAGE_MAX_LENGTH + 1), clientKey: key })).toBe(
      "errors.messageTooLong"
    );
    expect(firstIssue({ body: "a".repeat(MESSAGE_MAX_LENGTH), clientKey: key })).toBeNull();
  });

  it("needs a client key that looks like a generated id", () => {
    expect(firstIssue({ body: "Hi", clientKey: "short" })).toBe("errors.invalidInput");
    expect(firstIssue({ body: "Hi", clientKey: "has spaces in it!" })).toBe("errors.invalidInput");
    expect(firstIssue({ body: "Hi" })).not.toBeNull();
  });
});

describe("cleanMessageBody", () => {
  it("keeps line breaks and tabs and drops other control characters", () => {
    expect(cleanMessageBody("line one\nline\ttwo\u0000\u0007")).toBe("line one\nline\ttwo");
  });

  it("leaves text in any script alone", () => {
    expect(cleanMessageBody("¿Qué tal? 你好 🎬")).toBe("¿Qué tal? 你好 🎬");
  });
});

describe("messagePreview", () => {
  it("is one line, cut with an ellipsis when long", () => {
    expect(messagePreview("Hello\n\nteam")).toBe("Hello team");
    const cut = messagePreview("word ".repeat(100), 40);
    expect(cut.length).toBeLessThanOrEqual(40);
    expect(cut.endsWith("…")).toBe(true);
  });
});
